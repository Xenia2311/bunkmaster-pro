export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export const TIME_SLOTS = [
  "08:30",
  "09:30",
  "10:30",
  "11:30",
  "BREAK",
  "13:15",
  "14:15",
  "15:15",
  "16:15",
];

/**
 * Format a Date (or date string) as YYYY-MM-DD.
 * @param {Date|string} date
 * @returns {string}
 */
export function toISODate(date) {
  const d = new Date(date);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Today's date as YYYY-MM-DD (local).
 */
export function todayISO() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Convert a JS Date's getDay() (0=Sun..6=Sat) to timetable dayOfWeek
 * (0=Mon..4=Fri), or null for weekends.
 */
export function jsDateToTimetableDay(date) {
  const jsDay = new Date(date).getDay();
  if (jsDay === 0 || jsDay === 6) return null;
  return jsDay - 1;
}

/**
 * Human-friendly weekday + date, e.g. "Mon, 16 Jun"
 */
export function formatFriendlyDate(isoDate) {
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}
