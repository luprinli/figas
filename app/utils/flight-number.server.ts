import type { Prisma } from "../../generated/prisma/client";

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
 * @param tx - Optional Prisma transaction client for atomicity within a transaction.
 */
export async function generateFlightNumber(
  date: string | Date,
  tx?: Prisma.TransactionClient
): Promise<string> {
  const d = typeof date === "string" ? new Date(date) : date;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const prefix = `FIG${day}${month}`;

  const client = tx ?? (await import("./db.server").then((m) => m.db));
  const lastFlight = await (tx
    ? (tx as unknown as { flights: { findFirst: (...args: unknown[]) => unknown } }).flights.findFirst({
        where: { flight_number: { startsWith: prefix } },
        orderBy: { flight_number: "desc" },
        select: { flight_number: true },
      })
    : (client as unknown as { flights: { findFirst: (...args: unknown[]) => unknown } }).flights.findFirst({
        where: { flight_number: { startsWith: prefix } },
        orderBy: { flight_number: "desc" },
        select: { flight_number: true },
      }));

  let nextNum = 1;
  if (lastFlight) {
    const suffix = parseInt(
      (lastFlight as { flight_number: string }).flight_number.slice(-2),
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
 * @param tx - Optional Prisma transaction client
 */
export async function generateAutoBuildFlightNumber(
  date: string,
  tx?: Prisma.TransactionClient
): Promise<string> {
  const cleanDate = date.replace(/-/g, "");
  const prefix = `FIG-${cleanDate}-`;

  const client = tx ?? (await import("./db.server").then((m) => m.db));
  const lastFlight = await (tx
    ? (tx as unknown as { flights: { findFirst: (...args: unknown[]) => unknown } }).flights.findFirst({
        where: { flight_number: { startsWith: prefix } },
        orderBy: { flight_number: "desc" },
        select: { flight_number: true },
      })
    : (client as unknown as { flights: { findFirst: (...args: unknown[]) => unknown } }).flights.findFirst({
        where: { flight_number: { startsWith: prefix } },
        orderBy: { flight_number: "desc" },
        select: { flight_number: true },
      }));

  let nextNum = 1;
  if (lastFlight) {
    const suffix = (lastFlight as { flight_number: string }).flight_number.slice(-3);
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
