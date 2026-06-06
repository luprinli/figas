import type { ScheduleBuildResult, ClusterResult, RouteResult, WeightBalanceResult } from "./types";
import type { FlightRow } from "../repositories/flight";
import { flightRepository } from "../repositories/flight";
import { bookingLegRepository } from "../repositories/booking-leg";
import { scheduleRepository } from "../repositories/schedule";
import { flightLegRepository } from "../repositories/flight-leg";
import { weightBalanceRepository } from "../repositories/weight-balance";
import { pilotAssignmentRepository } from "../repositories/pilot-assignment";
import { aircraftRepository } from "../repositories/aircraft";
import { clusterBookings } from "./cluster-bookings";
import { buildRoute } from "./nearest-neighbor";
import { assignAircraftToRoutes } from "./assign-aircraft";
import { computeWeightBalanceForRoute } from "./weight-balance";
import { assignPilotsToRoutes } from "./assign-pilots";
import { BookingStatus } from "../constants";
import { isNoFlyDay } from "../services/no-fly.service";
import { db } from "../db.server";

/**
 * Main orchestrator: Build a complete schedule for a given date.
 *
 * Runs all 5 phases:
 * 1. Cluster unassigned booking legs by date/origin/destination
 * 2. Build optimal routes using nearest-neighbor heuristic
 * 3. Assign aircraft based on capacity
 * 4. Compute weight and balance per leg
 * 5. Assign pilots based on qualifications and availability
 *
 * Creates the schedule record and all associated flight_legs,
 * weight_balance_snapshots, and pilot_assignments.
 *
 * @param date - The schedule date in YYYY-MM-DD format.
 * @param createdBy - The user ID of the person triggering the build (used for audit fields).
 */
export async function buildSchedule(date: string, createdBy: number): Promise<ScheduleBuildResult> {
  return await db.$transaction(async (tx) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // ── No-Fly Check (Task 10) ───────────────────────────────────────────────
    const noFly = await isNoFlyDay(date);
    if (noFly) {
      return {
        scheduleId: 0,
        scheduleDate: date,
        clusters: [],
        routes: [],
        aircraftAssignments: [],
        weightBalances: [],
        pilotAssignments: [],
        errors: [`Cannot build schedule for ${date}: it is a no-fly day`],
        warnings: [],
      };
    }

    // ── Phase 1: Cluster ──────────────────────────────────────────────────────
    const clusters = await clusterBookingsByDate(date);

    if (clusters.length === 0) {
      return {
        scheduleId: 0,
        scheduleDate: date,
        clusters: [],
        routes: [],
        aircraftAssignments: [],
        weightBalances: [],
        pilotAssignments: [],
        errors: ["No unassigned booking legs found for this date"],
        warnings: [],
      };
    }

    // ── Create schedule record ────────────────────────────────────────────────
    const schedule = await scheduleRepository.create({
      schedule_date: date,
      created_by: createdBy,
      notes: `Auto-generated schedule for ${date}`,
    });

    // ── Phase 2: Route Construction ──────────────────────────────────────────
    const routes: RouteResult[] = [];
    const routePassengerCounts = new Map<number, number>();

    for (const cluster of clusters) {
      // Create a flight for this cluster (aircraft_id will be updated in Phase 3)
      const flight = await createFlightForCluster(cluster, schedule.id);

      // Build the route
      const route = await buildRoute(cluster, flight);
      routes.push(route);
      routePassengerCounts.set(flight.id, cluster.passengerCount);

      // Create flight_legs from route stops
      await createFlightLegs(route, cluster);

      // Assign booking legs to this flight
      for (const leg of cluster.legs) {
        await bookingLegRepository.assignFlight(leg.id, flight.id);
        await bookingLegRepository.updateStatus(leg.id, BookingStatus.FLIGHT_ASSIGNED);
      }
    }

    // ── Phase 3: Aircraft Assignment ──────────────────────────────────────────
    const aircraftAssignments = await assignAircraftToRoutes(routes, routePassengerCounts);

    // Update flights with assigned aircraft
    for (const assignment of aircraftAssignments) {
      await flightRepository.updateWeights(assignment.route.flight.id, {
        total_fuel_weight_kg: 0, // will be updated in Phase 4
      });

      // Update the aircraft_id on the flight record using the transaction client
      await tx.$executeRawUnsafe(
        "UPDATE flights SET aircraft_id = $1, updated_at = NOW() WHERE id = $2",
        assignment.aircraft.id,
        assignment.route.flight.id
      );
    }

    // ── Phase 4: Weight & Balance ─────────────────────────────────────────────
    const weightBalances: WeightBalanceResult[] = [];

    for (const assignment of aircraftAssignments) {
      // Get legs for this flight
      const legs = await flightLegRepository.findByFlightId(assignment.route.flight.id);

      // Build leg distance map from route stops
      const legDistances = new Map<number, number>();
      for (const stop of assignment.route.stops) {
        // Find the matching flight leg by sequence
        const matchingLeg = legs.find((l) => l.leg_sequence === stop.legSequence);
        if (matchingLeg) {
          legDistances.set(matchingLeg.id, stop.distanceNm);
        }
      }

      const wbResults = await computeWeightBalanceForRoute(assignment, legs, legDistances);
      weightBalances.push(...wbResults);

      // Save weight_balance_snapshots with computed_by
      for (const wb of wbResults) {
        await weightBalanceRepository.create({
          flight_leg_id: wb.flightLegId,
          schedule_id: schedule.id,
          passenger_weight_kg: wb.passengerWeightKg,
          baggage_weight_kg: wb.baggageWeightKg,
          freight_weight_kg: wb.freightWeightKg,
          fuel_weight_kg: wb.fuelWeightKg,
          crew_weight_kg: wb.crewWeightKg,
          empty_weight_kg: wb.emptyWeightKg,
          total_weight_kg: wb.totalWeightKg,
          total_moment_kgm: wb.totalMomentKgm,
          cg_position_pct: wb.cgPositionPct,
          effective_mtow_kg: wb.effectiveMtowKg,
          effective_mlw_kg: wb.effectiveMlwKg,
          mtow_used_pct: wb.mtowUsedPct,
          mlw_used_pct: wb.mlwUsedPct,
          required_fuel_kg: wb.fuelPlan.requiredFuelKg,
          minimum_fuel_kg: wb.fuelPlan.minimumFuelKg,
          fuel_state: wb.fuelPlan.fuelState,
          binding_constraint: wb.bindingConstraint.constraint,
          binding_constraint_detail: wb.bindingConstraint.detail,
          computed_by: String(createdBy),
        });
      }
    }

    // ── Phase 5: Pilot Assignment ─────────────────────────────────────────────
    const pilotResult = await assignPilotsToRoutes(aircraftAssignments, date);
    errors.push(...pilotResult.errors);

    // Save pilot assignments
    for (const pa of pilotResult.pilotAssignments) {
      await pilotAssignmentRepository.create({
        schedule_id: schedule.id,
        flight_id: pa.flightId,
        pilot_id: pa.pilotId,
        role: pa.role,
      });
    }

    // Collect warnings for infeasible assignments
    for (const assignment of aircraftAssignments) {
      if (!assignment.feasible && assignment.infeasibilityReason) {
        warnings.push(
          `Flight ${assignment.route.flight.flight_number}: ${assignment.infeasibilityReason}`
        );
      }
    }

    return {
      scheduleId: schedule.id,
      scheduleDate: date,
      clusters,
      routes,
      aircraftAssignments,
      weightBalances,
      pilotAssignments: pilotResult.pilotAssignments,
      errors,
      warnings,
    };
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Get clusters filtered to a specific date.
 */
async function clusterBookingsByDate(date: string): Promise<ClusterResult[]> {
  const allClusters = await clusterBookings();
  return allClusters.filter((c) => c.date === date);
}

/**
 * Create a flight record for a cluster.
 * Uses the cluster's origin as the departure aerodrome (not hardcoded "PSY").
 */
async function createFlightForCluster(
  cluster: ClusterResult,
  scheduleId: number
): Promise<FlightRow> {
  // Get aerodrome IDs from codes
  const originResult = await db.query(
    "SELECT id FROM aerodromes WHERE code = $1",
    [cluster.origin]
  );
  const destResult = await db.query(
    "SELECT id FROM aerodromes WHERE code = $1",
    [cluster.destination]
  );

  const originId = (originResult.rows[0] as { id: number })?.id;
  const destId = (destResult.rows[0] as { id: number })?.id;

  if (!originId || !destId) {
    throw new Error(
      `Could not resolve aerodrome IDs for ${cluster.origin} or ${cluster.destination}`
    );
  }

  // Generate flight number: e.g., "FIG-20260601-001"
  const flightNumResult = await db.query(
    `SELECT COUNT(*)::int AS cnt FROM flights WHERE created_at >= CURRENT_DATE`
  );
  const count = Number(flightNumResult.rows[0]?.cnt ?? 0);
  const flightNumber = `FIG-${cluster.date.replace(/-/g, "")}-${String(count + 1).padStart(3, "0")}`;

  // Select the best available aircraft (will be refined in Phase 3)
  // Use the first active aircraft as a temporary assignment; Phase 3 will
  // evaluate all aircraft and pick the best fit
  const aircraftList = await aircraftRepository.findAll();
  const defaultAircraftId = aircraftList.length > 0 ? aircraftList[0].id : 1;

  const result = await db.query(
    `INSERT INTO flights (
      flight_number, aircraft_id, origin_aerodrome_id, destination_aerodrome_id,
      departure_time, arrival_time, status, schedule_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      flightNumber,
      defaultAircraftId, // temporary; updated in Phase 3 with best-fit aircraft
      originId,
      destId,
      `${cluster.date}T10:00:00Z`, // default departure
      `${cluster.date}T12:00:00Z`, // default arrival
      "scheduled",
      scheduleId,
    ]
  );

  return result.rows[0] as unknown as FlightRow;
}

/**
 * Create flight_legs from route stops.
 * Uses the cluster's origin (not hardcoded "PSY") for the first leg's origin.
 */
async function createFlightLegs(
  route: RouteResult,
  cluster: ClusterResult
): Promise<void> {
  for (let i = 0; i < route.stops.length; i++) {
    const stop = route.stops[i];
    // Use the cluster's origin for the first leg, otherwise use the previous stop
    const prevCode = i === 0 ? cluster.origin : route.stops[i - 1].aerodromeCode;

    await flightLegRepository.create({
      flight_id: route.flight.id,
      leg_sequence: stop.legSequence,
      origin_code: prevCode,
      destination_code: stop.aerodromeCode,
      distance_nm: stop.distanceNm,
      heading: stop.heading,
    });
  }
}
