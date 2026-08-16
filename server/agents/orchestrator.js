/**
 * Orchestrator Agent — LangGraph-powered Multi-Agent Coordinator
 *
 * Role: Central controller of the multi-agent system
 * Responsibilities:
 *   - Receive user intent (from Conversational Agent or API)
 *   - Select the right LangGraph state-machine for the task type
 *   - Invoke the compiled graph which routes through the correct agent nodes
 *   - Return the final merged result to the caller
 *
 * Architecture:
 *   Uses @langchain/langgraph StateGraph with typed Annotation state.
 *   Each agent is a graph node; edges (including conditional edges) define
 *   the execution flow. The graph is compiled once per task type, cached,
 *   and invoked with the initial state.
 *
 * Graph flows (LangGraph-native):
 *   search_buses:     Validation → UserContext → BusSearch → PriceIntelligence → JourneyOptimization → RecommendationRanking → Conversational → Output
 *   book_ticket:      Validation → AnomalySafety →(safe?)→ BookingValidation →(ok?)→ PostBooking → Conversational → Output
 *   cancel_booking:   PolicyCancellation → Conversational → Output
 *   general_query:    Knowledge → Conversational → Output
 *   get_seat_layout:  SeatStrategy → Conversational → Output
 *   data_analysis:    Validation → DataAnalysis → Recommendation → Conversational → Output
 *
 * All agents are implemented as native LangGraph nodes in ./langgraph/nodes/
 */
const { dbRun } = require('./dbUtils');
const { getGraphForTask } = require('./langgraph');
const llmService = require('./langgraph/llmService');

/**
 * Build execution plan based on task type (metadata only — used by the
 * preview endpoint and the response payload; the actual execution is
 * handled by LangGraph nodes).
 * 
 * SIMPLIFIED 5-AGENT ARCHITECTURE:
 *   1. BusSearchAgent - Search, price analysis, recommendations (LLM)
 *   2. BookingValidationAgent - Validate, book, safety checks
 *   3. PolicyCancellationAgent - Cancellation and refunds
 *   4. KnowledgeAgent - General information (LLM)
 *   5. ConversationalAgent - Response formatting (LLM)
 */
function buildExecutionPlan(taskType) {
  const plan = { taskType, agents: [], description: '', engine: 'langgraph', coreAgentCount: 5 };

  switch (taskType) {
    case 'search_buses':
      plan.description = 'LangGraph flow: BusSearch(+LLM) → Conversational(+LLM) → END';
      plan.agents = [
        { name: 'BusSearchAgent', role: 'Search buses, analyze prices, rank recommendations (uses LLM)', usesLLM: true },
        { name: 'ConversationalAgent', role: 'Format results for user (uses LLM)', usesLLM: true }
      ];
      break;

    case 'get_seat_layout':
      plan.description = 'LangGraph flow: Knowledge(+LLM) → Conversational(+LLM) → END';
      plan.agents = [
        { name: 'KnowledgeAgent', role: 'Retrieve seat layout information (uses LLM)', usesLLM: true },
        { name: 'ConversationalAgent', role: 'Format seat layout for user (uses LLM)', usesLLM: true }
      ];
      break;

    case 'book_ticket':
      plan.description = 'LangGraph flow: BookingValidation → Conversational(+LLM) → END';
      plan.agents = [
        { name: 'BookingValidationAgent', role: 'Validate, check safety, process booking', usesLLM: false },
        { name: 'ConversationalAgent', role: 'Format booking confirmation (uses LLM)', usesLLM: true }
      ];
      break;

    case 'cancel_booking':
      plan.description = 'LangGraph flow: PolicyCancellation → Conversational(+LLM) → END';
      plan.agents = [
        { name: 'PolicyCancellationAgent', role: 'Calculate refund based on policy', usesLLM: false },
        { name: 'ConversationalAgent', role: 'Format cancellation details (uses LLM)', usesLLM: true }
      ];
      break;

    case 'general_query':
      plan.description = 'LangGraph flow: Knowledge(+LLM) → Conversational(+LLM) → END';
      plan.agents = [
        { name: 'KnowledgeAgent', role: 'Answer questions from knowledge base (uses LLM)', usesLLM: true },
        { name: 'ConversationalAgent', role: 'Format response for user (uses LLM)', usesLLM: true }
      ];
      break;

    default:
      plan.description = 'LangGraph flow: Knowledge(+LLM) → Conversational(+LLM) → END';
      plan.agents = [
        { name: 'KnowledgeAgent', role: 'Answer general questions (uses LLM)', usesLLM: true },
        { name: 'ConversationalAgent', role: 'Format response (uses LLM)', usesLLM: true }
      ];
  }

  return plan;
}

/**
 * Main orchestration function — powered by LangGraph
 *
 * 1. Normalises input field names
 * 2. Selects the compiled LangGraph StateGraph for the task type
 * 3. Invokes the graph with the initial AgentState
 * 4. Assembles and returns the final result payload
 */
async function orchestrateAgents(taskId, taskType, inputData) {
  const startTime = Date.now();

  // Normalize common field-name variations so agents always see canonical names
  const normalized = { ...inputData };
  
  // City name normalization - support all variations
  if (normalized.from && !normalized.fromCity) normalized.fromCity = normalized.from;
  if (normalized.to && !normalized.toCity) normalized.toCity = normalized.to;
  if (normalized.source && !normalized.fromCity) normalized.fromCity = normalized.source;
  if (normalized.destination && !normalized.toCity) normalized.toCity = normalized.destination;
  if (normalized.from_city && !normalized.fromCity) normalized.fromCity = normalized.from_city;
  if (normalized.to_city && !normalized.toCity) normalized.toCity = normalized.to_city;
  
  // Also set source/destination for backward compatibility
  if (normalized.fromCity && !normalized.source) normalized.source = normalized.fromCity;
  if (normalized.toCity && !normalized.destination) normalized.destination = normalized.toCity;
  
  // Date normalization
  if (normalized.date && !normalized.travelDate) normalized.travelDate = normalized.date;
  if (normalized.travel_date && !normalized.travelDate) normalized.travelDate = normalized.travel_date;
  if (normalized.travelDate && !normalized.date) normalized.date = normalized.travelDate;
  
  // Passenger count normalization
  if (normalized.passengers && !normalized.passengerCount) normalized.passengerCount = normalized.passengers;
  
  // Booking ID normalization
  if (normalized.booking_id && !normalized.bookingId) normalized.bookingId = normalized.booking_id;

  console.log(`\n[LangGraph Orchestrator] Task ${taskId} | Type: ${taskType}`);
  console.log(`[LangGraph Orchestrator] Route: ${normalized.fromCity || normalized.source || 'N/A'} → ${normalized.toCity || normalized.destination || 'N/A'}, Date: ${normalized.travelDate || normalized.date || 'N/A'}`);

  // Step 1: Get the compiled LangGraph for this task type
  const graph = getGraphForTask(taskType);
  const plan = buildExecutionPlan(taskType);
  console.log(`[LangGraph Orchestrator] Graph: ${plan.description}`);
  console.log(`[LangGraph Orchestrator] Nodes: ${plan.agents.map(a => a.name).join(' → ')}`);

  // Step 2: Build initial state for the graph
  const initialState = {
    taskId,
    taskType,
    inputData: normalized,
    agentResults: {},
    traces: [],
    halted: false,
    haltReason: null,
    finalResponse: '',
    structuredData: {},
    decisionTrail: [],
    error: null,
    startTime
  };

  let finalState;
  try {
    // Step 3: Invoke the LangGraph — it runs all nodes through edges automatically
    finalState = await graph.invoke(initialState);
  } catch (graphError) {
    console.error(`[LangGraph Orchestrator] Graph execution failed: ${graphError.message}`);
    finalState = {
      ...initialState,
      error: graphError.message,
      halted: true,
      haltReason: `Graph execution error: ${graphError.message}`
    };
  }

  const totalDuration = Date.now() - startTime;
  const totalSteps = finalState.decisionTrail.reduce((sum, d) => sum + (d.steps || 0), 0);

  // Step 4: Build the response payload (same shape as before for backward compat)
  const finalResult = {
    success: !finalState.halted,
    taskType,
    engine: 'langgraph',
    executionPlan: {
      description: plan.description,
      agentsPlanned: plan.agents.map(a => ({ name: a.name, role: a.role }))
    },
    agentsInvolved: finalState.decisionTrail.map(d => d.agent),
    agentExecutions: finalState.decisionTrail.map(d => ({
      agent: d.agent,
      status: d.status,
      steps: d.steps,
      duration_ms: d.duration_ms
    })),
    reactSummary: {
      totalSteps,
      totalDuration_ms: totalDuration,
      traceCount: finalState.traces.length
    },
    response: finalState.finalResponse || '',
    structuredData: finalState.structuredData || {},
    decisionTrail: finalState.decisionTrail || [],
    allAgentResults: finalState.agentResults,
    halted: finalState.halted,
    haltReason: finalState.halted ? finalState.haltReason : null
  };

  // Step 5: Save execution summary to DB
  dbRun(
    `INSERT INTO agent_execution_summary (task_id, execution_plan, agents_invoked, total_react_steps, total_duration_ms, final_status, final_output)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      taskId,
      JSON.stringify(plan),
      JSON.stringify(finalResult.agentsInvolved),
      totalSteps,
      totalDuration,
      finalState.halted ? 'halted' : 'completed',
      JSON.stringify(finalResult)
    ]
  ).catch(err => {
    console.error(`[LangGraph Orchestrator] Execution summary save failed: ${err.message}`);
  });

  console.log(`[LangGraph Orchestrator] Task ${taskId} ${finalState.halted ? 'HALTED' : 'COMPLETED'} | ${totalSteps} ReAct steps | ${totalDuration}ms total`);
  console.log('');

  return finalResult;
}

/**
 * Parse natural language input into structured intent
 * This is what the Conversational Agent uses to understand user requests
 */
function parseUserIntent(userMessage) {
  const message = (userMessage || '').toLowerCase().trim();
  // Normalize common typo where users write object and route glue together (e.g., "penfrom")
  const normalizedMessage = message.replace(/\b([a-z]{3,})(from|to)\b/g, '$1 $2');

  // Comprehensive non-travel keyword detection
  const NON_TRAVEL_KEYWORDS = /\b(biryani|biriyani|pizza|burger|sandwich|dosa|idli|meal|food|lunch|dinner|breakfast|snack|snacks|coffee|tea|juice|water|gas|petrol|diesel|grocery|groceries|parcel|order|delivery|shopping|medicine|medicines|clothes|clothing|electronics|courier|furniture|shoes|mobile|phone|laptop|rice|chicken|mutton|fish|egg|eggs|milk|bread|cake|sweets|ice\s*cream|kaya|pan\s*india|movie|cinema|flight|train|hotel|room|card|pen|orange)\b/;
  const NON_TRAVEL_BOOK_OBJECT = /\b(?:book|order|deliver|send|buy|purchase|get)\s+(?:a|an|the|some|my)?\s*(?:biryani|biriyani|pizza|burger|sandwich|dosa|idli|meal|food|lunch|dinner|breakfast|snack|snacks|coffee|tea|juice|water|gas|petrol|diesel|grocery|groceries|parcel|delivery|medicine|medicines|clothes|clothing|electronics|courier|furniture|shoes|mobile|phone|laptop|rice|chicken|mutton|fish|egg|eggs|milk|bread|cake|sweets|ice\s*cream|kaya|pan\s*india|movie|cinema|flight|train|hotel|room|card|pen|orange)\b/;
  const BOOKING_INTENT_OBJECT_PATTERN = /\b(?:book|reserve|confirm)\s+(?:a|an|the|my|our|one|1|two|2|three|3)?\s*([a-z][a-z\-]{2,})\s*(?:from|to|for|on|at|by|today|tomorrow|$)/i;
  const ALLOWED_BOOKING_OBJECTS = new Set([
    'ticket', 'tickets', 'seat', 'seats', 'bus', 'booking', 'reservation',
    'journey', 'trip', 'travel', 'ride', 'berth', 'berths'
  ]);

  // Greeting
  if (/^(hi|hello|hey|greetings|good\s*(morning|afternoon|evening))\b/.test(message) && message.length < 30) {
    return { taskType: 'general_query', confidence: 0.9 };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // STANDALONE PNR — User replied with just a PNR (after being asked)
  // Match patterns like "PNR1771064512269TUBR2" or just the alphanumeric code
  // ════════════════════════════════════════════════════════════════════════════
  const isPNROnly = /^pnr[0-9]{10,}[a-z0-9]*$/i.test(message) || 
                    /^pnr[:\s]*[a-z0-9]{15,}$/i.test(message);
  if (isPNROnly) {
    return { taskType: 'cancel_booking', confidence: 0.95 };
  }

  // Knowledge/info question — user asking about the system, not performing an action
  // Note: Use word boundaries for short words like "can", "do" to avoid matching "cancel"
  const isQuestion = /\?|how |what |when |where |which |tell |explain |does |do you| do | can you| can i|policy|work |give |describe|detail|info|about/.test(message);
  const isKnowledgeKeyword = /distance|how far|duration|how long|route.*available|what route|which route|price|cost|fare|minimum|maximum|cancel.*polic|refund.*polic|feature|agent|how.*work|what is|about|seat.*layout|tech|system|type.*bus|operator|schedule|timing|departure|best|better|unique|special|advantage|compare|comparison|usp|stand.*out|why.*choose|strength|highlight|impressive/.test(message);

  // City detection (moved up for early checks)
  const hasCityName = /hyderabad|vijayawada|vijayawadda|vijaywada|bangalore|chennai|mumbai|pune|delhi|jaipur|tirupati|tirupathi|visakhapatnam|vizag|kadapa|anantapur|ananthapuram|ananthapur|anantapuram|cuddapah/i.test(normalizedMessage);
  const hasTravelContext = /from.*to|bus.*from|bus.*to|travel|journey|trip/.test(normalizedMessage);

  // ════════════════════════════════════════════════════════════════════════════
  // BOOKING/CANCELLATION HELP QUERY — "How to book/cancel?"
  // ════════════════════════════════════════════════════════════════════════════
  const isHowToQuery = /how to book|how do i book|booking steps|steps to book|how to cancel|cancellation steps|how do i cancel|how to reserve/.test(message);
  if (isHowToQuery) {
    return { taskType: 'general_query', confidence: 0.95 };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // APP INFO QUERY — "What features does this app have?"
  // ════════════════════════════════════════════════════════════════════════════
  const isAppInfoQuery = /what feature|about app|about this|app info|what can you do|what do you do|what can this|tell me about|about your|about service|this service|capabilities/.test(message);
  if (isAppInfoQuery) {
    return { taskType: 'general_query', confidence: 0.95 };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // BUS COUNT QUERY — "How many buses from X to Y?" should go to knowledge agent
  // ════════════════════════════════════════════════════════════════════════════
  const isBusCountQuery = /how many bus|total bus|number of bus|count of bus|buses available on|total options|how many options/.test(message);
  if (isBusCountQuery && hasCityName) {
    return { taskType: 'general_query', confidence: 0.95 };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FARE/PRICE QUERY — "What is the minimum/maximum fare from X to Y?"
  // ════════════════════════════════════════════════════════════════════════════
  const isFareQuery = /minimum amount|minimum price|minimum fare|minimum cost|min price|min fare|cheapest|lowest price|maximum price|max price|highest price|expensive|price range|fare range|how much to travel|how much does it cost|cost to travel|need to spend|need to spent|spent to travel/.test(message);
  if (isFareQuery && hasCityName) {
    return { taskType: 'general_query', confidence: 0.95 };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TRAVEL TIME QUERY — "How much time from X to Y?"
  // ════════════════════════════════════════════════════════════════════════════
  const isTravelTimeQuery = /how much time|how long|travel time|duration|hours to travel|time required|time taken|journey time/.test(message);
  if (isTravelTimeQuery && hasCityName) {
    return { taskType: 'general_query', confidence: 0.95 };
  }

  // If it's a question about the system (even with city names), route to general_query
  if (isQuestion && isKnowledgeKeyword) {
    return { taskType: 'general_query', confidence: 0.9 };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CANCELLATION INTENT — Check FIRST (before booking)
  // Must be checked before booking because cancellation messages often contain
  // city names, dates, and passenger details which would otherwise match booking
  // ════════════════════════════════════════════════════════════════════════════
  const hasCancelVerb = /cancel|cancell|cancellation/i.test(message);
  const hasPNR = /pnr[:\s]*[a-z0-9]+/i.test(message) || /pnr\d+[a-z0-9]*/i.test(message);
  const hasBookingRef = /booking\s*(id|#|number)?[:\s]*\d+/i.test(message);
  
  // If user says "cancel" with any identifier (PNR, booking ID, or even just "my booking")
  if (hasCancelVerb && !isQuestion) {
    // Has PNR or booking ID - definitely cancellation
    if (hasPNR || hasBookingRef) {
      return { taskType: 'cancel_booking', confidence: 0.95 };
    }
    // "cancel my booking", "cancel the ticket", "cancel seat"
    if (/cancel\s*(my|the|this|a)?\s*(booking|ticket|seat|reservation)/i.test(message)) {
      return { taskType: 'cancel_booking', confidence: 0.9, needsPNR: true };
    }
    // Just "cancel" with city names (user describing which booking to cancel)
    if (hasCityName) {
      return { taskType: 'cancel_booking', confidence: 0.85, needsPNR: !hasPNR };
    }
  }
  
  // Refund requests are also cancellations
  if (/refund/.test(message) && /booking|ticket|pnr|my/i.test(message) && !isQuestion) {
    return { taskType: 'cancel_booking', confidence: 0.85, needsPNR: !hasPNR };
  }

  // BOOKING INTENT — Check after cancellation
  // "Book a ticket", "book from X to Y", "reserve a seat", "book 2 tickets"
  // Now also handles preferences like "window seat", "evening", "morning", "with name X"
  // Position preferences: "front seat", "back seat", "middle seat", "side seat"
  const hasBookingVerb = /\b(book|reserve|confirm)\b/.test(normalizedMessage);
  const hasBookingTarget = /ticket|seat|bus|journey/.test(message);
  const hasPassengerDetails = /\bname\b|\bage\b|\bgender\b|\bpassenger\b/.test(message);
  const hasTimePreference = /\b(morning|afternoon|evening|night)\b/.test(message);
  const hasSeatPreference = /\b(window|aisle|lower|upper|front|back|rear|middle|center|side)\b/.test(message);

  // ════════════════════════════════════════════════════════════════════════════
  // GUARDRAIL: Block booking when non-travel item words are detected
  // Never auto-select seats or proceed to payment for non-travel items
  // ════════════════════════════════════════════════════════════════════════════
  const nonTravelMatch = normalizedMessage.match(NON_TRAVEL_KEYWORDS);
  const bookingObjectMatch = normalizedMessage.match(BOOKING_INTENT_OBJECT_PATTERN);
  const bookingObject = bookingObjectMatch ? bookingObjectMatch[1].toLowerCase() : null;
  const hasUnknownBookingObject = bookingObject && !ALLOWED_BOOKING_OBJECTS.has(bookingObject);

  if ((nonTravelMatch && (hasBookingVerb || NON_TRAVEL_BOOK_OBJECT.test(normalizedMessage))) ||
      (hasBookingVerb && hasCityName && hasUnknownBookingObject)) {
    // Collect all detected non-travel words
    const allMatches = [];
    let m;
    const globalRegex = new RegExp(NON_TRAVEL_KEYWORDS.source, 'gi');
    while ((m = globalRegex.exec(normalizedMessage)) !== null) {
      if (!allMatches.includes(m[1].toLowerCase())) allMatches.push(m[1].toLowerCase());
    }
    if (hasUnknownBookingObject && !allMatches.includes(bookingObject)) {
      allMatches.push(bookingObject);
    }
    return {
      taskType: 'general_query',
      confidence: 0.95,
      blocked: true,
      blockedReason: 'non_travel_items',
      detectedWords: allMatches
    };
  }
  
  // If user mentions passenger details, name, age, gender - it's definitely a booking
  if (hasPassengerDetails && hasCityName) {
    return { taskType: 'book_ticket', confidence: 0.95 };
  }
  
  if (hasBookingVerb && !isQuestion) {
    // If has city names and travel context, definitely booking (even with preferences)
    if (hasCityName && (hasTravelContext || hasTimePreference || hasSeatPreference || hasPassengerDetails)) {
      return { taskType: 'book_ticket', confidence: 0.95 };
    }
    // "book a ticket" with cities mentioned
    if (hasCityName && hasBookingTarget) {
      return { taskType: 'book_ticket', confidence: 0.9 };
    }
    // "book seat" with preferences
    if (hasBookingTarget && (hasTimePreference || hasSeatPreference)) {
      return { taskType: 'book_ticket', confidence: 0.9 };
    }
    // Just "book" keyword with actionable context
    if (hasBookingTarget) {
      return { taskType: 'book_ticket', confidence: 0.85 };
    }
  }

  // Search intent — for finding/browsing, not booking
  const hasSearchVerb = /search|find|show|look|get|check|see|available/.test(message);
  const isActionSearch = /find.*bus|search.*bus|show.*bus|look.*bus|get.*bus|bus.*from|need.*bus|want.*bus|available.*bus|buses.*available/.test(message);

  if (hasCityName && isActionSearch && !hasBookingVerb) {
    return { taskType: 'search_buses', confidence: 0.9 };
  }
  if (hasCityName && hasTravelContext && hasSearchVerb && !isKnowledgeKeyword && !hasBookingVerb) {
    return { taskType: 'search_buses', confidence: 0.9 };
  }
  if (hasCityName && hasTravelContext && !isQuestion && !hasBookingVerb) {
    return { taskType: 'search_buses', confidence: 0.85 };
  }

  // Note: Cancellation intent is now checked earlier (before booking)

  // Seat intent
  if (/seat.*layout|select.*seat|seat.*map|choose.*seat/.test(message)) {
    return { taskType: 'get_seat_layout', confidence: 0.75 };
  }

  // General knowledge / info questions
  if (/what|how|which|where|when|tell|explain|info|about|help|policy|feature|agent|route|city|price|fare|cost|operator|type|distance/.test(message)) {
    return { taskType: 'general_query', confidence: 0.8 };
  }

  // Default to general query instead of search (prevents undefined city errors)
  return { taskType: 'general_query', confidence: 0.5 };
}

/**
 * Advanced LLM-based Intent Parser with Chain of Thought reasoning
 * Used as a fallback or for complex queries where regex lacks confidence.
 */
/**
 * Extract entities via Gemini LLM to prevent regex capturing date terms into names
 */
async function extractEntitiesWithLLM(message) {
  const systemPrompt = `You are an AI Entity Extractor for a bus booking system.
Extract structured fields from the user message into JSON.
Return JSON ONLY with this schema:
{
  "fromCity": "string or null",
  "toCity": "string or null",
  "travelDate": "YYYY-MM-DD or today|tomorrow|null",
  "passengerName": "string or null (ONLY the actual human person name, exclude words like 'on', 'tomorrow', 'today', 'for', 'seat', 'bus')",
  "passengerNames": ["array of passenger names if multiple"],
  "preferMinFare": true|false
}

Rule:
- 'passengerName' MUST NOT contain date modifiers like 'tomorrow', 'today', 'on tomorrow', 'evening', 'morning'.
- Set 'preferMinFare': true if user requests 'minimum fare', 'cheapest', 'lowest fare', 'lowest price', 'budget'.
- Example: "book a seat from Ananthapuram to Bhimavaram with name Reddy on tomorrow" -> {"fromCity":"Ananthapuram","toCity":"Bhimavaram","travelDate":"tomorrow","passengerName":"Reddy","preferMinFare":false}`;

  try {
    const raw = await llmService.generate(message, { systemPrompt, temperature: 0.1, maxTokens: 200 });
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
  } catch (e) {
    console.warn('[EntityLLM] Extraction failed:', e.message);
  }
  return null;
}

async function parseUserIntentLLM(userMessage) {
  const systemPrompt = `You are a Senior Project AI Orchestrator for BusGo, a bus booking app.
Your job is to read the user's message, understand the user's goal even if they phrase it in many different ways, and map it to exactly one supported operation.

Our system operations (taskTypes) are:
1. "search_buses" - Looking for available buses, schedules, routes.
2. "book_ticket" - Specifically asking to reserve, book, or select seats.
3. "cancel_booking" - Cancelling a ticket, releasing a seat, asking for a refund.
4. "general_query" - Asking about policies, fares, app features, FAQ, or conversational chatter.
5. "deselect_seat" - Explicitly asking to remove, deselect, or drop an already held seat.
6. "blocked" - Asking for non-travel items (food, delivery, electronics).

INSTRUCTIONS:
1. Handle paraphrases, typos, and indirect phrasing.
2. If the user is asking about the project, app, tech stack, model, or how the system works, choose "general_query".
3. If the user is asking for buses/routes/counts, choose "search_buses" unless they are clearly booking.
4. If the user is asking to book, reserve, confirm, or buy tickets/seats, choose "book_ticket".
5. If the user is asking to cancel a ticket, choose "cancel_booking".
6. If the user is asking for food/product/shopping/non-travel items, choose "blocked".
7. Output ONLY a JSON object exactly like this:
{
  "taskType": "one_of_the_allowed_strings_above",
  "confidence": 0.95,
  "reasoning": "A short summary of your thought process"
}

Examples:
- "give all bus routes" -> {"taskType":"search_buses","confidence":0.93,"reasoning":"User wants route availability."}
- "how many buses are available from Vijayawada to Hyderabad today" -> {"taskType":"search_buses","confidence":0.95,"reasoning":"User wants a count of buses for a route and date."}
- "book a seat under 1k" -> {"taskType":"book_ticket","confidence":0.91,"reasoning":"User wants to reserve a bus seat and included a price preference."}
- "are u completely rule based or not" -> {"taskType":"general_query","confidence":0.96,"reasoning":"User is asking about the project architecture."}
- "show me buses from Hyderabad to Bangalore tomorrow evening" -> {"taskType":"search_buses","confidence":0.95,"reasoning":"User wants available buses on a route with a time preference."}`;

  try {
    const rawResponse = await llmService.generate(userMessage, {
      systemPrompt,
      maxTokens: 500,
      temperature: 0.3
    });
    
    // Extract JSON from response (handling potential <think> output from Llama)
    let jsonString = rawResponse;
    const jsonMatch = rawResponse.match(/```json\s*([\s\S]*?)\s*```/) || rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonString = jsonMatch[1] || jsonMatch[0];
    }
    
    const intentData = JSON.parse(jsonString);
    if (intentData && intentData.taskType) {
      return intentData;
    }
  } catch (error) {
    console.error("[IntentLLM] Failed to parse intent via LLM:", error.message);
  }
  
  return null; // Fallback handled by caller
}

module.exports = {
  orchestrateAgents,
  buildExecutionPlan,
  parseUserIntent,
  parseUserIntentLLM,
  extractEntitiesWithLLM
};
