/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import { dateOnly, formatDateOnly } from "../../fixtures/helpers";
import { createTestBookingLeg } from "../../fixtures/factories";
import { findUnassignedByDate } from "../../../app/utils/repositories/booking-leg-passenger";
import { db } from "../../../app/utils/db.server";

describe("findUnassignedByDate()", () => {
  // Each test creates its own booking to avoid relying on shared booking_id: 1
  // that may have been mutated by other test files. The INNER JOIN on bookings
  // in findUnassignedByDate requires a valid booking row with status NOT cancelled/completed.
  async function createTestBooking() {
    return (await db.insertInto("bookings").values({
      booking_reference: `TST-${Date.now().toString(36).toUpperCase()}`,
      user_id: 1, status: "pending",
    } as any).returningAll().execute())[0];
  }

  async function createTestPassenger(bookingId: number, label: string) {
    return (await db.insertInto("booking_passengers").values({
      booking_id: bookingId, first_name: label, last_name: "Test",
    } as any).returningAll().execute())[0];
  }

  // ── Test: Returns unassigned legs for the requested date ──────────────────
  it("returns unassigned booking legs for the requested date", async () => {
    const targetDate = dateOnly(2026, 8, 10);
    const targetDateStr = formatDateOnly(targetDate);
    const booking = await createTestBooking();
    const passenger = await createTestPassenger(booking.id, "First");

    const leg = await createTestBookingLeg({
      booking_id: booking.id, origin_code: "STY", destination_code: "MPA",
      leg_date: targetDateStr, leg_sequence: 1, flight_id: null,
    });

    await db.insertInto("booking_leg_passengers").values({
      booking_leg_id: leg.id, booking_passenger_id: passenger.id,
    } as any).execute();

    // Debug: verify leg was created with correct values
    const verify = await db.selectFrom("booking_legs").selectAll().where("id", "=", leg.id).execute();
    console.log("Created leg:", verify[0]?.leg_date, "| flight_id:", verify[0]?.flight_id);

    const results = await findUnassignedByDate(targetDateStr);

    expect(results.length).toBeGreaterThanOrEqual(1);
    const foundLeg = results.find((r) => r.booking_leg_id === leg.id);
    expect(foundLeg).toBeDefined();
    expect(foundLeg!.origin_code).toBe("STY");
    expect(foundLeg!.destination_code).toBe("MPA");
    expect(foundLeg!.booking_reference).toBe(booking.booking_reference);
  });

  // ── Test: Different dates return different sets ────────────────────────────
  it("returns different results for different dates", async () => {
    const date1 = dateOnly(2026, 8, 15);
    const date2 = dateOnly(2026, 8, 16);
    const date1Str = formatDateOnly(date1);
    const date2Str = formatDateOnly(date2);

    const booking1 = await createTestBooking();
    const passenger1 = await createTestPassenger(booking1.id, "Date1");
    const leg1 = await createTestBookingLeg({
      booking_id: booking1.id, origin_code: "STY", destination_code: "MPA",
      leg_date: date1Str, leg_sequence: 1, flight_id: null,
    });
    await db.insertInto("booking_leg_passengers").values({
      booking_leg_id: leg1.id, booking_passenger_id: passenger1.id,
    } as any).execute();

    const booking2 = await createTestBooking();
    const passenger2 = await createTestPassenger(booking2.id, "Date2");
    const leg2 = await createTestBookingLeg({
      booking_id: booking2.id, origin_code: "STY", destination_code: "MPA",
      leg_date: date2Str, leg_sequence: 1, flight_id: null,
    });
    await db.insertInto("booking_leg_passengers").values({
      booking_leg_id: leg2.id, booking_passenger_id: passenger2.id,
    } as any).execute();

    const results1 = await findUnassignedByDate(date1Str);
    const results2 = await findUnassignedByDate(date2Str);

    expect(results1.find((r) => r.booking_leg_id === leg1.id)).toBeDefined();
    expect(results2.find((r) => r.booking_leg_id === leg2.id)).toBeDefined();
    expect(results2.find((r) => r.booking_leg_id === leg1.id)).toBeUndefined();
    expect(results1.find((r) => r.booking_leg_id === leg2.id)).toBeUndefined();
  });

  // ── Test: Returns empty array for a date with no unassigned legs ──────────
  it("returns empty array for a date with no unassigned booking legs", async () => {
    const results = await findUnassignedByDate("2099-12-31");
    expect(results).toEqual([]);
  });

  // ── Test: Does not return passengers with flight_leg_id set ──────────────
  // RULE 15: findUnassignedByDate checks blp.flight_leg_id IS NULL only.
  // Setting bl.flight_id alone does NOT hide passengers — they remain
  // in the pool until their individual flight_leg_id is set.
  it("does not return passengers whose flight_leg_id is set", async () => {
    const assignedDate = dateOnly(2026, 8, 11);
    const assignedDateStr = formatDateOnly(assignedDate);
    const uniqueScheduleDate = new Date(Date.now() + 86400000 * (500 + Math.floor(Math.random() * 1000)));

    const schedule = (await db.insertInto("schedules").values({
      schedule_date: uniqueScheduleDate, status: "draft", created_by: 1,
    } as any).returningAll().execute())[0];

    const flight = (await db.insertInto("flights").values({
      flight_number: `TST-ASN-${Date.now().toString(36)}`,
      origin_code: "STY", destination_code: "MPA",
      departure_time: new Date("2026-08-11T10:00:00.000Z"),
      arrival_time: new Date("2026-08-11T10:45:00.000Z"),
      status: "scheduled", schedule_id: schedule.id, created_by: 1,
      available_seats: 9, base_fare: 0,
    } as any).returningAll().execute())[0];

    const flightLeg = (await db.insertInto("flight_legs").values({
      flight_id: flight.id, leg_number: 1,
      origin_code: "STY", destination_code: "MPA",
      status: "scheduled",
    } as any).returningAll().execute())[0];

    const booking = await createTestBooking();
    const passenger = await createTestPassenger(booking.id, "Assigned");
    const assignedLeg = await createTestBookingLeg({
      booking_id: booking.id, origin_code: "STY", destination_code: "MPA",
      leg_date: assignedDateStr, leg_sequence: 1, flight_id: flight.id,
    });
    // Set flight_leg_id to mark the passenger as assigned
    await db.insertInto("booking_leg_passengers").values({
      booking_leg_id: assignedLeg.id, booking_passenger_id: passenger.id,
      flight_leg_id: flightLeg.id,
    } as any).execute();

    const results = await findUnassignedByDate(assignedDateStr);
    expect(results.find((r) => r.booking_leg_id === assignedLeg.id)).toBeUndefined();
  });

  // ── Test: Passengers with flight_id set but flight_leg_id NULL stay in pool ─
  // RULE 15: Sibling propagation sets booking_legs.flight_id but does NOT set
  // blp.flight_leg_id. Those passengers must remain in the unassigned pool.
  it("returns passengers when flight_id is set but flight_leg_id is still NULL", async () => {
    const assignedDate = dateOnly(2026, 8, 13);
    const assignedDateStr = formatDateOnly(assignedDate);
    const uniqueScheduleDate = new Date(Date.now() + 86400000 * (700 + Math.floor(Math.random() * 1000)));

    const schedule = (await db.insertInto("schedules").values({
      schedule_date: uniqueScheduleDate, status: "draft", created_by: 1,
    } as any).returningAll().execute())[0];

    const flight = (await db.insertInto("flights").values({
      flight_number: `TST-SIB-${Date.now().toString(36)}`,
      origin_code: "STY", destination_code: "MPA",
      departure_time: new Date("2026-08-13T10:00:00.000Z"),
      arrival_time: new Date("2026-08-13T10:45:00.000Z"),
      status: "scheduled", schedule_id: schedule.id, created_by: 1,
      available_seats: 9, base_fare: 0,
    } as any).returningAll().execute())[0];

    const booking = await createTestBooking();
    const passenger = await createTestPassenger(booking.id, "Sibling");
    const siblingLeg = await createTestBookingLeg({
      booking_id: booking.id, origin_code: "STY", destination_code: "MPA",
      leg_date: assignedDateStr, leg_sequence: 1, flight_id: flight.id,
    });
    // flight_id is set on the booking leg, but flight_leg_id is NOT set on the
    // junction — this simulates sibling propagation where the leg is linked
    // to a flight but the passenger was not individually assigned.
    await db.insertInto("booking_leg_passengers").values({
      booking_leg_id: siblingLeg.id, booking_passenger_id: passenger.id,
    } as any).execute();

    const results = await findUnassignedByDate(assignedDateStr);
    // Passenger must still be found because flight_leg_id IS NULL
    expect(results.find((r) => r.booking_leg_id === siblingLeg.id)).toBeDefined();
  });

  // ── Test: Excludes cancelled/completed bookings ────────────────────────────
  it("excludes booking legs whose booking status is cancelled or completed", async () => {
    const cancelledDate = dateOnly(2026, 8, 20);
    const cancelledDateStr = formatDateOnly(cancelledDate);

    const cancelledBooking = (await db.insertInto("bookings").values({
      booking_reference: `CNCL-${Date.now().toString(36).toUpperCase()}`,
      user_id: 1, status: "cancelled",
    } as any).returningAll().execute())[0];

    const passenger = await createTestPassenger(cancelledBooking.id, "Cancelled");
    const cancelledLeg = await createTestBookingLeg({
      booking_id: cancelledBooking.id, origin_code: "STY", destination_code: "MPA",
      leg_date: cancelledDateStr, leg_sequence: 1, flight_id: null,
    });
    await db.insertInto("booking_leg_passengers").values({
      booking_leg_id: cancelledLeg.id, booking_passenger_id: passenger.id,
    } as any).execute();

    const results = await findUnassignedByDate(cancelledDateStr);
    expect(results.find((r) => r.booking_leg_id === cancelledLeg.id)).toBeUndefined();
  });
});
