const express = require('express');
const { getDatabase } = require('../database/init');
const { dbRun, dbGet, dbAll } = require('../agents/dbUtils');
const { getConversationSession, saveConversationSession, buildSessionContext } = require('../services/conversationSession');
const { authenticateToken } = require('../middleware/auth');
const { orchestrateAgents, buildExecutionPlan, parseUserIntent, parseUserIntentLLM, extractEntitiesWithLLM } = require('../agents/orchestrator');
const { getProjectFaqResponse, getDynamicRouteResponse } = require('../services/projectFaq');
const { answerProjectQuestion, shouldUseDocsQa } = require('../services/projectDocsQa');
const { getLocalDateString } = require('../utils/dateUtils');

const router = express.Router();
const { validateBookingSuggestion } = require('../services/llmVerifier');

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Extract structured entities (cities, dates, quantities, preferences) from a natural language message.
 * ENHANCED for booking support with auto-selection.
 */
function extractEntitiesFromMessage(message) {
  let msg = message.toLowerCase().trim();
  // Strip ordinal suffixes like st, nd, rd, th from numbers to facilitate matching (e.g. 20th june -> 20 june)
  msg = msg.replace(/\b(\d{1,2})(?:st|nd|rd|th)\b/gi, '$1');
  const result = {};

  const cityAliases = {
    hyderbad: 'hyderabad',
    vijayawadda: 'vijayawada',
    vijaywada: 'vijayawada',
    bengaluru: 'bangalore',
    tirupathi: 'tirupati',
    vizag: 'visakhapatnam',
    ananthapuram: 'anantapur',
    ananthapur: 'anantapur',
    anantapuram: 'anantapur',
    cuddapah: 'kadapa'
  };

  const normalizeCity = (city) => {
    const normalized = city.toLowerCase().trim();
    return cityAliases[normalized] || normalized;
  };

  // Known cities in the system
  const cities = ['hyderabad', 'vijayawada', 'vijayawadda', 'vijaywada', 'bangalore', 'bengaluru', 'chennai', 'mumbai', 'pune', 'delhi', 'jaipur', 'tirupati', 'tirupathi', 'visakhapatnam', 'vizag', 'kadapa', 'anantapur', 'ananthapuram', 'ananthapur', 'anantapuram', 'cuddapah'];
  
  // Find all city matches with their character position in user's message
  const cityMatches = [];
  for (const c of cities) {
    let pos = msg.indexOf(c);
    while (pos !== -1) {
      cityMatches.push({ city: normalizeCity(c), index: pos });
      pos = msg.indexOf(c, pos + 1);
    }
  }
  // Sort by appearance index in the user's message!
  cityMatches.sort((a, b) => a.index - b.index);

  // Deduplicate matches at close positions
  const uniqueMatches = [];
  const seenIndices = new Set();
  for (const match of cityMatches) {
    if (!seenIndices.has(match.index)) {
      seenIndices.add(match.index);
      uniqueMatches.push(match);
    }
  }

  // Patterns for explicit route direction
  const fromToMatch = msg.match(/from\s+([a-z]+)\s+to\s+([a-z]+)/i);
  const toMatch = msg.match(/([a-z]+)\s+to\s+([a-z]+)/i);

  if (fromToMatch) {
    result.fromCity = capitalize(normalizeCity(fromToMatch[1]));
    result.toCity = capitalize(normalizeCity(fromToMatch[2]));
  } else if (toMatch && cities.includes(normalizeCity(toMatch[1])) && cities.includes(normalizeCity(toMatch[2]))) {
    result.fromCity = capitalize(normalizeCity(toMatch[1]));
    result.toCity = capitalize(normalizeCity(toMatch[2]));
  } else if (uniqueMatches.length >= 2) {
    result.fromCity = capitalize(uniqueMatches[0].city);
    result.toCity = capitalize(uniqueMatches[1].city);
  } else if (uniqueMatches.length === 1) {
    const singleCity = uniqueMatches[0].city;
    if (msg.includes('to ' + singleCity) || msg.includes('towards ' + singleCity)) {
      result.toCity = capitalize(singleCity);
    } else {
      result.fromCity = capitalize(singleCity);
    }
  }

  // Date extraction: "on 2026-02-15", "on feb 15", "tomorrow", "today", "15th feb"
  const isoDateMatch = msg.match(/(\d{4}-\d{2}-\d{2})/);
  const { getLocalDateString, getOffsetLocalDateString } = require('../utils/dateUtils');
  if (isoDateMatch) {
    result.travelDate = isoDateMatch[1];
  } else if (/\b(day\s*after\s*tomorrow|dat)\b/.test(msg)) {
    result.travelDate = getOffsetLocalDateString(2);
  } else if (/\b(tom?or?ro?w|tmr|tmrw|tmro|tom|2morrow|2mrw|nxt\s*day|next\s*day)\b/i.test(msg)) {
    result.travelDate = getOffsetLocalDateString(1);
  } else if (msg.includes('today')) {
    result.travelDate = getLocalDateString();
  } else {
    // Try "feb 15", "15 feb", "february 15", etc.
    const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
    const monthPattern = msg.match(/(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*/i) ||
                          msg.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*(\d{1,2})/i);
    if (monthPattern) {
      let day, mon;
      if (/^\d/.test(monthPattern[1])) { day = monthPattern[1]; mon = monthPattern[2].substring(0, 3).toLowerCase(); }
      else { mon = monthPattern[1].substring(0, 3).toLowerCase(); day = monthPattern[2]; }
      const year = new Date().getFullYear();
      result.travelDate = `${year}-${months[mon]}-${String(day).padStart(2, '0')}`;
    }
  }

  // Passenger count: "2 passengers", "for 3 people", "3 seats", "book 2 tickets"
  const passengerMatch = msg.match(/(\d+)\s*(passenger|people|person|seat|ticket)/i) ||
                          msg.match(/book\s+(\d+)/i);
  if (passengerMatch) {
    result.passengerCount = parseInt(passengerMatch[1], 10);
  }

  // Budget extraction: "under 600", "below 750", "less than 900", "max 1000"
  const budgetMatch =
    msg.match(/(?:under|below|less\s+than|within|max(?:imum)?\s*(?:price|fare|cost)?|upto|up\s*to)\s*(?:rs\.?|inr|₹)?\s*(\d{2,6})/i) ||
    msg.match(/(?:price|fare|cost)\s*(?:under|below|less\s+than|max(?:imum)?|upto|up\s*to)?\s*(?:rs\.?|inr|₹)?\s*(\d{2,6})/i);
  const moneyMatch = msg.match(/(?:i\s+have|have\s+(?:a\s+)?(?:budget|money)|budget\s*(?:is|of)?|money\s*(?:is|of)?)\s*(?:rs\.?|inr|₹)?\s*(\d{2,6})/i);
  const matchedBudget = budgetMatch || moneyMatch;
  if (matchedBudget) {
    const maxPrice = parseInt(matchedBudget[1], 10);
    if (!Number.isNaN(maxPrice) && maxPrice > 0) {
      result.maxPrice = maxPrice;
      result.budgetCap = maxPrice;
    }
  }

  // Min price extraction: "above 600", "more than 500", "greater than 900"
  const minBudgetMatch = 
    msg.match(/(?:above|over|more\s+than|greater\s+than|at\s*least|min(?:imum)?\s*(?:price|fare|cost)?)\s*(?:rs\.?|inr|₹)?\s*(\d{2,6})/i) ||
    msg.match(/(?:price|fare|cost)\s*(?:above|over|more\s+than|greater\s+than|at\s*least|min(?:imum)?)\s*(?:rs\.?|inr|₹)?\s*(\d{2,6})/i);
  
  if (minBudgetMatch) {
    const minPrice = parseInt(minBudgetMatch[1] || minBudgetMatch[2], 10);
    if (!Number.isNaN(minPrice) && minPrice > 0) {
      result.minPrice = minPrice;
    }
  }

  // Specific seat numbers: "seat 1, 2", "seats 5A and 6A", "seat number 10", "S3 seat", "book S3"
  // FIXED: Handles S-prefixed seat codes (S1, S3, S4) used by the booking system
  // Priority 1: Check for explicit S-prefixed seat codes (e.g., "S3", "S4", "S3,S4")
  const sPrefixMatch = msg.match(/\bs(\d{1,2})\b/gi);
  if (sPrefixMatch && sPrefixMatch.length > 0) {
    const validSSeats = sPrefixMatch
      .map(s => s.toUpperCase()) // e.g., "s3" -> "S3"
      .filter(s => {
        const num = parseInt(s.substring(1));
        return num >= 1 && num <= 99;
      });
    if (validSSeats.length > 0) {
      result.seatNumbers = validSSeats;
      result.explicitSeatRequested = true; // Flag: user asked for specific seat(s)
    }
  }

  // Priority 2: If no S-prefixed seats found, try other patterns
  if (!result.seatNumbers) {
    const seatPatterns = [
      /seat\s*(?:number|no|#)[:\s]*([0-9a-z][0-9a-z,\s]*)/i,  // "seat number 5" or "seat no 5"
      /seats[:\s]+([0-9][0-9a-z,\s]*)/i,                       // "seats 1, 2, 3" or "seats: 5A, 6A"
      /seat[:\s]+([0-9][0-9a-z,\s]*)/i,                        // "seat 5" or "seat: 10A" (must start with digit)
      /book\s+seat[s]?\s+([0-9][0-9a-z,\s]*)/i                 // "book seat 5" or "book seats 1,2"
    ];
    
    for (const pattern of seatPatterns) {
      const seatMatch = msg.match(pattern);
      if (seatMatch) {
        // Extract individual seat numbers/codes
        const seats = seatMatch[1].match(/\d+[a-z]?/gi);
        if (seats && seats.length > 0) {
          // Validate seat numbers are reasonable (1-99)
          const validSeats = seats.filter(s => {
            const num = parseInt(s);
            return num >= 1 && num <= 99;
          });
          if (validSeats.length > 0) {
            // Normalize to S-prefixed format (system uses S1, S2, S3...)
            result.seatNumbers = validSeats.map(s => {
              // If already has S prefix, keep it; otherwise add S prefix
              return /^s/i.test(s) ? s.toUpperCase() : `S${parseInt(s)}`;
            });
            result.explicitSeatRequested = true;
            break;
          }
        }
      }
    }
  }

  // Bus type preferences (including common typos like "volva")
  const preferences = {};
  if (/volv[oa]|ac\b|air.?condition/i.test(msg)) {
    preferences.busType = 'Volvo';
    preferences.hasAC = true;
  } else if (/semi.?sleeper/i.test(msg)) {
    preferences.busType = 'Semi-Sleeper';
  } else if (/sleeper/i.test(msg)) {
    preferences.busType = 'Sleeper';
  } else if (/ordinary|non.?ac/i.test(msg)) {
    preferences.hasAC = false;
    if (/ordinary/i.test(msg)) {
      preferences.busType = 'Ordinary';
    }
  }

  // Sleeper vs Seater distinction preference
  if (/\b(seater|seating)\b/i.test(msg)) {
    preferences.isSleeper = false;
  } else if (/\b(sleeper|berth)\b/i.test(msg)) {
    preferences.isSleeper = true;
  }

  // Seat preferences — type (window/aisle)
  if (/window|side\s*seat/i.test(msg)) {
    preferences.window = true;
  }
  if (/aisle/i.test(msg)) {
    preferences.aisle = true;
  }
  if (/lower\s*(deck|berth)?/i.test(msg)) {
    preferences.lowerDeck = true;
  }
  if (/upper\s*(deck|berth)?/i.test(msg)) {
    preferences.lowerDeck = false;
  }

  // Seat position preferences — zone (front/middle/back)
  if (/\b(front|front\s*side|front\s*seat|first\s*row|near\s*driver)\b/i.test(msg)) {
    preferences.position = 'front';
  } else if (/\b(back|back\s*side|back\s*seat|rear|last\s*row)\b/i.test(msg)) {
    preferences.position = 'back';
  } else if (/\b(middle|center|centre|mid\s*row)\b/i.test(msg)) {
    preferences.position = 'middle';
  }

  // Time of day preferences
  if (/\b(early\s*)?morning\b/i.test(msg)) {
    preferences.timeOfDay = 'morning';  // 05:00 - 12:00
  } else if (/\bafternoon\b/i.test(msg)) {
    preferences.timeOfDay = 'afternoon';  // 12:00 - 17:00
  } else if (/\bevening\b/i.test(msg)) {
    preferences.timeOfDay = 'evening';  // 17:00 - 21:00
  } else if (/\b(late\s*)?night\b/i.test(msg)) {
    preferences.timeOfDay = 'night';  // 21:00 - 05:00
  }

  // Minimum fare / budget preference detection
  if (/\b(min|minimum|cheapest|lowest|low\s*cost|budget|lowest\s*fare|lowest\s*price|min\s*fare|min\s*price)\b/i.test(msg)) {
    preferences.minFare = true;
    preferences.lowestPrice = true;
    preferences.cheapest = true;
  }

  if (Object.keys(preferences).length > 0) {
    result.preferences = preferences;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PASSENGER DETAILS EXTRACTION - Enhanced for MULTIPLE passengers
  // ════════════════════════════════════════════════════════════════════════════
  
  // Extract age first (before name, to avoid including "age" in name)
  const ageMatch = msg.match(/age\s*[:\s]?\s*(\d{1,3})/i);
  if (ageMatch) {
    if (!result.passengerDetails) result.passengerDetails = {};
    result.passengerDetails.age = parseInt(ageMatch[1], 10);
  }
  
  // Extract gender: "gender male", "gender female", "male", "female" at end
  const genderMatch = msg.match(/gender\s*[:\s]?\s*["']?(male|female|m|f)["']?/i) ||
                      msg.match(/,\s*(male|female)\s*(?:,|$)/i);
  if (genderMatch) {
    if (!result.passengerDetails) result.passengerDetails = {};
    const g = genderMatch[1].toLowerCase();
    result.passengerDetails.gender = (g === 'male' || g === 'm') ? 'M' : 'F';
  }
  
  // ══════════════════════════════════════════════════════════════════════════
  // MULTIPLE PASSENGER NAMES EXTRACTION
  // Patterns:
  // 1. "with names Alice and Bob" or "names Alice, Bob"
  // 2. "with names Alice,Bob" (comma-separated)
  // 3. "passengers Alice and Bob"
  // ══════════════════════════════════════════════════════════════════════════
  
  // Try to extract multiple names first - FIXED to match "with names Alice and Bob"
  const multipleNamePatterns = [
    // Pattern 1: "with names Alice and Bob" - capture until end of string or punctuation
    /(?:with\s+)?names?\s+(?:is\s+|are\s+)?["']?([a-z][a-z,\s&]+?)["']?\s*$/i,
    // Pattern 2: "names Alice and Bob" with lookahead
    /(?:with\s+)?names?\s+(?:is\s+|are\s+)?["']?([a-z][a-z,\s&]+?)["']?\s*(?:age|gender|\.|\,\s*age|\,\s*gender)/i,
    // Pattern 3: "passengers Alice and Bob"
    /passengers?\s+["']?([a-z][a-z,\s&]+?)["']?\s*$/i,
    // Pattern 4: "for Alice and Bob" at end
    /for\s+["']?([a-z][a-z,\s&]+?)["']?\s*$/i
  ];
  
  let passengerNames = [];
  let nameExtracted = false;
  
  for (const pattern of multipleNamePatterns) {
    const multiMatch = msg.match(pattern);
    if (multiMatch && multiMatch[1].length > 1) {
      const nameString = multiMatch[1].trim();
      
      // DEBUG LOG
      console.log('[EntityExtraction] Matched name pattern:', pattern, '→ captured:', nameString);
      
      // Split by comma, "and", or "&"
      const rawNames = nameString.split(/[,&]|\s+and\s+/i)
        .map(n => n.trim())
        .filter(n => n.length > 0);
      
      console.log('[EntityExtraction] Raw names after split:', rawNames);
      
      // Validate names
      const invalidNames = [...cities, 'today', 'tomorrow', 'evening', 'morning', 'afternoon', 'night', 'male', 'female', 'seat', 'bus', 'age', 'gender', 'from', 'to'];
      const validNames = rawNames.filter(n => {
        const lower = n.toLowerCase();
        return !invalidNames.includes(lower) && 
               n.length >= 2 && 
               n.length < 30 &&
               /^[a-z][a-z0-9\s]*$/i.test(n);
      });
      
      console.log('[EntityExtraction] Valid names after filtering:', validNames);
      
      if (validNames.length > 0) {
        passengerNames = validNames.map(n => n.split(' ').map(capitalize).join(' '));
        nameExtracted = true;
        break;
      }
    }
  }
  
  // If multiple names not found, try single name extraction
  if (!nameExtracted) {
    const namePatterns = [
      /(?:with\s+)?name\s+(?:is\s+)?["']?([a-z0-9\s]{1,30}?)["']?\s*(?:,|with|age|gender|and\s+(?:age|gender)|from|to|\bon\b|\bfor\b|\btoday\b|\btomorrow\b|$)/i,
      /passenger\s+["']?([a-z0-9\s]{1,30}?)["']?\s*(?:,|with|age|gender|from|to|\bon\b|\bfor\b|\btoday\b|\btomorrow\b|$)/i,
      /for\s+["']?([a-z0-9\s]{1,30}?)["']?\s*(?:,|with|age|gender|from|to|\bon\b|\bfor\b|\btoday\b|\btomorrow\b|$)/i
    ];
    
    for (const pattern of namePatterns) {
      const nameMatch = msg.match(pattern);
      if (nameMatch && nameMatch[1].length > 1) {
        let extractedName = nameMatch[1].trim();
        // Remove lingering prepositions/date words that might be caught inside match group 1
        extractedName = extractedName.replace(/\b(on|for)?\s*(today|tomorrow|yesterday|morning|afternoon|evening|night)\b/gi, '').trim();
        
        // Validate: not a city, not a common word, not gender/age related
        const invalidNames = [...cities, 'today', 'tomorrow', 'evening', 'morning', 'afternoon', 'night', 'male', 'female', 'seat', 'bus'];
        if (extractedName.length >= 2 && !invalidNames.includes(extractedName.toLowerCase()) && extractedName.length < 30) {
          passengerNames = [extractedName.split(' ').map(capitalize).join(' ')];
          nameExtracted = true;
          break;
        }
      }
    }
  }
  
  // Store passenger names (single or multiple)
  if (passengerNames.length > 0) {
    if (!result.passengerDetails) result.passengerDetails = {};
    
    // Clean each extracted name to remove lingering date/time/travel keywords (e.g. "On Tomorrow", "Tomorrow", "Today")
    const cleanName = (n) => {
      return n.replace(/\b(on|for)?\s*(today|tomorrow|yesterday|morning|afternoon|evening|night)\b/gi, '')
               .replace(/\s+/g, ' ')
               .trim();
    };

    const cleanedPassengerNames = passengerNames.map(cleanName).filter(n => n.length > 0);

    if (cleanedPassengerNames.length > 0) {
      if (cleanedPassengerNames.length === 1) {
        result.passengerDetails.name = cleanedPassengerNames[0];
      } else {
        result.passengerDetails.names = cleanedPassengerNames;  // Array for multiple passengers
        result.passengerDetails.name = cleanedPassengerNames[0];  // First name as primary
        result.multiplePassengers = true;
      }
    }
    console.log('[EntityExtraction] Final passenger details:', result.passengerDetails);
  }

  // Booking ID for cancellations: "booking 5", "booking #12", "cancel 7"
  const bookingMatch = msg.match(/booking\s*#?\s*(\d+)/i) || msg.match(/cancel\s+#?\s*(\d+)/i);
  if (bookingMatch) {
    result.bookingId = parseInt(bookingMatch[1], 10);
  }
  
  // PNR extraction - support various formats:
  // "PNR: PNR1771064512269TUBR2", "pnr PNR123...", "PNR1234567890ABCDE", "with PNR12345..."
  // PNR format in DB: PNR + timestamp + random chars (e.g., PNR1771064512269TUBR2)
  const pnrPatterns = [
    /(pnr[0-9]{10,}[a-z0-9]*)/i,                // "PNR1771064512269TUBR2" - capture whole PNR including prefix
    /pnr[:\s]+(pnr[a-z0-9]{10,25})/i,           // "PNR: PNR123..." - nested PNR
    /pnr[:\s]+([a-z0-9]{15,25})/i,              // "PNR: 1771064512269TUBR2" - add PNR prefix if missing
  ];
  
  for (const pattern of pnrPatterns) {
    const pnrMatch = msg.match(pattern);
    if (pnrMatch && pnrMatch[1].length >= 10) {
      let pnr = pnrMatch[1].toUpperCase();
      // Ensure PNR starts with "PNR" prefix (as stored in DB)
      if (!pnr.startsWith('PNR')) {
        pnr = 'PNR' + pnr;
      }
      result.pnr = pnr;
      break;
    }
  }

  // Schedule ID if explicitly mentioned: "schedule 45", "bus #12"
  const scheduleMatch = msg.match(/schedule\s*#?\s*(\d+)/i) || msg.match(/bus\s*#\s*(\d+)/i);
  if (scheduleMatch) {
    result.scheduleId = parseInt(scheduleMatch[1], 10);
  }

  // Smart date defaulting: Use today if there are future buses, otherwise tomorrow
  if (!result.travelDate && result.fromCity && result.toCity) {
    const now = new Date();
    const currentHour = now.getHours();
    
    if (currentHour >= 22) {
      // Past 22:00 — no more buses today, default to tomorrow
      result.travelDate = getOffsetLocalDateString(1);
      console.log('[EntityExtraction] ⏰ Past 22:00 - defaulting to tomorrow:', result.travelDate);
    } else {
      // Use today — the booking node will further filter out already-departed buses.
      // If no future buses remain for today, the booking node will suggest tomorrow.
      result.travelDate = getLocalDateString();
      console.log('[EntityExtraction] ✅ Using today (booking node will filter departed buses):', result.travelDate);
    }
  }

  console.log('[EntityExtraction] Final result:', JSON.stringify(result, null, 2));
  return result;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

async function getRecentBookingsForUser(userId, limit = 5) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.all(
      `
      SELECT b.*, s.departure_time, s.arrival_time, s.travel_date,
             bus.bus_name, bus.bus_number, bus.bus_type,
             r.from_city, r.to_city
      FROM bookings b
      JOIN schedules s ON b.schedule_id = s.id
      JOIN buses bus ON s.bus_id = bus.id
      JOIN routes r ON s.route_id = r.id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
      LIMIT ?
      `,
      [userId, limit],
      (err, bookings) => {
        if (err) return reject(err);
        resolve(bookings || []);
      }
    );
  });
}

function formatRecentBookings(bookings) {
  if (!bookings || bookings.length === 0) {
    return 'You do not have any bookings yet. Try asking me to search buses or book a seat.';
  }

  const lines = bookings.map((booking, index) => {
    const route = `${booking.from_city} → ${booking.to_city}`;
    const date = booking.travel_date || 'N/A';
    const seats = booking.seat_numbers || 'N/A';
    const status = booking.booking_status || 'unknown';
    const pnr = booking.pnr || 'N/A';
    return `${index + 1}. ${route} | ${date} | Seats: ${seats} | Status: ${status} | PNR: ${pnr}`;
  });

  return `Here are your recent bookings:\n\n${lines.join('\n')}`;
}

async function persistConversationState({ userId, message, intent, extracted, userContext, responsePayload, session }) {
  try {
    await saveConversationSession({
      userId,
      intent,
      extracted,
      userContext,
      responsePayload,
      session,
      message
    });
  } catch (error) {
    console.error('[ConversationSession] Failed to persist session:', error.message);
  }
}

/**
 * POST /api/agents/task
 * Create and process a new agent task using ReAct multi-agent orchestration.
 * The task runs through the full ReAct pipeline: Thought -> Action -> Observation
 * for each agent in the execution plan.
 */
router.post('/task', authenticateToken, async (req, res) => {
  try {
    const { taskType, inputData } = req.body;
    const userId = req.user.id;

    if (!taskType || !inputData) {
      return res.status(400).json({ error: 'Task type and input data are required' });
    }

    // Inject userId into inputData if not present
    if (!inputData.userId) {
      inputData.userId = userId;
    }

    const insertResult = await dbRun(
      'INSERT INTO agent_tasks (user_id, task_type, input_data, status) VALUES (?, ?, ?, ?)',
      [userId, taskType, JSON.stringify(inputData), 'processing']
    );
    const taskId = insertResult.lastID;

    // Process task with ReAct multi-agent orchestration (async background)
    orchestrateAgents(taskId, taskType, inputData)
      .then(taskResult => {
        return dbRun(
          'UPDATE agent_tasks SET status = ?, result = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [taskResult.halted ? 'halted' : 'completed', JSON.stringify(taskResult), taskId]
        );
      })
      .catch(error => {
        return dbRun(
          'UPDATE agent_tasks SET status = ?, result = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          ['failed', JSON.stringify({ error: error.message }), taskId]
        );
      });

    res.status(201).json({
      message: 'Task created and processing with ReAct multi-agent orchestration',
      taskId,
      status: 'processing',
      executionPlan: buildExecutionPlan(taskType)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create task' });
  }
});

/**
 * POST /api/agents/task/sync
 * Synchronous version - waits for full ReAct pipeline to complete before responding.
 * Returns the full result including all agent outputs and ReAct traces.
 */
router.post('/task/sync', authenticateToken, async (req, res) => {
  try {
    const { taskType, inputData } = req.body;
    const userId = req.user.id;

    if (!taskType || !inputData) {
      return res.status(400).json({ error: 'Task type and input data are required' });
    }

    if (!inputData.userId) {
      inputData.userId = userId;
    }

    const insertResult = await dbRun(
      'INSERT INTO agent_tasks (user_id, task_type, input_data, status) VALUES (?, ?, ?, ?)',
      [userId, taskType, JSON.stringify(inputData), 'processing']
    );
    const taskId = insertResult.lastID;

    // Run orchestration synchronously
    const taskResult = await orchestrateAgents(taskId, taskType, inputData);

    // Update task status
    await dbRun(
      'UPDATE agent_tasks SET status = ?, result = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [taskResult.halted ? 'halted' : 'completed', JSON.stringify(taskResult), taskId]
    );

    // Get ReAct traces for this task (small delay to allow fire-and-forget inserts to complete)
    await new Promise(resolve => setTimeout(resolve, 100));
    const traces = await dbAll(
      'SELECT * FROM react_traces WHERE task_id = ? ORDER BY step_number, timestamp',
      [taskId]
    );

    res.json({
      taskId,
      status: taskResult.halted ? 'halted' : 'completed',
      result: taskResult,
      reactTraces: traces,
      summary: {
        agentsInvolved: taskResult.agentsInvolved,
        totalReactSteps: taskResult.reactSummary.totalSteps,
        totalDuration_ms: taskResult.reactSummary.totalDuration_ms,
        response: taskResult.response
      }
    });
  } catch (error) {
    console.error('Sync task error:', error);
    res.status(500).json({ error: 'Task execution failed: ' + error.message });
  }
});

/**
 * GET /api/agents/task/:id
 * Get task status, result, agent decisions, and ReAct traces
 */
router.get('/task/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const task = await dbGet('SELECT * FROM agent_tasks WHERE id = ? AND user_id = ?', [id, userId]);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Get agent decisions
    const decisions = await dbAll('SELECT * FROM agent_decisions WHERE task_id = ? ORDER BY timestamp', [id]);

    // Get ReAct traces
    const traces = await dbAll(
      'SELECT * FROM react_traces WHERE task_id = ? ORDER BY step_number, timestamp',
      [id]
    );

    // Get execution summary
    const summary = await dbGet('SELECT * FROM agent_execution_summary WHERE task_id = ?', [id]);

    res.json({
      task: {
        ...task,
        input_data: JSON.parse(task.input_data),
        result: task.result ? JSON.parse(task.result) : null
      },
      decisions: decisions.map(d => ({
        ...d,
        decision: d.decision ? JSON.parse(d.decision) : null
      })),
      reactTraces: traces.map(t => ({
        ...t,
        metadata: t.metadata ? JSON.parse(t.metadata) : null
      })),
      executionSummary: summary ? {
        ...summary,
        execution_plan: JSON.parse(summary.execution_plan),
        agents_invoked: JSON.parse(summary.agents_invoked),
        final_output: summary.final_output ? JSON.parse(summary.final_output) : null
      } : null
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve task' });
  }
});

/**
 * GET /api/agents/task/:id/traces
 * Get only the ReAct traces for a task (Thought/Action/Observation log)
 */
router.get('/task/:id/traces', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verify task belongs to user
    const task = await dbGet('SELECT id FROM agent_tasks WHERE id = ? AND user_id = ?', [id, userId]);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const traces = await dbAll(
      'SELECT * FROM react_traces WHERE task_id = ? ORDER BY step_number, timestamp',
      [id]
    );

    // Group traces by agent
    const grouped = {};
    traces.forEach(t => {
      if (!grouped[t.agent_name]) grouped[t.agent_name] = [];
      grouped[t.agent_name].push({
        step: t.step_number,
        type: t.step_type,
        content: t.content,
        metadata: t.metadata ? JSON.parse(t.metadata) : null,
        duration_ms: t.duration_ms,
        timestamp: t.timestamp
      });
    });

    res.json({
      taskId: parseInt(id),
      totalTraces: traces.length,
      agentTraces: grouped
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve traces' });
  }
});

/**
 * GET /api/agents/tasks
 * Get all tasks for the authenticated user
 */
router.get('/tasks', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const tasks = await dbAll('SELECT * FROM agent_tasks WHERE user_id = ? ORDER BY created_at DESC', [userId]);

    res.json({
      tasks: tasks.map(task => ({
        ...task,
        input_data: JSON.parse(task.input_data),
        result: task.result ? JSON.parse(task.result) : null
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve tasks' });
  }
});

/**
 * POST /api/agents/chat
 * Natural language interface - parses user message, determines intent, runs full pipeline
 */
router.post('/chat', authenticateToken, async (req, res) => {
  try {
    try {
      await llmService.ensureReady();
    } catch (llmError) {
      return res.status(503).json({
        error: `LLM is not ready: ${llmError.message}`,
        model: llmService.config.model,
        endpoint: `${llmService.config.baseUrl}/api/generate`,
        instructions: [
          'Ensure Ollama is installed and available in PATH.',
          'Start Ollama service (or open the Ollama app).',
          `Pull model if missing: ollama pull ${llmService.config.model}`,
          `Manual test: ollama run ${llmService.config.model}`
        ]
      });
    }

    const { message, context: requestContext } = req.body;
    const userId = req.user.id;
    const existingSession = await getConversationSession(userId);
    const conversationContext = {
      ...(existingSession ? buildSessionContext(existingSession) : {}),
      ...(requestContext || {})
    };

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Booking history shortcut: handle "show my recent bookings" before generic intent parsing.
    if (/\b(recent bookings|my bookings|booking history|show my bookings|show my recent bookings|view my bookings|latest bookings)\b/i.test(message)) {
      const bookings = await getRecentBookingsForUser(userId, 5);
      const responseText = formatRecentBookings(bookings);

      await persistConversationState({
        userId,
        message,
        intent: { taskType: 'general_query', confidence: 1.0, source: 'recent_bookings' },
        extracted: {},
        userContext: conversationContext,
        responsePayload: { response: responseText, structuredData: { recentBookings: true, count: bookings.length } },
        session: existingSession
      });

      const updatedSession = await getConversationSession(userId);
      return res.json({
        taskId: null,
        intent: { taskType: 'general_query', confidence: 1.0, source: 'recent_bookings' },
        response: responseText,
        structuredData: { recentBookings: true, count: bookings.length },
        agentsInvolved: ['BookingHistory'],
        reactSummary: { totalSteps: 1, totalDuration_ms: 0 },
        session: updatedSession
      });
    }

    // Parse natural language intent
    let intent = parseUserIntent(message);

    // Dynamic route helper: answers route-list/count questions before falling back to orchestration
    const dynamicRouteResponse = await getDynamicRouteResponse(message, conversationContext);
    if (dynamicRouteResponse) {
      const routeFaqResponse = typeof dynamicRouteResponse === 'string'
        ? { response: dynamicRouteResponse, structuredData: { routeFaq: true } }
        : dynamicRouteResponse;

      await persistConversationState({
        userId,
        message,
        intent: { taskType: 'search_buses', confidence: 1.0, source: 'dynamic_route_faq' },
        extracted: {},
        userContext: conversationContext,
        responsePayload: { response: routeFaqResponse.response, structuredData: routeFaqResponse.structuredData || { routeFaq: true } },
        session: existingSession
      });

      const updatedSession = await getConversationSession(userId);
      return res.json({
        taskId: null,
        intent: { taskType: 'search_buses', confidence: 1.0, source: 'dynamic_route_faq' },
        response: routeFaqResponse.response,
        structuredData: routeFaqResponse.structuredData || { routeFaq: true },
        agentsInvolved: ['RouteFaq'],
        reactSummary: { totalSteps: 1, totalDuration_ms: 0 },
        session: updatedSession
      });
    }

    // Fast FAQ response for project/basic questions so the agent can answer common questions directly
    if ((intent.taskType === 'general_query' || intent.confidence <= 0.8) && shouldUseDocsQa(message)) {
      const docsQa = await answerProjectQuestion(message);
      if (docsQa && docsQa.answer) {
        await persistConversationState({
          userId,
          message,
          intent: { taskType: 'general_query', confidence: 1.0, source: 'docs_qa' },
          extracted: {},
          userContext: conversationContext,
          responsePayload: { response: docsQa.answer, structuredData: { docsQa: true, sources: docsQa.sources } },
          session: existingSession
        });

        const updatedSession = await getConversationSession(userId);
        return res.json({
          taskId: null,
          intent: { taskType: 'general_query', confidence: 1.0, source: 'docs_qa' },
          response: docsQa.answer,
          structuredData: { docsQa: true, sources: docsQa.sources },
          agentsInvolved: ['DocsQa'],
          reactSummary: { totalSteps: 1, totalDuration_ms: 0 },
          session: updatedSession
        });
      }
    }

    const faqResponse = getProjectFaqResponse(message);
    if (faqResponse && (intent.taskType === 'general_query' || intent.confidence <= 0.8)) {
      await persistConversationState({
        userId,
        message,
        intent: { taskType: 'general_query', confidence: 1.0, source: 'project_faq' },
        extracted: {},
        userContext: conversationContext,
        responsePayload: { response: faqResponse, structuredData: { faq: true } },
        session: existingSession
      });

      const updatedSession = await getConversationSession(userId);
      return res.json({
        taskId: null,
        intent: { taskType: 'general_query', confidence: 1.0, source: 'project_faq' },
        response: faqResponse,
        structuredData: { faq: true },
        agentsInvolved: ['ProjectFaq'],
        reactSummary: { totalSteps: 1, totalDuration_ms: 0 },
        session: updatedSession
      });
    }

    // AI ENHANCEMENT: Trigger LLM intent analysis whenever regex confidence <= 0.95 (50% LLM AI / 50% Rule hybrid)
    if (intent.confidence <= 0.95 && !intent.blocked) {
      console.log(`[Agentic Router] 🤖 Invoking Gemini/LLM intent analysis for hybrid AI processing (${intent.taskType} at ${intent.confidence})...`);
      const llmMappedIntent = await parseUserIntentLLM(message);
      if (llmMappedIntent && llmMappedIntent.taskType) {
        if (llmMappedIntent.taskType === 'blocked') {
          intent = { blocked: true, blockedReason: 'non_travel_items', confidence: 1.0, detectedWords: ['llm_blocked'] };
        } else {
          intent = { taskType: llmMappedIntent.taskType, confidence: llmMappedIntent.confidence || 0.9, reasoning: llmMappedIntent.reasoning };
        }
        console.log(`[Agentic Router] ✅ Gemini LLM concluded user intent: ${intent.taskType}. Reasoning: ${intent.reasoning}`);
      }
    }

    // Extract structured data from natural language message
    const extracted = extractEntitiesFromMessage(message);

    // AI ENHANCEMENT: Use Gemini LLM to refine passenger name and travel date extraction
    try {
      const llmEntities = await extractEntitiesWithLLM(message);
      if (llmEntities) {
        if (llmEntities.passengerName && typeof llmEntities.passengerName === 'string') {
          const cleanLlmName = llmEntities.passengerName
            .replace(/\b(on|for)?\s*(today|tomorrow|yesterday|morning|afternoon|evening|night)\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
          if (cleanLlmName.length >= 2) {
            extracted.passengerDetails = { ...(extracted.passengerDetails || {}), name: capitalize(cleanLlmName) };
            console.log(`[Agentic Router] 🤖 Gemini extracted passenger name: ${extracted.passengerDetails.name}`);
          }
        }
        if (llmEntities.travelDate) {
          if (llmEntities.travelDate === 'today') extracted.travelDate = getLocalDateString();
          else if (llmEntities.travelDate === 'tomorrow') {
            const { getOffsetLocalDateString } = require('../utils/dateUtils');
            extracted.travelDate = getOffsetLocalDateString(1);
          } else if (/^\d{4}-\d{2}-\d{2}$/.test(llmEntities.travelDate)) {
            extracted.travelDate = llmEntities.travelDate;
          }
        }
        if (llmEntities.preferMinFare) {
          extracted.preferences = { ...(extracted.preferences || {}), minFare: true, lowestPrice: true, cheapest: true };
        }
      }
    } catch (e) {
      console.warn('[Agentic Router] LLM entity refinement skipped:', e.message);
    }

    // ════════════════════════════════════════════════════════════════════════════
    // GUARDRAIL: Block booking when non-travel item words are detected
    // Never auto-select seats or proceed to payment for non-travel items
    // ════════════════════════════════════════════════════════════════════════════
    if (intent.blocked && intent.blockedReason === 'non_travel_items') {
      const detectedWords = intent.detectedWords || [];
      const fromCity = extracted.fromCity || '';
      const toCity = extracted.toCity || '';
      const travelDate = extracted.travelDate || '';

      // Build correction question if cities/date were found
      let correctionQuestion = '';
      if (fromCity && toCity) {
        correctionQuestion = `\n\n🔄 **Did you mean to book a bus seat?**\nDo you want to book a bus seat from **${fromCity}** to **${toCity}**${travelDate ? ` on **${travelDate}**` : ''}?\nIf yes, please re-enter without non-travel items.`;
      }

      const responseText =
        `🚫 **Invalid Booking Request**\n\n` +
        `This app is **only for bus seat/ticket booking**. The word(s) ` +
        `(**${detectedWords.join(', ')}**) are invalid for booking a bus seat or ticket, ` +
        `so I cannot process this request.\n\n` +
        `Please provide valid travel details like **From city**, **To city**, **Date**, and **Passenger name**.` +
        correctionQuestion +
        `\n\n📝 **Example:**\n"Book 1 seat from Hyderabad to Vijayawada tomorrow evening, name Harsha."\n\n` +
        `⚠️ *This app handles only bus travel seat booking, not food or product orders.*`;

      console.log(`[Guardrail] Blocked non-travel booking attempt. Detected words: ${detectedWords.join(', ')}`);

      await persistConversationState({
        userId,
        message,
        intent,
        extracted,
        userContext: conversationContext,
        responsePayload: {
          structuredData: {
            status: 'blocked',
            reason: 'non_travel_items',
            detectedWords,
            fromCity: fromCity || null,
            toCity: toCity || null,
            travelDate: travelDate || null
          }
        },
        session: existingSession
      });

      return res.json({
        taskId: null,
        intent,
        response: responseText,
        structuredData: {
          status: 'blocked',
          reason: 'non_travel_items',
          detectedWords,
          fromCity: fromCity || null,
          toCity: toCity || null,
          travelDate: travelDate || null
        },
        agentsInvolved: ['GuardrailAgent'],
        reactSummary: { totalSteps: 1, totalDuration_ms: 0 }
      });
    }

    // ════════════════════════════════════════════════════════════════════════════
    // SEAT DESELECTION: Handle "remove seat", "deselect seat", "change seat"
    // ════════════════════════════════════════════════════════════════════════════
    const deselectPatterns = [
      /(?:deselect|remove|unselect|drop|cancel|change|swap)\s+(?:seat[s]?\s*)?/i,
    ];
    const isDeselectRequest = deselectPatterns.some(p => p.test(message)) && 
      (extracted.seatNumbers || /(?:S\d+|seat\s*\d+)/i.test(message));
    
    if (isDeselectRequest && extracted.seatNumbers && extracted.seatNumbers.length > 0) {
      const seatsToRelease = extracted.seatNumbers;
      let scheduleId = extracted.scheduleId || conversationContext?.scheduleId;
      
      // If no schedule ID provided, try to find it from user's current seat_locks
      if (!scheduleId) {
        try {
          const existingLock = await dbGet(
            'SELECT schedule_id FROM seat_locks WHERE locked_by_user = ? AND seat_number = ? LIMIT 1',
            [userId, seatsToRelease[0]]
          );
          if (existingLock) scheduleId = existingLock.schedule_id;
        } catch (e) {}
      }

      if (!scheduleId) {
        await persistConversationState({
          userId,
          message,
          intent: { taskType: 'deselect_seat', confidence: 0.9 },
          extracted,
          userContext: conversationContext,
          responsePayload: { structuredData: { needsScheduleId: true } },
          session: existingSession
        });

        return res.json({
          taskId: null,
          intent: { taskType: 'deselect_seat', confidence: 0.9 },
          response: `❌ **Could not find your held seats.**\n\nNo held seats found matching **${seatsToRelease.join(', ')}**. They may have already been released or expired.`,
          structuredData: { needsScheduleId: true },
          agentsInvolved: ['ValidationCheck'],
          reactSummary: { totalSteps: 1, totalDuration_ms: 0 }
        });
      }

      // Look up bus name and departure info from schedule
      let busName = 'Unknown Bus';
      let travelDate = null;
      let departureTime = null;
      try {
        const busInfo = await dbGet(
          'SELECT b.bus_name, s.travel_date, s.departure_time FROM schedules s JOIN buses b ON s.bus_id = b.id WHERE s.id = ?',
          [scheduleId]
        );
        if (busInfo) {
          busName = busInfo.bus_name;
          travelDate = busInfo.travel_date;
          departureTime = busInfo.departure_time;
        }
      } catch (e) {}

      // Block deselection within 2 hours of departure
      if (travelDate && departureTime) {
        try {
          const journeyDateTime = new Date(`${travelDate}T${departureTime}`);
          const now = new Date();
          const diffMs = journeyDateTime.getTime() - now.getTime();
          if (diffMs >= 0 && diffMs < 2 * 60 * 60 * 1000) {
            await persistConversationState({
              userId,
              message,
              intent: { taskType: 'deselect_seat', confidence: 0.95 },
              extracted,
              userContext: conversationContext,
              responsePayload: {
                structuredData: {
                  status: 'deselect_blocked',
                  reason: 'too_close_to_departure',
                  busName,
                  scheduleId
                }
              },
              session: existingSession
            });

            return res.json({
              taskId: null,
              intent: { taskType: 'deselect_seat', confidence: 0.95 },
              response: `⚠️ **Cannot deselect seats from ${busName}**\n\nThe journey time is too short — your departure is less than **2 hours** away. It is not possible to deselect seats this close to the journey.\n\n🕐 Departure: **${departureTime}** on **${travelDate}**`,
              structuredData: { status: 'deselect_blocked', reason: 'too_close_to_departure', busName, scheduleId },
              agentsInvolved: ['BookingAgent'],
              reactSummary: { totalSteps: 1, totalDuration_ms: 0 }
            });
          }
        } catch (e) {}
      }

      // Release the seats from seat_locks
      let released = 0;
      let failed = 0;
      for (const seat of seatsToRelease) {
        try {
          await dbRun(
            'DELETE FROM seat_locks WHERE schedule_id = ? AND seat_number = ? AND locked_by_user = ?',
            [scheduleId, seat, userId]
          );
          released++;
        } catch (e) {
          failed++;
        }
      }

      // Check remaining held seats for this user on this schedule
      let remainingSeats = [];
      try {
        const remaining = await dbAll(
          'SELECT seat_number FROM seat_locks WHERE schedule_id = ? AND locked_by_user = ?',
          [scheduleId, userId]
        );
        remainingSeats = remaining.map(r => r.seat_number);
      } catch (e) {}

      const responseText = `✅ **Seats Deselected from ${busName}!**\n\n` +
        `🔓 Deselected: **${seatsToRelease.join(', ')}**\n` +
        `${released > 0 ? `✅ ${released} seat(s) deselected successfully.` : ''}` +
        `${failed > 0 ? `\n⚠️ ${failed} seat(s) could not be deselected.` : ''}` +
        `${remainingSeats.length > 0 ? `\n\n💺 You still have **${remainingSeats.join(', ')}** selected on **${busName}**.` : '\n\n✅ All seats deselected from **' + busName + '**. To book new seats, search for a bus again.'}` ;

      await persistConversationState({
        userId,
        message,
        intent: { taskType: 'deselect_seat', confidence: 0.95 },
        extracted,
        userContext: conversationContext,
        responsePayload: {
          structuredData: remainingSeats.length > 0 ? {
            status: 'seats_released_partial',
            releasedSeats: seatsToRelease,
            remainingSeats,
            scheduleId,
            busName,
            released,
            failed
          } : {
            status: 'seats_released',
            releasedSeats: seatsToRelease,
            scheduleId,
            busName,
            released,
            failed
          }
        },
        session: existingSession
      });

      return res.json({
        taskId: null,
        intent: { taskType: 'deselect_seat', confidence: 0.95 },
        response: responseText,
        structuredData: remainingSeats.length > 0 ? {
          status: 'seats_released_partial',
          releasedSeats: seatsToRelease,
          remainingSeats,
          scheduleId,
          busName,
          released,
          failed
        } : { 
          status: 'seats_released',
          releasedSeats: seatsToRelease,
          scheduleId,
          busName,
          released,
          failed
        },
        agentsInvolved: ['BookingAgent'],
        reactSummary: { totalSteps: 1, totalDuration_ms: 0 }
      });
    }

    // ════════════════════════════════════════════════════════════════════════════
    // CANCELLATION: Check if PNR is required but not provided
    // ════════════════════════════════════════════════════════════════════════════
    if (intent.taskType === 'cancel_booking') {
      const hasPNR = extracted.pnr || 
                     /pnr[:\s]*([a-z0-9]+)/i.test(message) ||
                     conversationContext?.pnr;
      const hasBookingId = extracted.bookingId || conversationContext?.bookingId;
      
      if (!hasPNR && !hasBookingId) {
        // Ask user for PNR before proceeding
        await persistConversationState({
          userId,
          message,
          intent,
          extracted,
          userContext: conversationContext,
          responsePayload: {
            awaitingInput: 'pnr',
            structuredData: { needsPNR: true, action: 'cancel_booking' }
          },
          session: existingSession
        });

        return res.json({
          taskId: null,
          intent,
          response: `❌ **PNR Required for Cancellation**

To cancel your booking, please provide your **PNR number**.

You can find your PNR:
• In your booking confirmation email/SMS
• On your ticket
• In "My Bookings" section

**Example:** "Cancel booking PNR1234567890ABCDE"

Please reply with your PNR to proceed with cancellation.`,
          structuredData: { needsPNR: true, action: 'cancel_booking' },
          agentsInvolved: ['ValidationCheck'],
          reactSummary: { totalSteps: 1, totalDuration_ms: 0 },
          awaitingInput: 'pnr'
        });
      }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // BOOKING: Validate passenger names for multiple seat bookings
    // ════════════════════════════════════════════════════════════════════════════
    if (intent.taskType === 'book_ticket') {
      const requestedSeats = extracted.passengerCount || 
                             (extracted.seatNumbers && extracted.seatNumbers.length) || 
                             1;
      
      // Get provided passenger names
      const providedNames = extracted.passengerDetails?.names || 
                           (extracted.passengerDetails?.name ? [extracted.passengerDetails.name] : []);
      
      console.log('[BookingValidation] Requested seats:', requestedSeats, '| Provided names:', providedNames);
      
      // If booking multiple seats but names missing or insufficient
      if (requestedSeats > 1 && providedNames.length < requestedSeats) {
        const missingCount = requestedSeats - providedNames.length;

        await persistConversationState({
          userId,
          message,
          intent,
          extracted,
          userContext: conversationContext,
          responsePayload: {
            awaitingInput: 'passenger_names',
            structuredData: {
              needsPassengerNames: true,
              action: 'book_ticket',
              requestedSeats,
              providedNames,
              missingCount,
              preservedData: {
                fromCity: extracted.fromCity,
                toCity: extracted.toCity,
                travelDate: extracted.travelDate,
                passengerCount: requestedSeats,
                preferences: extracted.preferences
              }
            }
          },
          session: existingSession
        });
        
        return res.json({
          taskId: null,
          intent,
          response: `📋 **Passenger Names Required**

You're booking **${requestedSeats} seats**, but I need names for all passengers.

${providedNames.length > 0 ? `**Received:** ${providedNames.join(', ')}\n` : ''}**Missing:** ${missingCount} more name(s)

**Please provide all passenger names:**

**Example 1:** "Book 2 seats from Mumbai to Pune with names John, Mary"

**Example 2:** "Names are John and Mary"

**Example 3:** "Passengers John, Mary, David"

Reply with all passenger names to continue booking.`,
          structuredData: { 
            needsPassengerNames: true, 
            action: 'book_ticket',
            requestedSeats,
            providedNames,
            missingCount,
            // Preserve other extracted data for next request
            preservedData: {
              fromCity: extracted.fromCity,
              toCity: extracted.toCity,
              travelDate: extracted.travelDate,
              passengerCount: requestedSeats,
              preferences: extracted.preferences
            }
          },
          agentsInvolved: ['ValidationCheck'],
          reactSummary: { totalSteps: 1, totalDuration_ms: 0 },
          awaitingInput: 'passenger_names'
        });
      }
      
      // If names provided match the count, ensure they're in the right format
      if (requestedSeats > 1 && providedNames.length === requestedSeats) {
        // Store as array in passengerDetails
        extracted.passengerDetails = extracted.passengerDetails || {};
        extracted.passengerDetails.names = providedNames;
        extracted.multiplePassengers = true;
      }
    }

    const todayStr = getLocalDateString();
    let finalTravelDate = extracted.travelDate;
    if (!finalTravelDate) {
      const ctxDate = conversationContext?.selectedRoute?.travelDate || conversationContext?.travelDate;
      if (ctxDate && ctxDate >= todayStr) {
        finalTravelDate = ctxDate;
      } else {
        finalTravelDate = todayStr;
      }
    }

    // Merge any structured context from the frontend
    const inputData = {
      userId,
      userMessage: message,
      query: message,
      message: message,
      ...extracted,
      ...(conversationContext || {}),
      fromCity: extracted.fromCity || conversationContext?.selectedRoute?.fromCity || conversationContext?.fromCity || null,
      toCity: extracted.toCity || conversationContext?.selectedRoute?.toCity || conversationContext?.toCity || null,
      travelDate: finalTravelDate
    };

    const insertResult = await dbRun(
      'INSERT INTO agent_tasks (user_id, task_type, input_data, status) VALUES (?, ?, ?, ?)',
      [userId, intent.taskType, JSON.stringify(inputData), 'processing']
    );
    const taskId = insertResult.lastID;

    // Run orchestration
    const taskResult = await orchestrateAgents(taskId, intent.taskType, inputData);

    await dbRun(
      'UPDATE agent_tasks SET status = ?, result = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [taskResult.halted ? 'halted' : 'completed', JSON.stringify(taskResult), taskId]
    );


    
    await persistConversationState({
      userId,
      message,
      intent,
      extracted,
      userContext: conversationContext,
      responsePayload: taskResult,
      session: existingSession
    });

    // Return the updated server-side session snapshot so clients can sync
    const updatedSession = await getConversationSession(userId);

    res.json({
      taskId,
      intent,
      response: taskResult.response,
      structuredData: taskResult.structuredData,
      agentsInvolved: taskResult.agentsInvolved,
      reactSummary: taskResult.reactSummary,
      session: updatedSession
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

/**
 * POST /api/agents/verify-llm
 * Prototype endpoint: Accepts LLM booking suggestion and validates it deterministically
 */
router.post('/verify-llm', authenticateToken, async (req, res) => {
  try {
    const { suggestion } = req.body;
    const userId = req.user.id;
    if (!suggestion) return res.status(400).json({ error: 'suggestion required' });

    const result = await validateBookingSuggestion(suggestion, userId);
    res.json({ valid: result.valid, issues: result.issues || [], suggestion: result.suggestion || null });
  } catch (err) {
    res.status(500).json({ error: 'Validation failed: ' + err.message });
  }
});

/**
 * GET /api/agents/plan/:taskType
 * Preview the execution plan for a given task type without running it
 */
router.get('/plan/:taskType', (req, res) => {
  try {
    const { taskType } = req.params;
    const plan = buildExecutionPlan(taskType);

    res.json({
      taskType,
      plan: {
        description: plan.description,
        agents: plan.agents.map(a => ({
          name: a.name || a.agent?.name,
          role: a.role
        })),
        agentCount: plan.agents.length,
        engine: 'LangGraph StateGraph',
        pattern: 'ReAct (Reasoning + Acting) via LangGraph nodes',
        stepsPerAgent: 'Thought -> Action -> Observation (iterative until done)',
        graphType: 'Directed acyclic graph with conditional edges'
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to build plan' });
  }
});

// ============================================================================
// LLM Status and Test Endpoints
// ============================================================================

const { llmService } = require('../agents/langgraph');

/**
 * GET /api/agents/llm/status
 * Check if Ollama is available and get model info
 */
router.get('/llm/status', async (req, res) => {
  try {
    const available = await llmService.isAvailable();
    const readiness = llmService.getReadinessState();
    let modelInfo = null;
    
    if (available) {
      try {
        modelInfo = await llmService.getModelInfo();
      } catch (e) {
        modelInfo = { error: e.message };
      }
    }

    res.json({
      available,
      ready: readiness.ready,
      lastError: readiness.lastError,
      model: llmService.config.model,
      host: `${llmService.config.host}:${llmService.config.port}`,
      modelInfo,
      message: available 
        ? `Ollama is running with ${llmService.config.model}` 
        : 'Ollama is not available. Chat will fail until Ollama is running.'
    });
  } catch (error) {
    res.status(500).json({ 
      available: false, 
      error: error.message,
      message: 'Failed to check LLM status'
    });
  }
});

/**
 * POST /api/agents/llm/test
 * Test LLM generation with a simple prompt
 */
router.post('/llm/test', async (req, res) => {
  try {
    const { prompt = 'Hello! Can you briefly introduce yourself as a bus booking assistant?' } = req.body;
    
    const available = await llmService.isAvailable();
    if (!available) {
      return res.status(503).json({
        success: false,
        error: 'Ollama is not available. Please ensure Ollama is running with llama3.2 model.',
        instructions: 'Run: ollama run llama3.2'
      });
    }

    const startTime = Date.now();
    const response = await llmService.generate(prompt, {
      temperature: 0.7,
      maxTokens: 256,
      systemPrompt: 'You are a helpful bus booking assistant for BusGo.'
    });
    const duration = Date.now() - startTime;

    res.json({
      success: true,
      model: llmService.config.model,
      prompt,
      response,
      duration_ms: duration
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
