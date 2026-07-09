// ── Build configuration types ────────────────────────────────────────────────
// Shared shapes produced by config-generator and scored here.

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

export interface FlightPlanLeg {
  leg_sequence: number;
  origin_code: string;
  destination_code: string;
  distance_nm: number;
  departure_time: string | null;
  arrival_time: string | null;
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
 * Weights (optimized for CVRP "minimum flights, shortest distance" objective):
 *   - Flight economy (35%): Penalizes high flight count. Fewer flights = higher score.
 *     Goal: minimize number of flights (primary).
 *   - Distance efficiency (25%): Lower total distance scores higher.
 *     Goal: shortest total distance (secondary).
 *   - Passenger coverage (25%): % of total passengers assigned.
 *     Goal: serve ALL unassigned passengers.
 *   - Feasibility (15%): Errors = 0, warnings = 50, clean = 100.
 */
export function scoreConfig(
  config: BuildConfig,
  warnings: string[],
  errors: string[],
  totalUnassignedPassengers?: number
): number {
  const metrics = computeMetrics(config.flights, warnings, errors);

  // Passenger coverage: how many of the total unassigned passengers are served
  const coverageScore = totalUnassignedPassengers && totalUnassignedPassengers > 0
    ? Math.min(100, (metrics.totalPassengers / totalUnassignedPassengers) * 100)
    : metrics.flightCount > 0 ? 100 : 0;

  // Flight economy: penalize high flight count
  // Baseline: 1 flight = 100, 10+ flights = 0
  const flightEconomyScore = metrics.flightCount > 0
    ? Math.max(0, 100 - (metrics.flightCount - 1) * 10)
    : 0;

  // Distance efficiency: lower total distance scores higher
  // Baseline ~200nm for a full Falklands sortie
  const distanceScore = Math.max(0, 100 - metrics.totalDistanceNm * 0.25);

  const feasibilityScore = metrics.hasErrors ? 0 : metrics.hasWarnings ? 50 : 100;

  const score =
    flightEconomyScore * 0.35 +
    distanceScore * 0.25 +
    coverageScore * 0.25 +
    feasibilityScore * 0.15;

  config.metrics = metrics;
  config.score = Math.round(Math.min(100, Math.max(0, score)));

  return config.score;
}
