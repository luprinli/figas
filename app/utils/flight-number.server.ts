import type { Kysely } from "kysely";
import type { DB } from "../../generated/kysely/database";

/**
 * Generate the next flight number for a given schedule date.
 *
 * Format: FIG{DD}{MM}{NN} where DD=day, MM=month, NN=sequential counter
 * Example: FIG190601 for a June 19 schedule (first flight of the day).
 *
 * Uses findFirst({ startsWith }) to find the max existing counter for the
 * same date prefix, which is resilient to deleted rows (unlike COUNT(*)).
 *
 * @param date - The schedule date (Date or ISO string). UTC components are used.
 * @param tx - Optional Kysely transaction or database client for atomicity within a transaction.
 */
export async function generateFlightNumber(
  date: string | Date,
  tx?: Kysely<DB>
): Promise<string> {
  const d = typeof date === "string" ? new Date(date) : date;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const prefix = `FIG${day}${month}`;

  const resolved = tx ?? (await import("./db.server").then((m) => m.db));
  const rows = await resolved!
    .selectFrom("flights")
    .select(["flight_number"])
    .where("flight_number", "like", `${prefix}%`)
    .orderBy("flight_number", "desc")
    .limit(1)
    .execute();

  let nextNum = 1;
  if (rows.length > 0 && rows[0].flight_number) {
    const suffix = parseInt(
      String(rows[0].flight_number).slice(-2),
      10
    );
    if (!isNaN(suffix)) nextNum = suffix + 1;
  }

  return `${prefix}${String(nextNum).padStart(2, "0")}`;
}

/**
 * Generate the next flight number using auto-build format: FIG-YYYYMMDD-NNN
 * Example: FIG-20260619-001
 *
 * @param date - The schedule date in YYYY-MM-DD format
 * @param tx - Optional Kysely transaction client
 */
export async function generateAutoBuildFlightNumber(
  date: string,
  tx?: Kysely<DB>
): Promise<string> {
  const cleanDate = date.replace(/-/g, "");
  const prefix = `FIG-${cleanDate}-`;

  const resolved = tx ?? (await import("./db.server").then((m) => m.db));
  const rows = await resolved!
    .selectFrom("flights")
    .select(["flight_number"])
    .where("flight_number", "like", `${prefix}%`)
    .orderBy("flight_number", "desc")
    .limit(1)
    .execute();

  let nextNum = 1;
  if (rows.length > 0 && rows[0].flight_number) {
    const suffix = String(rows[0].flight_number).slice(-3);
    const parsed = parseInt(suffix, 10);
    if (!isNaN(parsed)) nextNum = parsed + 1;
  }

  return `${prefix}${String(nextNum).padStart(3, "0")}`;
}

/**
 * Synchronously generate the next flight number prefix for a given date.
 * Useful for UI previews that need a flight number before DB interaction.
 */
export function generateFlightNumberPrefix(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `FIG${day}${month}`;
}
