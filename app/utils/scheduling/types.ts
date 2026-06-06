import type { BookingLegRow } from "../repositories/booking-leg";
import type { FlightRow } from "../repositories/flight";
import type { AircraftRow } from "../repositories/aircraft";
import type { AerodromeRow } from "../repositories/aerodrome";

// ── Phase 1: Cluster ─────────────────────────────────────────────────────────

export interface ClusterResult {
  /** Date of the cluster */
  date: string;
  /** Booking legs grouped by origin/destination */
  legs: BookingLegRow[];
  /** Origin aerodrome code */
  origin: string;
  /** Destination aerodrome code */
  destination: string;
  /** Total passenger count across all bookings in this cluster */
  passengerCount: number;
}

// ── Phase 2: Route ───────────────────────────────────────────────────────────

export interface RouteStop {
  aerodromeCode: string;
  legSequence: number;
  distanceNm: number;
  heading: number;
}

export interface RouteResult {
  /** The flight that will serve this route */
  flight: FlightRow;
  /** Ordered stops for the sortie */
  stops: RouteStop[];
  /** Total distance in nautical miles */
  totalDistanceNm: number;
  /** Estimated total flight time in hours */
  estimatedFlightTimeHours: number;
}

// ── Phase 3: Aircraft Assignment ─────────────────────────────────────────────

export interface AircraftAssignmentResult {
  aircraft: AircraftRow;
  route: RouteResult;
  /** Available payload capacity after fuel */
  availablePayloadKg: number;
  /** Whether this assignment is feasible */
  feasible: boolean;
  /** Reason if not feasible */
  infeasibilityReason?: string;
}

// ── Phase 4: Weight & Balance ────────────────────────────────────────────────

export interface FuelPlan {
  /** Fuel needed for this leg per fuel.csv Required Fuel column (the burn) */
  requiredFuelKg: number;
  /** Minimum fuel that must be on board before departure (fuel.csv Minimum Fuel column — reserve) */
  minimumFuelKg: number;
  /** Fuel state string from fuel.csv (e.g., "35/35", "40/40") — what the refueler loads at Stanley */
  fuelState: string;
  /** Description of which fuel rule was applied */
  fuelRuleApplied: string;

  // ── Fuel state tracking ──────────────────────────────────────────────────
  /** Fuel on board at departure for this leg */
  fuelOnBoardKg: number;
  /** Estimated fuel burn for this leg (= fuelRequiredKg) */
  fuelBurnKg: number;
  /** Fuel remaining after completing this leg (fuelOnBoardKg - fuelBurnKg) */
  fuelRemainingKg: number;

  // ── Endurance ────────────────────────────────────────────────────────────
  /** How long the fuel on board will last at planned burn rate */
  fuelEnduranceMinutes: number;
  /** Scheduled flight time for this leg (distance / cruise_speed + taxi) */
  legFlightTimeMinutes: number;
  /** Number of sectors completed including this leg (used for fuel.csv lookup) */
  sectorsSoFar: number;

  // ── Validation ──────────────────────────────────────────────────────────
  /** TRUE if fuelOnBoardKg >= requiredFuelKg */
  fuelOk: boolean;
  /** TRUE if fuelRemainingKg >= minimumFuelKg */
  reserveOk: boolean;
  /** TRUE if fuel constraints require a Stanley revisit */
  needsStanleyRevisit: boolean;
}

export interface BindingConstraintInfo {
  constraint: string;
  detail: string;
}

export interface WeightBalanceResult {
  flightLegId: number;
  passengerWeightKg: number;
  baggageWeightKg: number;
  freightWeightKg: number;
  fuelWeightKg: number;
  crewWeightKg: number;
  emptyWeightKg: number;
  totalWeightKg: number;
  fuelPlan: FuelPlan;
  totalMomentKgm: number;
  cgPositionPct: number;
  effectiveMtowKg: number;
  effectiveMlwKg: number;
  mtowUsedPct: number;
  mlwUsedPct: number;
  bindingConstraint: BindingConstraintInfo;
}

// ── Phase 5: Pilot Assignment ────────────────────────────────────────────────

export interface PilotAvailability {
  pilotId: number;
  name: string;
  available: boolean;
  currentDutyHours: number;
  maxDutyHoursPerDay: number;
  currentFlightHours: number;
  maxFlightHoursPerDay: number;
  medicalValid: boolean;
}

export interface PilotAssignmentResult {
  flightId: number;
  pilotId: number;
  role: "captain" | "relief";
}

// ── Overall Schedule Builder Result ──────────────────────────────────────────

export interface ScheduleBuildResult {
  scheduleId: number;
  scheduleDate: string;
  clusters: ClusterResult[];
  routes: RouteResult[];
  aircraftAssignments: AircraftAssignmentResult[];
  weightBalances: WeightBalanceResult[];
  pilotAssignments: PilotAssignmentResult[];
  errors: string[];
  warnings: string[];
}

// ── Fuel CSV Row ─────────────────────────────────────────────────────────────

export interface FuelCsvRow {
  "Required Fuel": string;
  "Minimum Fuel": string;
  "Fuel State": string;
  "Distance (nm)": string;
}

// ── Aerodrome with scheduling columns ────────────────────────────────────────

export interface AerodromeScheduling extends AerodromeRow {
  mtow_limit_kg: number | null;
  mlw_limit_kg: number | null;
  fuel_available: boolean;
  operating_hours: string | null;
  pilot_briefing_required: boolean;
}

// ── Aircraft with scheduling columns ─────────────────────────────────────────

export interface AircraftScheduling extends AircraftRow {
  max_ramp_weight_kg: number | null;
  max_landing_weight_kg: number | null;
  cg_arm_m: number | null;
  fuel_flow_kg_per_hour: number | null;
  cruise_speed_ktas: number | null;
}
