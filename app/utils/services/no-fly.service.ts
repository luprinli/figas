import { kdb } from "../db.server.kysely";
import { sql } from "kysely";
import type { DB } from "../../../generated/kysely/database";
import type { NoFlyRuleType } from "../../../generated/prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NoFlyRuleRow {
  id: number;
  label: string;
  description: string | null;
  rule_type: "recurring" | "one_off";
  is_active: boolean;
  day_of_week: number[] | null;
  season_start: string | null;
  season_end: string | null;
  specific_date: string | null;
  priority: number;
  override_reason: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface CreateNoFlyRuleParams {
  label: string;
  description?: string;
  rule_type: "recurring" | "one_off";
  is_active?: boolean;
  day_of_week?: number[] | null;
  season_start?: string | null;
  season_end?: string | null;
  specific_date?: string | null;
  priority?: number;
  override_reason?: string;
  created_by: number;
}

export interface UpdateNoFlyRuleParams {
  label?: string;
  description?: string | null;
  is_active?: boolean;
  day_of_week?: number[] | null;
  season_start?: string | null;
  season_end?: string | null;
  specific_date?: string | null;
  priority?: number;
  override_reason?: string | null;
}

export interface CalendarDay {
  date: string;       // YYYY-MM-DD
  isNoFly: boolean;
  ruleIds: number[];  // IDs of rules that apply to this day
  labels: string[];   // Labels of rules that apply
}

// ── Mapping helpers ──────────────────────────────────────────────────────────

/**
 * Map a Prisma no_fly_rules row to the service-layer NoFlyRuleRow interface.
 * Converts Date fields to ISO date strings and ensures day_of_week is number[].
 */
function mapRule(row: Record<string, unknown>): NoFlyRuleRow {
  return {
    id: row.id as number,
    label: row.label as string,
    description: (row.description as string) ?? null,
    rule_type: row.rule_type as "recurring" | "one_off",
    is_active: row.is_active as boolean,
    day_of_week: Array.isArray(row.day_of_week)
      ? (row.day_of_week as number[])
      : null,
    season_start: row.season_start
      ? toDateString(row.season_start as Date | string)
      : null,
    season_end: row.season_end
      ? toDateString(row.season_end as Date | string)
      : null,
    specific_date: row.specific_date
      ? toDateString(row.specific_date as Date | string)
      : null,
    priority: row.priority as number,
    override_reason: (row.override_reason as string) ?? null,
    created_by: row.created_by as number,
    created_at: (row.created_at as Date).toISOString(),
    updated_at: (row.updated_at as Date).toISOString(),
  };
}

function toDateString(value: Date | string): string {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return value;
}

function toDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  return new Date(value);
}

// ── Repository / CRUD ─────────────────────────────────────────────────────────

/**
 * Fetch all no-fly rules, ordered by creation date (newest first).
 */
export async function findAllRules(): Promise<NoFlyRuleRow[]> {
  const rows = await kdb.selectFrom("no_fly_rules")
    .selectAll()
    .orderBy("created_at desc")
    .execute();
  return rows.map(mapRule);
}

/**
 * Fetch a single rule by ID.
 */
export async function findRuleById(id: number): Promise<NoFlyRuleRow | null> {
  const row = (await kdb.selectFrom("no_fly_rules").selectAll().where("id", "=", id).execute())[0] ?? null;
  return row ? mapRule(row) : null;
}

/**
 * Create a new no-fly rule.
 */
export async function createRule(params: CreateNoFlyRuleParams): Promise<NoFlyRuleRow> {
  const row = (await kdb.insertInto("no_fly_rules").values({
    label: params.label,
    description: params.description ?? null,
    rule_type: params.rule_type as NoFlyRuleType,
    is_active: params.is_active ?? true,
    day_of_week: params.day_of_week && params.day_of_week.length > 0
      ? params.day_of_week
      : [],
    season_start: toDateOrNull(params.season_start),
    season_end: toDateOrNull(params.season_end),
    specific_date: toDateOrNull(params.specific_date),
    priority: params.priority ?? 0,
    override_reason: params.override_reason ?? null,
    created_by: params.created_by,
  } as any).returningAll().execute())[0];
  return mapRule(row);
}

/**
 * Update an existing no-fly rule. Only provided fields are updated.
 */
export async function updateRule(
  id: number,
  params: UpdateNoFlyRuleParams,
): Promise<NoFlyRuleRow | null> {
  const data: Record<string, unknown> = {};

  if (params.label !== undefined) data.label = params.label;
  if (params.description !== undefined) data.description = params.description;
  if (params.is_active !== undefined) data.is_active = params.is_active;
  if (params.day_of_week !== undefined) {
    data.day_of_week = params.day_of_week && params.day_of_week.length > 0
      ? params.day_of_week
      : [];
  }
  if (params.season_start !== undefined) data.season_start = toDateOrNull(params.season_start);
  if (params.season_end !== undefined) data.season_end = toDateOrNull(params.season_end);
  if (params.specific_date !== undefined) data.specific_date = toDateOrNull(params.specific_date);
  if (params.priority !== undefined) data.priority = params.priority;
  if (params.override_reason !== undefined) data.override_reason = params.override_reason;

  if (Object.keys(data).length === 0) {
    return findRuleById(id);
  }

  const row = (await kdb.updateTable("no_fly_rules").set(data as any).where("id", "=", id).returningAll().execute())[0] ?? null;
  return row ? mapRule(row) : null;
}

/**
 * Toggle a rule's active status.
 */
export async function toggleRuleActive(id: number): Promise<NoFlyRuleRow | null> {
  const current = (await kdb.selectFrom("no_fly_rules")
    .select("is_active")
    .where("id", "=", id)
    .execute())[0] ?? null;
  if (!current) return null;

  const row = (await kdb.updateTable("no_fly_rules").set({ is_active: !current.is_active } as any).where("id", "=", id).returningAll().execute())[0] ?? null;
  return row ? mapRule(row) : null;
}

/**
 * Delete a rule by ID.
 */
export async function deleteRule(id: number): Promise<boolean> {
  try {
    await kdb.deleteFrom("no_fly_rules").where("id", "=", id).execute();
    return true;
  } catch {
    return false;
  }
}

// ── Business Logic ────────────────────────────────────────────────────────────

/**
 * Check whether a given date (YYYY-MM-DD) is a no-fly day.
 *
 * Resolution algorithm:
 * 1. Only active rules are considered.
 * 2. One-off rules matching the specific date beat recurring rules.
 * 3. Within the same type (one-off or recurring), the rule with the highest priority wins.
 * 4. If no rule applies, the day is a fly day.
 */
export async function isNoFlyDay(date: string): Promise<boolean> {
  const parsed = parseDate(date);
  if (!parsed) return false;

  const { year, month, day } = parsed;
  const dateObj = new Date(year, month - 1, day);
  const dow = dateObj.getDay(); // 0=Sunday

  // Fetch all active rules
  const rules = await kdb.selectFrom("no_fly_rules")
    .selectAll()
    .where("is_active", "=", true)
    .execute();

  const matchingOneOffs: typeof rules = [];
  const matchingRecurring: typeof rules = [];

  for (const rule of rules) {
    if (rule.rule_type === "one_off") {
      if (rule.specific_date && toDateString(rule.specific_date) === date) {
        matchingOneOffs.push(rule);
      }
    } else if (rule.rule_type === "recurring") {
      // Check day of week
      if (!(rule as any).day_of_week?.includes(dow)) continue;

      // Check seasonal window (year-agnostic — only compare month/day)
      if (rule.season_start && rule.season_end) {
        if (!isDateInSeasonWindow(date, toDateString(rule.season_start), toDateString(rule.season_end))) continue;
      }

      matchingRecurring.push(rule);
    }
  }

  // One-off rules beat recurring rules
  if (matchingOneOffs.length > 0) {
    return true;
  }

  if (matchingRecurring.length > 0) {
    return true;
  }

  return false;
}

/**
 * Get the effective no-fly calendar for a date range.
 * Returns an array of CalendarDay objects for each day in the range.
 */
export async function getNoFlyCalendar(
  startDate: string,
  endDate: string,
): Promise<CalendarDay[]> {
  const parsedStart = parseDate(startDate);
  const parsedEnd = parseDate(endDate);
  if (!parsedStart || !parsedEnd) return [];

  const start = new Date(parsedStart.year, parsedStart.month - 1, parsedStart.day);
  const end = new Date(parsedEnd.year, parsedEnd.month - 1, parsedEnd.day);

  // Fetch all active rules
  const rules = await kdb.selectFrom("no_fly_rules")
    .selectAll()
    .where("is_active", "=", true)
    .execute();

  const calendar: CalendarDay[] = [];
  const current = new Date(start);

  while (current <= end) {
    const dateStr = formatDateObj(current);
    const dow = current.getDay();

    const matchingOneOffs: typeof rules = [];
    const matchingRecurring: typeof rules = [];

    for (const rule of rules) {
      if (rule.rule_type === "one_off") {
        if (rule.specific_date && toDateString(rule.specific_date) === dateStr) {
          matchingOneOffs.push(rule);
        }
      } else if (rule.rule_type === "recurring") {
        if (!(rule as any).day_of_week?.includes(dow)) continue;
        if (rule.season_start && rule.season_end) {
          if (!isDateInSeasonWindow(dateStr, toDateString(rule.season_start), toDateString(rule.season_end))) continue;
        }
        matchingRecurring.push(rule);
      }
    }

    // Determine effective rules: one-offs beat recurring
    const effectiveRules =
      matchingOneOffs.length > 0
        ? [matchingOneOffs.reduce((a, b) => (a.priority > b.priority ? a : b))]
        : matchingRecurring.length > 0
          ? [matchingRecurring.reduce((a, b) => (a.priority > b.priority ? a : b))]
          : [];

    calendar.push({
      date: dateStr,
      isNoFly: effectiveRules.length > 0,
      ruleIds: effectiveRules.map((r) => r.id),
      labels: effectiveRules.map((r) => r.label),
    });

    current.setDate(current.getDate() + 1);
  }

  return calendar;
}

/**
 * Get a flat list of no-fly date strings for a date range.
 * Useful for passing to the frontend as a serializable array.
 */
export async function getNoFlyDateStrings(
  startDate: string,
  endDate: string,
): Promise<string[]> {
  const calendar = await getNoFlyCalendar(startDate, endDate);
  return calendar.filter((d) => d.isNoFly).map((d) => d.date);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDate(dateStr: string | Date | null | undefined): { year: number; month: number; day: number } | null {
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
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return { year, month, day };
}

function formatDateObj(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Check if a date falls within a seasonal window (year-agnostic).
 * Only compares month and day.
 */
function isDateInSeasonWindow(
  date: string,
  seasonStart: string,
  seasonEnd: string,
): boolean {
  const dateParsed = parseDate(date);
  const startParsed = parseDate(seasonStart);
  const endParsed = parseDate(seasonEnd);
  if (!dateParsed || !startParsed || !endParsed) return false;

  const dateMD = dateParsed.month * 100 + dateParsed.day;
  const startMD = startParsed.month * 100 + startParsed.day;
  const endMD = endParsed.month * 100 + endParsed.day;

  if (startMD <= endMD) {
    // Normal range (e.g., Jun 1 – Aug 31)
    return dateMD >= startMD && dateMD <= endMD;
  } else {
    // Wrapping range (e.g., Nov 1 – Feb 28)
    return dateMD >= startMD || dateMD <= endMD;
  }
}
