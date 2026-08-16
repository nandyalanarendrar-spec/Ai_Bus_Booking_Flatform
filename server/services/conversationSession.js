const { dbGet, dbRun } = require('../agents/dbUtils');

function parseJsonColumn(value) {
  if (!value) {
    return null;
  }

  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function buildSessionContext(session) {
  if (!session) {
    return {};
  }

  return {
    currentIntent: session.current_intent || null,
    selectedRoute: parseJsonColumn(session.selected_route),
    selectedBus: parseJsonColumn(session.selected_bus),
    selectedSeat: parseJsonColumn(session.selected_seat),
    bookingStage: session.booking_stage || null,
    lastMessage: session.last_message || null,
    updatedAt: session.updated_at || null
  };
}

async function getConversationSession(userId) {
  const row = await dbGet('SELECT * FROM conversation_sessions WHERE user_id = ?', [userId]);
  return row ? { ...row, ...buildSessionContext(row) } : null;
}

function deriveBookingStage(intent, responsePayload = {}) {
  if (responsePayload.awaitingInput === 'pnr') {
    return 'awaiting_pnr';
  }

  if (responsePayload.awaitingInput === 'passenger_names') {
    return 'awaiting_passenger_names';
  }

  const status = responsePayload.structuredData?.status;
  if (status === 'pending_payment') return 'pending_payment';
  if (status === 'pending_cancellation') return 'awaiting_cancellation';
  if (status === 'seats_released' || status === 'seats_released_partial') return 'seat_selection_adjustment';
  if (status === 'blocked') return 'blocked';
  if (status === 'confirmed') return 'confirmed';

  return intent?.taskType || null;
}

function pickRouteSnapshot({ extracted = {}, userContext = {}, session = null, responsePayload = {} }) {
  const pendingBooking = responsePayload.structuredData?.pendingBooking || null;
  const selectedRoute = responsePayload.structuredData?.selectedRoute || pendingBooking || null;

  const fromCity = selectedRoute?.fromCity || selectedRoute?.from || extracted.fromCity || userContext.fromCity || session?.selectedRoute?.fromCity || null;
  const toCity = selectedRoute?.toCity || selectedRoute?.to || extracted.toCity || userContext.toCity || session?.selectedRoute?.toCity || null;
  const travelDate = selectedRoute?.travelDate || selectedRoute?.date || extracted.travelDate || userContext.travelDate || session?.selectedRoute?.travelDate || null;

  if (!fromCity && !toCity && !travelDate) {
    return session?.selectedRoute || null;
  }

  return {
    fromCity,
    toCity,
    travelDate,
    departureTime: selectedRoute?.departureTime || selectedRoute?.departure_time || extracted.departureTime || userContext.departureTime || session?.selectedRoute?.departureTime || null,
    arrivalTime: selectedRoute?.arrivalTime || selectedRoute?.arrival_time || extracted.arrivalTime || userContext.arrivalTime || session?.selectedRoute?.arrivalTime || null,
    scheduleId: selectedRoute?.scheduleId || selectedRoute?.schedule_id || extracted.scheduleId || userContext.scheduleId || session?.selectedRoute?.scheduleId || null,
    busName: selectedRoute?.busName || selectedRoute?.bus_name || extracted.busName || userContext.busName || session?.selectedRoute?.busName || null,
    busNumber: selectedRoute?.busNumber || selectedRoute?.bus_number || extracted.busNumber || userContext.busNumber || session?.selectedRoute?.busNumber || null
  };
}

function pickBusSnapshot({ extracted = {}, userContext = {}, session = null, responsePayload = {} }) {
  const pendingBooking = responsePayload.structuredData?.pendingBooking || null;
  const bus = responsePayload.structuredData?.selectedBus || pendingBooking || null;

  const busName = bus?.busName || bus?.bus_name || extracted.busName || userContext.busName || session?.selectedBus?.busName || null;
  const busNumber = bus?.busNumber || bus?.bus_number || extracted.busNumber || userContext.busNumber || session?.selectedBus?.busNumber || null;

  if (!busName && !busNumber) {
    return session?.selectedBus || null;
  }

  return {
    busName,
    busNumber,
    operator: bus?.operator || extracted.operator || userContext.operator || session?.selectedBus?.operator || null,
    busType: bus?.busType || bus?.bus_type || extracted.busType || userContext.busType || session?.selectedBus?.busType || null,
    scheduleId: bus?.scheduleId || bus?.schedule_id || extracted.scheduleId || userContext.scheduleId || session?.selectedBus?.scheduleId || null,
    departureTime: bus?.departureTime || bus?.departure_time || extracted.departureTime || userContext.departureTime || session?.selectedBus?.departureTime || null,
    arrivalTime: bus?.arrivalTime || bus?.arrival_time || extracted.arrivalTime || userContext.arrivalTime || session?.selectedBus?.arrivalTime || null
  };
}

function pickSeatSnapshot({ extracted = {}, userContext = {}, session = null, responsePayload = {} }) {
  const pendingBooking = responsePayload.structuredData?.pendingBooking || null;
  const seats = pendingBooking?.seats || extracted.seatNumbers || userContext.seatNumbers || responsePayload.structuredData?.releasedSeats || null;
  const scheduleId = pendingBooking?.scheduleId || extracted.scheduleId || userContext.scheduleId || responsePayload.structuredData?.scheduleId || session?.selectedSeat?.scheduleId || null;

  if (!seats && !scheduleId) {
    return session?.selectedSeat || null;
  }

  return {
    seats: seats || session?.selectedSeat?.seats || null,
    scheduleId,
    pnr: responsePayload.structuredData?.pnr || extracted.pnr || userContext.pnr || session?.selectedSeat?.pnr || null,
    passengerNames: extracted.passengerDetails?.names || (extracted.passengerDetails?.name ? [extracted.passengerDetails.name] : null),
    status: responsePayload.structuredData?.status || session?.selectedSeat?.status || null
  };
}

async function saveConversationSession({ userId, intent, extracted = {}, userContext = {}, responsePayload = {}, session = null, message = '' }) {
  const selectedRoute = pickRouteSnapshot({ extracted, userContext, session, responsePayload });
  const selectedBus = pickBusSnapshot({ extracted, userContext, session, responsePayload });
  const selectedSeat = pickSeatSnapshot({ extracted, userContext, session, responsePayload });

  const paramIntent = intent?.taskType || intent?.action || null;
  let paramRoute, paramBus, paramSeat;
  try {
    paramRoute = selectedRoute ? JSON.stringify(selectedRoute) : null;
  } catch (e) {
    console.error('paramRoute failed:', e.stack);
  }
  try {
    paramBus = selectedBus ? JSON.stringify(selectedBus) : null;
  } catch (e) {
    console.error('paramBus failed:', e.stack);
  }
  try {
    paramSeat = selectedSeat ? JSON.stringify(selectedSeat) : null;
  } catch (e) {
    console.error('paramSeat failed:', e.stack);
  }
  const paramStage = deriveBookingStage(intent, responsePayload);
  const paramMsg = message || null;

  await dbRun(
    `INSERT INTO conversation_sessions (
      user_id,
      current_intent,
      selected_route,
      selected_bus,
      selected_seat,
      booking_stage,
      last_message,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      current_intent = excluded.current_intent,
      selected_route = excluded.selected_route,
      selected_bus = excluded.selected_bus,
      selected_seat = excluded.selected_seat,
      booking_stage = excluded.booking_stage,
      last_message = excluded.last_message,
      updated_at = CURRENT_TIMESTAMP`,
    [
      userId,
      paramIntent,
      paramRoute,
      paramBus,
      paramSeat,
      paramStage,
      paramMsg
    ]
  );
}

module.exports = {
  getConversationSession,
  saveConversationSession,
  buildSessionContext
};