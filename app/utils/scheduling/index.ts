import type { ScheduleBuildResult, ClusterResult, RouteResult, WeightBalanceResult } from "./types";
import type { FlightRow } from "../repositories/flight";
import { flightRepository } from "../repositories/flight";
import { bookingLegRepository } from "../repositories/booking-leg";
import { flightLegRepository } from "../repositories/flight-leg";
import { generateAutoBuildFlightNumber } from "../flight-number.server";
import { aircraftRepository } from "../repositories/aircraft";
import { splitOversizedCluster, getLegPassengerCountMap, clusterBookingsByDate } from "./cluster-bookings";
import { assignAircraftToRoutes } from "./assign-aircraft";
import { computeFlightDuration } from "../check-in-time.server";
import { computeWeightBalanceForRoute } from "./weight-balance";
import { assignPilotsToRoutes } from "./assign-pilots";
import { BookingStatus, FlightStatus } from "../constants";
import { isNoFlyDay } from "../services/no-fly.service";
import { db } from "../db.server";
import { sql } from "kysely";
import { solveCvrp } from "./cvrp-solver";
import type { ValidationAircraft, ValidationPassenger, ValidationLeg } from "./flight-validation";
import { validateFlight } from "./flight-validation";
import { loadDistances, loadHeadings } from "./distance-lookup";
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
  return await db.transaction().execute(async (tx) => {
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

    // ── Clean up prior builds for idempotency ────────────────────────────────
    const priorSchedules = await sql<{ id: number }>`
      SELECT id FROM schedules WHERE schedule_date = ${date}::date
    `.execute(tx);
    for (const ps of priorSchedules.rows) {
      const priorFlightIds = await sql<{ id: number }>`
        SELECT id FROM flights WHERE schedule_id = ${ps.id}
      `.execute(tx);
      const priorFlightIdList = priorFlightIds.rows.map((f) => f.id);
      if (priorFlightIdList.length > 0) {
        await sql`
          DELETE FROM booking_leg_passengers WHERE flight_leg_id IN (
            SELECT id FROM flight_legs WHERE flight_id = ANY(${priorFlightIdList}::int[])
          )
        `.execute(tx);
        await sql`
          UPDATE booking_legs SET flight_id = NULL, status = 'unassigned'
          WHERE flight_id = ANY(${priorFlightIdList}::int[])
        `.execute(tx);
        await sql`
          DELETE FROM weight_balance_snapshots WHERE schedule_id = ${ps.id}
        `.execute(tx);
        await sql`
          DELETE FROM pilot_assignments WHERE schedule_id = ${ps.id}
        `.execute(tx);
        await sql`
          DELETE FROM flight_legs WHERE flight_id = ANY(${priorFlightIdList}::int[])
        `.execute(tx);
        await sql`
          DELETE FROM flights WHERE schedule_id = ${ps.id}
        `.execute(tx);
      }
    }

    // ── Create or reuse schedule record ───────────────────────────────────────
    const existingResult = await sql`
      SELECT id FROM schedules WHERE schedule_date = ${date}::date ORDER BY created_at DESC LIMIT 1
    `.execute(tx);
    let scheduleId: number;
    if (existingResult.rows.length > 0) {
      scheduleId = Number((existingResult.rows[0] as { id: number | bigint }).id);
      await sql`
        UPDATE schedules SET status = 'building', updated_at = NOW() WHERE id = ${scheduleId}
      `.execute(tx);
    } else {
      const newScheduleResult = await sql`
        INSERT INTO schedules (schedule_date, created_by, notes, status) VALUES (${date}, ${createdBy}, ${`Auto-generated schedule for ${date}`}, 'building') RETURNING id
      `.execute(tx);
      scheduleId = Number((newScheduleResult.rows[0] as { id: number | bigint }).id);
    }
    const schedule = { id: scheduleId };

    // ── Get aircraft fleet for capacity constraints ────────────────────────────
    const allAircraft = await aircraftRepository.findAll();
    const maxSeats = allAircraft.reduce((max, a) => Math.max(max, a.seat_count), 9);
    // R-04: Use fleet-minimum range so CVRP merges respect the weakest aircraft
    const fleetRanges = allAircraft
      .map((a) => (a as unknown as { max_range_nm?: number }).max_range_nm ?? 800)
      .filter((r) => r > 0);
    const maxRange = fleetRanges.length > 0 ? Math.min(...fleetRanges) : 800;

    // R-01: Split clusters that exceed aircraft capacity before CVRP input
    const allLegIds = clusters.flatMap((c) => c.legs.map((l) => l.id));
    const passengerCountMap = await getLegPassengerCountMap(allLegIds);
    const splitClusters: ClusterResult[] = [];
    for (const cluster of clusters) {
      const subClusters = splitOversizedCluster(cluster, maxSeats, passengerCountMap);
      splitClusters.push(...subClusters);
    }

    // ── Phase 2: CVRP Route Construction ────────────────────────────────────
    const routes: RouteResult[] = [];
    const routePassengerCounts = new Map<number, number>();

    // Convert split clusters to passenger demands
    const demands: PassengerDemand[] = [];
    const clusterLegMap = new Map<number, number[]>(); // cluster leg index \u2192 leg ids
    for (let ci = 0; ci < splitClusters.length; ci++) {
      const cluster = splitClusters[ci];
      demands.push({
        bookingLegId: ci, // use cluster index as identifier
        origin: cluster.origin,
        destination: cluster.destination,
        passengerCount: cluster.passengerCount,
      });
      clusterLegMap.set(ci, cluster.legs.map((l) => l.id));
    }

    // Build distance and heading lookup maps (O(1) instead of O(N) per leg)
    const distRows = await loadDistances();
    const headingRows = await loadHeadings();
    const distanceMatrix = new Map<string, number>();
    for (const d of distRows) {
      distanceMatrix.set(`${d.origin}->${d.destination}`, d.distance_nm);
    }
    const headingMatrix = new Map<string, number>();
    for (const h of headingRows) {
      headingMatrix.set(`${h.origin}->${h.destination}`, h.heading);
    }
    const lookupDistance = (from: string, to: string): number =>
      distanceMatrix.get(`${from}->${to}`) ?? distanceMatrix.get(`${to}->${from}`) ?? 0;
    const lookupHeading = (from: string, to: string): number =>
      headingMatrix.get(`${from}->${to}`) ?? headingMatrix.get(`${to}->${from}`) ?? 0;

    // Solve CVRP
    const cvrpResult = solveCvrp(demands, {
      depot: "STY",
      maxSeats,
      maxRangeNm: maxRange,
      distanceMatrix,
    });

    if (cvrpResult.routes.length === 0) {
      errors.push("CVRP solver produced no feasible routes");
      return { scheduleId, scheduleDate: date, clusters: splitClusters, routes: [], aircraftAssignments: [], weightBalances: [], pilotAssignments: [], errors, warnings };
    }

    // R-03: Compute base time for departure sequencing
    const baseTime = new Date(`${date}T06:00:00Z`);
    let currentOffsetMinutes = 0;

    // Create flights from CVRP routes
    for (const cvrpRoute of cvrpResult.routes) {
      const flightNumber = await generateAutoBuildFlightNumber(date, tx);
      const originCode = cvrpRoute.stops[0] ?? "STY";
      const destCode = cvrpRoute.stops[cvrpRoute.stops.length - 1] ?? "STY";

      // Get aerodrome IDs
      const originResult = await sql`
        SELECT id FROM aerodromes WHERE code = ${originCode}
      `.execute(tx);
      const destResult = await sql`
        SELECT id FROM aerodromes WHERE code = ${destCode}
      `.execute(tx);
      const originId = Number((originResult.rows[0] as { id: number | bigint })?.id ?? 0);
      const destId = Number((destResult.rows[0] as { id: number | bigint })?.id ?? 0);

      const defaultAircraftId = allAircraft.length > 0 ? allAircraft[0].id : 1;

      // R-03: Compute sequenced departure / arrival times
      const departureTime = new Date(baseTime.getTime() + currentOffsetMinutes * 60 * 1000);
      // Placeholder arrival; updated below after leg distances are known
      const arrivalTime = new Date(departureTime.getTime() + 120 * 60 * 1000);

      const flightResult = await sql`
        INSERT INTO flights (
          flight_number, aircraft_id, origin_aerodrome_id, destination_aerodrome_id,
          departure_time, arrival_time, status, schedule_id
        ) VALUES (${flightNumber}, ${defaultAircraftId}, ${originId}, ${destId}, ${departureTime.toISOString()}, ${arrivalTime.toISOString()}, ${FlightStatus.SCHEDULED}, ${schedule.id}) RETURNING *
      `.execute(tx);
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
        const realDist = lookupDistance(from, to);
        const legDistNm = realDist > 0 ? realDist : evenSplitNm;
        const legHeading = lookupHeading(from, to);
        legDistances.push({ distance_nm: legDistNm });
        await sql`
          INSERT INTO flight_legs (flight_id, leg_number, origin_code, destination_code, distance_nm, heading)
          VALUES (${flight.id}, ${s + 1}, ${from}, ${to}, ${legDistNm}, ${legHeading > 0 ? legHeading : null})
        `.execute(tx);
      }

      // Compute and persist flight duration; sequence departure/arrival
      const durationMinutes = computeFlightDuration(legDistances);
      const updatedArrival = new Date(departureTime.getTime() + durationMinutes * 60 * 1000);
      const checkInMinutes = departureTime.getUTCHours() * 60 + departureTime.getUTCMinutes() - 30;
      const checkInHh = String(Math.floor(Math.max(0, checkInMinutes) / 60)).padStart(2, "0");
      const checkInMm = String(Math.max(0, checkInMinutes) % 60).padStart(2, "0");
      await sql`
        UPDATE flights SET duration_minutes = ${durationMinutes}, arrival_time = ${updatedArrival.toISOString()}, check_in_time = ${`${checkInHh}:${checkInMm}`} WHERE id = ${flight.id}
      `.execute(tx);
      // R-03: Advance offset for next flight (30 min turnaround)
      currentOffsetMinutes += durationMinutes + 30;

      // Assign booking legs to this flight based on CVRP assignments
      const assignedLegIds: number[] = [];
      for (const a of cvrpRoute.assignments) {
        const legIds = clusterLegMap.get(a.bookingLegId) ?? [];
        assignedLegIds.push(...legIds);
      }
      for (const blId of assignedLegIds) {
        await bookingLegRepository.assignFlight(blId, flight.id, tx);
        await bookingLegRepository.updateStatus(blId, BookingStatus.FLIGHT_ASSIGNED, tx);
      }

      // Build a RouteResult for Phases 3-5. Each routeStop represents the leg
      // that ARRIVES at that stop (legSequence idx+1 = leg stops[idx]\u2192stops[idx+1]),
      // so carry the real per-leg distance/heading aligned to that leg.
      const routeStops = cvrpRoute.stops.slice(1).map((code, idx) => {
        const from = cvrpRoute.stops[idx];
        const to = cvrpRoute.stops[idx + 1];
        const realDist = lookupDistance(from, to);
        const h = lookupHeading(from, to);
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
      const legRows = await sql<{ id: number; origin_code: string; destination_code: string }>`
        SELECT id, origin_code, destination_code FROM flight_legs WHERE flight_id = ${flight.id} ORDER BY leg_number
      `.execute(tx);
      for (const blId of assignedLegIds) {
        const blRow = await sql<{ origin_code: string; destination_code: string }>`
          SELECT origin_code, destination_code FROM booking_legs WHERE id = ${blId}
        `.execute(tx);
        if (blRow.rows.length === 0) continue;
        const bl = blRow.rows[0];
        // Assign flight_leg_id to the boarding leg (first leg departing from booking's origin)
        const boardingLeg = legRows.rows.find(
          (l) => l.origin_code === bl.origin_code
        );
        if (boardingLeg) {
          await sql`
            UPDATE booking_leg_passengers SET flight_leg_id = ${boardingLeg.id} WHERE booking_leg_id = ${blId} AND flight_leg_id IS NULL
          `.execute(tx);
        }
      }
    }

    // Warn about unserved demands
    for (const unserved of cvrpResult.unservedDemands) {
      warnings.push(
        `Unserved demand: ${unserved.origin}\u2192${unserved.destination} (${unserved.passengerCount} pax)`
      );
    }

    // ── Phase 3: Aircraft Assignment ──────────────────────────────────────────
    const aircraftAssignments = await assignAircraftToRoutes(routes, routePassengerCounts);

    // Update flights with assigned aircraft
    for (const assignment of aircraftAssignments) {
      await flightRepository.updateWeights(assignment.route.flight.id, {
        total_fuel_weight_kg: 0, // will be updated in Phase 4
      }, tx);

      // Update the aircraft_id on the flight record using the transaction client
      await sql`
        UPDATE flights SET aircraft_id = ${assignment.aircraft.id}, updated_at = NOW() WHERE id = ${assignment.route.flight.id}
      `.execute(tx);
    }

    // R-02: Validate each route against its assigned aircraft
    for (const assignment of aircraftAssignments) {
      const ac = assignment.aircraft;
      const validationAircraft: ValidationAircraft = {
        type: ac.type ?? "BN-2",
        registration: ac.registration ?? "UNKNOWN",
        seat_count: ac.seat_count,
        max_takeoff_weight_kg: ac.max_takeoff_weight_kg ?? 2994,
        max_landing_weight_kg: (ac as unknown as { max_landing_weight_kg?: number }).max_landing_weight_kg ?? ac.max_takeoff_weight_kg ?? 2994,
        empty_weight_kg: ac.empty_weight_kg ?? 1627,
        fuel_capacity_kg: ac.fuel_capacity_kg ?? 280,
        fuel_burn_rate_kg_per_hour: (ac as unknown as { fuel_flow_kg_per_hour?: number }).fuel_flow_kg_per_hour ?? 25,
        cruise_speed_kt: (ac as unknown as { cruise_speed_ktas?: number }).cruise_speed_ktas ?? 140,
        max_range_nm: (ac as unknown as { max_range_nm?: number }).max_range_nm ?? maxRange,
      };

      const flightLegs = await flightLegRepository.findByFlightId(assignment.route.flight.id);
      const validationLegs: ValidationLeg[] = flightLegs.map((l) => ({
        leg_sequence: l.leg_sequence,
        origin_code: l.origin_code,
        destination_code: l.destination_code,
        distance_nm: l.distance_nm,
      }));

      const routePassengers: ValidationPassenger[] = [];
      const cvrpRouteForAssignment = cvrpResult.routes.find((r) =>
        r.assignments.some((a) => clusterLegMap.has(a.bookingLegId))
      );
      if (cvrpRouteForAssignment) {
        const assignedLegIds = new Set<number>();
        for (const a of cvrpRouteForAssignment.assignments) {
          const legIds = clusterLegMap.get(a.bookingLegId) ?? [];
          legIds.forEach((id) => assignedLegIds.add(id));
        }
        // Only add passengers whose booking legs are actually assigned to this flight
        const flightAssignedLegIds = new Set(assignedLegIds);
        for (const a of cvrpRouteForAssignment.assignments) {
          const demand = demands.find((d) => d.bookingLegId === a.bookingLegId);
          if (!demand) continue;
          // Check if this demand's leg IDs actually belong to this flight
          const legIds = clusterLegMap.get(a.bookingLegId) ?? [];
          if (legIds.some((id) => flightAssignedLegIds.has(id))) {
            for (let p = 0; p < a.passengerCount; p++) {
              routePassengers.push({
                id: `${a.bookingLegId}-${p}`,
                name: `Pax-${a.bookingLegId}-${p}`,
                origin_code: a.origin,
                destination_code: a.destination,
                clothed_weight_kg: 86,
                baggage_weight_kg: 0,
              });
            }
          }
        }
      }

      try {
        const vResult = await validateFlight(routePassengers, validationLegs, validationAircraft);
        if (vResult.status === "violation") {
          errors.push(`Flight ${assignment.route.flight.flight_number}: ${vResult.weight_warnings.join("; ") || "Post-assignment flight validation failed"}`);
        }
        if (vResult.weight_warnings.length > 0) {
          warnings.push(...vResult.weight_warnings.map((w) => `Flight ${assignment.route.flight.flight_number}: ${w}`));
        }
      } catch (err) {
        warnings.push(`Flight ${assignment.route.flight.flight_number}: validation error — ${err instanceof Error ? err.message : "unknown"}`);
      }
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
        await sql`
          INSERT INTO weight_balance_snapshots (
            flight_leg_id, schedule_id,
            passenger_weight_kg, baggage_weight_kg, freight_weight_kg,
            fuel_weight_kg, crew_weight_kg, empty_weight_kg,
            total_weight_kg, total_moment_kgm, cg_position_pct,
            effective_mtow_kg, effective_mlw_kg, mtow_used_pct, mlw_used_pct,
            required_fuel_kg, minimum_fuel_kg, fuel_state,
            binding_constraint, binding_constraint_detail, computed_by
          ) VALUES (
            ${wb.flightLegId}, ${schedule.id},
            ${safe(wb.passengerWeightKg, "passengerWeightKg")},
            ${safe(wb.baggageWeightKg, "baggageWeightKg")},
            ${safe(wb.freightWeightKg, "freightWeightKg")},
            ${safe(wb.fuelWeightKg, "fuelWeightKg")},
            ${safe(wb.crewWeightKg, "crewWeightKg")},
            ${safe(wb.emptyWeightKg, "emptyWeightKg")},
            ${safe(wb.totalWeightKg, "totalWeightKg")},
            ${safe(wb.totalMomentKgm, "totalMomentKgm")},
            ${safe(wb.cgPositionPct, "cgPositionPct")},
            ${safe(wb.effectiveMtowKg, "effectiveMtowKg")},
            ${safe(wb.effectiveMlwKg, "effectiveMlwKg")},
            ${safe(wb.mtowUsedPct, "mtowUsedPct")},
            ${safe(wb.mlwUsedPct, "mlwUsedPct")},
            ${safe(wb.fuelPlan.requiredFuelKg, "requiredFuelKg")},
            ${safe(wb.fuelPlan.minimumFuelKg, "minimumFuelKg")},
            ${wb.fuelPlan.fuelState},
            ${wb.bindingConstraint.constraint},
            ${wb.bindingConstraint.detail},
            ${String(createdBy)}
          )
        `.execute(tx);
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
        await sql`
          INSERT INTO pilot_assignments (schedule_id, flight_id, pilot_id, role, assigned_by)
          VALUES (${schedule.id}, ${pa.flightId}, ${pa.pilotId}, ${pa.role}, ${createdBy})
        `.execute(tx);
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
      clusters: splitClusters,
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

