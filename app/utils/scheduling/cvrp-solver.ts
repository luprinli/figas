/**
 * CVRP Solver using Clarke-Wright Savings algorithm.
 *
 * Given a set of passenger demands (origin\u2192destination with passenger count),
 * constructs optimal routes that:
 *   1. Start and end at the depot (STY)
 *   2. Respect aircraft capacity (max seats)
 *   3. Respect range constraints
 *   4. Minimize number of flights (primary objective)
 *   5. Minimize total distance (secondary objective)
 *
 * Algorithm phases:
 *   Phase 1: Build initial routes (one per demand as STY\u2192origin\u2192dest\u2192STY)
 *   Phase 2: Compute savings matrix for all route pairs
 *   Phase 3: Merge routes greedily by descending savings (capacity-constrained)
 *   Phase 4: Validate routes against constraints
 */

import type {
  PassengerDemand,
  CvrpRoute,
  DemandAssignment,
  SavingsPair,
  CvrpConfig,
  CvrpResult,
} from "./cvrp-types";

const DEPOT = "STY";

/**
 * Get distance between two aerodromes from the distance matrix.
 */
function dist(matrix: Map<string, number>, a: string, b: string): number {
  if (a === b) return 0;
  const key = `${a}->${b}`;
  const reverseKey = `${b}->${a}`;
  return matrix.get(key) ?? matrix.get(reverseKey) ?? 0;
}

/**
 * Phase 1: Build initial routes.
 * Each demand becomes its own route: STY \u2192 origin \u2192 destination \u2192 STY.
 * If origin is STY, route is: STY \u2192 destination \u2192 STY.
 * If destination is STY, route is: STY \u2192 origin \u2192 STY.
 */
function buildInitialRoutes(
  demands: PassengerDemand[],
  config: CvrpConfig
): CvrpRoute[] {
  const routes: CvrpRoute[] = [];

  for (const demand of demands) {
    const stops: string[] = [DEPOT];
    const assignments: DemandAssignment[] = [];

    // Boarding stop
    if (demand.origin !== DEPOT) {
      stops.push(demand.origin);
    }

    // Alighting stop
    if (demand.destination !== DEPOT && demand.destination !== demand.origin) {
      stops.push(demand.destination);
    }

    // Return to depot
    if (stops[stops.length - 1] !== DEPOT) {
      stops.push(DEPOT);
    }

    // Compute distance
    let totalDistance = 0;
    for (let i = 0; i < stops.length - 1; i++) {
      totalDistance += dist(config.distanceMatrix, stops[i], stops[i + 1]);
    }

    // Board and alight indices
    const boardIdx = demand.origin === DEPOT ? 0 : stops.indexOf(demand.origin);
    const alightIdx =
      demand.destination === DEPOT || demand.destination === demand.origin
        ? stops.length - 1
        : stops.indexOf(demand.destination);

    assignments.push({
      bookingLegId: demand.bookingLegId,
      passengerCount: demand.passengerCount,
      origin: demand.origin,
      destination: demand.destination,
      boardAtStopIndex: boardIdx,
      alightAtStopIndex: alightIdx,
    });

    routes.push({
      stops,
      assignments,
      totalDistanceNm: totalDistance,
      passengerCount: demand.passengerCount,
    });
  }

  return routes;
}

/**
 * Phase 2: Compute savings for all pairs (i, j).
 * Savings = d(DEPOT, i.lastReal) + d(DEPOT, j.firstReal) - d(i.lastReal, j.firstReal)
 * where lastReal is the last non-depot stop of i, and firstReal is the first non-depot stop of j.
 */
function computeSavings(
  routes: CvrpRoute[],
  config: CvrpConfig
): SavingsPair[] {
  const pairs: SavingsPair[] = [];

  for (let i = 0; i < routes.length; i++) {
    for (let j = 0; j < routes.length; j++) {
      if (i === j) continue;

      const routeI = routes[i];
      const routeJ = routes[j];

      // Get the "real" last stop of i (before returning to depot)
      const lastI = routeI.stops[routeI.stops.length - 2]; // second-to-last
      // Get the "real" first stop of j (after leaving depot)
      const firstJ = routeJ.stops[1]; // second

      if (!lastI || !firstJ) continue;

      const dDepotLast = dist(config.distanceMatrix, lastI, DEPOT);
      const dDepotFirst = dist(config.distanceMatrix, DEPOT, firstJ);
      const dBetween = dist(config.distanceMatrix, lastI, firstJ);

      const savings = dDepotLast + dDepotFirst - dBetween;

      pairs.push({ i, j, savings });
    }
  }

  // Sort by descending savings
  pairs.sort((a, b) => b.savings - a.savings);

  return pairs;
}

/**
 * Compute the maximum number of passengers on board at any leg of a route.
 * Uses per-leg tracking based on boardAtStopIndex and alightAtStopIndex.
 */
function computeMaxOnBoard(route: CvrpRoute): number {
  const legCount = route.stops.length - 1; // n stops \u2192 n-1 legs
  const perLeg = new Array(legCount).fill(0);
  for (const assignment of route.assignments) {
    for (let s = assignment.boardAtStopIndex; s < assignment.alightAtStopIndex; s++) {
      perLeg[s] += assignment.passengerCount;
    }
  }
  return Math.max(...perLeg, 0);
}

/**
 * Phase 3: Greedy merge of routes by descending savings.
 * Only merges if combined per-leg passenger count ≤ maxSeats.
 */
function mergeRoutes(
  routes: CvrpRoute[],
  pairs: SavingsPair[],
  config: CvrpConfig
): CvrpRoute[] {
  const merged = new Set<number>();

  for (const pair of pairs) {
    if (merged.has(pair.i) || merged.has(pair.j)) continue;
    if (pair.savings <= 0) continue; // No benefit to merging

    const routeI = routes[pair.i];
    const routeJ = routes[pair.j];

    // Capacity check: compute per-leg max for the potential merged route
    const mergedAssignments = mergeAssignments(
      routeI.assignments,
      routeJ.assignments,
      routeI.stops.length - 1
    );
    const maxOnBoard = computeMaxOnBoard({
      stops: mergeStops(routeI.stops, routeJ.stops),
      assignments: mergedAssignments,
      totalDistanceNm: 0,
      passengerCount: 0,
    });
    if (maxOnBoard > config.maxSeats) continue;

    // Range check: combined distance must not exceed max range
    const combinedDist = estimateMergedDistance(routeI, routeJ, config);
    if (combinedDist > config.maxRangeNm) continue;

    // Merge routeJ into routeI
    const newStops = mergeStops(routeI.stops, routeJ.stops);
    const newAssignments = mergeAssignments(
      routeI.assignments,
      routeJ.assignments,
      routeI.stops.length - 1 // insertion point (before depot of i)
    );

    const newDistance = computeRouteDistance(newStops, config);

    routes[pair.i] = {
      stops: newStops,
      assignments: newAssignments,
      totalDistanceNm: newDistance,
      passengerCount: computeMaxOnBoard({ stops: newStops, assignments: newAssignments, totalDistanceNm: newDistance, passengerCount: 0 }),
    };

    merged.add(pair.j);
  }

  // Return unmerged routes
  return routes.filter((_, idx) => !merged.has(idx));
}

/**
 * Estimate the distance of merging routeJ after routeI (before depot return).
 */
function estimateMergedDistance(
  routeI: CvrpRoute,
  routeJ: CvrpRoute,
  config: CvrpConfig
): number {
  const lastI = routeI.stops[routeI.stops.length - 2];
  const firstJ = routeJ.stops[1];
  const dBetween = dist(config.distanceMatrix, lastI, firstJ);
  return (
    routeI.totalDistanceNm +
    routeJ.totalDistanceNm -
    dist(config.distanceMatrix, lastI, DEPOT) -
    dist(config.distanceMatrix, DEPOT, firstJ) +
    dBetween
  );
}

/**
 * Merge stops: insert routeJ's non-depot stops before routeI's final depot.
 * Removes non-consecutive duplicates to avoid repeated stops.
 */
function mergeStops(stopsI: string[], stopsJ: string[]): string[] {
  const innerJ = stopsJ.slice(1, stopsJ.length - 1);
  const innerI = stopsI.slice(0, stopsI.length - 1);
  const combined = [...innerI];
  for (const stop of innerJ) {
    if (combined[combined.length - 1] !== stop) {
      combined.push(stop);
    }
  }
  combined.push(DEPOT);
  // Remove non-consecutive duplicates (keep first occurrence, always preserve depot)
  const seen = new Set<string>();
  return combined.filter((s) => {
    if (s === DEPOT) return true;
    if (seen.has(s)) return false;
    seen.add(s);
    return true;
  });
}

/**
 * Merge assignments: shift routeJ's stop indices by insertion point.
 */
function mergeAssignments(
  aI: DemandAssignment[],
  aJ: DemandAssignment[],
  insertAt: number
): DemandAssignment[] {
  return [
    ...aI,
    ...aJ.map((a) => ({
      ...a,
      boardAtStopIndex: a.boardAtStopIndex + insertAt - 1, // -1 for removed depot
      alightAtStopIndex: a.alightAtStopIndex + insertAt - 1,
    })),
  ];
}

/**
 * Compute total distance for a sequence of stops.
 */
function computeRouteDistance(
  stops: string[],
  config: CvrpConfig
): number {
  let total = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    total += dist(config.distanceMatrix, stops[i], stops[i + 1]);
  }
  return total;
}

/**
 * Main CVRP solver entry point.
 */
export function solveCvrp(
  demands: PassengerDemand[],
  config: CvrpConfig
): CvrpResult {
  if (demands.length === 0) {
    return { routes: [], unservedDemands: [] };
  }

  // Phase 1: Initial routes
  const initialRoutes = buildInitialRoutes(demands, config);

  // Phase 2: Compute savings
  const savings = computeSavings(initialRoutes, config);

  // Phase 3: Merge routes
  const mergedRoutes = mergeRoutes(initialRoutes, savings, config);

  // Phase 4: Detect unserved demands (if any routes exceeded capacity and couldn't merge)
  const servedIds = new Set<number>();
  for (const route of mergedRoutes) {
    for (const a of route.assignments) {
      servedIds.add(a.bookingLegId);
    }
  }
  const unserved = demands.filter((d) => !servedIds.has(d.bookingLegId));

  return {
    routes: mergedRoutes,
    unservedDemands: unserved,
  };
}

/**
 * Convert a CVRP route to a string representation (for testing/debugging).
 */
export function routeToString(route: CvrpRoute): string {
  return `${route.stops.join(" \u2192 ")} | ${route.passengerCount} pax | ${route.totalDistanceNm}nm`;
}
