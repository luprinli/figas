import { loadDistanceCSV } from "./distance-csv";
import { computeFlightTime } from "../scheduling/fuel-planning";
import { computeCG, assignSeatsByCOG } from "./seat-assignment";
import type { SeatAssignment } from "./seat-assignment";

interface FlightLegData {
  id: number;
  leg_number: number;
  origin_code: string;
  destination_code: string;
  distance_nm: number | null;
}

interface PassengerWeightData {
  id: number;
  bookingLegId: number;
  clothedWeightKg: number;
  baggageWeightKg: number;
  freightWeightKg: number;
}

interface AircraftData {
  empty_weight_kg: number;
  max_takeoff_weight_kg: number;
  max_landing_weight_kg: number;
}

interface LoadsheetCalcParams {
  flightId: number;
  legs: FlightLegData[];
  passengers: PassengerWeightData[];
  aircraft: AircraftData;
  pilotWeightKg: number;
  date: string;
}

export interface SectorCalcResult {
  legSequence: number;
  originCode: string;
  destinationCode: string;
  distanceNm: number;
  plannedTimeMin: number;
  etd: string;
  eta: string;
  fuelOnBoardKg: number;
  fuelBurnKg: number;
  fuelRemainingKg: number;
  takeoffWeightKg: number;
  landingWeightKg: number;
  towStatus: "ok" | "warning" | "violation";
  towReason: string | null;
  cogMm: number;
  cogStatus: "ok" | "warning" | "violation";
  cogReason: string | null;
}

export interface LoadsheetCalcOutput {
  startingFuelKg: number;
  totalBurnKg: number;
  reserveFuelKg: number;
  sectors: SectorCalcResult[];
  seatAssignments: SeatAssignment[];
}

const BN2_EMPTY_WEIGHT_KG = 1627;
const BN2_MTOW_KG = 2994;
const BN2_CRUISE_KTAS = 140;
const BN2_BURN_RATE_KG_PER_MIN = 0.4;
const RESERVE_FUEL_KG = 35;
const TAXI_FUEL_KG = 3;
const TURNAROUND_MIN = 10;
const BASE_ETD_HOUR = 8;
const BASE_ETD_MINUTE = 30;

function formatTimeHM(date: Date): string {
  const h = String(date.getUTCHours()).padStart(2, "0");
  const m = String(date.getUTCMinutes()).padStart(2, "0");
  return `${h}${m}`;
}

export async function computeLoadsheetCalculations(params: LoadsheetCalcParams): Promise<LoadsheetCalcOutput> {
  const { legs, passengers, aircraft, pilotWeightKg, date } = params;
  const distanceMap = await loadDistanceCSV();
  const seatAssignments = assignSeatsByCOG(passengers);

  const emptyWt = aircraft.empty_weight_kg > 0 ? aircraft.empty_weight_kg : BN2_EMPTY_WEIGHT_KG;
  const mtow = aircraft.max_takeoff_weight_kg > 0 ? aircraft.max_takeoff_weight_kg : BN2_MTOW_KG;

  // ── Phase 1: Compute per-leg data ──────────────────────────────────────
  interface LegCalc {
    legSequence: number;
    originCode: string;
    destinationCode: string;
    distanceNm: number;
    plannedTimeMin: number;
    fuelBurnKg: number;
    etd: Date;
    eta: Date;
  }

  const legCalcs: LegCalc[] = [];
  const startTime = new Date(`${date}T${String(BASE_ETD_HOUR).padStart(2, "0")}:${String(BASE_ETD_MINUTE).padStart(2, "0")}:00Z`);
  let currentTime = new Date(startTime);

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const key = `${leg.origin_code}→${leg.destination_code}`;
    const distanceNm = leg.distance_nm ?? distanceMap.get(key) ?? 0;
    distanceMap.set(key, distanceNm);
    distanceMap.set(`${leg.destination_code}→${leg.origin_code}`, distanceNm);

    const flightTimeMin = computeFlightTime(distanceNm, BN2_CRUISE_KTAS, 0);

    // Use realistic burn rate: BN-2 burns ~25 kg/hr = 0.4 kg/min
    const fuelBurnKg = Math.round(flightTimeMin * BN2_BURN_RATE_KG_PER_MIN);

    const etd = new Date(currentTime);
    const eta = new Date(currentTime);
    eta.setMinutes(eta.getMinutes() + flightTimeMin);

    legCalcs.push({
      legSequence: leg.leg_number,
      originCode: leg.origin_code,
      destinationCode: leg.destination_code,
      distanceNm,
      plannedTimeMin: flightTimeMin,
      fuelBurnKg,
      etd,
      eta,
    });

    currentTime = new Date(eta);
    currentTime.setMinutes(currentTime.getMinutes() + TURNAROUND_MIN);
  }

  // ── Phase 2: Starting fuel = total burn + reserve + taxi ──────────────
  const totalBurnKg = legCalcs.reduce((s, l) => s + l.fuelBurnKg, 0);
  const startingFuelKg = totalBurnKg + RESERVE_FUEL_KG + TAXI_FUEL_KG;

  // ── Phase 3: Cascade fuel & compute W&B ────────────────────────────────
  const sectors: SectorCalcResult[] = [];
  let fuelOnBoard = startingFuelKg;

  // Total pax and baggage (constant across all legs for round-trip flights)
  const paxWeight = passengers.reduce((s, p) => s + p.clothedWeightKg, 0);
  const baggageTotal = passengers.reduce((s, p) => s + p.baggageWeightKg + p.freightWeightKg, 0);

  for (const lc of legCalcs) {
    const fuelRemainingKg = fuelOnBoard - lc.fuelBurnKg;
    const tow = emptyWt + pilotWeightKg + paxWeight + baggageTotal + fuelOnBoard;
    const lw = tow - lc.fuelBurnKg;

    let towStatus: "ok" | "warning" | "violation" = "ok";
    let towReason: string | null = null;
    if (tow > mtow) {
      towStatus = "violation";
      towReason = `MTOW ${mtow}kg exceeded by ${Math.round(tow - mtow)}kg`;
    } else if (tow > mtow * 0.95) {
      towStatus = "warning";
      towReason = `Within 5% of MTOW (${mtow}kg)`;
    }

    const { cogMm, status: cogStatusRaw } = computeCG(
      seatAssignments, baggageTotal, fuelOnBoard, emptyWt, pilotWeightKg
    );

    let cogReason: string | null = null;
    if (cogStatusRaw === "violation") {
      cogReason = cogMm < 2057.4
        ? `CG ${cogMm.toFixed(1)}mm below fwd limit 2057mm`
        : `CG ${cogMm.toFixed(1)}mm exceeds aft limit 2565mm`;
    } else if (cogStatusRaw === "warning") {
      cogReason = `CG ${cogMm.toFixed(1)}mm near limit`;
    }

    sectors.push({
      legSequence: lc.legSequence,
      originCode: lc.originCode,
      destinationCode: lc.destinationCode,
      distanceNm: lc.distanceNm,
      plannedTimeMin: lc.plannedTimeMin,
      etd: formatTimeHM(lc.etd),
      eta: formatTimeHM(lc.eta),
      fuelOnBoardKg: fuelOnBoard,
      fuelBurnKg: lc.fuelBurnKg,
      fuelRemainingKg,
      takeoffWeightKg: Math.round(tow),
      landingWeightKg: Math.round(lw),
      towStatus,
      towReason,
      cogMm: Math.round(cogMm * 10) / 10,
      cogStatus: cogStatusRaw,
      cogReason,
    });

    fuelOnBoard = fuelRemainingKg;
  }

  return { startingFuelKg, totalBurnKg, reserveFuelKg: RESERVE_FUEL_KG, sectors, seatAssignments };
}
