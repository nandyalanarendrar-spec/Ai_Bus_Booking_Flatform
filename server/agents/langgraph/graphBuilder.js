/**
 * LangGraph Graph Builder (Simplified - 5 Core Agents)
 *
 * Builds a StateGraph for each task type using only 5 CORE agents:
 *   1. busSearchNode - Search buses (includes price analysis via LLM)
 *   2. bookingValidationNode - Validate and process bookings (includes safety checks)
 *   3. policyCancellationNode - Handle cancellations and refunds
 *   4. knowledgeNode - Answer general questions (uses LLM)
 *   5. conversationalNode - Format all responses (uses LLM)
 *
 * This simplified architecture:
 *   - Reduces complexity while maintaining full functionality
 *   - Each core agent handles its complete domain
 *   - LLM (Ollama llama3.2) used where it adds value
 *   - Clear state flow with minimal edges
 */
const { StateGraph, END, START } = require('@langchain/langgraph');
const { AgentState } = require('./stateDefinition');

// Import only 5 CORE LangGraph nodes
const {
  busSearchNode,          // Core Agent 1: Search & Recommendations
  bookingValidationNode,  // Core Agent 2: Booking Processing
  policyCancellationNode, // Core Agent 3: Cancellation Handling
  knowledgeNode,          // Core Agent 4: General Knowledge
  conversationalNode      // Core Agent 5: Response Formatting
} = require('./nodes');

// ── Conditional edge helper ──────────────────────────────────────────────────

/** After any processing node, decide whether to format success or error response. */
function shouldContinueToResponse(state) {
  // Always go to conversational to format the response (success or error)
  return 'conversational';
}

// ── Graph builders per task type (SIMPLIFIED) ────────────────────────────────

/**
 * search_buses graph (Simplified):
 *   START → bus_search → conversational → END
 * 
 * BusSearchNode now includes:
 *   - Input validation
 *   - Database search
 *   - Price intelligence (LLM-powered)
 *   - Journey optimization
 *   - Recommendation ranking
 */
function buildSearchGraph() {
  const graph = new StateGraph(AgentState);

  graph
    .addNode('bus_search', busSearchNode)
    .addNode('conversational', conversationalNode);

  graph
    .addEdge(START, 'bus_search')
    .addEdge('bus_search', 'conversational')
    .addEdge('conversational', END);

  return graph.compile();
}

/**
 * book_ticket graph (Simplified):
 *   START → booking_validation → conversational → END
 * 
 * BookingValidationNode now includes:
 *   - Input validation
 *   - Anomaly/safety checks
 *   - Seat availability check
 *   - Booking creation
 *   - Post-booking info
 */
function buildBookingGraph() {
  const graph = new StateGraph(AgentState);

  graph
    .addNode('booking_validation', bookingValidationNode)
    .addNode('conversational', conversationalNode);

  graph
    .addEdge(START, 'booking_validation')
    .addEdge('booking_validation', 'conversational')
    .addEdge('conversational', END);

  return graph.compile();
}

/**
 * cancel_booking graph:
 *   START → policy_cancellation → conversational → END
 */
function buildCancellationGraph() {
  const graph = new StateGraph(AgentState);

  graph
    .addNode('policy_cancellation', policyCancellationNode)
    .addNode('conversational', conversationalNode);

  graph
    .addEdge(START, 'policy_cancellation')
    .addEdge('policy_cancellation', 'conversational')
    .addEdge('conversational', END);

  return graph.compile();
}

/**
 * general_query graph:
 *   START → knowledge → conversational → END
 */
function buildKnowledgeGraph() {
  const graph = new StateGraph(AgentState);

  graph
    .addNode('knowledge', knowledgeNode)
    .addNode('conversational', conversationalNode);

  graph
    .addEdge(START, 'knowledge')
    .addEdge('knowledge', 'conversational')
    .addEdge('conversational', END);

  return graph.compile();
}

/**
 * get_seat_layout graph (Uses knowledge for seat info):
 *   START → knowledge → conversational → END
 */
function buildSeatLayoutGraph() {
  const graph = new StateGraph(AgentState);

  graph
    .addNode('knowledge', knowledgeNode)
    .addNode('conversational', conversationalNode);

  graph
    .addEdge(START, 'knowledge')
    .addEdge('knowledge', 'conversational')
    .addEdge('conversational', END);

  return graph.compile();
}

// ── Registry — map taskType to compiled graph (SIMPLIFIED) ───────────────────
const graphRegistry = {};

function getGraphForTask(taskType) {
  // Lazily compile and cache graphs
  if (!graphRegistry[taskType]) {
    switch (taskType) {
      case 'search_buses':
        graphRegistry[taskType] = buildSearchGraph();
        break;
      case 'book_ticket':
        graphRegistry[taskType] = buildBookingGraph();
        break;
      case 'cancel_booking':
        graphRegistry[taskType] = buildCancellationGraph();
        break;
      case 'general_query':
        graphRegistry[taskType] = buildKnowledgeGraph();
        break;
      case 'get_seat_layout':
        graphRegistry[taskType] = buildSeatLayoutGraph();
        break;
      default:
        // Fall back to knowledge graph for unknown task types
        graphRegistry[taskType] = buildKnowledgeGraph();
    }
  }
  return graphRegistry[taskType];
}

module.exports = {
  getGraphForTask,
  // Export builders for testing / custom composition
  buildSearchGraph,
  buildBookingGraph,
  buildCancellationGraph,
  buildKnowledgeGraph,
  buildSeatLayoutGraph
};
