import { db } from "../db.server";
import type { Prisma } from "../../../generated/prisma/client";

/**
 * Execute a callback within a Prisma interactive transaction.
 * Provides a TransactionClient that can be passed to repository methods.
 *
 * @param fn - Callback that receives a TransactionClient and returns a promise
 * @returns The result of the callback
 */
export async function withTransaction<T>(
  fn: (client: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return db.$transaction(fn);
}
