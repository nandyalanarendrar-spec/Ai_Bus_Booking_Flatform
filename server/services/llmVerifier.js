const { dbGet, dbAll } = require('../agents/dbUtils');

const MAX_SEATS_PER_BOOKING = 6;

async function validateBookingSuggestion(suggestion = {}, userId = null) {
  const issues = [];
  if (!suggestion) return { valid: false, issues: ['No suggestion provided'] };

  const scheduleId = suggestion.scheduleId || suggestion.schedule_id || null;
  const seats = Array.isArray(suggestion.seats) ? suggestion.seats : (suggestion.seatNumbers || []);
  const totalPrice = suggestion.totalPrice || suggestion.total_price || null;

  if (!scheduleId) issues.push('Missing scheduleId');
  if (!seats || seats.length === 0) issues.push('No seats requested');
  if (seats && seats.length > MAX_SEATS_PER_BOOKING) issues.push(`Too many seats requested (max ${MAX_SEATS_PER_BOOKING})`);
  if (totalPrice === null || totalPrice === undefined || Number.isNaN(Number(totalPrice))) issues.push('Invalid or missing totalPrice');

  // If basic checks failed, return early
  if (issues.length > 0) return { valid: false, issues };

  // Verify schedule exists and has availability
  const schedule = await dbGet(`SELECT s.id, s.travel_date, s.departure_time, s.available_seats, b.total_seats FROM schedules s JOIN buses b ON s.bus_id = b.id WHERE s.id = ?`, [scheduleId]);
  if (!schedule) {
    issues.push('Schedule not found');
    return { valid: false, issues };
  }

  // Check departure not passed
  try {
    const { getLocalDateString } = require('../utils/dateUtils');
    const now = new Date();
    const todayStr = getLocalDateString(now);
    if (schedule.travel_date === todayStr) {
      const [h, m] = (schedule.departure_time || '00:00').split(':').map(Number);
      const dep = new Date(now);
      dep.setHours(h, m, 0, 0);
      if (dep <= now) {
        issues.push('Selected schedule has already departed');
      }
    }
  } catch (e) {}

  // Check seat count availability
  if (schedule.available_seats < seats.length) {
    issues.push('Not enough available seats on this schedule');
  }

  // Check individual seats are not locked/booked (best-effort)
  try {
    const locked = await dbAll('SELECT seat_number FROM seat_locks WHERE schedule_id = ? AND seat_number IN (' + seats.map(() => '?').join(',') + ')', [scheduleId, ...seats]);
    if (locked && locked.length > 0) {
      issues.push('Some seats are already locked: ' + locked.map(l => l.seat_number).join(', '));
    }
  } catch (e) {
    // ignore DB errors here, but note
    issues.push('Could not verify seat locks: ' + e.message);
  }

  // Basic price sanity check: ensure totalPrice >= base price * seats (best-effort)
  try {
    const base = await dbGet('SELECT base_price FROM schedules WHERE id = ?', [scheduleId]);
    if (base && base.base_price) {
      const minTotal = Number(base.base_price) * seats.length;
      if (Number(totalPrice) < minTotal * 0.8) { // allow small discounts
        issues.push('Total price suspiciously low compared to base fare');
      }
    }
  } catch (e) {}

  return { valid: issues.length === 0, issues, suggestion: { scheduleId, seats, totalPrice } };
}

module.exports = { validateBookingSuggestion };
