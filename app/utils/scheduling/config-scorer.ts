import type { RouteResult, AircraftAssignmentResult, PilotAssignmentResult, WeightBalanceResult } from "./types";
import type { ClusterResult } from "./types";

export interface BuildMetrics {
  totalDistanceNm: number;
  totalPassengers: number;
  totalFlightTimeHours: number;
  flightCount: number;
  avgPassengersPerFlight: number;
  aircraftUtilization: number;
  hasWarnings: boolean;
  hasErrors: boolean;
  warningCount: number;
}

export interface BuildConfig {
  id: string;
  strategy: string;
  scheduleDate: string;
  flights: FlightPlan[];
  score: number;
  metrics: BuildMetrics;
}

export interface FlightPlanLeg {
  leg_sequence: number;
  origin_code: string;
  destination_code: string;
  distance_nm: number;
  departure_time: string | null;
  arrival_time: string | null;
}

export interface PassengerManifest {
  id: number;
  booking_leg_id: number;
  passenger_name: string;
  body_weight_kg: number;
  baggage_weight_kg: number;
  freight_weight_kg: number;
  origin_code: string;
  destination_code: string;
}

export interface FlightPlan {
  flightNumber: string;
  originCode: string;
  destinationCode: string;
  stops: string[];
  legs: FlightPlanLeg[];
  passengerManifests: PassengerManifest[];
  bookingLegIds: number[];
  passengerCount: number;
  totalPassengerWeightKg: number;
  aircraftRegistration: string;
  aircraftType: string;
  seatCount: number;
  totalDistanceNm: number;
  estimatedFlightTimeHours: number;
  pilotName: string | null;
  weightWarnings: string[];
  isFeasible: boolean;
}

function computeMetrics(
  plans: FlightPlan[],
  warnings: string[],
  errors: string[]
): BuildMetrics {
  const totalDistanceNm = plans.reduce((s, p) => s + p.totalDistanceNm, 0);
  const totalPassengers = plans.reduce((s, p) => s + p.passengerCount, 0);
  const totalFlightTimeHours = plans.reduce((s, p) => s + p.estimatedFlightTimeHours, 0);
  const flightCount = plans.length;
  const avgPassengersPerFlight = flightCount > 0 ? totalPassengers / flightCount : 0;
  const totalSeats = plans.reduce((s, p) => s + p.seatCount, 0);
  const aircraftUtilization = totalSeats > 0 ? totalPassengers / totalSeats : 0;

  return {
    totalDistanceNm,
    totalPassengers,
    totalFlightTimeHours,
    flightCount,
    avgPassengersPerFlight,
    aircraftUtilization,
    hasWarnings: warnings.length > 0,
    hasErrors: errors.length > 0,
    warningCount: warnings.length,
  };
}

/**
 * Score a build configuration on a 0-100 scale.
 *
 * Weights:
 *   - Passenger fit (30%): How well passengers are distributed across flights.
 *     Penalizes overstuffed flights and fragmented single-passenger flights.
 *   - Distance efficiency (25%): Lower total distance scores higher.
 *     Baseline ~200nm for a full Falklands sortie.
 *   - Aircraft utilization (25%): Higher seat fill rate = better.
 *   - Feasibility (20%): Errors = 0, warnings = 50, clean = 100.
 */
export function scoreConfig(
  config: BuildConfig,
  warnings: string[],
  errors: string[]
): number {
  const metrics = computeMetrics(config.flights, warnings, errors);

  const passengerFitScore = metrics.flightCount > 0
    ? Math.min(100, metrics.avgPassengersPerFlight * 20)
    : 0;

  const distanceScore = Math.max(0, 100 - metrics.totalDistanceNm * 0.25);

  const utilizationScore = metrics.aircraftUtilization * 100;

  const feasibilityScore = metrics.hasErrors ? 0 : metrics.hasWarnings ? 50 : 100;

  const score =
    passengerFitScore * 0.30 +
    distanceScore * 0.25 +
    utilizationScore * 0.25 +
    feasibilityScore * 0.20;

  config.metrics = metrics;
  config.score = Math.round(Math.min(100, Math.max(0, score)));

  return config.score;
}
