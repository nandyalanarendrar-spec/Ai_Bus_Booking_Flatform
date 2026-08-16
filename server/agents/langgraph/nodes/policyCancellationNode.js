/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                  CANCELLATION AGENT (CORE AGENT #3)                          ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  PURPOSE: Handle booking cancellations with tiered refund policies          ║
 * ║  USES LLM: No - policy rules are deterministic                              ║
 * ║  DATABASE: Read-write via dbUtils (async PostgreSQL)                        ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  FLOW: START → policyCancellationNode → conversationalNode → END            ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 * 
 * REFUND POLICY:
 *   >24 hours before departure: 90% refund
 *   12-24 hours: 75% refund
 *   6-12 hours: 50% refund
 *   2-6 hours: 25% refund
 *   <2 hours: No cancellation allowed
 */

const { dbGet, dbRun } = require('../../dbUtils');
const { sendCancellationEmail } = require('../../../services/emailService');

// ═══════════════════════════════════════════════════════════════════════════════
//                           CANCELLATION POLICY
// ═══════════════════════════════════════════════════════════════════════════════

const REFUND_POLICY = [
  { minHours: 24, maxHours: Infinity, refundPercent: 90, description: 'Full flexibility - 90% refund' },
  { minHours: 12, maxHours: 24, refundPercent: 75, description: 'Moderate - 75% refund' },
  { minHours: 6, maxHours: 12, refundPercent: 50, description: 'Limited - 50% refund' },
  { minHours: 2, maxHours: 6, refundPercent: 25, description: 'Last minute - 25% refund' },
  { minHours: 0, maxHours: 2, refundPercent: 0, description: 'No cancellation allowed' }
];

// ═══════════════════════════════════════════════════════════════════════════════
//                              HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate hours until departure
 */
function calculateHoursUntilDeparture(travelDate, departureTime) {
  const now = new Date();
  const departure = new Date(travelDate);
  
  const [hours, minutes] = departureTime.split(':').map(Number);
  departure.setHours(hours, minutes, 0, 0);
  
  const diffMs = departure - now;
  return diffMs / (1000 * 60 * 60);
}

/**
 * Get applicable refund tier
 */
function getRefundTier(hoursUntilDeparture) {
  for (const tier of REFUND_POLICY) {
    if (hoursUntilDeparture >= tier.minHours && hoursUntilDeparture < tier.maxHours) {
      return tier;
    }
  }
  return REFUND_POLICY[REFUND_POLICY.length - 1];
}

/**
 * Calculate refund amount
 */
function calculateRefund(totalPrice, refundPercent) {
  const refundAmount = Math.round((totalPrice * refundPercent) / 100);
  const cancellationFee = totalPrice - refundAmount;
  return { refundAmount, cancellationFee, refundPercent };
}

// ═══════════════════════════════════════════════════════════════════════════════
//                         DATABASE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Find booking by PNR or ID
 */
async function findBooking(identifier) {
  // Try PNR first
  let booking = await dbGet(`
    SELECT 
      b.id, b.user_id, b.schedule_id, b.seat_numbers, b.passenger_name,
      b.total_price, b.booking_status, b.pnr, b.created_at,
      s.travel_date, s.departure_time, s.arrival_time,
      s.base_price, bus.bus_name, bus.bus_number, bus.bus_type,
      r.from_city, r.to_city
    FROM bookings b
    JOIN schedules s ON b.schedule_id = s.id
    JOIN buses bus ON s.bus_id = bus.id
    JOIN routes r ON s.route_id = r.id
    WHERE b.pnr = ?
  `, [identifier]);
  
  // If not found, try as booking ID
  if (!booking && !isNaN(identifier)) {
    booking = await dbGet(`
      SELECT 
        b.id, b.user_id, b.schedule_id, b.seat_numbers, b.passenger_name,
        b.total_price, b.booking_status, b.pnr, b.created_at,
        s.travel_date, s.departure_time, s.arrival_time,
        s.base_price, bus.bus_name, bus.bus_number, bus.bus_type,
        r.from_city, r.to_city
      FROM bookings b
      JOIN schedules s ON b.schedule_id = s.id
      JOIN buses bus ON s.bus_id = bus.id
      JOIN routes r ON s.route_id = r.id
      WHERE b.id = ?
    `, [identifier]);
  }
  
  return booking;
}

/**
 * Update booking status to cancelled
 */
async function updateBookingStatus(bookingId, refundInfo) {
  const result = await dbRun(`
    UPDATE bookings 
    SET booking_status = 'cancelled'
    WHERE id = ?
  `, [bookingId]);
  
  return result.changes > 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
//                         MAIN LANGGRAPH NODE FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Policy Cancellation Node - Main LangGraph node function
 */
async function policyCancellationNode(state) {
  const startTime = Date.now();
  const { taskId, inputData } = state;
  
  console.log(`\n[CancellationAgent] Processing cancellation for task ${taskId}`);
  
  const traces = [];
  const addTrace = (type, content) => {
    traces.push({ agent: 'CancellationAgent', type, content, timestamp: Date.now() });
  };
  
  try {
    // Extract parameters
    const identifier = inputData.pnr || inputData.bookingId || inputData.booking_id || inputData.id;
    const userId = inputData.userId || inputData.user_id;
    const reason = inputData.reason || 'User requested cancellation';
    
    addTrace('thought', `Cancelling booking: ${identifier}`);
    
    // Validation
    if (!identifier) {
      return {
        agentResults: { policy_cancellation: { success: false, error: 'Booking PNR or ID is required' } },
        structuredData: { error: 'Missing booking identifier' },
        halted: true,
        haltReason: 'Missing identifier',
        traces,
        decisionTrail: [{ agent: 'CancellationAgent', status: 'validation_error', steps: traces.length, duration_ms: Date.now() - startTime }]
      };
    }
    
    // Step 1: Find booking
    addTrace('action', 'Finding booking');
    const booking = await findBooking(identifier);
    
    if (!booking) {
      addTrace('observation', 'Booking not found');
      return {
        agentResults: { policy_cancellation: { success: false, error: `Booking not found: ${identifier}` } },
        structuredData: { error: 'Booking not found' },
        halted: true,
        haltReason: 'Booking not found',
        traces,
        decisionTrail: [{ agent: 'CancellationAgent', status: 'not_found', steps: traces.length, duration_ms: Date.now() - startTime }]
      };
    }
    
    addTrace('observation', `Found booking: PNR ${booking.pnr}, ${booking.from_city} → ${booking.to_city}`);
    
    // Step 2: Check if already cancelled
    if (booking.booking_status === 'cancelled') {
      addTrace('observation', 'Booking already cancelled');
      return {
        agentResults: { policy_cancellation: { success: false, error: 'This booking is already cancelled' } },
        structuredData: { error: 'Already cancelled', pnr: booking.pnr },
        halted: true,
        haltReason: 'Already cancelled',
        traces,
        decisionTrail: [{ agent: 'CancellationAgent', status: 'already_cancelled', steps: traces.length, duration_ms: Date.now() - startTime }]
      };
    }
    
    // Step 3: Check ownership (if userId provided)
    if (userId && booking.user_id !== userId) {
      addTrace('observation', 'User does not own this booking');
      return {
        agentResults: { policy_cancellation: { success: false, error: 'You are not authorized to cancel this booking' } },
        structuredData: { error: 'Unauthorized' },
        halted: true,
        haltReason: 'Unauthorized',
        traces,
        decisionTrail: [{ agent: 'CancellationAgent', status: 'unauthorized', steps: traces.length, duration_ms: Date.now() - startTime }]
      };
    }
    
    // Step 4: Calculate time until departure
    addTrace('action', 'Calculating refund eligibility');
    const hoursUntilDeparture = calculateHoursUntilDeparture(booking.travel_date, booking.departure_time);
    
    // Check if already departed
    if (hoursUntilDeparture < 0) {
      addTrace('observation', 'Bus has already departed');
      return {
        agentResults: { policy_cancellation: { success: false, error: 'Cannot cancel - bus has already departed' } },
        structuredData: { error: 'Bus already departed' },
        halted: true,
        haltReason: 'Already departed',
        traces,
        decisionTrail: [{ agent: 'CancellationAgent', status: 'departed', steps: traces.length, duration_ms: Date.now() - startTime }]
      };
    }
    
    // Step 5: Get refund tier
    const tier = getRefundTier(hoursUntilDeparture);
    addTrace('observation', `${hoursUntilDeparture.toFixed(1)} hours until departure → ${tier.description}`);
    
    // Check if cancellation allowed
    if (tier.refundPercent === 0 && hoursUntilDeparture < 2) {
      return {
        agentResults: { 
          policy_cancellation: { 
            success: false, 
            error: 'Cancellation not allowed within 2 hours of departure',
            hoursUntilDeparture: hoursUntilDeparture.toFixed(1)
          } 
        },
        structuredData: { error: 'Cancellation window closed', hoursRemaining: hoursUntilDeparture.toFixed(1) },
        halted: true,
        haltReason: 'Too close to departure',
        traces,
        decisionTrail: [{ agent: 'CancellationAgent', status: 'window_closed', steps: traces.length, duration_ms: Date.now() - startTime }]
      };
    }
    
    // Step 6: Calculate refund
    const refund = calculateRefund(booking.total_price, tier.refundPercent);
    addTrace('observation', `Refund: ₹${refund.refundAmount} (${refund.refundPercent}%), Fee: ₹${refund.cancellationFee}`);
    
    // Parse seat numbers
    let seats = [];
    try {
      seats = JSON.parse(booking.seat_numbers);
    } catch (e) {
      seats = booking.seat_numbers.split(',').map(s => s.trim());
    }
    
    // Step 7: Return pending_cancellation (don't cancel directly — user must confirm via UI)
    addTrace('observation', 'Returning pending cancellation for user confirmation');
    
    const pendingCancellation = {
      pnr: booking.pnr,
      bookingId: booking.id,
      fromCity: booking.from_city,
      toCity: booking.to_city,
      travelDate: booking.travel_date,
      departureTime: booking.departure_time,
      busName: booking.bus_name,
      seats: seats,
      passengerName: booking.passenger_name,
      totalPrice: booking.total_price,
      refundAmount: refund.refundAmount,
      refundPercent: refund.refundPercent,
      cancellationFee: refund.cancellationFee,
      policyTier: tier.description,
      hoursUntilDeparture: hoursUntilDeparture.toFixed(1)
    };
    
    return {
      agentResults: { policy_cancellation: { success: true, pendingCancellation } },
      structuredData: {
        status: 'pending_cancellation',
        pendingCancellation
      },
      traces,
      decisionTrail: [{ agent: 'CancellationAgent', status: 'pending_confirmation', steps: traces.length, duration_ms: Date.now() - startTime }]
    };
    
  } catch (error) {
    console.error(`[CancellationAgent] Error: ${error.message}`);
    addTrace('error', error.message);
    
    return {
      agentResults: { policy_cancellation: { success: false, error: error.message } },
      structuredData: { error: error.message },
      traces,
      error: error.message,
      decisionTrail: [{ agent: 'CancellationAgent', status: 'error', steps: traces.length, duration_ms: Date.now() - startTime }]
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//                                   EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  policyCancellationNode,
  policyCancellationNode_internal: {
    findBooking,
    calculateHoursUntilDeparture,
    getRefundTier,
    calculateRefund,
    REFUND_POLICY
  }
};
