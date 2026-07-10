import { db } from "../db.server";
import type { Kysely } from "kysely";
import type { DB } from "../../../generated/kysely/database";

/**
 * Execute a callback within a Kysely transaction.
 * Provides a Transaction object that can be passed to repository methods.
 *
 * @param fn - Callback that receives a Transaction and returns a promise
 * @returns The result of the callback
 */
export async function withTransaction<T>(
  fn: (client: Kysely<DB>) => Promise<T>
): Promise<T> {
  return db.transaction().execute(fn);
}
