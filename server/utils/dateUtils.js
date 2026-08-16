/**
 * Date Utility for consistent Local Date String formatting (YYYY-MM-DD).
 * Uses 'Asia/Kolkata' (IST) timezone so that dates roll over at midnight IST
 * (preventing 5.5 hour UTC delay where 12:00 AM - 5:30 AM IST still showed yesterday's date).
 */

function getLocalDateString(d = new Date()) {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.trim())) {
    return d.trim();
  }
  const dateObj = d instanceof Date ? d : new Date(d);
  if (isNaN(dateObj.getTime())) {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  }
  return dateObj.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function getOffsetLocalDateString(daysOffset = 0) {
  const now = new Date();
  // Get current date string in IST
  const todayISTStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [year, month, day] = todayISTStr.split('-').map(Number);
  
  // Create date object in UTC with IST components to avoid local system timezone skew
  const targetDate = new Date(Date.UTC(year, month - 1, day + daysOffset));
  const tYear = targetDate.getUTCFullYear();
  const tMonth = String(targetDate.getUTCMonth() + 1).padStart(2, '0');
  const tDay = String(targetDate.getUTCDate()).padStart(2, '0');
  return `${tYear}-${tMonth}-${tDay}`;
}

module.exports = {
  getLocalDateString,
  getOffsetLocalDateString
};
