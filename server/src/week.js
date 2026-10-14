// ISO-8601 week helpers ("YYYY-Www"), all in UTC.

const DAY = 86_400_000;
const WEEK_RE = /^(\d{4})-W(\d{2})$/;

/** ISO week of a Date, e.g. "2026-W42". */
export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay() || 7; // Monday = 1 … Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - dow); // the Thursday of this week decides the year
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / DAY + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Monday (00:00 UTC) of an ISO week string, or null if the string is not a real week. */
export function weekMonday(week) {
  if (typeof week !== 'string') return null;
  const m = WEEK_RE.exec(week);
  if (!m) return null;
  const year = Number(m[1]);
  const w = Number(m[2]);
  if (year < 2020 || year > 2100 || w < 1 || w > 53) return null;
  const jan4Dow = new Date(Date.UTC(year, 0, 4)).getUTCDay() || 7;
  const monday = new Date(Date.UTC(year, 0, 4 - jan4Dow + 1 + (w - 1) * 7));
  // Rejects W53 in years that only have 52 weeks.
  return isoWeek(monday) === week ? monday : null;
}

export const isValidWeek = (week) => weekMonday(week) !== null;

/** The week `n` weeks after (negative: before) `week`. */
export function shiftWeek(week, n) {
  return isoWeek(new Date(weekMonday(week).getTime() + n * 7 * DAY));
}

// Clients compute weeks in their local time zone (UTC-12 … UTC+14), the server in UTC.
const TZ_SLACK = 14 * 3_600_000;

/**
 * Weeks a client may write to at `nowMs`: the current or the previous ISO week,
 * as seen from any time zone.
 */
export function writableWeeks(nowMs) {
  const current = new Set([isoWeek(new Date(nowMs - TZ_SLACK)), isoWeek(new Date(nowMs + TZ_SLACK))]);
  const weeks = new Set();
  for (const w of current) {
    weeks.add(w);
    weeks.add(shiftWeek(w, -1));
  }
  return weeks;
}
