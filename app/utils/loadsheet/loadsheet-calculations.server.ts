import { loadCSVDistanceMap } from "../scheduling/distance-lookup";
import { computeFlightTime } from "../scheduling/fuel-planning";
import { computeCG, assignSeatsByCOG } from "./seat-assignment";
import type { SeatAssignment } from "./seat-assignment";
import {
  DEFAULT_BN2_MTOW_KG,
  DEFAULT_BN2_EMPTY_WEIGHT_KG,
  DEFAULT_CRUISE_SPEED_KTAS,
  DEFAULT_BN2_BURN_RATE_KG_PER_HOUR,
} from "../constants";
import { formatTime as formatTimeHM } from "../format-time";

interface FlightLegData {
  id: number;
  leg_number: number;
  origin_code: string;
  destination_code: string;
  distance_nm: number | null;
  etd?: string | null;
  eta?: string | null;
}

interface PassengerWeightData {
  id: number;
  bookingLegId: number;
  origin_code: string;
  destination_code: string;
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
  mlwStatus: "ok" | "warning" | "violation";
  mlwReason: string | null;
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

const TAXI_FUEL_KG = 3;
const TURNAROUND_MIN = 10;
const RESERVE_FUEL_KG = 35;

export async function computeLoadsheetCalculations(params: LoadsheetCalcParams): Promise<LoadsheetCalcOutput> {
  const { legs, passengers, aircraft, pilotWeightKg, date } = params;
  const distanceMap = await loadCSVDistanceMap();
  const seatAssignments = assignSeatsByCOG(passengers);

  const emptyWt = aircraft.empty_weight_kg > 0 ? aircraft.empty_weight_kg : DEFAULT_BN2_EMPTY_WEIGHT_KG;
  const mtow = aircraft.max_takeoff_weight_kg > 0 ? aircraft.max_takeoff_weight_kg : DEFAULT_BN2_MTOW_KG;

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
  // Use the first leg's ETD if available; otherwise fall back to 08:30 on the given date.
  const firstLegEtd = legs[0]?.etd ?? null;
  const startTime = firstLegEtd
    ? new Date(`${date}T${firstLegEtd}:00Z`)
    : new Date(`${date}T08:30:00Z`);
  let currentTime = new Date(startTime);

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const key = `${leg.origin_code}\u2192${leg.destination_code}`;
    const distanceNm = leg.distance_nm ?? distanceMap.get(key) ?? 0;
    distanceMap.set(key, distanceNm);
    distanceMap.set(`${leg.destination_code}\u2192${leg.origin_code}`, distanceNm);

    const flightTimeMin = computeFlightTime(distanceNm, DEFAULT_CRUISE_SPEED_KTAS, 0);

    // Burn rate aligned with FlightCard: DEFAULT_BN2_BURN_RATE_KG_PER_HOUR / 60
    const burnRateKgPerMin = DEFAULT_BN2_BURN_RATE_KG_PER_HOUR / 60;
    const fuelBurnKg = Math.round(flightTimeMin * burnRateKgPerMin);

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

  // Track passengers on board per sector
  const onBoardPassengerIds = new Set<number>();
  let sectorPaxWeight = 0;
  let sectorBaggageTotal = 0;

  for (const lc of legCalcs) {
    // Board passengers whose origin matches this sector's origin
    for (const p of passengers) {
      if (p.origin_code === lc.originCode && !onBoardPassengerIds.has(p.id)) {
        onBoardPassengerIds.add(p.id);
        sectorPaxWeight += p.clothedWeightKg;
        sectorBaggageTotal += p.baggageWeightKg + p.freightWeightKg;
      }
    }

    const fuelRemainingKg = fuelOnBoard - lc.fuelBurnKg;
    const tow = emptyWt + pilotWeightKg + sectorPaxWeight + sectorBaggageTotal + fuelOnBoard;
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

    let mlwStatus: "ok" | "warning" | "violation" = "ok";
    let mlwReason: string | null = null;
    const mlw = aircraft.max_landing_weight_kg;
    if (mlw > 0 && lw > mlw) {
      mlwStatus = "violation";
      mlwReason = `MLW ${mlw}kg exceeded by ${Math.round(lw - mlw)}kg`;
    } else if (mlw > 0 && lw > mlw * 0.95) {
      mlwStatus = "warning";
      mlwReason = `Within 5% of MLW (${mlw}kg)`;
    }

    const { cogMm, status: cogStatusRaw } = computeCG(
      seatAssignments, sectorBaggageTotal, fuelOnBoard, emptyWt, pilotWeightKg
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
      etd: formatTimeHM(lc.etd)!,
      eta: formatTimeHM(lc.eta)!,
      fuelOnBoardKg: fuelOnBoard,
      fuelBurnKg: lc.fuelBurnKg,
      fuelRemainingKg,
      takeoffWeightKg: Math.round(tow),
      landingWeightKg: Math.round(lw),
      towStatus,
      towReason,
      mlwStatus,
      mlwReason,
      cogMm: Math.round(cogMm * 10) / 10,
      cogStatus: cogStatusRaw,
      cogReason,
    });

    fuelOnBoard = fuelRemainingKg;

    // Deplane passengers whose destination matches this sector's destination
    for (const p of passengers) {
      if (p.destination_code === lc.destinationCode && onBoardPassengerIds.has(p.id)) {
        onBoardPassengerIds.delete(p.id);
        sectorPaxWeight -= p.clothedWeightKg;
        sectorBaggageTotal -= p.baggageWeightKg + p.freightWeightKg;
      }
    }
  }

  return { startingFuelKg, totalBurnKg, reserveFuelKg: RESERVE_FUEL_KG, sectors, seatAssignments };
}
