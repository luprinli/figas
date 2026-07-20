import { withTransaction } from "../repositories/shared";
import { sql } from "kysely";
import { bookingRepository } from "../repositories/booking";
import { bookingLegRepository } from "../repositories/booking-leg";
import { bookingPassengerRepository } from "../repositories/booking-passenger";
import { addJunctionRecordsForPassenger, removeJunctionRecordsForPassenger, removeJunctionRecordsForLeg, setRefundOnJunctionRecords } from "../repositories/booking-leg-passenger";
import { computeBookingCost, updateBookingTotals } from "./booking-costing.server";

export interface ActionResult {
  success?: boolean;
  error?: string;
  status?: number;
  [key: string]: unknown;
}

export async function handleAddPassenger(
  bookingId: number,
  passengerData: {
    first_name: string;
    last_name: string;
    email?: string;
    phone?: string;
    date_of_birth?: string;
    clothed_weight_kg?: number;
    residency?: string;
    special_requirements?: string;
  }
): Promise<ActionResult> {
  return withTransaction(async (tx) => {
    const booking = await bookingRepository.findById(bookingId);
    if (!booking) return { error: "Booking not found", status: 404 };
    if (booking.status === "cancelled" || booking.status === "completed") {
      return { error: "Cannot modify a cancelled or completed booking", status: 400 };
    }

    const legs = await bookingLegRepository.findByBookingId(bookingId);

    const passenger = await bookingPassengerRepository.create({
      booking_id: bookingId,
      first_name: passengerData.first_name,
      last_name: passengerData.last_name,
      email: passengerData.email ?? null,
      phone: passengerData.phone ?? null,
      date_of_birth: passengerData.date_of_birth ?? null,
      clothed_weight_kg: passengerData.clothed_weight_kg ?? 70,
      residency: passengerData.residency ?? null,
      special_requirements: passengerData.special_requirements ?? null,
    }, tx);

    const legIds = legs.map((l) => l.id);
    await addJunctionRecordsForPassenger(passenger.id, legIds, {
      clothed_weight_kg: passengerData.clothed_weight_kg,
      client: tx,
    });

    const cost = await computeBookingCost({ bookingId }, tx);
    await updateBookingTotals(bookingId, cost.grandTotal, tx);

    return { success: true, passengerId: passenger.id };
  });
}

export async function handleRemovePassenger(
  bookingId: number,
  bookingPassengerId: number
): Promise<ActionResult> {
  return withTransaction(async (tx) => {
    const booking = await bookingRepository.findById(bookingId);
    if (!booking) return { error: "Booking not found", status: 404 };
    if (booking.status === "cancelled" || booking.status === "completed") {
      return { error: "Cannot modify a cancelled or completed booking", status: 400 };
    }

    const passengerCount = await sql<{ cnt: number }>`
      SELECT COUNT(*)::int AS cnt FROM booking_passengers WHERE booking_id = ${bookingId}
    `.execute(tx);
    if (Number(passengerCount.rows[0]?.cnt ?? 0) <= 1) {
      return { error: "Cannot remove the last passenger from a booking", status: 400 };
    }

    const removedJunctions = await removeJunctionRecordsForPassenger(bookingPassengerId, tx);

    const refundable = removedJunctions.filter((r) => (r.line_fare_amount ?? 0) > 0);
    if (refundable.length > 0) {
      const refundEntries = refundable.map((r) => ({ id: r.id, amount: r.line_fare_amount! }));
      await setRefundOnJunctionRecords(refundEntries, tx);
    }

    await bookingPassengerRepository.delete(bookingPassengerId, tx);

    const cost = await computeBookingCost({ bookingId }, tx);
    await updateBookingTotals(bookingId, cost.grandTotal, tx);

    const totalRefund = refundable.reduce((sum, r) => sum + (r.line_fare_amount ?? 0), 0);

    return { success: true, refundAmountGbp: totalRefund };
  });
}

export async function handleAddLeg(
  bookingId: number,
  legData: {
    origin_code: string;
    destination_code: string;
    leg_date: string;
    preferred_time?: string;
    preferred_time_start?: string;
    preferred_time_end?: string;
  }
): Promise<ActionResult> {
  return withTransaction(async (tx) => {
    const booking = await bookingRepository.findById(bookingId);
    if (!booking) return { error: "Booking not found", status: 404 };
    if (booking.status === "cancelled" || booking.status === "completed") {
      return { error: "Cannot modify a cancelled or completed booking", status: 400 };
    }

    if (legData.origin_code === legData.destination_code) {
      return { error: "Origin and destination must be different", status: 400 };
    }

    const existingLegs = await bookingLegRepository.findByBookingId(bookingId);
    const nextSeq = existingLegs.length > 0
      ? Math.max(...existingLegs.map((l) => l.leg_sequence)) + 1
      : 1;

    const leg = await bookingLegRepository.create({
      booking_id: bookingId,
      origin_code: legData.origin_code,
      destination_code: legData.destination_code,
      leg_date: legData.leg_date,
      preferred_time: legData.preferred_time ?? null,
      preferred_time_start: legData.preferred_time_start ?? null,
      preferred_time_end: legData.preferred_time_end ?? null,
      leg_sequence: nextSeq,
    }, tx);

    const passengers = await tx.selectFrom("booking_passengers")
      .select(["id"])
      .where("booking_id", "=", bookingId)
      .execute();
    const passengerIds = passengers.map((p) => Number(p.id));
    await addJunctionRecordsForPassenger(passengerIds[0], [leg.id], { client: tx });
    for (let i = 1; i < passengerIds.length; i++) {
      await addJunctionRecordsForPassenger(passengerIds[i], [leg.id], { client: tx });
    }

    const cost = await computeBookingCost({ bookingId }, tx);
    await updateBookingTotals(bookingId, cost.grandTotal, tx);

    return { success: true, legId: leg.id };
  });
}

export async function handleRemoveLeg(
  bookingId: number,
  bookingLegId: number
): Promise<ActionResult> {
  return withTransaction(async (tx) => {
    const booking = await bookingRepository.findById(bookingId);
    if (!booking) return { error: "Booking not found", status: 404 };
    if (booking.status === "cancelled" || booking.status === "completed") {
      return { error: "Cannot modify a cancelled or completed booking", status: 400 };
    }

    const legCount = await sql<{ cnt: number }>`
      SELECT COUNT(*)::int AS cnt FROM booking_legs WHERE booking_id = ${bookingId}
    `.execute(tx);
    if (Number(legCount.rows[0]?.cnt ?? 0) <= 1) {
      return { error: "Cannot remove the last leg from a booking", status: 400 };
    }

    const removedJunctions = await removeJunctionRecordsForLeg(bookingLegId, tx);

    const refundable = removedJunctions.filter((r) => (r.line_fare_amount ?? 0) > 0);
    if (refundable.length > 0) {
      const refundEntries = refundable.map((r) => ({ id: r.id, amount: r.line_fare_amount! }));
      await setRefundOnJunctionRecords(refundEntries, tx);
    }

    await bookingLegRepository.delete(bookingLegId, tx);

    const remainingLegs = await bookingLegRepository.findByBookingId(bookingId, tx);
    for (let i = 0; i < remainingLegs.length; i++) {
      await tx.updateTable("booking_legs")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .set({ leg_sequence: i + 1 } as any)
        .where("id", "=", remainingLegs[i].id)
        .execute();
    }

    const cost = await computeBookingCost({ bookingId }, tx);
    await updateBookingTotals(bookingId, cost.grandTotal, tx);

    const totalRefund = refundable.reduce((sum, r) => sum + (r.line_fare_amount ?? 0), 0);

    return { success: true, refundAmountGbp: totalRefund };
  });
}
