/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "./db.server";
import { sql } from "kysely";
import { scheduleRepository } from "./repositories/schedule";
import { flightRepository, findSummaryById, findLegsByFlightId } from "./repositories/flight";
import { flightLegRepository } from "./repositories/flight-leg";
import { bookingLegRepository } from "./repositories/booking-leg";
import { isNoFlyDay } from "./services/no-fly.service";
import { generateFlightNumber } from "./flight-number.server";
import { createAuditLogEntry } from "./permissions.server";
import { ScheduleStatus, FlightStatus, PilotAssignmentStatus } from "./constants";
import { pilotAssignmentRepository } from "./repositories/pilot-assignment";
import { bigintRowToNumbers } from "./bigint";
import { findByBookingLegId, findAssignedManifestsByFlightId, assignToFlightLeg, unassignFromFlightLeg } from "./repositories/booking-leg-passenger";
import { withTransaction } from "./repositories/shared";

interface FlightLegRawRow {
  id: number | bigint;
  flight_id: number | bigint;
  leg_sequence: number | bigint;
  origin_code: string;
  destination_code: string;
  distance_nm: string | null;
  heading: string | null;
  departure_time: string | null;
  arrival_time: string | null;
  status: string;
}

interface FlightResultRow {
  id: number | bigint;
  flight_number: string;
  schedule_id: number | bigint;
  dep_time: string | null;
  arr_time: string | null;
  status: string;
  origin_code: string | null;
  destination_code: string | null;
  aircraft_reg: string | null;
  aircraft_type: string | null;
  pilot_name: string | null;
}

interface FlightLegShortRow {
  id: number | bigint;
  origin_code: string;
  destination_code: string;
}

interface FlightDetailRow {
  id: number | bigint;
  flight_number: string;
  departure_time: string | null;
  arrival_time: string | null;
  status: string;
  sort_order: number | null;
  duration_minutes: number | null;
  check_in_time: string | null;
  max_takeoff_weight_kg: string | number | null;
  max_landing_weight_kg: string | number | null;
  basic_empty_weight_kg: string | number | null;
  payload_kg: string | number | null;
  fuel_kg: string | number | null;
  crew_weight_kg: string | number | null;
  origin_code: string | null;
  destination_code: string | null;
  aircraft_registration: string | null;
  aircraft_type: string | null;
  seat_count: number | null;
  pilot_name: string | null;
  pilot_status: string | null;
  flight_ordinal: number | bigint;
}

/**
 * Server-only schedule action handlers.
 * These functions encapsulate the action logic for the schedule builder route,
 * making them testable and reusable across different routes.
 */

export interface ActionContext {
  userId: number;
  formData: FormData;
}

function extractTokens(normalized: string): string[] {
  const tokens: string[] = [];
  let current = "";
  for (let i = 0; i < normalized.length; i++) {
    if (/[a-z]/.test(normalized[i])) {
      current += normalized[i];
    } else {
      if (current.length >= 2) tokens.push(current);
      current = "";
    }
  }
  if (current.length >= 2) tokens.push(current);
  return tokens;
}

export type ActionResult = { success: true; [key: string]: unknown } | { error: string; status?: number };

/**
 * Handle the "auto-build" intent.
 * Runs the scheduling engine to automatically build flights from unassigned bookings.
 */
export async function handleAutoBuild(date: string, createdBy: number): Promise<ActionResult> {
  // Check for no-fly days
  const noFly = await isNoFlyDay(date);
  if (noFly) {
    return { error: `Cannot build schedule for ${date}: it is a no-fly day`, status: 400 };
  }

  const schedule = await scheduleRepository.findByDate(date);
  if (!schedule) {
    return { error: "No schedule found for this date. Create a schedule first." };
  }
  const { buildSchedule } = await import("./scheduling/index");
  const result = await buildSchedule(date, createdBy);
  if (result.errors.length > 0) {
    return { error: result.errors.join("; "), status: 500 };
  }

  // Audit trail: log the auto-build
  await createAuditLogEntry({
    actorId: createdBy,
    action: "schedule:auto-build",
    entityType: "schedule",
    entityId: schedule.id,
    newValues: {
      flightCount: result.pilotAssignments.length,
      routeCount: result.routes.length,
    },
    ipAddress: undefined,
    userAgent: undefined,
  });

  return { success: true, result };
}

/**
 * Handle the "preview-build" intent.
 * Generates a preview using multiple optimization strategies (Nearest-Neighbor,
 * Single-Route, Origin-Grouped) and returns the best-scored configuration.
 * The scorer optimizes for: minimum flights, shortest total duration,
 * and full passenger coverage.
 */
export async function handlePreviewBuild(date: string): Promise<ActionResult> {
  const noFly = await isNoFlyDay(date);
  if (noFly) {
    return { error: `Cannot build schedule for ${date}: it is a no-fly day`, status: 400 };
  }

  const { generateBestConfig } = await import("./scheduling/config-generator");
  const { configs, allErrors, allWarnings, unassignedCount } = await generateBestConfig(date);

  if (configs.length === 0 && allErrors.length > 0) {
    return { error: allErrors.join("; "), status: 400 };
  }

  return {
    success: true,
    configs,
    errors: allErrors,
    warnings: allWarnings,
    unassignedCount,
  };
}

/**
 * Handle the "accept-build" intent.
 * Runs the full 5-phase scheduling pipeline (identical to auto-build) to ensure
 * parity between manual accept and direct auto-build. This produces flights with
 * proper routing, aircraft assignment, weight & balance, and pilot assignment.
 */
export async function handleAcceptBuild(date: string, createdBy: number): Promise<ActionResult> {
  const noFly = await isNoFlyDay(date);
  if (noFly) return { error: `Cannot build schedule for ${date}: it is a no-fly day`, status: 400 };

  const { buildSchedule } = await import("./scheduling/index");
  const result = await buildSchedule(date, createdBy);

  if (result.errors.length > 0) {
    return { error: result.errors.join("; "), status: 500 };
  }

  return { success: true, scheduleId: result.scheduleId, flightCount: result.routes.length, result };
}

/**
 * Handle the "approve" intent.
 * Validates that:
 *  - The schedule exists and is in BUILDING status
 *  - All flights have at least one booking leg assigned
 */
export async function handleApprove(scheduleId: number, approvedBy: number): Promise<ActionResult> {
  const schedule = await scheduleRepository.findById(scheduleId);
  if (!schedule) {
    return { error: "Schedule not found", status: 404 };
  }
  if (schedule.status !== ScheduleStatus.BUILDING) {
    return {
      error: `Cannot approve a schedule with status "${schedule.status}". Only schedules in "building" status can be approved.`,
      status: 400,
    };
  }

  // Check that all flights have at least one booking leg assigned
  const flightRows = await db.selectFrom("flights")
    .select(["id"])
    .where("schedule_id", "=", scheduleId)
    .orderBy("id", "asc")
    .execute();
  const flightIds: number[] = flightRows.map((f) => Number(f.id));

  if (flightIds.length === 0) {
    return { error: "Cannot approve a schedule with no flights. Build flights first.", status: 400 };
  }

  const countRows = await sql<{ flight_id: number; cnt: number }>`
    SELECT bl.flight_id, COUNT(*)::int AS cnt
    FROM booking_legs bl
    WHERE bl.flight_id = ANY(${flightIds}::int[])
    GROUP BY bl.flight_id
  `.execute(db);
  const countMap = new Map<number, number>();
  for (const r of countRows.rows) {
    countMap.set(Number(r.flight_id), Number(r.cnt));
  }
  const emptyFlights = flightIds.filter((id) => (countMap.get(id) ?? 0) === 0);

  if (emptyFlights.length > 0) {
    return {
      error: `Cannot approve: ${emptyFlights.length} flight(s) have no booking legs assigned. All flights must have at least one passenger.`,
      status: 400,
    };
  }

  const wbRows = await sql<{ flight_leg_id: number; mtow_used_pct: number; mlw_used_pct: number; binding_constraint: string | null }>`
    SELECT wbs.flight_leg_id, wbs.mtow_used_pct, wbs.mlw_used_pct, wbs.binding_constraint
     FROM weight_balance_snapshots wbs
     JOIN flight_legs fl ON fl.id = wbs.flight_leg_id
     JOIN flights f ON f.id = fl.flight_id
     WHERE f.schedule_id = ${scheduleId}
       AND ((wbs.mtow_used_pct IS NOT NULL AND wbs.mtow_used_pct > 100)
         OR (wbs.mlw_used_pct IS NOT NULL AND wbs.mlw_used_pct > 100)
         OR (wbs.binding_constraint IS NOT NULL AND wbs.binding_constraint != 'OK' AND wbs.binding_constraint != 'none'))
  `.execute(db);
  const wbViolations = wbRows.rows;

  if (wbViolations.length > 0) {
    const blockApproval = process.env.WB_VIOLATIONS_BLOCK_APPROVAL === "true";
    if (blockApproval) {
      return {
        error: `Cannot approve: ${wbViolations.length} weight & balance violation(s) found. Resolve violations before approving. Set WB_VIOLATIONS_BLOCK_APPROVAL=false to override.`,
        status: 400,
        violations: wbViolations.map((v) => ({
          flightLegId: v.flight_leg_id,
          mtowUsedPct: Number(v.mtow_used_pct),
          mlwUsedPct: Number(v.mlw_used_pct),
          constraint: v.binding_constraint,
        })),
      };
    }
    console.warn(
      `[handleApprove] Warning: ${wbViolations.length} W&B violations exist on schedule #${scheduleId}. Approval allowed (WB_VIOLATIONS_BLOCK_APPROVAL not set to "true").`
    );
  }

  await scheduleRepository.updateStatus(scheduleId, ScheduleStatus.APPROVED, { approved_by: approvedBy });

  // Audit trail: log the approval
  await createAuditLogEntry({
    actorId: approvedBy,
    action: "schedule:approve",
    entityType: "schedule",
    entityId: scheduleId,
    newValues: { status: ScheduleStatus.APPROVED, flightCount: flightIds.length },
    ipAddress: undefined,
    userAgent: undefined,
  });

  return { success: true };
}

/**
 * Handle the "revise" intent.
 * Validates that the schedule is in APPROVED or PUBLISHED status before reverting to BUILDING.
 */
export async function handleRevise(scheduleId: number, userId: number): Promise<ActionResult> {
  const schedule = await scheduleRepository.findById(scheduleId);
  if (!schedule) {
    return { error: "Schedule not found", status: 404 };
  }
  if (schedule.status !== ScheduleStatus.APPROVED && schedule.status !== ScheduleStatus.PUBLISHED) {
    return {
      error: `Cannot revise a schedule with status "${schedule.status}". Only "approved" or "published" schedules can be revised.`,
      status: 400,
    };
  }

  // When reverting to draft/building, clear approval and publication audit fields
  await db.updateTable("schedules")
    .set({
      status: ScheduleStatus.DRAFT,
      approved_by: sql`NULL`,
      approved_at: sql`NULL`,
      published_by: sql`NULL`,
      published_at: sql`NULL`,
    })
    .where("id", "=", scheduleId)
    .execute();

  // Audit trail: log the revision
  await createAuditLogEntry({
    actorId: userId,
    action: "schedule:revise",
    entityType: "schedule",
    entityId: scheduleId,
    oldValues: { status: schedule.status },
    newValues: { status: ScheduleStatus.BUILDING },
    ipAddress: undefined,
    userAgent: undefined,
  });

  return { success: true };
}

/**
 * Handle the "publish" intent.
 * Validates that:
 *  - The schedule exists and is in APPROVED status
 *  - All flights have a pilot assigned
 */
export async function handlePublish(scheduleId: number, publishedBy: number): Promise<ActionResult> {
  const schedule = await scheduleRepository.findById(scheduleId);
  if (!schedule) {
    return { error: "Schedule not found", status: 404 };
  }
  if (schedule.status !== ScheduleStatus.APPROVED) {
    return {
      error: `Cannot publish a schedule with status "${schedule.status}". Only "approved" schedules can be published.`,
      status: 400,
    };
  }

  // Check that all flights have a pilot assigned
  const flights = await db.selectFrom("flights")
    .select(["id", "flight_number"])
    .where("schedule_id", "=", scheduleId)
    .orderBy("id", "asc")
    .execute();

  if (flights.length === 0) {
    return { error: "Cannot publish a schedule with no flights.", status: 400 };
  }

  const flightIdList = flights.map((f) => Number(f.id));

  // Batch-check pilot assignments
  const pilotAssignments = await sql<{ flight_id: number; role: string }>`
    SELECT pa.flight_id, pa.role
    FROM pilot_assignments pa
    WHERE pa.flight_id = ANY(${flightIdList}::int[])
  `.execute(db);
  const flightsWithCaptain = new Set(pilotAssignments.rows.filter((r) => r.role === "captain").map((r) => Number(r.flight_id)));
  const flightsWithoutPilot = flights
    .filter((f) => !flightsWithCaptain.has(Number(f.id)))
    .map((f) => String(f.flight_number ?? ""));

  if (flightsWithoutPilot.length > 0) {
    console.warn(`[handlePublish] BLOCKED: ${flightsWithoutPilot.length} flight(s) missing pilot: ${flightsWithoutPilot.join(", ")}`);
    return {
      error: `Cannot publish: ${flightsWithoutPilot.length} flight(s) have no pilot assigned: ${flightsWithoutPilot.join(", ")}. Assign pilots before publishing.`,
      status: 400,
    };
  }

  // Batch-check aircraft assignments
  const aircraftRows = await db.selectFrom("flights")
    .select(["id", "aircraft_id"])
    .where("id", "in", flightIdList)
    .execute();
  const flightsWithoutAircraft = aircraftRows
    .filter((r) => r.aircraft_id == null)
    .map((r) => String(r.id));

  if (flightsWithoutAircraft.length > 0) {
    console.warn(`[handlePublish] BLOCKED: ${flightsWithoutAircraft.length} flight(s) missing aircraft: ${flightsWithoutAircraft.join(", ")}`);
    return {
      error: `Cannot publish: ${flightsWithoutAircraft.length} flight(s) have no aircraft assigned: ${flightsWithoutAircraft.join(", ")}. Assign aircraft before publishing.`,
      status: 400,
    };
  }

  console.log(`[handlePublish] OK: Schedule ${scheduleId} published with ${flights.length} flights, all pilots and aircraft validated`);
  await scheduleRepository.updateStatus(scheduleId, ScheduleStatus.PUBLISHED, { published_by: publishedBy });

  // Audit trail: log the publication
  await createAuditLogEntry({
    actorId: publishedBy,
    action: "schedule:publish",
    entityType: "schedule",
    entityId: scheduleId,
    newValues: { status: ScheduleStatus.PUBLISHED, flightCount: flights.length },
    ipAddress: undefined,
    userAgent: undefined,
  });

  return { success: true };
}

/**
 * Handle the "cancel" intent.
 * Validates that the schedule is in a cancellable status (BUILDING or APPROVED).
 */
export async function handleCancel(
  scheduleId: number,
  cancelledBy: number,
  cancellationReason: string
): Promise<ActionResult> {
  const schedule = await scheduleRepository.findById(scheduleId);
  if (!schedule) {
    return { error: "Schedule not found", status: 404 };
  }
  if (schedule.status !== ScheduleStatus.DRAFT && schedule.status !== ScheduleStatus.BUILDING && schedule.status !== ScheduleStatus.APPROVED) {
    return {
      error: `Cannot cancel a schedule with status "${schedule.status}". Only "draft", "building", or "approved" schedules can be cancelled.`,
      status: 400,
    };
  }

  return withTransaction(async (tx) => {
    // Get all flights for this schedule
    const flights = await tx.selectFrom("flights")
      .select(["id"])
      .where("schedule_id", "=", scheduleId)
      .execute();
    const flightIds = flights.map((f) => Number(f.id));

    if (flightIds.length > 0) {
      // Delete loadsheets first (FK RESTRICT on flights)
      await sql`DELETE FROM loadsheets WHERE flight_id = ANY(${flightIds}::int[])`.execute(tx);
      // Clear passenger flight-leg assignments
      await sql`UPDATE booking_leg_passengers SET flight_leg_id = NULL WHERE flight_leg_id IN (SELECT id FROM flight_legs WHERE flight_id = ANY(${flightIds}::int[]))`.execute(tx);
      // Delete flight legs
      await sql`DELETE FROM flight_legs WHERE flight_id = ANY(${flightIds}::int[])`.execute(tx);
      // Return bookings to unassigned pool
      await sql`UPDATE booking_legs SET flight_id = NULL WHERE flight_id = ANY(${flightIds}::int[])`.execute(tx);
      // Delete flights
      await tx.deleteFrom("flights").where("schedule_id", "=", scheduleId).execute();
    }

    await tx.updateTable("schedules")
      .set({
        status: ScheduleStatus.CANCELLED,
        cancelled_by: cancelledBy,
        cancellation_reason: cancellationReason,
        cancelled_at: new Date().toISOString(),
      })
      .where("id", "=", scheduleId)
      .execute();

    // Audit trail
    await createAuditLogEntry({
      actorId: cancelledBy,
      action: "schedule:cancel",
      entityType: "schedule",
      entityId: scheduleId,
      oldValues: { status: schedule.status },
      newValues: {
        status: ScheduleStatus.CANCELLED,
        cancellationReason,
      },
      ipAddress: undefined,
      userAgent: undefined,
    });

    return { success: true, unassignedFlightCount: flightIds.length };
  });
}

/**
 * Handle the "reorder-flights" intent.
 * Uses a database transaction to atomically update sort_order for all flights
 * and sets departure/arrival times with 15-minute spacing starting from 06:00.
 */
export async function handleReorderFlights(scheduleId: number, flightIds: number[], userId?: number): Promise<ActionResult> {
  try {
    await withTransaction(async (tx) => {
      const baseTime = new Date();
      baseTime.setHours(6, 0, 0, 0);

      for (let i = 0; i < flightIds.length; i++) {
        const departureTime = new Date(baseTime.getTime() + i * 15 * 60 * 1000);
        const arrivalTime = new Date(departureTime.getTime() + 30 * 60 * 1000);

        await tx.updateTable("flights")
          .set({
            sort_order: i + 1,
          departure_time: departureTime.toISOString(),
          arrival_time: arrivalTime.toISOString(),
        })
          .where("id", "=", flightIds[i])
          .where("schedule_id", "=", scheduleId)
          .execute();
      }
    });
    if (userId) {
      await createAuditLogEntry({
        actorId: userId,
        action: "schedule.reorder_flights",
        entityType: "schedule",
        entityId: scheduleId,
        newValues: { flight_count: flightIds.length },
      });
    }
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error during flight reorder";
    return { error: `Failed to reorder flights: ${message}`, status: 500 };
  }
}

/**
 * Handle the "create-flight" intent.
 */
export async function handleCreateFlight(
  scheduleId: number,
  originAerodromeId: number,
  destinationAerodromeId: number,
  aircraftId: number | null,
  createdBy: number
): Promise<ActionResult> {
  const schedule = await scheduleRepository.findById(scheduleId);
  if (!schedule) {
    return { error: "Schedule not found", status: 404 };
  }
  const noFly = await isNoFlyDay(schedule.schedule_date);
  if (noFly) {
    return { error: `Cannot create flights on a no-fly day (${schedule.schedule_date})`, status: 400 };
  }

  // Resolve aerodrome codes before entering the transaction so we can
  // match unassigned booking legs and build the flight leg.
  const aerodromes = await db.selectFrom("aerodromes")
    .select(["id", "code"])
    .where("id", "in", [originAerodromeId, destinationAerodromeId])
    .execute();
  const originCode = aerodromes.find((a) => Number(a.id) === originAerodromeId)?.code ?? "";
  const destinationCode = aerodromes.find((a) => Number(a.id) === destinationAerodromeId)?.code ?? "";

  return withTransaction(async (tx) => {
    const now = new Date();
    const flightNumber = await generateFlightNumber(now, tx);

    // Every flight path must start and end at STY (RULE 1). Resolve the STY id.
    const styRows = await tx.selectFrom("aerodromes")
      .select(["id"])
      .where("code", "=", "STY")
      .limit(1)
      .execute();
    const styId = styRows[0]?.id ? Number(styRows[0].id) : originAerodromeId;

    // Create the flight record as an STY → … → STY round trip.
    const flightRows = await tx.insertInto("flights")
      .values({
        schedule_id: scheduleId,
        flight_number: flightNumber,
        origin_aerodrome_id: styId,
        destination_aerodrome_id: styId,
        origin_code: "STY",
        destination_code: "STY",
        aircraft_id: aircraftId ?? undefined,
        departure_time: new Date().toISOString(),
        arrival_time: new Date().toISOString(),
        status: FlightStatus.SCHEDULED,
        created_by: createdBy,
      } as any)
      .returning(["id"])
      .execute();
    const flightId = Number(flightRows[0].id);

    // Link unassigned booking legs whose sector matches origin → destination
    if (originCode && destinationCode) {
      await tx.updateTable("booking_legs")
        .set({ flight_id: flightId })
        .where("flight_id", "is", null)
        .where("origin_code", "=", originCode)
        .where("destination_code", "=", destinationCode)
        .execute();
    }

    // Build STY-bounded legs: STY → origin → destination → STY, skipping any
    // bookend that is already STY (and any zero-length hop). Guarantees RULE 1.
    const legRoutes: Array<{ leg_sequence: number; origin_code: string; destination_code: string }> = [];
    let seq = 1;
    let cursor = "STY";
    for (const code of [originCode, destinationCode, "STY"]) {
      if (!code || code === cursor) continue;
      legRoutes.push({ leg_sequence: seq++, origin_code: cursor, destination_code: code });
      cursor = code;
    }
    if (legRoutes.length === 0) {
      legRoutes.push({ leg_sequence: 1, origin_code: "STY", destination_code: destinationCode || "STY" });
    }
    await flightLegRepository.replaceFlightLegs(flightId, legRoutes, tx);

    // Query the full flight row so the client can add it to state immediately
    const flightRow = await findSummaryById(flightId, tx);
    const flightSummary = flightRow ? bigintRowToNumbers(flightRow) : null;

    // Query the flight legs (already created above, but re-query for the
    // canonical shape expected by the frontend)
    const legRows = await findLegsByFlightId(flightId, tx);
    const updatedFlightLegs = (legRows as Array<{
      id: number | bigint; flight_id: number | bigint; leg_sequence: number | bigint;
      origin_code: string; destination_code: string;
      distance_nm: number | null; heading: number | null;
      departure_time: string | null; arrival_time: string | null;
      status: string;
    }>).map((r) => ({
      id: Number(r.id),
      flight_id: Number(r.flight_id),
      leg_sequence: Number(r.leg_sequence),
      origin_code: r.origin_code,
      destination_code: r.destination_code,
      distance_nm: r.distance_nm != null ? Number(r.distance_nm) : null,
      heading: r.heading != null ? Number(r.heading) : null,
      departure_time: r.departure_time,
      arrival_time: r.arrival_time,
      status: r.status,
    }));

    // Query passenger manifests for this flight (booking legs linked above)
    const manifestRows = await findAssignedManifestsByFlightId(flightId, { client: tx });
    const passengerManifests = manifestRows.map((r) => ({
      id: r.id,
      booking_leg_id: r.booking_leg_id,
      passenger_name: r.passenger_name,
      body_weight_kg: r.body_weight_kg,
      baggage_weight_kg: r.baggage_weight_kg,
      freight_weight_kg: r.freight_weight_kg,
      origin_code: r.origin_code,
      destination_code: r.destination_code,
    }));

    return {
      success: true,
      flightId,
      flight: flightSummary,
      flightLegs: updatedFlightLegs,
      passengerManifests,
    };
  });
}

/**
 * Handle the "assign-booking" intent.
 * Assigns all passengers from a booking leg to a flight using per-passenger
 * assignment via booking_leg_passengers. Uses the route insertion algorithm
 * to compute the optimal leg sequence for the flight.
 */
export async function handleAssignBooking(bookingLegId: number, flightId: number, bookingLegPassengerId?: number): Promise<ActionResult> {
  // Load the booking leg to get origin/destination codes
  const bookingLeg = await bookingLegRepository.findById(bookingLegId);
  if (!bookingLeg) {
    return { error: "Booking leg not found", status: 404 };
  }

  // Check for no-fly days
  if (bookingLeg.leg_date) {
    const noFly = await isNoFlyDay(bookingLeg.leg_date);
    if (noFly) {
      return { error: `Cannot assign bookings on a no-fly day (${bookingLeg.leg_date})`, status: 400 };
    }
  }

  // Resolve the flight's schedule ID before entering the transaction
  const flightRows = await db.selectFrom("flights")
    .select(["schedule_id"])
    .where("id", "=", flightId)
    .execute();
  const scheduleId = flightRows[0]?.schedule_id ? Number(flightRows[0].schedule_id) : null;

  // Get passengers for this booking leg.  When a specific passenger is being
  // dragged (per-passenger scheduling), only process that one junction record.
  const allPassengers = await findByBookingLegId(bookingLegId);
  const passengers = bookingLegPassengerId != null
    ? allPassengers.filter((p) => p.id === bookingLegPassengerId)
    : allPassengers;

  // Load the flight's current legs
  const currentLegs = await flightLegRepository.findByFlightId(flightId);

  const warnings: string[] = [];

  // If no booking_leg_passengers junction records found for this booking leg,
  // assign the booking leg to the flight anyway (will appear as zero pax).
  // Junction records must be created explicitly during booking creation —
  // auto-creating them here would assign all booking passengers to every leg,
  // violating per-passenger, per-leg planning.
  if (passengers.length === 0) {
    return withTransaction(async (tx) => {
      if (scheduleId) {
        await tx.updateTable("schedules")
          .set({ status: ScheduleStatus.BUILDING })
          .where("id", "=", scheduleId)
          .where("status", "=", ScheduleStatus.CANCELLED)
          .execute();
      }

      warnings.push("No passenger junction records found for this booking leg — assigned to flight without passenger records");
      await tx.updateTable("booking_legs")
        .set({ flight_id: flightId })
        .where("id", "=", bookingLegId)
        .execute();

      // Propagate to sibling unassigned legs
      const bk = await tx.selectFrom("booking_legs")
        .select("booking_id").where("id", "=", bookingLegId)
        .executeTakeFirst();
      if (bk?.booking_id) {
        await tx.updateTable("booking_legs")
          .set({ flight_id: flightId })
          .where("booking_id", "=", bk.booking_id)
          .where("flight_id", "is", null)
          .execute();
      }

      return {
        success: true,
        legsInserted: false,
        updatedFlightLegs: [],
        updatedPassengerManifests: [],
        warnings,
      };
    });
  }

  return withTransaction(async (tx) => {
    // If the flight's schedule was cancelled, reactivate it to building
    // since the user is assigning passengers again.
    if (scheduleId) {
        await tx.updateTable("schedules")
          .set({ status: ScheduleStatus.BUILDING })
        .where("id", "=", scheduleId)
        .where("status", "=", ScheduleStatus.CANCELLED)
        .execute();
    }

    if (currentLegs.length === 0) {
      // No existing legs — just assign all passengers to the flight.
      // Since there are no legs yet, we cannot assign to a specific flight_leg_id.
      // The loader uses booking_legs.origin_code/destination_code for stop manifests,
      // so flight_leg_id can remain NULL until legs are created.
      for (const passenger of passengers) {
        await sql`UPDATE booking_leg_passengers SET flight_leg_id = NULL WHERE id = ${passenger.id}`.execute(tx);
      }
      // Also update booking_leg for backward compatibility
      await tx.updateTable("booking_legs")
        .set({ flight_id: flightId })
        .where("id", "=", bookingLegId)
        .execute();
      // Re-query the updated passenger manifests so the client can update state
      const updatedManifestsRows = await findAssignedManifestsByFlightId(flightId, { client: tx });
      const updatedManifests = updatedManifestsRows.map((r) => ({
        id: r.id,
        booking_leg_id: r.booking_leg_id,
        passenger_name: r.passenger_name,
        body_weight_kg: r.body_weight_kg,
        baggage_weight_kg: r.baggage_weight_kg,
        freight_weight_kg: r.freight_weight_kg,
        origin_code: r.origin_code,
        destination_code: r.destination_code,
      }));
      return {
        success: true,
        legsInserted: false,
        updatedFlightLegs: [],
        updatedPassengerManifests: updatedManifests,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }

    // Try to find a matching leg for this booking leg's origin→destination
    const matchingLeg = currentLegs.find(
      (leg) => leg.origin_code === bookingLeg.origin_code && leg.destination_code === bookingLeg.destination_code
    );

    if (matchingLeg) {
      for (const passenger of passengers) {
        await assignToFlightLeg(passenger.id, matchingLeg.id, tx);
      }
      await tx.updateTable("booking_legs")
        .set({ flight_id: flightId })
        .where("id", "=", bookingLegId)
        .execute();
    } else {
      // ── No matching leg — dynamically rebuild the route ──────────────────
      const { insertPassengerRoute } = await import("./scheduling/insert-passenger-route");
      const result = await insertPassengerRoute(
        currentLegs.map((l) => ({
          leg_sequence: l.leg_sequence,
          origin_code: l.origin_code,
          destination_code: l.destination_code,
        })),
        bookingLeg.origin_code,
        bookingLeg.destination_code
      );

      if (!result.inserted || !result.legs) {
        // already_on_route is a valid state — both stops exist on the route
        // and the passenger can travel via the existing legs.  Fall through
        // to assign the passenger without modifying the route.
        if (result.reason !== "already_on_route") {
          return { error: `Route insertion failed: ${result.reason ?? "unknown error"}`, status: 400 };
        }
      }

      // Replace flight legs (pass tx so it runs inside the outer transaction)
      let newFlightLegs: typeof currentLegs | null = null;
      if (result.inserted && result.legs) {
        newFlightLegs = await flightLegRepository.replaceFlightLegs(flightId, result.legs, tx);

        // Re-map existing passengers to new flight legs after route rebuild.
        // NOTE: do NOT filter by old blp.flight_leg_id — replaceFlightLegs has
        // already deleted those rows, making the reference stale.
        await sql`
          UPDATE booking_leg_passengers blp
           SET flight_leg_id = (
             SELECT fl.id FROM flight_legs fl
             WHERE fl.flight_id = ${flightId}
             AND fl.origin_code = bl.origin_code
             ORDER BY fl.leg_number ASC
             LIMIT 1
           ), updated_at = NOW()
           FROM booking_legs bl
           WHERE blp.booking_leg_id = bl.id
           AND bl.flight_id = ${flightId}
        `.execute(tx);
      }

      // Assign this passenger to the matching or origin-matching leg.
      // Use existing legs (already_on_route case) or new legs (just replaced).
      const activeLegs = ((result.inserted && result.legs)
        ? newFlightLegs
        : currentLegs) ?? [];
      const matchingLeg2 = activeLegs.find(
        (leg) => leg.origin_code === bookingLeg.origin_code && leg.destination_code === bookingLeg.destination_code
      );

      if (matchingLeg2) {
        for (const passenger of passengers) {
          await assignToFlightLeg(passenger.id, matchingLeg2.id, tx);
        }
      } else {
        // No direct leg — the passenger will travel via intermediate stops.
        // Assign them to the first leg that starts from their origin so they
        // appear at the departure stop.
        const originLeg = activeLegs.find(
          (leg) => leg.origin_code === bookingLeg.origin_code
        );
        if (originLeg) {
          for (const passenger of passengers) {
            await assignToFlightLeg(passenger.id, originLeg.id, tx);
          }
        } else {
          for (const passenger of passengers) {
            await sql`UPDATE booking_leg_passengers SET flight_leg_id = NULL WHERE id = ${passenger.id}`.execute(tx);
          }
        }
      }
      await tx.updateTable("booking_legs")
        .set({ flight_id: flightId })
        .where("id", "=", bookingLegId)
        .execute();

      // Propagate to sibling unassigned legs of the same booking
      // Only propagate when assigning the whole booking leg — per-passenger drags
      // should NOT pull in sibling legs (the user explicitly scoped to one passenger).
      if (!bookingLegPassengerId) {
        const bk = await tx.selectFrom("booking_legs")
          .select("booking_id").where("id", "=", bookingLegId)
          .executeTakeFirst();
        if (bk?.booking_id) {
          await tx.updateTable("booking_legs")
            .set({ flight_id: flightId })
            .where("booking_id", "=", bk.booking_id)
            .where("flight_id", "is", null)
            .execute();
        }
      }
    }

    // After assignment, re-query the updated flight legs and passenger manifests
    // so the client can update its local state immediately without a refresh.
    const updatedLegsResult = await sql<FlightLegRawRow>`
      SELECT fl.id, fl.flight_id, fl.leg_number AS leg_sequence, fl.etd AS departure_time, fl.eta AS arrival_time, fl.status,
              fl.origin_code, fl.destination_code, fl.distance_nm, fl.heading
       FROM flight_legs fl
       WHERE fl.flight_id = ${flightId}
       ORDER BY fl.leg_number
    `.execute(tx);
    const updatedLegsRows = updatedLegsResult.rows;
    const updatedLegs = updatedLegsRows.map((r) => ({
      id: Number(r.id),
      flight_id: Number(r.flight_id),
      leg_sequence: Number(r.leg_sequence),
      origin_code: r.origin_code,
      destination_code: r.destination_code,
      distance_nm: r.distance_nm != null ? Number(r.distance_nm) : null,
      heading: r.heading != null ? Number(r.heading) : null,
      departure_time: r.departure_time,
      arrival_time: r.arrival_time,
      status: r.status,
    }));
    const updatedManifestsRows2 = await findAssignedManifestsByFlightId(flightId, { client: tx });
    const updatedManifests = updatedManifestsRows2.map((r) => ({
      id: r.id,
      booking_leg_id: r.booking_leg_id,
      passenger_name: r.passenger_name,
      body_weight_kg: r.body_weight_kg,
      baggage_weight_kg: r.baggage_weight_kg,
      freight_weight_kg: r.freight_weight_kg,
      origin_code: r.origin_code,
      destination_code: r.destination_code,
    }));

    // Invalidate any existing loadsheet so it gets regenerated on next visit
    await tx.deleteFrom("loadsheets").where("flight_id", "=", flightId).execute();

    return {
      success: true,
      legsInserted: matchingLeg ? false : true,
      updatedFlightLegs: updatedLegs.map((l) => ({
        id: l.id,
        flight_id: l.flight_id,
        leg_sequence: l.leg_sequence,
        origin_code: l.origin_code,
        destination_code: l.destination_code,
        distance_nm: l.distance_nm,
        heading: l.heading,
        departure_time: l.departure_time,
        arrival_time: l.arrival_time,
        status: l.status,
      })),
      updatedPassengerManifests: updatedManifests,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  });
}

/**
 * Handle the "create-flight-from-booking" intent.
 * Creates a flight with an STY (Stanley) → origin → destination → STY route pattern
 * and assigns all booking legs to the flight.
 */
export async function handleCreateFlightFromBooking(
  scheduleId: number,
  bookingLegIds: number[],
  options?: { date?: string; createdBy?: number; bookingLegPassengerIds?: number[] }
): Promise<ActionResult> {
  const date = options?.date;
  const createdBy = options?.createdBy ?? 0;

  // If scheduleId is 0 or schedule doesn't exist, create one on-the-fly
  let effectiveScheduleId = scheduleId;
  let schedule = scheduleId > 0 ? await scheduleRepository.findById(scheduleId) : null;

  if (!schedule) {
    if (!date) {
      return { error: "A date is required to create a schedule on-the-fly", status: 400 };
    }
    const existingSchedule = await scheduleRepository.findByDate(date);
    if (existingSchedule) {

      effectiveScheduleId = existingSchedule.id;
      schedule = existingSchedule;
    } else {
      // Create a new schedule
      const newSchedule = await scheduleRepository.create({
        schedule_date: date,
        created_by: createdBy,
      });
      await scheduleRepository.updateStatus(newSchedule.id, ScheduleStatus.BUILDING);
      effectiveScheduleId = newSchedule.id;
      schedule = newSchedule;
    }
  }

  // Check if the schedule's date is a no-fly day
  if (schedule) {
    const noFly = await isNoFlyDay(schedule.schedule_date);
    if (noFly) {
      return { error: `Cannot create flights on a no-fly day (${schedule.schedule_date})`, status: 400 };
    }
    // If the schedule was previously cancelled, reactivate it to building
    // since the user is now creating a flight with passengers on it.
    if (schedule.status === ScheduleStatus.CANCELLED) {
      await scheduleRepository.updateStatus(schedule.id, ScheduleStatus.BUILDING);
      schedule = { ...schedule, status: ScheduleStatus.BUILDING };
    }
  }

  const bookingLegs = await db.selectFrom("booking_legs")
    .selectAll()
    .where("id", "in", bookingLegIds)
    .orderBy("id", "asc")
    .execute();
  if (bookingLegs.length === 0) {
    return { error: "No booking legs found" };
  }

  // Find STY (Stanley) aerodrome ID via code lookup
  const styRows = await db.selectFrom("aerodromes")
    .select(["id"])
    .where("code", "=", "STY")
    .limit(1)
    .execute();
  const originAeroRows = await db.selectFrom("aerodromes")
    .select(["id"])
    .where("code", "=", String(bookingLegs[0].origin_code ?? ""))
    .limit(1)
    .execute();
  const originId = originAeroRows[0]?.id ? Number(originAeroRows[0].id) : null;
  const styId = styRows[0]?.id ? Number(styRows[0].id) : (originId ?? 0);

  return withTransaction(async (tx) => {
    // Generate flight number by finding the highest existing number with
    // today's prefix (e.g. FIG0306) and incrementing. This is more robust
    // than COUNT(*) because it handles pre-existing flights and deleted rows.
    // Use the schedule's date for flight number prefix, not current time.
    const scheduleDate = schedule?.schedule_date
      ? new Date(schedule.schedule_date)
      : bookingLegs[0].leg_date
        ? new Date(String(bookingLegs[0].leg_date))
        : new Date();
    const flightNumber = await generateFlightNumber(scheduleDate, tx);

    // Compute base departure time: 08:30 on the schedule date
    const baseDate = new Date(scheduleDate);
    baseDate.setUTCHours(8, 30, 0, 0);

    // Count existing flights for sort_order
    const countRows = await tx.selectFrom("flights")
      .select(tx.fn.countAll<number>().as("cnt"))
      .where("schedule_id", "=", effectiveScheduleId)
      .execute();
    const sortOrder = Number(countRows[0]?.cnt ?? 0);

    // Create flight with STY → origin → destination → STY route
    const flightResult = await tx.insertInto("flights")
      .values({
        schedule_id: effectiveScheduleId,
        flight_number: flightNumber,
        origin_aerodrome_id: styId,
        destination_aerodrome_id: styId,
        departure_time: baseDate.toISOString(),
        arrival_time: baseDate.toISOString(),
        status: FlightStatus.SCHEDULED,
        sort_order: sortOrder,
        created_by: 1,
      } as any)
      .returning(["id"])
      .execute();
    const flightId = Number(flightResult[0].id);

    // Compute per-leg ETD/ETA starting from baseDate.
    // Each leg: ETA = ETD + 30 min (placeholder), next ETD = prev ETA + 10 min turnaround.
    let currentTime = new Date(baseDate);

    // Create flight legs: STY → origin → destination → STY
    // Skip the initial STY→origin leg if origin is already STY (avoids duplicate STY→STY).
    // Skip the final destination→STY leg if destination is already STY.
    const firstOrigin = String(bookingLegs[0].origin_code ?? "");
    const legRoutes: Array<{ origin_code: string; destination_code: string }> = [];
    if (firstOrigin !== "STY") {
      legRoutes.push({ origin_code: "STY", destination_code: firstOrigin });
    }
    for (const leg of bookingLegs) {
      legRoutes.push({ origin_code: String(leg.origin_code ?? ""), destination_code: String(leg.destination_code ?? "") });
    }
    const lastDest = String(bookingLegs[bookingLegs.length - 1].destination_code ?? "");
    if (lastDest !== "STY") {
      legRoutes.push({ origin_code: lastDest, destination_code: "STY" });
    }

    for (let i = 0; i < legRoutes.length; i++) {
      const route = legRoutes[i];
      const etd = new Date(currentTime);
      const eta = new Date(currentTime);
      eta.setMinutes(eta.getMinutes() + 30); // placeholder 30 min leg
      await tx.insertInto("flight_legs")
        .values({
          flight_id: flightId,
          leg_number: i + 1,
          origin_code: route.origin_code,
          destination_code: route.destination_code,
          etd: etd.toISOString(),
          eta: eta.toISOString(),
          status: FlightStatus.SCHEDULED,
        } as any)
        .execute();
      currentTime = new Date(eta);
      currentTime.setMinutes(currentTime.getMinutes() + 10); // 10 min turnaround
    }

    // Assign all booking legs to the flight, propagating to siblings
    for (const blId of bookingLegIds) {
      await tx.updateTable("booking_legs")
        .set({ flight_id: flightId })
        .where("id", "=", blId)
        .execute();

      const bk = await tx.selectFrom("booking_legs")
        .select("booking_id").where("id", "=", blId)
        .executeTakeFirst();
      if (bk?.booking_id) {
        await tx.updateTable("booking_legs")
          .set({ flight_id: flightId })
          .where("booking_id", "=", bk.booking_id)
          .where("flight_id", "is", null)
          .execute();
      }
    }

    // Compute and persist flight duration + check-in time
    const totalDistanceNm = legRoutes.length > 0 ? legRoutes.length * 30 * (140 / 60) : 0;
    const durationMinutes = Math.round((totalDistanceNm / 140) * 60);
    await sql`
      UPDATE flights SET duration_minutes = ${durationMinutes}, check_in_time = ${"08:30"}::time WHERE id = ${flightId}
    `.execute(tx);

    // Set flight_leg_id on each specific passenger's junction record so they
    // disappear from the unassigned pool (findUnassignedByDate filters by
    // blp.flight_leg_id IS NULL).  Match each passenger's booking leg
    // origin/destination to the newly created flight legs.
    if (options?.bookingLegPassengerIds?.length) {
      const passengerRows = await tx.selectFrom("booking_leg_passengers")
        .select(["id", "booking_leg_id"])
        .where("id", "in", options.bookingLegPassengerIds)
        .execute();
      const blIds = [...new Set(passengerRows.map((p) => Number(p.booking_leg_id)))];
      const blData = await tx.selectFrom("booking_legs")
        .select(["id", "origin_code", "destination_code"])
        .where("id", "in", blIds)
        .execute();
      const blMap = new Map(blData.map((b) => [Number(b.id), b]));
      // Fetch the actual flight leg IDs (not indices) for matching
      const flRows = await tx.selectFrom("flight_legs")
        .select(["id", "leg_number", "origin_code", "destination_code"])
        .where("flight_id", "=", flightId)
        .orderBy("leg_number", "asc")
        .execute();
      for (const p of passengerRows) {
        const bl = blMap.get(Number(p.booking_leg_id));
        if (!bl) continue;
        const matchingFl = flRows.find(
          (fl) => fl.origin_code === bl.origin_code && fl.destination_code === bl.destination_code
        );
        if (matchingFl) {
          await assignToFlightLeg(Number(p.id), Number(matchingFl.id), tx);
        } else {
          // No direct leg — find first origin-matching leg for indirect routes
          const originLeg = flRows.find((fl) => fl.origin_code === bl.origin_code);
          if (originLeg) {
            await assignToFlightLeg(Number(p.id), Number(originLeg.id), tx);
          }
        }
      }
    }

    // Query the full flight row with aerodrome codes, aircraft, and pilot info
    // so the client can add it to the flights state immediately.
    const flightRowResult = await sql<FlightResultRow>`
      SELECT f.id, f.flight_number, f.departure_time, f.arrival_time, f.status,
              NULL::int AS sort_order,
              NULL::int AS duration_minutes,
              NULL::timestamp AS check_in_time,
              NULL::numeric AS max_takeoff_weight_kg,
              NULL::numeric AS max_landing_weight_kg,
              NULL::numeric AS basic_empty_weight_kg,
              NULL::numeric AS payload_kg,
              NULL::numeric AS fuel_kg,
              NULL::numeric AS crew_weight_kg,
              COALESCE(f.origin_code, ao.code) AS origin_code,
              COALESCE(f.destination_code, ad.code) AS destination_code,
              a.registration AS aircraft_registration, a.type AS aircraft_type, a.seat_count,
              p.name AS pilot_name, pa.status AS pilot_status,
              1 AS flight_ordinal
       FROM flights f
       LEFT JOIN aerodromes ao ON ao.id = f.origin_aerodrome_id
       LEFT JOIN aerodromes ad ON ad.id = f.destination_aerodrome_id
       LEFT JOIN aircraft a ON a.id = f.aircraft_id
       LEFT JOIN pilots p ON p.id = f.pilot_id
       LEFT JOIN pilot_assignments pa ON pa.flight_id = f.id AND pa.status = 'confirmed'
       WHERE f.id = ${flightId}
    `.execute(tx);
    const flightSummary = flightRowResult.rows[0] ?? null;

    // Query the flight legs for this flight
    const flightLegResult = await sql<FlightLegShortRow>`
      SELECT fl.id, fl.flight_id, fl.leg_number AS leg_sequence, fl.etd AS departure_time, fl.eta AS arrival_time, fl.status,
              fl.origin_code, fl.destination_code, fl.distance_nm, fl.heading
       FROM flight_legs fl
       WHERE fl.flight_id = ${flightId}
       ORDER BY fl.leg_number
    `.execute(tx);

    // Query passenger manifests for this flight.
    // When per-passenger scheduling is active (bookingLegPassengerIds provided),
    // only include the specific passenger(s) being dragged — not all passengers
    // on the booking leg.
    const manifestRows = await findAssignedManifestsByFlightId(flightId, {
      client: tx,
      bookingLegPassengerIds: options?.bookingLegPassengerIds,
    });

    return {
      success: true,
      flightId,
      scheduleId: effectiveScheduleId,
      flight: flightSummary,
      flightLegs: flightLegResult.rows,
      passengerManifests: manifestRows,
    };
  });
}

/**
 * Handle the "reset-draft" intent.
 * Resets a draft or building schedule by removing all booking_leg_passengers
 * assignments, flight legs, and booking_leg flight assignments, then deleting
 * all flights and resetting the schedule status to draft/building.
 */
export async function handleResetDraft(scheduleId: number): Promise<ActionResult> {
  const schedule = await scheduleRepository.findById(scheduleId);
  if (!schedule) {
    return { error: "Schedule not found", status: 404 };
  }

  if (schedule.status !== ScheduleStatus.BUILDING && schedule.status !== ScheduleStatus.DRAFT) {
    return { error: "Can only reset building or draft schedules", status: 400 };
  }

  return withTransaction(async (tx) => {
    // Get all flights for this schedule
    const flights = await tx.selectFrom("flights")
      .select(["id"])
      .where("schedule_id", "=", scheduleId)
      .execute();
    const flightIds = flights.map((f) => Number(f.id));

    if (flightIds.length > 0) {
      // Delete loadsheets before flights (FK RESTRICT constraint)
      await tx.deleteFrom("loadsheets").where("flight_id", "in", flightIds).execute();

      // Clear passenger assignments
      await sql`UPDATE booking_leg_passengers SET flight_leg_id = NULL WHERE flight_leg_id IN (SELECT id FROM flight_legs WHERE flight_id = ANY(${flightIds}::int[]))`.execute(tx);

      // Delete flight legs
      await sql`DELETE FROM flight_legs WHERE flight_id = ANY(${flightIds}::int[])`.execute(tx);

      // Clear booking_leg flight assignments
      await sql`UPDATE booking_legs SET flight_id = NULL WHERE flight_id = ANY(${flightIds}::int[])`.execute(tx);

      // Delete flights
      await tx.deleteFrom("flights").where("schedule_id", "=", scheduleId).execute();
    }

    // Reset schedule status to building
    await tx.updateTable("schedules")
      .set({ status: ScheduleStatus.BUILDING })
      .where("id", "=", scheduleId)
      .execute();

    return { success: true, deletedFlightCount: flightIds.length };
  });
}

/**
 * Handle the "unassign-booking" intent.
 * Unassigns all passengers from a booking leg using per-passenger
 * unassignment via booking_leg_passengers.
 */
export async function handleUnassignBooking(bookingLegId: number, bookingLegPassengerId?: number): Promise<ActionResult> {
  // When only a passenger ID is provided (per-passenger unassign), resolve the
  // booking leg from the passenger's junction record.
  let effectiveLegId = bookingLegId;
  if (!bookingLegId && bookingLegPassengerId) {
    const blpRows = await db.selectFrom("booking_leg_passengers")
      .select(["booking_leg_id"])
      .where("id", "=", bookingLegPassengerId)
      .execute();
    if (blpRows[0]) effectiveLegId = Number(blpRows[0].booking_leg_id);
  }


  const leg = await bookingLegRepository.findById(effectiveLegId);
  if (!leg) {
    return { error: "Booking leg not found", status: 404 };
  }

  // G-04: Check if already unassigned
  if (leg.flight_id === null) {
    return { error: "Booking is already unassigned", status: 400 };
  }

  // G-03: Check schedule status — allow unassign from BUILDING, DRAFT, or CANCELLED
  // CANCELLED is allowed so users can resurrect a cancelled schedule by
  // unassigning and reassigning bookings without starting from a clean slate.
  const flightRows = await db.selectFrom("flights")
    .select(["id", "schedule_id"])
    .where("id", "=", leg.flight_id)
    .execute();
  const flight = flightRows[0] ?? null;
  if (flight && flight.schedule_id !== null) {
    const schedule = await scheduleRepository.findById(Number(flight.schedule_id));
    if (schedule && !([ScheduleStatus.BUILDING, ScheduleStatus.DRAFT, ScheduleStatus.CANCELLED] as string[]).includes(schedule.status)) {
      return {
        error: "Cannot unassign booking from a schedule that is not in BUILDING, DRAFT, or CANCELLED status",
        status: 400,
      };
    }
  }

  // Check for no-fly days
  if (leg.leg_date) {
    const noFly = await isNoFlyDay(leg.leg_date);
    if (noFly) {
      return { error: `Cannot unassign bookings on a no-fly day (${leg.leg_date})`, status: 400 };
    }
  }

  const flightId = leg.flight_id;

  return withTransaction(async (tx) => {
    // Unassign the specific passenger (per-passenger) or all passengers on the leg.
    if (bookingLegPassengerId) {
      await unassignFromFlightLeg(bookingLegPassengerId, tx);
    } else {
      const passengers = await findByBookingLegId(effectiveLegId);
      for (const passenger of passengers) {
        await unassignFromFlightLeg(passenger.id, tx);
      }
    }

    // Check if any passengers remain on this booking leg with an active flight_leg_id.
    // Only clear booking_leg.flight_id when NO passengers remain assigned.
    const remainingResult = await sql<{ cnt: number }>`
      SELECT COUNT(*)::int AS cnt FROM booking_leg_passengers WHERE booking_leg_id = ${effectiveLegId} AND flight_leg_id IS NOT NULL
    `.execute(tx);
    const remainingOnLeg = Number(remainingResult.rows[0]?.cnt ?? 0);
    if (remainingOnLeg === 0) {
      await tx.updateTable("booking_legs")
        .set({ flight_id: null } as any)
        .where("id", "=", effectiveLegId)
        .execute();
    }

    // If the flight now has zero assigned passengers AND zero booking legs, delete the empty flight.
    let deletedFlightId: number | null = null;
    if (flightId) {
      // Count remaining passengers via per-passenger flight_leg_id assignment
      const paxResult = await sql<{ cnt: number }>`
        SELECT COUNT(*)::int AS cnt
         FROM booking_leg_passengers blp
         JOIN flight_legs fl ON fl.id = blp.flight_leg_id
         WHERE fl.flight_id = ${flightId}
      `.execute(tx);
      // Also count booking legs still assigned to the flight
      const legResult = await sql<{ cnt: number }>`
        SELECT COUNT(*)::int AS cnt FROM booking_legs WHERE flight_id = ${flightId}
      `.execute(tx);
      const remainingPaxCount = Number(paxResult.rows[0]?.cnt ?? 0);
      const remainingLegCount = Number(legResult.rows[0]?.cnt ?? 0);
      if (remainingPaxCount === 0 && remainingLegCount === 0) {
        // Delete the loadsheet first (foreign key to flight)
        await tx.deleteFrom("loadsheets").where("flight_id", "=", flightId).execute();
        // Clear passenger flight-leg assignments on this flight
        await sql`UPDATE booking_leg_passengers SET flight_leg_id = NULL WHERE flight_leg_id IN (SELECT id FROM flight_legs WHERE flight_id = ${flightId})`.execute(tx);
        // Delete weight balance snapshots
        await sql`DELETE FROM weight_balance_snapshots WHERE flight_leg_id IN (SELECT id FROM flight_legs WHERE flight_id = ${flightId})`.execute(tx);
        // Delete pilot assignments
        await sql`DELETE FROM pilot_assignments WHERE flight_id = ${flightId}`.execute(tx);
        // Delete flight legs
        await tx.deleteFrom("flight_legs").where("flight_id", "=", flightId).execute();
        // Delete the flight
        await tx.deleteFrom("flights").where("id", "=", flightId).execute();
        deletedFlightId = flightId;
      } else {
        // Invalidate the loadsheet so it gets regenerated on next visit
        await tx.deleteFrom("loadsheets").where("flight_id", "=", flightId).execute();
      }
    }

    return { success: true, deletedFlightId };
  });
}

/**
 * Handle the "transfer-booking" intent.
 * Moves a SINGLE passenger (booking_leg_passenger) from one flight directly
 * to another. Only that passenger is moved, not the entire booking leg group.
 */
export async function handleTransferBooking(
  bookingLegPassengerId: number,
  targetFlightId: number
): Promise<ActionResult> {
  const blpRows = await db.selectFrom("booking_leg_passengers")
    .select(["id", "booking_leg_id", "booking_passenger_id", "flight_leg_id"])
    .where("id", "=", bookingLegPassengerId)
    .execute();
  const blp = blpRows[0] ?? null;
  if (!blp) return { error: "Passenger record not found", status: 404 };

  const bookingLeg = await bookingLegRepository.findById(Number(blp.booking_leg_id));
  if (!bookingLeg) return { error: "Booking leg not found", status: 404 };
  if (!bookingLeg.flight_id) return { error: "Passenger is not assigned to any flight", status: 400 };
  if (bookingLeg.flight_id === targetFlightId) return { error: "Passenger is already on this flight", status: 400 };

  const sourceFlightId = bookingLeg.flight_id;

  return withTransaction(async (tx) => {
    // Step 1: Unassign this single passenger from source flight
    await tx.updateTable("booking_leg_passengers")
      .set({ flight_leg_id: null } as any)
      .where("id", "=", bookingLegPassengerId)
      .execute();

    // If no more passengers on this booking leg, unassign the booking leg
    const remainingResult = await sql<{ cnt: number }>`
      SELECT COUNT(*)::int AS cnt FROM booking_leg_passengers WHERE booking_leg_id = ${bookingLeg.id} AND flight_leg_id IS NOT NULL
    `.execute(tx);
    const remainingPassengers = Number(remainingResult.rows[0]?.cnt ?? 0);
    if (remainingPassengers === 0) {
      await tx.updateTable("booking_legs")
        .set({ flight_id: null } as any)
        .where("id", "=", bookingLeg.id)
        .execute();
    }

    // Delete source flight if now empty
    const remainingResult2 = await sql<{ cnt: number }>`
      SELECT COUNT(*)::int AS cnt FROM booking_legs WHERE flight_id = ${sourceFlightId}
    `.execute(tx);
    const remainingLegs = Number(remainingResult2.rows[0]?.cnt ?? 0);
    let deletedFlightId: number | null = null;
    if (remainingLegs === 0) {
      await tx.deleteFrom("loadsheets").where("flight_id", "=", sourceFlightId).execute();
      await tx.deleteFrom("flight_legs").where("flight_id", "=", sourceFlightId).execute();
      await tx.deleteFrom("pilot_assignments").where("flight_id", "=", sourceFlightId).execute();
      await tx.deleteFrom("flights").where("id", "=", sourceFlightId).execute();
      deletedFlightId = sourceFlightId;
    }

    // Step 2: Find or create matching booking leg on target flight
    const targetBookingLegRows = await tx.selectFrom("booking_legs")
      .selectAll()
      .where("flight_id", "=", targetFlightId)
      .where("origin_code", "=", bookingLeg.origin_code)
      .where("destination_code", "=", bookingLeg.destination_code)
      .limit(1)
      .execute();

    let targetBookingLeg = targetBookingLegRows[0] ?? null;

    if (!targetBookingLeg) {
      const inserted = await tx.insertInto("booking_legs")
        .values({
          booking_id: bookingLeg.booking_id,
          flight_id: targetFlightId,
          origin_code: bookingLeg.origin_code,
          destination_code: bookingLeg.destination_code,
          leg_date: bookingLeg.leg_date,
          status: "confirmed",
        } as any)
        .returningAll()
        .execute();
      targetBookingLeg = inserted[0] ?? null;
    }

    // Move this passenger to the target booking leg
    await tx.updateTable("booking_leg_passengers")
      .set({ booking_leg_id: Number(targetBookingLeg!.id) })
      .where("id", "=", bookingLegPassengerId)
      .execute();

    // Step 3: Route insertion on target flight
    const targetLegs = await tx.selectFrom("flight_legs")
      .select(["id", "leg_number", "origin_code", "destination_code"])
      .where("flight_id", "=", targetFlightId)
      .orderBy("leg_number", "asc")
      .execute();

    const routeLegs = targetLegs.map((l) => ({
      leg_sequence: Number(l.leg_number),
      origin_code: String(l.origin_code ?? ""),
      destination_code: String(l.destination_code ?? ""),
    }));

    const { insertPassengerRoute } = await import("./scheduling/insert-passenger-route");
    const insertionResult = await insertPassengerRoute(routeLegs, bookingLeg.origin_code, bookingLeg.destination_code);

    if (insertionResult.inserted) {
      await tx.deleteFrom("flight_legs").where("flight_id", "=", targetFlightId).execute();
      for (const rl of insertionResult.legs) {
        await tx.insertInto("flight_legs")
          .values({
            flight_id: targetFlightId,
            leg_number: rl.leg_sequence,
            origin_code: rl.origin_code,
            destination_code: rl.destination_code,
            status: FlightStatus.SCHEDULED,
          } as any)
          .execute();
      }
    }

    // Link passenger to matching flight leg on target
    const updatedTargetLegs = await tx.selectFrom("flight_legs")
      .select(["id", "origin_code", "destination_code"])
      .where("flight_id", "=", targetFlightId)
      .orderBy("leg_number", "asc")
      .execute();
    const passengerLeg = updatedTargetLegs.find(
      (l) => l.origin_code === bookingLeg.origin_code && l.destination_code === bookingLeg.destination_code
    );
    if (passengerLeg) {
      await tx.updateTable("booking_leg_passengers")
        .set({ flight_leg_id: Number(passengerLeg.id) })
        .where("id", "=", bookingLegPassengerId)
        .execute();
    }

    const updatedLegRows = await tx.selectFrom("flight_legs")
      .selectAll()
      .where("flight_id", "=", targetFlightId)
      .orderBy("leg_number", "asc")
      .execute();

    const manifestRows = updatedLegRows.length > 0
      ? await findAssignedManifestsByFlightId(targetFlightId, { client: tx })
      : [];

    // Invalidate both flights' loadsheets so they get regenerated on next visit
    await tx.deleteFrom("loadsheets").where("flight_id", "=", targetFlightId).execute();

    // Map leg_number → leg_sequence to match frontend FlightLegRow type
    const mappedLegs = updatedLegRows.map((l) => ({
      ...l,
      leg_sequence: l.leg_number,
    }));

    return { success: true, targetFlightId, sourceFlightId, deletedFlightId,
      updatedFlightLegs: mappedLegs, updatedPassengerManifests: manifestRows };
  });
}

/**
 * Handle the "remove-flight" intent.
 * Unassigns all booking legs from the flight, deletes flight legs and the
 * flight itself, returning all passengers to the unassigned pool.
 */
export async function handleRemoveFlight(flightId: number): Promise<ActionResult> {
  const flightRows = await db.selectFrom("flights")
    .select(["id", "status"])
    .where("id", "=", flightId)
    .execute();
  if (flightRows.length === 0) {
    return { error: "Flight not found", status: 404 };
  }

  return withTransaction(async (tx) => {
    // 1. Unassign all booking legs from this flight
    await tx.updateTable("booking_legs")
      .set({ flight_id: null } as any)
      .where("flight_id", "=", flightId)
      .execute();

    // 2. Clear flight_leg_id on all passengers assigned to this flight
    await sql`
      UPDATE booking_leg_passengers
       SET flight_leg_id = NULL
       WHERE flight_leg_id IN (SELECT id FROM flight_legs WHERE flight_id = ${flightId})
    `.execute(tx);

    // 3. Delete flight legs
    await tx.deleteFrom("flight_legs")
      .where("flight_id", "=", flightId)
      .execute();

    // 3b. Delete any associated loadsheet (prevents orphaned loadsheet records)
    await tx.deleteFrom("loadsheets").where("flight_id", "=", flightId).execute();

    // 4. Delete the flight
    await tx.deleteFrom("flights")
      .where("id", "=", flightId)
      .execute();

    return { success: true, deletedFlightId: flightId };
  });
}

/**
 * Handle the "assign-pilot" intent.
 * Assigns a pilot to a flight, updating both flights.pilot_id and pilot_assignments.
 * Validates the pilot exists, is active, and is qualified for the flight's aircraft.
 */
export async function handleAssignAircraft(
  flightId: number,
  aircraftId: number,
  scheduleId: number,
  assignedBy: number
): Promise<ActionResult> {
  // Validate the aircraft exists and is active
  const aircraftRows = await db.selectFrom("aircraft")
    .select(["id", "registration", "type", "is_active"])
    .where("id", "=", aircraftId)
    .execute();
  const aircraft = aircraftRows[0] ?? null;

  if (!aircraft) {
    return { error: `Aircraft with ID ${aircraftId} not found`, status: 404 };
  }

  if (!aircraft.is_active) {
    return { error: `Aircraft "${aircraft.registration}" is not active`, status: 400 };
  }

  // Validate the flight exists (include departure/arrival for time-overlap check)
  const flightRows2 = await db.selectFrom("flights")
    .select(["id", "flight_number", "schedule_id", "departure_time", "arrival_time"])
    .where("id", "=", flightId)
    .execute();
  const flight = flightRows2[0] ?? null;

  if (!flight) {
    return { error: `Flight with ID ${flightId} not found`, status: 404 };
  }

  // Validate the flight belongs to the correct schedule
  if (Number(flight.schedule_id) !== scheduleId) {
    return { error: `Flight ${flight.flight_number} does not belong to schedule ${scheduleId}`, status: 400 };
  }

  // Time-overlap conflict check: aircraft can be on multiple flights total,
  // but not simultaneously. Check if the proposed flight's departure→arrival
  // window overlaps with any other flight using this aircraft on the same schedule.
  const flightArrival = String(flight.arrival_time);
  const flightDeparture = String(flight.departure_time);
  const conflictingFlights = await db.selectFrom("flights")
    .select(["flight_number", "departure_time", "arrival_time"])
    .where("aircraft_id", "=", aircraftId)
    .where("schedule_id", "=", scheduleId)
    .where("id", "<>", flightId)
    .where("departure_time", "<", flightArrival)
    .where("arrival_time", ">", flightDeparture)
    .execute();

  if (conflictingFlights.length > 0) {
    const names = conflictingFlights.map((f) => f.flight_number).join(", ");
    console.warn(`[handleAssignAircraft] BLOCKED: Aircraft ${aircraft.registration} conflicts with ${names} on schedule ${scheduleId}`);
    return {
      error: `Aircraft "${aircraft.registration}" conflicts with flight(s): ${names}. ` +
        `The departure/arrival times overlap. Assign to a non-overlapping flight or unassign aircraft from the other flight(s) first.`,
      status: 400,
    };
  }

  // Update the flight's aircraft_id
  await flightRepository.assignAircraft(flightId, aircraftId);

  // Audit trail: log the aircraft assignment
  await createAuditLogEntry({
    actorId: assignedBy,
    action: "flight:assign-aircraft",
    entityType: "flight",
    entityId: flightId,
    newValues: {
      flightId,
      flightNumber: flight.flight_number,
      aircraftId,
      aircraftRegistration: aircraft.registration,
      aircraftType: aircraft.type,
      scheduleId,
    },
    ipAddress: undefined,
    userAgent: undefined,
  });

  // Re-query the updated flight row so the client can update state directly
  const updatedResult = await sql<FlightDetailRow>`
    SELECT f.id, f.flight_number, f.departure_time, f.arrival_time, f.status,
            f.sort_order,
            f.duration_minutes,
            f.check_in_time,
            a.max_takeoff_weight_kg,
            NULL::numeric AS max_landing_weight_kg,
            a.empty_weight_kg AS basic_empty_weight_kg,
            NULL::numeric AS payload_kg,
            NULL::numeric AS fuel_kg,
            NULL::numeric AS crew_weight_kg,
            COALESCE(f.origin_code, ao.code) AS origin_code,
            COALESCE(f.destination_code, ad.code) AS destination_code,
            a.registration AS aircraft_registration, a.type AS aircraft_type, a.seat_count,
            p.name AS pilot_name, pa.status AS pilot_status,
            0 AS flight_ordinal
     FROM flights f
     LEFT JOIN aerodromes ao ON ao.id = f.origin_aerodrome_id
     LEFT JOIN aerodromes ad ON ad.id = f.destination_aerodrome_id
     LEFT JOIN aircraft a ON a.id = f.aircraft_id
     LEFT JOIN pilots p ON p.id = f.pilot_id
     LEFT JOIN pilot_assignments pa ON pa.flight_id = f.id AND pa.status = 'confirmed'
     WHERE f.id = ${flightId}
  `.execute(db);
  const updatedFlightRows = updatedResult.rows;
  const updatedFlight = updatedFlightRows[0] != null
    ? Object.fromEntries(
        Object.entries(updatedFlightRows[0]).map(([k, v]) => [k, typeof v === "bigint" ? Number(v) : v])
      )
    : null;

  console.log(`[handleAssignAircraft] OK: Aircraft ${aircraft.registration} (#${aircraftId}) assigned to flight ${flight.flight_number} (#${flightId}) on schedule ${scheduleId}`);
  return { success: true, aircraftRegistration: aircraft.registration, aircraftType: aircraft.type, updatedFlight };
}

export async function handleAssignPilot(
  flightId: number,
  pilotId: number,
  scheduleId: number,
  assignedBy: number
): Promise<ActionResult> {
  // Validate the pilot exists and is active
  const pilotRows = await db.selectFrom("pilots")
    .select(["id", "name", "is_active", "rating", "license_type", "medical_expiry"])
    .where("id", "=", pilotId)
    .execute();
  const pilot = pilotRows[0] ?? null;

  if (!pilot) {
    return { error: `Pilot with ID ${pilotId} not found`, status: 404 };
  }

  if (!pilot.is_active) {
    return { error: `Pilot "${pilot.name ?? pilot.id}" is not active`, status: 400 };
  }

  // Validate the flight exists (include departure/arrival for time-overlap check)
  const flightRows = await db.selectFrom("flights")
    .select(["id", "flight_number", "aircraft_id", "schedule_id", "departure_time", "arrival_time"])
    .where("id", "=", flightId)
    .execute();
  const flight = flightRows[0] ?? null;

  if (!flight) {
    return { error: `Flight with ID ${flightId} not found`, status: 404 };
  }

  // Validate the flight belongs to the correct schedule
  if (Number(flight.schedule_id) !== scheduleId) {
    return { error: `Flight ${flight.flight_number} does not belong to schedule ${scheduleId}`, status: 400 };
  }

  // Time-overlap conflict check: pilot can be on multiple flights total,
  // but not simultaneously. Check if the proposed flight's departure→arrival
  // window overlaps with any other confirmed/assigned flight for this pilot
  // on the same schedule.
  const schedule = await scheduleRepository.findById(scheduleId);
  if (schedule) {
    const existingAssignments = await db.selectFrom("pilot_assignments")
      .select(["flight_id"])
      .where("pilot_id", "=", pilotId)
      .where("schedule_id", "=", scheduleId)
      .where("status", "not in", [PilotAssignmentStatus.DECLINED, "cancelled"])
      .where("flight_id", "<>", flightId)
      .execute();

    if (existingAssignments.length > 0) {
      const assignedFlightIds = existingAssignments.map((a) => Number(a.flight_id));
      const flightArrival2 = String(flight.arrival_time);
      const flightDeparture2 = String(flight.departure_time);
      const overlappingRows = await db.selectFrom("flights")
        .select(["flight_number"])
        .where("id", "in", assignedFlightIds)
        .where("departure_time", "<", flightArrival2)
        .where("arrival_time", ">", flightDeparture2)
        .execute();
      const overlappingFlight = overlappingRows[0] ?? null;

      if (overlappingFlight) {
        const fmtTime = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        const conflictMsg = `Pilot ${pilot.name} conflicts with ${overlappingFlight.flight_number} ` +
          `(${fmtTime(new Date(String(flight.departure_time)))}–${fmtTime(new Date(String(flight.arrival_time)))}) ` +
          `on schedule ${scheduleId}`;
        console.warn(`[handleAssignPilot] BLOCKED: ${conflictMsg}`);
        return {
          error: `Pilot conflicts with flight ${overlappingFlight.flight_number} (` +
            `${fmtTime(new Date(String(flight.departure_time)))}–${fmtTime(new Date(String(flight.arrival_time)))}). ` +
            `Assign to a non-overlapping flight or unassign from the other flight first.`,
          status: 400,
        };
      }
    }
  }

  // Check pilot qualification (type rating) against the flight's aircraft
  if (flight.aircraft_id && pilot.rating) {
    const acRows = await db.selectFrom("aircraft")
      .select(["id", "type", "registration"])
      .where("id", "=", Number(flight.aircraft_id))
      .execute();
    const aircraft = acRows[0] ?? null;

    if (aircraft) {
      const normalizedAircraftType = String(aircraft.type).toLowerCase().replace(/[^a-z0-9]/g, "");
      const normalizedRating = String(pilot.rating).toLowerCase().replace(/[^a-z0-9]/g, "");
      // Check for shared tokens (e.g., "bn2" in both "bn2islander" and "bn2typerating")
      const hasQualification =
        normalizedRating.includes(normalizedAircraftType) ||
        normalizedAircraftType.includes(normalizedRating) ||
        extractTokens(normalizedAircraftType).some((t) => t.length >= 2 && normalizedRating.includes(t)) ||
        extractTokens(normalizedRating).some((t) => t.length >= 2 && normalizedAircraftType.includes(t));

      if (!hasQualification) {
        return {
          error: `Pilot "${pilot.name ?? pilot.id}" does not have the required type rating "${aircraft.type}" (rating: "${pilot.rating}")`,
          status: 400,
        };
      }
    }
  }

  // Check medical validity
  if (pilot.medical_expiry && schedule) {
    const expiryDate = new Date(String(pilot.medical_expiry));
    const scheduleDate = new Date(schedule.schedule_date);
    if (expiryDate < scheduleDate) {
      return {
        error: `Pilot "${pilot.name ?? pilot.id}" medical certificate expired on ${String(pilot.medical_expiry).split("T")[0]}`,
        status: 400,
      };
    }
  }

  // Update the flight's pilot_id
  await flightRepository.assignPilot(flightId, pilotId);

  // Check if a pilot_assignment already exists for this flight
  const existingAssignments2 = await pilotAssignmentRepository.findByFlightId(flightId);
  const captainAssignment = existingAssignments2.find((a) => a.role === "captain");

  if (captainAssignment) {
    // Update existing assignment
    await db.updateTable("pilot_assignments")
      .set({
        pilot_id: pilotId,
        assigned_by: assignedBy,
        status: "assigned",
      } as any)
      .where("id", "=", captainAssignment.id)
      .execute();
  } else {
    // Create new assignment
    await pilotAssignmentRepository.create({
      schedule_id: scheduleId,
      flight_id: flightId,
      pilot_id: pilotId,
      role: "captain",
      assigned_by: assignedBy,
    });
  }

  // Audit trail: log the pilot assignment
  await createAuditLogEntry({
    actorId: assignedBy,
    action: "flight:assign-pilot",
    entityType: "pilot_assignment",
    entityId: flightId,
    newValues: {
      flightId,
      flightNumber: flight.flight_number,
      pilotId,
      pilotName: pilot.name,
      scheduleId,
    },
    ipAddress: undefined,
    userAgent: undefined,
  });

  // Re-query the updated flight row so the client can update state directly
  const updatedResult2 = await sql<FlightDetailRow>`
    SELECT f.id, f.flight_number, f.departure_time, f.arrival_time, f.status,
            f.sort_order,
            f.duration_minutes,
            f.check_in_time,
            a.max_takeoff_weight_kg,
            NULL::numeric AS max_landing_weight_kg,
            a.empty_weight_kg AS basic_empty_weight_kg,
            NULL::numeric AS payload_kg,
            NULL::numeric AS fuel_kg,
            NULL::numeric AS crew_weight_kg,
            COALESCE(f.origin_code, ao.code) AS origin_code,
            COALESCE(f.destination_code, ad.code) AS destination_code,
            a.registration AS aircraft_registration, a.type AS aircraft_type, a.seat_count,
            p.name AS pilot_name, pa.status AS pilot_status,
            0 AS flight_ordinal
     FROM flights f
     LEFT JOIN aerodromes ao ON ao.id = f.origin_aerodrome_id
     LEFT JOIN aerodromes ad ON ad.id = f.destination_aerodrome_id
     LEFT JOIN aircraft a ON a.id = f.aircraft_id
     LEFT JOIN pilots p ON p.id = f.pilot_id
     LEFT JOIN pilot_assignments pa ON pa.flight_id = f.id AND pa.status = 'confirmed'
     WHERE f.id = ${flightId}
  `.execute(db);
  const updatedRows = updatedResult2.rows;
  const updatedFlight = updatedRows[0] != null
    ? Object.fromEntries(
        Object.entries(updatedRows[0]).map(([k, v]) => [k, typeof v === "bigint" ? Number(v) : v])
      )
    : null;

  console.log(`[handleAssignPilot] OK: Pilot ${pilot.name} (#${pilotId}) assigned to flight ${flight.flight_number} (#${flightId}) on schedule ${scheduleId}`);
  return { success: true, pilotName: pilot.name, updatedFlight };
}

/**
 * Route an action intent to the appropriate handler.
 */
export async function routeScheduleAction(
  intent: string,
  ctx: ActionContext,
  date: string
): Promise<ActionResult> {
  const { formData, userId } = ctx;

  switch (intent) {
    case "auto-build":
      return handleAutoBuild(date, userId);

    case "approve": {
      const scheduleId = Number(formData.get("scheduleId"));
      return handleApprove(scheduleId, userId);
    }

    case "revise": {
      const scheduleId = Number(formData.get("scheduleId"));
      return handleRevise(scheduleId, userId);
    }

    case "publish": {
      const scheduleId = Number(formData.get("scheduleId"));
      return handlePublish(scheduleId, userId);
    }

    case "cancel": {
      const scheduleId = Number(formData.get("scheduleId"));
      const cancellationReason = formData.get("cancellationReason")?.toString() ?? "";
      return handleCancel(scheduleId, userId, cancellationReason);
    }

    case "reorder-flights": {
      const scheduleId = Number(formData.get("scheduleId"));
      const flightIdsRaw = formData.get("flightIds")?.toString();
      if (!flightIdsRaw) return { error: "No flight IDs provided" };
      const flightIds: number[] = JSON.parse(flightIdsRaw);
      return handleReorderFlights(scheduleId, flightIds, userId);
    }

    case "create-flight":
    case "add-flight": {
      const scheduleId = Number(formData.get("scheduleId"));
      const originAerodromeId = Number(formData.get("originAerodromeId"));
      const destinationAerodromeId = Number(formData.get("destinationAerodromeId"));
      const aircraftId = formData.get("aircraftId") ? Number(formData.get("aircraftId")) : null;
      const result = await handleCreateFlight(
        scheduleId,
        originAerodromeId,
        destinationAerodromeId,
        aircraftId,
        userId
      );
      await createAuditLogEntry({
        actorId: userId,
        action: "schedule.create_flight",
        entityType: "schedule",
        entityId: scheduleId,
        newValues: { origin_aerodrome_id: originAerodromeId, destination_aerodrome_id: destinationAerodromeId },
      }).catch(() => {});
      return result;
    }

    case "assign-booking": {
      const bookingLegId = Number(formData.get("bookingLegId"));
      const flightId = Number(formData.get("flightId"));
      const bookingLegPassengerId = formData.get("bookingLegPassengerId") ? Number(formData.get("bookingLegPassengerId")) : undefined;
      const result = await handleAssignBooking(bookingLegId, flightId, bookingLegPassengerId);
      await createAuditLogEntry({
        actorId: userId,
        action: "schedule.assign_booking",
        entityType: "booking_leg",
        entityId: bookingLegId,
        newValues: { flight_id: flightId },
      }).catch(() => {});
      return result;
    }

    case "create-flight-from-booking": {
      const scheduleId = Number(formData.get("scheduleId"));
      const bookingLegIdsRaw = formData.get("bookingLegIds")?.toString();
      if (!bookingLegIdsRaw) return { error: "No booking leg IDs provided" };
      const bookingLegIds: number[] = JSON.parse(bookingLegIdsRaw);
      const bookingLegPassengerIdsRaw = formData.get("bookingLegPassengerIds")?.toString();
      const bookingLegPassengerIds: number[] | undefined = bookingLegPassengerIdsRaw ? JSON.parse(bookingLegPassengerIdsRaw) : undefined;
      return handleCreateFlightFromBooking(scheduleId, bookingLegIds, { bookingLegPassengerIds });
    }

    case "unassign-booking": {
      const bookingLegId = formData.get("bookingLegId") ? Number(formData.get("bookingLegId")) : 0;
      const bookingLegPassengerId = formData.get("bookingLegPassengerId") ? Number(formData.get("bookingLegPassengerId")) : undefined;
      const result = await handleUnassignBooking(bookingLegId, bookingLegPassengerId);
      await createAuditLogEntry({
        actorId: userId,
        action: "schedule.unassign_booking",
        entityType: "booking_leg",
        entityId: bookingLegId || 0,
        newValues: { booking_leg_passenger_id: bookingLegPassengerId },
      }).catch(() => {});
      return result;
    }

    case "remove-flight": {
      const flightId = Number(formData.get("flightId"));
      const result = await handleRemoveFlight(flightId);
      await createAuditLogEntry({
        actorId: userId,
        action: "schedule.remove_flight",
        entityType: "flight",
        entityId: flightId,
      }).catch(() => {});
      return result;
    }

    case "transfer-booking": {
      const bookingLegPassengerId = Number(formData.get("bookingLegPassengerId"));
      const targetFlightId = Number(formData.get("targetFlightId"));
      return handleTransferBooking(bookingLegPassengerId, targetFlightId);
    }

    case "assign-pilot": {
      const flightId = Number(formData.get("flightId"));
      const pilotId = Number(formData.get("pilotId"));
      const scheduleId = Number(formData.get("scheduleId"));
      return handleAssignPilot(flightId, pilotId, scheduleId, userId);
    }

    case "assign-aircraft": {
      const flightId = Number(formData.get("flightId"));
      const aircraftId = Number(formData.get("aircraftId"));
      const scheduleId = Number(formData.get("scheduleId"));
      return handleAssignAircraft(flightId, aircraftId, scheduleId, userId);
    }

    case "reset-draft": {
      const scheduleId = Number(formData.get("scheduleId"));
      return handleResetDraft(scheduleId);
    }

    default:
      return { error: `Unknown intent: ${intent}` };
  }
}
