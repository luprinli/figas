import { db } from "../db.server";
import { clusterBookingsByDate, splitOversizedCluster } from "./cluster-bookings";
import { buildRoute } from "./nearest-neighbor";
import { assignAircraft } from "./assign-aircraft";
import { assignPilotsToRoutes } from "./assign-pilots";
import { computeWeightBalanceForRoute } from "./weight-balance";
import { loadDistances, getDistanceFast } from "./distance-cache";
import { nearestNeighborOrder } from "./route-builder";
import type { ClusterResult, RouteResult, AircraftAssignmentResult, PilotAssignmentResult, WeightBalanceResult } from "./types";
import type { BuildConfig, FlightPlan, FlightPlanLeg, PassengerManifest } from "./config-scorer";
import { scoreConfig } from "./config-scorer";
import { aircraftRepository } from "../repositories/aircraft";
import { flightLegRepository } from "../repositories/flight-leg";

const STANLEY = "STY";

function generateFlightNumber(date: string, index: number): string {
  const clean = date.replace(/-/g, "");
  return `FIG${clean.slice(4)}${String(index + 1).padStart(2, "0")}`;
}

function routeToLegs(route: RouteResult): FlightPlanLeg[] {
  const legs: FlightPlanLeg[] = [];
  for (let i = 0; i < route.stops.length; i++) {
    const stop = route.stops[i];
    const origin = i === 0 ? STANLEY : route.stops[i - 1].aerodromeCode;
    legs.push({
      leg_sequence: stop.legSequence,
      origin_code: origin,
      destination_code: stop.aerodromeCode,
      distance_nm: stop.distanceNm,
      departure_time: null,
      arrival_time: null,
    });
  }
  return legs;
}

async function getPassengerManifests(legIds: number[]): Promise<PassengerManifest[]> {
  if (legIds.length === 0) return [];
  const rows = await db.$queryRawUnsafe<
    { id: number; booking_leg_id: number; passenger_name: string;
      body_weight_kg: number; baggage_weight_kg: number; freight_weight_kg: number;
      origin_code: string; destination_code: string }[]
  >(
    `SELECT blp.id, blp.booking_leg_id,
            CONCAT(bp.first_name, ' ', bp.last_name) AS passenger_name,
            COALESCE(blp.clothed_weight_kg, 70)::numeric AS body_weight_kg,
            COALESCE(blp.baggage_weight_kg, 0)::numeric AS baggage_weight_kg,
            COALESCE(blp.freight_weight_kg, 0)::numeric AS freight_weight_kg,
            bl.origin_code, bl.destination_code
     FROM booking_leg_passengers blp
     JOIN booking_legs bl ON bl.id = blp.booking_leg_id
     JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
     WHERE blp.booking_leg_id = ANY($1)
     ORDER BY blp.id`,
    legIds
  );
  return (rows as Array<{
    id: number | bigint; booking_leg_id: number | bigint; passenger_name: string;
    body_weight_kg: number | bigint; baggage_weight_kg: number | bigint; freight_weight_kg: number | bigint;
    origin_code: string; destination_code: string;
  }>).map((r) => ({
    id: Number(r.id),
    booking_leg_id: Number(r.booking_leg_id),
    passenger_name: r.passenger_name,
    body_weight_kg: Number(r.body_weight_kg) || 70,
    baggage_weight_kg: Number(r.baggage_weight_kg) || 0,
    freight_weight_kg: Number(r.freight_weight_kg) || 0,
    origin_code: r.origin_code,
    destination_code: r.destination_code,
  }));
}

async function getMaxSeats(): Promise<number> {
  const aircraft = await db.aircraft.findFirst({
    where: { is_active: true },
    orderBy: { seat_count: "desc" },
    select: { seat_count: true },
  });
  return aircraft?.seat_count ?? 9;
}

async function getPassengerCountMap(legs: Array<{ id: number }>): Promise<Map<number, number>> {
  const legIds = legs.map((l) => l.id);
  if (legIds.length === 0) return new Map();
  const rows = await db.$queryRawUnsafe<{ booking_leg_id: number; count: number }[]>(
    `SELECT booking_leg_id, COUNT(*)::int AS count
     FROM booking_leg_passengers
     WHERE booking_leg_id = ANY($1)
     GROUP BY booking_leg_id`,
    legIds
  );
  return new Map(rows.map((r) => [r.booking_leg_id, r.count]));
}

async function resolveAerodromeIds(origin: string, destination: string) {
  const result = await db.query(
    `SELECT id, code FROM aerodromes WHERE code IN ($1, $2)`,
    [origin, destination]
  );
  const rows = result.rows as Array<{ id: number; code: string }>;
  const originId = rows.find((r) => r.code === origin)?.id;
  const destId = rows.find((r) => r.code === destination)?.id;
  return { originId, destId };
}

function getStopCodes(route: RouteResult): string[] {
  return route.stops.map((s) => s.aerodromeCode);
}

/**
 * Strategy A: Nearest-Neighbor per Cluster
 * Groups by origin→destination, builds individual routes for each cluster.
 */
async function strategyNearestNeighbor(
  date: string
): Promise<{ config: BuildConfig; errors: string[]; warnings: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const maxSeats = await getMaxSeats();
  const clusters = await clusterBookingsByDate(date);
  if (clusters.length === 0) {
    errors.push("No unassigned booking legs found for this date");
    return { config: { id: "", strategy: "", scheduleDate: date, flights: [], score: 0, metrics: {} as never }, errors, warnings };
  }

  const allLegs = clusters.flatMap((c) => c.legs);
  const paxMap = await getPassengerCountMap(allLegs);
  const distances = await loadDistances();

  const splitClusters: ClusterResult[] = [];
  for (const cluster of clusters) {
    for (const split of splitOversizedCluster(cluster, maxSeats, paxMap)) {
      splitClusters.push(split);
    }
  }

  const flights: FlightPlan[] = [];
  let flightIdx = 0;

  for (const cluster of splitClusters) {
    flightIdx++;
    const flightNumber = generateFlightNumber(date, flightIdx);
    const { originId, destId } = await resolveAerodromeIds(cluster.origin, cluster.destination);

    const flightRow = {
      id: -(flightIdx + 1000),
      flight_number: flightNumber,
      aircraft_id: 0,
      origin_aerodrome_id: originId ?? 0,
      destination_aerodrome_id: destId ?? 0,
      departure_time: `${date}T10:00:00Z`,
      arrival_time: `${date}T12:00:00Z`,
      status: "scheduled",
      intermediate_stops: null,
      total_passenger_weight_kg: null,
      total_baggage_weight_kg: null,
      total_freight_weight_kg: null,
      total_fuel_weight_kg: null,
      pilot_id: null,
      pilot_approved_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      const route = await buildRoute(cluster, flightRow);
      const aircraftAssignment = await assignAircraft(route, cluster.passengerCount);

      const totalPassengerWeight = cluster.legs.reduce((sum, leg) => {
        const count = paxMap.get(leg.id) ?? 0;
        return sum + count * 70;
      }, 0);

      const legIds = cluster.legs.map((l) => l.id);
      const manifests = await getPassengerManifests(legIds);

      flights.push({
        flightNumber,
        originCode: cluster.origin,
        destinationCode: cluster.destination,
        stops: getStopCodes(route),
        legs: routeToLegs(route),
        passengerManifests: manifests,
        bookingLegIds: legIds,
        passengerCount: cluster.passengerCount,
        totalPassengerWeightKg: totalPassengerWeight,
        aircraftRegistration: aircraftAssignment.aircraft.registration,
        aircraftType: aircraftAssignment.aircraft.type,
        seatCount: aircraftAssignment.aircraft.seat_count,
        totalDistanceNm: route.totalDistanceNm,
        estimatedFlightTimeHours: route.estimatedFlightTimeHours,
        pilotName: null,
        weightWarnings: aircraftAssignment.feasible ? [] : [aircraftAssignment.infeasibilityReason ?? "Aircraft infeasible"],
        isFeasible: aircraftAssignment.feasible,
      });

      if (!aircraftAssignment.feasible) {
        warnings.push(`Flight ${flightNumber}: ${aircraftAssignment.infeasibilityReason}`);
      }
    } catch (err) {
      errors.push(`Flight ${flightNumber}: ${err instanceof Error ? err.message : "Route build failed"}`);
    }
  }

  const config: BuildConfig = {
    id: `nn-${date}`,
    strategy: "Nearest-Neighbor",
    scheduleDate: date,
    flights,
    score: 0,
    metrics: {} as never,
  };

  scoreConfig(config, warnings, errors);
  return { config, errors, warnings };
}

/**
 * Strategy B: Single Route (Minimum Stops)
 * Combines all unassigned legs into one route.
 * Best for light passenger days.
 */
async function strategySingleRoute(
  date: string
): Promise<{ config: BuildConfig; errors: string[]; warnings: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const clusters = await clusterBookingsByDate(date);
  if (clusters.length === 0) {
    errors.push("No unassigned booking legs found for this date");
    return { config: { id: "", strategy: "", scheduleDate: date, flights: [], score: 0, metrics: {} as never }, errors, warnings };
  }

  const maxSeats = await getMaxSeats();
  const allLegs = clusters.flatMap((c) => c.legs);
  const totalPax = clusters.reduce((s, c) => s + c.passengerCount, 0);

  if (totalPax > maxSeats) {
    warnings.push(`Single-route strategy skipped: ${totalPax} passengers exceeds max seats (${maxSeats})`);
    return {
      config: { id: `sr-${date}`, strategy: "Single Route", scheduleDate: date, flights: [], score: 0, metrics: {} as never },
      errors,
      warnings,
    };
  }

  const distances = await loadDistances();
  const mergedOrigin = clusters[0].origin;
  const mergedDest = clusters[clusters.length - 1].destination;

  const mergedCluster: ClusterResult = {
    date,
    legs: allLegs,
    origin: mergedOrigin,
    destination: mergedDest,
    passengerCount: totalPax,
  };

  const flightNumber = generateFlightNumber(date, 1);
  const { originId, destId } = await resolveAerodromeIds(mergedOrigin, mergedDest);

  const flightRow = {
    id: -2001,
    flight_number: flightNumber,
    aircraft_id: 0,
    origin_aerodrome_id: originId ?? 0,
    destination_aerodrome_id: destId ?? 0,
    departure_time: `${date}T10:00:00Z`,
    arrival_time: `${date}T12:00:00Z`,
    status: "scheduled",
    intermediate_stops: null,
    total_passenger_weight_kg: null,
    total_baggage_weight_kg: null,
    total_freight_weight_kg: null,
    total_fuel_weight_kg: null,
    pilot_id: null,
    pilot_approved_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const route = await buildRoute(mergedCluster, flightRow);
    const aircraftAssignment = await assignAircraft(route, totalPax);
    const manifests = await getPassengerManifests(allLegs.map((l) => l.id));

    const flightPlan: FlightPlan = {
      flightNumber,
      originCode: mergedOrigin,
      destinationCode: mergedDest,
      stops: getStopCodes(route),
      legs: routeToLegs(route),
      passengerManifests: manifests,
      bookingLegIds: allLegs.map((l) => l.id),
      passengerCount: totalPax,
      totalPassengerWeightKg: totalPax * 70,
      aircraftRegistration: aircraftAssignment.aircraft.registration,
      aircraftType: aircraftAssignment.aircraft.type,
      seatCount: aircraftAssignment.aircraft.seat_count,
      totalDistanceNm: route.totalDistanceNm,
      estimatedFlightTimeHours: route.estimatedFlightTimeHours,
      pilotName: null,
      weightWarnings: aircraftAssignment.feasible ? [] : [aircraftAssignment.infeasibilityReason ?? "Aircraft infeasible"],
      isFeasible: aircraftAssignment.feasible,
    };

    if (!aircraftAssignment.feasible) {
      warnings.push(`Flight ${flightNumber}: ${aircraftAssignment.infeasibilityReason}`);
    }

    const config: BuildConfig = {
      id: `sr-${date}`,
      strategy: "Single Route",
      scheduleDate: date,
      flights: [flightPlan],
      score: 0,
      metrics: {} as never,
    };

    scoreConfig(config, warnings, errors);
    return { config, errors, warnings };
  } catch (err) {
    errors.push(`Single route: ${err instanceof Error ? err.message : "Build failed"}`);
    return { config: { id: `sr-${date}`, strategy: "Single Route", scheduleDate: date, flights: [], score: 0, metrics: {} as never }, errors, warnings };
  }
}

/**
 * Strategy C: Origin-Grouped
 * Groups passengers by origin aerodrome, creates one flight per origin group.
 */
async function strategyOriginGrouped(
  date: string
): Promise<{ config: BuildConfig; errors: string[]; warnings: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const clusters = await clusterBookingsByDate(date);
  if (clusters.length === 0) {
    errors.push("No unassigned booking legs found for this date");
    return { config: { id: "", strategy: "", scheduleDate: date, flights: [], score: 0, metrics: {} as never }, errors, warnings };
  }

  const maxSeats = await getMaxSeats();

  const byOrigin = new Map<string, ClusterResult[]>();
  for (const c of clusters) {
    const existing = byOrigin.get(c.origin) ?? [];
    existing.push(c);
    byOrigin.set(c.origin, existing);
  }

  const flights: FlightPlan[] = [];
  let flightIdx = 0;

  for (const [origin, group] of byOrigin.entries()) {
    const legs = group.flatMap((c) => c.legs);
    const totalPax = group.reduce((s, c) => s + c.passengerCount, 0);
    const destination = group[0].destination;

    if (totalPax > maxSeats) {
      warnings.push(`Origin group ${origin} has ${totalPax} passengers, exceeds ${maxSeats} seats — skipping`);
      continue;
    }

    flightIdx++;
    const flightNumber = generateFlightNumber(date, flightIdx);

    const mergedCluster: ClusterResult = { date, legs, origin, destination, passengerCount: totalPax };

    const { originId, destId } = await resolveAerodromeIds(origin, destination);
    const flightRow = {
      id: -(3000 + flightIdx),
      flight_number: flightNumber,
      aircraft_id: 0,
      origin_aerodrome_id: originId ?? 0,
      destination_aerodrome_id: destId ?? 0,
      departure_time: `${date}T10:00:00Z`,
      arrival_time: `${date}T12:00:00Z`,
      status: "scheduled",
      intermediate_stops: null,
      total_passenger_weight_kg: null,
      total_baggage_weight_kg: null,
      total_freight_weight_kg: null,
      total_fuel_weight_kg: null,
      pilot_id: null,
      pilot_approved_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      const route = await buildRoute(mergedCluster, flightRow);
      const aircraftAssignment = await assignAircraft(route, totalPax);
      const manifests = await getPassengerManifests(legs.map((l) => l.id));

      flights.push({
        flightNumber,
        originCode: origin,
        destinationCode: destination,
        stops: getStopCodes(route),
        legs: routeToLegs(route),
        passengerManifests: manifests,
        bookingLegIds: legs.map((l) => l.id),
        passengerCount: totalPax,
        totalPassengerWeightKg: totalPax * 70,
        aircraftRegistration: aircraftAssignment.aircraft.registration,
        aircraftType: aircraftAssignment.aircraft.type,
        seatCount: aircraftAssignment.aircraft.seat_count,
        totalDistanceNm: route.totalDistanceNm,
        estimatedFlightTimeHours: route.estimatedFlightTimeHours,
        pilotName: null,
        weightWarnings: aircraftAssignment.feasible ? [] : [aircraftAssignment.infeasibilityReason ?? "Aircraft infeasible"],
        isFeasible: aircraftAssignment.feasible,
      });

      if (!aircraftAssignment.feasible) {
        warnings.push(`Flight ${flightNumber}: ${aircraftAssignment.infeasibilityReason}`);
      }
    } catch (err) {
      errors.push(`Flight ${flightNumber}: ${err instanceof Error ? err.message : "Build failed"}`);
    }
  }

  const config: BuildConfig = {
    id: `og-${date}`,
    strategy: "Origin-Grouped",
    scheduleDate: date,
    flights,
    score: 0,
    metrics: {} as never,
  };

  scoreConfig(config, warnings, errors);
  return { config, errors, warnings };
}

/**
 * Run all strategies and return the single best configuration.
 * Multiple strategies are evaluated internally, but only the highest-scoring
 * config is returned to the caller.
 *
 * @param date - The schedule date (YYYY-MM-DD)
 * @returns The best BuildConfig, with warnings/errors collected across all strategies.
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
    strategyNearestNeighbor(date),
    strategySingleRoute(date),
    strategyOriginGrouped(date),
  ]);

  const configs: BuildConfig[] = [];

  for (const result of results) {
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
    if (result.config.flights.length > 0) {
      configs.push(result.config);
    }
  }

  configs.sort((a, b) => b.score - a.score);

  const unassignedCount = configs.length > 0
    ? configs[0].flights.reduce((sum, f) => sum + f.passengerCount, 0)
    : 0;

  return { configs, allErrors, allWarnings, unassignedCount };
}
