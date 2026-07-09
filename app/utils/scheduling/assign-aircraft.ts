import { kdb } from "../db.server.kysely";
import { sql } from "kysely";
import type { DB } from "../../../generated/kysely/database";
import { aircraftRepository } from "../repositories/aircraft";
import type { RouteResult, AircraftAssignmentResult } from "./types";
import { computeFuelPlan, computeFlightTime } from "./fuel-planning";
import { checkAirframeFeasibility } from "../airframe-hours.server";

/**
 * Phase 3: Assign aircraft to routes based on capacity and availability.
 *
 * For each route, evaluates all active aircraft to find the best fit:
 * - Must have enough seats for the passenger count
 * - Must have sufficient payload capacity (MTOW - empty weight - fuel)
 * - Must not already be assigned to another flight on the same day with overlapping times
 * - Prefers aircraft with closest matching capacity (not oversized)
 */
export async function assignAircraft(
  route: RouteResult,
  passengerCount: number,
  maxOnBoardCount?: number
): Promise<AircraftAssignmentResult> {
  const aircraftList = await aircraftRepository.findAll();
  const effectivePaxCount = maxOnBoardCount ?? passengerCount;

  // Compute fuel for the total route distance
  const totalFlightTimeMinutes = computeFlightTime(route.totalDistanceNm);
  const fuelPlan = await computeFuelPlan(totalFlightTimeMinutes, 1, 0, true);
  const fuelWeightKg = fuelPlan.fuelOnBoardKg;

  // Extract the proposed flight's departure and arrival times for overlap checking
  const proposedDeparture = new Date(route.flight.departure_time);
  const proposedArrival = new Date(route.flight.arrival_time);

  // Determine the date boundary for the same-day check (UTC date of departure)
  const proposedDate = proposedDeparture.toISOString().slice(0, 10);

  let bestAssignment: AircraftAssignmentResult | null = null;

  for (const aircraft of aircraftList) {
    // Check seat capacity
    if (aircraft.seat_count < effectivePaxCount) {
      continue;
    }

    // Compute available payload: MTOW - empty weight - fuel
    const availablePayloadKg =
      aircraft.max_takeoff_weight_kg -
      aircraft.empty_weight_kg -
      fuelWeightKg;

    // Check if payload is sufficient (assume ~70kg per passenger minimum)
    const minPassengerWeight = effectivePaxCount * 70;
    if (availablePayloadKg < minPassengerWeight) {
      continue;
    }

    // ── Aircraft availability check (G-09) ────────────────────────────────
    // Query existing flights on the same date that already have this aircraft assigned,
    // excluding the current flight itself (to handle re-assignment scenarios).
    const conflictingFlights = await kdb.selectFrom("flights")
      .select(["id", "departure_time", "arrival_time"])
      .where("aircraft_id", "=", aircraft.id)
      .where("id", "!=", route.flight.id)
      .where("departure_time", ">=", new Date(`${proposedDate}T00:00:00.000Z`) as any)
      .where("departure_time", "<", new Date(`${proposedDate}T23:59:59.999Z`) as any)
      .execute();

    // Check for time overlap with any existing assignment
    const hasOverlap = conflictingFlights.some((existing) => {
      const existingDeparture = new Date(existing.departure_time);
      const existingArrival = new Date(existing.arrival_time);
      // Overlap occurs when one interval starts before the other ends
      // and ends after the other starts.
      return proposedDeparture < existingArrival && proposedArrival > existingDeparture;
    });

    if (hasOverlap) {
      continue; // Skip this aircraft — it's already booked for an overlapping slot
    }

    // Check airframe hours before maintenance
    const plannedDurationHours = totalFlightTimeMinutes / 60;
    const hoursCheck = await checkAirframeFeasibility(aircraft.id, plannedDurationHours);
    if (!hoursCheck.feasible) {
      continue; // Skip — would exceed maintenance window
    }

    // This aircraft is feasible and available
    const assignment: AircraftAssignmentResult = {
      aircraft,
      route,
      availablePayloadKg,
      feasible: true,
    };

    // Prefer the aircraft with the closest seat count match (not oversized)
    if (
      !bestAssignment ||
      Math.abs(aircraft.seat_count - effectivePaxCount) <
      Math.abs(bestAssignment.aircraft.seat_count - effectivePaxCount)
    ) {
      bestAssignment = assignment;
    }
  }

  // If no feasible aircraft found, return the first aircraft as infeasible
  if (!bestAssignment && aircraftList.length > 0) {
    const fallback = aircraftList[0];
    const fuelPlan = await computeFuelPlan(totalFlightTimeMinutes, 1, 0, true);
    const fuelWeightKg = fuelPlan.fuelOnBoardKg;
    const availablePayloadKg =
      fallback.max_takeoff_weight_kg -
      fallback.empty_weight_kg -
      fuelWeightKg;

    return {
      aircraft: fallback,
      route,
      availablePayloadKg,
      feasible: false,
      infeasibilityReason: `No aircraft with sufficient capacity. Need ${effectivePaxCount} seats, max available is ${fallback.seat_count}.`,
    };
  }

  return bestAssignment!;
}

/**
 * Assign aircraft to multiple routes, returning results for all.
 */
export async function assignAircraftToRoutes(
  routes: RouteResult[],
  passengerCounts: Map<number, number>
): Promise<AircraftAssignmentResult[]> {
  const results: AircraftAssignmentResult[] = [];

  for (const route of routes) {
    const count = passengerCounts.get(route.flight.id) ?? 0;
    const result = await assignAircraft(route, count);
    results.push(result);
  }

  return results;
}
