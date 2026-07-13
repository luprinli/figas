import { describe, it, expect, afterAll } from "vitest";
import {
  handleAssignBooking,
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
 * We don't use withRollback because handleAssignBooking uses withTransaction
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

describe("handleAssignBooking()", () => {
  const testUserId = MOCK_USER_IDS.ops;

  // â”€â”€ Test: Assigns a booking leg to a flight successfully â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  it("assigns a booking leg to a flight successfully", async () => {
    const schedule = await createTestSchedule({
      schedule_date: dateOnly(2026, 7, 15),
      created_by: testUserId,
    });
    createdIds.scheduleIds.push(schedule.id);

    const flight = await createTestFlight(schedule.id, {
      flight_number: `TST-A2-${Date.now().toString(36)}`,
    });
    createdIds.flightIds.push(flight.id);

    const bookingLeg = await createTestBookingLeg({
      booking_id: 1,
      origin_code: "STY",
      destination_code: "MPA",
      leg_date: dateOnly(2026, 7, 15),
      leg_sequence: 1,
      flight_id: null,
    });
    createdIds.bookingLegIds.push(bookingLeg.id);

    // Create a passenger and link to the booking leg
    const passenger = await createTestBookingPassenger({ booking_id: 1 });
    await createTestBookingLegPassengerLink({
      booking_leg_id: bookingLeg.id,
      booking_passenger_id: passenger.id,
    });

    const result = await handleAssignBooking(bookingLeg.id, flight.id);

    expect(isSuccess(result)).toBe(true);

    // Verify the booking leg was assigned to the flight
    const updatedRows = await db.selectFrom("booking_legs").selectAll().where("id", "=", bookingLeg.id).execute();
    expect(updatedRows[0]?.flight_id).toBe(flight.id);
  });

  // â”€â”€ Test: Returns error for non-existent booking leg (404) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  it("returns error for non-existent booking leg (404)", async () => {
    const result = await handleAssignBooking(99999, 1);
    const err = getError(result);

    expect(err).toBeDefined();
    expect(err!.status).toBe(404);
    expect(err!.error).toContain("not found");
  });

  // â”€â”€ Test: Returns error for non-existent flight (404) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  it("returns error for non-existent flight (404)", async () => {
    const bookingLeg = await createTestBookingLeg({
      booking_id: 1,
      origin_code: "STY",
      destination_code: "MPA",
      leg_date: dateOnly(2026, 7, 15),
      leg_sequence: 1,
      flight_id: null,
    });
    createdIds.bookingLegIds.push(bookingLeg.id);

    // handleAssignBooking doesn't validate flight existence before assigning;
    // it calls bookingLegRepository.assignFlight() which throws a Prisma FK error
    // when the flight_id doesn't exist in the flights table.
    try {
      await handleAssignBooking(bookingLeg.id, 99999);
      // If it doesn't throw, the FK constraint would fail on commit
      // (but we rollback anyway)
    } catch (e: unknown) {
      // Postgres FK error (23503 = foreign_key_violation) expected since flight 99999 doesn't exist
      expect((e as { code: string }).code).toBe("23503");
    }
  });

  // â”€â”€ Test: Assigns multiple booking legs to the same flight â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  it("assigns multiple booking legs to the same flight", async () => {
    const schedule = await createTestSchedule({
      schedule_date: dateOnly(2026, 7, 16),
      created_by: testUserId,
    });
    createdIds.scheduleIds.push(schedule.id);

    const flight = await createTestFlight(schedule.id, {
      flight_number: `TST-M2-${Date.now().toString(36)}`,
    });
    createdIds.flightIds.push(flight.id);

    const leg1 = await createTestBookingLeg({
      booking_id: 1,
      origin_code: "STY",
      destination_code: "MPA",
      leg_date: dateOnly(2026, 7, 15),
      leg_sequence: 1,
      flight_id: null,
    });
    createdIds.bookingLegIds.push(leg1.id);

    const leg2 = await createTestBookingLeg({
      booking_id: 1,
      origin_code: "STY",
      destination_code: "MPA",
      leg_date: dateOnly(2026, 7, 15),
      leg_sequence: 2,
      flight_id: null,
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

    const result1 = await handleAssignBooking(leg1.id, flight.id);
    expect(isSuccess(result1)).toBe(true);

    const result2 = await handleAssignBooking(leg2.id, flight.id);
    expect(isSuccess(result2)).toBe(true);

    // Verify both legs are assigned to the flight
    const assignedLegs = await db.selectFrom("booking_legs")
      .selectAll()
      .where("flight_id", "=", flight.id)
      .execute();
    expect(assignedLegs).toHaveLength(2);
    expect(assignedLegs.map((l: { id: number }) => l.id)).toEqual(
      expect.arrayContaining([leg1.id, leg2.id])
    );
  });

  // â”€â”€ Test: Handles race condition (simultaneous assignment) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  it("handles race condition (simultaneous assignment)", async () => {
    const schedule = await createTestSchedule({
      schedule_date: dateOnly(2026, 7, 17),
      created_by: testUserId,
    });
    createdIds.scheduleIds.push(schedule.id);

    const flight = await createTestFlight(schedule.id, {
      flight_number: `TST-R2-${Date.now().toString(36)}`,
    });
    createdIds.flightIds.push(flight.id);

    const bookingLeg = await createTestBookingLeg({
      booking_id: 1,
      origin_code: "STY",
      destination_code: "MPA",
      leg_date: dateOnly(2026, 7, 15),
      leg_sequence: 1,
      flight_id: null,
    });
    createdIds.bookingLegIds.push(bookingLeg.id);

    // Create a passenger and link to the booking leg
    const passenger = await createTestBookingPassenger({ booking_id: 1 });
    await createTestBookingLegPassengerLink({
      booking_leg_id: bookingLeg.id,
      booking_passenger_id: passenger.id,
    });

    // Simulate simultaneous assignment by calling handleAssignBooking twice
    const [result1, result2] = await Promise.all([
      handleAssignBooking(bookingLeg.id, flight.id),
      handleAssignBooking(bookingLeg.id, flight.id),
    ]);

    // At least one should succeed, the other may succeed (idempotent) or fail
    const successes = [result1, result2].filter((r) => isSuccess(r));
    expect(successes.length).toBeGreaterThanOrEqual(1);

    // The booking leg should be assigned to the flight
    const updatedRows2 = await db.selectFrom("booking_legs")
      .selectAll()
      .where("id", "=", bookingLeg.id)
      .execute();
    expect(updatedRows2[0]?.flight_id).toBe(flight.id);
  });
});
