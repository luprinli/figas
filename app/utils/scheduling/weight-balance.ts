import type { AircraftAssignmentResult, WeightBalanceResult, BindingConstraintInfo } from "./types";
import type { FlightLegRow } from "../repositories/flight-leg";
import type { AerodromeRow } from "../repositories/aerodrome";
import { aerodromeRepository } from "../repositories/aerodrome";
import { computeFuelPlan, computeFlightTime } from "./fuel-planning";
import { applyRunwayDerating } from "./runway-derating";
import { db } from "../db.server";

/**
 * Phase 4: Compute weight and balance for each leg of a route.
 *
 * For each leg, calculates:
 * - Total weight (passengers + baggage + freight + fuel + crew + empty)
 * - CG position (moment / weight)
 * - Effective MTOW/MLW (MIN of aircraft limit and aerodrome limit)
 * - Runway derating for strips < 400m (5% per 100m below 400m)
 * - Binding constraint (which limit is closest to being exceeded)
 *
 * Passenger weights are read from booking_leg_passengers (clothed_weight_kg,
 * baggage_weight_kg, freight_weight_kg) via the bookingLegPassengerRepository.
 * Crew: 80 kg per pilot (2 pilots for BN-2 Islander)
 * Empty weight: from aircraft record
 */

const STANDARD_CREW_WEIGHT_KG = 80;
const CREW_COUNT = 1; // single-crew operation (captain only)
const CRUISE_SPEED_KTAS = 140; // BN-2 Islander typical cruise speed
const TAXI_MINUTES = 10;

/**
 * Per-leg passenger weight data loaded from booking_leg_passengers.
 */
export interface LegPassengerWeights {
  /** Number of passengers on this leg */
  passengerCount: number;
  /** Sum of clothed_weight_kg from booking_leg_passengers */
  passengerWeightKg: number;
  /** Sum of baggage_weight_kg from booking_leg_passengers */
  baggageWeightKg: number;
  /** Sum of freight_weight_kg from booking_leg_passengers */
  freightWeightKg: number;
}

/**
 * Minimal leg interface that both FlightLegRow and BookingLegRow satisfy.
 */
interface WeightLeg {
  id: number;
  origin_code: string;
  destination_code: string;
  freight_weight_kg?: number | null;
}

/**
 * Compute weight and balance for a single leg.
 * Passenger weights are provided as pre-computed aggregates from booking_leg_passengers.
 */
export async function computeWeightBalance(
  assignment: AircraftAssignmentResult,
  leg: WeightLeg,
  legDistanceNm: number,
  aerodromeCache: Map<string, AerodromeRow>,
  sectorsSoFar: number,
  previousFuelRemainingKg: number,
  isStanleyDeparture: boolean,
  passengerWeights?: LegPassengerWeights
): Promise<WeightBalanceResult> {
  const aircraft = assignment.aircraft;

  // ── Passenger weight (from booking_leg_passengers or fallback) ────────────
  const passengerWeightKg = passengerWeights?.passengerWeightKg ?? 0;
  const baggageWeightKg = passengerWeights?.baggageWeightKg ?? 0;

  // ── Freight weight (per-passenger freight + leg-level freight) ────────────
  const perPassengerFreightKg = passengerWeights?.freightWeightKg ?? 0;
  const freightWeightKg = perPassengerFreightKg + (leg.freight_weight_kg ?? 0);

  // ── Compute flight time from distance ─────────────────────────────────────
  const flightTimeMinutes = computeFlightTime(legDistanceNm, CRUISE_SPEED_KTAS, TAXI_MINUTES);

  // ── Fuel plan ─────────────────────────────────────────────────────────────
  const fuelPlan = await computeFuelPlan(
    flightTimeMinutes,
    sectorsSoFar,
    previousFuelRemainingKg,
    isStanleyDeparture
  );
  const fuelWeightKg = fuelPlan.fuelOnBoardKg;

  // ── Crew weight ───────────────────────────────────────────────────────────
  const crewWeightKg = CREW_COUNT * STANDARD_CREW_WEIGHT_KG;

  // ── Empty weight ──────────────────────────────────────────────────────────
  const emptyWeightKg = aircraft.empty_weight_kg;

  // ── Zero fuel weight (includes pilot weight per data contract) ────────────
  const zeroFuelWeightKg =
    passengerWeightKg + baggageWeightKg + freightWeightKg + crewWeightKg;

  // ── Total weight (ramp weight) ────────────────────────────────────────────
  const rampWeightKg = zeroFuelWeightKg + fuelWeightKg;
  const taxiFuelKg = 5; // standard taxi fuel
  const takeoffWeightKg = rampWeightKg - taxiFuelKg;
  const landingWeightKg = takeoffWeightKg - fuelPlan.fuelBurnKg;

  // ── CG calculation (moment/weight) using aircraft-specific arm positions ──
  // Arms are read from the aircraft record (metres from datum).
  // Fall back to sensible defaults if the aircraft record has NULL arms.
  const emptyArmM     = aircraft.empty_arm_m     ?? 2.5;
  const crewArmM      = aircraft.crew_arm_m      ?? 2.0;
  const passengerArmM = aircraft.passenger_arm_m ?? 3.5;
  const baggageArmM   = aircraft.baggage_arm_m   ?? 4.5;
  const freightArmM   = aircraft.freight_arm_m   ?? 4.0;
  const fuelArmM      = aircraft.fuel_arm_m      ?? 3.0;

  const totalMomentKgm =
    emptyWeightKg * emptyArmM +
    crewWeightKg * crewArmM +
    passengerWeightKg * passengerArmM +
    baggageWeightKg * baggageArmM +
    freightWeightKg * freightArmM +
    fuelWeightKg * fuelArmM;

  const cgPositionPct =
    rampWeightKg > 0 ? (totalMomentKgm / rampWeightKg) * 100 : 0;

  // ── Effective limits ─────────────────────────────────────────────────────
  // Get destination aerodrome limits (landing constraints)
  const destinationAerodrome = aerodromeCache.get(leg.destination_code);

  // Aircraft structural limits
  const aircraftMtow = aircraft.max_takeoff_weight_kg;
  // Use max_landing_weight_kg if available, otherwise fall back to MTOW
  const aircraftMlw =
    ((aircraft as unknown as Record<string, unknown>).max_landing_weight_kg as number) ??
    aircraftMtow;

  // Aerodrome limits (with null coalescing to Infinity for missing data)
  const aerodromeMtowLimit = destinationAerodrome
    ? ((destinationAerodrome as AerodromeRow & { mtow_limit_kg?: number | null }).mtow_limit_kg ?? Infinity)
    : Infinity;
  const aerodromeMlwLimit = destinationAerodrome
    ? ((destinationAerodrome as AerodromeRow & { mlw_limit_kg?: number | null }).mlw_limit_kg ?? Infinity)
    : Infinity;

  // Effective MTOW = MIN(aircraft structural MTOW, destination aerodrome MTOW limit)
  let effectiveMtowKg = Math.min(aircraftMtow, aerodromeMtowLimit);

  // Effective MLW = MIN(aircraft structural MLW, destination aerodrome MLW limit)
  let effectiveMlwKg = Math.min(aircraftMlw, aerodromeMlwLimit);

  // ── Runway derating for short strips ─────────────────────────────────────
  // For strips < 400m, reduce effective MTOW/MLW by 5% per 100m below 400m
  const runwayLength = destinationAerodrome?.runway_length ?? null;
  effectiveMtowKg = applyRunwayDerating(effectiveMtowKg, runwayLength);
  effectiveMlwKg = applyRunwayDerating(effectiveMlwKg, runwayLength);

  // ── Utilization percentages ──────────────────────────────────────────────
  const mtowUsedPct =
    effectiveMtowKg > 0 ? (takeoffWeightKg / effectiveMtowKg) * 100 : 0;
  const mlwUsedPct =
    effectiveMlwKg > 0 ? (landingWeightKg / effectiveMlwKg) * 100 : 0;

  // ── Binding constraint ───────────────────────────────────────────────────
  const bindingConstraint = determineBindingConstraint(
    takeoffWeightKg,
    effectiveMtowKg,
    effectiveMlwKg,
    aircraftMtow,
    aerodromeMtowLimit,
    aircraftMlw,
    aerodromeMlwLimit,
    destinationAerodrome
  );

  return {
    flightLegId: leg.id,
    passengerWeightKg,
    baggageWeightKg,
    freightWeightKg,
    fuelWeightKg,
    crewWeightKg,
    emptyWeightKg,
    totalWeightKg: rampWeightKg,
    fuelPlan,
    totalMomentKgm,
    cgPositionPct,
    effectiveMtowKg,
    effectiveMlwKg,
    mtowUsedPct,
    mlwUsedPct,
    bindingConstraint,
  };
}

/**
 * Load passenger weight data from booking_leg_passengers for a set of flight legs.
 *
 * For each flight leg, finds the associated booking legs (via the flight's booking_legs)
 * and aggregates passenger weights from booking_leg_passengers.
 *
 * @param flightId - The flight ID whose booking legs to look up
 * @param legs - The flight legs (used to map results by leg id)
 * @returns Map of flight_leg_id -> LegPassengerWeights
 */
export async function loadPassengerWeightsForFlight(
  flightId: number,
  legs: FlightLegRow[]
): Promise<Map<number, LegPassengerWeights>> {
  // Find all booking_legs assigned to this flight
  const bookingLegsResult = await db.query(
    `SELECT bl.id, bl.origin_code, bl.destination_code
     FROM booking_legs bl
     WHERE bl.flight_id = $1`,
    [flightId]
  );
  const bookingLegs = bookingLegsResult.rows as Array<{
    id: number;
    origin_code: string;
    destination_code: string;
  }>;

  // For each booking leg, load passengers from booking_leg_passengers
  const legWeightsMap = new Map<number, LegPassengerWeights>();

  for (const bookingLeg of bookingLegs) {
    const legPassengers = await db.query(
      `SELECT blp.clothed_weight_kg, blp.baggage_weight_kg, blp.freight_weight_kg
       FROM booking_leg_passengers blp
       WHERE blp.booking_leg_id = $1`,
      [bookingLeg.id]
    );

    const rows = legPassengers.rows as Array<{
      clothed_weight_kg: number | null;
      baggage_weight_kg: number;
      freight_weight_kg: number;
    }>;

    const passengerCount = rows.length;
    const passengerWeightKg = rows.reduce(
      (sum, r) => sum + (r.clothed_weight_kg ?? 70),
      0
    );
    const baggageWeightKg = rows.reduce(
      (sum, r) => sum + r.baggage_weight_kg,
      0
    );
    const freightWeightKg = rows.reduce(
      (sum, r) => sum + r.freight_weight_kg,
      0
    );

    // Map this booking leg's passengers to the matching flight leg
    // by matching origin/destination
    for (const leg of legs) {
      if (
        leg.origin_code === bookingLeg.origin_code &&
        leg.destination_code === bookingLeg.destination_code
      ) {
        const existing = legWeightsMap.get(leg.id) ?? {
          passengerCount: 0,
          passengerWeightKg: 0,
          baggageWeightKg: 0,
          freightWeightKg: 0,
        };
        existing.passengerCount += passengerCount;
        existing.passengerWeightKg += passengerWeightKg;
        existing.baggageWeightKg += baggageWeightKg;
        existing.freightWeightKg += freightWeightKg;
        legWeightsMap.set(leg.id, existing);
      }
    }
  }

  return legWeightsMap;
}

/**
 * Compute weight and balance for all legs in a route.
 * Passenger weights are loaded from booking_leg_passengers.
 */
export async function computeWeightBalanceForRoute(
  assignment: AircraftAssignmentResult,
  legs: FlightLegRow[],
  legDistances: Map<number, number>
): Promise<WeightBalanceResult[]> {
  // Pre-load all aerodromes for limit lookups
  const aerodromes = await aerodromeRepository.findAll();
  const aerodromeCache = new Map<string, AerodromeRow>();
  for (const a of aerodromes) {
    aerodromeCache.set(a.code, a);
  }

  // Load passenger weights from booking_leg_passengers
  const passengerWeightsMap = await loadPassengerWeightsForFlight(
    assignment.route.flight.id,
    legs
  );

  const results: WeightBalanceResult[] = [];
  let previousFuelRemainingKg = 0;

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const distance = legDistances.get(leg.id) ?? 0;
    const sectorsSoFar = i + 1; // 1-based
    const isStanleyDeparture = i === 0 || leg.origin_code === "STY";
    const passengerWeights = passengerWeightsMap.get(leg.id);

    const result = await computeWeightBalance(
      assignment,
      leg,
      distance,
      aerodromeCache,
      sectorsSoFar,
      previousFuelRemainingKg,
      isStanleyDeparture,
      passengerWeights
    );

    // Track fuel remaining for next leg
    previousFuelRemainingKg = result.fuelPlan.fuelRemainingKg;

    results.push(result);
  }

  return results;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function determineBindingConstraint(
  takeoffWeightKg: number,
  effectiveMtowKg: number,
  effectiveMlwKg: number,
  aircraftMtow: number,
  aerodromeMtowLimit: number,
  aircraftMlw: number,
  aerodromeMlwLimit: number,
  destinationAerodrome?: AerodromeRow
): BindingConstraintInfo {
  const mtowMargin = effectiveMtowKg - takeoffWeightKg;
  const mlwMargin = effectiveMlwKg - takeoffWeightKg;

  // Determine which limit is binding for MTOW
  const mtowBinding: "aircraft" | "aerodrome" =
    aerodromeMtowLimit < aircraftMtow ? "aerodrome" : "aircraft";

  // Determine which limit is binding for MLW
  const mlwBinding: "aircraft" | "aerodrome" =
    aerodromeMlwLimit < aircraftMlw ? "aerodrome" : "aircraft";

  // Build reason string
  const parts: string[] = [];
  if (mtowBinding === "aerodrome" && aerodromeMtowLimit < Infinity) {
    parts.push(
      `${destinationAerodrome?.code ?? "Unknown"} limits MTOW to ${aerodromeMtowLimit} kg`
    );
  }
  if (mlwBinding === "aerodrome" && aerodromeMlwLimit < Infinity) {
    parts.push(
      `${destinationAerodrome?.code ?? "Unknown"} limits MLW to ${aerodromeMlwLimit} kg`
    );
  }

  // Check which constraint is closer to being exceeded
  if (mtowMargin < mlwMargin && mtowMargin < 50) {
    return {
      constraint: "mtow",
      detail:
        parts.length > 0
          ? parts.join("; ")
          : `MTOW limit ${effectiveMtowKg.toFixed(0)}kg, current ${takeoffWeightKg.toFixed(0)}kg (${((takeoffWeightKg / effectiveMtowKg) * 100).toFixed(1)}%)`,
    };
  }

  if (mlwMargin < 50) {
    return {
      constraint: "mlw",
      detail:
        parts.length > 0
          ? parts.join("; ")
          : `MLW limit ${effectiveMlwKg.toFixed(0)}kg, current ${takeoffWeightKg.toFixed(0)}kg (${((takeoffWeightKg / effectiveMlwKg) * 100).toFixed(1)}%)`,
    };
  }

  return {
    constraint: "none",
    detail: `Weight ${takeoffWeightKg.toFixed(0)}kg within limits (MTOW: ${effectiveMtowKg.toFixed(0)}kg, MLW: ${effectiveMlwKg.toFixed(0)}kg)`,
  };
}
