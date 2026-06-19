// Playful "departure board announcement" style quips, keeping the original
// app's energy but reframed for the ticket/gauge motif.
const QUIPS = {
  god: [
    "Boarding priority: academic weapon.",
    "99%? Are you the professor?",
    "Absolute legend. Touch grass occasionally.",
  ],
  safe: [
    "Cruising altitude. Relax a little.",
    "Attendance healthy af.",
    "Safe zone unlocked.",
  ],
  edge: [
    "Final boarding call territory.",
    "One bunk = regret.",
    "Right on the line. Tread carefully.",
  ],
  danger: [
    "GPA in the departure lounge.",
    "Next bunk = disaster.",
    "This is getting bad.",
  ],
  doomed: [
    "Flight status: missing.",
    "Are you even enrolled?",
    "It's over. Attend everything.",
  ],
};

/**
 * Get a random quip for a given percentage relative to a target.
 * @param {number} pct attendance percentage (0-100)
 * @param {number} target target percentage
 * @returns {string}
 */
export function getQuip(pct, target) {
  let list;
  if (pct >= 95) list = QUIPS.god;
  else if (pct >= target + 10) list = QUIPS.safe;
  else if (pct >= target) list = QUIPS.edge;
  else if (pct >= 50) list = QUIPS.danger;
  else list = QUIPS.doomed;

  return list[Math.floor(Math.random() * list.length)];
}

/**
 * Determine the gauge "zone" for styling (color, needle position).
 * @param {number} pct
 * @param {number} target
 * @returns {"god"|"safe"|"edge"|"danger"|"doomed"}
 */
export function getZone(pct, target) {
  if (pct >= 95) return "god";
  if (pct >= target + 10) return "safe";
  if (pct >= target) return "edge";
  if (pct >= 50) return "danger";
  return "doomed";
}

export const ZONE_COLORS = {
  god: "var(--go)",
  safe: "var(--go)",
  edge: "var(--caution)",
  danger: "var(--signal)",
  doomed: "var(--signal)",
};
