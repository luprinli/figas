import type { NoFlyRuleRef } from "./types.js";

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Format a Date as YYYY-MM-DD.
 */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Add `n` days to a Date and return a new Date.
 */
export function addDays(date: Date, n: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + n);
  return result;
}

/**
 * Inclusive random integer between min and max.
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ---------------------------------------------------------------------------
// No-fly date checking
// ---------------------------------------------------------------------------

/**
 * Check whether a given date string (YYYY-MM-DD) is blocked by any
 * active no-fly rule.
 *
 * - **One-off rules**: blocked if `specific_date` matches exactly.
 * - **Recurring rules**: blocked if the day-of-week matches AND the date
 *   falls within the optional season window (if both season_start and
 *   season_end are set).
 */
export function isNoFlyDate(dateStr: string, rules: NoFlyRuleRef[]): boolean {
  const date = new Date(dateStr + "T00:00:00");
  const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  for (const rule of rules) {
    if (rule.rule_type === "one_off") {
      if (rule.specific_date === dateStr) return true;
    } else if (rule.rule_type === "recurring") {
      // Check seasonal window if defined
      if (rule.season_start && rule.season_end) {
        if (dateStr < rule.season_start || dateStr > rule.season_end) {
          continue;
        }
      }
      // Check day-of-week match
      if (rule.day_of_week && rule.day_of_week.includes(dayOfWeek)) {
        return true;
      }
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Booking date generation
// ---------------------------------------------------------------------------

/**
 * Generate a map of date strings → booking count (2–20) for every day in
 * the range [`startDate`, `endDate`] that is NOT a no-fly date.
 *
 * Weekdays (Mon–Fri) get higher counts (8–20), weekends (Sat–Sun) get
 * lower counts (2–8).
 */
export function generateBookingDates(
  startDate: Date,
  endDate: Date,
  rules: NoFlyRuleRef[]
): Map<string, number> {
  const dateMap = new Map<string, number>();
  const current = new Date(startDate);

  while (current <= endDate) {
    const dateStr = toISODate(current);

    if (!isNoFlyDate(dateStr, rules)) {
      const dayOfWeek = current.getDay(); // 0=Sun, 6=Sat
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const count = isWeekend ? randomInt(2, 8) : randomInt(8, 20);
      dateMap.set(dateStr, count);
    }

    current.setDate(current.getDate() + 1);
  }

  return dateMap;
}
