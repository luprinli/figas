import { db } from "./db.server";
import { scheduleRepository } from "./repositories/schedule";
import { flightRepository, findSummaryById, findLegsByFlightId } from "./repositories/flight";
import { flightLegRepository } from "./repositories/flight-leg";
import { bookingLegRepository } from "./repositories/booking-leg";
import { isNoFlyDay } from "./services/no-fly.service";
import { generateFlightNumber } from "./flight-number.server";
import { createAuditLogEntry } from "./permissions.server";
import { ScheduleStatus } from "./constants";
import { ScheduleStatus as PrismaScheduleStatus } from "../../generated/prisma/enums";
import { pilotAssignmentRepository } from "./repositories/pilot-assignment";
import { withTransaction } from "./repositories/transaction";
import { bigintRowToNumbers } from "./bigint";
import { findByBookingLegId, assignToFlightLeg, unassignFromFlightLeg } from "./repositories/booking-leg-passenger";

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

/**
 * Server-only schedule action handlers.
 * These functions encapsulate the action logic for the schedule builder route,
 * making them testable and reusable across different routes.
 */

export interface ActionContext {
  userId: number;
  formData: FormData;
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
  const flights = await db.flights.findMany({
    where: { schedule_id: scheduleId },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const flightIds: number[] = flights.map((f) => f.id);

  if (flightIds.length === 0) {
    return { error: "Cannot approve a schedule with no flights. Build flights first.", status: 400 };
  }

  const emptyFlights: number[] = [];
  for (const flightId of flightIds) {
    const count = await bookingLegRepository.countByFlightId(flightId);
    if (count === 0) {
      emptyFlights.push(flightId);
    }
  }

  if (emptyFlights.length > 0) {
    return {
      error: `Cannot approve: ${emptyFlights.length} flight(s) have no booking legs assigned. All flights must have at least one passenger.`,
      status: 400,
    };
  }

  const wbViolations = await db.$queryRawUnsafe<Array<{ flight_leg_id: number; mtow_used_pct: number; mlw_used_pct: number; binding_constraint: string | null }>>(
    `SELECT wbs.flight_leg_id, wbs.mtow_used_pct, wbs.mlw_used_pct, wbs.binding_constraint
     FROM weight_balance_snapshots wbs
     JOIN flight_legs fl ON fl.id = wbs.flight_leg_id
     JOIN flights f ON f.id = fl.flight_id
     WHERE f.schedule_id = $1
       AND ((wbs.mtow_used_pct IS NOT NULL AND wbs.mtow_used_pct > 100)
         OR (wbs.mlw_used_pct IS NOT NULL AND wbs.mlw_used_pct > 100)
         OR (wbs.binding_constraint IS NOT NULL AND wbs.binding_constraint != 'OK' AND wbs.binding_constraint != 'none'))`,
    [scheduleId]
  );

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
  await db.schedules.update({
    where: { id: scheduleId },
    data: {
      status: PrismaScheduleStatus.draft,
      approved_by: null,
      approved_at: null,
      published_by: null,
      published_at: null,
    },
  });

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
  const flights = await db.flights.findMany({
    where: { schedule_id: scheduleId },
    select: { id: true, flight_number: true },
    orderBy: { id: "asc" },
  });

  if (flights.length === 0) {
    return { error: "Cannot publish a schedule with no flights.", status: 400 };
  }

  const flightsWithoutPilot: string[] = [];
  for (const flight of flights) {
    const assignments = await pilotAssignmentRepository.findByFlightId(flight.id);
    const hasCaptain = assignments.some((a) => a.role === "captain");
    if (!hasCaptain) {
      flightsWithoutPilot.push(flight.flight_number);
    }
  }

  if (flightsWithoutPilot.length > 0) {
    console.warn(`[handlePublish] BLOCKED: ${flightsWithoutPilot.length} flight(s) missing pilot: ${flightsWithoutPilot.join(", ")}`);
    return {
      error: `Cannot publish: ${flightsWithoutPilot.length} flight(s) have no pilot assigned: ${flightsWithoutPilot.join(", ")}. Assign pilots before publishing.`,
      status: 400,
    };
  }

  // Check that all flights have an aircraft assigned
  const flightsWithoutAircraft: string[] = [];
  for (const flight of flights) {
    const flightDetail = await db.flights.findUnique({
      where: { id: flight.id },
      select: { aircraft_id: true },
    });
    if (!flightDetail?.aircraft_id) {
      flightsWithoutAircraft.push(flight.flight_number);
    }
  }

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
  if (schedule.status !== ScheduleStatus.BUILDING && schedule.status !== ScheduleStatus.APPROVED) {
    return {
      error: `Cannot cancel a schedule with status "${schedule.status}". Only "building" or "approved" schedules can be cancelled.`,
      status: 400,
    };
  }

  await scheduleRepository.updateStatus(scheduleId, ScheduleStatus.CANCELLED, {
    cancelled_by: cancelledBy,
    cancellation_reason: cancellationReason,
  });

  // Audit trail: log the cancellation
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

  return { success: true };
}

/**
 * Handle the "reorder-flights" intent.
 * Uses a database transaction to atomically update sort_order for all flights
 * and sets departure/arrival times with 15-minute spacing starting from 06:00.
 */
export async function handleReorderFlights(scheduleId: number, flightIds: number[]): Promise<ActionResult> {
  try {
    await db.$transaction(async (tx) => {
      const baseTime = new Date();
      baseTime.setHours(6, 0, 0, 0); // 06:00 base time

      for (let i = 0; i < flightIds.length; i++) {
        const departureTime = new Date(baseTime.getTime() + i * 15 * 60 * 1000); // 15-min intervals
        const arrivalTime = new Date(departureTime.getTime() + 30 * 60 * 1000); // 30-min flight time

        await tx.flights.updateMany({
          where: {
            id: flightIds[i],
            schedule_id: scheduleId,
          },
          data: {
            sort_order: i + 1,
            departure_time: departureTime,
            arrival_time: arrivalTime,
          },
        });
      }
    });
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
  // Check if the schedule's date is a no-fly day
  const schedule = await scheduleRepository.findById(scheduleId);
  if (schedule) {
    const noFly = await isNoFlyDay(schedule.schedule_date);
    if (noFly) {
      return { error: `Cannot create flights on a no-fly day (${schedule.schedule_date})`, status: 400 };
    }
  }

  // Resolve aerodrome codes before entering the transaction so we can
  // match unassigned booking legs and build the flight leg.
  const aerodromes = await db.aerodromes.findMany({
    where: { id: { in: [originAerodromeId, destinationAerodromeId] } },
    select: { id: true, code: true },
  });
  const originCode = aerodromes.find((a) => a.id === originAerodromeId)?.code ?? "";
  const destinationCode = aerodromes.find((a) => a.id === destinationAerodromeId)?.code ?? "";

  return withTransaction(async (tx) => {
    const now = new Date();
    const flightNumber = await generateFlightNumber(now, tx);

    // Every flight path must start and end at STY (RULE 1). Resolve the STY id.
    const styRow = await tx.aerodromes.findFirst({
      where: { code: "STY" },
      select: { id: true },
    });
    const styId = styRow?.id ?? originAerodromeId;

    // Create the flight record as an STY → … → STY round trip.
    const result = await tx.flights.create({
      data: {
        schedule_id: scheduleId,
        flight_number: flightNumber,
        origin_aerodrome_id: styId,
        destination_aerodrome_id: styId,
        origin_code: "STY",
        destination_code: "STY",
        aircraft_id: aircraftId,
        departure_time: new Date(),
        arrival_time: new Date(),
        status: "scheduled",
        created_by: createdBy,
      },
      select: { id: true },
    });
    const flightId = result.id;

    // Link unassigned booking legs whose sector matches origin → destination
    if (originCode && destinationCode) {
      await tx.booking_legs.updateMany({
        where: {
          flight_id: null,
          origin_code: originCode,
          destination_code: destinationCode,
        },
        data: { flight_id: flightId },
      });
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
    const manifestRows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT blp.id, blp.booking_leg_id,
              CONCAT(bp.first_name, ' ', bp.last_name) AS passenger_name,
              blp.clothed_weight_kg AS body_weight_kg,
              blp.baggage_weight_kg, blp.freight_weight_kg,
              bl.origin_code, bl.destination_code
       FROM booking_leg_passengers blp
       JOIN booking_legs bl ON bl.id = blp.booking_leg_id
       JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
       WHERE blp.flight_leg_id IS NOT NULL
         AND blp.flight_leg_id IN (SELECT id FROM flight_legs WHERE flight_id = $1)
       ORDER BY blp.id`,
      flightId
    );
    const passengerManifests = (manifestRows as Array<{
      id: number | bigint; booking_leg_id: number | bigint; passenger_name: string;
      body_weight_kg: number | bigint; baggage_weight_kg: number | bigint; freight_weight_kg: number | bigint | null;
      origin_code: string; destination_code: string;
    }>).map((r) => ({
      id: Number(r.id),
      booking_leg_id: Number(r.booking_leg_id),
      passenger_name: r.passenger_name,
      body_weight_kg: Number(r.body_weight_kg),
      baggage_weight_kg: Number(r.baggage_weight_kg),
      freight_weight_kg: r.freight_weight_kg != null ? Number(r.freight_weight_kg) : 0,
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
  const flightSchedule = await db.flights.findUnique({
    where: { id: flightId },
    select: { schedule_id: true },
  });
  const scheduleId = flightSchedule?.schedule_id ?? null;

  // Get passengers for this booking leg.  When a specific passenger is being
  // dragged (per-passenger scheduling), only process that one junction record.
  const allPassengers = await findByBookingLegId(bookingLegId);
  const passengers = bookingLegPassengerId != null
    ? allPassengers.filter((p) => p.id === bookingLegPassengerId)
    : allPassengers;

  // Load the flight's current legs
  const currentLegs = await flightLegRepository.findByFlightId(flightId);

  // ── Validation warnings (collected, not blocking) ──────────────────────────
  const warnings: string[] = [];

  // If no booking_leg_passengers junction records found for this booking leg,
  // assign the booking leg to the flight anyway (will appear as zero pax).
  // Junction records must be created explicitly during booking creation —
  // auto-creating them here would assign all booking passengers to every leg,
  // violating per-passenger, per-leg planning.
  if (passengers.length === 0) {
    return withTransaction(async (tx) => {
      if (scheduleId) {
        await tx.schedules.updateMany({
          where: { id: scheduleId, status: "cancelled" },
          data: { status: "building" },
        });
      }

      warnings.push("No passenger junction records found for this booking leg — assigned to flight without passenger records");
      await tx.booking_legs.update({
        where: { id: bookingLegId },
        data: { flight_id: flightId },
      });
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
      await tx.schedules.updateMany({
        where: { id: scheduleId, status: "cancelled" },
        data: { status: "building" },
      });
    }

    if (currentLegs.length === 0) {
      // No existing legs — just assign all passengers to the flight.
      // Since there are no legs yet, we cannot assign to a specific flight_leg_id.
      // The loader uses booking_legs.origin_code/destination_code for stop manifests,
      // so flight_leg_id can remain NULL until legs are created.
      for (const passenger of passengers) {
        await tx.$executeRawUnsafe(
          `UPDATE booking_leg_passengers SET flight_leg_id = NULL WHERE id = $1`,
          passenger.id
        );
      }
      // Also update booking_leg for backward compatibility
      await tx.booking_legs.update({
        where: { id: bookingLegId },
        data: { flight_id: flightId },
      });
      // Re-query the updated passenger manifests so the client can update state
      const updatedManifestsRows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT blp.id, blp.booking_leg_id,
                CONCAT(bp.first_name, ' ', bp.last_name) AS passenger_name,
                blp.clothed_weight_kg AS body_weight_kg,
                blp.baggage_weight_kg, blp.freight_weight_kg,
                bl.origin_code, bl.destination_code
         FROM booking_leg_passengers blp
         JOIN booking_legs bl ON bl.id = blp.booking_leg_id
         JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
         WHERE blp.flight_leg_id IS NOT NULL
           AND blp.flight_leg_id IN (SELECT id FROM flight_legs WHERE flight_id = $1)
         ORDER BY blp.id`,
        flightId
      );
      const updatedManifests = (updatedManifestsRows as Array<{
        id: number; booking_leg_id: number; passenger_name: string;
        body_weight_kg: number; baggage_weight_kg: number; freight_weight_kg: number;
        origin_code: string; destination_code: string;
      }>).map((r) => ({
        id: Number(r.id),
        booking_leg_id: Number(r.booking_leg_id),
        passenger_name: r.passenger_name,
        body_weight_kg: Number(r.body_weight_kg),
        baggage_weight_kg: Number(r.baggage_weight_kg),
        freight_weight_kg: r.freight_weight_kg != null ? Number(r.freight_weight_kg) : 0,
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
      // ── Matching leg exists — assign passengers directly ─────────────────
      for (const passenger of passengers) {
        await assignToFlightLeg(passenger.id, matchingLeg.id, tx);
      }
      await tx.booking_legs.update({
        where: { id: bookingLegId },
        data: { flight_id: flightId },
      });
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

        // Re-map existing passengers to new flight legs (their flight_leg_id references
        // point to deleted legs after replaceFlightLegs).
        await tx.$executeRawUnsafe(
          `UPDATE booking_leg_passengers blp
           SET flight_leg_id = (
             SELECT fl.id FROM flight_legs fl
             WHERE fl.flight_id = $1
             AND fl.origin_code = bl.origin_code
             ORDER BY fl.leg_number ASC
             LIMIT 1
           ), updated_at = NOW()
           FROM booking_legs bl
           WHERE blp.booking_leg_id = bl.id
           AND blp.flight_leg_id IS NOT NULL
           AND blp.flight_leg_id IN (SELECT id FROM flight_legs WHERE flight_id = $1)
           AND blp.flight_leg_id IS NOT NULL`,
          flightId,
        );
      }

      // Assign this passenger to the matching or origin-matching leg.
      // Use existing legs (already_on_route case) or new legs (just replaced).
      const activeLegs = ((result.inserted && result.legs)
        ? newFlightLegs
        : currentLegs) ?? [];
      const matchingLeg = activeLegs.find(
        (leg) => leg.origin_code === bookingLeg.origin_code && leg.destination_code === bookingLeg.destination_code
      );

      if (matchingLeg) {
        for (const passenger of passengers) {
          await assignToFlightLeg(passenger.id, matchingLeg.id, tx);
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
            await tx.$executeRawUnsafe(
              `UPDATE booking_leg_passengers SET flight_leg_id = NULL WHERE id = $1`,
              passenger.id
            );
          }
        }
      }
      await tx.booking_legs.update({
        where: { id: bookingLegId },
        data: { flight_id: flightId },
      });
    }

    // After assignment, re-query the updated flight legs and passenger manifests
    // so the client can update its local state immediately without a refresh.
    const updatedLegsRows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT fl.id, fl.flight_id, fl.leg_number AS leg_sequence, fl.etd AS departure_time, fl.eta AS arrival_time, fl.status,
              fl.origin_code, fl.destination_code, fl.distance_nm, fl.heading
       FROM flight_legs fl
       WHERE fl.flight_id = $1
       ORDER BY fl.leg_number`,
      flightId
    );
    const updatedLegs = (updatedLegsRows as Array<{
      id: number; flight_id: number; leg_sequence: number;
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
    const updatedManifestsRows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT blp.id, blp.booking_leg_id,
              CONCAT(bp.first_name, ' ', bp.last_name) AS passenger_name,
              blp.clothed_weight_kg AS body_weight_kg,
              blp.baggage_weight_kg, blp.freight_weight_kg,
              bl.origin_code, bl.destination_code
       FROM booking_leg_passengers blp
       JOIN booking_legs bl ON bl.id = blp.booking_leg_id
       JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
       WHERE blp.flight_leg_id IS NOT NULL
         AND blp.flight_leg_id IN (SELECT id FROM flight_legs WHERE flight_id = $1)
       ORDER BY blp.id`,
      flightId
    );
    const updatedManifests = (updatedManifestsRows as Array<{
      id: number; booking_leg_id: number; passenger_name: string;
      body_weight_kg: number; baggage_weight_kg: number; freight_weight_kg: number;
      origin_code: string; destination_code: string;
    }>).map((r) => ({
      id: Number(r.id),
      booking_leg_id: Number(r.booking_leg_id),
      passenger_name: r.passenger_name,
      body_weight_kg: Number(r.body_weight_kg),
      baggage_weight_kg: Number(r.baggage_weight_kg),
      freight_weight_kg: r.freight_weight_kg != null ? Number(r.freight_weight_kg) : 0,
      origin_code: r.origin_code,
      destination_code: r.destination_code,
    }));

    // Invalidate any existing loadsheet so it gets regenerated on next visit
    await tx.loadsheets.deleteMany({ where: { flight_id: flightId } });

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
    // Check if a schedule already exists for this date
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
    if (schedule.status === "cancelled") {
      await scheduleRepository.updateStatus(schedule.id, ScheduleStatus.BUILDING);
      schedule = { ...schedule, status: ScheduleStatus.BUILDING };
    }
  }

  const bookingLegs = await db.booking_legs.findMany({
    where: { id: { in: bookingLegIds } },
    include: {
      origin: { select: { id: true, code: true } },
      destination: { select: { id: true, code: true } },
    },
    orderBy: { id: "asc" },
  });
  if (bookingLegs.length === 0) {
    return { error: "No booking legs found" };
  }

  const originId = bookingLegs[0].origin.id;

  // Find STY (Stanley) aerodrome ID
  const styAerodrome = await db.aerodromes.findFirst({
    where: { code: "STY" },
    select: { id: true },
  });
  const styId = styAerodrome?.id ?? originId; // Fallback to origin if STY not found

  return withTransaction(async (tx) => {
    // Generate flight number by finding the highest existing number with
    // today's prefix (e.g. FIG0306) and incrementing. This is more robust
    // than COUNT(*) because it handles pre-existing flights and deleted rows.
    // Use the schedule's date for flight number prefix, not current time.
    const scheduleDate = schedule?.schedule_date
      ? new Date(schedule.schedule_date)
      : bookingLegs[0].leg_date
        ? new Date(bookingLegs[0].leg_date)
        : new Date();
    const flightNumber = await generateFlightNumber(scheduleDate, tx);

    // Compute base departure time: 08:30 on the schedule date
    const baseDate = new Date(scheduleDate);
    baseDate.setUTCHours(8, 30, 0, 0);

    // Create flight with STY → origin → destination → STY route
    const flightResult = await tx.flights.create({
      data: {
        schedule_id: effectiveScheduleId,
        flight_number: flightNumber,
        origin_aerodrome_id: styId,
        destination_aerodrome_id: styId,
        departure_time: baseDate,
        arrival_time: baseDate,
        status: "scheduled",
        sort_order: (await tx.flights.count({ where: { schedule_id: effectiveScheduleId } })),
        created_by: 1,
      },
      select: { id: true },
    });
    const flightId = flightResult.id;

    // Compute per-leg ETD/ETA starting from baseDate.
    // Each leg: ETA = ETD + 30 min (placeholder), next ETD = prev ETA + 10 min turnaround.
    let currentTime = new Date(baseDate);

    // Create flight legs: STY → origin → destination → STY
    // Skip the initial STY→origin leg if origin is already STY (avoids duplicate STY→STY).
    // Skip the final destination→STY leg if destination is already STY.
    const firstOrigin = bookingLegs[0].origin.code;
    const legRoutes: Array<{ origin_code: string; destination_code: string }> = [];
    if (firstOrigin !== "STY") {
      legRoutes.push({ origin_code: "STY", destination_code: firstOrigin });
    }
    for (let i = 0; i < bookingLegs.length; i++) {
      const leg = bookingLegs[i];
      legRoutes.push({ origin_code: leg.origin.code, destination_code: leg.destination.code });
    }
    const lastDest = bookingLegs[bookingLegs.length - 1].destination.code;
    if (lastDest !== "STY") {
      legRoutes.push({ origin_code: lastDest, destination_code: "STY" });
    }

    for (let i = 0; i < legRoutes.length; i++) {
      const route = legRoutes[i];
      const etd = new Date(currentTime);
      const eta = new Date(currentTime);
      eta.setMinutes(eta.getMinutes() + 30); // placeholder 30 min leg
      await tx.flight_legs.create({
        data: {
          flight_id: flightId,
          leg_number: i + 1,
          origin_code: route.origin_code,
          destination_code: route.destination_code,
          etd,
          eta,
          status: "scheduled",
        },
      });
      currentTime = new Date(eta);
      currentTime.setMinutes(currentTime.getMinutes() + 10); // 10 min turnaround
    }

    // Assign all booking legs to the flight
    for (const blId of bookingLegIds) {
      await tx.booking_legs.update({
        where: { id: blId },
        data: { flight_id: flightId },
      });
    }

    // Compute and persist flight duration + check-in time
    const totalDistanceNm = legRoutes.length > 0 ? legRoutes.length * 30 * (140 / 60) : 0;
    const durationMinutes = Math.round((totalDistanceNm / 140) * 60);
    await tx.$executeRawUnsafe(
      `UPDATE flights SET duration_minutes = $1, check_in_time = $2::time WHERE id = $3`,
      durationMinutes,
      "08:30",
      flightId
    );

    // Set flight_leg_id on each specific passenger's junction record so they
    // disappear from the unassigned pool (findUnassignedByDate filters by
    // blp.flight_leg_id IS NULL).  Match each passenger's booking leg
    // origin/destination to the newly created flight legs.
    if (options?.bookingLegPassengerIds?.length) {
      const passengerRows = await tx.booking_leg_passengers.findMany({
        where: { id: { in: options.bookingLegPassengerIds } },
        select: { id: true, booking_leg_id: true },
      });
      const blIds = [...new Set(passengerRows.map((p) => p.booking_leg_id))];
      const blData = await tx.booking_legs.findMany({
        where: { id: { in: blIds } },
        select: { id: true, origin_code: true, destination_code: true },
      });
      const blMap = new Map(blData.map((b) => [b.id, b]));
      // Fetch the actual flight leg IDs (not indices) for matching
      const flRows = await tx.flight_legs.findMany({
        where: { flight_id: flightId },
        select: { id: true, leg_number: true, origin_code: true, destination_code: true },
        orderBy: { leg_number: "asc" },
      });
      for (const p of passengerRows) {
        const bl = blMap.get(p.booking_leg_id);
        if (!bl) continue;
        const matchingFl = flRows.find(
          (fl) => fl.origin_code === bl.origin_code && fl.destination_code === bl.destination_code
        );
        if (matchingFl) {
          await assignToFlightLeg(p.id, matchingFl.id, tx);
        } else {
          // No direct leg — find first origin-matching leg for indirect routes
          const originLeg = flRows.find((fl) => fl.origin_code === bl.origin_code);
          if (originLeg) {
            await assignToFlightLeg(p.id, originLeg.id, tx);
          }
        }
      }
    }

    // Query the full flight row with aerodrome codes, aircraft, and pilot info
    // so the client can add it to the flights state immediately.
    // Uses tx.$queryRawUnsafe so the query can see uncommitted writes within the transaction.
    const flightRows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT f.id, f.flight_number, f.departure_time, f.arrival_time, f.status,
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
       WHERE f.id = $1`,
      flightId
    );
    const flightSummary = flightRows[0] ?? null;

    // Query the flight legs for this flight
    const flightLegRows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT fl.id, fl.flight_id, fl.leg_number AS leg_sequence, fl.etd AS departure_time, fl.eta AS arrival_time, fl.status,
              fl.origin_code, fl.destination_code, fl.distance_nm, fl.heading
       FROM flight_legs fl
       WHERE fl.flight_id = $1
       ORDER BY fl.leg_number`,
      flightId
    );

    // Query passenger manifests for this flight.
    // When per-passenger scheduling is active (bookingLegPassengerIds provided),
    // only include the specific passenger(s) being dragged — not all passengers
    // on the booking leg.
    const passengerIdFilter = options?.bookingLegPassengerIds?.length
      ? `AND blp.id = ANY($2::int[])`
      : ``;
    const passengerIdParam = options?.bookingLegPassengerIds?.length
      ? options.bookingLegPassengerIds
      : [];
    const manifestRows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT blp.id, blp.booking_leg_id,
              CONCAT(bp.first_name, ' ', bp.last_name) AS passenger_name,
              blp.clothed_weight_kg AS body_weight_kg,
              blp.baggage_weight_kg, blp.freight_weight_kg,
              bl.origin_code, bl.destination_code
       FROM booking_leg_passengers blp
       JOIN booking_legs bl ON bl.id = blp.booking_leg_id
       JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
       WHERE blp.flight_leg_id IS NOT NULL
         AND blp.flight_leg_id IN (SELECT id FROM flight_legs WHERE flight_id = $1) ${passengerIdFilter}
       ORDER BY blp.id`,
      flightId, ...(passengerIdParam.length ? [passengerIdParam] : [])
    );

    return {
      success: true,
      flightId,
      scheduleId: effectiveScheduleId,
      flight: flightSummary,
      flightLegs: flightLegRows,
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

  if (schedule.status !== ScheduleStatus.BUILDING && schedule.status !== "draft") {
    return { error: "Can only reset building or draft schedules", status: 400 };
  }

  return withTransaction(async (tx) => {
    // Get all flights for this schedule
    const flights = await tx.flights.findMany({
      where: { schedule_id: scheduleId },
      select: { id: true },
    });
    const flightIds = flights.map((f) => f.id);

    if (flightIds.length > 0) {
      // Delete loadsheets before flights (FK RESTRICT constraint)
      await tx.loadsheets.deleteMany({ where: { flight_id: { in: flightIds } } });
      const idList = flightIds.join(",");

      // Clear passenger assignments
      await tx.$executeRawUnsafe(
        `UPDATE booking_leg_passengers SET flight_leg_id = NULL WHERE flight_leg_id IN (SELECT id FROM flight_legs WHERE flight_id IN (${idList}))`,
      );

      // Delete flight legs
      await tx.$executeRawUnsafe(
        `DELETE FROM flight_legs WHERE flight_id IN (${idList})`,
      );

      // Clear booking_leg flight assignments
      await tx.$executeRawUnsafe(
        `UPDATE booking_legs SET flight_id = NULL WHERE flight_id IN (${idList})`,
      );

      // Delete flights
      await tx.flights.deleteMany({
        where: { schedule_id: scheduleId },
      });
    }

    // Reset schedule status to building
    await tx.schedules.update({
      where: { id: scheduleId },
      data: { status: ScheduleStatus.BUILDING },
    });

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
    const blp = await db.booking_leg_passengers.findUnique({
      where: { id: bookingLegPassengerId },
      select: { booking_leg_id: true },
    });
    if (blp) effectiveLegId = blp.booking_leg_id;
  }

  // Get the flight_id before unassigning
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
  const flight = await db.flights.findUnique({
    where: { id: leg.flight_id },
    select: { id: true, schedule_id: true },
  });
  if (flight && flight.schedule_id !== null) {
    const schedule = await scheduleRepository.findById(flight.schedule_id);
    if (schedule && ![ScheduleStatus.BUILDING, "draft", "cancelled"].includes(schedule.status)) {
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
    const remainingOnLeg = await tx.booking_leg_passengers.count({
      where: { booking_leg_id: effectiveLegId, flight_leg_id: { not: null } },
    });
    if (remainingOnLeg === 0) {
      await tx.booking_legs.update({
        where: { id: effectiveLegId },
        data: { flight_id: null },
      });
    }

    // If the flight now has zero assigned passengers AND zero booking legs, delete the empty flight.
    let deletedFlightId: number | null = null;
    if (flightId) {
      // Count remaining passengers via per-passenger flight_leg_id assignment
      const paxRows = await tx.$queryRawUnsafe<Array<{cnt: number}>>(
        `SELECT COUNT(*)::int AS cnt
         FROM booking_leg_passengers blp
         JOIN flight_legs fl ON fl.id = blp.flight_leg_id
         WHERE fl.flight_id = $1`,
        flightId
      );
      // Also count booking legs still assigned to the flight
      const legRows = await tx.$queryRawUnsafe<Array<{cnt: number}>>(
        `SELECT COUNT(*)::int AS cnt FROM booking_legs WHERE flight_id = $1`,
        flightId
      );
      const remainingPaxCount = paxRows[0]?.cnt ?? 0;
      const remainingLegCount = legRows[0]?.cnt ?? 0;
      if (remainingPaxCount === 0 && remainingLegCount === 0) {
        // Delete the loadsheet first (foreign key to flight)
        await tx.loadsheets.deleteMany({ where: { flight_id: flightId } });
        // Delete directly via tx to avoid nested transaction in deleteFlight
        await tx.flights.delete({ where: { id: flightId } });
        deletedFlightId = flightId;
      } else {
        // Invalidate the loadsheet so it gets regenerated on next visit
        await tx.loadsheets.deleteMany({ where: { flight_id: flightId } });
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
  const blp = await db.booking_leg_passengers.findUnique({
    where: { id: bookingLegPassengerId },
    select: { id: true, booking_leg_id: true, booking_passenger_id: true, flight_leg_id: true },
  });
  if (!blp) return { error: "Passenger record not found", status: 404 };

  const bookingLeg = await bookingLegRepository.findById(blp.booking_leg_id);
  if (!bookingLeg) return { error: "Booking leg not found", status: 404 };
  if (!bookingLeg.flight_id) return { error: "Passenger is not assigned to any flight", status: 400 };
  if (bookingLeg.flight_id === targetFlightId) return { error: "Passenger is already on this flight", status: 400 };

  const sourceFlightId = bookingLeg.flight_id;

  return withTransaction(async (tx) => {
    // Step 1: Unassign this single passenger from source flight
    await tx.booking_leg_passengers.update({
      where: { id: bookingLegPassengerId },
      data: { flight_leg_id: null },
    });

    // If no more passengers on this booking leg, unassign the booking leg
    const remainingPassengers = await tx.booking_leg_passengers.count({
      where: { booking_leg_id: bookingLeg.id, flight_leg_id: { not: null } },
    });
    if (remainingPassengers === 0) {
      await tx.booking_legs.update({
        where: { id: bookingLeg.id },
        data: { flight_id: null },
      });
    }

    // Delete source flight if now empty
    const remainingLegs = await tx.booking_legs.count({ where: { flight_id: sourceFlightId } });
    let deletedFlightId: number | null = null;
    if (remainingLegs === 0) {
      await tx.loadsheets.deleteMany({ where: { flight_id: sourceFlightId } });
      await tx.flight_legs.deleteMany({ where: { flight_id: sourceFlightId } });
      await tx.pilot_assignments.deleteMany({ where: { flight_id: sourceFlightId } });
      await tx.flights.delete({ where: { id: sourceFlightId } });
      deletedFlightId = sourceFlightId;
    }

    // Step 2: Find or create matching booking leg on target flight
    let targetBookingLeg = await tx.booking_legs.findFirst({
      where: {
        flight_id: targetFlightId,
        origin_code: bookingLeg.origin_code,
        destination_code: bookingLeg.destination_code,
      },
    });

    if (!targetBookingLeg) {
      targetBookingLeg = await tx.booking_legs.create({
        data: {
          booking_id: bookingLeg.booking_id,
          flight_id: targetFlightId,
          origin_code: bookingLeg.origin_code,
          destination_code: bookingLeg.destination_code,
          leg_date: bookingLeg.leg_date,
          status: "confirmed",
        },
      });
    }

    // Move this passenger to the target booking leg
    await tx.booking_leg_passengers.update({
      where: { id: bookingLegPassengerId },
      data: { booking_leg_id: targetBookingLeg.id },
    });

    // Step 3: Route insertion on target flight
    const targetLegs = await tx.flight_legs.findMany({
      where: { flight_id: targetFlightId },
      orderBy: { leg_number: "asc" },
      select: { id: true, leg_number: true, origin_code: true, destination_code: true },
    });

    const routeLegs = targetLegs.map((l) => ({
      leg_sequence: l.leg_number,
      origin_code: l.origin_code ?? "",
      destination_code: l.destination_code ?? "",
    }));

    const { insertPassengerRoute } = await import("./scheduling/insert-passenger-route");
    const insertionResult = await insertPassengerRoute(routeLegs, bookingLeg.origin_code, bookingLeg.destination_code);

    if (insertionResult.inserted) {
      await tx.flight_legs.deleteMany({ where: { flight_id: targetFlightId } });
      for (const rl of insertionResult.legs) {
        await tx.flight_legs.create({
          data: { flight_id: targetFlightId, leg_number: rl.leg_sequence,
            origin_code: rl.origin_code, destination_code: rl.destination_code, status: "scheduled" },
        });
      }
    }

    // Link passenger to matching flight leg on target
    const updatedTargetLegs = await tx.flight_legs.findMany({
      where: { flight_id: targetFlightId },
      orderBy: { leg_number: "asc" },
      select: { id: true, origin_code: true, destination_code: true },
    });
    const passengerLeg = updatedTargetLegs.find(
      (l) => l.origin_code === bookingLeg.origin_code && l.destination_code === bookingLeg.destination_code
    );
    if (passengerLeg) {
      await tx.booking_leg_passengers.update({
        where: { id: bookingLegPassengerId },
        data: { flight_leg_id: passengerLeg.id },
      });
    }

    const updatedLegRows = await tx.flight_legs.findMany({
      where: { flight_id: targetFlightId },
      orderBy: { leg_number: "asc" },
    });

    const manifestRows = updatedLegRows.length > 0
      ? await tx.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT blp.id, blp.booking_leg_id, blp.flight_leg_id,
                  CONCAT(bp.first_name, ' ', bp.last_name) AS passenger_name,
                  COALESCE(blp.clothed_weight_kg, 70)::int AS body_weight_kg,
                  COALESCE(blp.baggage_weight_kg, 0)::int AS baggage_weight_kg,
                  COALESCE(blp.freight_weight_kg, 0)::int AS freight_weight_kg,
                  bl.origin_code, bl.destination_code
           FROM booking_leg_passengers blp
           JOIN booking_legs bl ON bl.id = blp.booking_leg_id
           JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
           WHERE blp.flight_leg_id IS NOT NULL
           AND blp.flight_leg_id IN (SELECT id FROM flight_legs WHERE flight_id = $1)
           ORDER BY blp.id`,
          targetFlightId
        )
      : [];

    // Invalidate both flights' loadsheets so they get regenerated on next visit
    await tx.loadsheets.deleteMany({ where: { flight_id: targetFlightId } });

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
  const flight = await db.flights.findUnique({
    where: { id: flightId },
    select: { id: true, status: true },
  });
  if (!flight) {
    return { error: "Flight not found", status: 404 };
  }

  return withTransaction(async (tx) => {
    // 1. Unassign all booking legs from this flight
    await tx.booking_legs.updateMany({
      where: { flight_id: flightId },
      data: { flight_id: null },
    });

    // 2. Clear flight_leg_id on all passengers assigned to this flight
    await tx.$executeRawUnsafe(
      `UPDATE booking_leg_passengers
       SET flight_leg_id = NULL
       WHERE flight_leg_id IN (SELECT id FROM flight_legs WHERE flight_id = $1)`,
      flightId
    );

    // 3. Delete flight legs
    await tx.flight_legs.deleteMany({
      where: { flight_id: flightId },
    });

    // 3b. Delete any associated loadsheet (prevents orphaned loadsheet records)
    await tx.loadsheets.deleteMany({ where: { flight_id: flightId } });

    // 4. Delete the flight
    await tx.flights.delete({
      where: { id: flightId },
    });

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
  const aircraft = await db.aircraft.findUnique({
    where: { id: aircraftId },
    select: { id: true, registration: true, type: true, is_active: true },
  });

  if (!aircraft) {
    return { error: `Aircraft with ID ${aircraftId} not found`, status: 404 };
  }

  if (!aircraft.is_active) {
    return { error: `Aircraft "${aircraft.registration}" is not active`, status: 400 };
  }

  // Validate the flight exists (include departure/arrival for time-overlap check)
  const flight = await db.flights.findUnique({
    where: { id: flightId },
    select: { id: true, flight_number: true, schedule_id: true, departure_time: true, arrival_time: true },
  });

  if (!flight) {
    return { error: `Flight with ID ${flightId} not found`, status: 404 };
  }

  // Validate the flight belongs to the correct schedule
  if (flight.schedule_id !== scheduleId) {
    return { error: `Flight ${flight.flight_number} does not belong to schedule ${scheduleId}`, status: 400 };
  }

  // Time-overlap conflict check: aircraft can be on multiple flights total,
  // but not simultaneously. Check if the proposed flight's departure→arrival
  // window overlaps with any other flight using this aircraft on the same schedule.
  const conflictingFlights = await db.flights.findMany({
    where: {
      aircraft_id: aircraftId,
      schedule_id: scheduleId,
      id: { not: flightId },
      departure_time: { lt: new Date(flight.arrival_time) },
      arrival_time: { gt: new Date(flight.departure_time) },
    },
    select: { flight_number: true, departure_time: true, arrival_time: true },
  });

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
  const updatedFlightRows = await db.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT f.id, f.flight_number, f.departure_time, f.arrival_time, f.status,
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
     WHERE f.id = $1`,
    flightId
  );
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
  const pilot = await db.pilots.findUnique({
    where: { id: pilotId },
    select: { id: true, name: true, is_active: true, rating: true, license_type: true, medical_expiry: true },
  });

  if (!pilot) {
    return { error: `Pilot with ID ${pilotId} not found`, status: 404 };
  }

  if (!pilot.is_active) {
    return { error: `Pilot "${pilot.name ?? pilot.id}" is not active`, status: 400 };
  }

  // Validate the flight exists (include departure/arrival for time-overlap check)
  const flight = await db.flights.findUnique({
    where: { id: flightId },
    select: { id: true, flight_number: true, aircraft_id: true, schedule_id: true, departure_time: true, arrival_time: true },
  });

  if (!flight) {
    return { error: `Flight with ID ${flightId} not found`, status: 404 };
  }

  // Validate the flight belongs to the correct schedule
  if (flight.schedule_id !== scheduleId) {
    return { error: `Flight ${flight.flight_number} does not belong to schedule ${scheduleId}`, status: 400 };
  }

  // Time-overlap conflict check: pilot can be on multiple flights total,
  // but not simultaneously. Check if the proposed flight's departure→arrival
  // window overlaps with any other confirmed/assigned flight for this pilot
  // on the same schedule.
  const schedule = await scheduleRepository.findById(scheduleId);
  if (schedule) {
    const existingAssignments = await db.pilot_assignments.findMany({
      where: {
        pilot_id: pilotId,
        schedule_id: scheduleId,
        status: { notIn: ["declined", "cancelled"] },
        flight_id: { not: flightId },
      },
      select: { flight_id: true },
    });

    if (existingAssignments.length > 0) {
      const assignedFlightIds = existingAssignments.map((a) => a.flight_id);
      const overlappingFlight = await db.flights.findFirst({
        where: {
          id: { in: assignedFlightIds },
          departure_time: { lt: new Date(flight.arrival_time) },
          arrival_time: { gt: new Date(flight.departure_time) },
        },
        select: { flight_number: true },
      });

      if (overlappingFlight) {
        const fmtTime = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        const conflictMsg = `Pilot ${pilot.name} conflicts with ${overlappingFlight.flight_number} ` +
          `(${fmtTime(new Date(flight.departure_time))}–${fmtTime(new Date(flight.arrival_time))}) ` +
          `on schedule ${scheduleId}`;
        console.warn(`[handleAssignPilot] BLOCKED: ${conflictMsg}`);
        return {
          error: `Pilot conflicts with flight ${overlappingFlight.flight_number} (` +
            `${fmtTime(new Date(flight.departure_time))}–${fmtTime(new Date(flight.arrival_time))}). ` +
            `Assign to a non-overlapping flight or unassign from the other flight first.`,
          status: 400,
        };
      }
    }
  }

  // Check pilot qualification (type rating) against the flight's aircraft
  if (flight.aircraft_id && pilot.rating) {
    const aircraft = await db.aircraft.findUnique({
      where: { id: flight.aircraft_id },
      select: { id: true, type: true, registration: true },
    });

    if (aircraft) {
      const normalizedAircraftType = aircraft.type.toLowerCase().replace(/[^a-z0-9]/g, "");
      const normalizedRating = pilot.rating.toLowerCase().replace(/[^a-z0-9]/g, "");
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
    const expiryDate = new Date(pilot.medical_expiry);
    const scheduleDate = new Date(schedule.schedule_date);
    if (expiryDate < scheduleDate) {
      return {
        error: `Pilot "${pilot.name ?? pilot.id}" medical certificate expired on ${pilot.medical_expiry.toISOString().split("T")[0]}`,
        status: 400,
      };
    }
  }

  // Update the flight's pilot_id
  await flightRepository.assignPilot(flightId, pilotId);

  // Check if a pilot_assignment already exists for this flight
  const existingAssignments = await pilotAssignmentRepository.findByFlightId(flightId);
  const captainAssignment = existingAssignments.find((a) => a.role === "captain");

  if (captainAssignment) {
    // Update existing assignment
    await db.pilot_assignments.update({
      where: { id: captainAssignment.id },
      data: {
        pilot_id: pilotId,
        assigned_by: assignedBy,
        status: "assigned",
      },
    });
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
  const updatedFlightRows = await db.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT f.id, f.flight_number, f.departure_time, f.arrival_time, f.status,
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
     WHERE f.id = $1`,
    flightId
  );
  const updatedFlight = updatedFlightRows[0] != null
    ? Object.fromEntries(
        Object.entries(updatedFlightRows[0]).map(([k, v]) => [k, typeof v === "bigint" ? Number(v) : v])
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
      return handleReorderFlights(scheduleId, flightIds);
    }

    case "create-flight":
    case "add-flight": {
      const scheduleId = Number(formData.get("scheduleId"));
      const originAerodromeId = Number(formData.get("originAerodromeId"));
      const destinationAerodromeId = Number(formData.get("destinationAerodromeId"));
      const aircraftId = formData.get("aircraftId") ? Number(formData.get("aircraftId")) : null;
      return handleCreateFlight(
        scheduleId,
        originAerodromeId,
        destinationAerodromeId,
        aircraftId,
        userId
      );
    }

    case "assign-booking": {
      const bookingLegId = Number(formData.get("bookingLegId"));
      const flightId = Number(formData.get("flightId"));
      const bookingLegPassengerId = formData.get("bookingLegPassengerId") ? Number(formData.get("bookingLegPassengerId")) : undefined;
      return handleAssignBooking(bookingLegId, flightId, bookingLegPassengerId);
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
      const bookingLegId = Number(formData.get("bookingLegId"));
      const bookingLegPassengerId = formData.get("bookingLegPassengerId") ? Number(formData.get("bookingLegPassengerId")) : undefined;
      return handleUnassignBooking(bookingLegId, bookingLegPassengerId);
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
