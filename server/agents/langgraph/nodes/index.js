/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║          BUSGO AI - LANGGRAPH NODES INDEX (5 CORE AGENTS)                   ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                              ║
 * ║  This file exports all 5 core AI agents for the LangGraph system.           ║
 * ║  Each agent is a LangGraph node function that processes state.              ║
 * ║                                                                              ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  AGENT SUMMARY:                                                              ║
 * ║  ┌───────────────────────────────────────────────────────────────────────┐  ║
 * ║  │ # │ Agent Name            │ Task Type      │ LLM │ DB      │ Purpose  │  ║
 * ║  ├───┼──────────────────────┼────────────────┼─────┼─────────┼──────────┤  ║
 * ║  │ 1 │ busSearchNode        │ search_buses   │ Yes │ Read    │ Search   │  ║
 * ║  │ 2 │ bookingValidationNode│ book_ticket    │ No  │ R/W     │ Book     │  ║
 * ║  │ 3 │ policyCancellationNode│ cancel_booking│ No  │ R/W     │ Cancel   │  ║
 * ║  │ 4 │ knowledgeNode        │ general_query  │ Yes │ Read    │ FAQs     │  ║
 * ║  │ 5 │ conversationalNode   │ ALL (final)    │ Yes │ None    │ Format   │  ║
 * ║  └───────────────────────────────────────────────────────────────────────┘  ║
 * ║                                                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

// ─────────────────────────────────────────────────────────────────────────────
// CORE AGENT IMPORTS
// ─────────────────────────────────────────────────────────────────────────────

const { busSearchNode, busSearchNode_internal } = require('./busSearchNode');
const { bookingValidationNode, bookingValidationNode_internal } = require('./bookingValidationNode');
const { policyCancellationNode, policyCancellationNode_internal } = require('./policyCancellationNode');
const { knowledgeNode, knowledgeNode_internal } = require('./knowledgeNode');
const { conversationalNode, conversationalNode_internal } = require('./conversationalNode');

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  // ═══════════════════════════════════════════════════════════════════════════
  // CORE LANGGRAPH NODE FUNCTIONS
  // These are used by graphBuilder.js
  // ═══════════════════════════════════════════════════════════════════════════
  
  busSearchNode,           // Agent 1: Search buses
  bookingValidationNode,   // Agent 2: Process bookings
  policyCancellationNode,  // Agent 3: Handle cancellations
  knowledgeNode,           // Agent 4: Answer FAQs
  conversationalNode,      // Agent 5: Format responses
  
  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL EXPORTS (FOR TESTING)
  // ═══════════════════════════════════════════════════════════════════════════
  
  _internal: {
    busSearch: busSearchNode_internal,
    booking: bookingValidationNode_internal,
    cancellation: policyCancellationNode_internal,
    knowledge: knowledgeNode_internal,
    conversational: conversationalNode_internal
  }
};
