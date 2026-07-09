import { clusterBookingsByDate } from "./cluster-bookings";
import { assignAircraft } from "./assign-aircraft";
import { loadDistances } from "./distance-lookup";
import type { RouteResult } from "./types";
import type { BuildConfig, FlightPlan, FlightPlanLeg, PassengerManifest } from "./config-scorer";
import { scoreConfig } from "./config-scorer";
import { validateFlight, type ValidationPassenger, type ValidationLeg, type ValidationAircraft } from "./flight-validation";
import { aircraftRepository } from "../repositories/aircraft";
import { solveCvrp } from "./cvrp-solver";
import type { PassengerDemand, CvrpConfig } from "./cvrp-types";

/**
 * Default max range (nm) for the BN-2 Islander fleet. The aircraft table has no
 * per-airframe range column, so a fleet default is used for CVRP range limits
 * and validation. Matches the reduce seed used for the CVRP solver.
 */
const DEFAULT_MAX_RANGE_NM = 800;


function getPassengerManifests(legIds: number[]): Promise<FlightPlan["passengerManifests"]> {
  return import("../repositories/booking-leg-passenger").then(async (m) => {
    const manifests: PassengerManifest[] = [];
    for (const lid of legIds) {
      const rows = await m.findByBookingLegId(lid);
      for (const r of rows) {
        manifests.push({
          id: Number(r.id),
          booking_leg_id: Number(r.booking_leg_id),
          passenger_name: String(r.passenger_name),
          body_weight_kg: Number(r.body_weight_kg) || 0,
          baggage_weight_kg: Number(r.baggage_weight_kg) || 0,
          freight_weight_kg: Number(r.freight_weight_kg) || 0,
          origin_code: r.origin_code,
          destination_code: r.destination_code,
        });
      }
    }
    return manifests;
  });
}

function generateFlightNumber(date: string, flightIdx: number): string {
  const clean = date.replace(/-/g, "");
  return `FIG-${clean}-${String(flightIdx).padStart(3, "0")}`;
}
/**
 * Validate a flight plan against constraints.
 */
async function validateFlightPlan(plan: FlightPlan): Promise<void> {
  try {
    const aircraftList = await aircraftRepository.findAll();
    const assignedAircraft = aircraftList.find((a) => a.registration === plan.aircraftRegistration);
    if (!assignedAircraft) return;

    const validationPassengers: ValidationPassenger[] = plan.passengerManifests.map((m) => ({
      id: m.id,
      name: m.passenger_name,
      origin_code: m.origin_code,
      destination_code: m.destination_code,
      clothed_weight_kg: m.body_weight_kg,
      baggage_weight_kg: m.baggage_weight_kg,
    }));

    const validationLegs: ValidationLeg[] = plan.legs.map((l) => ({
      leg_sequence: l.leg_sequence,
      origin_code: l.origin_code,
      destination_code: l.destination_code,
      distance_nm: l.distance_nm,
    }));

    const validationAircraft: ValidationAircraft = {
      type: assignedAircraft.type ?? "unknown",
      registration: assignedAircraft.registration,
      seat_count: assignedAircraft.seat_count,
      max_takeoff_weight_kg: assignedAircraft.max_takeoff_weight_kg,
      max_landing_weight_kg: assignedAircraft.max_landing_weight_kg ?? 0,
      empty_weight_kg: assignedAircraft.empty_weight_kg,
      fuel_capacity_kg: assignedAircraft.fuel_capacity_kg ?? 0,
      fuel_burn_rate_kg_per_hour: assignedAircraft.fuel_flow_kg_per_hour ?? 0,
      cruise_speed_kt: assignedAircraft.cruise_speed_ktas ?? 0,
      max_range_nm: DEFAULT_MAX_RANGE_NM,
    };

    const result = await validateFlight(validationPassengers, validationLegs, validationAircraft);

    if (result.weight_warnings.length > 0) {
      plan.weightWarnings.push(...result.weight_warnings);
    }

    if (result.status === "violation") {
      plan.isFeasible = false;
    }
  } catch {
    // Validation is best-effort; don't block the build on validation errors
  }
}

/**
 * Strategy D: CVRP Clarke-Wright Savings.
 * Replaces the three legacy strategies (Nearest-Neighbor, Single-Route, Origin-Grouped)
 * with a single global optimization that considers all unassigned passengers together.
 *
 * Solves the Capacitated Vehicle Routing Problem: given all passenger demands
 * (origin→destination pairs with passenger counts), construct the minimum number
 * of routes that start/end at STY, respect aircraft capacity and range, and
 * minimize total distance.
 */
async function strategyCvrp(
  date: string
): Promise<{ config: BuildConfig; errors: string[]; warnings: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const clusters = await clusterBookingsByDate(date);
  if (clusters.length === 0) {
    errors.push("No unassigned booking legs found for this date");
    return { config: { id: "", strategy: "", scheduleDate: date, flights: [], score: 0, metrics: {} as never }, errors, warnings };
  }

  // Build passenger demands from clusters (one demand per cluster, not per leg)
  // Map cluster ID → all booking leg IDs for later manifest lookup
  const demands: PassengerDemand[] = [];
  const clusterLegIds = new Map<number, number[]>();
  for (const cluster of clusters) {
    const demandId = cluster.legs[0]?.id ?? 0;
    demands.push({
      bookingLegId: demandId,
      origin: cluster.origin,
      destination: cluster.destination,
      passengerCount: cluster.passengerCount,
    });
    clusterLegIds.set(demandId, cluster.legs.map((l) => l.id));
  }

  // Build distance matrix
  const distances = await loadDistances();
  const distanceMatrix = new Map<string, number>();
  for (const d of distances) {
    distanceMatrix.set(`${d.origin}->${d.destination}`, d.distance_nm);
  }

  // Get aircraft constraints
  const aircraftList = await aircraftRepository.findAll();
  const maxSeats = aircraftList.reduce((max, a) => Math.max(max, a.seat_count), 9);
  const maxRange = aircraftList.reduce((max) => Math.max(max, DEFAULT_MAX_RANGE_NM), DEFAULT_MAX_RANGE_NM);

  // Solve CVRP
  const config: CvrpConfig = {
    depot: "STY",
    maxSeats,
    maxRangeNm: maxRange,
    distanceMatrix,
  };

  const result = solveCvrp(demands, config);

  if (result.routes.length === 0) {
    errors.push("CVRP solver produced no feasible routes");
    return { config: { id: "", strategy: "", scheduleDate: date, flights: [], score: 0, metrics: {} as never }, errors, warnings };
  }

  // Convert CVRP routes to FlightPlans
  const flights: FlightPlan[] = [];
  let flightIdx = 0;

  for (const route of result.routes) {
    flightIdx++;
    const flightNumber = generateFlightNumber(date, flightIdx);
    const legs: FlightPlanLeg[] = [];

    for (let s = 0; s < route.stops.length - 1; s++) {
      const d = distanceMatrix.get(`${route.stops[s]}->${route.stops[s + 1]}`) ?? 0;
      legs.push({
        leg_sequence: s + 1,
        origin_code: route.stops[s],
        destination_code: route.stops[s + 1],
        distance_nm: d,
        departure_time: null,
        arrival_time: null,
      });
    }

    // Collect all booking leg IDs for this route (may span multiple clusters)
    const legIds = route.assignments.flatMap((a) => clusterLegIds.get(a.bookingLegId) ?? [a.bookingLegId]);
    const manifests = await getPassengerManifests(legIds);

    // Get best-fit aircraft
    const assignment = await assignAircraft(
      {
        flight: { id: -(flightIdx + 1000), flight_number: flightNumber, departure_time: `${date}T10:00:00Z`, arrival_time: `${date}T12:00:00Z` },
        stops: route.stops.slice(1).map((code, idx) => ({
          aerodromeCode: code,
          legSequence: idx + 1,
          distanceNm: legs[idx]?.distance_nm ?? 0,
          heading: null,
        })),
        totalDistanceNm: route.totalDistanceNm,
        estimatedFlightTimeHours: route.totalDistanceNm / 140,
      } as unknown as RouteResult,
      route.passengerCount
    );

    flights.push({
      flightNumber,
      originCode: route.stops[0],
      destinationCode: route.stops[route.stops.length - 1],
      stops: route.stops.slice(1, route.stops.length - 1),
      legs,
      passengerManifests: manifests,
      bookingLegIds: legIds,
      passengerCount: route.passengerCount,
      totalPassengerWeightKg: route.passengerCount * 70,
      aircraftRegistration: assignment.aircraft.registration,
      aircraftType: assignment.aircraft.type,
      seatCount: assignment.aircraft.seat_count,
      totalDistanceNm: route.totalDistanceNm,
      estimatedFlightTimeHours: route.totalDistanceNm / 140,
      pilotName: null,
      weightWarnings: assignment.feasible ? [] : [assignment.infeasibilityReason ?? "Aircraft infeasible"],
      isFeasible: assignment.feasible,
    });

    if (!assignment.feasible) {
      warnings.push(`Flight ${flightNumber}: ${assignment.infeasibilityReason}`);
    }
  }

  // Add unserved demand warnings
  for (const unserved of result.unservedDemands) {
    warnings.push(
      `Unserved demand: ${unserved.origin}→${unserved.destination} (${unserved.passengerCount} pax)`
    );
  }

  const buildConfig: BuildConfig = {
    id: `cvrp-${date}`,
    strategy: "CVRP-Clarke-Wright",
    scheduleDate: date,
    flights,
    score: 0,
    metrics: {} as never,
  };

  scoreConfig(buildConfig, warnings, errors);
  return { config: buildConfig, errors, warnings };
}

/**
 * Run CVRP strategy and return the best configuration.
 * The legacy strategies are preserved as fallbacks but CVRP is the primary solver.
 *
 * @param date - The schedule date (YYYY-MM-DD)
 * @returns The best BuildConfig, with warnings/errors collected.
 */
export async function generateBestConfig(date: string): Promise<{
  configs: BuildConfig[];
  allErrors: string[];
  allWarnings: string[];
  unassignedCount: number;
}> {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  const results = await Promise.all([
    strategyCvrp(date),
  ]);

  const configs: BuildConfig[] = [];

  for (const result of results) {
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
    if (result.config.flights.length > 0) {
      // Run validation on each flight plan
      for (const plan of result.config.flights) {
        await validateFlightPlan(plan);
      }
      configs.push(result.config);
    }
  }

  // Count total unique booking legs to determine unassigned coverage
  const allBookingLegIds = new Set<number>();
  for (const config of configs) {
    for (const plan of config.flights) {
      for (const id of plan.bookingLegIds) {
        allBookingLegIds.add(id);
      }
    }
  }
  // Get total unassigned from the database
  const clusters = await clusterBookingsByDate(date);
  const totalUnassignedPassengers = clusters.reduce((s, c) => s + c.passengerCount, 0);

  // Re-score configs with coverage information
  for (const config of configs) {
    const configWarnings = allWarnings.filter((w) =>
      config.flights.some((f) => w.includes(f.flightNumber))
    );
    scoreConfig(config, configWarnings, allErrors, totalUnassignedPassengers);
  }

  configs.sort((a, b) => b.score - a.score);

  const unassignedCount = totalUnassignedPassengers;

  return { configs, allErrors, allWarnings, unassignedCount };
}
