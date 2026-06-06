import { db } from "../db.server";

/**
 * Execute a function within a database transaction using Prisma Client.
 *
 * Uses `db.$transaction` with an interactive transaction (Prisma's
 * `$transaction` with a callback) to provide a transactional Prisma Client.
 *
 * @example
 *   await withTransaction(async (tx) => {
 *     await tx.booking.update({ where: { id: 1 }, data: { status: "confirmed" } });
 *     await tx.flight.update({ where: { id: 1 }, data: { status: "booked" } });
 *   });
 */
export async function withTransaction<T>(
  fn: (tx: typeof db) => Promise<T>
): Promise<T> {
  return db.$transaction(async (tx) => {
    return fn(tx as typeof db);
  });
}
