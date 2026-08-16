/**
 * LangGraph State Definition
 *
 * Defines the shared state (annotation) that flows through every node
 * in the agent graph. Each node reads from and writes to this state.
 *
 * Using LangGraph's Annotation API for typed, channel-based state management.
 */
const { Annotation } = require('@langchain/langgraph');

/**
 * AgentState — the single state object shared across the entire graph.
 *
 * Channels:
 *   taskId         - database task row id
 *   taskType       - search_buses | book_ticket | cancel_booking | general_query | get_seat_layout
 *   inputData      - normalised user input (cities, dates, passengers, etc.)
 *   agentResults   - map of agentName -> result object (accumulates across nodes)
 *   traces         - ordered list of ReAct trace entries (thought/action/observation)
 *   halted         - whether the pipeline was blocked (e.g. safety)
 *   haltReason     - human-readable reason for the halt
 *   finalResponse  - assembled response text for the user
 *   structuredData - structured payload accompanying the response
 *   decisionTrail  - list of agent decision summaries for explainability
 *   error          - error message if something went wrong
 *   startTime      - epoch ms when orchestration started
 */
const AgentState = Annotation.Root({
  taskId: Annotation({
    reducer: (_, val) => val,
    default: () => null
  }),
  taskType: Annotation({
    reducer: (_, val) => val,
    default: () => ''
  }),
  inputData: Annotation({
    reducer: (_, val) => val,
    default: () => ({})
  }),
  agentResults: Annotation({
    // Merge new results into existing map so every node can accumulate
    reducer: (prev, update) => ({ ...prev, ...update }),
    default: () => ({})
  }),
  traces: Annotation({
    // Append new traces
    reducer: (prev, update) => [...prev, ...update],
    default: () => []
  }),
  halted: Annotation({
    reducer: (_, val) => val,
    default: () => false
  }),
  haltReason: Annotation({
    reducer: (_, val) => val,
    default: () => null
  }),
  finalResponse: Annotation({
    reducer: (_, val) => val,
    default: () => ''
  }),
  structuredData: Annotation({
    reducer: (_, val) => val,
    default: () => ({})
  }),
  decisionTrail: Annotation({
    reducer: (prev, update) => [...prev, ...update],
    default: () => []
  }),
  error: Annotation({
    reducer: (_, val) => val,
    default: () => null
  }),
  startTime: Annotation({
    reducer: (_, val) => val,
    default: () => Date.now()
  })
});

module.exports = { AgentState };
