const { dbAll, dbGet } = require('../agents/dbUtils');

const FAQ_ENTRIES = [
  {
    patterns: [/what.*project|about.*project|tell me about.*project|what is this app|what is busgo|about busgo|project overview/i],
    answer:
      'BusGo is a conversational bus reservation platform. It lets users search buses, book seats, cancel bookings, and ask project/help questions through chat.'
  },
  {
    patterns: [/tech stack|which technologies|built with|what stack|frontend.*backend|what language/i],
    answer:
      'Frontend: React + TypeScript + Tailwind. Backend: Node.js + Express. Database: PostgreSQL. AI/agent layer: Ollama llama3.2 with a LangGraph multi-agent flow.'
  },
  {
    patterns: [/how to run|start the app|run the project|npm run dev|npm start|single command/i],
    answer:
      'Run the full project with `npm run dev`. It starts Ollama bootstrap, the backend, and the frontend apps.'
  },
  {
    patterns: [/rule.?based|completely rule|is it rule based|ai agent.*rule/i],
    answer:
      'The system is hybrid: deterministic rules handle critical booking, cancellation, seat-locking, and validation. Ollama/LangGraph handles intent understanding, ranking, and conversational responses.'
  },
  {
    patterns: [/what can you do|features|capabilities|what do you do|help me/i],
    answer:
      'I can search buses, show routes, book seats, cancel bookings, explain the project, and answer basic questions about the app.'
  },
  {
    patterns: [/what agents|which agents|agents do you have|list the agents|agent architecture|multi.?agent/i],
    answer:
      'The system uses a multi-agent architecture with an orchestrator, search agent, booking validation agent, cancellation agent, knowledge agent, and conversational formatter.'
  },
  {
    patterns: [/how does booking work|booking flow|how booking works|booking process|how do you book/i],
    answer:
      'Booking is hybrid: the AI understands your request, but the backend validates seats, time, and rules before any booking is committed.'
  },
  {
    patterns: [/what database|which database|postgres|database use|db use/i],
    answer:
      'The backend uses PostgreSQL, and the schema is created automatically on startup.'
  },
  {
    patterns: [/is it safe|safety|secure|trustworthy|hallucinat|can ai change db|write to db/i],
    answer:
      'Yes, critical actions are protected. The AI can suggest actions, but the backend validates them before any database write or booking commit.'
  },
  {
    patterns: [/what ports|which port|local port|run on port|open on port/i],
    answer:
      'The default local ports are 5000 for the backend and 5173, 5174, 5175 for the client, owner, and bus-owner apps.'
  },
  {
    patterns: [/llm|ollama|llama3\.2|ai model|model/i],
    answer:
      'The conversational layer uses local Ollama with the llama3.2 model. The backend still validates booking actions before any database changes.'
  }
];

function getProjectFaqResponse(message = '') {
  const text = (message || '').toLowerCase();
  for (const entry of FAQ_ENTRIES) {
    if (entry.patterns.some(pattern => pattern.test(text))) {
      return entry.answer;
    }
  }
  return null;
}

function normalizeCityName(city) {
  const aliases = {
    bengaluru: 'bangalore',
    bangaluru: 'bangalore',
    bombay: 'mumbai',
    madras: 'chennai',
    vijaywada: 'vijayawada',
    vijayawadda: 'vijayawada',
    tirupathi: 'tirupati',
    vizag: 'visakhapatnam',
    ananthapuram: 'anantapur',
    ananthapur: 'anantapur',
    anantapuram: 'anantapur',
    cuddapah: 'kadapa'
  };

  if (!city) return '';
  const normalized = city.toString().trim().toLowerCase();
  return aliases[normalized] || normalized;
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : '';
}

function parseTravelDate(message = '') {
  const text = message.toLowerCase();
  const { getLocalDateString, getOffsetLocalDateString } = require('../utils/dateUtils');

  if (/\btoday\b/.test(text)) return getLocalDateString();
  if (/\btomorrow\b/.test(text)) return getOffsetLocalDateString(1);

  const isoMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
  const monthPattern = text.match(/(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*/i) ||
    text.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*(\d{1,2})/i);
  if (monthPattern) {
    let day;
    let mon;
    if (/^\d/.test(monthPattern[1])) {
      day = monthPattern[1];
      mon = monthPattern[2].substring(0, 3).toLowerCase();
    } else {
      mon = monthPattern[1].substring(0, 3).toLowerCase();
      day = monthPattern[2];
    }
    const year = today.getFullYear();
    return `${year}-${months[mon]}-${String(day).padStart(2, '0')}`;
  }

  return null;
}

async function getDynamicRouteResponse(message = '', context = {}) {
  const text = (message || '').toLowerCase();
  const selectedRoute = context?.selectedRoute || context || {};

  const wantsDistance = /\b(how (?:far|many\s+(?:kilometers?|kms?|km))|distance|route distance|travel distance)\b/.test(text);
  const wantsBusNames = /\b(what are the bus names|list bus names|show bus names|bus names from|available bus names|which buses are|what buses are)\b/.test(text);
  const wantsBusCount = /\b(how many\s+(?:buses?|options?)|count of\s+(?:buses?|options?)|number of\s+(?:buses?|options?)|bus availability|available bus(?:es)?|how many are available)\b/.test(text);

  const routeListIntent = /\b(give all bus routes|show all routes|all routes|list all routes|routes available|available routes|bus routes)\b/.test(text);
  if (routeListIntent) {
    const routes = await dbAll(
      'SELECT DISTINCT from_city, to_city FROM routes ORDER BY from_city ASC, to_city ASC'
    );

    if (!routes.length) return 'No routes are currently available.';

    const lines = routes.map(route => `${capitalize(route.from_city)} → ${capitalize(route.to_city)}`);
    return `Available routes:\n\n${lines.map(line => `• ${line}`).join('\n')}`;
  }

  const routeRows = await dbAll(
    'SELECT DISTINCT from_city, to_city FROM routes ORDER BY from_city ASC, to_city ASC'
  );

  const citySet = new Set();
  routeRows.forEach(route => {
    citySet.add(normalizeCityName(route.from_city));
    citySet.add(normalizeCityName(route.to_city));
  });

  const cities = [...citySet].filter(Boolean);
  const normalizedMessage = text.replace(/\bfrom\b/g, ' from ').replace(/\bto\b/g, ' to ');

  // 1. Extract cities directly from the user message text FIRST
  let msgFromCity = null;
  let msgToCity = null;

  // Match "from X to Y" or "X to Y" in user message
  const fromToMatch = text.match(/from\s+([a-z]+)\s+to\s+([a-z]+)/i);
  const toMatch = text.match(/([a-z]+)\s+to\s+([a-z]+)/i);

  if (fromToMatch) {
    const c1 = normalizeCityName(fromToMatch[1]);
    const c2 = normalizeCityName(fromToMatch[2]);
    if (cities.includes(c1)) msgFromCity = c1;
    if (cities.includes(c2)) msgToCity = c2;
  } else if (toMatch) {
    const c1 = normalizeCityName(toMatch[1]);
    const c2 = normalizeCityName(toMatch[2]);
    if (cities.includes(c1) && cities.includes(c2)) {
      msgFromCity = c1;
      msgToCity = c2;
    }
  }

  // If not matched by pattern, search for city occurrences by character index position in user message
  if (!msgFromCity || !msgToCity) {
    const cityMatches = [];
    for (const city of cities) {
      let pos = normalizedMessage.indexOf(city);
      while (pos !== -1) {
        cityMatches.push({ city, index: pos });
        pos = normalizedMessage.indexOf(city, pos + 1);
      }
    }
    cityMatches.sort((a, b) => a.index - b.index);

    if (cityMatches.length >= 2) {
      msgFromCity = msgFromCity || cityMatches[0].city;
      msgToCity = msgToCity || cityMatches[1].city;
    } else if (cityMatches.length === 1) {
      if (normalizedMessage.includes('to ' + cityMatches[0].city)) {
        msgToCity = msgToCity || cityMatches[0].city;
      } else {
        msgFromCity = msgFromCity || cityMatches[0].city;
      }
    }
  }

  // Use message extracted cities if available, otherwise fall back to context
  const fallbackFrom = normalizeCityName(selectedRoute.fromCity || selectedRoute.from || context.fromCity || context.from || '');
  const fallbackTo = normalizeCityName(selectedRoute.toCity || selectedRoute.to || context.toCity || context.to || '');

  const fromCity = msgFromCity || fallbackFrom;
  const toCity = msgToCity || fallbackTo;

  // Extract travel date from message FIRST, otherwise fall back to context or today
  const msgDate = parseTravelDate(text);
  const travelDate = msgDate || (msgFromCity || msgToCity ? new Date().toISOString().split('T')[0] : (selectedRoute.travelDate || context.travelDate || new Date().toISOString().split('T')[0]));

  if (!fromCity || !toCity) return null;

  const route = await dbGet(
    `SELECT from_city, to_city, distance_km, duration_hours
     FROM routes
     WHERE LOWER(from_city) LIKE ?
       AND LOWER(to_city) LIKE ?
     LIMIT 1`,
    [`%${fromCity}%`, `%${toCity}%`]
  );

  if (!route) return null;

  const routeContext = {
    fromCity: capitalize(route.from_city),
    toCity: capitalize(route.to_city),
    distanceKm: route.distance_km,
    durationHours: route.duration_hours,
    travelDate
  };

  if (wantsDistance) {
    return {
      response: `The distance from ${routeContext.fromCity} to ${routeContext.toCity} is ${route.distance_km} km, with an estimated travel time of ~${route.duration_hours} hours.`,
      structuredData: {
        routeFaq: true,
        selectedRoute: routeContext
      }
    };
  }

  if (!wantsBusCount && !wantsBusNames) return null;

  const schedules = await dbAll(
    `SELECT b.bus_name, b.bus_number, b.bus_type, s.departure_time, s.arrival_time
     FROM schedules s
     JOIN buses b ON s.bus_id = b.id
     JOIN routes r ON s.route_id = r.id
     WHERE LOWER(r.from_city) LIKE ?
       AND LOWER(r.to_city) LIKE ?
       AND s.travel_date = ?
       AND s.available_seats > 0
     ORDER BY s.departure_time ASC`,
    [`%${fromCity}%`, `%${toCity}%`, travelDate]
  );

  if (!schedules.length) {
    return {
      response: `❌ No buses found from ${routeContext.fromCity} to ${routeContext.toCity} on ${travelDate}.`,
      structuredData: {
        routeFaq: true,
        selectedRoute: routeContext
      }
    };
  }

  if (wantsBusNames) {
    const names = [...new Set(schedules.map(schedule => schedule.bus_name))];
    return {
      response: `Here are the bus names from ${routeContext.fromCity} to ${routeContext.toCity} on ${travelDate}:\n\n${names.map((name, index) => `${index + 1}. ${name}`).join('\n')}`,
      structuredData: {
        routeFaq: true,
        selectedRoute: routeContext,
        availableBuses: schedules.map(schedule => ({
          busName: schedule.bus_name,
          busNumber: schedule.bus_number,
          busType: schedule.bus_type,
          departureTime: schedule.departure_time,
          arrivalTime: schedule.arrival_time
        }))
      }
    };
  }

  return {
    response: `There are ${schedules.length} available bus${schedules.length === 1 ? '' : 'es'} from ${routeContext.fromCity} to ${routeContext.toCity} on ${travelDate}.`,
    structuredData: {
      routeFaq: true,
      selectedRoute: routeContext,
      availableCount: schedules.length
    }
  };
}

module.exports = { getProjectFaqResponse, getDynamicRouteResponse };
