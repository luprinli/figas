import { db } from "../db.server";

export async function allocatePayment(
  paymentId: number,
  bookingId: number
): Promise<{ allocated: number; remaining: number }> {
  const payment = await db.payments.findUnique({
    where: { id: paymentId },
    select: { amount: true, status: true },
  });
  if (!payment) throw new Error("Payment not found");

  const alreadyAllocated = await db.payment_allocations.aggregate({
    where: { payment_id: paymentId },
    _sum: { allocated_amount: true },
  });
  let remaining = Number(payment.amount) - Number(alreadyAllocated._sum.allocated_amount ?? 0);
  if (remaining <= 0) return { allocated: 0, remaining: 0 };

  const lineItems = await db.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT
       blp.id,
       COALESCE(blp.line_fare_amount, 0) AS line_fare,
       COALESCE(SUM(pa.allocated_amount), 0) AS already_allocated
     FROM booking_leg_passengers blp
     JOIN booking_legs bl ON bl.id = blp.booking_leg_id
     LEFT JOIN payment_allocations pa ON pa.booking_leg_passenger_id = blp.id
     WHERE bl.booking_id = $1
     GROUP BY blp.id, blp.line_fare_amount
     HAVING COALESCE(blp.line_fare_amount, 0) > COALESCE(SUM(pa.allocated_amount), 0)
     ORDER BY blp.id`,
    bookingId
  );

  let allocated = 0;

  for (const item of (lineItems as Array<{
    id: number | bigint;
    line_fare: number | bigint;
    already_allocated: number | bigint;
  }>)) {
    if (remaining <= 0) break;

    const owed = Number(item.line_fare) - Number(item.already_allocated);
    const toAllocate = Math.min(owed, remaining);

    if (toAllocate > 0) {
      await db.payment_allocations.create({
        data: {
          payment_id: paymentId,
          booking_leg_passenger_id: Number(item.id),
          allocated_amount: toAllocate,
          allocation_type: toAllocate >= owed ? "full" : "partial",
        },
      });
      allocated += toAllocate;
      remaining -= toAllocate;
    }
  }

  await db.payments.update({
    where: { id: paymentId },
    data: { reconciled_at: new Date() },
  });

  return { allocated: Math.round(allocated * 100) / 100, remaining: Math.round(remaining * 100) / 100 };
}
