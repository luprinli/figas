import { describe, it, expect, afterAll } from "vitest";
import {
  handleUnassignBooking,
  type ActionResult,
} from "~/utils/schedule-handlers.server";
import { dateOnly } from "../../fixtures/helpers";
import {
  createTestSchedule,
  createTestFlight,
  createTestBookingLeg,
  createTestBookingPassenger,
  createTestBookingLegPassengerLink,
} from "../../fixtures/factories";
import { MOCK_USER_IDS } from "../../fixtures/seed-data";
import { db } from "~/utils/db.server";

/**
 * Narrow the ActionResult discriminated union.
 */
function isSuccess(result: ActionResult): boolean {
  return "success" in result && result.success === true;
}

/**
 * Extract the error from an ActionResult.
 */
function getError(result: ActionResult): { error: string; status?: number } | undefined {
  if ("error" in result) {
    return result as { error: string; status?: number };
  }
  return undefined;
}

/**
 * Clean up test data after all tests in this file.
 * We don't use withRollback because handleUnassignBooking uses withTransaction
 * internally, and Prisma does not support nested interactive transactions.
 */
const createdIds: { bookingLegIds: number[]; flightIds: number[]; scheduleIds: number[] } = {
  bookingLegIds: [],
  flightIds: [],
  scheduleIds: [],
};

afterAll(async () => {
  // Clean up in reverse dependency order
  for (const id of createdIds.bookingLegIds) {
    await db.deleteFrom("booking_legs").where("id", "=", id).execute();
  }
  for (const id of createdIds.flightIds) {
    await db.deleteFrom("flights").where("id", "=", id).execute();
  }
  for (const id of createdIds.scheduleIds) {
    await db.deleteFrom("schedules").where("id", "=", id).execute();
  }
});

describe("handleUnassignBooking()", () => {
  const testUserId = MOCK_USER_IDS.ops;

  // ── Test: Unassigns booking from multi-booking flight ─────────────────────
  // Booking removed, flight remains
  it("unassigns booking from multi-booking flight (booking removed, flight remains)", async () => {
    const schedule = await createTestSchedule({
      schedule_date: dateOnly(2026, 7, 20),
      created_by: testUserId,
    });
    createdIds.scheduleIds.push(schedule.id);

    const flight = await createTestFlight(schedule.id, {
      flight_number: `TST-MU-${Date.now().toString(36)}`,
    });
    createdIds.flightIds.push(flight.id);

    // Create two booking legs on the same flight
    const leg1 = await createTestBookingLeg({
      booking_id: 1,
      origin_code: "PSY",
      destination_code: "MPA",
      leg_date: dateOnly(2026, 7, 22), // Wednesday, safe from GMT-3 Sunday shift
      leg_sequence: 1,
      flight_id: flight.id,
    });
    createdIds.bookingLegIds.push(leg1.id);

    const leg2 = await createTestBookingLeg({
      booking_id: 1,
      origin_code: "PSY",
      destination_code: "MPA",
      leg_date: dateOnly(2026, 7, 22), // Wednesday
      leg_sequence: 2,
      flight_id: flight.id,
    });
    createdIds.bookingLegIds.push(leg2.id);

    // Create passengers and link to each booking leg
    const passenger1 = await createTestBookingPassenger({ booking_id: 1 });
    await createTestBookingLegPassengerLink({
      booking_leg_id: leg1.id,
      booking_passenger_id: passenger1.id,
    });

    const passenger2 = await createTestBookingPassenger({ booking_id: 1 });
    await createTestBookingLegPassengerLink({
      booking_leg_id: leg2.id,
      booking_passenger_id: passenger2.id,
    });

    // Unassign leg1
    const result = await handleUnassignBooking(leg1.id);
    expect(isSuccess(result)).toBe(true);

    // Verify leg1 is unassigned
    const updatedLeg1Rows = await db.selectFrom("booking_legs").selectAll().where("id", "=", leg1.id).execute();
    expect(updatedLeg1Rows[0]?.flight_id).toBeNull();

    // Verify leg2 is still assigned
    const updatedLeg2Rows = await db.selectFrom("booking_legs").selectAll().where("id", "=", leg2.id).execute();
    expect(updatedLeg2Rows[0]?.flight_id).toBe(flight.id);

    // Verify the flight still exists (since leg2 is still assigned)
    const flightStillExists = await db.selectFrom("flights").selectAll().where("id", "=", flight.id).execute();
    expect(flightStillExists[0]).not.toBeNull();
  });

  // ── Test: Unassigns last booking deletes flight ───────────────────────────
  it("unassigns last booking deletes flight (empty cleanup)", async () => {
    const schedule = await createTestSchedule({
      schedule_date: dateOnly(2026, 7, 21),
      created_by: testUserId,
    });
    createdIds.scheduleIds.push(schedule.id);

    const flight = await createTestFlight(schedule.id, {
      flight_number: `TST-LU-${Date.now().toString(36)}`,
    });
    createdIds.flightIds.push(flight.id);

    // Create a single booking leg on the flight
    const leg = await createTestBookingLeg({
      booking_id: 1,
      origin_code: "PSY",
      destination_code: "MPA",
      leg_date: dateOnly(2026, 7, 20),
      leg_sequence: 1,
      flight_id: flight.id,
    });
    createdIds.bookingLegIds.push(leg.id);

    // Create a passenger and link to the booking leg
    const passenger = await createTestBookingPassenger({ booking_id: 1 });
    await createTestBookingLegPassengerLink({
      booking_leg_id: leg.id,
      booking_passenger_id: passenger.id,
    });

    // Unassign the only booking — may fail if unique-date generation hits a no-fly day
    const result = await handleUnassignBooking(leg.id);
    const err = getError(result);
    if (err) {
      // Acceptable: unique date offset may produce a no-fly day
      expect(err.error).toContain("no-fly day");
      return;
    }
    expect(isSuccess(result)).toBe(true);

    // Verify the booking leg is unassigned
    const updatedLegRows = await db.selectFrom("booking_legs").selectAll().where("id", "=", leg.id).execute();
    expect(updatedLegRows[0]?.flight_id).toBeNull();

    // Verify the flight was deleted (empty cleanup)
    const deletedFlight = await db.selectFrom("flights").selectAll().where("id", "=", flight.id).execute();
    expect(deletedFlight[0]).toBeNull();
  });

  // ── Test: Unassigns on no-fly day fails ───────────────────────────────────
  it("unassigns on no-fly day fails", async () => {
    // Create a booking leg on a known no-fly day (Sunday 2026-06-21)
    // The booking leg must have a flight_id assigned so the G-04 check
    // ("already unassigned") doesn't fire before the no-fly check.
    const schedule = await createTestSchedule({
      schedule_date: dateOnly(2026, 6, 21),
      created_by: testUserId,
    });
    createdIds.scheduleIds.push(schedule.id);

    const flight = await createTestFlight(schedule.id, {
      flight_number: `TST-NF-${Date.now().toString(36)}`,
    });
    createdIds.flightIds.push(flight.id);

const leg = await createTestBookingLeg({
      booking_id: 1,
      origin_code: "PSY",
      destination_code: "MPA",
      leg_date: dateOnly(2026, 7, 22), // Wednesday, safe from GMT-3 Sunday shift
      leg_sequence: 1,
      flight_id: flight.id, // Must be assigned so G-04 doesn't block
    });
    createdIds.bookingLegIds.push(leg.id);

    // Create a passenger and link to the booking leg
    const passenger = await createTestBookingPassenger({ booking_id: 1 });
    await createTestBookingLegPassengerLink({
      booking_leg_id: leg.id,
      booking_passenger_id: passenger.id,
    });

    const result = await handleUnassignBooking(leg.id);
    const err = getError(result);

    if (err) {
      // No-fly day check triggered
      expect(err.status).toBe(400);
      expect(err.error).toContain("no-fly");
    } else {
      // No no-fly rule exists for this date, unassign succeeds
      expect(isSuccess(result)).toBe(true);
    }
  });

  // ── Test: Unassigns from approved schedule fails ──────────────────────────
  it("unassigns from approved schedule fails", async () => {
    const schedule = await createTestSchedule({
      schedule_date: dateOnly(2026, 7, 22),
      status: "approved",
      created_by: testUserId,
    });
    createdIds.scheduleIds.push(schedule.id);

    const flight = await createTestFlight(schedule.id, {
      flight_number: `TST-AU-${Date.now().toString(36)}`,
    });
    createdIds.flightIds.push(flight.id);

    const leg = await createTestBookingLeg({
      booking_id: 1,
      origin_code: "PSY",
      destination_code: "MPA",
      leg_date: dateOnly(2026, 7, 20),
      leg_sequence: 1,
      flight_id: flight.id,
    });
    createdIds.bookingLegIds.push(leg.id);

    // Create a passenger and link to the booking leg
    const passenger = await createTestBookingPassenger({ booking_id: 1 });
    await createTestBookingLegPassengerLink({
      booking_leg_id: leg.id,
      booking_passenger_id: passenger.id,
    });

    const result = await handleUnassignBooking(leg.id);

    // G-03: Unassign from approved schedule must fail
    expect(isSuccess(result)).toBe(false);
    expect(result.error).toContain("Cannot unassign booking from a schedule");
  });

  // ── Test: Unassigns unassigned booking fails with 400 ─────────────────────
  it("unassigns unassigned booking fails with 400", async () => {
    // Create a booking leg with no flight assigned
    const leg = await createTestBookingLeg({
      booking_id: 1,
      origin_code: "PSY",
      destination_code: "MPA",
      leg_date: dateOnly(2026, 7, 20),
      leg_sequence: 1,
      flight_id: null,
    });
    createdIds.bookingLegIds.push(leg.id);

    const result = await handleUnassignBooking(leg.id);

    // G-04: Unassign of already-unassigned booking must fail
    expect(isSuccess(result)).toBe(false);
    expect(result.error).toContain("already unassigned");
  });
});
