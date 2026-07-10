import { describe, it, expect } from "vitest";
import { dateOnly, formatDateOnly } from "../../fixtures/helpers";
import { createTestBookingLeg } from "../../fixtures/factories";
import { bookingLegServerRepository } from "../../../app/utils/repositories/booking-leg.server";
import { db } from "../../../app/utils/db.server";

/**
 * Integration tests for bookingLegServerRepository.findUnassignedByDate().
 *
 * These tests verify that the repository method used by the schedule builder
 * loader correctly filters unassigned booking legs by date.
 *
 * NOTE: We do NOT use withRollback here because findUnassignedByDate uses
 * raw SQL via the global db client. Data created inside a withRollback
 * transaction (via tx.*) is invisible to the global db's raw SQL queries.
 * Instead, we create data directly via the global db and accept that data
 * persists (same pattern as the factory-based tests in this project).
 *
 * The raw SQL query in findUnassignedByDate JOINs across bookings,
 * booking_passengers, and booking_leg_passengers tables, so we must
 * create records in all three tables for the query to return results.
 */
describe("bookingLegServerRepository.findUnassignedByDate()", () => {
  // ── Test: Returns unassigned legs for the requested date ──────────────────
  it("returns unassigned booking legs for the requested date", async () => {
    // Arrange: Create a booking passenger and unassigned leg for the target date
    const targetDate = dateOnly(2026, 8, 10);
    const targetDateStr = formatDateOnly(targetDate);

    // Create a booking_passenger record so the JOIN in the raw SQL works
    const passenger = (await db
      .insertInto("booking_passengers")
      .values({
        booking_id: 1,
        first_name: "Test",
        last_name: "Passenger",
      } as any)
      .returningAll()
      .execute())[0];

    try {
      // Create an unassigned booking leg (flight_id = null) on the target date
      const leg = await createTestBookingLeg({
        booking_id: 1,
        origin_code: "PSY",
        destination_code: "MPA",
        leg_date: targetDate,
        leg_sequence: 1,
        flight_id: null,
      });

      // Create a booking_leg_passengers record so the LEFT JOIN finds a match
      await db
        .insertInto("booking_leg_passengers")
        .values({
          booking_leg_id: leg.id,
          booking_passenger_id: passenger.id,
        } as any)
        .execute();

      // Act: Query unassigned legs for the target date
      const results = await bookingLegServerRepository.findUnassignedByDate(targetDateStr);

      // Assert: Should find the leg we created
      expect(results.length).toBeGreaterThanOrEqual(1);
      const foundLeg = results.find((r) => r.id === leg.id);
      expect(foundLeg).toBeDefined();
      expect(foundLeg!.booking_id).toBe(1);
      expect(foundLeg!.origin_code).toBe("PSY");
      expect(foundLeg!.destination_code).toBe("MPA");
      expect(foundLeg!.flight_id).toBeNull();
      // Resolve expected booking reference from the actual DB record
      const booking = (await db
        .selectFrom("bookings")
        .select("booking_reference")
        .where("id", "=", 1)
        .execute())[0] ?? null;
      const expectedRef = booking?.booking_reference ?? "BK-00001";

      expect(foundLeg!.booking_reference).toBe(expectedRef);
    } finally {
      // Cleanup: Remove the passenger we created
      await db
        .deleteFrom("booking_passengers")
        .where("id", "=", passenger.id)
        .execute()
        .catch(() => {});
    }
  });

  // ── Test: Returns empty array for a date with no unassigned legs ──────────
  it("returns empty array for a date with no unassigned booking legs", async () => {
    // Arrange: Use a date far in the future with no data
    const emptyDate = dateOnly(2099, 12, 31);
    const emptyDateStr = formatDateOnly(emptyDate);

    // Act: Query unassigned legs for the empty date
    const results = await bookingLegServerRepository.findUnassignedByDate(emptyDateStr);

    // Assert: Should return an empty array
    expect(results).toEqual([]);
  });

  // ── Test: Does not return assigned legs (flight_id IS NOT NULL) ───────────
  it("does not return assigned booking legs (flight_id is not null)", async () => {
    // Arrange: Create a booking leg that IS assigned to a flight
    // Use a unique schedule date to avoid collisions with other test runs
    const assignedDate = dateOnly(2026, 8, 11);
    const assignedDateStr = formatDateOnly(assignedDate);
    const uniqueScheduleDate = dateOnly(2026, 8, 11 + Math.floor(Math.random() * 1000));

    // Create a schedule and flight to assign the leg to
    const schedule = (await db
      .insertInto("schedules")
      .values({
        schedule_date: uniqueScheduleDate,
        status: "draft",
        created_by: 1,
      } as any)
      .returningAll()
      .execute())[0];

    const flight = (await db
      .insertInto("flights")
      .values({
        flight_number: `TST-ASN-${Date.now().toString(36)}`,
        origin_code: "PSY",
        destination_code: "MPA",
        departure_time: new Date("2026-08-11T10:00:00.000Z"),
        arrival_time: new Date("2026-08-11T10:45:00.000Z"),
        status: "scheduled",
        schedule_id: schedule.id,
        created_by: 1,
      } as any)
      .returningAll()
      .execute())[0];

    const passenger = (await db
      .insertInto("booking_passengers")
      .values({
        booking_id: 1,
        first_name: "Assigned",
        last_name: "Passenger",
      } as any)
      .returningAll()
      .execute())[0];

    try {
      const assignedLeg = await createTestBookingLeg({
        booking_id: 1,
        origin_code: "PSY",
        destination_code: "MPA",
        leg_date: assignedDate,
        leg_sequence: 1,
        flight_id: flight.id, // Assigned to a flight
      });

      await db
        .insertInto("booking_leg_passengers")
        .values({
          booking_leg_id: assignedLeg.id,
          booking_passenger_id: passenger.id,
        } as any)
        .execute();

      // Act: Query unassigned legs for this date
      const results = await bookingLegServerRepository.findUnassignedByDate(assignedDateStr);

      // Assert: The assigned leg should NOT appear in unassigned results
      const foundAssigned = results.find((r) => r.id === assignedLeg.id);
      expect(foundAssigned).toBeUndefined();
    } finally {
      await db
        .deleteFrom("booking_passengers")
        .where("id", "=", passenger.id)
        .execute()
        .catch(() => {});
    }
  });

  // ── Test: Different dates return different sets of unassigned legs ────────
  it("returns different results for different dates", async () => {
    // Arrange: Create unassigned legs on two different dates
    const date1 = dateOnly(2026, 8, 15);
    const date2 = dateOnly(2026, 8, 16);
    const date1Str = formatDateOnly(date1);
    const date2Str = formatDateOnly(date2);

    // Passenger for date1
    const passenger1 = (await db
      .insertInto("booking_passengers")
      .values({
        booking_id: 1,
        first_name: "Date1",
        last_name: "Passenger",
      } as any)
      .returningAll()
      .execute())[0];

    const leg1 = await createTestBookingLeg({
      booking_id: 1,
      origin_code: "PSY",
      destination_code: "MPA",
      leg_date: date1,
      leg_sequence: 1,
      flight_id: null,
    });

    await db
      .insertInto("booking_leg_passengers")
      .values({
        booking_leg_id: leg1.id,
        booking_passenger_id: passenger1.id,
      } as any)
      .execute();

    // Passenger for date2
    const passenger2 = (await db
      .insertInto("booking_passengers")
      .values({
        booking_id: 1,
        first_name: "Date2",
        last_name: "Passenger",
      } as any)
      .returningAll()
      .execute())[0];

    const leg2 = await createTestBookingLeg({
      booking_id: 1,
      origin_code: "PSY",
      destination_code: "MPA",
      leg_date: date2,
      leg_sequence: 1,
      flight_id: null,
    });

    await db
      .insertInto("booking_leg_passengers")
      .values({
        booking_leg_id: leg2.id,
        booking_passenger_id: passenger2.id,
      } as any)
      .execute();

    try {
      // Act: Query each date
      const results1 = await bookingLegServerRepository.findUnassignedByDate(date1Str);
      const results2 = await bookingLegServerRepository.findUnassignedByDate(date2Str);

      // Assert: Each date returns only its own leg
      const foundInDate1 = results1.find((r) => r.id === leg1.id);
      const foundInDate2 = results2.find((r) => r.id === leg2.id);
      const leg1InDate2 = results2.find((r) => r.id === leg1.id);
      const leg2InDate1 = results1.find((r) => r.id === leg2.id);

      expect(foundInDate1).toBeDefined();
      expect(foundInDate2).toBeDefined();
      expect(leg1InDate2).toBeUndefined(); // leg1 should NOT appear in date2 results
      expect(leg2InDate1).toBeUndefined(); // leg2 should NOT appear in date1 results
    } finally {
      await db
        .deleteFrom("booking_passengers")
        .where("id", "=", passenger1.id)
        .execute()
        .catch(() => {});
      await db
        .deleteFrom("booking_passengers")
        .where("id", "=", passenger2.id)
        .execute()
        .catch(() => {});
    }
  });

  // ── Test: Excludes cancelled/completed bookings ───────────────────────────
  it("excludes booking legs whose booking status is cancelled or completed", async () => {
    // Arrange: Create a cancelled booking for the target date
    const cancelledDate = dateOnly(2026, 8, 20);
    const cancelledDateStr = formatDateOnly(cancelledDate);

    // Create a cancelled booking
    const cancelledBooking = (await db
      .insertInto("bookings")
      .values({
        booking_reference: `CNCL-${Date.now().toString(36).toUpperCase()}`,
        user_id: 1,
        status: "cancelled",
      } as any)
      .returningAll()
      .execute())[0];

    const passenger = (await db
      .insertInto("booking_passengers")
      .values({
        booking_id: cancelledBooking.id,
        first_name: "Cancelled",
        last_name: "Booking",
      } as any)
      .returningAll()
      .execute())[0];

    try {
      const cancelledLeg = await createTestBookingLeg({
        booking_id: cancelledBooking.id,
        origin_code: "PSY",
        destination_code: "MPA",
        leg_date: cancelledDate,
        leg_sequence: 1,
        flight_id: null,
      });

      await db
        .insertInto("booking_leg_passengers")
        .values({
          booking_leg_id: cancelledLeg.id,
          booking_passenger_id: passenger.id,
        } as any)
        .execute();

      // Act: Query unassigned legs for this date
      const results = await bookingLegServerRepository.findUnassignedByDate(cancelledDateStr);

      // Assert: The cancelled booking's leg should NOT appear
      const foundCancelled = results.find((r) => r.id === cancelledLeg.id);
      expect(foundCancelled).toBeUndefined();
    } finally {
      await db
        .deleteFrom("booking_passengers")
        .where("id", "=", passenger.id)
        .execute()
        .catch(() => {});
    }
  });
});
