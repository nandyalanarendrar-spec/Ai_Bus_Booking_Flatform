/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                     KNOWLEDGE AGENT (CORE AGENT #4)                          ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  PURPOSE: Answer FAQs and general queries about the bus service            ║
 * ║  USES LLM: Yes - for questions not in knowledge base                        ║
 * ║  DATABASE: Read-only via dbUtils (async PostgreSQL)                         ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  FLOW: START → knowledgeNode → conversationalNode → END                     ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

const { dbAll } = require('../../dbUtils');
const llm = require('../llmService');

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// ═══════════════════════════════════════════════════════════════════════════════
//                              KNOWLEDGE BASE
// Pre-built answers for common FAQs
// ═══════════════════════════════════════════════════════════════════════════════

const KNOWLEDGE_BASE = {
  
  booking_help: {
    keywords: ['how to book', 'book ticket', 'booking process', 'make reservation', 'reserve seat', 'booking steps', 'book a seat', 'how do i book'],
    answer: `**📋 How to Book a Bus Ticket (Step-by-Step):**

1️⃣ **Select Source & Destination**
   • Enter your starting city and destination city

2️⃣ **Choose Travel Date**
   • Select your preferred travel date from the calendar

3️⃣ **Select Preferred Bus**
   • Compare buses by price, timing, rating, and type
   • Choose AC/Non-AC, Seater/Sleeper as per your comfort

4️⃣ **Choose Your Seat**
   • View the seat layout
   • Select available seat (window/aisle, upper/lower deck)

5️⃣ **Enter Passenger Details**
   • Provide name, age, gender, and contact information
   • Verify mobile number and email

6️⃣ **Make Payment**
   • Choose from: Credit/Debit Cards, UPI, Net Banking, Wallets
   • Complete secure payment

7️⃣ **Receive Booking Confirmation**
   • Get your unique PNR code via SMS and Email
   • Download your e-ticket

**💡 Tip:** Book in advance for better seat selection and lower prices!`,
    category: 'booking'
  },
  
  cancellation_policy: {
    keywords: ['cancel', 'cancellation', 'refund policy', 'cancel ticket', 'cancellation charges', 'how to cancel', 'cancel booking', 'cancellation steps'],
    answer: `**📋 How to Cancel a Ticket (Step-by-Step):**

1️⃣ **Open the App/Website**
   • Log in to your account

2️⃣ **Go to My Bookings**
   • Find your active bookings list

3️⃣ **Select the Ticket**
   • Choose the booking you want to cancel
   • Verify the PNR and journey details

4️⃣ **Click Cancel Ticket**
   • Review the cancellation charges
   • See expected refund amount

5️⃣ **Confirm Cancellation**
   • Click "Confirm" to proceed

6️⃣ **Refund Processing**
   • Refund will be processed as per policy
   • Receive confirmation via SMS/Email

━━━━━━━━━━━━━━━━━━━━━━━━━━━
**💰 Cancellation Charges:**

| Time Before Departure | Refund Amount |
|----------------------|---------------|
| More than 24 hours   | 90% refund    |
| 12-24 hours          | 75% refund    |
| 6-12 hours           | 50% refund    |
| 2-6 hours            | 25% refund    |
| Less than 2 hours    | No refund     |

⚠️ **Note:** No cancellation allowed within 2 hours of departure.`,
    category: 'cancellation'
  },
  
  refund_process: {
    keywords: ['refund', 'money back', 'get refund', 'refund time', 'when refund'],
    answer: `**Refund Process:**

After cancellation, your refund will be processed within:
- **UPI/Cards**: 3-5 business days
- **Net Banking**: 5-7 business days
- **Wallets**: Instant to 24 hours

The refund amount depends on how early you cancel (see cancellation policy).`,
    category: 'refund'
  },
  
  bus_types: {
    keywords: ['bus type', 'ac bus', 'sleeper', 'seater', 'volvo', 'non ac'],
    answer: `**Bus Types Available:**

| Type | Description |
|------|-------------|
| **AC Seater** | Air-conditioned with push-back seats |
| **AC Sleeper** | AC with flat sleeping berths |
| **Non-AC Seater** | Standard seating, budget-friendly |
| **Non-AC Sleeper** | Sleeping berths without AC |
| **Semi-Sleeper** | Reclining seats (more than seater) |

AC buses cost more but offer better comfort for long journeys.`,
    category: 'buses'
  },
  
  seat_layout: {
    keywords: ['seat layout', 'seat map', 'seat position', 'window seat', 'upper deck', 'lower deck'],
    answer: `**Seat Layout Information:**

**Seater Buses:**
- 2+2 or 2+1 configuration
- Window (W) and Aisle (A) seats
- Seat numbers: A1-A20, B1-B20

**Sleeper Buses:**
- Upper deck (U): More privacy, can feel movement
- Lower deck (L): Easier access, less motion
- Single and double berths available

Choose lower deck if you prefer easier access or have mobility concerns.`,
    category: 'seats'
  },
  
  baggage_policy: {
    keywords: ['luggage', 'baggage', 'bag', 'carry', 'weight limit'],
    answer: `**Baggage Policy:**

- **Free allowance**: 15 kg per passenger
- **Excess baggage**: ₹50 per additional 5 kg
- **Carry-on**: 1 small bag (laptop bag/purse)

**Not Allowed:**
- Flammable materials
- Pets (unless certified service animals)
- Oversized items (bicycles, furniture)

Large luggage goes in the bus compartment below.`,
    category: 'baggage'
  },
  
  contact_support: {
    keywords: ['contact', 'support', 'help', 'customer care', 'phone number', 'email'],
    answer: `**📞 Contact Support:**

• **Phone**: 1800-XXX-XXXX (Toll-free, 24/7)
• **Email**: support@busgo.com
• **Live Chat**: Available on website/app
• **WhatsApp**: +91-XXXXX-XXXXX

**Support Hours:** 24/7 for urgent issues

For booking issues, please have your PNR ready.`,
    category: 'support'
  },
  
  app_info: {
    keywords: ['about app', 'app information', 'app feature', 'what can app', 'what can this', 'tell me about', 'about this service', 'features', 'what do you do', 'what can you do'],
    answer: `**🚌 BusGo - Your Travel Companion**

**✨ Key Features:**
• Real-time seat availability tracking
• Multiple payment options (Cards, UPI, Wallets)
• Instant e-ticket generation with PNR
• Live bus tracking (coming soon)
• 24/7 customer support

**📱 What You Can Do:**
• Search buses between 9+ major cities
• Compare prices, timings, and bus types
• Choose your preferred seat
• Book, modify, or cancel tickets
• View booking history

**🎯 Booking Process:**
1. Search → 2. Select Bus → 3. Choose Seat → 4. Enter Details → 5. Pay → 6. Get PNR

**❌ Cancellation Policy:**
• Cancel anytime up to 2 hours before departure
• Refund: 90% (>24h), 75% (12-24h), 50% (6-12h), 25% (2-6h)

**📞 Customer Support:**
• Phone: 1800-XXX-XXXX (Toll-free, 24/7)
• Email: support@busgo.com`,
    category: 'app_info'
  },
  
  pnr_info: {
    keywords: ['pnr', 'booking number', 'ticket number', 'booking id', 'reference'],
    answer: `**What is PNR?**

PNR (Passenger Name Record) is your unique 8-character booking reference code (e.g., BG7X9K2M).

**Use it to:**
- Track your booking status
- Check-in at the boarding point
- Cancel or modify bookings
- Contact support about your trip

Find your PNR in your booking confirmation email/SMS.`,
    category: 'pnr'
  },
  
  boarding: {
    keywords: ['boarding', 'pickup', 'where to board', 'boarding point', 'bus stop'],
    answer: `**Boarding Information:**

- Board at least **15 minutes before** departure
- Carry your **PNR and ID proof**
- Exact pickup location is in your booking confirmation
- Driver contact will be shared 2 hours before departure

If you miss the bus, no refund is available. Contact support immediately if you're running late.`,
    category: 'boarding'
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//                              HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Match query to knowledge base
 */
function matchKnowledgeBase(query) {
  const normalizedQuery = query.toLowerCase();
  
  let bestMatch = null;
  let bestScore = 0;
  
  for (const [key, entry] of Object.entries(KNOWLEDGE_BASE)) {
    let score = 0;
    
    for (const keyword of entry.keywords) {
      if (normalizedQuery.includes(keyword)) {
        score += keyword.split(' ').length; // Multi-word matches score higher
      }
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = { key, ...entry };
    }
  }
  
  return bestScore > 0 ? bestMatch : null;
}

/**
 * Get available routes from database
 */
async function getAvailableRoutes() {
  const routes = await dbAll(`
    SELECT DISTINCT from_city, to_city, distance_km, duration_hours 
    FROM routes 
    ORDER BY from_city, to_city
  `);
  
  return routes;
}

/**
 * Get specific route information between two cities
 */
async function getRouteInfo(fromCity, toCity) {
  const route = await dbAll(`
    SELECT from_city, to_city, distance_km, duration_hours 
    FROM routes 
    WHERE LOWER(from_city) = LOWER(?) AND LOWER(to_city) = LOWER(?)
  `, [fromCity, toCity]);
  
  return route.length > 0 ? route[0] : null;
}

/**
 * Get all buses with details
 */
async function getAllBuses() {
  const buses = await dbAll(`
    SELECT 
      id, bus_number, bus_name, bus_type, has_ac, is_sleeper, 
      total_seats, operator, rating
    FROM buses 
    ORDER BY rating DESC
  `);
  return buses;
}

/**
 * Get buses on a specific route with availability
 */
async function getBusesOnRoute(fromCity, toCity, date) {
  const { getLocalDateString } = require('../../../utils/dateUtils');
  const targetDate = date || getLocalDateString();
  
  const getCityVariants = (c) => {
    const norm = normalizeCity(c);
    if (norm === 'anantapur') return ['anantapur', 'ananthapuram', 'ananthapur', 'anantapuram'];
    return [c, norm];
  };

  const fromVars = getCityVariants(fromCity);
  const toVars = getCityVariants(toCity);

  const fromClauses = fromVars.map(() => 'LOWER(r.from_city) LIKE ?').join(' OR ');
  const toClauses = toVars.map(() => 'LOWER(r.to_city) LIKE ?').join(' OR ');

  const buses = await dbAll(`
    SELECT 
      s.id as schedule_id, s.departure_time, s.arrival_time, s.base_price, s.travel_date, s.available_seats,
      b.bus_name, b.bus_type, b.has_ac, b.is_sleeper, b.total_seats, b.operator, b.rating,
      r.from_city, r.to_city, r.distance_km, r.duration_hours
    FROM schedules s
    JOIN buses b ON s.bus_id = b.id
    JOIN routes r ON s.route_id = r.id
    WHERE (${fromClauses}) AND (${toClauses})
      AND s.travel_date >= ?
      AND s.available_seats > 0
    ORDER BY s.travel_date ASC, s.departure_time ASC
    LIMIT 100
  `, [...fromVars.map(v => `%${v}%`), ...toVars.map(v => `%${v}%`), targetDate]);
  
  return buses;
}

/**
 * Get seat availability statistics for a route
 */
async function getSeatAvailabilityStats(fromCity, toCity) {
  const stats = await dbAll(`
    SELECT 
      s.travel_date,
      COUNT(s.id) as bus_count,
      SUM(s.available_seats) as total_available,
      SUM(b.total_seats) as total_capacity,
      ROUND(CAST(100.0 * SUM(s.available_seats) / SUM(b.total_seats) AS numeric), 1) as availability_percent,
      MIN(s.base_price) as min_price,
      MAX(s.base_price) as max_price,
      ROUND(CAST(AVG(s.base_price) AS numeric), 0) as avg_price
    FROM schedules s
    JOIN buses b ON s.bus_id = b.id
    JOIN routes r ON s.route_id = r.id
    WHERE LOWER(r.from_city) LIKE ? AND LOWER(r.to_city) LIKE ?
      AND s.travel_date >= CURRENT_DATE
    GROUP BY s.travel_date
    ORDER BY s.travel_date ASC
    LIMIT 7
  `, [`%${fromCity.toLowerCase()}%`, `%${toCity.toLowerCase()}%`]);
  
  return stats;
}

/**
 * Get overall system statistics
 */
async function getSystemStats() {
  const routeCount = await dbAll('SELECT COUNT(*) as count FROM routes');
  const busCount = await dbAll('SELECT COUNT(*) as count FROM buses');
  const scheduleCount = await dbAll("SELECT COUNT(*) as count FROM schedules WHERE travel_date >= date('now')");
  const bookingCount = await dbAll("SELECT COUNT(*) as count FROM bookings WHERE booking_status = 'confirmed'");
  
  return {
    totalRoutes: routeCount[0]?.count || 0,
    totalBuses: busCount[0]?.count || 0,
    activeSchedules: scheduleCount[0]?.count || 0,
    totalBookings: bookingCount[0]?.count || 0
  };
}

/**
 * Extract city names from travel time query
 */
function normalizeCity(city) {
  const aliases = {
    'vizag': 'visakhapatnam', 'tirupathi': 'tirupati', 'bengaluru': 'bangalore',
    'mysuru': 'mysore', 'cochin': 'kochi', 'bombay': 'mumbai', 'madras': 'chennai',
    'calcutta': 'kolkata', 'thiruvananthapuram': 'trivandrum', 'ananthapuram': 'anantapur',
    'bhimavaram': 'bhimavaram'
  };
  return aliases[city.toLowerCase()] || city.toLowerCase();
}

function extractCitiesFromQuery(query) {
  const q = query.toLowerCase().trim();

  // Known cities — order matters: longer names first to avoid partial matches
  const knownCities = [
    'visakhapatnam', 'thiruvananthapuram', 'ananthapuram', 'anantapur',
    'trivandrum', 'vijayawada', 'bhimavaram', 'bangalore', 'bengaluru', 'hyderabad',
    'tirupathi', 'tirupati', 'coimbatore', 'mangalore', 'chandigarh',
    'ahmedabad', 'kolkata', 'calcutta', 'bombay', 'lucknow',
    'chennai', 'mumbai', 'mysuru', 'mysore', 'nagpur', 'indore',
    'bhopal', 'kurnool', 'nellore', 'guntur', 'kadapa', 'jaipur',
    'cochin', 'kochi', 'patna', 'surat', 'delhi', 'vizag', 'pune', 'goa'
  ];

  // Helper: strip stop-words and return the first matching known city
  function findCity(raw) {
    if (!raw) return null;
    const cleaned = raw.trim().toLowerCase();
    // Direct match first
    const direct = knownCities.find(c => c === cleaned);
    if (direct) return normalizeCity(direct);
    // Check if raw starts with a known city (e.g. "hyderabad in" → "hyderabad")
    const startMatch = knownCities.find(c => cleaned.startsWith(c));
    if (startMatch) return normalizeCity(startMatch);
    // Check if any known city is contained within raw
    const contained = knownCities.find(c => cleaned.includes(c));
    if (contained) return normalizeCity(contained);
    return null;
  }

  // Strategy 1: "from <city> to <city>" — most reliable
  const fromToMatch = q.match(/from\s+(\S+(?:\s+\S+)?)\s+to\s+(\S+(?:\s+\S+)?)/i);
  if (fromToMatch) {
    const from = findCity(fromToMatch[1]);
    const to   = findCity(fromToMatch[2]);
    if (from && to) return { from, to };
    if (from || to) {
      // One matched — scan fallback for the other
      const all = knownCities.filter(c => q.includes(c)).map(c => normalizeCity(c));
      const other = all.find(c => c !== from && c !== to);
      if (from && other) return { from, to: other };
      if (to   && other) return { from: other, to };
    }
  }

  // Strategy 2: "between <city> and <city>"
  const betweenMatch = q.match(/between\s+(\S+(?:\s+\S+)?)\s+and\s+(\S+(?:\s+\S+)?)/i);
  if (betweenMatch) {
    const from = findCity(betweenMatch[1]);
    const to   = findCity(betweenMatch[2]);
    if (from && to) return { from, to };
  }

  // Strategy 3: "<city> to <city>" (no 'from')
  const directToMatch = q.match(/\b(\S+(?:\s+\S+)?)\s+to\s+(\S+(?:\s+\S+)?)\b/i);
  if (directToMatch) {
    const from = findCity(directToMatch[1]);
    const to   = findCity(directToMatch[2]);
    if (from && to) return { from, to };
  }

  // Strategy 4: Scan entire query for any two known city mentions (positional order)
  const found = [];
  for (const city of knownCities) {
    const idx = q.indexOf(city);
    if (idx !== -1 && !found.some(f => f.city === normalizeCity(city))) {
      found.push({ city: normalizeCity(city), idx });
    }
  }
  found.sort((a, b) => a.idx - b.idx);
  if (found.length >= 2) {
    return { from: found[0].city, to: found[1].city };
  }

  return null;
}


/**
 * Check if query is asking about travel time/duration
 */
function isTravelTimeQuery(query) {
  const normalizedQuery = query.toLowerCase();
  const travelTimeKeywords = [
    'how long', 'how much time', 'time required', 'travel time', 
    'duration', 'hours', 'how many hours', 'time to travel',
    'time taken', 'journey time', 'trip duration'
  ];
  
  return travelTimeKeywords.some(keyword => normalizedQuery.includes(keyword));
}

/**
 * Check if query is asking about ALL routes (not a specific city-to-city route)
 * If the query mentions specific cities (e.g., "routes from hyderabad to vijayawada"),
 * this returns false so the city-specific handler can process it instead.
 */
function isRouteListQuery(query) {
  const normalizedQuery = query.toLowerCase();
  
  // Check if specific cities are mentioned — if so, this is NOT a "list all routes" query
  const cities = ['hyderabad', 'vijayawada', 'bangalore', 'chennai', 'mumbai', 'pune', 'delhi', 'jaipur', 'tirupati', 'tirupathi'];
  const mentionedCities = cities.filter(c => normalizedQuery.includes(c));
  const hasFromTo = /from\s+\w+\s+to\s+\w+/.test(normalizedQuery) || 
                    (normalizedQuery.includes(' to ') && mentionedCities.length >= 2);
  
  // If user mentions specific cities with "from" and "to", it's a specific route query, not a list-all query
  if (hasFromTo || mentionedCities.length >= 2) {
    return false;
  }
  
  const routeKeywords = [
    'all route', 'all bus route', 'available route', 'list route',
    'show route', 'give route', 'bus route', 'which route',
    'what route', 'routes available', 'route list', 'all the route',
    'total route', 'how many route'
  ];
  
  return routeKeywords.some(keyword => normalizedQuery.includes(keyword)) ||
         (normalizedQuery.includes('route') && (normalizedQuery.includes('all') || normalizedQuery.includes('list') || normalizedQuery.includes('show') || normalizedQuery.includes('give') || normalizedQuery.includes('total')));
}

/**
 * Check if query is asking about bus details
 */
function isBusDetailQuery(query) {
  const normalizedQuery = query.toLowerCase();
  const busKeywords = [
    'bus detail', 'all bus', 'list bus', 'show bus', 'available bus',
    'bus info', 'bus information', 'which bus', 'what bus',
    'bus type', 'types of bus', 'bus available', 'total bus',
    'how many bus', 'give bus', 'tell bus'
  ];
  
  return busKeywords.some(keyword => normalizedQuery.includes(keyword)) ||
         (normalizedQuery.includes('bus') && (normalizedQuery.includes('detail') || normalizedQuery.includes('list') || normalizedQuery.includes('all') || normalizedQuery.includes('available') || normalizedQuery.includes('info')));
}

/**
 * Check if query is about seat availability
 */
function isSeatAvailabilityQuery(query) {
  const normalizedQuery = query.toLowerCase();
  const keywords = [
    'seat avail', 'available seat', 'how many seat', 'seat left',
    'seat booking', 'booking chance', 'availability', 'seats on',
    'seat status', 'check seat', 'seat count'
  ];
  
  return keywords.some(keyword => normalizedQuery.includes(keyword));
}

/**
 * Check if query is about distances
 */
function isDistanceQuery(query) {
  const normalizedQuery = query.toLowerCase();
  const keywords = [
    'distance', 'how far', 'km between', 'kilometers', 'how many km',
    'route distance', 'total distance'
  ];
  
  return keywords.some(keyword => normalizedQuery.includes(keyword));
}

/**
 * Check if query is about timings
 */
function isTimingQuery(query) {
  const normalizedQuery = query.toLowerCase();
  const keywords = [
    'timing', 'departure time', 'arrival time', 'bus timing',
    'schedule', 'when does', 'what time', 'bus time', 'time table',
    'timetable', 'bus schedule'
  ];
  
  return keywords.some(keyword => normalizedQuery.includes(keyword));
}

/**
 * Check if query is about number/count of buses
 */
function isBusCountQuery(query) {
  const normalizedQuery = query.toLowerCase();
  const keywords = [
    'how many bus', 'total bus', 'number of bus', 'count of bus',
    'buses available', 'bus count', 'how many options', 'total options',
    'buses running', 'buses operating'
  ];
  
  return keywords.some(keyword => normalizedQuery.includes(keyword));
}

/**
 * Check if query is about app/service information
 */
function isAppInfoQuery(query) {
  const normalizedQuery = query.toLowerCase();
  const keywords = [
    'about app', 'about this app', 'app feature', 'app info',
    'what is this', 'what can you do', 'what do you do', 'what features',
    'tell me about', 'about your', 'about service', 'this service',
    'what can app', 'capabilities', 'how does this work'
  ];
  
  return keywords.some(keyword => normalizedQuery.includes(keyword));
}

/**
 * Check if query is about fares/prices
 */
function isFareQuery(query) {
  const q = query.toLowerCase();

  // ── 1. KEYWORD-BASED DETECTION ──────────────────────────────────────────────
  const keywords = [
    // minimum / min
    'minimum', 'minimum fare', 'minimum price', 'minimum cost', 'minimum amount',
    'minimum ticket', 'minimum charge', 'min fare', 'min price', 'min cost',
    'min amount', 'min ticket', 'minimum to book', 'minimum to travel',
    // maximum / max
    'maximum', 'maximum fare', 'maximum price', 'maximum cost', 'maximum amount',
    'maximum ticket', 'maximum charge', 'max fare', 'max price', 'max cost',
    'max amount', 'max ticket', 'maximum to book', 'maximum to travel',
    // above / higher
    'above', 'above price', 'above fare', 'higher than', 'more than',
    'above the price', 'above the fare', 'above the cost', 'more expensive',
    'higher price', 'higher fare', 'higher cost', 'highest price', 'highest fare',
    // below / lower
    'below', 'below price', 'below fare', 'lower than', 'less than',
    'below the price', 'below the fare', 'below the cost', 'less expensive',
    'lower price', 'lower fare', 'lower cost', 'lowest price', 'lowest fare',
    // between / in between / range
    'between', 'in between', 'in-between', 'between the price', 'between the fare',
    'price between', 'fare between', 'cost between', 'amount between',
    'price range', 'fare range', 'cost range', 'range of price', 'range of fare',
    'range of cost', 'what is the range', 'price from', 'fare from',
    // how much
    'how much', 'how much is', 'how much does', 'how much will', 'how much for',
    'how much to', 'how much does it cost', 'how much is the ticket',
    'how much is a ticket', 'how much for a ticket', 'how much for ticket',
    'how much to travel', 'how much to book', 'how much is the fare',
    // what is the price/cost/fare
    'what is the price', 'what is the fare', 'what is the cost',
    'what is the charge', 'what is the amount', 'what is the rate',
    'what is the ticket', 'what\'s the price', 'what\'s the fare',
    'what\'s the cost', 'whats the price', 'whats the fare', 'whats the cost',
    // tell me
    'tell me the price', 'tell me the fare', 'tell me the cost',
    'tell me the charge', 'tell me the amount', 'tell me minimum',
    'tell me maximum', 'tell me the minimum', 'tell me the maximum',
    // cheapest / affordable
    'cheapest', 'cheap ticket', 'cheap bus', 'cheap fare', 'cheap travel',
    'most affordable', 'affordable', 'budget travel', 'budget ticket',
    'budget bus', 'economy', 'economy ticket', 'low cost', 'low price',
    'low fare', 'low budget', 'best price', 'best fare', 'best deal',
    // expensive / premium
    'expensive', 'most expensive', 'costly', 'premium price', 'premium fare',
    'luxury ticket', 'highest ticket',
    // general fare/price/cost words
    'fare', 'ticket price', 'ticket cost', 'ticket charge', 'ticket amount',
    'ticket rate', 'bus fare', 'bus price', 'bus cost', 'bus charge',
    'travel fare', 'travel cost', 'travel price', 'travel charge',
    'price to travel', 'cost to travel', 'fare to travel', 'charge to travel',
    'cost to book', 'price to book', 'amount to book', 'charge to book',
    'seat cost', 'seat price', 'seat fare', 'seat charge', 'seat amount',
    'cost of ticket', 'price of ticket', 'cost of travel', 'price of travel',
    'how much does it cost', 'what does it cost', 'what does it charge',
    // spending / paying
    'spend', 'how much to spend', 'need to spend', 'need to spent',
    'spent to travel', 'spend to travel', 'how much will i spend',
    'how much to pay', 'how much will i pay', 'payment amount',
    // charges
    'charge', 'charges', 'what are the charges', 'what is the charge',
    'booking charge', 'booking charges', 'booking cost', 'booking price'
  ];

  if (keywords.some(kw => q.includes(kw))) return true;

  // ── 2. PATTERN-BASED DETECTION (regex fallback) ─────────────────────────────
  const patterns = [
    /price.*ticket/i,
    /ticket.*price/i,
    /cost.*travel/i,
    /travel.*cost/i,
    /fare.*bus/i,
    /bus.*fare/i,
    /how\s+much.*(ticket|bus|travel|seat|book)/i,
    /(ticket|bus|travel|seat|book).*how\s+much/i,
    /(minimum|maximum|lowest|highest|cheapest|expensive).*(ticket|fare|price|cost|bus)/i,
    /(ticket|fare|price|cost|bus).*(minimum|maximum|lowest|highest|cheapest|expensive)/i,
    /(below|above|between|in between).*(price|fare|cost|amount|ticket)/i,
    /(price|fare|cost|amount|ticket).*(below|above|between)/i,
  ];

  return patterns.some(p => p.test(query));
}

/**
 * Get fare information between two cities
 */
async function getFareInfo(fromCity, toCity) {
  const getCityVariants = (c) => {
    const norm = normalizeCity(c);
    if (norm === 'anantapur') return ['anantapur', 'ananthapuram', 'ananthapur', 'anantapuram'];
    return [c, norm];
  };

  const fromVars = getCityVariants(fromCity);
  const toVars = getCityVariants(toCity);

  const fromClauses = fromVars.map(() => 'LOWER(r.from_city) LIKE ?').join(' OR ');
  const toClauses = toVars.map(() => 'LOWER(r.to_city) LIKE ?').join(' OR ');

  const fares = await dbAll(`
    SELECT 
      MIN(s.base_price) as min_price,
      MAX(s.base_price) as max_price,
      ROUND(CAST(AVG(s.base_price) AS numeric), 0) as avg_price,
      COUNT(DISTINCT s.id) as schedule_count,
      r.distance_km,
      r.duration_hours,
      r.from_city,
      r.to_city
    FROM schedules s
    JOIN routes r ON s.route_id = r.id
    WHERE (${fromClauses}) AND (${toClauses})
      AND s.travel_date >= CURRENT_DATE
      AND s.available_seats > 0
    GROUP BY r.id
  `, [...fromVars.map(v => `%${v}%`), ...toVars.map(v => `%${v}%`)]);
  
  return fares.length > 0 ? fares[0] : null;
}

/**
 * Get detailed fare breakdown by bus type
 */
async function getFareBreakdown(fromCity, toCity) {
  const getCityVariants = (c) => {
    const norm = normalizeCity(c);
    if (norm === 'anantapur') return ['anantapur', 'ananthapuram', 'ananthapur', 'anantapuram'];
    return [c, norm];
  };

  const fromVars = getCityVariants(fromCity);
  const toVars = getCityVariants(toCity);

  const fromClauses = fromVars.map(() => 'LOWER(r.from_city) LIKE ?').join(' OR ');
  const toClauses = toVars.map(() => 'LOWER(r.to_city) LIKE ?').join(' OR ');

  const fares = await dbAll(`
    SELECT 
      b.bus_type,
      b.has_ac,
      b.is_sleeper,
      MIN(s.base_price) as min_price,
      MAX(s.base_price) as max_price,
      COUNT(s.id) as options
    FROM schedules s
    JOIN buses b ON s.bus_id = b.id
    JOIN routes r ON s.route_id = r.id
    WHERE (${fromClauses}) AND (${toClauses})
      AND s.travel_date >= CURRENT_DATE
      AND s.available_seats > 0
    GROUP BY b.bus_type, b.has_ac, b.is_sleeper
    ORDER BY min_price ASC
  `, [...fromVars.map(v => `%${v}%`), ...toVars.map(v => `%${v}%`)]);
  
  return fares;
}

/**
 * Format routes as readable text
 */
function formatRoutes(routes) {
  if (routes.length === 0) return 'No routes currently available.';
  
  const routeList = routes.map(r => 
    `• ${r.from_city} → ${r.to_city} (${r.distance_km}km, ~${r.duration_hours}h)`
  ).join('\n');
  
  return `**Available Routes:**\n\n${routeList}`;
}

/**
 * Use LLM for complex queries not in knowledge base
 */
async function askLLM(query) {
  try {
    const systemPrompt = `You are a Senior Project AI Agent for the BusGo application. You have access to entire information about the app's capabilities.
Your primary role is to give expert, step-by-step suggestions, analyze questions intelligently, and act like ChatGPT or GitHub Copilot.

APP CAPABILITIES & INFORMATION:
- Finding buses: We can search routes between major cities (Hyderabad, Chennai, Bangalore, etc.), analyze prices, and show availability.
- Booking Seats: Users can tell us passenger names, seat numbers, and dates to reserve seats.
- Cancellation and Seat Selection: Users can release specific seats or cancel tickets using a PNR which triggers proportional refund rules.
- System Architecture: Built on React + Node.js + PostgreSQL using LangGraph. We use Multi-Agent systems (Bus Search, Booking Validation, Conversational, Knowledge).
- Data Privacy: All payment data is securely checked via an idempotent webhook flow. 

When a user asks a general question, give an informative, step-by-step response wrapped in helpful context.
Be creative and smart. Think about the user's underlying needs.`;
    
    const response = await llm.generateWithRetry(query, { 
      systemPrompt,
      maxTokens: 500,
      temperature: 0.7 
    });
    
    return response;
  } catch (err) {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//                         MAIN LANGGRAPH NODE FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Knowledge Node - Main LangGraph node function
 */
async function knowledgeNode(state) {
  const startTime = Date.now();
  const { taskId, taskType, inputData } = state;
  
  console.log(`\n[KnowledgeAgent] Processing query for task ${taskId}`);
  
  const traces = [];
  const addTrace = (type, content) => {
    traces.push({ agent: 'KnowledgeAgent', type, content, timestamp: Date.now() });
  };
  
  try {
    const query = inputData.query || inputData.message || inputData.userMessage || inputData.question || '';
    
    addTrace('thought', `Processing query: "${query.substring(0, 50)}..."`);
    
    // Handle seat layout task type specially
    if (taskType === 'get_seat_layout') {
      addTrace('action', 'Retrieving seat layout information');
      const seatInfo = KNOWLEDGE_BASE.seat_layout;
      
      return {
        agentResults: { 
          knowledge: { 
            success: true, 
            answer: seatInfo.answer, 
            category: 'seats',
            source: 'knowledge_base' 
          } 
        },
        structuredData: { 
          answer: seatInfo.answer, 
          category: 'seats',
          relatedTopics: ['bus_types', 'booking_help']
        },
        traces,
        decisionTrail: [{ agent: 'KnowledgeAgent', status: 'success', steps: traces.length, duration_ms: Date.now() - startTime }]
      };
    }
    
    // Check if asking about travel time/duration between specific cities
    if (isTravelTimeQuery(query)) {
      addTrace('action', 'Detected travel time query');
      const cities = extractCitiesFromQuery(query);
      
      if (cities) {
        addTrace('action', `Looking up route: ${cities.from} → ${cities.to}`);
        const route = await getRouteInfo(cities.from, cities.to);
        
        if (route) {
          const hours = Math.floor(route.duration_hours);
          const minutes = Math.round((route.duration_hours - hours) * 60);
          const timeStr = minutes > 0 ? `${hours} hours ${minutes} minutes` : `${hours} hours`;
          
          const answer = `**Travel Time: ${route.from_city} → ${route.to_city}**

⏱️ **Duration:** ~${timeStr}
📏 **Distance:** ${route.distance_km} km

This is an approximate time. Actual duration may vary based on traffic and weather conditions.`;
          
          addTrace('observation', `Found route: ${route.duration_hours}h, ${route.distance_km}km`);
          
          return {
            agentResults: { 
              knowledge: { 
                success: true, 
                answer, 
                category: 'travel_time',
                source: 'database',
                route 
              } 
            },
            structuredData: { 
              answer,
              route,
              category: 'travel_time'
            },
            traces,
            decisionTrail: [{ agent: 'KnowledgeAgent', status: 'success', steps: traces.length, duration_ms: Date.now() - startTime }]
          };
        } else {
          const answer = `Sorry, I couldn't find a direct route from **${cities.from}** to **${cities.to}**. 

Try searching for available buses to see if this route exists, or check our available routes.`;
          
          return {
            agentResults: { 
              knowledge: { 
                success: true, 
                answer, 
                category: 'travel_time',
                source: 'not_found' 
              } 
            },
            structuredData: { answer, category: 'travel_time' },
            traces,
            decisionTrail: [{ agent: 'KnowledgeAgent', status: 'partial', steps: traces.length, duration_ms: Date.now() - startTime }]
          };
        }
      }
    }
    
    // ════════════════════════════════════════════════════════════════════════════
    // FARE/PRICE QUERY - Handle questions about ticket prices
    // ════════════════════════════════════════════════════════════════════════════
    if (isFareQuery(query)) {
      addTrace('action', 'Detected fare/price query');
      const cities = extractCitiesFromQuery(query);
      
      if (cities) {
        addTrace('action', `Looking up fares: ${cities.from} → ${cities.to}`);
        const fareInfo = await getFareInfo(cities.from, cities.to);
        const fareBreakdown = await getFareBreakdown(cities.from, cities.to);
        
        if (fareInfo && fareInfo.min_price) {
          let answer = `**💰 Ticket Prices: ${fareInfo.from_city} → ${fareInfo.to_city}**\n\n`;
          
          answer += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
          answer += `💵 **Minimum Fare:** ₹${fareInfo.min_price}\n`;
          answer += `💵 **Maximum Fare:** ₹${fareInfo.max_price}\n`;
          answer += `📊 **Average Fare:** ₹${fareInfo.avg_price}\n`;
          answer += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
          
          answer += `📏 **Distance:** ${fareInfo.distance_km} km\n`;
          answer += `⏱️ **Duration:** ~${fareInfo.duration_hours} hours\n`;
          answer += `🚌 **Available Options:** ${fareInfo.schedule_count} buses\n\n`;
          
          if (fareBreakdown && fareBreakdown.length > 0) {
            answer += `**📋 Price by Bus Type:**\n`;
            fareBreakdown.forEach(fb => {
              const acLabel = fb.has_ac ? '❄️ AC' : '🌡️ Non-AC';
              const typeLabel = fb.is_sleeper ? '🛏️ Sleeper' : '💺 Seater';
              answer += `• ${fb.bus_type} ${acLabel} ${typeLabel}: ₹${fb.min_price}`;
              if (fb.min_price !== fb.max_price) {
                answer += ` - ₹${fb.max_price}`;
              }
              answer += ` (${fb.options} options)\n`;
            });
          }
          
          answer += `\n💡 **Tip:** Non-AC buses are usually the cheapest option!`;
          
          addTrace('observation', `Found fares: ₹${fareInfo.min_price} - ₹${fareInfo.max_price}`);
          
          return {
            agentResults: { 
              knowledge: { 
                success: true, 
                answer, 
                category: 'fares',
                source: 'database',
                fareInfo,
                fareBreakdown
              } 
            },
            structuredData: { 
              answer,
              fareInfo,
              fareBreakdown,
              category: 'fares'
            },
            traces,
            decisionTrail: [{ agent: 'KnowledgeAgent', status: 'success', steps: traces.length, duration_ms: Date.now() - startTime }]
          };
        } else {
          const answer = `Sorry, I couldn't find fare information from **${cities.from}** to **${cities.to}**. 

This route may not be available. Try asking "show all routes" to see available destinations.`;
          
          return {
            agentResults: { 
              knowledge: { 
                success: true, 
                answer, 
                category: 'fares',
                source: 'not_found' 
              } 
            },
            structuredData: { answer, category: 'fares' },
            traces,
            decisionTrail: [{ agent: 'KnowledgeAgent', status: 'partial', steps: traces.length, duration_ms: Date.now() - startTime }]
          };
        }
      } else {
        // No cities provided - fetch actual minimum fare from DB
        addTrace('action', 'No cities found — fetching global minimum fare from database');
        let globalMinFare = null;
        try {
          const globalFares = await dbAll(`
            SELECT MIN(base_price) as min_price, MAX(base_price) as max_price,
                   ROUND(CAST(AVG(base_price) AS numeric), 0) as avg_price
            FROM schedules
            WHERE travel_date >= CURRENT_DATE AND available_seats > 0
          `);
          if (globalFares && globalFares[0] && globalFares[0].min_price) {
            globalMinFare = globalFares[0];
          }
        } catch(e) { /* ignore */ }

        const minDisplay = globalMinFare ? `₹${globalMinFare.min_price}` : '₹200';
        const maxDisplay = globalMinFare ? `₹${globalMinFare.max_price}` : '₹2000';
        const avgDisplay = globalMinFare ? `₹${globalMinFare.avg_price}` : '₹600';

        const answer = `**💰 Ticket Prices on Our Platform**

━━━━━━━━━━━━━━━━━━━━━━━━━━━
💵 **Minimum Fare:** ${minDisplay} (Non-AC Seater)
💵 **Maximum Fare:** ${maxDisplay} (AC Sleeper)
📊 **Average Fare:** ${avgDisplay}
━━━━━━━━━━━━━━━━━━━━━━━━━━━

**📋 Price by Bus Type:**
• 🌡️ Non-AC Seater → Cheapest starting at ${minDisplay}
• ❄️ AC Seater → Mid-range
• 🛏️ Non-AC Sleeper → Comfortable at mid-range
• ❄️🛏️ AC Sleeper → Premium at ${maxDisplay}

💡 **Tip:** For exact prices ask me like:
• "Minimum fare from Hyderabad to Vijayawada"
• "Cheapest ticket from Bangalore to Chennai"
• "How much does it cost from Mumbai to Pune?"`;

        return {
          agentResults: { knowledge: { success: true, answer, category: 'fares', source: 'database' } },
          structuredData: { answer, category: 'fares' },
          traces,
          decisionTrail: [{ agent: 'KnowledgeAgent', status: 'success', steps: traces.length, duration_ms: Date.now() - startTime }]
        };
      }
    }
    

    // ════════════════════════════════════════════════════════════════════════════
    // SPECIFIC ROUTE QUERY - "how many routes from X to Y", "routes from X to Y"
    // Must check BEFORE the general route list query
    // ════════════════════════════════════════════════════════════════════════════
    if (/route|how many/i.test(query)) {
      const cities = extractCitiesFromQuery(query);
      if (cities) {
        addTrace('action', `Looking up specific route: ${cities.from} → ${cities.to}`);
        const route = await getRouteInfo(cities.from, cities.to);
        const reverseRoute = await getRouteInfo(cities.to, cities.from);
        
        if (route) {
          // Get buses available on this route
          const buses = await getBusesOnRoute(cities.from, cities.to);
          const busTypes = {};
          buses.forEach(b => { busTypes[b.bus_type] = (busTypes[b.bus_type] || 0) + 1; });
          
          let answer = `**📍 Route: ${route.from_city} → ${route.to_city}**\n\n`;
          answer += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
          answer += `📏 **Distance:** ${route.distance_km} km\n`;
          answer += `⏱️ **Duration:** ~${route.duration_hours}h\n`;
          answer += `🚌 **Buses Available:** ${buses.length}\n`;
          answer += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
          
          if (buses.length > 0) {
            const prices = buses.map(b => b.base_price).filter(p => p);
            if (prices.length > 0) {
              answer += `**💰 Price Range:** ₹${Math.min(...prices)} - ₹${Math.max(...prices)}\n\n`;
            }
            answer += `**📋 By Bus Type:**\n`;
            Object.entries(busTypes).forEach(([type, count]) => {
              answer += `• ${type}: ${count} bus(es)\n`;
            });
            answer += `\n**⏰ Departure Times:** 06:00 AM, 02:00 PM, 06:30 PM, 10:00 PM\n`;
          }
          
          if (reverseRoute) {
            answer += `\n🔄 **Return Route** (${reverseRoute.from_city} → ${reverseRoute.to_city}) is also available.`;
          }
          
          answer += `\n\n💡 Say "search buses from ${route.from_city} to ${route.to_city}" to see availability for a specific date!`;
          
          addTrace('observation', `Found route: ${route.distance_km}km, ${buses.length} buses`);
          
          return {
            agentResults: { knowledge: { success: true, answer, category: 'route_info', source: 'database', route } },
            structuredData: { answer, route, buses, category: 'route_info' },
            traces,
            decisionTrail: [{ agent: 'KnowledgeAgent', status: 'success', steps: traces.length, duration_ms: Date.now() - startTime }]
          };
        } else {
          const answer = `❌ No direct route found from **${cities.from}** to **${cities.to}**.\n\nTry asking "show all routes" to see available destinations.`;
          return {
            agentResults: { knowledge: { success: true, answer, category: 'route_info', source: 'not_found' } },
            structuredData: { answer, category: 'route_info' },
            traces,
            decisionTrail: [{ agent: 'KnowledgeAgent', status: 'partial', steps: traces.length, duration_ms: Date.now() - startTime }]
          };
        }
      }
    }
    
    // Check if asking about all routes / route list
    if (isRouteListQuery(query)) {
      addTrace('action', 'Fetching available routes');
      const routes = await getAvailableRoutes();
      const stats = await getSystemStats();
      
      let routeAnswer = `**📍 Available Routes (${routes.length} total):**\n\n`;
      routes.forEach(r => {
        routeAnswer += `• **${r.from_city} → ${r.to_city}**\n`;
        routeAnswer += `  📏 Distance: ${r.distance_km} km | ⏱️ Duration: ~${r.duration_hours}h\n\n`;
      });
      
      routeAnswer += `\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
      routeAnswer += `**📊 System Overview:**\n`;
      routeAnswer += `• Total Routes: ${stats.totalRoutes}\n`;
      routeAnswer += `• Total Buses: ${stats.totalBuses}\n`;
      routeAnswer += `• Active Schedules: ${stats.activeSchedules}\n`;
      
      addTrace('observation', `Found ${routes.length} routes`);
      
      return {
        agentResults: { 
          knowledge: { 
            success: true, 
            answer: routeAnswer, 
            category: 'routes',
            source: 'database',
            routes,
            stats 
          } 
        },
        structuredData: { 
          answer: routeAnswer, 
          routes,
          stats,
          category: 'routes'
        },
        traces,
        decisionTrail: [{ agent: 'KnowledgeAgent', status: 'success', steps: traces.length, duration_ms: Date.now() - startTime }]
      };
    }
    
    // ════════════════════════════════════════════════════════════════════════════
    // BUS COUNT QUERY - How many buses available (MUST BE BEFORE BUS DETAILS)
    // ════════════════════════════════════════════════════════════════════════════
    if (isBusCountQuery(query)) {
      addTrace('action', 'Counting buses');
      const cities = extractCitiesFromQuery(query);
      
      if (cities) {
        const buses = await getBusesOnRoute(cities.from, cities.to);
        
        // Group unique bus names/types
        const uniqueBusMap = new Map();
        buses.forEach(b => {
          const key = `${b.bus_name} (${b.bus_type})`;
          if (!uniqueBusMap.has(key)) {
            uniqueBusMap.set(key, { ...b, schedule_count: 1 });
          } else {
            uniqueBusMap.get(key).schedule_count += 1;
          }
        });

        const uniqueBuses = Array.from(uniqueBusMap.values());

        let countAnswer = `**🚌 Bus Count & Fleet: ${capitalize(cities.from)} → ${capitalize(cities.to)}**\n\n`;
        countAnswer += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        countAnswer += `🚌 **Distinct Fleet Buses:** ${uniqueBuses.length}\n`;
        countAnswer += `📊 **Total Schedule Options:** ${buses.length}\n`;
        countAnswer += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        if (uniqueBuses.length > 0) {
          countAnswer += `**🚍 Buses Operating on this Route:**\n`;
          uniqueBuses.forEach((b, idx) => {
            const acLabel = b.has_ac ? '❄️ AC' : '🌡️ Non-AC';
            const sleeperLabel = b.is_sleeper ? '🛏️ Sleeper' : '💺 Seater';
            countAnswer += `${idx + 1}. **${b.bus_name}** (${b.bus_type} ${acLabel} ${sleeperLabel}) — ₹${b.base_price}\n`;
          });

          // Count by type across unique buses
          const acCount = uniqueBuses.filter(b => b.has_ac).length;
          const nonAcCount = uniqueBuses.filter(b => !b.has_ac).length;
          const sleeperCount = uniqueBuses.filter(b => b.is_sleeper).length;
          const seaterCount = uniqueBuses.filter(b => !b.is_sleeper).length;
          
          countAnswer += `\n**📋 Fleet Breakdown by Type:**\n`;
          countAnswer += `• ❄️ AC Buses: ${acCount}\n`;
          countAnswer += `• 🌡️ Non-AC Buses: ${nonAcCount}\n`;
          countAnswer += `• 🛏️ Sleeper Buses: ${sleeperCount}\n`;
          countAnswer += `• 💺 Seater Buses: ${seaterCount}\n\n`;
          
          // Get price range
          const prices = buses.map(b => b.base_price).filter(p => p);
          if (prices.length > 0) {
            countAnswer += `**💰 Price Range:** ₹${Math.min(...prices)} - ₹${Math.max(...prices)}\n`;
          }
        } else {
          countAnswer += `❌ No buses currently available on this route.\n`;
          countAnswer += `Try searching for a different date or route.`;
        }
        
        return {
          agentResults: { knowledge: { success: true, answer: countAnswer, category: 'bus_count', buses, uniqueBuses } },
          structuredData: { answer: countAnswer, busCount: uniqueBuses.length, totalSchedules: buses.length, buses, category: 'bus_count' },
          traces,
          decisionTrail: [{ agent: 'KnowledgeAgent', status: 'success', steps: traces.length, duration_ms: Date.now() - startTime }]
        };
      } else {
        // General bus count
        const allBuses = await getAllBuses();
        const sysStats = await getSystemStats();
        
        let countAnswer = `**🚌 Total Buses in Network:**\n\n`;
        countAnswer += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        countAnswer += `📊 **Total Buses:** ${sysStats.totalBuses}\n`;
        countAnswer += `📍 **Total Routes:** ${sysStats.totalRoutes}\n`;
        countAnswer += `📅 **Active Schedules:** ${sysStats.activeSchedules}\n`;
        countAnswer += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        countAnswer += `To count buses for a specific route, ask:\n`;
        countAnswer += `"How many buses from [City A] to [City B]?"`;
        
        return {
          agentResults: { knowledge: { success: true, answer: countAnswer, category: 'bus_count' } },
          structuredData: { answer: countAnswer, stats: sysStats, category: 'bus_count' },
          traces,
          decisionTrail: [{ agent: 'KnowledgeAgent', status: 'success', steps: traces.length, duration_ms: Date.now() - startTime }]
        };
      }
    }
    
    // ════════════════════════════════════════════════════════════════════════════
    // BUS DETAILS QUERY
    // ════════════════════════════════════════════════════════════════════════════
    if (isBusDetailQuery(query)) {
      addTrace('action', 'Fetching bus details');
      const cities = extractCitiesFromQuery(query);
      
      if (cities) {
        // Get buses on specific route
        const buses = await getBusesOnRoute(cities.from, cities.to);
        
        if (buses.length > 0) {
          let busAnswer = `**🚌 Buses from ${cities.from} to ${cities.to}:**\n\n`;
          buses.forEach((bus, i) => {
            const acLabel = bus.has_ac ? '❄️ AC' : '🌡️ Non-AC';
            const sleeperLabel = bus.is_sleeper ? '🛏️ Sleeper' : '💺 Seater';
            busAnswer += `**${i + 1}. ${bus.bus_name}** ${acLabel} ${sleeperLabel}\n`;
            busAnswer += `   • Operator: ${bus.operator}\n`;
            busAnswer += `   • Rating: ⭐ ${bus.rating}/5\n`;
            busAnswer += `   • Date: ${bus.travel_date}\n`;
            busAnswer += `   • Time: ${bus.departure_time} → ${bus.arrival_time}\n`;
            busAnswer += `   • Price: ₹${bus.base_price}\n`;
            busAnswer += `   • Available Seats: ${bus.available_seats}/${bus.total_seats}\n`;
            busAnswer += `   • Distance: ${bus.distance_km} km | Duration: ~${bus.duration_hours}h\n\n`;
          });
          
          addTrace('observation', `Found ${buses.length} buses on route`);
          
          return {
            agentResults: { knowledge: { success: true, answer: busAnswer, category: 'bus_details', source: 'database', buses } },
            structuredData: { answer: busAnswer, buses, category: 'bus_details' },
            traces,
            decisionTrail: [{ agent: 'KnowledgeAgent', status: 'success', steps: traces.length, duration_ms: Date.now() - startTime }]
          };
        }
      }
      
      // Get all buses
      const allBuses = await getAllBuses();
      let busAnswer = `**🚌 All Available Buses (${allBuses.length} total):**\n\n`;
      
      allBuses.forEach((bus, i) => {
        const acLabel = bus.has_ac ? '❄️ AC' : '🌡️ Non-AC';
        const sleeperLabel = bus.is_sleeper ? '🛏️ Sleeper' : '💺 Seater';
        busAnswer += `**${i + 1}. ${bus.bus_name}** (${bus.bus_number})\n`;
        busAnswer += `   • Type: ${bus.bus_type} ${acLabel} ${sleeperLabel}\n`;
        busAnswer += `   • Operator: ${bus.operator}\n`;
        busAnswer += `   • Rating: ⭐ ${bus.rating}/5\n`;
        busAnswer += `   • Total Seats: ${bus.total_seats}\n\n`;
      });
      
      addTrace('observation', `Found ${allBuses.length} buses`);
      
      return {
        agentResults: { knowledge: { success: true, answer: busAnswer, category: 'bus_details', source: 'database', buses: allBuses } },
        structuredData: { answer: busAnswer, buses: allBuses, category: 'bus_details' },
        traces,
        decisionTrail: [{ agent: 'KnowledgeAgent', status: 'success', steps: traces.length, duration_ms: Date.now() - startTime }]
      };
    }
    
    // ════════════════════════════════════════════════════════════════════════════
    // SEAT AVAILABILITY QUERY
    // ════════════════════════════════════════════════════════════════════════════
    if (isSeatAvailabilityQuery(query)) {
      addTrace('action', 'Checking seat availability');
      const cities = extractCitiesFromQuery(query);
      
      if (cities) {
        const stats = await getSeatAvailabilityStats(cities.from, cities.to);
        
        if (stats.length > 0) {
          let availAnswer = `**💺 Seat Availability: ${cities.from} → ${cities.to}**\n\n`;
          availAnswer += `| Date | Buses | Available | Total | Availability | Price Range |\n`;
          availAnswer += `|------|-------|-----------|-------|--------------|-------------|\n`;
          
          stats.forEach(s => {
            const availIcon = s.availability_percent > 50 ? '🟢' : s.availability_percent > 20 ? '🟡' : '🔴';
            availAnswer += `| ${s.travel_date} | ${s.bus_count} | ${s.total_available} | ${s.total_capacity} | ${availIcon} ${s.availability_percent}% | ₹${s.min_price}-${s.max_price} |\n`;
          });
          
          availAnswer += `\n**Booking Chances:**\n`;
          const avgAvail = stats.reduce((sum, s) => sum + s.availability_percent, 0) / stats.length;
          if (avgAvail > 60) {
            availAnswer += `🟢 **Excellent** - High availability, book anytime!\n`;
          } else if (avgAvail > 30) {
            availAnswer += `🟡 **Good** - Moderate availability, book soon to secure your seat.\n`;
          } else {
            availAnswer += `🔴 **Limited** - Low availability, book immediately!\n`;
          }
          
          addTrace('observation', `Found availability stats for ${stats.length} days`);
          
          return {
            agentResults: { knowledge: { success: true, answer: availAnswer, category: 'seat_availability', source: 'database', stats } },
            structuredData: { answer: availAnswer, stats, category: 'seat_availability' },
            traces,
            decisionTrail: [{ agent: 'KnowledgeAgent', status: 'success', steps: traces.length, duration_ms: Date.now() - startTime }]
          };
        }
      }
      
      // General availability info
      const sysStats = await getSystemStats();
      const availAnswer = `**💺 Seat Availability Overview**\n\n` +
        `• Active Schedules: ${sysStats.activeSchedules}\n` +
        `• Total Buses Operating: ${sysStats.totalBuses}\n\n` +
        `To check seat availability for a specific route, ask:\n` +
        `"Check seat availability from [City A] to [City B]"`;
      
      return {
        agentResults: { knowledge: { success: true, answer: availAnswer, category: 'seat_availability' } },
        structuredData: { answer: availAnswer, category: 'seat_availability' },
        traces,
        decisionTrail: [{ agent: 'KnowledgeAgent', status: 'success', steps: traces.length, duration_ms: Date.now() - startTime }]
      };
    }
    
    // ════════════════════════════════════════════════════════════════════════════
    // DISTANCE QUERY
    // ════════════════════════════════════════════════════════════════════════════
    if (isDistanceQuery(query)) {
      addTrace('action', 'Checking distance information');
      const cities = extractCitiesFromQuery(query);
      
      if (cities) {
        const route = await getRouteInfo(cities.from, cities.to);
        if (route) {
          const answer = `**📏 Distance: ${route.from_city} → ${route.to_city}**\n\n` +
            `• **Distance:** ${route.distance_km} km\n` +
            `• **Travel Time:** ~${route.duration_hours} hours\n\n` +
            `This is the road distance. Actual time may vary based on traffic.`;
          
          return {
            agentResults: { knowledge: { success: true, answer, category: 'distance', route } },
            structuredData: { answer, route, category: 'distance' },
            traces,
            decisionTrail: [{ agent: 'KnowledgeAgent', status: 'success', steps: traces.length, duration_ms: Date.now() - startTime }]
          };
        }
      }
      
      // Show all route distances
      const routes = await getAvailableRoutes();
      let distAnswer = `**📏 Route Distances:**\n\n`;
      routes.forEach(r => {
        distAnswer += `• ${r.from_city} → ${r.to_city}: **${r.distance_km} km** (~${r.duration_hours}h)\n`;
      });
      
      return {
        agentResults: { knowledge: { success: true, answer: distAnswer, category: 'distance' } },
        structuredData: { answer: distAnswer, routes, category: 'distance' },
        traces,
        decisionTrail: [{ agent: 'KnowledgeAgent', status: 'success', steps: traces.length, duration_ms: Date.now() - startTime }]
      };
    }
    
    // ════════════════════════════════════════════════════════════════════════════
    // TIMING/SCHEDULE QUERY
    // ════════════════════════════════════════════════════════════════════════════
    if (isTimingQuery(query)) {
      addTrace('action', 'Fetching bus timings');
      const cities = extractCitiesFromQuery(query);
      
      if (cities) {
        const buses = await getBusesOnRoute(cities.from, cities.to);
        
        if (buses.length > 0) {
          let timeAnswer = `**🕐 Bus Timings: ${cities.from} → ${cities.to}**\n\n`;
          
          // Group by date
          const byDate = {};
          buses.forEach(b => {
            if (!byDate[b.travel_date]) byDate[b.travel_date] = [];
            byDate[b.travel_date].push(b);
          });
          
          for (const [date, busesOnDate] of Object.entries(byDate)) {
            timeAnswer += `**📅 ${date}:**\n`;
            busesOnDate.forEach(b => {
              timeAnswer += `• ${b.departure_time} → ${b.arrival_time} | ${b.bus_name} | ₹${b.base_price} | ${b.available_seats} seats\n`;
            });
            timeAnswer += `\n`;
          }
          
          return {
            agentResults: { knowledge: { success: true, answer: timeAnswer, category: 'timings', buses } },
            structuredData: { answer: timeAnswer, buses, category: 'timings' },
            traces,
            decisionTrail: [{ agent: 'KnowledgeAgent', status: 'success', steps: traces.length, duration_ms: Date.now() - startTime }]
          };
        }
      }
      
      const generalAnswer = `**🕐 Bus Timings**\n\n` +
        `To see bus timings for a specific route, ask:\n` +
        `"Show bus timings from [City A] to [City B]"\n\n` +
        `Or search for buses to see all available schedules.`;
      
      return {
        agentResults: { knowledge: { success: true, answer: generalAnswer, category: 'timings' } },
        structuredData: { answer: generalAnswer, category: 'timings' },
        traces,
        decisionTrail: [{ agent: 'KnowledgeAgent', status: 'success', steps: traces.length, duration_ms: Date.now() - startTime }]
      };
    }
    
    // ════════════════════════════════════════════════════════════════════════════
    // APP INFO QUERY - About the app/service
    // ════════════════════════════════════════════════════════════════════════════
    if (isAppInfoQuery(query)) {
      addTrace('action', 'Returning app information');
      const appInfo = KNOWLEDGE_BASE.app_info;
      
      return {
        agentResults: { knowledge: { success: true, answer: appInfo.answer, category: 'app_info', source: 'knowledge_base' } },
        structuredData: { answer: appInfo.answer, category: 'app_info' },
        traces,
        decisionTrail: [{ agent: 'KnowledgeAgent', status: 'success', steps: traces.length, duration_ms: Date.now() - startTime }]
      };
    }
    
    // Step 1: Try knowledge base
    addTrace('action', 'Searching knowledge base');
    const kbMatch = matchKnowledgeBase(query);
    
    if (kbMatch) {
      addTrace('observation', `Found in knowledge base: ${kbMatch.category}`);
      
      return {
        agentResults: { 
          knowledge: { 
            success: true, 
            answer: kbMatch.answer, 
            category: kbMatch.category,
            source: 'knowledge_base' 
          } 
        },
        structuredData: { 
          answer: kbMatch.answer, 
          category: kbMatch.category,
          relatedTopics: Object.keys(KNOWLEDGE_BASE).filter(k => k !== kbMatch.key).slice(0, 3)
        },
        traces,
        decisionTrail: [{ agent: 'KnowledgeAgent', status: 'success', steps: traces.length, duration_ms: Date.now() - startTime }]
      };
    }
    
    // Step 2: Try LLM for complex queries
    addTrace('action', 'Querying LLM for answer');
    const llmResponse = await askLLM(query);
    
    if (llmResponse) {
      addTrace('observation', 'Got response from LLM');
      
      return {
        agentResults: { 
          knowledge: { 
            success: true, 
            answer: llmResponse, 
            category: 'general',
            source: 'llm' 
          } 
        },
        structuredData: { 
          answer: llmResponse, 
          category: 'general',
          source: 'llm'
        },
        traces,
        decisionTrail: [{ agent: 'KnowledgeAgent', status: 'success', steps: traces.length, duration_ms: Date.now() - startTime }]
      };
    }
    
    // Step 3: Default response
    addTrace('observation', 'No specific answer found');
    const defaultAnswer = `I don't have specific information about that. Here are some topics I can help with:

**🚌 Bus Information:**
• "Show all buses" - List all available buses
• "Bus details from X to Y" - Buses on a specific route

**📍 Routes & Distances:**
• "Show all routes" - List all available routes
• "Distance from X to Y" - Get route distance
• "Travel time from X to Y" - Get journey duration

**💺 Seat Availability:**
• "Check seats from X to Y" - Seat availability statistics
• "Booking chances from X to Y" - Availability forecast

**🕐 Timings:**
• "Bus timings from X to Y" - Departure and arrival times

**📋 General:**
• Booking help, Cancellation policy, Baggage rules

Try asking one of these!`;
    
    return {
      agentResults: { 
        knowledge: { 
          success: true, 
          answer: defaultAnswer, 
          category: 'help',
          source: 'default' 
        } 
      },
      structuredData: { 
        answer: defaultAnswer, 
        category: 'help',
        availableTopics: Object.keys(KNOWLEDGE_BASE)
      },
      traces,
      decisionTrail: [{ agent: 'KnowledgeAgent', status: 'partial', steps: traces.length, duration_ms: Date.now() - startTime }]
    };
    
  } catch (error) {
    console.error(`[KnowledgeAgent] Error: ${error.message}`);
    addTrace('error', error.message);
    
    return {
      agentResults: { knowledge: { success: false, error: error.message } },
      structuredData: { error: error.message },
      traces,
      error: error.message,
      decisionTrail: [{ agent: 'KnowledgeAgent', status: 'error', steps: traces.length, duration_ms: Date.now() - startTime }]
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//                                   EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  knowledgeNode,
  knowledgeNode_internal: {
    matchKnowledgeBase,
    getAvailableRoutes,
    getRouteInfo,
    getAllBuses,
    getBusesOnRoute,
    getSeatAvailabilityStats,
    getSystemStats,
    extractCitiesFromQuery,
    isTravelTimeQuery,
    isRouteListQuery,
    isBusDetailQuery,
    isSeatAvailabilityQuery,
    isDistanceQuery,
    isTimingQuery,
    isBusCountQuery,
    isAppInfoQuery,
    isFareQuery,
    getFareInfo,
    getFareBreakdown,
    askLLM,
    KNOWLEDGE_BASE
  }
};
