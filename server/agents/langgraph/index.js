/**
 * LangGraph Index — barrel export for the langgraph sub-module
 * 
 * SIMPLIFIED 5-Agent LangGraph Architecture:
 *   1. busSearchNode - Search buses with LLM-powered analysis
 *   2. bookingValidationNode - Process bookings with safety checks
 *   3. policyCancellationNode - Handle cancellations and refunds
 *   4. knowledgeNode - Answer general questions with LLM
 *   5. conversationalNode - Format responses with LLM
 * 
 * Integrates with local Ollama llama3.2 for LLM capabilities.
 */
const { AgentState } = require('./stateDefinition');
const { 
  getGraphForTask, 
  buildSearchGraph, 
  buildBookingGraph, 
  buildCancellationGraph, 
  buildKnowledgeGraph, 
  buildSeatLayoutGraph
} = require('./graphBuilder');

// Import only the 5 core nodes
const {
  busSearchNode,
  bookingValidationNode,
  policyCancellationNode,
  knowledgeNode,
  conversationalNode
} = require('./nodes');

const llmService = require('./llmService');

module.exports = {
  // State definition
  AgentState,
  
  // Graph builders
  getGraphForTask,
  buildSearchGraph,
  buildBookingGraph,
  buildCancellationGraph,
  buildKnowledgeGraph,
  buildSeatLayoutGraph,
  
  // 5 Core agent nodes
  coreNodes: {
    busSearchNode,
    bookingValidationNode,
    policyCancellationNode,
    knowledgeNode,
    conversationalNode
  },
  
  // LLM service (Ollama llama3.2)
  llmService
};
