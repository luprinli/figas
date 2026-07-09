/**
 * CVRP route validator.
 *
 * Integrates with the existing flight-validation.ts module to validate
 * CVRP-generated routes against aircraft constraints (MTOW, MLW, fuel,
 * range, seat count, aerodrome limits, runway derating).
 */

import type { CvrpRoute, PassengerDemand } from "./cvrp-types";
import {
  validateFlight,
  type ValidationPassenger,
  type ValidationLeg,
  type ValidationAircraft,
} from "./flight-validation";

interface ValidationContext {
  aircraft: ValidationAircraft;
  averagePassengerWeightKg: number;
}

interface RouteValidationResult {
  routeIndex: number;
  route: CvrpRoute;
  feasible: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate all CVRP routes against flight constraints.
 * Routes that fail validation are flagged as infeasible with specific reasons.
 */
export async function validateCvrpRoutes(
  routes: CvrpRoute[],
  demands: PassengerDemand[],
  ctx: ValidationContext
): Promise<RouteValidationResult[]> {
  const results: RouteValidationResult[] = [];

  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Build passenger list for this route
      const passengers: ValidationPassenger[] = [];
      for (const a of route.assignments) {
        const demand = demands.find((d) => d.bookingLegId === a.bookingLegId);
        if (!demand) continue;
        // Each passenger demand creates N individual passengers
        for (let p = 0; p < a.passengerCount; p++) {
          passengers.push({
            id: `${a.bookingLegId}-${p}`,
            name: `Pax-${a.bookingLegId}-${p}`,
            origin_code: a.origin,
            destination_code: a.destination,
            clothed_weight_kg: ctx.averagePassengerWeightKg,
            baggage_weight_kg: 0,
          });
        }
      }

      // Build leg sequence from stops
      const legs: ValidationLeg[] = [];
      for (let s = 0; s < route.stops.length - 1; s++) {
        legs.push({
          leg_sequence: s + 1,
          origin_code: route.stops[s],
          destination_code: route.stops[s + 1],
          distance_nm: null,
        });
      }

      const result = await validateFlight(
        passengers,
        legs,
        ctx.aircraft
      );

      if (result.status === "violation") {
        errors.push(`Route ${i + 1}: ${result.weight_warnings.join("; ") || "Flight validation failed"}`);
      }
      if (result.weight_warnings.length > 0) {
        warnings.push(...result.weight_warnings.map((w) => `Route ${i + 1}: ${w}`));
      }

      results.push({
        routeIndex: i,
        route,
        feasible: result.status !== "violation",
        errors,
        warnings,
      });
    } catch (err) {
      results.push({
        routeIndex: i,
        route,
        feasible: false,
        errors: [`Route ${i + 1}: validation error — ${err instanceof Error ? err.message : "unknown"}`],
        warnings: [],
      });
    }
  }

  return results;
}

/**
 * Filter routes to only those that pass validation.
 */
export function filterFeasibleRoutes(
  results: RouteValidationResult[]
): CvrpRoute[] {
  return results.filter((r) => r.feasible).map((r) => r.route);
}

/**
 * Collect all validation errors and warnings from results.
 */
export function collectValidationIssues(
  results: RouteValidationResult[]
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const r of results) {
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  }
  return { errors, warnings };
}
