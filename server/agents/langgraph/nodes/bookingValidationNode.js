/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                   BOOKING VALIDATION AGENT (CORE AGENT #2)                   ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  PURPOSE: Process ticket bookings with validation and safety checks         ║
 * ║  USES LLM: No - pure database operations                                    ║
 * ║  DATABASE: Read-write via dbUtils (async PostgreSQL)                        ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  FLOW: START → bookingValidationNode → conversationalNode → END             ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

const { dbGet, dbAll, dbRun } = require('../../dbUtils');
const crypto = require('crypto');
const { sendBookingConfirmationEmail } = require('../../../services/emailService');
const llm = require('../llmService');

const CITY_ALIASES = {
  bengaluru: 'bangalore',
  bangalore: 'bangalore',
  tirupathi: 'tirupati',
  tirupati: 'tirupati',
  vizag: 'visakhapatnam',
  visakhapatnam: 'visakhapatnam',
  bombay: 'mumbai',
  mumbai: 'mumbai',
  madras: 'chennai',
  chennai: 'chennai',
  vijayawadda: 'vijayawada',
  vijaywada: 'vijayawada',
  vijayawada: 'vijayawada',
  ananthapuram: 'anantapur',
  ananthapur: 'anantapur',
  anantapuram: 'anantapur',
  anantapur: 'anantapur',
  cuddapah: 'kadapa',
  kadapa: 'kadapa'
};

function getCityVariants(city) {
  if (!city) return [];
  const raw = city.toString().trim().toLowerCase();
  const normalized = CITY_ALIASES[raw] || raw;

  const set = new Set([raw, normalized]);
  if (normalized === 'anantapur' || raw.includes('ananth') || raw.includes('anant')) {
    set.add('anantapur');
    set.add('ananthapuram');
    set.add('ananthapur');
    set.add('anantapuram');
  }
  if (normalized === 'bangalore' || raw.includes('bengal')) {
    set.add('bangalore');
    set.add('bengaluru');
  }
  if (normalized === 'tirupati' || raw.includes('tirup')) {
    set.add('tirupati');
    set.add('tirupathi');
  }
  if (normalized === 'visakhapatnam' || raw === 'vizag') {
    set.add('visakhapatnam');
    set.add('vizag');
  }
  if (normalized === 'mumbai' || raw === 'bombay') {
    set.add('mumbai');
    set.add('bombay');
  }
  if (normalized === 'chennai' || raw === 'madras') {
    set.add('chennai');
    set.add('madras');
  }
  if (normalized === 'vijayawada' || raw.includes('vijay')) {
    set.add('vijayawada');
    set.add('vijayawadda');
    set.add('vijaywada');
  }
  if (normalized === 'kadapa' || raw === 'cuddapah') {
    set.add('kadapa');
    set.add('cuddapah');
  }
  return Array.from(set);
}

function buildCityMatchClause(columnName, city) {
  const variants = getCityVariants(city);
  if (variants.length === 0) return { sql: '1=1', params: [] };
  const clauses = variants.map(() => `LOWER(${columnName}) LIKE ?`);
  const params = variants.map(v => `%${v}%`);
  return {
    sql: `(${clauses.join(' OR ')})`,
    params
  };
}

function normalizeCityName(city) {
  if (!city) return '';
  const normalized = city.toString().trim().toLowerCase();
  return CITY_ALIASES[normalized] || normalized;
}

// ═══════════════════════════════════════════════════════════════════════════════
//                              CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_SEATS_PER_BOOKING = 6;     // Maximum seats per single booking
const SEAT_LOCK_DURATION_MS = 5 * 60 * 1000;  // 5 minutes

// ═══════════════════════════════════════════════════════════════════════════════
//                              HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate unique PNR code
 * Format: PNR + timestamp + 5 random chars (e.g., PNR1770992647322VWH0U)
 */
function generatePNR() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  const timestamp = Date.now();
  let randomPart = '';
  for (let i = 0; i < 5; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `PNR${timestamp}${randomPart}`;
}

/**
 * Ensure PNR is unique in database
 */
async function generateUniquePNR() {
  let attempts = 0;
  while (attempts < 10) {
    const pnr = generatePNR();
    const exists = await dbGet('SELECT id FROM bookings WHERE pnr = ?', [pnr]);
    if (!exists) return pnr;
    attempts++;
  }
  // Fallback: generate with extra random
  return `PNR${Date.now()}${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
}

/**
 * Get user details from database for passenger fallback
 */
async function getUserDetails(userId) {
  if (!userId) return null;
  const user = await dbGet('SELECT id, username, email, phone FROM users WHERE id = ?', [userId]);
  return user;
}

/**
 * Parse seat numbers from various input formats
 */
function parseSeats(seatInput) {
  if (Array.isArray(seatInput)) return seatInput;
  if (typeof seatInput === 'string') {
    return seatInput.split(',').map(s => s.trim().toUpperCase()).filter(s => s);
  }
  return [];
}

function normalizeBookingPreferences(preferences = {}) {
  const normalized = { ...preferences };

  if (normalized.window === true) normalized.aisle = false;
  if (normalized.aisle === true) normalized.window = false;

  if (normalized.operator && typeof normalized.operator === 'string') {
    normalized.operator = normalized.operator.toLowerCase();
  }

  if (normalized.busType && typeof normalized.busType === 'string') {
    const t = normalized.busType.toLowerCase();
    if (t.includes('volvo')) normalized.busType = 'Volvo';
    else if (t.includes('semi')) normalized.busType = 'Semi-Sleeper';
    else if (t.includes('sleep')) normalized.busType = 'Sleeper';
    else if (t.includes('ordinary') || t.includes('non')) normalized.busType = 'Ordinary';

    if (t.includes('non')) normalized.hasAC = false;
    if (t === 'ac') normalized.hasAC = true;
  }

  if (normalized.hasAC !== undefined) {
    normalized.hasAC = !!normalized.hasAC;
  }

  if (normalized.timeOfDay && typeof normalized.timeOfDay === 'string') {
    const time = normalized.timeOfDay.toLowerCase();
    if (['morning', 'afternoon', 'evening', 'night'].includes(time)) {
      normalized.timeOfDay = time;
    } else {
      delete normalized.timeOfDay;
    }
  }

  if (normalized.position && typeof normalized.position === 'string') {
    const pos = normalized.position.toLowerCase();
    if (['front', 'middle', 'back'].includes(pos)) {
      normalized.position = pos;
    } else {
      delete normalized.position;
    }
  }

  return normalized;
}

function mergePreferences(userPrefs = {}, llmPrefs = {}) {
  const merged = { ...userPrefs };
  for (const [k, v] of Object.entries(llmPrefs || {})) {
    if (merged[k] === undefined || merged[k] === null || merged[k] === '') {
      merged[k] = v;
    }
  }
  return normalizeBookingPreferences(merged);
}

async function inferMissingPreferencesWithLLM({ userMessage, userPreferences, passengerInfo, routeContext, candidates }) {
  const explicit = normalizeBookingPreferences(userPreferences || {});
  const hasExplicit = Object.keys(explicit).length > 0;

  const compactCandidates = (candidates || []).slice(0, 8).map(c => ({
    scheduleId: c.id,
    busName: c.bus_name,
    operator: c.operator,
    busType: c.bus_type,
    hasAC: !!c.has_ac,
    sleeper: !!c.is_sleeper,
    departure: c.departure_time,
    price: c.base_price,
    rating: c.rating,
    availableSeats: c.available_seats
  }));

const prompt = `You are selecting bus-booking defaults. Return ONLY valid JSON with this schema:
{"preferences":{"busType":"Volvo|Sleeper|Semi-Sleeper|Ordinary","timeOfDay":"morning|afternoon|evening|night","window":true|false,"aisle":true|false,"position":"front|middle|back","operator":"operator name (e.g. orange, rtc) or null","maxPrice":number|null},"bestScheduleId":number|null,"reason":"short reason"}

Rules:
1) Keep all explicit user preferences unchanged.
2) Fill only missing preferences using best comfort/value choices.
3) If user gave no preferences, choose best defaults.
4) Pick bestScheduleId from candidate schedule IDs when possible.
5) Extract operator name if mentioned (e.g. "orange", "rtc").
6) For maxPrice, DO NOT set it if the user says "above X", "more than X", "minimum X". Only set maxPrice for "under X", "less than X", "max X", "budget X", "around X", "cheaper than X".

User message: ${userMessage || ''}
Explicit preferences: ${JSON.stringify(explicit)}
Passenger info: ${JSON.stringify({ age: passengerInfo?.age || null, gender: passengerInfo?.gender || null })}
Route context: ${JSON.stringify(routeContext || {})}
Candidates: ${JSON.stringify(compactCandidates)}`;

  try {
    const raw = await llm.generateWithRetry(prompt, {
      systemPrompt: 'Return only JSON. No markdown. No prose.',
      temperature: 0.2,
      maxTokens: 220
    });

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { preferences: explicit, bestScheduleId: null, llmUsed: false };
    const parsed = JSON.parse(match[0]);
    const llmPrefs = normalizeBookingPreferences(parsed.preferences || {});
    const merged = mergePreferences(explicit, llmPrefs);

    const validIds = new Set(compactCandidates.map(c => c.scheduleId));
    const bestScheduleId = validIds.has(parsed.bestScheduleId) ? parsed.bestScheduleId : null;

    return {
      preferences: merged,
      bestScheduleId,
      reason: parsed.reason || (hasExplicit ? 'Filled missing preferences using LLM.' : 'Selected full preferences using LLM.'),
      llmUsed: true
    };
  } catch (err) {
    return {
      preferences: explicit,
      bestScheduleId: null,
      reason: `LLM preference inference fallback: ${err.message}`,
      llmUsed: false
    };
  }
}

/**
 * Filter out buses that have already departed for today.
 * For future dates, all buses are kept.
 */
function filterDepartedBuses(schedules) {
  if (!schedules || schedules.length === 0) return schedules;
  const { getLocalDateString } = require('../../../utils/dateUtils');
  const now = new Date();
  const todayStr = getLocalDateString(now);
  return schedules.filter(s => {
    if (s.travel_date === todayStr) {
      const timeStr = (s.departure_time || '').trim();
      let hours = 0;
      let minutes = 0;

      const ampmMatch = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (ampmMatch) {
        let h = parseInt(ampmMatch[1], 10);
        minutes = parseInt(ampmMatch[2], 10);
        const period = ampmMatch[3].toUpperCase();
        if (period === 'PM' && h < 12) h += 12;
        if (period === 'AM' && h === 12) h = 0;
        hours = h;
      } else {
        const parts = timeStr.split(':').map(Number);
        hours = parts[0] || 0;
        minutes = parts[1] || 0;
      }

      const depTime = new Date(now);
      depTime.setHours(hours, minutes, 0, 0);
      return depTime > now; // Only include future departures for today
    }
    return true; // Future dates always included
  });
}

/**
 * SMART BOOKING: Search for schedules when only route info is provided
 * This enables natural language booking like "book from Mumbai to Hyderabad"
 * Selects the BEST bus based on: rating, price, availability, bus type
 */
async function findScheduleByRoute(fromCity, toCity, travelDate, preferences = {}, options = {}) {
  // Normalize city names for comparison
  const from = normalizeCityName(fromCity);
  const to = normalizeCityName(toCity);
  
  if (!from || !to) return null;
  
  // Format date to YYYY-MM-DD
  const { getLocalDateString } = require('../../../utils/dateUtils');
  let requestedDate = travelDate;
  if (!requestedDate) {
    // Default to today
    requestedDate = getLocalDateString();
  } else if (requestedDate instanceof Date) {
    requestedDate = getLocalDateString(requestedDate);
  }
  
  const fromMatch = buildCityMatchClause('r.from_city', fromCity);
  const toMatch = buildCityMatchClause('r.to_city', toCity);

  const requiredSeats = Number.isFinite(options.requiredSeats) ? Number(options.requiredSeats) : 1;
  const maxFareCap = Number.isFinite(options.maxPrice) ? Number(options.maxPrice) : null;
  const minFareCap = Number.isFinite(options.minPrice) ? Number(options.minPrice) : null;

  // Search for matching schedules with rating - first try requested date
  let schedules = Array.isArray(options.preloadedSchedules) ? [...options.preloadedSchedules] : await dbAll(`
    SELECT 
      s.id, s.departure_time, s.arrival_time, s.base_price, 
      s.travel_date, s.available_seats,
      b.bus_name, b.bus_type, b.total_seats, b.has_ac, b.is_sleeper, b.rating, b.operator,
      r.from_city, r.to_city
    FROM schedules s
    JOIN buses b ON s.bus_id = b.id
    JOIN routes r ON s.route_id = r.id
    WHERE ${fromMatch.sql} 
      AND ${toMatch.sql}
      AND s.travel_date = ?
      AND s.available_seats > 0
    ORDER BY b.rating DESC, s.base_price ASC
  `, [...fromMatch.params, ...toMatch.params, requestedDate]);
  
  // Filter out already-departed buses for today
  schedules = filterDepartedBuses(schedules);
  
  // If no schedules for requested date (or all departed), try next dates
  if ((!schedules || schedules.length === 0) && !Array.isArray(options.preloadedSchedules)) {
    schedules = await dbAll(`
      SELECT 
        s.id, s.departure_time, s.arrival_time, s.base_price, 
        s.travel_date, s.available_seats,
        b.bus_name, b.bus_type, b.total_seats, b.has_ac, b.is_sleeper, b.rating, b.operator,
        r.from_city, r.to_city
      FROM schedules s
      JOIN buses b ON s.bus_id = b.id
      JOIN routes r ON s.route_id = r.id
      WHERE ${fromMatch.sql} 
        AND ${toMatch.sql}
        AND s.travel_date >= ?
        AND s.available_seats > 0
      ORDER BY s.travel_date ASC, b.rating DESC, s.base_price ASC
      LIMIT 20
    `, [...fromMatch.params, ...toMatch.params, requestedDate]);
    
    // Also filter the fallback results
    schedules = filterDepartedBuses(schedules);
  }
  
  if (!schedules || schedules.length === 0) return null;
  
  // Apply time-of-day preference if specified
  let filtered = schedules;
  if (preferences.timeOfDay) {
    const time = preferences.timeOfDay.toLowerCase();
    filtered = schedules.filter(s => {
      const hour = parseInt(s.departure_time.split(':')[0]);
      if (time === 'morning') return hour >= 5 && hour < 12;
      if (time === 'afternoon') return hour >= 12 && hour < 17;
      if (time === 'evening') return hour >= 17 && hour < 21;
      if (time === 'night') return hour >= 21 || hour < 5;
      return true;
    });
    
    // If user explicitly requested a time window, do not silently switch to another time.
    if (filtered.length === 0) {
      if (options.strictTimePreference) {
        return null;
      }
      filtered = schedules;
    }
  }
  
  // Apply bus type preference if specified
  if (preferences.busType) {
    const typePref = preferences.busType.toLowerCase();
    const typeMatch = filtered.filter(s => {
      const busType = (s.bus_type || '').toLowerCase();
      if (typePref.includes('ordinary') || typePref.includes('non')) return !s.has_ac;
      if (typePref.includes('volvo') || typePref.includes('volva')) return busType.includes('volvo') || (!!s.has_ac && !busType.includes('semi'));
      if (typePref.includes('semi')) return busType.includes('semi');
      if (typePref.includes('sleep')) return !!s.is_sleeper;
      if (typePref.includes('seat')) return !s.is_sleeper;
      return busType.includes(typePref);
    });
    if (typeMatch.length > 0) {
      filtered = typeMatch;
    } else if (options.strictBusTypePreference) {
      return null;
    }
  }

  // Apply isSleeper preference if specified (e.g. "seater" vs "sleeper")
  if (typeof preferences.isSleeper === 'boolean') {
    const sleeperMatch = filtered.filter(s => (!!s.is_sleeper) === preferences.isSleeper);
    if (sleeperMatch.length > 0) {
      filtered = sleeperMatch;
    }
  }

  // Apply AC preference if explicitly provided
  if (typeof preferences.hasAC === 'boolean') {
    const acMatch = filtered.filter(s => (!!s.has_ac) === preferences.hasAC);
    if (acMatch.length > 0) {
      filtered = acMatch;
    } else if (options.strictBusTypePreference) {
      return null;
    }
  }
  
  // Apply operator preference if specified
  if (preferences.operator) {
    const opMatch = filtered.filter(s => {
      const op = (s.operator || '').toLowerCase();
      const bn = (s.bus_name || '').toLowerCase();
      const pref = preferences.operator.toLowerCase();
      return op.includes(pref) || bn.includes(pref);
    });
    if (opMatch.length > 0) filtered = opMatch;
  }
  
  // ════════════════════════════════════════════════════════════════════════════
  // SMART SELECTION: Score each bus and pick the best
  // Score based on: rating (40%), price value (30%), availability (20%), features (10%)
  // ════════════════════════════════════════════════════════════════════════════
  // ════════════════════════════════════════════════════════════════════════════
  // DATE PRIORITIZATION: Strictly pick the earliest upcoming travel date first
  // ════════════════════════════════════════════════════════════════════════════
  const earliestDate = filtered.map(s => s.travel_date).sort()[0];
  const earliestDateBuses = filtered.filter(s => s.travel_date === earliestDate);

  const maxPrice = Math.max(...earliestDateBuses.map(s => s.base_price));
  const minPrice = Math.min(...earliestDateBuses.map(s => s.base_price));
  
  const wantsMinimumFare = preferences.minFare || preferences.lowestPrice || preferences.cheapest ||
    (preferences.sortBy === 'price') || (options.preferMinFare === true);

  const scoredBuses = earliestDateBuses.map(s => {
    let score = 0;
    
    if (wantsMinimumFare) {
      // Prioritize lowest price heavily (0-80 points for lowest price)
      if (maxPrice !== minPrice) {
        score += 80 * (1 - (s.base_price - minPrice) / (maxPrice - minPrice));
      } else {
        score += 80;
      }
      score += (s.rating || 4.0) * 4; // Rating secondary tiebreaker
    } else {
      // Rating score (0-40 points) - Higher is better
      score += (s.rating || 4.0) * 10;
      
      // Price value score (0-30 points) - Lower price = higher score
      if (maxPrice !== minPrice) {
        const priceScore = 30 * (1 - (s.base_price - minPrice) / (maxPrice - minPrice));
        score += priceScore;
      } else {
        score += 15;
      }
      
      // Availability score (0-20 points)
      const availabilityPct = s.available_seats / s.total_seats;
      score += availabilityPct * 20;
      
      // Feature score (0-10 points)
      if (s.has_ac) score += 5;
      if (s.is_sleeper) score += 3;
      if (s.rating >= 4.5) score += 2;
    }
    
    return { ...s, score };
  });
  
  // Sort by score descending (or base_price ascending if minimum fare requested)
  if (wantsMinimumFare) {
    scoredBuses.sort((a, b) => a.base_price - b.base_price || b.score - a.score);
  } else {
    scoredBuses.sort((a, b) => b.score - a.score);
  }
  
  console.log(`[BookingAgent] Best bus selected: ${scoredBuses[0].bus_name} (Score: ${scoredBuses[0].score.toFixed(1)}, Rating: ${scoredBuses[0].rating}, Price: ₹${scoredBuses[0].base_price})`);
  
  return {
    ...scoredBuses[0],
    requestedDate
  };
}

async function findCandidateSchedules(fromCity, toCity, travelDate, requiredSeats = 1, maxFareCap = null) {
  const fromMatch = buildCityMatchClause('r.from_city', fromCity);
  const toMatch = buildCityMatchClause('r.to_city', toCity);

  let requestedDate = travelDate;
  const { getLocalDateString } = require('../../../utils/dateUtils');
  if (!requestedDate) requestedDate = getLocalDateString();
  else if (requestedDate instanceof Date) requestedDate = getLocalDateString(requestedDate);

  let schedules = await dbAll(`
    SELECT 
      s.id, s.departure_time, s.arrival_time, s.base_price, 
      s.travel_date, s.available_seats,
      b.bus_name, b.bus_type, b.total_seats, b.has_ac, b.is_sleeper, b.rating, b.operator,
      r.from_city, r.to_city
    FROM schedules s
    JOIN buses b ON s.bus_id = b.id
    JOIN routes r ON s.route_id = r.id
    WHERE ${fromMatch.sql}
      AND ${toMatch.sql}
      AND s.travel_date = ?
      AND s.available_seats > 0
    ORDER BY b.rating DESC, s.base_price ASC
    LIMIT 25
  `, [...fromMatch.params, ...toMatch.params, requestedDate]);

  schedules = filterDepartedBuses(schedules);

  if (!schedules || schedules.length === 0) {
    schedules = await dbAll(`
      SELECT 
        s.id, s.departure_time, s.arrival_time, s.base_price, 
        s.travel_date, s.available_seats,
        b.bus_name, b.bus_type, b.total_seats, b.has_ac, b.is_sleeper, b.rating, b.operator,
        r.from_city, r.to_city
      FROM schedules s
      JOIN buses b ON s.bus_id = b.id
      JOIN routes r ON s.route_id = r.id
      WHERE ${fromMatch.sql}
        AND ${toMatch.sql}
        AND s.travel_date >= ?
        AND s.available_seats > 0
      ORDER BY s.travel_date ASC, b.rating DESC, s.base_price ASC
      LIMIT 25
    `, [...fromMatch.params, ...toMatch.params, requestedDate]);
  }

  // Filter out already-departed buses for today
  schedules = filterDepartedBuses(schedules);

  if (requiredSeats > 1) {
    schedules = schedules.filter(s => (s.available_seats || 0) >= requiredSeats);
  }

  if (maxFareCap !== null) {
    schedules = schedules.filter(s => Number(s.base_price) <= maxFareCap);
  }

  return schedules || [];
}

async function findMinimumAvailableFare(fromCity, toCity, travelDate, requiredSeats = 1) {
  const fromMatch = buildCityMatchClause('r.from_city', fromCity);
  const toMatch = buildCityMatchClause('r.to_city', toCity);

  let requestedDate = travelDate;
  const { getLocalDateString } = require('../../../utils/dateUtils');
  if (!requestedDate) requestedDate = getLocalDateString();
  else if (requestedDate instanceof Date) requestedDate = getLocalDateString(requestedDate);

  const row = await dbGet(`
    SELECT MIN(s.base_price) AS minFare
    FROM schedules s
    JOIN routes r ON s.route_id = r.id
    WHERE ${fromMatch.sql}
      AND ${toMatch.sql}
      AND s.travel_date >= ?
      AND s.available_seats >= ?
  `, [...fromMatch.params, ...toMatch.params, requestedDate, Math.max(1, requiredSeats)]);

  if (!row || row.minFare === null || row.minFare === undefined) return null;
  return Number(row.minFare);
}

async function getRouteSuggestions(fromCity, toCity) {
  const fromMatch = buildCityMatchClause('from_city', fromCity);
  const toMatch = buildCityMatchClause('to_city', toCity);

  const fromMatches = await dbAll(`
    SELECT DISTINCT to_city
    FROM routes
    WHERE ${fromMatch.sql}
    ORDER BY to_city ASC
    LIMIT 8
  `, fromMatch.params);

  const toMatches = await dbAll(`
    SELECT DISTINCT from_city
    FROM routes
    WHERE ${toMatch.sql}
    ORDER BY from_city ASC
    LIMIT 8
  `, toMatch.params);

  return {
    fromCityOptions: fromMatches.map(r => r.to_city),
    toCityOrigins: toMatches.map(r => r.from_city)
  };
}

/**
 * Auto-select available seat for a schedule with smart preferences
 * Supports: window/aisle type + front/middle/back position zones + AGE-BASED intelligence
 * 
 * Seat layout (2+2 config, e.g. 40 seats = 10 rows):
 * Row pattern: [W1][A1] | [A2][W2] where W=Window, A=Aisle
 * Seat numbering: S1(W), S2(A), S3(A), S4(W), S5(W), S6(A)...
 * Window seats: positions 1,4 in each group of 4
 * Aisle seats:  positions 2,3 in each group of 4
 * 
 * Zones (divided into 3 equal parts):
 *   Front:  rows 1 to totalRows/3
 *   Middle: rows totalRows/3+1 to 2*totalRows/3
 *   Back:   rows 2*totalRows/3+1 to totalRows
 * 
 * Age-based intelligence (when user hasn't specified preferences):
 *   Children (≤12):  AISLE preferred (safety), FRONT zone (less bumpy, easy exit, near driver)
 *   Teens (13-17):   Window OK, MIDDLE zone (balance of comfort)
 *   Adults (18-59):  WINDOW preferred (view, privacy, lean on wall), MIDDLE zone (smooth ride)
 *   Seniors (≥60):   AISLE preferred (easy to stand up), FRONT zone (easy boarding, less walking)
 * 
 * Returns: { seats: [...], fallback: bool, fallbackReason: string, alternatives: [...], ageNote: string }
 */
async function autoSelectSeat(scheduleId, numSeats = 1, preferences = {}, passengerAge = null) {
  // Get total seats and booked seats
  const schedule = await dbGet(`
    SELECT b.total_seats FROM schedules s
    JOIN buses b ON s.bus_id = b.id
    WHERE s.id = ?
  `, [scheduleId]);
  
  if (!schedule) return { seats: [], fallback: false };
  
  const totalSeats = schedule.total_seats;
  const seatsPerRow = 4; // 2+2 layout
  const totalRows = Math.ceil(totalSeats / seatsPerRow);
  
  // Get already booked seats
  const booked = await getBookedSeats(scheduleId);
  const locked = await getLockedSeats(scheduleId);
  const unavailable = new Set([...booked, ...locked]);
  
  // ── Seat classification helpers ──
  const isWindowSeat = (num) => {
    const posInGroup = ((num - 1) % 4) + 1;
    return posInGroup === 1 || posInGroup === 4;
  };
  
  const getRow = (num) => Math.ceil(num / seatsPerRow);
  
  const getZone = (num) => {
    const row = getRow(num);
    const frontEnd = Math.ceil(totalRows / 3);
    const midEnd = Math.ceil(2 * totalRows / 3);
    if (row <= frontEnd) return 'front';
    if (row <= midEnd) return 'middle';
    return 'back';
  };
  
  const getSeatInfo = (num) => ({
    id: `S${num}`,
    num,
    isWindow: isWindowSeat(num),
    isAisle: !isWindowSeat(num),
    zone: getZone(num),
    row: getRow(num)
  });
  
  // ── Build list of all available seats with metadata ──
  const allAvailable = [];
  for (let i = 1; i <= totalSeats; i++) {
    if (!unavailable.has(`S${i}`)) {
      allAvailable.push(getSeatInfo(i));
    }
  }
  
  if (allAvailable.length === 0) return { seats: [], fallback: false };
  
  // ── Apply preference filters ──
  const requestedPosition = preferences.position || null;  // 'front', 'middle', 'back'
  const requestedType = preferences.aisle ? 'aisle' : (preferences.window ? 'window' : null);
  
  // If NO explicit preferences given, skip filter path → go straight to smart scoring
  const hasExplicitPreferences = requestedPosition || requestedType;
  
  if (hasExplicitPreferences) {
  // Filter step 1: Zone (front/middle/back)
  let zoneFiltered = allAvailable;
  if (requestedPosition) {
    zoneFiltered = allAvailable.filter(s => s.zone === requestedPosition);
  }
  
  // Filter step 2: Type (window/aisle)
  let typeFiltered = zoneFiltered;
  if (requestedType === 'aisle') {
    typeFiltered = zoneFiltered.filter(s => s.isAisle);
  } else if (requestedType === 'window') {
    typeFiltered = zoneFiltered.filter(s => s.isWindow);
  }
  
  // ── BEST CASE: Both zone + type matched ──
  if (typeFiltered.length >= numSeats) {
    const selected = typeFiltered.slice(0, numSeats).map(s => s.id);
    console.log(`[BookingAgent] Seat selection: matched zone=${requestedPosition || 'any'} + type=${requestedType || 'any'} → ${selected.join(', ')}`);
    return { seats: selected, fallback: false };
  }
  
  // ── FALLBACK SCENARIOS: Preferred seats are booked ──
  let fallbackReason = '';
  let alternatives = [];
  let selectedSeats = [];
  
  // Fallback 1: Zone matched but type didn't have enough
  if (requestedType && zoneFiltered.length >= numSeats) {
    // Offer same zone but different type
    selectedSeats = zoneFiltered.slice(0, numSeats).map(s => s.id);
    const altType = requestedType === 'window' ? 'aisle' : 'window';
    fallbackReason = `All ${requestedType} seats in the ${requestedPosition || 'preferred'} zone are booked. Offering ${altType} seat(s) in the same zone.`;
    
    // Suggest other zones with the preferred type
    const otherZoneSeats = allAvailable.filter(s => 
      (requestedType === 'window' ? s.isWindow : s.isAisle) && 
      s.zone !== requestedPosition
    );
    if (otherZoneSeats.length > 0) {
      alternatives = otherZoneSeats.slice(0, 3).map(s => ({
        seat: s.id, zone: s.zone, type: s.isWindow ? 'window' : 'aisle'
      }));
    }
    
    console.log(`[BookingAgent] Seat fallback: zone matched, type fallback → ${selectedSeats.join(', ')}`);
    return { seats: selectedSeats, fallback: true, fallbackReason, alternatives };
  }
  
  // Fallback 2: Zone didn't have enough seats at all
  if (requestedPosition && zoneFiltered.length < numSeats) {
    // Offer from other zones matching the type preference
    let bestAlternatives;
    if (requestedType === 'aisle') {
      bestAlternatives = allAvailable.filter(s => s.isAisle);
    } else if (requestedType === 'window') {
      bestAlternatives = allAvailable.filter(s => s.isWindow);
    } else {
      // No type preference: prefer window in other zones
      bestAlternatives = [...allAvailable.filter(s => s.isWindow), ...allAvailable.filter(s => s.isAisle)];
    }
    
    if (bestAlternatives.length >= numSeats) {
      selectedSeats = bestAlternatives.slice(0, numSeats).map(s => s.id);
      fallbackReason = `All seats in the ${requestedPosition} zone are booked. Offering the best available ${requestedType || 'window'} seat(s) from other zones.`;
      
      // Show alternatives from other zones
      alternatives = bestAlternatives.slice(0, 3).map(s => ({
        seat: s.id, zone: s.zone, type: s.isWindow ? 'window' : 'aisle'
      }));
      
      console.log(`[BookingAgent] Seat fallback: zone exhausted → ${selectedSeats.join(', ')}`);
      return { seats: selectedSeats, fallback: true, fallbackReason, alternatives };
    }
    
    // Extreme fallback: just give any available
    selectedSeats = allAvailable.slice(0, numSeats).map(s => s.id);
    fallbackReason = `All ${requestedPosition} ${requestedType || ''} seats are booked. Offering the next best available seat(s).`;
    alternatives = allAvailable.slice(0, 3).map(s => ({
      seat: s.id, zone: s.zone, type: s.isWindow ? 'window' : 'aisle'
    }));
    
    console.log(`[BookingAgent] Seat fallback: extreme → ${selectedSeats.join(', ')}`);
    return { seats: selectedSeats, fallback: true, fallbackReason, alternatives };
  }
  
  // Fallback 3: Only type preference, no zone — type exhausted
  if (requestedType && typeFiltered.length < numSeats) {
    selectedSeats = allAvailable.slice(0, numSeats).map(s => s.id);
    const altType = requestedType === 'window' ? 'aisle' : 'window';
    fallbackReason = `All ${requestedType} seats are booked. Offering ${altType} seat(s) instead.`;
    alternatives = allAvailable.filter(s => requestedType === 'window' ? s.isAisle : s.isWindow)
      .slice(0, 3).map(s => ({ seat: s.id, zone: s.zone, type: s.isWindow ? 'window' : 'aisle' }));
    
    console.log(`[BookingAgent] Seat fallback: type exhausted → ${selectedSeats.join(', ')}`);
    return { seats: selectedSeats, fallback: true, fallbackReason, alternatives };
  }
  
  } // end of hasExplicitPreferences block
  
  // ══════════════════════════════════════════════════════════════════════════
  // SMART SCORING: No explicit preferences OR all preference fallbacks exhausted
  // Picks the BEST seat based on age, comfort, zone, and seat type
  // ══════════════════════════════════════════════════════════════════════════
  
  let selectedSeats = [];
  
  // ── AGE-BASED INTELLIGENCE ──
  // Determine age category and log it
  const age = passengerAge ? parseInt(passengerAge) : null;
  let ageCategory = 'adult'; // default
  let ageNote = '';
  if (age !== null && !isNaN(age)) {
    if (age <= 12) {
      ageCategory = 'child';
      ageNote = `👶 Child (age ${age}): Selected aisle seat in front zone for safety — away from windows, easy access, near driver.`;
    } else if (age <= 17) {
      ageCategory = 'teen';
      ageNote = `🧑 Teen (age ${age}): Selected comfortable middle-zone seat.`;
    } else if (age >= 60) {
      ageCategory = 'senior';
      ageNote = `👴 Senior (age ${age}): Selected aisle seat in front zone — easy to stand up, less walking, quick boarding.`;
    } else {
      ageCategory = 'adult';
      ageNote = `🧑 Adult (age ${age}): Selected best window seat in middle zone — great view, smooth ride.`;
    }
    console.log(`[BookingAgent] Age-based seat selection: age=${age}, category=${ageCategory}`);
  }

  // ── SMART SEAT SCORING (age-aware + comfort-based) ──
  // Score each seat to find the "best" ones intelligently
  const scoreSeat = (s) => {
    let score = 0;
    
    if (ageCategory === 'child') {
      // CHILDREN: Aisle (safety, no window fall risk), Front (less bumpy, near driver, easy exit)
      if (s.isAisle) score += 25;
      else score -= 10; // penalize window for children
      if (s.zone === 'front') score += 30;
      else if (s.zone === 'middle') score += 15;
      else score += 5; // avoid back for children
      if (s.row === 1) score += 5; // row 1 is fine for children (near driver)
      if (s.row === totalRows) score -= 15; // never last row for children
    } else if (ageCategory === 'senior') {
      // SENIORS: Aisle (easy to stand up & walk), Front (less walking, easy boarding)
      if (s.isAisle) score += 25;
      else score += 5; // window OK but aisle much better for seniors
      if (s.zone === 'front') score += 30;
      else if (s.zone === 'middle') score += 15;
      else score += 0; // avoid back for seniors (bumpy)
      if (s.row === 1) score += 3; // front row = closest to exit
      if (s.row === 2) score += 5; // row 2 ideal — front but not engine noise
      if (s.row === totalRows) score -= 15; // avoid last row
    } else if (ageCategory === 'teen') {
      // TEENS: Window or aisle OK, Middle zone preferred
      if (s.zone === 'middle') score += 30;
      else if (s.zone === 'front') score += 18;
      else score += 10;
      if (s.isWindow) score += 12;
      else score += 10; // both types fine for teens
      if (s.row === 1) score -= 5;
      if (s.row === totalRows) score -= 5;
    } else {
      // ADULTS: Window preferred (view, privacy, lean on wall), Middle zone (smoothest ride)
      if (s.zone === 'middle') score += 30;
      else if (s.zone === 'front') score += 20;
      else score += 10; // back
      if (s.isWindow) score += 20; // strong window preference for adults
      else score += 5; // aisle is backup
      if (s.row === 1) score -= 10; // engine noise
      if (s.row === totalRows) score -= 8; // bumpy
    }
    
    // Universal bonuses/penalties
    if (s.row % 2 === 0) score += 2; // even rows slightly better legroom
    
    return score;
  };
  
  // Score all available seats
  const scored = allAvailable.map(s => ({ ...s, score: scoreSeat(s) }));
  scored.sort((a, b) => b.score - a.score); // highest score first
  
  // For multiple seats, try to find adjacent seats (same row) for better group experience
  if (numSeats > 1) {
    // Group seats by row
    const byRow = {};
    scored.forEach(s => {
      if (!byRow[s.row]) byRow[s.row] = [];
      byRow[s.row].push(s);
    });
    
    // Find the best row that has enough seats together
    const rowEntries = Object.entries(byRow)
      .filter(([_, seats]) => seats.length >= numSeats)
      .sort((a, b) => {
        // Sort rows by average score of their seats (descending)
        const avgA = a[1].reduce((sum, s) => sum + s.score, 0) / a[1].length;
        const avgB = b[1].reduce((sum, s) => sum + s.score, 0) / b[1].length;
        return avgB - avgA;
      });
    
    if (rowEntries.length > 0) {
      const bestRowSeats = rowEntries[0][1].slice(0, numSeats);
      selectedSeats = bestRowSeats.map(s => s.id);
      console.log(`[BookingAgent] Smart seat selection: adjacent seats in row ${rowEntries[0][0]} → ${selectedSeats.join(', ')} (scores: ${bestRowSeats.map(s => s.score).join(', ')})`);
      return { seats: selectedSeats, fallback: false, ageNote: ageNote || null };
    }
  }
  
  // Single seat or no adjacent row available — pick top scored seats
  selectedSeats = scored.slice(0, numSeats).map(s => s.id);
  console.log(`[BookingAgent] Smart seat selection: best scored → ${selectedSeats.join(', ')} (scores: ${scored.slice(0, numSeats).map(s => s.score).join(', ')})`);
  return { seats: selectedSeats, fallback: false, ageNote: ageNote || null };
}

// ═══════════════════════════════════════════════════════════════════════════════
//                         DATABASE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Verify schedule exists and get details
 */
async function verifySchedule(scheduleId) {
  const schedule = await dbGet(`
    SELECT 
      s.id, s.route_id, s.bus_id, s.departure_time, s.arrival_time,
      s.base_price, s.travel_date, s.available_seats,
      b.bus_name, b.bus_number, b.bus_type, b.total_seats, b.operator, b.rating, b.has_ac, b.is_sleeper,
      r.from_city, r.to_city, r.distance_km, r.duration_hours
    FROM schedules s
    JOIN buses b ON s.bus_id = b.id
    JOIN routes r ON s.route_id = r.id
    WHERE s.id = ?
  `, [scheduleId]);
  
  return schedule;
}

/**
 * Check if schedule is in the future
 */
function isScheduleInFuture(schedule) {
  const now = new Date();
  const travelDate = new Date(schedule.travel_date);
  const [hours, minutes] = schedule.departure_time.split(':').map(Number);
  travelDate.setHours(hours, minutes, 0, 0);
  return travelDate > now;
}

/**
 * Get already booked seats for a schedule
 */
async function getBookedSeats(scheduleId) {
  const bookings = await dbAll(`
    SELECT seat_numbers FROM bookings 
    WHERE schedule_id = ? AND booking_status IN ('confirmed', 'pending')
  `, [scheduleId]);
  
  const booked = [];
  for (const booking of bookings) {
    try {
      const seats = JSON.parse(booking.seat_numbers);
      booked.push(...seats);
    } catch (e) {
      // Handle non-JSON format
      booked.push(...booking.seat_numbers.split(',').map(s => s.trim()));
    }
  }
  return booked;
}

/**
 * Get locked seats (temporary holds)
 */
async function getLockedSeats(scheduleId) {
  const locks = await dbAll(`
    SELECT seat_number FROM seat_locks 
    WHERE schedule_id = ? AND expires_at > CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
  `, [scheduleId]);
  
  return locks.map(l => l.seat_number);
}

/**
 * Check for anomalies (suspicious booking patterns)
 */
async function detectAnomalies(userId, seatCount) {
  const anomalies = [];
  
  // Check 1: Too many seats in one booking
  if (seatCount > MAX_SEATS_PER_BOOKING) {
    anomalies.push({
      type: 'excessive_seats',
      message: `Maximum ${MAX_SEATS_PER_BOOKING} seats allowed per booking`,
      severity: 'block'
    });
  }
  
  // Check 2: Rate limiting - too many bookings in short time
  if (userId) {
    const recentBookings = await dbGet(`
      SELECT COUNT(*) as count FROM bookings 
      WHERE user_id = ? AND created_at > CURRENT_TIMESTAMP AT TIME ZONE 'UTC' - INTERVAL '1 hour'
    `, [userId]);
    
    if (recentBookings && recentBookings.count >= 5) {
      anomalies.push({
        type: 'rate_limit',
        message: 'Too many bookings in the last hour. Please wait.',
        severity: 'block'
      });
    }
  }
  
  return anomalies;
}

/**
 * Lock seats temporarily during booking
 */
async function lockSeats(scheduleId, seats, userId, sessionId = null) {
  const expiresAt = new Date(Date.now() + SEAT_LOCK_DURATION_MS).toISOString();
  
  for (const seat of seats) {
    await dbRun(`
      INSERT INTO seat_locks (schedule_id, seat_number, locked_by_user, session_id, expires_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (schedule_id, seat_number)
      DO UPDATE SET locked_by_user = EXCLUDED.locked_by_user, session_id = EXCLUDED.session_id, expires_at = EXCLUDED.expires_at
    `, [scheduleId, seat, userId, sessionId, expiresAt]);
  }
}

/**
 * Release seat locks
 */
async function releaseSeatlocks(scheduleId, seats) {
  for (const seat of seats) {
    await dbRun(`DELETE FROM seat_locks WHERE schedule_id = ? AND seat_number = ?`, [scheduleId, seat]);
  }
}

/**
 * Create booking record
 */
async function createBooking(scheduleId, userId, seats, passengerInfo, totalPrice, pnr) {
  const result = await dbRun(`
    INSERT INTO bookings (
      user_id, schedule_id, seat_numbers, passenger_name, 
      passenger_age, passenger_gender, total_price, booking_status, pnr
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)
  `, [
    userId,
    scheduleId,
    JSON.stringify(seats),
    passengerInfo.name || 'Guest',
    passengerInfo.age || null,
    passengerInfo.gender || null,
    totalPrice,
    pnr
  ]);
  
  return result.lastID;
}

// ═══════════════════════════════════════════════════════════════════════════════
//                         MAIN LANGGRAPH NODE FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Booking Validation Node - Main LangGraph node function
 */
async function bookingValidationNode(state) {
  const startTime = Date.now();
  const { taskId, inputData } = state;
  
  console.log(`\n[BookingAgent] Processing booking for task ${taskId}`);
  
  const traces = [];
  const addTrace = (type, content) => {
    traces.push({ agent: 'BookingAgent', type, content, timestamp: Date.now() });
  };
  
  try {
    // Extract booking parameters
    let scheduleId = inputData.scheduleId || inputData.schedule_id;
    const userId = inputData.userId || inputData.user_id;
    let seatInput = inputData.seats || inputData.seatNumbers || inputData.seat_numbers;
    const requestedSeatCount = inputData.numSeats || inputData.seatCount || inputData.passengerCount ||
      (Array.isArray(inputData.seatNumbers) ? inputData.seatNumbers.length : 1) || 1;
    const parsedBudget = Number(inputData.maxPrice ?? inputData.budgetCap ?? inputData.priceLimit);
    const budgetCap = Number.isFinite(parsedBudget) && parsedBudget > 0 ? parsedBudget : null;

    const parsedMinPrice = Number(inputData.minPrice);
    const minPriceLimit = Number.isFinite(parsedMinPrice) && parsedMinPrice > 0 ? parsedMinPrice : null;
    
    // ════════════════════════════════════════════════════════════════════════════
    // PASSENGER INFO: Use provided details, fallback to user account info
    // ENHANCED: Handle multiple passengers for group bookings
    // ════════════════════════════════════════════════════════════════════════════
    let passengerInfo = {
      name: inputData.passengerName || inputData.passenger_name || inputData.name || 
            (inputData.passengerDetails && inputData.passengerDetails.name),
      age: inputData.passengerAge || inputData.passenger_age || inputData.age ||
           (inputData.passengerDetails && inputData.passengerDetails.age),
      gender: inputData.passengerGender || inputData.passenger_gender || inputData.gender ||
              (inputData.passengerDetails && inputData.passengerDetails.gender)
    };

    if (passengerInfo.name && typeof passengerInfo.name === 'string') {
      passengerInfo.name = passengerInfo.name
        .replace(/\b(on|for)?\s*(today|tomorrow|yesterday|morning|afternoon|evening|night)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
    
    // Check for multiple passengers
    let passengersList = [];
    const hasMultipleNames = inputData.passengerDetails && inputData.passengerDetails.names && 
                            Array.isArray(inputData.passengerDetails.names);
    
    if (hasMultipleNames) {
      // Multiple passengers provided
      passengersList = inputData.passengerDetails.names.map(name => ({
        name: name,
        age: inputData.passengerDetails.age || null,
        gender: inputData.passengerDetails.gender || null
      }));
      console.log('[BookingAgent] Multiple passengers detected:', passengersList.map(p => p.name).join(', '));
      addTrace('observation', `Multiple passengers: ${passengersList.map(p => p.name).join(', ')}`);
    } else if (passengerInfo.name) {
      // Single passenger
      passengersList = [passengerInfo];
    }
    
    // If no passenger name(s) specified, use logged-in user's account name
    if (passengersList.length === 0 && userId) {
      addTrace('thought', 'No passenger name specified. Fetching user account details.');
      const userDetails = await getUserDetails(userId);
      if (userDetails && userDetails.username) {
        passengerInfo.name = userDetails.username;
        passengersList = [passengerInfo];
        addTrace('observation', `Using account name: ${userDetails.username}`);
      }
    }
    
    // Final fallback to 'Guest' if still no name
    if (passengersList.length === 0) {
      passengerInfo.name = 'Guest';
      passengersList = [passengerInfo];
    }
    
    // Use the first passenger as the primary passenger for legacy compatibility
    passengerInfo = passengersList[0];
    
    // ════════════════════════════════════════════════════════════════════════════
    // VALIDATION: Filter out seat numbers that match passenger age (common parsing error)
    // Skip this filter when user explicitly requested specific seats (explicitSeatRequested flag)
    // ════════════════════════════════════════════════════════════════════════════
    const explicitSeatFlag = inputData.explicitSeatRequested || false;
    if (seatInput && passengerInfo.age && !explicitSeatFlag) {
      const ageStr = String(passengerInfo.age);
      const filteredSeats = parseSeats(seatInput).filter(seat => {
        // Remove seats that exactly match the age number
        const seatNum = seat.replace(/[^0-9]/g, '');
        return seatNum !== ageStr;
      });
      
      // If all seats were filtered out (likely parsing error), clear seat input for auto-selection
      if (filteredSeats.length === 0 && parseSeats(seatInput).length > 0) {
        console.log(`[BookingAgent] Detected potential age/seat confusion. Clearing seat input for auto-selection.`);
        seatInput = null;
      } else if (filteredSeats.length < parseSeats(seatInput).length) {
        console.log(`[BookingAgent] Filtered out age-matching seat numbers. Remaining: ${filteredSeats.join(', ')}`);
        seatInput = filteredSeats;
      }
    } else if (explicitSeatFlag) {
      console.log(`[BookingAgent] User explicitly requested seats — skipping age/seat confusion filter.`);
    }
    
    // ════════════════════════════════════════════════════════════════════════════
    // SMART BOOKING: Auto-find schedule when only route info is provided
    // ════════════════════════════════════════════════════════════════════════════
    if (!scheduleId) {
      const fromCity = inputData.fromCity || inputData.from_city || inputData.from;
      const toCity = inputData.toCity || inputData.to_city || inputData.to;
      const travelDate = inputData.travelDate || inputData.travel_date || inputData.date;
      const userPreferences = inputData.preferences || {};
      const strictTimePreference = !!userPreferences.timeOfDay;
      const strictBusTypePreference = userPreferences.busType !== undefined || typeof userPreferences.hasAC === 'boolean';
      
      if (fromCity && toCity) {
        addTrace('thought', `No schedule ID provided. Searching for ${fromCity} → ${toCity}`);
        
        const candidateSchedules = await findCandidateSchedules(fromCity, toCity, travelDate, requestedSeatCount, budgetCap);
        const seatEligibleSchedules = candidateSchedules.filter(s => (s.available_seats || 0) >= requestedSeatCount);

        if (seatEligibleSchedules.length === 0) {
          const noSeatMessage = `No buses have at least ${requestedSeatCount} seat(s) available from ${fromCity} to ${toCity} on the selected date range.`;
          return {
            agentResults: { booking_validation: { success: false, error: noSeatMessage } },
            structuredData: { error: noSeatMessage, fromCity, toCity, requiredSeats: requestedSeatCount },
            finalResponse: noSeatMessage,
            halted: true,
            haltReason: noSeatMessage,
            traces,
            decisionTrail: [{ agent: 'BookingAgent', status: 'no_capacity', steps: traces.length, duration_ms: Date.now() - startTime }]
          };
        }

        let constrainedSchedules = seatEligibleSchedules;
        
        if (budgetCap !== null) {
          constrainedSchedules = constrainedSchedules.filter(s => Number(s.base_price) <= budgetCap);
        }
        
        if (minPriceLimit !== null) {
          constrainedSchedules = constrainedSchedules.filter(s => Number(s.base_price) >= minPriceLimit);
        }

        if (constrainedSchedules.length === 0) {
          if (minPriceLimit !== null && seatEligibleSchedules.some(s => Number(s.base_price) < minPriceLimit)) {
             const maxFare = Math.max(...seatEligibleSchedules.map(s => Number(s.base_price)));
             const budgetMessage = `No bus available above ₹${minPriceLimit} from ${fromCity} to ${toCity}. Maximum available fare is ₹${maxFare}.`;
             addTrace('observation', budgetMessage);
             return {
               agentResults: { booking_validation: { success: false, error: budgetMessage, maxFare, minPriceLimit } },
               structuredData: {
                 error: budgetMessage,
                 fromCity,
                 toCity,
                 minPriceLimit,
                 maxFare,
                 status: 'budget_unavailable'
               },
               finalResponse: budgetMessage,
               halted: true,
               haltReason: budgetMessage,
               traces,
               decisionTrail: [{ agent: 'BookingAgent', status: 'budget_unavailable', steps: traces.length, duration_ms: Date.now() - startTime }]
             };
          } else if (budgetCap !== null) {
            const minFare = Math.min(...seatEligibleSchedules.map(s => Number(s.base_price)));
            const budgetMessage = `No bus available under ₹${budgetCap} from ${fromCity} to ${toCity}. Minimum available fare is ₹${minFare}.`;
            addTrace('observation', budgetMessage);
            return {
              agentResults: { booking_validation: { success: false, error: budgetMessage, minFare, budgetCap } },
              structuredData: {
                error: budgetMessage,
                fromCity,
                toCity,
                budgetCap,
                minFare,
                status: 'budget_unavailable'
              },
              finalResponse: budgetMessage,
              halted: true,
              haltReason: budgetMessage,
              traces,
              decisionTrail: [{ agent: 'BookingAgent', status: 'budget_unavailable', steps: traces.length, duration_ms: Date.now() - startTime }]
            };
          }
        }

        const llmInference = await inferMissingPreferencesWithLLM({
          userMessage: inputData.userMessage || inputData.message || inputData.query || '',
          userPreferences,
          passengerInfo,
          routeContext: { fromCity, toCity, travelDate },
          candidates: constrainedSchedules
        });

        const preferences = llmInference.preferences || normalizeBookingPreferences(userPreferences);
        
        // Use LLM-extracted maxPrice if available and not already set explicitly
        if (llmInference.preferences && llmInference.preferences.maxPrice && budgetCap === null && minPriceLimit === null) {
          const llmMaxPrice = Number(llmInference.preferences.maxPrice);
          if (Number.isFinite(llmMaxPrice) && llmMaxPrice > 0) {
             console.log(`[BookingAgent] LLM extracted maxPrice: ₹${llmMaxPrice}`);
             addTrace('observation', `LLM extracted cost limit: Under ₹${llmMaxPrice}`);
             // We need to re-filter schedules if maxPrice was extracted by LLM
             const refinedSchedules = seatEligibleSchedules.filter(s => Number(s.base_price) <= llmMaxPrice);
             
             if (refinedSchedules.length === 0) {
               const minFare = Math.min(...seatEligibleSchedules.map(s => Number(s.base_price)));
               const budgetMessage = `No bus available under ₹${llmMaxPrice} from ${fromCity} to ${toCity}. Minimum available fare is ₹${minFare}.`;
               addTrace('observation', budgetMessage);
               return {
                 agentResults: { booking_validation: { success: false, error: budgetMessage, minFare, budgetCap: llmMaxPrice } },
                 structuredData: {
                   error: budgetMessage,
                   fromCity,
                   toCity,
                   budgetCap: llmMaxPrice,
                   minFare,
                   status: 'budget_unavailable'
                 },
                 finalResponse: budgetMessage,
                 halted: true,
                 haltReason: budgetMessage,
                 traces,
                 decisionTrail: [{ agent: 'BookingAgent', status: 'budget_unavailable', steps: traces.length, duration_ms: Date.now() - startTime }]
               };
             }
             // Update logic to use refined schedules
             constrainedSchedules.length = 0;
             constrainedSchedules.push(...refinedSchedules);
          }
        }
        
        inputData.preferences = preferences;

        let foundSchedule = null;
        if (llmInference.bestScheduleId) {
          foundSchedule = constrainedSchedules.find(s => s.id === llmInference.bestScheduleId) || null;
          if (foundSchedule) {
            addTrace('observation', `LLM selected best bus: ${foundSchedule.bus_name} (schedule ${foundSchedule.id})`);
          }
        }

        if (!foundSchedule) {
          foundSchedule = await findScheduleByRoute(fromCity, toCity, travelDate, preferences, {
            strictTimePreference,
            strictBusTypePreference,
            requiredSeats: requestedSeatCount,
            maxPrice: budgetCap,
            minPrice: minPriceLimit,
            preloadedSchedules: constrainedSchedules
          });
        }
        
        if (foundSchedule) {
          scheduleId = foundSchedule.id;
          addTrace('observation', `Found matching bus: ${foundSchedule.bus_name} (${foundSchedule.bus_type}) departing at ${foundSchedule.departure_time}, ₹${foundSchedule.base_price}`);
          if (llmInference.llmUsed) {
            addTrace('observation', `LLM preference completion: ${llmInference.reason}`);
          }
        } else {
          const suggestions = await getRouteSuggestions(fromCity, toCity);
          const suggestionLines = [];
          if (suggestions.fromCityOptions.length > 0) {
            suggestionLines.push(`From ${fromCity}, available destinations: ${suggestions.fromCityOptions.slice(0, 5).join(', ')}`);
          }
          if (suggestions.toCityOrigins.length > 0) {
            suggestionLines.push(`To ${toCity}, available origins: ${suggestions.toCityOrigins.slice(0, 5).join(', ')}`);
          }
          const detailMessage = suggestionLines.length > 0
            ? `${suggestionLines.join(' | ')}. Try one of these routes.`
            : 'Try another nearby city pair or ask for available routes.';
          const userMessage = budgetCap !== null
            ? `No bus available under ₹${budgetCap} from ${fromCity} to ${toCity} on the selected date range. ${detailMessage}`
            : `No buses available from ${fromCity} to ${toCity} on the selected date. ${detailMessage}`;

          addTrace('observation', 'No buses found for this route/date');
          return {
            agentResults: { booking_validation: { 
              success: false, 
              error: userMessage
            }},
            structuredData: { error: 'No buses available', fromCity, toCity, suggestions },
            finalResponse: userMessage,
            halted: true,
            haltReason: userMessage,
            traces,
            decisionTrail: [{ agent: 'BookingAgent', status: 'no_buses', steps: traces.length, duration_ms: Date.now() - startTime }]
          };
        }
      }
    }
    
    // ════════════════════════════════════════════════════════════════════════════
    // COMPLETE MISSING PREFERENCES WITH LLM (for seat and timing defaults)
    // Keep explicit user preferences untouched; fill only missing keys.
    // ════════════════════════════════════════════════════════════════════════════
    if (scheduleId) {
      const userPreferences = inputData.preferences || {};
      const needsCompletion = !userPreferences ||
        userPreferences.busType === undefined ||
        userPreferences.timeOfDay === undefined ||
        (userPreferences.window === undefined && userPreferences.aisle === undefined) ||
        userPreferences.position === undefined;

      if (needsCompletion) {
        const fallbackCandidates = [];
        const existingSchedule = await verifySchedule(scheduleId);
        if (existingSchedule) {
          fallbackCandidates.push({
            id: existingSchedule.id,
            bus_name: existingSchedule.bus_name,
            bus_type: existingSchedule.bus_type,
            has_ac: existingSchedule.has_ac,
            is_sleeper: existingSchedule.is_sleeper,
            departure_time: existingSchedule.departure_time,
            base_price: existingSchedule.base_price,
            rating: existingSchedule.rating,
            operator: existingSchedule.operator,
            available_seats: existingSchedule.available_seats
          });
        }

        const llmInference = await inferMissingPreferencesWithLLM({
          userMessage: inputData.userMessage || inputData.message || inputData.query || '',
          userPreferences,
          passengerInfo,
          routeContext: {
            fromCity: inputData.fromCity || inputData.from,
            toCity: inputData.toCity || inputData.to,
            travelDate: inputData.travelDate || inputData.date
          },
          candidates: fallbackCandidates
        });

        inputData.preferences = llmInference.preferences || normalizeBookingPreferences(userPreferences);
        if (llmInference.llmUsed) {
          addTrace('observation', `LLM completed missing preferences: ${llmInference.reason}`);
        }
      }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // SEAT SELECTION: Honor explicit seat requests; auto-select only when not specified
    // ════════════════════════════════════════════════════════════════════════════
    let seats = parseSeats(seatInput);
    const explicitSeatRequested = inputData.explicitSeatRequested || false;
    
    // Normalize seat format to S-prefixed (S1, S2, S3...) if user provided raw numbers
    if (seats.length > 0) {
      seats = seats.map(s => {
        const cleaned = s.trim().toUpperCase();
        if (/^S\d+$/.test(cleaned)) return cleaned; // Already S-prefixed
        const num = parseInt(cleaned.replace(/\D/g, ''));
        if (!isNaN(num) && num >= 1 && num <= 99) return `S${num}`;
        return cleaned;
      });
    }
    
    if (scheduleId && seats.length > 0 && explicitSeatRequested) {
      // USER EXPLICITLY REQUESTED SPECIFIC SEAT(S) — honor the request
      addTrace('thought', `User explicitly requested seat(s): ${seats.join(', ')}. Honoring specific seat selection.`);
      console.log(`[BookingAgent] User explicitly requested seats: ${JSON.stringify(seats)}`);
      
      // Verify the requested seats exist on this bus
      const schedule = await dbGet(`
        SELECT b.total_seats FROM schedules s
        JOIN buses b ON s.bus_id = b.id
        WHERE s.id = ?
      `, [scheduleId]);
      
      if (schedule) {
        const invalidSeats = seats.filter(s => {
          const num = parseInt(s.replace(/\D/g, ''));
          return num < 1 || num > schedule.total_seats;
        });
        
        if (invalidSeats.length > 0) {
          addTrace('observation', `Invalid seat(s): ${invalidSeats.join(', ')}. Bus has ${schedule.total_seats} seats (S1-S${schedule.total_seats}).`);
          return {
            agentResults: { booking_validation: { success: false, error: `Invalid seat(s): ${invalidSeats.join(', ')}. This bus has seats S1 to S${schedule.total_seats}.` }},
            structuredData: { error: 'Invalid seat number', invalidSeats },
            halted: true,
            haltReason: 'Invalid seat numbers',
            traces,
            decisionTrail: [{ agent: 'BookingAgent', status: 'invalid_seats', steps: traces.length, duration_ms: Date.now() - startTime }]
          };
        }

        // ════════════════════════════════════════════════════════════════════════
        // SEAT TYPE VALIDATION: Check if user's type preference matches actual seat type
        // 2+2 Layout: [Window(1)][Aisle(2)] | [Aisle(3)][Window(4)] per row of 4
        // ════════════════════════════════════════════════════════════════════════
        const seatPreferences = inputData.preferences || {};
        const requestedType = seatPreferences.window ? 'window' : (seatPreferences.aisle ? 'aisle' : null);
        
        if (requestedType) {
          const seatsPerRow = 4;
          const totalRows = Math.ceil(schedule.total_seats / seatsPerRow);
          
          const getSeatDetails = (seatId) => {
            const num = parseInt(seatId.replace(/\D/g, ''));
            const posInGroup = ((num - 1) % 4) + 1;
            const isWin = posInGroup === 1 || posInGroup === 4;
            const row = Math.ceil(num / seatsPerRow);
            const frontEnd = Math.ceil(totalRows / 3);
            const midEnd = Math.ceil(2 * totalRows / 3);
            let zone = 'Back';
            if (row <= frontEnd) zone = 'Front';
            else if (row <= midEnd) zone = 'Middle';
            return {
              seat: seatId,
              type: isWin ? 'window' : 'aisle',
              zone,
              row,
              position: posInGroup === 1 ? 'Left Window' : posInGroup === 2 ? 'Left Aisle' : posInGroup === 3 ? 'Right Aisle' : 'Right Window'
            };
          };
          
          // Check each requested seat against the preference
          const mismatchedSeats = [];
          for (const seat of seats) {
            const details = getSeatDetails(seat);
            if (details.type !== requestedType) {
              mismatchedSeats.push(details);
            }
          }
          
          if (mismatchedSeats.length > 0) {
            // Build a helpful seat map for the user
            const seatMapRows = [];
            for (let row = 1; row <= Math.min(totalRows, 10); row++) {
              const rowSeats = [];
              for (let col = 1; col <= 4; col++) {
                const seatNum = (row - 1) * 4 + col;
                if (seatNum <= schedule.total_seats) {
                  const posInGroup = ((seatNum - 1) % 4) + 1;
                  const isWin = posInGroup === 1 || posInGroup === 4;
                  rowSeats.push(`S${seatNum}(${isWin ? 'W' : 'A'})`);
                }
              }
              seatMapRows.push(`Row ${row}: ${rowSeats.slice(0, 2).join(' ')} | ${rowSeats.slice(2).join(' ')}`);
            }
            
            const mismatchList = mismatchedSeats.map(s => 
              `• **${s.seat}** is an **${s.type}** seat (${s.position}, ${s.zone} zone, Row ${s.row})`
            ).join('\n');
            
            // Suggest correct seats matching the preference
            const suggestedSeats = [];
            for (let i = 1; i <= schedule.total_seats && suggestedSeats.length < 4; i++) {
              const posInGroup = ((i - 1) % 4) + 1;
              const isWin = posInGroup === 1 || posInGroup === 4;
              if ((requestedType === 'window' && isWin) || (requestedType === 'aisle' && !isWin)) {
                suggestedSeats.push(`S${i}`);
              }
            }
            
            const errorMsg = `⚠️ **Seat Type Mismatch!**\n\nYou requested a **${requestedType}** seat, but:\n${mismatchList}\n\n**🗺️ Seat Layout (W=Window, A=Aisle):**\n${seatMapRows.slice(0, 5).join('\n')}\n...\n\n**💡 ${requestedType === 'window' ? 'Window' : 'Aisle'} seats:** ${suggestedSeats.join(', ')}, etc.\n\nPlease choose a correct ${requestedType} seat, or say "book ${requestedType} seat" to auto-select one.`;
            
            addTrace('observation', `Seat type mismatch: ${mismatchedSeats.map(s => `${s.seat} is ${s.type}`).join(', ')} but user wanted ${requestedType}`);
            
            return {
              agentResults: { booking_validation: { 
                success: false, 
                error: errorMsg,
                seatTypeMismatch: true,
                requestedType,
                actualSeats: mismatchedSeats,
                suggestedSeats
              }},
              structuredData: { 
                error: 'Seat type mismatch', 
                seatTypeMismatch: true,
                requestedType,
                mismatchedSeats,
                suggestedSeats
              },
              halted: true,
              haltReason: 'Seat type does not match preference',
              traces,
              decisionTrail: [{ agent: 'BookingAgent', status: 'seat_type_mismatch', steps: traces.length, duration_ms: Date.now() - startTime }]
            };
          }
        }
      }
      
      const seatNum = parseInt(seats[0].replace(/\D/g, ''));
      const isWindow = ((seatNum - 1) % 4) + 1 === 1 || ((seatNum - 1) % 4) + 1 === 4;
      const seatType = isWindow ? 'window' : 'aisle';
      addTrace('observation', `Using user-requested ${seatType} seat(s): ${seats.join(', ')}`);
    } else if (scheduleId && seats.length === 0) {
      // NO SEAT SPECIFIED — auto-select based on preferences (position + type)
      const seatPreferences = inputData.preferences || {};
      const posDesc = seatPreferences.position ? seatPreferences.position : 'any zone';
      const typeDesc = seatPreferences.window ? 'window' : (seatPreferences.aisle ? 'aisle' : 'best available');
      addTrace('thought', `No specific seat requested. Auto-selecting: zone=${posDesc}, type=${typeDesc}`);
      
      const numSeats = inputData.numSeats || inputData.seatCount || inputData.passengerCount || 1;
      const pAge = passengerInfo.age || null;
      console.log(`[BookingAgent] DEBUG: auto-selecting ${numSeats} seat(s) for schedule ${scheduleId} with preferences:`, seatPreferences, `age: ${pAge}`);
      const seatResult = await autoSelectSeat(scheduleId, numSeats, seatPreferences, pAge);
      console.log(`[BookingAgent] DEBUG: auto-selected result:`, JSON.stringify(seatResult));
      
      seats = seatResult.seats || [];
      
      if (seats.length === 0) {
        addTrace('observation', 'No seats available');
        return {
          agentResults: { booking_validation: { success: false, error: 'No seats available on this bus' }},
          structuredData: { error: 'No seats available' },
          halted: true,
          haltReason: 'No seats available',
          traces,
          decisionTrail: [{ agent: 'BookingAgent', status: 'no_seats', steps: traces.length, duration_ms: Date.now() - startTime }]
        };
      }
      
      // Indicate seat type
      const seatNum = parseInt(seats[0].replace(/\D/g, ''));
      const isWindow = ((seatNum - 1) % 4) + 1 === 1 || ((seatNum - 1) % 4) + 1 === 4;
      const seatType = isWindow ? 'window' : 'aisle';
      
      if (seatResult.fallback) {
        // Preferred seats were booked — inform user about fallback
        addTrace('observation', `⚠️ ${seatResult.fallbackReason} Selected ${seatType} seat(s): ${seats.join(', ')}`);
        if (seatResult.alternatives && seatResult.alternatives.length > 0) {
          const altList = seatResult.alternatives.map(a => `${a.seat} (${a.zone}, ${a.type})`).join(', ');
          addTrace('observation', `Other available options: ${altList}`);
        }
        // Store fallback info for display in the response
        inputData._seatFallbackInfo = {
          reason: seatResult.fallbackReason,
          alternatives: seatResult.alternatives || []
        };
      } else {
        addTrace('observation', `Auto-selected ${seatType} seat(s): ${seats.join(', ')}`);
      }
      
      // Add age-based reasoning note if available
      if (seatResult.ageNote) {
        addTrace('observation', seatResult.ageNote);
        inputData._ageBasedNote = seatResult.ageNote;
      }
    }
    
    addTrace('thought', `Booking ${seats.length} seat(s) on schedule ${scheduleId}`);
    
    // Validation 1: Required fields
    if (!scheduleId) {
      const guidance = 'Please provide route details like: "Book from Bangalore to Chennai tomorrow" or first search buses and then select a bus.';
      return {
        agentResults: { booking_validation: { success: false, error: 'Please specify a route (from city, to city) or select a bus' } },
        structuredData: { error: 'Missing route information' },
        finalResponse: guidance,
        halted: true,
        haltReason: guidance,
        traces,
        decisionTrail: [{ agent: 'BookingAgent', status: 'validation_error', steps: traces.length, duration_ms: Date.now() - startTime }]
      };
    }
    
    // Step 1: Anomaly detection
    addTrace('action', 'Running anomaly detection');
    const anomalies = await detectAnomalies(userId, seats.length);
    
    if (anomalies.some(a => a.severity === 'block')) {
      const blockingAnomaly = anomalies.find(a => a.severity === 'block');
      addTrace('observation', `Blocked: ${blockingAnomaly.message}`);
      return {
        agentResults: { booking_validation: { success: false, error: blockingAnomaly.message, anomaly: blockingAnomaly.type } },
        structuredData: { error: blockingAnomaly.message },
        halted: true,
        haltReason: blockingAnomaly.message,
        traces,
        decisionTrail: [{ agent: 'BookingAgent', status: 'blocked', steps: traces.length, duration_ms: Date.now() - startTime }]
      };
    }
    
    // Step 2: Verify schedule
    addTrace('action', 'Verifying schedule');
    const schedule = await verifySchedule(scheduleId);
    
    if (!schedule) {
      addTrace('observation', 'Schedule not found');
      return {
        agentResults: { booking_validation: { success: false, error: 'Schedule not found' } },
        structuredData: { error: 'Invalid schedule' },
        halted: true,
        haltReason: 'Schedule not found',
        traces,
        decisionTrail: [{ agent: 'BookingAgent', status: 'not_found', steps: traces.length, duration_ms: Date.now() - startTime }]
      };
    }
    
    // Step 3: Check if in future
    if (!isScheduleInFuture(schedule)) {
      addTrace('observation', 'Schedule has already departed');
      
      // Generate helpful suggestion message
      const { getLocalDateString } = require('../../../utils/dateUtils');
      const departureTime = schedule.departure_time;
      const travelDate = schedule.travel_date;
      const tomorrowObj = new Date(travelDate + 'T00:00:00');
      tomorrowObj.setDate(tomorrowObj.getDate() + 1);
      const tomorrowDate = getLocalDateString(tomorrowObj);
      
      const suggestionMessage = `⏰ **This bus has already departed**

**Bus:** ${schedule.bus_name}  
**Route:** ${schedule.from_city} → ${schedule.to_city}  
**Departure:** ${departureTime} on ${travelDate}

💡 **Try booking for tomorrow (${tomorrowDate})** or search for later buses today.

**Example:** "Book ${schedule.from_city} to ${schedule.to_city} tomorrow"`;
      
      return {
        agentResults: { booking_validation: { success: false, error: suggestionMessage } },
        structuredData: { error: 'Bus already departed', suggestion: 'Try tomorrow or later today' },
        finalResponse: suggestionMessage,  // Set finalResponse so orchestrator returns it
        halted: true,
        haltReason: 'Schedule expired',
        traces,
        decisionTrail: [{ agent: 'BookingAgent', status: 'expired', steps: traces.length, duration_ms: Date.now() - startTime }]
      };
    }

    if (budgetCap !== null && Number(schedule.base_price) > budgetCap) {
      const minFare = await findMinimumAvailableFare(
        schedule.from_city,
        schedule.to_city,
        schedule.travel_date,
        requestedSeatCount
      );
      const minFareText = Number.isFinite(minFare) ? ` Minimum available fare is ₹${minFare}.` : '';
      const overBudgetMessage = `No bus available under ₹${budgetCap} from ${schedule.from_city} to ${schedule.to_city}.${minFareText}`;
      addTrace('observation', overBudgetMessage);
      return {
        agentResults: { booking_validation: { success: false, error: overBudgetMessage, minFare, budgetCap } },
        structuredData: {
          error: overBudgetMessage,
          status: 'budget_unavailable',
          budgetCap,
          minFare,
          fromCity: schedule.from_city,
          toCity: schedule.to_city
        },
        finalResponse: overBudgetMessage,
        halted: true,
        haltReason: overBudgetMessage,
        traces,
        decisionTrail: [{ agent: 'BookingAgent', status: 'budget_unavailable', steps: traces.length, duration_ms: Date.now() - startTime }]
      };
    }

    if (minPriceLimit !== null && Number(schedule.base_price) < minPriceLimit) {
      const overBudgetMessage = `The selected bus fare (₹${schedule.base_price}) is below your requested minimum of ₹${minPriceLimit}.`;
      addTrace('observation', overBudgetMessage);
      return {
        agentResults: { booking_validation: { success: false, error: overBudgetMessage, minPriceLimit } },
        structuredData: {
          error: overBudgetMessage,
          status: 'budget_unavailable',
          minPriceLimit,
          fromCity: schedule.from_city,
          toCity: schedule.to_city
        },
        finalResponse: overBudgetMessage,
        halted: true,
        haltReason: overBudgetMessage,
        traces,
        decisionTrail: [{ agent: 'BookingAgent', status: 'budget_unavailable', steps: traces.length, duration_ms: Date.now() - startTime }]
      };
    }
    
    addTrace('observation', `Schedule valid: ${schedule.bus_name}, ${schedule.from_city} → ${schedule.to_city}`);
    
    // Step 4: Check seat availability
    addTrace('action', 'Checking seat availability');
    const bookedSeats = await getBookedSeats(scheduleId);
    const lockedSeats = await getLockedSeats(scheduleId);
    const unavailableSeats = [...new Set([...bookedSeats, ...lockedSeats])];
    
    console.log(`[BookingAgent] DEBUG: scheduleId=${scheduleId}, seats=${JSON.stringify(seats)}, booked=${JSON.stringify(bookedSeats)}, locked=${JSON.stringify(lockedSeats)}`);
    
    const conflictingSeats = seats.filter(s => unavailableSeats.includes(s));
    
    console.log(`[BookingAgent] DEBUG: unavailable=${JSON.stringify(unavailableSeats)}, conflicts=${JSON.stringify(conflictingSeats)}`);
    
    if (conflictingSeats.length > 0) {
      addTrace('observation', `Seats unavailable: ${conflictingSeats.join(', ')}`);
      return {
        agentResults: { 
          booking_validation: { 
            success: false, 
            error: `Seats already taken: ${conflictingSeats.join(', ')}`,
            unavailableSeats: conflictingSeats 
          } 
        },
        structuredData: { error: 'Some seats are unavailable', unavailableSeats: conflictingSeats },
        halted: true,
        haltReason: 'Seats unavailable',
        traces,
        decisionTrail: [{ agent: 'BookingAgent', status: 'seats_taken', steps: traces.length, duration_ms: Date.now() - startTime }]
      };
    }
    
    addTrace('observation', `All ${seats.length} seats available`);
    
    // Step 5: Lock seats
    addTrace('action', 'Locking seats');
    await lockSeats(scheduleId, seats, userId, inputData.sessionId || null);
    
    // Step 6: Calculate price
    const pricePerSeat = schedule.base_price;
    const totalPrice = pricePerSeat * seats.length;
    addTrace('observation', `Total price: ₹${totalPrice} (${seats.length} × ₹${pricePerSeat})`);
    
    // Step 7: Prepare pending booking (actual booking happens after payment)
    addTrace('action', 'Preparing booking for payment authorization');
    addTrace('observation', `Booking ready for payment. Amount: ₹${totalPrice}`);

    // Determine seat types for display
    const getSeatType = (seatNum) => {
      const num = parseInt(seatNum.replace(/\D/g, ''));
      const posInGroup = ((num - 1) % 4) + 1;
      return (posInGroup === 1 || posInGroup === 4) ? 'Window' : 'Aisle';
    };
    const seatTypes = seats.map(s => getSeatType(s));
    const hasWindowSeat = seatTypes.includes('Window');

    // Add seat zone info for display
    const seatsPerRow = 4;
    const totalRows = Math.ceil(schedule.total_seats / seatsPerRow);
    const getSeatZone = (seatId) => {
      const num = parseInt(seatId.replace(/\D/g, ''));
      const row = Math.ceil(num / seatsPerRow);
      const frontEnd = Math.ceil(totalRows / 3);
      const midEnd = Math.ceil(2 * totalRows / 3);
      if (row <= frontEnd) return 'Front';
      if (row <= midEnd) return 'Middle';
      return 'Back';
    };
    const seatZones = seats.map(s => getSeatZone(s));

    // Include fallback info if preferences didn't match
    const fallbackInfo = inputData._seatFallbackInfo || null;
    const ageBasedNote = inputData._ageBasedNote || null;

    // Build pending booking result (NOT yet confirmed — awaits payment)
    const result = {
      success: true,
      status: 'pending_payment',
      scheduleId,
      seats,
      seatTypes,
      totalPrice,
      pricePerSeat,
      passengerName: passengerInfo.name,
      passengers: passengersList,  // Include ALL passengers for multi-booking
      multiplePassengers: passengersList.length > 1,
      busDetails: {
        name: schedule.bus_name,
        type: schedule.bus_type,
        operator: schedule.operator,
        rating: schedule.rating || 4.0,
        hasAC: schedule.has_ac,
        isSleeper: schedule.is_sleeper
      },
      journeyDetails: {
        from: schedule.from_city,
        to: schedule.to_city,
        date: schedule.travel_date,
        departure: schedule.departure_time,
        arrival: schedule.arrival_time,
        distance: schedule.distance_km,
        duration: schedule.duration_hours
      },
      preferences: {
        windowSeat: hasWindowSeat,
        timeOfDay: inputData.preferences?.timeOfDay || null,
        position: inputData.preferences?.position || null
      }
    };

    // Clean passenger names in list
    const cleanPassengerName = (nameStr) => {
      if (!nameStr || typeof nameStr !== 'string') return 'Guest';
      return nameStr.replace(/\b(on|for)?\s*(today|tomorrow|yesterday|morning|afternoon|evening|night)\b/gi, '').replace(/\s+/g, ' ').trim();
    };

    const sanitizedPassengersList = passengersList.map(p => ({
      ...p,
      name: cleanPassengerName(p.name)
    }));

    result.passengerName = cleanPassengerName(passengerInfo.name);
    result.passengers = sanitizedPassengersList;

    // Assign seat numbers to passengers (one seat per passenger)
    // Each passenger gets a unique seat with their details
    const passengersWithSeats = sanitizedPassengersList.map((p, index) => ({
      ...p,
      seatNumber: seats[index] || seats[0], // Assign seats in order, or use first seat as fallback
      seat: seats[index] || seats[0] // Include both for compatibility
    }));

    // DEBUG: Log what we're actually returning
    console.log('[BookingAgent] Returning:', JSON.stringify({
      seats: result.seats,
      passengersWithSeats: passengersWithSeats.map(p => `${p.name} → ${p.seatNumber}`),
      multiplePassengers: passengersList.length > 1,
      totalPrice: result.totalPrice
    }, null, 2));
    
    return {
      agentResults: { booking_validation: result },
      structuredData: {
        status: 'pending_payment',
        pendingBooking: {
          scheduleId,
          seats,
          seatTypes,
          seatZones,
          totalPrice,
          pricePerSeat,
          passengerName: passengerInfo.name,
          passengers: passengersWithSeats,  // Include ALL passengers with seat assignments
          multiplePassengers: passengersList.length > 1,
          passengerAge: passengerInfo.age || null,
          passengerGender: passengerInfo.gender || null,
          busName: schedule.bus_name,
          busNumber: schedule.bus_number || schedule.bus_type,
          fromCity: schedule.from_city,
          toCity: schedule.to_city,
          travelDate: schedule.travel_date,
          departureTime: schedule.departure_time,
          arrivalTime: schedule.arrival_time
        },
        journey: result.journeyDetails,
        bus: result.busDetails,
        preferences: result.preferences,
        passenger: {
          name: passengerInfo.name,
          age: passengerInfo.age || null,
          gender: passengerInfo.gender || null
        },
        passengers: passengersWithSeats,  // All passengers list with seats
        seatFallback: fallbackInfo,
        ageBasedNote: ageBasedNote
      },
      traces,
      decisionTrail: [{ agent: 'BookingAgent', status: 'pending_payment', steps: traces.length, duration_ms: Date.now() - startTime }]
    };
    
  } catch (error) {
    console.error(`[BookingAgent] Error: ${error.message}`);
    addTrace('error', error.message);
    
    return {
      agentResults: { booking_validation: { success: false, error: error.message } },
      structuredData: { error: error.message },
      traces,
      error: error.message,
      decisionTrail: [{ agent: 'BookingAgent', status: 'error', steps: traces.length, duration_ms: Date.now() - startTime }]
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//                                   EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  bookingValidationNode,
  bookingValidationNode_internal: {
    generatePNR,
    generateUniquePNR,
    verifySchedule,
    detectAnomalies,
    getBookedSeats,
    lockSeats
  }
};
