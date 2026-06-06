/**
 * Passenger Route Insertion Algorithm
 *
 * When a booking leg is dropped onto an existing flight, this module computes
 * the optimal insertion point for the passenger's origin and destination stops
 * within the flight's current leg sequence.
 *
 * Strategy:
 * - If the origin is already a stop on the route, only the destination needs
 *   to be inserted (as a new leg from origin → destination).
 * - If the destination is already a stop, only the origin needs to be inserted.
 * - If neither exists, find the edge where inserting both stops adds the
 *   least additional distance.
 * - If both already exist as consecutive stops, no change is needed.
 */

import { getDistance } from "./suggest-route.server";

export interface RouteLeg {
  leg_sequence: number;
  origin_code: string;
  destination_code: string;
}

export interface InsertionResult {
  legs: RouteLeg[];
  inserted: boolean;
  reason: "already_on_route" | "origin_exists" | "destination_exists" | "both_inserted" | "invalid";
}

/**
 * Compute the ordered list of unique stops from a set of route legs.
 * e.g., [{PSY→MPA}, {MPA→PSY}] → ["PSY", "MPA", "PSY"]
 */
function getStopSequence(legs: RouteLeg[]): string[] {
  if (legs.length === 0) return [];
  const stops: string[] = [legs[0].origin_code];
  for (const leg of legs) {
    stops.push(leg.destination_code);
  }
  return stops;
}

/**
 * Rebuild route legs from an ordered list of stops.
 * e.g., ["PSY", "MPA", "PSY"] → [{PSY→MPA}, {MPA→PSY}]
 */
function stopsToLegs(stops: string[]): RouteLeg[] {
  const legs: RouteLeg[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    legs.push({
      leg_sequence: i + 1,
      origin_code: stops[i],
      destination_code: stops[i + 1],
    });
  }
  return legs;
}

/**
 * Find the best position to insert a new stop into an existing stop sequence.
 * Uses distance minimization to find the optimal insertion point.
 */
async function findBestInsertionIndex(
  stops: string[],
  newStop: string
): Promise<number> {
  let bestIndex = stops.length; // default: append at end
  let bestExtraDistance = Infinity;

  for (let i = 0; i <= stops.length; i++) {
    // Simulate inserting newStop at position i
    const prev = i > 0 ? stops[i - 1] : null;
    const next = i < stops.length ? stops[i] : null;

    let extraDistance = 0;
    if (prev && next) {
      // Replacing edge prev→next with prev→newStop + newStop→next
      const originalDist = await getDistance(prev, next);
      const newDist1 = await getDistance(prev, newStop);
      const newDist2 = await getDistance(newStop, next);
      extraDistance = newDist1 + newDist2 - originalDist;
    } else if (prev) {
      // Appending at end: prev→newStop
      extraDistance = await getDistance(prev, newStop);
    } else if (next) {
      // Prepending at start: newStop→next
      extraDistance = await getDistance(newStop, next);
    }

    if (extraDistance < bestExtraDistance) {
      bestExtraDistance = extraDistance;
      bestIndex = i;
    }
  }

  return bestIndex;
}

/**
 * Insert a passenger's route (origin → destination) into an existing
 * flight's leg sequence.
 *
 * @param currentLegs - The flight's current legs (ordered by leg_sequence)
 * @param passengerOrigin - The passenger's origin aerodrome code
 * @param passengerDest - The passenger's destination aerodrome code
 * @returns The updated leg sequence and a reason code
 */
export async function insertPassengerRoute(
  currentLegs: RouteLeg[],
  passengerOrigin: string,
  passengerDest: string
): Promise<InsertionResult> {
  // Validate: origin and destination must be different
  if (passengerOrigin === passengerDest) {
    return { legs: currentLegs, inserted: false, reason: "invalid" };
  }

  const stops = getStopSequence(currentLegs);

  // Check if origin is already a stop
  const originIndex = stops.indexOf(passengerOrigin);
  const destIndex = stops.indexOf(passengerDest);

  // Case 1: Both already exist on the route
  if (originIndex !== -1 && destIndex !== -1) {
    // Check if they're already consecutive in the right order
    if (destIndex === originIndex + 1) {
      return { legs: currentLegs, inserted: false, reason: "already_on_route" };
    }
    // They exist but not consecutively — the passenger can travel via the existing route
    // No leg change needed since the passenger can board at origin and alight at destination
    return { legs: currentLegs, inserted: false, reason: "already_on_route" };
  }

  // Case 2: Origin exists, destination doesn't — insert destination after origin
  if (originIndex !== -1) {
    const insertAt = await findBestInsertionIndex(stops, passengerDest);
    const newStops = [...stops];
    newStops.splice(insertAt, 0, passengerDest);
    return {
      legs: stopsToLegs(newStops),
      inserted: true,
      reason: "destination_exists",
    };
  }

  // Case 3: Destination exists, origin doesn't — insert origin before destination
  if (destIndex !== -1) {
    const insertAt = await findBestInsertionIndex(stops, passengerOrigin);
    const newStops = [...stops];
    newStops.splice(insertAt, 0, passengerOrigin);
    return {
      legs: stopsToLegs(newStops),
      inserted: true,
      reason: "origin_exists",
    };
  }

  // Case 4: Neither exists — find optimal insertion for both
  // Strategy: try inserting origin first, then destination after origin
  let bestLegs: RouteLeg[] = [];
  let bestDistance = Infinity;

  // Try inserting origin at each position, then destination after it
  for (let oi = 0; oi <= stops.length; oi++) {
    const withOrigin = [...stops];
    withOrigin.splice(oi, 0, passengerOrigin);

    // Now find best position for destination (must be after origin)
    const originActualIndex = oi;
    for (let di = originActualIndex + 1; di <= withOrigin.length; di++) {
      const withBoth = [...withOrigin];
      withBoth.splice(di, 0, passengerDest);

      // Calculate total distance of this route
      let totalDist = 0;
      for (let i = 0; i < withBoth.length - 1; i++) {
        totalDist += await getDistance(withBoth[i], withBoth[i + 1]);
      }

      if (totalDist < bestDistance) {
        bestDistance = totalDist;
        bestLegs = stopsToLegs(withBoth);
      }
    }
  }

  return {
    legs: bestLegs.length > 0 ? bestLegs : currentLegs,
    inserted: bestLegs.length > 0,
    reason: bestLegs.length > 0 ? "both_inserted" : "invalid",
  };
}
