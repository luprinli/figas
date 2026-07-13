import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Shared mock state
// ---------------------------------------------------------------------------

let kdbMock: Record<string, unknown> = {};

vi.mock("~/utils/db.server", () => ({
  get kdb() {
    return kdbMock;
  },
}));

vi.mock("kysely", async (importOriginal) => {
  const actual = await importOriginal<typeof import("kysely")>();
  return {
    ...actual,
    sql: () => ({
      execute: vi.fn(() => ({ rows: [] })),
    }),
  };
});

import {
  isNoFlyDay,
  findAllRules,
  createRule,
  findRuleById,
  getNoFlyCalendar,
  getNoFlyDateStrings,
  type CreateNoFlyRuleParams,
} from "~/utils/services/no-fly.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHAIN_METHODS = [
  "select",
  "selectAll",
  "where",
  "andWhere",
  "orWhere",
  "orderBy",
  "limit",
  "offset",
  "innerJoin",
  "leftJoin",
  "groupBy",
  "values",
  "returningAll",
  "set",
  "onConflict",
  "whereRef",
  "innerJoinLateral",
];

function makeRule(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 1,
    label: "Test Rule",
    description: null,
    rule_type: "one_off",
    is_active: true,
    day_of_week: null,
    season_start: null,
    season_end: null,
    specific_date: "2026-07-15",
    priority: 0,
    override_reason: null,
    created_by: 1,
    created_at: new Date("2026-01-01"),
    updated_at: new Date("2026-01-01"),
    ...overrides,
  };
}

function buildChain(executeMock: ReturnType<typeof vi.fn>) {
  const chain: Record<string, unknown> = { execute: executeMock };
  for (const m of CHAIN_METHODS) {
    chain[m] = vi.fn(() => chain);
  }
  return chain;
}

// ===========================================================================
// isNoFlyDay
// ===========================================================================

describe("isNoFlyDay()", () => {
  let executeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executeMock = vi.fn();
    const chain = buildChain(executeMock);
    kdbMock = {
      selectFrom: vi.fn(() => chain),
      selectAll: chain.selectAll,
    };
    vi.clearAllMocks();
  });

  it("returns false when no active rules exist", async () => {
    executeMock.mockResolvedValueOnce([]);

    const result = await isNoFlyDay("2026-07-15");
    expect(result).toBe(false);
  });

  it("returns true when a one-off rule matches the exact date", async () => {
    const matchingRule = makeRule({
      id: 1,
      rule_type: "one_off",
      specific_date: "2026-07-15",
      is_active: true,
    });
    executeMock.mockResolvedValueOnce([matchingRule]);

    const result = await isNoFlyDay("2026-07-15");
    expect(result).toBe(true);
  });

  it("returns false when a one-off rule does not match the date", async () => {
    const nonMatchingRule = makeRule({
      id: 1,
      rule_type: "one_off",
      specific_date: "2026-07-16",
      is_active: true,
    });
    executeMock.mockResolvedValueOnce([nonMatchingRule]);

    const result = await isNoFlyDay("2026-07-15");
    expect(result).toBe(false);
  });

  it("returns true when a recurring rule matches the day of week", async () => {
    // 2026-01-05 is a Monday (dow=1)
    const mondayRule = makeRule({
      id: 2,
      rule_type: "recurring",
      day_of_week: [1],
      specific_date: null,
      season_start: null,
      season_end: null,
      is_active: true,
    });
    executeMock.mockResolvedValueOnce([mondayRule]);

    const result = await isNoFlyDay("2026-01-05");
    expect(result).toBe(true);
  });

  it("returns false when a recurring rule does not match the day of week", async () => {
    // 2026-01-04 is a Sunday (dow=0) but rule is Monday (dow=1)
    const mondayRule = makeRule({
      id: 2,
      rule_type: "recurring",
      day_of_week: [1],
      specific_date: null,
      is_active: true,
    });
    executeMock.mockResolvedValueOnce([mondayRule]);

    const result = await isNoFlyDay("2026-01-04");
    expect(result).toBe(false);
  });

  it("excludes inactive rules (DB WHERE clause filters is_active = true)", async () => {
    // The query filters with where("is_active", "=", true), so inactive
    // rules are never returned from the DB. Simulate by returning empty.
    executeMock.mockResolvedValueOnce([]);

    const result = await isNoFlyDay("2026-07-15");
    expect(result).toBe(false);
  });

  it("returns false for invalid date string", async () => {
    executeMock.mockResolvedValueOnce([]);

    const result = await isNoFlyDay("not-a-date");
    expect(result).toBe(false);
  });

  it("returns false for empty date string", async () => {
    executeMock.mockResolvedValueOnce([]);

    const result = await isNoFlyDay("");
    expect(result).toBe(false);
  });

  it("one-off rule beats recurring rule for the same date", async () => {
    // 2026-01-05 = Monday. Recurring rule blocks Mondays.
    // One-off rule on the same date should still return true.
    const recurringMonday = makeRule({
      id: 1,
      rule_type: "recurring",
      day_of_week: [1],
      specific_date: null,
      is_active: true,
    });
    const oneOff = makeRule({
      id: 2,
      rule_type: "one_off",
      specific_date: "2026-01-05",
      day_of_week: null,
      is_active: true,
    });
    executeMock.mockResolvedValueOnce([recurringMonday, oneOff]);

    const result = await isNoFlyDay("2026-01-05");
    expect(result).toBe(true);
  });

  it("handles recurring rule with seasonal window", async () => {
    // 2026-07-15 = Wednesday (dow=3)
    // Season: Jun 1 to Aug 31
    const seasonalRule = makeRule({
      id: 4,
      rule_type: "recurring",
      day_of_week: [3],
      specific_date: null,
      season_start: "2026-06-01",
      season_end: "2026-08-31",
      is_active: true,
    });
    executeMock.mockResolvedValueOnce([seasonalRule]);

    const result = await isNoFlyDay("2026-07-15");
    expect(result).toBe(true);
  });

  it("handles recurring rule with wrapping season window (cross-year)", async () => {
    // 2026-01-10 = Saturday (dow=6)
    // Season wraps: Nov 1 to Feb 28
    const wrappingSeasonRule = makeRule({
      id: 5,
      rule_type: "recurring",
      day_of_week: [6],
      specific_date: null,
      season_start: "2025-11-01",
      season_end: "2026-02-28",
      is_active: true,
    });
    executeMock.mockResolvedValueOnce([wrappingSeasonRule]);

    const result = await isNoFlyDay("2026-01-10");
    expect(result).toBe(true);
  });

  it("returns false when recurring rule is outside seasonal window", async () => {
    // 2026-04-15 = Wednesday (dow=3)
    // Season: Jun 1 to Aug 31 — April 15 is outside
    const seasonalRule = makeRule({
      id: 4,
      rule_type: "recurring",
      day_of_week: [3],
      specific_date: null,
      season_start: "2026-06-01",
      season_end: "2026-08-31",
      is_active: true,
    });
    executeMock.mockResolvedValueOnce([seasonalRule]);

    const result = await isNoFlyDay("2026-04-15");
    expect(result).toBe(false);
  });

  it("propagates database errors", async () => {
    executeMock.mockRejectedValueOnce(new Error("DB connection failed"));

    await expect(isNoFlyDay("2026-07-15")).rejects.toThrow("DB connection failed");
  });
});

// ===========================================================================
// findAllRules
// ===========================================================================

describe("findAllRules()", () => {
  let executeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executeMock = vi.fn();
    const chain = buildChain(executeMock);
    kdbMock = {
      selectFrom: vi.fn(() => chain),
      selectAll: chain.selectAll,
    };
    vi.clearAllMocks();
  });

  it("returns mapped rules ordered by created_at desc", async () => {
    const now = new Date();
    const rows = [
      makeRule({ id: 1, label: "Rule A", created_at: now }),
      makeRule({ id: 2, label: "Rule B", created_at: new Date(now.getTime() - 1000) }),
    ];
    executeMock.mockResolvedValueOnce(rows);

    const result = await findAllRules();

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 1, label: "Rule A" });
    expect(result[1]).toMatchObject({ id: 2, label: "Rule B" });
  });

  it("returns empty array when no rules exist", async () => {
    executeMock.mockResolvedValueOnce([]);

    const result = await findAllRules();

    expect(result).toEqual([]);
  });

  it("propagates database errors", async () => {
    executeMock.mockRejectedValueOnce(new Error("Query failed"));

    await expect(findAllRules()).rejects.toThrow("Query failed");
  });
});

// ===========================================================================
// findRuleById
// ===========================================================================

describe("findRuleById()", () => {
  let executeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executeMock = vi.fn();
    const chain = buildChain(executeMock);
    kdbMock = {
      selectFrom: vi.fn(() => chain),
      selectAll: chain.selectAll,
    };
    vi.clearAllMocks();
  });

  it("returns the rule when found", async () => {
    const row = makeRule({ id: 5, label: "Found Rule" });
    executeMock.mockResolvedValueOnce([row]);

    const result = await findRuleById(5);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(5);
    expect(result!.label).toBe("Found Rule");
  });

  it("returns null when rule not found", async () => {
    executeMock.mockResolvedValueOnce([]);

    const result = await findRuleById(999);
    expect(result).toBeNull();
  });
});

// ===========================================================================
// createRule
// ===========================================================================

describe("createRule()", () => {
  let executeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executeMock = vi.fn();
    const chain = buildChain(executeMock);
    kdbMock = {
      insertInto: vi.fn(() => chain),
      values: chain.values,
    };
    vi.clearAllMocks();
  });

  it("creates a one-off rule with required fields", async () => {
    const now = new Date();
    const insertedRow = makeRule({
      id: 10,
      label: "Holiday Closure",
      rule_type: "one_off",
      specific_date: "2026-12-25",
      created_at: now,
      updated_at: now,
    });
    executeMock.mockResolvedValueOnce([insertedRow]);

    const params: CreateNoFlyRuleParams = {
      label: "Holiday Closure",
      rule_type: "one_off",
      specific_date: "2026-12-25",
      created_by: 1,
    };

    const result = await createRule(params);

    expect(result.id).toBe(10);
    expect(result.label).toBe("Holiday Closure");
    expect(result.rule_type).toBe("one_off");
    expect(result.specific_date).toBe("2026-12-25");
    expect(result.is_active).toBe(true);
  });

  it("creates a recurring rule with day_of_week", async () => {
    const now = new Date();
    const insertedRow = makeRule({
      id: 11,
      label: "Weekend",
      rule_type: "recurring",
      day_of_week: [0, 6],
      specific_date: null,
      created_at: now,
      updated_at: now,
    });
    executeMock.mockResolvedValueOnce([insertedRow]);

    const params: CreateNoFlyRuleParams = {
      label: "Weekend",
      rule_type: "recurring",
      day_of_week: [0, 6],
      created_by: 1,
    };

    const result = await createRule(params);

    expect(result.id).toBe(11);
    expect(result.day_of_week).toEqual([0, 6]);
  });

  it("defaults is_active to true and priority to 0", async () => {
    const now = new Date();
    const insertedRow = makeRule({
      id: 12,
      is_active: true,
      priority: 0,
      created_at: now,
      updated_at: now,
    });
    executeMock.mockResolvedValueOnce([insertedRow]);

    const params: CreateNoFlyRuleParams = {
      label: "Default Test",
      rule_type: "one_off",
      created_by: 1,
    };

    const result = await createRule(params);

    expect(result.is_active).toBe(true);
    expect(result.priority).toBe(0);
  });

  it("accepts explicit is_active=false override", async () => {
    const now = new Date();
    const insertedRow = makeRule({
      id: 13,
      is_active: false,
      created_at: now,
      updated_at: now,
    });
    executeMock.mockResolvedValueOnce([insertedRow]);

    const params: CreateNoFlyRuleParams = {
      label: "Inactive",
      rule_type: "one_off",
      is_active: false,
      created_by: 1,
    };

    const result = await createRule(params);

    expect(result.is_active).toBe(false);
  });

  it("propagates database errors", async () => {
    executeMock.mockRejectedValueOnce(new Error("Insert failed"));

    const params: CreateNoFlyRuleParams = {
      label: "Fail",
      rule_type: "one_off",
      created_by: 1,
    };

    await expect(createRule(params)).rejects.toThrow("Insert failed");
  });
});

// ===========================================================================
// getNoFlyCalendar
// ===========================================================================

describe("getNoFlyCalendar()", () => {
  let executeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executeMock = vi.fn();
    const chain = buildChain(executeMock);
    kdbMock = {
      selectFrom: vi.fn(() => chain),
      selectAll: chain.selectAll,
    };
    vi.clearAllMocks();
  });

  it("returns calendar days with no-fly status for a date range", async () => {
    // 2026-07-15 is a Wednesday (dow=3)
    const wednesdayRule = makeRule({
      id: 1,
      label: "Wednesday No-Fly",
      rule_type: "recurring",
      day_of_week: [3],
      specific_date: null,
      season_start: null,
      season_end: null,
      is_active: true,
    });
    executeMock.mockResolvedValueOnce([wednesdayRule]);

    const calendar = await getNoFlyCalendar("2026-07-13", "2026-07-17");
    // Mon=no, Tue=no, Wed=yes, Thu=no, Fri=no (5 days)

    expect(calendar).toHaveLength(5);
    expect(calendar[0].date).toBe("2026-07-13");
    expect(calendar[0].isNoFly).toBe(false);
    expect(calendar[1].date).toBe("2026-07-14");
    expect(calendar[1].isNoFly).toBe(false);
    expect(calendar[2].date).toBe("2026-07-15");
    expect(calendar[2].isNoFly).toBe(true);
    expect(calendar[3].date).toBe("2026-07-16");
    expect(calendar[3].isNoFly).toBe(false);
    expect(calendar[4].date).toBe("2026-07-17");
    expect(calendar[4].isNoFly).toBe(false);
  });

  it("returns empty array for invalid start date", async () => {
    executeMock.mockResolvedValueOnce([]);

    const calendar = await getNoFlyCalendar("invalid", "2026-07-17");

    expect(calendar).toEqual([]);
  });

  it("returns empty array for invalid end date", async () => {
    executeMock.mockResolvedValueOnce([]);

    const calendar = await getNoFlyCalendar("2026-07-13", "invalid");

    expect(calendar).toEqual([]);
  });
});

// ===========================================================================
// getNoFlyDateStrings
// ===========================================================================

describe("getNoFlyDateStrings()", () => {
  let executeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executeMock = vi.fn();
    const chain = buildChain(executeMock);
    kdbMock = {
      selectFrom: vi.fn(() => chain),
      selectAll: chain.selectAll,
    };
    vi.clearAllMocks();
  });

  it("returns only dates that are no-fly days", async () => {
    const wednesdayRule = makeRule({
      id: 1,
      label: "Wednesday",
      rule_type: "recurring",
      day_of_week: [3],
      specific_date: null,
      season_start: null,
      season_end: null,
      is_active: true,
    });
    executeMock.mockResolvedValueOnce([wednesdayRule]);

    const dates = await getNoFlyDateStrings("2026-07-13", "2026-07-17");

    expect(dates).toEqual(["2026-07-15"]);
  });

  it("returns empty array when no dates are no-fly", async () => {
    executeMock.mockResolvedValueOnce([]);

    const dates = await getNoFlyDateStrings("2026-07-13", "2026-07-17");

    expect(dates).toEqual([]);
  });
});
