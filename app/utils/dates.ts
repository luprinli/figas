/**
 * Shared date helper functions for booking date range filtering.
 */

export function todayISO(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function thisWeekRange(): { start: string; end: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - dayOfWeek);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function lastWeekRange(): { start: string; end: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const endOfLastWeek = new Date(now);
  endOfLastWeek.setDate(now.getDate() - dayOfWeek - 1);
  const startOfLastWeek = new Date(endOfLastWeek);
  startOfLastWeek.setDate(endOfLastWeek.getDate() - 6);
  return {
    start: startOfLastWeek.toISOString().slice(0, 10),
    end: endOfLastWeek.toISOString().slice(0, 10),
  };
}

export function last7DaysRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 6);
  return {
    start: start.toISOString().slice(0, 10),
    end: now.toISOString().slice(0, 10),
  };
}

export function thisMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function nextMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export interface QuickSelectOption {
  label: string;
  getRange: () => { dateFrom: string; dateTo: string };
}

export const QUICK_SELECTS: QuickSelectOption[] = [
  { label: "Today", getRange: () => ({ dateFrom: todayISO(), dateTo: todayISO() }) },
  { label: "This Week", getRange: () => {
    const { start, end } = thisWeekRange();
    return { dateFrom: start, dateTo: end };
  }},
  { label: "Last Week", getRange: () => {
    const { start, end } = lastWeekRange();
    return { dateFrom: start, dateTo: end };
  }},
  { label: "Last 7 Days", getRange: () => {
    const { start, end } = last7DaysRange();
    return { dateFrom: start, dateTo: end };
  }},
  { label: "Current Month", getRange: () => {
    const { start, end } = thisMonthRange();
    return { dateFrom: start, dateTo: end };
  }},
  { label: "Next Month", getRange: () => {
    const { start, end } = nextMonthRange();
    return { dateFrom: start, dateTo: end };
  }},
  { label: "Reset", getRange: () => ({ dateFrom: "", dateTo: "" }) },
];

// ─── Calendar grid helpers ────────────────────────────────────────────

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Get the day of week for the first day of a month (0 = Sunday, 1 = Monday, …) */
export function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

/** Get the number of days in a month */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Generate a grid of day numbers for a month (including leading nulls for alignment).
 * The grid always has 42 cells (6 rows �— 7 columns).
 */
export function getCalendarGrid(year: number, month: number): (number | null)[] {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const grid: (number | null)[] = [];

  // Leading nulls for alignment
  for (let i = 0; i < firstDay; i++) {
    grid.push(null);
  }

  // Day numbers
  for (let d = 1; d <= daysInMonth; d++) {
    grid.push(d);
  }

  // Trailing nulls to fill 42 cells
  while (grid.length < 42) {
    grid.push(null);
  }

  return grid;
}

/** Format YYYY-MM-DD from year, month (0-indexed), day */
export function formatDate(year: number, month: number, day: number): string {
  const y = year;
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Formats an ISO date string or Date object to a display-friendly date string.
 * Returns "en-GB" locale format (e.g. "15 Jan 2026").
 * Handles timezone-safe parsing by using noon UTC.
 */
export function formatDateFromISO(dateStr: string | Date): string {
  try {
    const d = dateStr instanceof Date ? dateStr : new Date(dateStr + "T12:00:00");
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(dateStr);
  }
}

/**
 * Formats a Date object to YYYY-MM-DD string.
 */
export function formatDateObj(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse YYYY-MM-DD into { year, month (0-indexed), day } */
export function parseDate(dateStr: string | Date | null | undefined): { year: number; month: number; day: number } | null {
  if (!dateStr) return null;
  // pg returns DATE columns as Date objects; convert to YYYY-MM-DD string
  if (typeof dateStr !== "string") {
    if (dateStr instanceof Date && !isNaN(dateStr.getTime())) {
      const y = dateStr.getFullYear();
      const m = String(dateStr.getMonth() + 1).padStart(2, "0");
      const d = String(dateStr.getDate()).padStart(2, "0");
      dateStr = `${y}-${m}-${d}`;
    } else {
      return null;
    }
  }
  const parts = dateStr.split("-");
  if (parts.length !== 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return { year, month, day };
}

/** Check if a date string is within a range (inclusive) */
export function isDateInRange(date: string, from: string, to: string): boolean {
  if (!from || !to) return false;
  return date >= from && date <= to;
}

/** Check if a date string is the start of a range */
export function isRangeStart(date: string, from: string): boolean {
  return !!from && date === from;
}

/** Check if a date string is the end of a range */
export function isRangeEnd(date: string, to: string): boolean {
  return !!to && date === to;
}
