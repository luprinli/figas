import { db } from "../db.server";

export async function generateInvoiceLines(invoiceId: string, bookingId: number): Promise<number> {
  const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT
       blp.id AS blp_id,
       CONCAT(bp.first_name, ' ', bp.last_name) AS passenger_name,
       COALESCE(blp.line_fare_amount, 0) AS fare,
       bl.origin_code,
       bl.destination_code,
       bl.leg_date
     FROM booking_leg_passengers blp
     JOIN booking_legs bl ON bl.id = blp.booking_leg_id
     JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
     WHERE bl.booking_id = $1
     ORDER BY blp.id`,
    bookingId
  );

  let count = 0;

  for (const r of (rows as Array<{
    blp_id: number | bigint;
    passenger_name: string;
    fare: number | bigint;
    origin_code: string;
    destination_code: string;
    leg_date: string;
  }>)) {
    const fare = Number(r.fare);
    if (fare <= 0) continue;

    const legDate = r.leg_date
      ? new Date(r.leg_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : "";

    await db.invoice_line_items.create({
      data: {
        invoice_id: invoiceId,
        booking_leg_passenger_id: Number(r.blp_id),
        description: `${r.passenger_name}: ${r.origin_code}→${r.destination_code}, ${legDate}`,
        unit_price: fare,
        quantity: 1,
        discount_amount: 0,
        line_total: fare,
        tax_rate: 0,
        tax_amount: 0,
      },
    });
    count++;
  }

  return count;
}
