import type { ScheduleBuildResult, ClusterResult, RouteResult, WeightBalanceResult } from "./types";
import type { FlightRow } from "../repositories/flight";
import { flightRepository } from "../repositories/flight";
import { bookingLegRepository } from "../repositories/booking-leg";
import { flightLegRepository } from "../repositories/flight-leg";
import { generateAutoBuildFlightNumber } from "../flight-number.server";
import { weightBalanceRepository } from "../repositories/weight-balance";
import { pilotAssignmentRepository } from "../repositories/pilot-assignment";
import { aircraftRepository } from "../repositories/aircraft";
import { clusterBookings } from "./cluster-bookings";
import { assignAircraftToRoutes } from "./assign-aircraft";
import { computeFlightDuration } from "../check-in-time.server";
import { computeWeightBalanceForRoute } from "./weight-balance";
import { assignPilotsToRoutes } from "./assign-pilots";
import { BookingStatus } from "../constants";
import { isNoFlyDay } from "../services/no-fly.service";
import { db } from "../db.server";
import { solveCvrp } from "./cvrp-solver";
import { validateCvrpRoutes, filterFeasibleRoutes } from "./cvrp-validator";
import type { ValidationAircraft } from "./flight-validation";
import { loadDistances, loadHeadings, getDistance, getHeading } from "./distance-lookup";
import type { PassengerDemand } from "./cvrp-types";

/**
 * Main orchestrator: Build a complete schedule for a given date.
 *
 * Runs all 5 phases:
 * 1. Cluster unassigned booking legs by date/origin/destination
 * 2. Build optimal routes using CVRP Clarke-Wright savings algorithm
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

    // ── Create or reuse schedule record ───────────────────────────────────────
    const existing = await db.query(
      `SELECT id FROM schedules WHERE schedule_date = $1::date ORDER BY created_at DESC LIMIT 1`,
      [date]
    );
    let scheduleId: number;
    if (existing.rows.length > 0) {
      scheduleId = (existing.rows[0] as { id: number }).id;
      await db.$executeRawUnsafe(
        `UPDATE schedules SET status = 'building', updated_at = NOW() WHERE id = $1`,
        scheduleId
      );
    } else {
      const newSchedule = await db.query(
        `INSERT INTO schedules (schedule_date, created_by, notes, status) VALUES ($1, $2, $3, 'building') RETURNING id`,
        [date, createdBy, `Auto-generated schedule for ${date}`]
      );
      scheduleId = (newSchedule.rows[0] as { id: number }).id;
    }
    const schedule = { id: scheduleId };

    // ── Phase 2: CVRP Route Construction ────────────────────────────────────
    const routes: RouteResult[] = [];
    const routePassengerCounts = new Map<number, number>();

    // Convert clusters to passenger demands
    const demands: PassengerDemand[] = [];
    const clusterLegMap = new Map<number, number[]>(); // cluster leg index → leg ids
    for (let ci = 0; ci < clusters.length; ci++) {
      const cluster = clusters[ci];
      demands.push({
        bookingLegId: ci, // use cluster index as identifier
        origin: cluster.origin,
        destination: cluster.destination,
        passengerCount: cluster.passengerCount,
      });
      clusterLegMap.set(ci, cluster.legs.map((l) => l.id));
    }

    // Build distance matrix
    const distRows = await loadDistances();
    const headingRows = await loadHeadings();
    const distanceMatrix = new Map<string, number>();
    for (const d of distRows) {
      distanceMatrix.set(`${d.origin}->${d.destination}`, d.distance_nm);
    }

    // Get aircraft capacities for constraints
    const allAircraft = await aircraftRepository.findAll();
    const maxSeats = allAircraft.reduce((max, a) => Math.max(max, a.seat_count), 9);
    // The aircraft table has no per-airframe range column; use the BN-2 fleet default (nm).
    const maxRange = allAircraft.reduce((max) => Math.max(max, 800), 800);

    // Solve CVRP
    const cvrpResult = solveCvrp(demands, {
      depot: "STY",
      maxSeats,
      maxRangeNm: maxRange,
      distanceMatrix,
    });

    // Validate CVRP routes against flight constraints (MTOW, MLW, fuel, range)
    const bestAircraft = allAircraft.length > 0 ? allAircraft[0] : null;
    const validationAircraft: ValidationAircraft = {
      type: bestAircraft?.type ?? "BN-2",
      registration: bestAircraft?.registration ?? "UNKNOWN",
      seat_count: bestAircraft?.seat_count ?? 9,
      max_takeoff_weight_kg: bestAircraft?.max_takeoff_weight_kg ?? 2994,
      max_landing_weight_kg: bestAircraft?.max_landing_weight_kg ?? 2994,
      empty_weight_kg: bestAircraft?.empty_weight_kg ?? 1627,
      fuel_capacity_kg: bestAircraft?.fuel_capacity_kg ?? 280,
      fuel_burn_rate_kg_per_hour: bestAircraft?.fuel_flow_kg_per_hour ?? 25,
      cruise_speed_kt: bestAircraft?.cruise_speed_ktas ?? 140,
      max_range_nm: maxRange,
    };

    const validationResults = await validateCvrpRoutes(cvrpResult.routes, demands, {
      aircraft: validationAircraft,
      averagePassengerWeightKg: 86,
    });

    const feasibleRoutes = filterFeasibleRoutes(validationResults);

    for (const vr of validationResults) {
      if (vr.errors.length > 0) {
        errors.push(...vr.errors);
      }
      if (vr.warnings.length > 0) {
        warnings.push(...vr.warnings);
      }
    }

    if (feasibleRoutes.length === 0 && cvrpResult.routes.length > 0) {
      errors.push("All CVRP routes failed flight validation — no viable flights");
      return { scheduleId, scheduleDate: date, clusters, routes: [], aircraftAssignments: [], weightBalances: [], pilotAssignments: [], errors, warnings };
    }

    // Create flights from validated CVRP routes
    for (const cvrpRoute of feasibleRoutes) {
      const flightNumber = await generateAutoBuildFlightNumber(date);
      const originCode = cvrpRoute.stops[0] ?? "STY";
      const destCode = cvrpRoute.stops[cvrpRoute.stops.length - 1] ?? "STY";

      // Get aerodrome IDs
      const originResult = await db.query(
        "SELECT id FROM aerodromes WHERE code = $1", [originCode]
      );
      const destResult = await db.query(
        "SELECT id FROM aerodromes WHERE code = $1", [destCode]
      );
      const originId = (originResult.rows[0] as { id: number })?.id ?? 0;
      const destId = (destResult.rows[0] as { id: number })?.id ?? 0;

      const defaultAircraftId = allAircraft.length > 0 ? allAircraft[0].id : 1;

      const flightResult = await db.query(
        `INSERT INTO flights (
          flight_number, aircraft_id, origin_aerodrome_id, destination_aerodrome_id,
          departure_time, arrival_time, status, schedule_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          flightNumber, defaultAircraftId, originId, destId,
          `${date}T10:00:00Z`, `${date}T12:00:00Z`, "scheduled", schedule.id,
        ]
      );
      const flight = (flightResult.rows[0] as unknown as FlightRow);

      // Create flight legs from CVRP route stops.
      // Use the actual per-sector distance/heading from the reference matrices;
      // fall back to an even split of the total only if a pair is missing.
      const legCount = cvrpRoute.stops.length - 1;
      const evenSplitNm = legCount > 0 ? cvrpRoute.totalDistanceNm / legCount : 0;
      const legDistances: Array<{ distance_nm: number }> = [];
      for (let s = 0; s < cvrpRoute.stops.length - 1; s++) {
        const from = cvrpRoute.stops[s];
        const to = cvrpRoute.stops[s + 1];
        const realDist = getDistance(distRows, from, to);
        const legDistNm = realDist > 0 ? realDist : evenSplitNm;
        const legHeading = getHeading(headingRows, from, to);
        legDistances.push({ distance_nm: legDistNm });
        await flightLegRepository.create({
          flight_id: flight.id,
          leg_sequence: s + 1,
          origin_code: from,
          destination_code: to,
          distance_nm: legDistNm,
          heading: legHeading > 0 ? legHeading : null,
        });
      }

      // Compute and persist flight duration
      const durationMinutes = computeFlightDuration(legDistances);
      await db.$executeRawUnsafe(
        `UPDATE flights SET duration_minutes = $1, check_in_time = $2 WHERE id = $3`,
        durationMinutes,
        "08:00",
        flight.id
      );

      // Assign booking legs to this flight based on CVRP assignments
      const assignedLegIds: number[] = [];
      for (const a of cvrpRoute.assignments) {
        const legIds = clusterLegMap.get(a.bookingLegId) ?? [];
        assignedLegIds.push(...legIds);
      }
      for (const blId of assignedLegIds) {
        await bookingLegRepository.assignFlight(blId, flight.id);
        await bookingLegRepository.updateStatus(blId, BookingStatus.FLIGHT_ASSIGNED);
      }

      // Build a RouteResult for Phases 3-5. Each routeStop represents the leg
      // that ARRIVES at that stop (legSequence idx+1 = leg stops[idx]→stops[idx+1]),
      // so carry the real per-leg distance/heading aligned to that leg.
      const routeStops = cvrpRoute.stops.slice(1).map((code, idx) => {
        const from = cvrpRoute.stops[idx];
        const to = cvrpRoute.stops[idx + 1];
        const realDist = getDistance(distRows, from, to);
        const h = getHeading(headingRows, from, to);
        return {
          aerodromeCode: code,
          legSequence: idx + 1,
          distanceNm: realDist > 0 ? realDist : evenSplitNm,
          heading: h > 0 ? h : null,
        };
      });
      const route: RouteResult = {
        flight,
        stops: routeStops,
        totalDistanceNm: cvrpRoute.totalDistanceNm,
        estimatedFlightTimeHours: cvrpRoute.totalDistanceNm / 140,
      };
      routes.push(route);
      routePassengerCounts.set(flight.id, cvrpRoute.passengerCount);

      // Populate booking_leg_passengers.flight_leg_id for per-passenger parity
      const legRows = await tx.$queryRawUnsafe<
        { id: number; origin_code: string; destination_code: string }[]
      >(
        `SELECT id, origin_code, destination_code FROM flight_legs WHERE flight_id = $1 ORDER BY leg_number`,
        flight.id
      );
      for (const blId of assignedLegIds) {
        const blRow = await tx.$queryRawUnsafe<
          { origin_code: string; destination_code: string }[]
        >(`SELECT origin_code, destination_code FROM booking_legs WHERE id = $1`, blId);
        if (blRow.length === 0) continue;
        const bl = blRow[0];
        const matchingLeg = legRows.find(
          (l) => l.origin_code === bl.origin_code && l.destination_code === bl.destination_code
        );
        if (matchingLeg) {
          await tx.$executeRawUnsafe(
            `UPDATE booking_leg_passengers SET flight_leg_id = $1 WHERE booking_leg_id = $2 AND flight_leg_id IS NULL`,
            matchingLeg.id,
            blId
          );
        }
      }
    }

    // Warn about unserved demands
    for (const unserved of cvrpResult.unservedDemands) {
      warnings.push(
        `Unserved demand: ${unserved.origin}→${unserved.destination} (${unserved.passengerCount} pax)`
      );
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
        const MAX_DECIMAL = 99_999_999; // DECIMAL(10,2) max
        const safe = (v: unknown, name: string): number => {
          const n = Number(v);
          if (!isFinite(n)) {
            console.error(`[buildSchedule] Non-finite ${name}: ${v} (type=${typeof v})`);
            return 0;
          }
          if (Math.abs(n) > MAX_DECIMAL) {
            console.error(`[buildSchedule] Overflow ${name}: ${n} (exceeds ${MAX_DECIMAL})`);
            return 0;
          }
          return n;
        };
        await weightBalanceRepository.create({
          flight_leg_id: wb.flightLegId,
          schedule_id: schedule.id,
          passenger_weight_kg: safe(wb.passengerWeightKg, "passengerWeightKg"),
          baggage_weight_kg: safe(wb.baggageWeightKg, "baggageWeightKg"),
          freight_weight_kg: safe(wb.freightWeightKg, "freightWeightKg"),
          fuel_weight_kg: safe(wb.fuelWeightKg, "fuelWeightKg"),
          crew_weight_kg: safe(wb.crewWeightKg, "crewWeightKg"),
          empty_weight_kg: safe(wb.emptyWeightKg, "emptyWeightKg"),
          total_weight_kg: safe(wb.totalWeightKg, "totalWeightKg"),
          total_moment_kgm: safe(wb.totalMomentKgm, "totalMomentKgm"),
          cg_position_pct: safe(wb.cgPositionPct, "cgPositionPct"),
          effective_mtow_kg: safe(wb.effectiveMtowKg, "effectiveMtowKg"),
          effective_mlw_kg: safe(wb.effectiveMlwKg, "effectiveMlwKg"),
          mtow_used_pct: safe(wb.mtowUsedPct, "mtowUsedPct"),
          mlw_used_pct: safe(wb.mlwUsedPct, "mlwUsedPct"),
          required_fuel_kg: safe(wb.fuelPlan.requiredFuelKg, "requiredFuelKg"),
          minimum_fuel_kg: safe(wb.fuelPlan.minimumFuelKg, "minimumFuelKg"),
          fuel_state: wb.fuelPlan.fuelState,
          binding_constraint: wb.bindingConstraint.constraint,
          binding_constraint_detail: wb.bindingConstraint.detail,
          computed_by: String(createdBy),
        });
      }
    }

    // ── Collect W&B violations ─────────────────────────────────────────────
    for (const wb of weightBalances) {
      if (wb.mtowUsedPct > 100) {
        warnings.push(
          `Flight leg #${wb.flightLegId}: MTOW exceeded (${wb.mtowUsedPct.toFixed(1)}% of ${wb.effectiveMtowKg}kg)`
        );
      }
      if (wb.mlwUsedPct > 100) {
        warnings.push(
          `Flight leg #${wb.flightLegId}: MLW exceeded (${wb.mlwUsedPct.toFixed(1)}% of ${wb.effectiveMlwKg}kg)`
        );
      }
      if (wb.bindingConstraint.constraint !== "none" && wb.bindingConstraint.constraint !== "OK") {
        warnings.push(
          `Flight leg #${wb.flightLegId}: Binding constraint — ${wb.bindingConstraint.constraint} (${wb.bindingConstraint.detail})`
        );
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
