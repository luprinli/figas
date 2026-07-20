import { kdb } from "../db.server.kysely";
import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { DB } from "../../../generated/kysely/database";
import { computeLegFare, computeBookingTotal } from "./pricing-engine.server";
import type { DiscountType } from "./pricing-engine.server";

export interface BookingCostInput {
  bookingId: number;
}

export interface LegCostLine {
  bookingLegPassengerId: number;
  bookingLegId: number;
  passengerId: number;
  passengerName: string;
  passengerAge: number;
  discountType: DiscountType;
  originCode: string;
  destinationCode: string;
  baseFare: number;
  discountPercent: number;
  discountedFare: number;
}

export interface BookingCostResult {
  legs: LegCostLine[];
  subtotal: number;
  totalDiscount: number;
  grandTotal: number;
}

export async function computeBookingCost(input: BookingCostInput, client?: Kysely<DB>): Promise<BookingCostResult> {
  const c = client ?? kdb;
  const rows = await sql<Record<string, unknown>>`
    SELECT
      blp.id AS booking_leg_passenger_id,
      blp.booking_leg_id,
      bp.id AS passenger_id,
      CONCAT(bp.first_name, ' ', bp.last_name) AS passenger_name,
      EXTRACT(YEAR FROM AGE(bp.date_of_birth))::int AS passenger_age,
      COALESCE(bp.discount_type, 'none') AS discount_type,
      bl.origin_code,
      bl.destination_code
    FROM booking_leg_passengers blp
    JOIN booking_legs bl ON bl.id = blp.booking_leg_id
    JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
    WHERE bl.booking_id = ${input.bookingId}
    ORDER BY blp.id
  `.execute(c);

  const lines: LegCostLine[] = [];

  for (const r of (rows.rows as unknown as Array<{
    booking_leg_passenger_id: number | bigint;
    booking_leg_id: number | bigint;
    passenger_id: number | bigint;
    passenger_name: string;
    passenger_age: number | bigint;
    discount_type: string;
    origin_code: string;
    destination_code: string;
  }>)) {
    const age = Number(r.passenger_age) || 35;
    const discountType = (r.discount_type || "none") as DiscountType;

    const fare = await computeLegFare({
      originCode: r.origin_code,
      destinationCode: r.destination_code,
      passengerAge: age,
      discountType,
    });

    lines.push({
      bookingLegPassengerId: Number(r.booking_leg_passenger_id),
      bookingLegId: Number(r.booking_leg_id),
      passengerId: Number(r.passenger_id),
      passengerName: r.passenger_name,
      passengerAge: age,
      discountType,
      originCode: r.origin_code,
      destinationCode: r.destination_code,
      baseFare: fare.baseFare,
      discountPercent: fare.discountPercent,
      discountedFare: fare.discountedFare,
    });

    // Persist line fare
    await c.updateTable("booking_leg_passengers").set({
      line_fare_amount: fare.discountedFare,
      discount_applied: fare.discountPercent > 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any).where("id", "=", Number(r.booking_leg_passenger_id)).execute();
  }

  const totals = computeBookingTotal(lines.map((l) => ({
    baseFare: l.baseFare,
    discountedFare: l.discountedFare,
    discountPercent: l.discountPercent,
  })));

  return { legs: lines, ...totals };
}

export async function updateBookingTotals(bookingId: number, grandTotal: number, client?: Kysely<DB>): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (client ?? kdb).updateTable("bookings").set({ total_amount: grandTotal } as any).where("id", "=", bookingId).execute();
}
