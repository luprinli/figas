/**
 * Utility for converting BigInt values returned by Prisma's $queryRawUnsafe
 * into standard JavaScript Numbers.  Required because JSON.stringify (used
 * by Remix's json() helper) cannot serialize BigInt.
 *
 * Also includes helpers for converting raw SQL result rows into typed objects
 * — patterns that are duplicated across schedule-handlers.server.ts.
 */

export function convertBigInts<T>(value: T): T {
  if (typeof value === "bigint") {
    return Number(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map(convertBigInts) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      obj[key] = convertBigInts(obj[key]);
    }
    return obj as T;
  }
  return value;
}

/**
 * Convert a raw query result object with BigInt values to a plain object
 * with Number values.  Equivalent to the repeated inline pattern:
 *
 *   Object.entries(row).map(([k, v]) => [k, typeof v === "bigint" ? Number(v) : v])
 */
export function bigintRowToNumbers(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = typeof value === "bigint" ? Number(value) : value;
  }
  return out;
}

/**
 * Normalize a value that may be BigInt, number, or null into a JavaScript Number.
 * Returns 0 for null/undefined values that are expected to be numeric.
 */
export function safeNumber(value: unknown, fallback: number = 0): number {
  if (value == null) return fallback;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  const n = Number(value);
  return isNaN(n) ? fallback : n;
}
