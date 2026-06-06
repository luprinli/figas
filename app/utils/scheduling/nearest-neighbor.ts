/**
 * Phase 2: Construct optimal route using nearest-neighbor heuristic.
 * For each cluster, builds a sortie route: Stanley → stop1 → stop2 → ... → Stanley.
 *
 * The nearest-neighbor heuristic selects the next closest unvisited aerodrome
 * at each step. Since the Falklands route network is small (≤30 aerodromes),
 * this is sufficient and avoids the complexity of 2-opt or OR-Tools.
 *
 * Distance/heading cache and core ordering logic are delegated to shared modules
 * (distance-cache.ts and route-builder.ts) to eliminate duplication with
 * suggest-route.server.ts.
 */

import type { ClusterResult, RouteResult, RouteStop } from "./types";
import type { FlightRow } from "../repositories/flight";
import {
  loadDistances,
  loadHeadings,
  getDistance,
  getHeading,
  clearDistanceCaches,
} from "./distance-cache";
import { nearestNeighborOrder } from "./route-builder";

/**
 * Build a route for a cluster using nearest-neighbor.
 * The route always starts and ends at Stanley (PSY).
 */
export async function buildRoute(
  cluster: ClusterResult,
  flight: FlightRow
): Promise<RouteResult> {
  const distances = await loadDistances();
  const headings = await loadHeadings();

  const STANLEY = "STY";
  const stops: RouteStop[] = [];
  let totalDistanceNm = 0;
  let legSequence = 0;

  // Collect unique aerodromes to visit (excluding Stanley)
  const aerodromesToVisit = new Set<string>();
  for (const leg of cluster.legs) {
    if (leg.origin_code !== STANLEY) aerodromesToVisit.add(leg.origin_code);
    if (leg.destination_code !== STANLEY) aerodromesToVisit.add(leg.destination_code);
  }

  // Use shared nearest-neighbor ordering
  const ordered = nearestNeighborOrder(STANLEY, aerodromesToVisit, distances);

  // Build stops from the ordered list
  let current = STANLEY;
  for (const next of ordered) {
    legSequence++;
    const dist = getDistance(distances, current, next);
    stops.push({
      aerodromeCode: next,
      legSequence,
      distanceNm: dist,
      heading: getHeading(headings, current, next),
    });
    totalDistanceNm += dist;
    current = next;
  }

  // Return to Stanley
  const returnDist = getDistance(distances, current, STANLEY);
  {
    legSequence++;
    stops.push({
      aerodromeCode: STANLEY,
      legSequence,
      distanceNm: returnDist,
      heading: getHeading(headings, current, STANLEY),
    });
    totalDistanceNm += returnDist;
  }

  // Estimate flight time: assume ~140 knots cruise speed (BN-2 Islander typical)
  const cruiseSpeedKtas = 140;
  const estimatedFlightTimeHours = totalDistanceNm / cruiseSpeedKtas;

  return {
    flight,
    stops,
    totalDistanceNm,
    estimatedFlightTimeHours,
  };
}

/**
 * Clear caches (useful for testing).
 * Re-exports the shared clearDistanceCaches for backward compatibility.
 */
export { clearDistanceCaches as clearRouteCaches };
