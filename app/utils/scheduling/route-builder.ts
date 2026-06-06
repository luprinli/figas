/**
 * Shared nearest-neighbor route builder.
 *
 * Both nearest-neighbor.ts and suggest-route.server.ts previously implemented
 * identical nearest-neighbor algorithms. This module consolidates the core
 * ordering logic so both callers can share it.
 *
 * The core function — nearestNeighborOrder() — returns an ordered list of
 * aerodrome codes. Each caller then maps those codes into its own result type
 * (RouteResult vs RouteSuggestion).
 */

import type { DistanceRow } from "./distance-cache";
import { getDistanceFast } from "./distance-cache";

/**
 * Order a set of aerodrome codes using the nearest-neighbor heuristic.
 *
 * @param start - The starting aerodrome code (excluded from the returned array)
 * @param stops - Set of aerodrome codes to visit (may include start; it is filtered out)
 * @param distances - Pre-loaded distance lookup table
 * @returns Ordered array of aerodrome codes (starting point excluded)
 */
export function nearestNeighborOrder(
  start: string,
  stops: Set<string>,
  distances: DistanceRow[]
): string[] {
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

    // If no distance found (all unknown), just take the first remaining
    const next = nearestDist === Infinity ? unvisited[0] : unvisited[nearestIdx];
    ordered.push(next);
    current = next;
    unvisited.splice(unvisited.indexOf(next), 1);
  }

  return ordered;
}
