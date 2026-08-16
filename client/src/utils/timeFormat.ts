/**
 * Convert 24-hour time format to Indian 12-hour format with AM/PM
 * @param time24 - Time in 24-hour format (e.g., "14:30", "06:00")
 * @returns Time in 12-hour format with AM/PM (e.g., "2:30 PM", "6:00 AM")
 */
export function formatTo12Hour(time24: string): string {
  if (!time24) return '';
  
  const [hours24, minutes] = time24.split(':').map(Number);
  
  if (isNaN(hours24) || isNaN(minutes)) return time24;
  
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12; // Convert 0 to 12 for midnight, 13-23 to 1-11
  
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/**
 * Format time range for display
 * @param departureTime - Departure time in 24-hour format
 * @param arrivalTime - Arrival time in 24-hour format
 * @returns Formatted time range (e.g., "6:00 AM - 2:30 PM")
 */
export function formatTimeRange(departureTime: string, arrivalTime: string): string {
  return `${formatTo12Hour(departureTime)} - ${formatTo12Hour(arrivalTime)}`;
}
