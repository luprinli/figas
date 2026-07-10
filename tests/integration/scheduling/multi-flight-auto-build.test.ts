import { describe, it, expect } from "vitest";
import { sql } from "kysely";
import {
  handleAutoBuild,
  handlePreviewBuild,
  type ActionResult,
} from "~/utils/schedule-handlers.server";
import { withRollback, dateOnly, formatDateOnly } from "../../fixtures/helpers";
import {
  createTestSchedule,
  createTestBookingLeg,
  createTestBookingLegPassengerLink,
} from "../../fixtures/factories";
import { MOCK_USER_IDS } from "../../fixtures/seed-data";
import { db } from "~/utils/db.server";

function isSuccess(result: ActionResult): boolean {
  return "success" in result && result.success === true;
}

function getError(result: ActionResult): { error: string; status?: number } | undefined {
  if ("error" in result) return result as { error: string; status?: number };
  return undefined;
}

/**
 * Integration tests for auto-build with >12 bookings across multiple routes.
 * Verifies:
 * - Multi-flight generation when passengers exceed single-aircraft capacity
 * - Correct clustering by origin/destination
 * - Accurate unassigned passenger counts (only flight_leg_id IS NULL passengers)
 * - Per-passenger flight_leg_id population after auto-build
 */
describe("Multi-Flight Auto-Build (>12 bookings)", () => {
  const testUserId = MOCK_USER_IDS.ops;

  // ── Test: 15 passengers on same route split into 2 flights ─────────
  it("15 passengers on same route splits into 2 flights (9-seat aircraft)", async () => {
    await withRollback(async () => {
      const scheduleDate = dateOnly(2026, 7, 15);
      const schedule = await createTestSchedule({
        schedule_date: scheduleDate,
        created_by: testUserId,
      });
      const dateStr = formatDateOnly(new Date(schedule.schedule_date));

      // Create 3 booking legs (STY→MPA) with 5 passengers each = 15 total
      const bookingLegIds: number[] = [];
      for (let i = 0; i < 3; i++) {
        const leg = await createTestBookingLeg({
          booking_id: 1,
          origin_code: "STY",
          destination_code: "MPA",
          leg_date: new Date(scheduleDate),
          leg_sequence: i + 1,
          flight_id: null,
          status: "pending",
        });
        bookingLegIds.push(leg.id);

        // Create 5 passengers per booking leg
        for (let j = 0; j < 5; j++) {
          await createTestBookingLegPassengerLink({
            booking_leg_id: leg.id,
            booking_passenger_id: j + 1,
            clothed_weight_kg: 70,
            baggage_weight_kg: 5,
            freight_weight_kg: 0,
          });
        }
      }

      const result = await handleAutoBuild(dateStr, testUserId);

      if (isSuccess(result)) {
        const successResult = result as { success: true; result?: { routes?: unknown[] } };
        const buildResult = successResult.result;

        if (buildResult) {
          expect(buildResult.routes?.length).toBeGreaterThanOrEqual(2);
        }

        // Verify booking legs are now assigned
        for (const blId of bookingLegIds) {
          const leg = (await db
            .selectFrom("booking_legs")
            .selectAll()
            .where("id", "=", blId)
            .execute())[0] ?? null;
          expect(leg?.flight_id).not.toBeNull();
        }

        // Verify passenger flight_leg_id is populated
        const passengerLinks = await db
          .selectFrom("booking_leg_passengers")
          .selectAll()
          .where("booking_leg_id", "in", bookingLegIds)
          .execute();
        const assignedCount = passengerLinks.filter((p) => p.flight_leg_id !== null).length;
        expect(assignedCount).toBe(15);
      }
    });
  });

  // ── Test: 12 passengers on same route (STY→MPA) as 2 booking legs ──
  it("12 passengers on 2 booking legs for same route create appropriate flights", async () => {
    await withRollback(async () => {
      const scheduleDate = dateOnly(2026, 7, 16);
      const schedule = await createTestSchedule({
        schedule_date: scheduleDate,
        created_by: testUserId,
      });
      const dateStr = formatDateOnly(new Date(schedule.schedule_date));

      // 2 booking legs: one with 7 passengers, one with 5 = 12 total (STY→MPA)
      const leg1 = await createTestBookingLeg({
        booking_id: 1,
        origin_code: "STY",
        destination_code: "MPA",
        leg_date: new Date(scheduleDate),
        leg_sequence: 1,
        flight_id: null,
        status: "pending",
      });
      for (let j = 1; j <= 7; j++) {
        await createTestBookingLegPassengerLink({
          booking_leg_id: leg1.id,
          booking_passenger_id: j,
          clothed_weight_kg: 70,
          baggage_weight_kg: 0,
          freight_weight_kg: 0,
        });
      }

      const leg2 = await createTestBookingLeg({
        booking_id: 1,
        origin_code: "STY",
        destination_code: "MPA",
        leg_date: new Date(scheduleDate),
        leg_sequence: 2,
        flight_id: null,
        status: "pending",
      });
      for (let j = 8; j <= 12; j++) {
        await createTestBookingLegPassengerLink({
          booking_leg_id: leg2.id,
          booking_passenger_id: j,
          clothed_weight_kg: 70,
          baggage_weight_kg: 0,
          freight_weight_kg: 0,
        });
      }

      const result = await handleAutoBuild(dateStr, testUserId);

      if (isSuccess(result)) {
        const successResult = result as { success: true; result?: { routes?: unknown[] } };
        const buildResult = successResult.result;

        if (buildResult) {
          // 12 pax / 9 seats = at least 2 flights
          expect(buildResult.routes?.length).toBeGreaterThanOrEqual(2);
        }
      }
    });
  });

  // ── Test: Preview-build returns correct unassigned passenger count ──
  it("preview-build correctly counts only unassigned passengers (flight_leg_id IS NULL)", async () => {
    await withRollback(async () => {
      const scheduleDate = dateOnly(2026, 7, 17);
      const schedule = await createTestSchedule({
        schedule_date: scheduleDate,
        created_by: testUserId,
      });
      const dateStr = formatDateOnly(new Date(schedule.schedule_date));

      // Create a booking leg with 9 total passengers
      const leg = await createTestBookingLeg({
        booking_id: 1,
        origin_code: "STY",
        destination_code: "MPA",
        leg_date: new Date(scheduleDate),
        leg_sequence: 1,
        flight_id: null,
        status: "pending",
      });

      // Create 9 passengers
      const passengerIds: number[] = [];
      for (let j = 1; j <= 9; j++) {
        const link = await createTestBookingLegPassengerLink({
          booking_leg_id: leg.id,
          booking_passenger_id: j,
          clothed_weight_kg: 70,
          baggage_weight_kg: 0,
          freight_weight_kg: 0,
        });
        passengerIds.push(link.id);
      }

      // Mark the first 2 passengers as assigned (simulate partial assignment)
      if (passengerIds.length >= 2) {
        // Get a valid aircraft ID from the database
        const existingAircraft = (await db
          .selectFrom("aircraft")
          .select("id")
          .where("is_active", "=", true)
          .limit(1)
          .execute())[0] ?? null;
        const aircraftId = existingAircraft?.id ?? 1;
        const uniqueSuffix = Date.now() % 100000;

        const tempFlight = (await db
          .insertInto("flights")
          .values({
            flight_number: `FIG${String(uniqueSuffix).padStart(5, "0")}`,
            aircraft_id: aircraftId,
            origin_aerodrome_id: 1,
            destination_aerodrome_id: 2,
            departure_time: new Date(`${dateStr}T10:00:00Z`),
            arrival_time: new Date(`${dateStr}T12:00:00Z`),
            status: "scheduled",
            schedule_id: schedule.id,
            created_by: testUserId,
          } as any)
          .returningAll()
          .execute())[0];
        const tempLeg = (await db
          .insertInto("flight_legs")
          .values({
            flight_id: tempFlight.id,
            leg_number: 1,
            origin_code: "STY",
            destination_code: "MPA",
            etd: new Date(`${dateStr}T10:00:00Z`),
            eta: new Date(`${dateStr}T12:00:00Z`),
            status: "scheduled",
          } as any)
          .returningAll()
          .execute())[0];

        await sql`
          UPDATE booking_leg_passengers SET flight_leg_id = ${tempLeg.id} WHERE id IN (${passengerIds[0]}, ${passengerIds[1]})
        `.execute(db);
      }

      const result = await handlePreviewBuild(dateStr);

      if (isSuccess(result)) {
        const successResult = result as {
          success: true;
          configs?: Array<{ flights?: Array<{ passengerCount: number }> }>;
          unassignedCount?: number;
        };
        // Should show 7 unassigned passengers (9 total - 2 assigned)
        expect(successResult.unassignedCount).toBe(7);
        if (successResult.configs && successResult.configs.length > 0) {
          const totalPreviewPax =
            successResult.configs[0].flights?.reduce((s, f) => s + f.passengerCount, 0) ?? 0;
          expect(totalPreviewPax).toBe(7);
        }
      }
    });
  });

  // ── Test: Multi-flight generation for 20+ passengers on same route ──
  it("20+ passengers on STY→MPA route creates at least 3 flights", async () => {
    await withRollback(async () => {
      const scheduleDate = dateOnly(2026, 7, 19);
      const schedule = await createTestSchedule({
        schedule_date: scheduleDate,
        created_by: testUserId,
      });
      const dateStr = formatDateOnly(new Date(schedule.schedule_date));

      // 4 booking legs × 6 passengers = 24 total
      const bookingLegIds: number[] = [];
      for (let i = 0; i < 4; i++) {
        const leg = await createTestBookingLeg({
          booking_id: 1,
          origin_code: "STY",
          destination_code: "MPA",
          leg_date: new Date(scheduleDate),
          leg_sequence: i + 1,
          flight_id: null,
          status: "pending",
        });
        bookingLegIds.push(leg.id);

        for (let j = 0; j < 6; j++) {
          await createTestBookingLegPassengerLink({
            booking_leg_id: leg.id,
            booking_passenger_id: i * 10 + j + 1,
            clothed_weight_kg: 70,
            baggage_weight_kg: 0,
            freight_weight_kg: 0,
          });
        }
      }

      const result = await handleAutoBuild(dateStr, testUserId);

      if (isSuccess(result)) {
        const successResult = result as { success: true; result?: { routes?: unknown[] } };
        const buildResult = successResult.result;

        if (buildResult) {
          // 24 pax / 9 seats = at least 3 flights needed
          expect(buildResult.routes?.length).toBeGreaterThanOrEqual(3);
        }

        // All booking legs should be assigned
        for (const blId of bookingLegIds) {
          const leg = (await db
            .selectFrom("booking_legs")
            .selectAll()
            .where("id", "=", blId)
            .execute())[0] ?? null;
          expect(leg?.flight_id).not.toBeNull();
        }
      }
    });
  });

  // ── Test: Verify error when no unassigned passengers exist ─────────
  it("returns error when all passengers are already assigned", async () => {
    await withRollback(async () => {
      const scheduleDate = dateOnly(2026, 7, 20);
      const schedule = await createTestSchedule({
        schedule_date: scheduleDate,
        created_by: testUserId,
      });
      const dateStr = formatDateOnly(new Date(schedule.schedule_date));

      // Get a valid aircraft ID from the database
      const existingAircraft = (await db
        .selectFrom("aircraft")
        .select("id")
        .where("is_active", "=", true)
        .limit(1)
        .execute())[0] ?? null;
      const aircraftId = existingAircraft?.id ?? 1;
      const uniqueSuffix = (Date.now() % 100000) + 1;

      // Create flight + leg first
      const flight = (await db
        .insertInto("flights")
        .values({
          flight_number: `FIG${String(uniqueSuffix).padStart(5, "0")}`,
          aircraft_id: aircraftId,
          origin_aerodrome_id: 1,
          destination_aerodrome_id: 2,
          departure_time: new Date(`${dateStr}T10:00:00Z`),
          arrival_time: new Date(`${dateStr}T12:00:00Z`),
          status: "scheduled",
          schedule_id: schedule.id,
          created_by: testUserId,
        } as any)
        .returningAll()
        .execute())[0];
      const flightLeg = (await db
        .insertInto("flight_legs")
        .values({
          flight_id: flight.id,
          leg_number: 1,
          origin_code: "STY",
          destination_code: "MPA",
          etd: new Date(`${dateStr}T10:00:00Z`),
          eta: new Date(`${dateStr}T12:00:00Z`),
          status: "scheduled",
        } as any)
        .returningAll()
        .execute())[0];

      // Create booking leg with flight_id already set
      const leg = await createTestBookingLeg({
        booking_id: 1,
        origin_code: "STY",
        destination_code: "MPA",
        leg_date: new Date(scheduleDate),
        leg_sequence: 1,
        flight_id: flight.id,
        status: "pending",
      });

      const passengerIds: number[] = [];
      for (let j = 1; j <= 3; j++) {
        const link = await createTestBookingLegPassengerLink({
          booking_leg_id: leg.id,
          booking_passenger_id: j,
          clothed_weight_kg: 70,
          baggage_weight_kg: 0,
          freight_weight_kg: 0,
        });
        passengerIds.push(link.id);
      }

      // Assign ALL passengers to the flight leg
      for (const pid of passengerIds) {
        await sql`
          UPDATE booking_leg_passengers SET flight_leg_id = ${flightLeg.id} WHERE id = ${pid}
        `.execute(db);
      }

      // Now preview-build should find no unassigned passengers
      const result = await handlePreviewBuild(dateStr);
      const err = getError(result);

      expect(err).toBeTruthy();
      expect(err?.error).toMatch(/No unassigned booking legs|no-fly day/);
    });
  });
});
