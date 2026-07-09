import { describe, it, expect } from "vitest";
import { scheduleRepository } from "~/utils/repositories/schedule";
import {
  handleApprove,
  handleRevise,
  handlePublish,
  handleCancel,
  type ActionResult,
} from "~/utils/schedule-handlers.server";
import type { ScheduleStatusType } from "~/utils/constants";
import { db } from "~/utils/db.server";
import { withRollback, dateOnly } from "../../fixtures/helpers";
import {
  createTestSchedule,
  createTestFlight,
  createTestBookingLeg,
  createTestPilotAssignment,
} from "../../fixtures/factories";
import { MOCK_USER_IDS } from "../../fixtures/seed-data";

/**
 * Narrow the ActionResult discriminated union.
 * Returns true if the result is a success type.
 */
function isSuccess(result: ActionResult): boolean {
  return "success" in result && result.success === true;
}

/**
 * Extract the error from an ActionResult.
 * Returns undefined if the result is a success.
 */
function getError(result: ActionResult): { error: string; status?: number } | undefined {
  if ("error" in result) {
    return result as { error: string; status?: number };
  }
  return undefined;
}

describe("Schedule Status Flow", () => {
  const testUserId = MOCK_USER_IDS.ops;

  // ── Test 1: Creates a schedule in draft status ────────────────────────────
  it("creates a schedule in draft status", async () => {
    await withRollback(async () => {
      const schedule = await createTestSchedule({
        schedule_date: dateOnly(2026, 7, 1),
        created_by: testUserId,
      });

      expect(schedule).toBeDefined();
      expect(schedule.id).toBeGreaterThan(0);
      expect(schedule.status).toBe("draft");
    });
  });

  // ── Test 2: Fails to approve a schedule with no flights ───────────────────
  it("fails to approve a schedule with no flights (returns 400)", async () => {
    await withRollback(async () => {
      const schedule = await createTestSchedule({
        schedule_date: dateOnly(2026, 7, 2),
        created_by: testUserId,
      });

      // Set status to building so approve can be attempted
      await scheduleRepository.updateStatus(schedule.id, "building" as unknown as ScheduleStatusType);

      const result = await handleApprove(schedule.id, testUserId);
      const err = getError(result);

      expect(err).toBeDefined();
      expect(err!.status).toBe(400);
      expect(err!.error).toContain("no flights");
    });
  });

  // ── Test 3: Creates flights with bookings, then approve succeeds ──────────
  it("creates flights with bookings, then approve succeeds (status becomes approved)", async () => {
    await withRollback(async () => {
      const schedule = await createTestSchedule({
        schedule_date: dateOnly(2026, 7, 3),
        created_by: testUserId,
      });

      // Set status to building
      await scheduleRepository.updateStatus(schedule.id, "building" as unknown as ScheduleStatusType);

      // Create a flight
      const flight = await createTestFlight(schedule.id, {
        flight_number: `TST-A1-${Date.now().toString(36)}`,
      });

      // Create a booking leg assigned to the flight
      await createTestBookingLeg({
        booking_id: 1,
        origin_code: "PSY",
        destination_code: "MPA",
        leg_date: dateOnly(2026, 7, 3),
        flight_id: flight.id,
        leg_sequence: 1,
      });

      const result = await handleApprove(schedule.id, testUserId);

      expect(isSuccess(result)).toBe(true);

      // Verify the schedule status was updated
      const updated = await scheduleRepository.findById(schedule.id);
      expect(updated?.status).toBe("approved");
      expect(updated?.approved_by).toBe(testUserId);
      expect(updated?.approved_at).toBeTruthy();
    });
  });

  // ── Test 4: Publishes an approved schedule succeeds ───────────────────────
  it("publishes an approved schedule succeeds (status becomes published)", async () => {
    await withRollback(async () => {
      const schedule = await createTestSchedule({
        schedule_date: dateOnly(2026, 7, 4),
        created_by: testUserId,
      });

      // Set status to approved
      await scheduleRepository.updateStatus(schedule.id, "approved" as unknown as ScheduleStatusType, {
        approved_by: testUserId,
      });

      // Create a flight with a pilot and aircraft assigned (required for publish)
      const aircraft = await db.aircraft.findFirst({ select: { id: true } });
      const aircraftId = aircraft?.id ?? 1;
      const flight = await createTestFlight(schedule.id, {
        flight_number: `TST-P1-${Date.now().toString(36)}`,
        aircraft_id: aircraftId,
      });

      await createTestPilotAssignment(flight.id, schedule.id, {
        pilot_id: 1, // pilot record id (user_id=3 in seed data)
        role: "captain",
        assigned_by: testUserId,
      });

      const result = await handlePublish(schedule.id, testUserId);

      expect(isSuccess(result)).toBe(true);

      const updated = await scheduleRepository.findById(schedule.id);
      expect(updated?.status).toBe("published");
      expect(updated?.published_by).toBe(testUserId);
      expect(updated?.published_at).toBeTruthy();
    });
  });

  // ── Test 5: Revises a published schedule reverts to draft ─────────────────
  it("revises a published schedule reverts to draft", async () => {
    await withRollback(async () => {
      const schedule = await createTestSchedule({
        schedule_date: dateOnly(2026, 7, 5),
        created_by: testUserId,
      });

      // Set status to published
      await scheduleRepository.updateStatus(schedule.id, "published" as unknown as ScheduleStatusType, {
        published_by: testUserId,
      });

      const result = await handleRevise(schedule.id, testUserId);

      expect(isSuccess(result)).toBe(true);

      const updated = await scheduleRepository.findById(schedule.id);
      expect(updated?.status).toBe("draft");
      expect(updated?.approved_by).toBeNull();
      expect(updated?.approved_at).toBeNull();
      expect(updated?.published_by).toBeNull();
      expect(updated?.published_at).toBeNull();
    });
  });

  // ── Test 6: Approves the revised schedule succeeds ────────────────────────
  it("approves the revised schedule succeeds", async () => {
    await withRollback(async () => {
      const schedule = await createTestSchedule({
        schedule_date: dateOnly(2026, 7, 6),
        created_by: testUserId,
      });

      // Set status to building (revise sets to draft, but approve needs building)
      await scheduleRepository.updateStatus(schedule.id, "building" as unknown as ScheduleStatusType);

      // Create a flight with a booking leg
      const flight = await createTestFlight(schedule.id, {
        flight_number: `TST-R1-${Date.now().toString(36)}`,
      });

      await createTestBookingLeg({
        booking_id: 1,
        origin_code: "PSY",
        destination_code: "MPA",
        leg_date: dateOnly(2026, 7, 6),
        flight_id: flight.id,
        leg_sequence: 1,
      });

      const result = await handleApprove(schedule.id, testUserId);

      expect(isSuccess(result)).toBe(true);

      const updated = await scheduleRepository.findById(schedule.id);
      expect(updated?.status).toBe("approved");
    });
  });

  // ── Test 7: Cancels the approved schedule succeeds ────────────────────────
  it("cancels the approved schedule succeeds (status becomes cancelled)", async () => {
    await withRollback(async () => {
      const schedule = await createTestSchedule({
        schedule_date: dateOnly(2026, 7, 7),
        created_by: testUserId,
      });

      // Set status to approved
      await scheduleRepository.updateStatus(schedule.id, "approved" as unknown as ScheduleStatusType, {
        approved_by: testUserId,
      });

      const result = await handleCancel(schedule.id, testUserId, "Operational reasons");

      expect(isSuccess(result)).toBe(true);

      const updated = await scheduleRepository.findById(schedule.id);
      expect(updated?.status).toBe("cancelled");
      expect(updated?.cancellation_reason).toBe("Operational reasons");
    });
  });

  // ── Test 8: Cancels a cancelled schedule fails with 400 ───────────────────
  it("cancels a cancelled schedule fails with 400", async () => {
    await withRollback(async () => {
      const schedule = await createTestSchedule({
        schedule_date: dateOnly(2026, 7, 8),
        created_by: testUserId,
      });

      // Set status to cancelled
      await scheduleRepository.updateStatus(schedule.id, "cancelled" as unknown as ScheduleStatusType, {
        cancelled_by: testUserId,
        cancellation_reason: "First cancel",
      });

      const result = await handleCancel(schedule.id, testUserId, "Second cancel");
      const err = getError(result);

      expect(err).toBeDefined();
      expect(err!.status).toBe(400);
      expect(err!.error).toContain("cancelled");
    });
  });

  // ── Test 9: Approves a cancelled schedule fails with 400 ──────────────────
  it("approves a cancelled schedule fails with 400", async () => {
    await withRollback(async () => {
      const schedule = await createTestSchedule({
        schedule_date: dateOnly(2026, 7, 9),
        created_by: testUserId,
      });

      // Set status to cancelled
      await scheduleRepository.updateStatus(schedule.id, "cancelled" as unknown as ScheduleStatusType, {
        cancelled_by: testUserId,
        cancellation_reason: "Weather",
      });

      const result = await handleApprove(schedule.id, testUserId);
      const err = getError(result);

      expect(err).toBeDefined();
      expect(err!.status).toBe(400);
      expect(err!.error).toContain("cancelled");
    });
  });

  // ── Test 10: Cancels a building schedule succeeds ─────────────────────────
  it("cancels a building schedule succeeds", async () => {
    await withRollback(async () => {
      const schedule = await createTestSchedule({
        schedule_date: dateOnly(2026, 7, 10),
        created_by: testUserId,
      });

      // Set status to building
      await scheduleRepository.updateStatus(schedule.id, "building" as unknown as ScheduleStatusType);

      const result = await handleCancel(schedule.id, testUserId, "Schedule cancelled during building");

      expect(isSuccess(result)).toBe(true);

      const updated = await scheduleRepository.findById(schedule.id);
      expect(updated?.status).toBe("cancelled");
      expect(updated?.cancellation_reason).toBe("Schedule cancelled during building");
    });
  });

  // ── Test 11: Publishes a non-approved schedule fails with 400 ─────────────
  it("publishes a non-approved schedule fails with 400", async () => {
    await withRollback(async () => {
      const schedule = await createTestSchedule({
        schedule_date: dateOnly(2026, 7, 11),
        created_by: testUserId,
      });

      // Schedule is in draft status — not approved
      const result = await handlePublish(schedule.id, testUserId);
      const err = getError(result);

      expect(err).toBeDefined();
      expect(err!.status).toBe(400);
      expect(err!.error).toContain("approved");
    });
  });

  // ── Test 12: Revises a non-published schedule fails with 400 ──────────────
  it("revises a non-published schedule fails with 400", async () => {
    await withRollback(async () => {
      const schedule = await createTestSchedule({
        schedule_date: dateOnly(2026, 7, 12),
        created_by: testUserId,
      });

      // Schedule is in draft status — not published or approved
      const result = await handleRevise(schedule.id, testUserId);
      const err = getError(result);

      expect(err).toBeDefined();
      expect(err!.status).toBe(400);
      expect(err!.error).toContain("revise");
    });
  });
});
