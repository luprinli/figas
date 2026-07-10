import { db } from "~/utils/db.server";
import type { Kysely } from "kysely";
import type { DB } from "~/../generated/kysely/database";

/**
 * Special error class used to signal that a transaction should be rolled back
 * while still returning the result to the caller.
 *
 * Kysely's `transaction` commits when the callback resolves successfully,
 * and rolls back only when the callback throws. By throwing a `RollbackSignal`
 * after the test callback completes, we force the transaction to roll back
 * regardless of test outcome. The `.catch()` handler then unwraps the signal
 * and returns the original result.
 */
class RollbackSignal<T> extends Error {
  public readonly value: T;
  constructor(value: T) {
    super("RollbackSignal");
    this.name = "RollbackSignal";
    this.value = value;
  }
}

/**
 * Execute a callback within a transaction that is rolled back
 * after the callback completes, providing test isolation.
 *
 * Uses Kysely's `transaction` with an interactive transaction so that
 * any data created during the test is discarded after the callback
 * finishes, regardless of success or failure.
 *
 * @example
 * ```ts
 * const result = await withRollback(async (tx) => {
 *   return tx.insertInto("schedules").values({ ... }).returningAll().execute();
 * });
 * ```
 */
export async function withRollback<T>(
  fn: (tx: Kysely<DB>) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(async (tx) => {
    const result = await fn(tx);
    throw new RollbackSignal(result);
  }).catch((err: unknown) => {
    if (err instanceof RollbackSignal) {
      return err.value as T;
    }
    throw err;
  });
}

/**
 * Create a date-only Date object (time set to 00:00:00.000 UTC).
 */
export function dateOnly(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

/**
 * Create a DateTime for a given date and time (UTC).
 */
export function dateTime(
  year: number,
  month: number,
  day: number,
  hours = 0,
  minutes = 0,
  seconds = 0,
): Date {
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds, 0));
}

/**
 * Format a Date as "YYYY-MM-DD" string in UTC.
 */
export function formatDateOnly(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
