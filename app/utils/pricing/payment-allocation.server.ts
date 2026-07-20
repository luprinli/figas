import { kdb } from "../db.server.kysely";
import { sql } from "kysely";

export async function allocatePayment(
  paymentId: number,
  bookingId: number,
  options?: { passengerId?: number }
): Promise<{ allocated: number; remaining: number }> {
  const payment = (await kdb.selectFrom("payments")
    .select(["amount", "status"])
    .where("id", "=", paymentId)
    .execute())[0] ?? null;
  if (!payment) throw new Error("Payment not found");

  const alreadyAllocated = await kdb.selectFrom("payment_allocations")
    .select(kdb.fn.sum<number>("allocated_amount").as("sum_allocated_amount"))
    .where("payment_id", "=", paymentId)
    .execute();
  let remaining = Number(payment.amount) - Number((alreadyAllocated[0] as { sum_allocated_amount?: number } | undefined)?.sum_allocated_amount ?? 0);
  if (remaining <= 0) return { allocated: 0, remaining: 0 };

  const passengerFilter = options?.passengerId
    ? sql`AND blp.booking_passenger_id = ${options.passengerId}`
    : sql``;

  const lineItems = await sql<Record<string, unknown>>`
    SELECT
      blp.id,
      COALESCE(blp.line_fare_amount, 0) AS line_fare,
      COALESCE(SUM(pa.allocated_amount), 0) AS already_allocated
    FROM booking_leg_passengers blp
    JOIN booking_legs bl ON bl.id = blp.booking_leg_id
    LEFT JOIN payment_allocations pa ON pa.booking_leg_passenger_id = blp.id
    WHERE bl.booking_id = ${bookingId} ${passengerFilter}
    GROUP BY blp.id, blp.line_fare_amount
    HAVING COALESCE(blp.line_fare_amount, 0) > COALESCE(SUM(pa.allocated_amount), 0)
    ORDER BY blp.id
  `.execute(kdb);

  let allocated = 0;

  for (const item of (lineItems.rows as unknown as Array<{
    id: number | bigint;
    line_fare: number | bigint;
    already_allocated: number | bigint;
  }>)) {
    if (remaining <= 0) break;

    const owed = Number(item.line_fare) - Number(item.already_allocated);
    const toAllocate = Math.min(owed, remaining);

    if (toAllocate > 0) {
      await kdb.insertInto("payment_allocations").values({
        payment_id: paymentId,
        booking_leg_passenger_id: Number(item.id),
        allocated_amount: toAllocate,
        allocation_type: toAllocate >= owed ? "full" : "partial",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any).execute();
      allocated += toAllocate;
      remaining -= toAllocate;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await kdb.updateTable("payments").set({ reconciled_at: new Date() } as any).where("id", "=", paymentId).execute();

  return { allocated: Math.round(allocated * 100) / 100, remaining: Math.round(remaining * 100) / 100 };
}
