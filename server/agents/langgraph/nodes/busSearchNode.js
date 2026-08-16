/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                    BUS SEARCH AGENT (CORE AGENT #1)                          ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  PURPOSE: Find available buses between cities on a given date               ║
 * ║  USES LLM: Yes - for price analysis and recommendations                     ║
 * ║  DATABASE: Read-only queries via dbUtils (async PostgreSQL)                 ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  FLOW: START → busSearchNode → conversationalNode → END                     ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

const { dbGet, dbAll } = require('../../dbUtils');
const llm = require('../llmService');

const {
  CITY_ALIASES,
  normalizeCity: canonicalNormalizeCity,
  getCityVariants,
  buildCityMatchClause
} = require('../../../utils/cityUtils');

// ═══════════════════════════════════════════════════════════════════════════════
//                              HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Normalize city name for database matching
 */
function normalizeCity(city) {
  return canonicalNormalizeCity(city);
}

/**
 * Capitalize city name for display
 */
function capitalizeCity(city) {
  if (!city) return '';
  return city.charAt(0).toUpperCase() + city.slice(1).toLowerCase();
}

/**
 * Get time slot from departure time
 */
function getTimeSlot(time) {
  if (!time) return 'anytime';
  const hour = parseInt(time.split(':')[0], 10);
  if (hour < 6) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

/**
 * Exclude buses that have already departed for today.
 */
function isBookableDeparture(travelDate, departureTime) {
  if (!travelDate || !departureTime) return true;

  const { getLocalDateString } = require('../../../utils/dateUtils');
  const today = getLocalDateString();

  if (travelDate > today) return true;
  if (travelDate < today) return false;

  const now = new Date();
  const timeStr = (departureTime || '').trim();
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

  const departure = new Date();
  departure.setHours(hours, minutes, 0, 0);
  return departure > now;
}

// ═══════════════════════════════════════════════════════════════════════════════
//                         DATABASE QUERY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate route exists in database
 */
async function validateRoute(from, to) {
  const fromMatch = buildCityMatchClause('from_city', from);
  const toMatch = buildCityMatchClause('to_city', to);
  
  // Try multi-variant matching for source & destination
  let route = await dbGet(`
    SELECT id, from_city as source, to_city as destination, distance_km, duration_hours
    FROM routes 
    WHERE ${fromMatch.sql} AND ${toMatch.sql}
    LIMIT 1
  `, [...fromMatch.params, ...toMatch.params]);
  
  if (route) {
    return { valid: true, routeId: route.id, from: route.source, to: route.destination, distance: route.distance_km };
  }
  
  // Get available cities for suggestions
  const routes = await dbAll(`SELECT DISTINCT from_city, to_city FROM routes`);
  const cities = [...new Set([...routes.map(r => r.from_city), ...routes.map(r => r.to_city)])];
  
  return { valid: false, error: `No route from ${from} to ${to}`, suggestions: cities.slice(0, 5) };
}

/**
 * Find schedules for a route on a date
 */
async function findSchedules(routeId, date) {
  const schedules = await dbAll(`
    SELECT 
      s.id as schedule_id,
      s.route_id,
      s.bus_id,
      s.departure_time,
      s.arrival_time,
      s.base_price,
      s.travel_date,
      s.available_seats,
      b.bus_name,
      b.bus_number,
      b.bus_type,
      b.total_seats,
      b.has_ac,
      b.is_sleeper,
      b.rating,
      b.operator,
      r.from_city,
      r.to_city,
      r.distance_km,
      r.duration_hours
    FROM schedules s
    JOIN buses b ON s.bus_id = b.id
    JOIN routes r ON s.route_id = r.id
    WHERE s.route_id = ? AND s.travel_date = ?
    ORDER BY s.departure_time ASC
  `, [routeId, date]);
  
  const seen = new Set();
  const uniqueSchedules = [];
  for (const s of (schedules || [])) {
    const key = `${s.bus_id}_${s.departure_time}_${s.travel_date}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueSchedules.push(s);
    }
  }
  return uniqueSchedules;
}

/**
 * Calculate real-time seat availability
 */
async function calculateAvailability(schedules) {
  const results = [];
  
  for (const schedule of schedules) {
    // Count booked seats
    const booked = await dbGet(`
      SELECT COUNT(*) as count FROM bookings 
      WHERE schedule_id = ? AND booking_status IN ('confirmed', 'pending')
    `, [schedule.schedule_id]);
    
    // Count locked seats (temporary holds)
    const locked = await dbGet(`
      SELECT COUNT(*) as count FROM seat_locks 
      WHERE schedule_id = ? AND expires_at > CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
    `, [schedule.schedule_id]);
    
    const bookedCount = booked?.count || 0;
    const lockedCount = locked?.count || 0;
    const available = Math.max(0, schedule.total_seats - bookedCount - lockedCount);
    
    results.push({
      ...schedule,
      available_seats: available,
      booked_seats: bookedCount,
      locked_seats: lockedCount,
      is_available: available > 0
    });
  }
  
  return results;
}

/**
 * Apply filters to search results
 */
function applyFilters(buses, filters = {}) {
  let filtered = [...buses];
  
  if (filters.busType) {
    const type = filters.busType.toLowerCase();
    if (type === 'ac') filtered = filtered.filter(b => b.has_ac === 1);
    if (type === 'non-ac') filtered = filtered.filter(b => b.has_ac === 0);
    if (type === 'sleeper') filtered = filtered.filter(b => b.is_sleeper === 1);
    if (type === 'seater') filtered = filtered.filter(b => b.is_sleeper === 0);
  }
  
  if (filters.maxPrice) {
    filtered = filtered.filter(b => b.base_price <= filters.maxPrice);
  }
  
  if (filters.minPrice) {
    filtered = filtered.filter(b => b.base_price >= filters.minPrice);
  }
  
  if (filters.timeSlot) {
    filtered = filtered.filter(b => getTimeSlot(b.departure_time) === filters.timeSlot);
  }
  
  return filtered;
}

/**
 * Sort buses by criteria
 */
function sortBuses(buses, sortBy = 'departure') {
  const sorted = [...buses];
  
  switch (sortBy) {
    case 'price_low':
      sorted.sort((a, b) => a.base_price - b.base_price);
      break;
    case 'price_high':
      sorted.sort((a, b) => b.base_price - a.base_price);
      break;
    case 'rating':
      sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      break;
    case 'availability':
      sorted.sort((a, b) => b.available_seats - a.available_seats);
      break;
    default:
      sorted.sort((a, b) => a.departure_time.localeCompare(b.departure_time));
  }
  
  return sorted;
}

/**
 * Generate smart recommendations
 */
function generateRecommendations(buses) {
  if (buses.length === 0) return [];
  
  const recommendations = [];
  
  // Best Value: highest rating at lowest price
  const bestValue = [...buses].sort((a, b) => {
    const scoreA = (a.rating || 4) / (a.base_price / 100);
    const scoreB = (b.rating || 4) / (b.base_price / 100);
    return scoreB - scoreA;
  })[0];
  if (bestValue) {
    recommendations.push({ type: 'Best Value', bus: bestValue, reason: 'Great rating at a reasonable price' });
  }
  
  // Cheapest
  const cheapest = [...buses].sort((a, b) => a.base_price - b.base_price)[0];
  if (cheapest && cheapest.schedule_id !== bestValue?.schedule_id) {
    recommendations.push({ type: 'Budget Pick', bus: cheapest, reason: 'Lowest price option' });
  }
  
  // Highest Rated
  const topRated = [...buses].sort((a, b) => (b.rating || 0) - (a.rating || 0))[0];
  if (topRated && topRated.rating >= 4 && topRated.schedule_id !== bestValue?.schedule_id) {
    recommendations.push({ type: 'Top Rated', bus: topRated, reason: `${topRated.rating}★ rating` });
  }
  
  return recommendations.slice(0, 3);
}

/**
 * Try to get LLM price analysis (graceful fallback if LLM unavailable)
 */
async function analyzePricesWithLLM(buses) {
  if (buses.length === 0) return null;
  
  const prices = buses.map(b => b.base_price);
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  
  try {
    const prompt = `Analyze these bus ticket prices briefly (2-3 sentences):
    - Average: ₹${avgPrice.toFixed(0)}
    - Range: ₹${minPrice} to ₹${maxPrice}
    - Options: ${buses.length} buses
    Give a quick value assessment.`;
    
    const analysis = await llm.generate(prompt, { maxTokens: 100 });
    return analysis || null;
  } catch (err) {
    // LLM unavailable - return basic analysis
    return `Price range: ₹${minPrice} - ₹${maxPrice}. Average: ₹${avgPrice.toFixed(0)}. ${buses.length} options available.`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//                         MAIN LANGGRAPH NODE FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Bus Search Node - Main LangGraph node function
 * 
 * @param {Object} state - LangGraph AgentState
 * @returns {Object} - Partial state update
 */
async function busSearchNode(state) {
  const startTime = Date.now();
  const { taskId, inputData } = state;
  
  console.log(`\n[BusSearchAgent] Starting search for task ${taskId}`);
  
  const traces = [];
  const addTrace = (type, content) => {
    traces.push({ agent: 'BusSearchAgent', type, content, timestamp: Date.now() });
  };
  
  try {
    // Extract search parameters
    const from = inputData.fromCity || inputData.from || inputData.source;
    const to = inputData.toCity || inputData.to || inputData.destination;
    const { getLocalDateString } = require('../../../utils/dateUtils');
    const date = inputData.travelDate || inputData.date || getLocalDateString();
    const filters = { ...(inputData.filters || {}) };
    const sortBy = inputData.sortBy || 'departure';

    if (!from || !to) {
      const missingParts = [];
      if (!from) missingParts.push('from city');
      if (!to) missingParts.push('to city');

      addTrace('observation', `Missing route details: ${missingParts.join(', ')}`);
      return {
        agentResults: {
          bus_search: {
            success: false,
            error: `Please provide the ${missingParts.join(' and ')} to search for buses.`
          }
        },
        structuredData: {
          buses: [],
          route: null,
          error: `Please provide the ${missingParts.join(' and ')} to search for buses.`,
          needsRouteDetails: true
        },
        traces,
        decisionTrail: [{ agent: 'BusSearchAgent', status: 'missing_route', steps: traces.length, duration_ms: Date.now() - startTime }]
      };
    }

    // Accept constraints from both explicit filters and top-level/extracted fields.
    const topLevelMaxPrice = Number(inputData.maxPrice ?? inputData.budgetCap ?? inputData.priceLimit);
    if (!Number.isFinite(filters.maxPrice) && Number.isFinite(topLevelMaxPrice) && topLevelMaxPrice > 0) {
      filters.maxPrice = topLevelMaxPrice;
    }

    const topLevelMinPrice = Number(inputData.minPrice);
    if (!Number.isFinite(filters.minPrice) && Number.isFinite(topLevelMinPrice) && topLevelMinPrice > 0) {
      filters.minPrice = topLevelMinPrice;
    }

    const preferences = inputData.preferences || {};
    if (!filters.timeSlot && preferences.timeOfDay) {
      filters.timeSlot = preferences.timeOfDay;
    }

    if (!filters.busType) {
      if (typeof preferences.hasAC === 'boolean') {
        filters.busType = preferences.hasAC ? 'ac' : 'non-ac';
      } else if (typeof preferences.busType === 'string') {
        const bt = preferences.busType.toLowerCase();
        if (bt.includes('non-ac') || bt.includes('ordinary')) filters.busType = 'non-ac';
        else if (bt.includes('ac') || bt.includes('volvo')) filters.busType = 'ac';
        else if (bt.includes('sleeper')) filters.busType = 'sleeper';
        else if (bt.includes('seater')) filters.busType = 'seater';
      }
    }
    
    addTrace('thought', `Searching buses from ${from} to ${to} on ${date}`);
    
    // Step 1: Validate route
    addTrace('action', 'Validating route exists');
    const routeResult = await validateRoute(from, to);
    
    if (!routeResult.valid) {
      addTrace('observation', `Route not found: ${routeResult.error}`);
      return {
        agentResults: { bus_search: { success: false, error: routeResult.error, suggestions: routeResult.suggestions } },
        structuredData: { buses: [], route: null, error: routeResult.error },
        traces,
        decisionTrail: [{ agent: 'BusSearchAgent', status: 'no_route', steps: traces.length, duration_ms: Date.now() - startTime }]
      };
    }
    
    addTrace('observation', `Route found: ${routeResult.from} → ${routeResult.to} (${routeResult.distance}km)`);
    
    // Step 2: Find schedules
    addTrace('action', 'Querying schedules database');
    let schedules = await findSchedules(routeResult.routeId, date);
    addTrace('observation', `Found ${schedules.length} schedules`);
    
    if (schedules.length === 0) {
      return {
        agentResults: { bus_search: { success: true, buses: [], count: 0, message: 'No buses available on this date' } },
        structuredData: { buses: [], route: { from: routeResult.from, to: routeResult.to, date }, availableCount: 0 },
        traces,
        decisionTrail: [{ agent: 'BusSearchAgent', status: 'no_buses', steps: traces.length, duration_ms: Date.now() - startTime }]
      };
    }
    
    // Step 3: Calculate real-time availability
    addTrace('action', 'Calculating seat availability');
    schedules = await calculateAvailability(schedules);
    const beforeDepartureFilter = schedules.length;
    schedules = schedules.filter(s => isBookableDeparture(s.travel_date, s.departure_time));
    if (beforeDepartureFilter !== schedules.length) {
      addTrace('observation', `${beforeDepartureFilter - schedules.length} departed bus(es) excluded`);
    }
    const availableBuses = schedules.filter(s => s.is_available);
    addTrace('observation', `${availableBuses.length} buses have available seats`);
    
    // Step 4: Apply filters
    if (Object.keys(filters).length > 0) {
      addTrace('action', `Applying filters: ${JSON.stringify(filters)}`);
      schedules = applyFilters(schedules, filters);
      addTrace('observation', `${schedules.length} buses after filtering`);
    }
    
    // Step 5: Sort results
    schedules = sortBuses(schedules, sortBy);
    
    // Step 6: Generate recommendations
    addTrace('action', 'Generating recommendations');
    const recommendations = generateRecommendations(schedules);
    
    // Step 7: LLM price analysis (optional)
    let priceAnalysis = null;
    if (schedules.length > 0) {
      priceAnalysis = await analyzePricesWithLLM(schedules);
    }
    
    // Build result
    const result = {
      success: true,
      buses: schedules,
      count: schedules.length,
      availableCount: schedules.filter(s => s.is_available).length,
      route: { from: routeResult.from, to: routeResult.to, distance: routeResult.distance, date },
      recommendations,
      priceAnalysis,
      filters: filters,
      sortedBy: sortBy
    };
    
    addTrace('observation', `Search complete: ${result.count} buses found`);
    
    return {
      agentResults: { bus_search: result },
      structuredData: {
        buses: schedules,
        route: result.route,
        recommendations,
        priceAnalysis,
        availableCount: result.availableCount
      },
      traces,
      decisionTrail: [{ agent: 'BusSearchAgent', status: 'success', steps: traces.length, duration_ms: Date.now() - startTime }]
    };
    
  } catch (error) {
    console.error(`[BusSearchAgent] Error: ${error.message}`);
    addTrace('error', error.message);
    
    return {
      agentResults: { bus_search: { success: false, error: error.message } },
      structuredData: { buses: [], error: error.message },
      traces,
      error: error.message,
      decisionTrail: [{ agent: 'BusSearchAgent', status: 'error', steps: traces.length, duration_ms: Date.now() - startTime }]
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//                                   EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  busSearchNode,
  // Internal exports for testing
  busSearchNode_internal: {
    validateRoute,
    findSchedules,
    calculateAvailability,
    applyFilters,
    sortBuses,
    generateRecommendations
  }
};
