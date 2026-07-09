/**
 * Phase 6: Lightweight route suggestion engine for draft flights.
 *
 * Runs server-side to query distance, heading, and aircraft data from the DB.
 * Uses greedy distance-based ordering to sequence stops and recommends
 * the smallest suitable aircraft.
 *
 * Algorithm:
 * 1. Collect unique aerodrome codes from passenger origins/destinations
 * 2. Find the most common origin — that's the starting point
 * 3. Use greedy distance-based ordering for remaining stops
 * 4. Compute total distance from DB-backed distance lookup
 * 5. Find the smallest suitable aircraft from the DB
 * 6. Check weight constraints
 * 7. Return the suggestion
 */

import { db } from "../db.server";
import type { RouteSuggestion, RouteSuggestionLeg } from "./scheduling-types";
import { loadDistances, clearDistanceCaches, getDistanceFast } from "./distance-lookup";

/**
 * Greedy distance-based stop ordering for route preview.
 * Visits the nearest unvisited aerodrome at each step.
 */
function orderStopsByDistance(start: string, stops: Set<string>): string[] {
  const unvisited = [...stops].filter((s) => s !== start);
  const ordered: string[] = [];
  let current = start;

  while (unvisited.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const dist = getDistanceFast(current, unvisited[i]);
      if (dist > 0 && dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }

    const next = nearestDist === Infinity ? unvisited[0] : unvisited[nearestIdx];
    ordered.push(next);
    current = next;
    unvisited.splice(unvisited.indexOf(next), 1);
  }

  return ordered;
}

interface PassengerInput {
    origin_code: string;
    destination_code: string;
    clothed_weight_kg: number;
    baggage_weight_kg: number;
}

interface AircraftSuggestion {
    registration: string;
    type: string;
    seat_count: number;
    empty_weight_kg: number;
    max_takeoff_weight_kg: number;
    fuel_capacity_kg: number;
}

// ── Cached DB data ────────────────────────────────────────────────────────────

let aircraftCache: AircraftSuggestion[] | null = null;

async function loadAircraft(): Promise<AircraftSuggestion[]> {
    if (aircraftCache) return aircraftCache;
    const rows = await db.aircraft.findMany({
        where: { is_active: true },
        select: {
            registration: true,
            type: true,
            seat_count: true,
            empty_weight_kg: true,
            max_takeoff_weight_kg: true,
            fuel_capacity_kg: true,
        },
    });
    aircraftCache = rows.map((r) => ({
        registration: r.registration,
        type: r.type,
        seat_count: r.seat_count,
        empty_weight_kg: Number(r.empty_weight_kg),
        max_takeoff_weight_kg: r.max_takeoff_weight_kg
            ? Number(r.max_takeoff_weight_kg)
            : 2994,
        fuel_capacity_kg: r.fuel_capacity_kg
            ? Number(r.fuel_capacity_kg)
            : 500,
    }));
    return aircraftCache;
}

/**
 * Clear caches (useful for testing).
 */
export function clearSuggestionCaches(): void {
    clearDistanceCaches();
    aircraftCache = null;
}

// ── Distance lookup ───────────────────────────────────────────────────────────

/**
 * Get the distance between two aerodromes in nautical miles.
 * Returns 0 if the distance is unknown.
 */
export async function getDistance(a: string, b: string): Promise<number> {
    if (a === b) return 0;
    const distances = await loadDistances();
    const row = distances.find(
        (d) =>
            (d.origin === a && d.destination === b) ||
            (d.origin === b && d.destination === a)
    );
    return row?.distance_nm ?? 0;
}

// ── Main suggestion function ─────────────────────────────────────────────────

/**
 * Suggest an optimized route for a set of passengers on a draft flight.
 *
 * This is a server-side function that:
 * 1. Collects unique aerodromes from passenger origins/destinations
 * 2. Finds the most common origin as the starting point
 * 3. Uses greedy distance-based ordering for remaining stops
 * 4. Computes total distance from DB
 * 5. Recommends the smallest suitable aircraft from DB
 * 6. Checks weight constraints
 *
 * @param passengers - Array of passenger data with origin/destination and weights
 * @returns A RouteSuggestion or null if no passengers
 */
export async function suggestRoute(
    passengers: PassengerInput[]
): Promise<RouteSuggestion | null> {
    if (passengers.length === 0) return null;

    const distances = await loadDistances();
    const aircraftList = await loadAircraft();

    // ── Step 1: Collect unique aerodromes ────────────────────────────────────
    const aerodromes = new Set<string>();
    const originCounts = new Map<string, number>();

    for (const p of passengers) {
        aerodromes.add(p.origin_code.toUpperCase());
        aerodromes.add(p.destination_code.toUpperCase());
        originCounts.set(
            p.origin_code.toUpperCase(),
            (originCounts.get(p.origin_code.toUpperCase()) ?? 0) + 1
        );
    }

    // ── Step 2: Find starting point (most common origin) ─────────────────────
    // Always start from STY (Stanley Airport — the base airport)
    const startPoint = "STY";

    // Ensure STY is in the aerodromes set so the route includes it
    aerodromes.add("STY");

    // ── Step 3: Build greedy distance-based route ─────────────────────────
    const orderedStops = orderStopsByDistance(startPoint, aerodromes);

    // ── Step 4: Build legs and compute total distance ────────────────────────
    const suggestedLegs: RouteSuggestionLeg[] = [];
    let totalDistanceNm = 0;
    let current = startPoint;

    for (let i = 0; i < orderedStops.length; i++) {
        const next = orderedStops[i];
        const row = distances.find(
            (d) =>
                (d.origin === current && d.destination === next) ||
                (d.origin === next && d.destination === current)
        );
        const dist = row?.distance_nm ?? 0;
        suggestedLegs.push({
            leg_sequence: i + 1,
            origin_code: current,
            destination_code: next,
            distance_nm: dist > 0 ? dist : null,
        });
        totalDistanceNm += dist;
        current = next;
    }

    // Always return to STY (round trip) — even for single-stop routes
    if (current !== startPoint) {
        const row = distances.find(
            (d) =>
                (d.origin === current && d.destination === startPoint) ||
                (d.origin === startPoint && d.destination === current)
        );
        const returnDist = row?.distance_nm ?? 0;
        suggestedLegs.push({
            leg_sequence: orderedStops.length + 1,
            origin_code: current,
            destination_code: startPoint,
            distance_nm: returnDist > 0 ? returnDist : null,
        });
        totalDistanceNm += returnDist;
    }

    // ── Step 5: Find smallest suitable aircraft ──────────────────────────────
    // Compute per-leg passenger max (not just total unique passengers)
    const stopOrderMap = new Map<string, number>();
    orderedStops.forEach((code, idx) => stopOrderMap.set(code, idx));
    const legCount = orderedStops.length - 1;
    const legPassengerCounts = new Array(legCount).fill(0);
    for (const p of passengers) {
      const boardIdx = stopOrderMap.get(p.origin_code.toUpperCase());
      const alightIdx = stopOrderMap.get(p.destination_code.toUpperCase());
      if (boardIdx != null && alightIdx != null && boardIdx < alightIdx) {
        for (let i = boardIdx; i < alightIdx; i++) {
          legPassengerCounts[i]++;
        }
      }
    }
    const passengerCount = Math.max(...legPassengerCounts, 0);
    const totalPassengerWeight = passengers.reduce(
        (sum, p) => sum + p.clothed_weight_kg + p.baggage_weight_kg,
        0
    );

    let aircraftRecommendation: string | null = null;
    let bestAircraft: AircraftSuggestion | null = null;

    for (const ac of aircraftList) {
        if (ac.seat_count < passengerCount) continue;

        // Estimate available payload: MTOW - empty weight - fuel (estimate ~100kg fuel for short hops)
        const estimatedFuelKg = Math.min(ac.fuel_capacity_kg, 100);
        const availablePayloadKg =
            ac.max_takeoff_weight_kg - ac.empty_weight_kg - estimatedFuelKg;

        if (availablePayloadKg >= totalPassengerWeight) {
            if (!bestAircraft || ac.seat_count < bestAircraft.seat_count) {
                bestAircraft = ac;
                aircraftRecommendation = `${ac.type} (${ac.registration})`;
            }
        }
    }

    // If no aircraft found, recommend the one with most capacity
    if (!bestAircraft && aircraftList.length > 0) {
        const maxCapacity = aircraftList.reduce((a, b) =>
            a.max_takeoff_weight_kg - a.empty_weight_kg >
                b.max_takeoff_weight_kg - b.empty_weight_kg
                ? a
                : b
        );
        aircraftRecommendation = `${maxCapacity.type} (${maxCapacity.registration}) — may exceed limits`;
    }

    // ── Step 6: Check weight constraints ─────────────────────────────────────
    const weightWarnings: string[] = [];

    if (bestAircraft) {
        const estimatedFuelKg = Math.min(bestAircraft.fuel_capacity_kg, 100);
        const availablePayloadKg =
            bestAircraft.max_takeoff_weight_kg -
            bestAircraft.empty_weight_kg -
            estimatedFuelKg;

        if (totalPassengerWeight > availablePayloadKg) {
            weightWarnings.push(
                `Total passenger + baggage weight (${totalPassengerWeight} kg) exceeds estimated payload capacity (${availablePayloadKg} kg)`
            );
        }

        if (passengerCount > bestAircraft.seat_count) {
            weightWarnings.push(
                `Passenger count (${passengerCount}) exceeds seat count (${bestAircraft.seat_count})`
            );
        }
    }

    // Check if any legs have unknown distances
    const unknownDistanceLegs = suggestedLegs.filter((l) => l.distance_nm === null);
    if (unknownDistanceLegs.length > 0) {
        weightWarnings.push(
            `Distance unknown for ${unknownDistanceLegs.length} leg(s) — route may not be optimal`
        );
    }

    return {
        suggested_legs: suggestedLegs,
        total_distance_nm: totalDistanceNm,
        stop_count: orderedStops.length,
        aircraft_recommendation: aircraftRecommendation,
        weight_warnings: weightWarnings,
    };
}
