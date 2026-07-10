import { db } from "../db.server";
import type { Kysely } from "kysely";
import type { DB } from "../../../generated/kysely/database";

/**
 * Execute a function within a database transaction using Kysely.
 *
 * Uses `db.transaction()` with a callback to provide a transactional client.
 *
 * @example
 *   await withTransaction(async (tx) => {
 *     await tx.updateTable("flights").set({ status: "confirmed" }).where("id", "=", 1).execute();
 *     await tx.updateTable("bookings").set({ status: "booked" }).where("id", "=", 1).execute();
 *   });
 */
export async function withTransaction<T>(
  fn: (tx: Kysely<DB>) => Promise<T>
): Promise<T> {
  return db.transaction().execute(fn as any);
}
