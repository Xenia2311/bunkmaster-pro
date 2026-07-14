export const DAY_NAMES  = ["Mon", "Tue", "Wed", "Thu", "Fri"];
export const TIME_SLOTS = [
  "08:30","09:30","10:30","11:30","BREAK","13:15","14:15","15:15","16:15",
];

/**
 * Format any date value as YYYY-MM-DD using LOCAL time.
 * Handles Date objects, "YYYY-MM-DD", and "YYYY-MM-DDTHH:mm:ss.sssZ".
 */
export function toISODate(value) {
  let d;
  if (value instanceof Date) {
    d = value;
  } else {
    const s = String(value).slice(0, 10);
    const [y, m, day] = s.split("-").map(Number);
    d = new Date(y, m - 1, day); // local time — no UTC drift
  }
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

/** Today as YYYY-MM-DD in local time */
export function todayISO() {
  return toISODate(new Date());
}

/**
 * Shift a YYYY-MM-DD string by n days (positive or negative).
 * Pure local-time arithmetic — no UTC involved.
 */
export function shiftDate(isoDate, n) {
  const [y, m, d] = String(isoDate).slice(0, 10).split("-").map(Number);
  const date = new Date(y, m - 1, d + n);
  return toISODate(date);
}

/**
 * Get timetable dayOfWeek (0=Mon…4=Fri) from a YYYY-MM-DD string.
 * Returns null for weekends.
 */
export function timetableDayOfWeek(isoDate) {
  const [y, m, d] = String(isoDate).slice(0, 10).split("-").map(Number);
  const jsDay = new Date(y, m - 1, d).getDay(); // 0=Sun…6=Sat
  if (jsDay === 0 || jsDay === 6) return null;
  return jsDay - 1; // Mon=0…Fri=4
}

/**
 * Human-friendly date label: "Mon, 10 Jul"
 * Accepts any date value — slices to YYYY-MM-DD first.
 */
export function formatFriendlyDate(value) {
  const s = String(value).slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short", day: "numeric", month: "short",
  });
}
