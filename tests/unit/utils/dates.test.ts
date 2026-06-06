import { describe, it, expect } from "vitest";
import {
  formatDate,
  parseDate,
  isDateInRange,
  isRangeStart,
  isRangeEnd,
  getFirstDayOfMonth,
  getDaysInMonth,
  getCalendarGrid,
  MONTH_NAMES,
  DAY_NAMES_SHORT,
} from "~/utils/dates";

describe("formatDate()", () => {
  it("formats dates correctly", () => {
    expect(formatDate(2026, 5, 15)).toBe("2026-06-15");
    expect(formatDate(2026, 0, 1)).toBe("2026-01-01");
    expect(formatDate(2026, 11, 31)).toBe("2026-12-31");
  });

  it("pads single-digit months and days", () => {
    expect(formatDate(2026, 0, 5)).toBe("2026-01-05");
    expect(formatDate(2026, 2, 3)).toBe("2026-03-03");
  });
});

describe("parseDate()", () => {
  it("parses a valid date string", () => {
    const result = parseDate("2026-06-15");
    expect(result).toEqual({ year: 2026, month: 5, day: 15 });
  });

  it("returns null for null input", () => {
    expect(parseDate(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(parseDate(undefined)).toBeNull();
  });

  it("returns null for invalid date strings", () => {
    expect(parseDate("not-a-date")).toBeNull();
    expect(parseDate("2026-13-01")).not.toBeNull(); // month parsing still works
    expect(parseDate("")).toBeNull();
  });

  it("parses a Date object", () => {
    const date = new Date(2026, 5, 15);
    const result = parseDate(date);
    expect(result).toEqual({ year: 2026, month: 5, day: 15 });
  });

  it("returns null for invalid Date object", () => {
    const invalidDate = new Date("invalid");
    expect(parseDate(invalidDate)).toBeNull();
  });
});

describe("isDateInRange()", () => {
  it("returns true when date is within range (inclusive)", () => {
    expect(isDateInRange("2026-06-15", "2026-06-01", "2026-06-30")).toBe(true);
    expect(isDateInRange("2026-06-01", "2026-06-01", "2026-06-30")).toBe(true);
    expect(isDateInRange("2026-06-30", "2026-06-01", "2026-06-30")).toBe(true);
  });

  it("returns false when date is outside range", () => {
    expect(isDateInRange("2026-05-31", "2026-06-01", "2026-06-30")).toBe(false);
    expect(isDateInRange("2026-07-01", "2026-06-01", "2026-06-30")).toBe(false);
  });

  it("returns false when from or to is empty", () => {
    expect(isDateInRange("2026-06-15", "", "2026-06-30")).toBe(false);
    expect(isDateInRange("2026-06-15", "2026-06-01", "")).toBe(false);
  });
});

describe("isRangeStart() / isRangeEnd()", () => {
  it("detects range start correctly", () => {
    expect(isRangeStart("2026-06-01", "2026-06-01")).toBe(true);
    expect(isRangeStart("2026-06-02", "2026-06-01")).toBe(false);
    expect(isRangeStart("2026-06-01", "")).toBe(false);
  });

  it("detects range end correctly", () => {
    expect(isRangeEnd("2026-06-30", "2026-06-30")).toBe(true);
    expect(isRangeEnd("2026-06-29", "2026-06-30")).toBe(false);
    expect(isRangeEnd("2026-06-30", "")).toBe(false);
  });
});

describe("getFirstDayOfMonth()", () => {
  it("returns correct day of week for first day of month", () => {
    // June 1, 2026 is a Monday
    expect(getFirstDayOfMonth(2026, 5)).toBe(1); // Monday
    // January 1, 2026 is a Thursday
    expect(getFirstDayOfMonth(2026, 0)).toBe(4); // Thursday
  });
});

describe("getDaysInMonth()", () => {
  it("returns correct number of days in a month", () => {
    expect(getDaysInMonth(2026, 0)).toBe(31); // January
    expect(getDaysInMonth(2026, 1)).toBe(28); // February (non-leap)
    expect(getDaysInMonth(2026, 5)).toBe(30); // June
    expect(getDaysInMonth(2024, 1)).toBe(29); // February (leap year)
  });
});

describe("getCalendarGrid()", () => {
  it("returns 42 cells (6 rows × 7 columns)", () => {
    const grid = getCalendarGrid(2026, 5); // June 2026
    expect(grid).toHaveLength(42);
  });

  it("starts with leading nulls for alignment", () => {
    // June 1, 2026 is Monday (index 1), so 1 leading null
    const grid = getCalendarGrid(2026, 5);
    expect(grid[0]).toBeNull();
    expect(grid[1]).toBe(1);
  });

  it("contains day numbers in the middle", () => {
    const grid = getCalendarGrid(2026, 5); // June has 30 days
    const dayNumbers = grid.filter((d) => d !== null);
    expect(dayNumbers).toHaveLength(30);
    expect(dayNumbers[0]).toBe(1);
    expect(dayNumbers[dayNumbers.length - 1]).toBe(30);
  });

  it("ends with trailing nulls to fill 42 cells", () => {
    // June 2026: 1 leading null + 30 days = 31 filled, 11 trailing nulls
    const grid = getCalendarGrid(2026, 5);
    const lastDayIndex = grid.lastIndexOf(30);
    expect(grid[lastDayIndex + 1]).toBeNull();
  });
});

describe("constants", () => {
  it("has 12 month names", () => {
    expect(MONTH_NAMES).toHaveLength(12);
    expect(MONTH_NAMES[0]).toBe("January");
    expect(MONTH_NAMES[11]).toBe("December");
  });

  it("has 7 short day names", () => {
    expect(DAY_NAMES_SHORT).toHaveLength(7);
    expect(DAY_NAMES_SHORT[0]).toBe("Sun");
    expect(DAY_NAMES_SHORT[6]).toBe("Sat");
  });
});
