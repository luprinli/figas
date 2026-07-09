import { computeCG } from "../loadsheet/seat-assignment";
import type { SeatAssignment } from "../loadsheet/seat-assignment";

const BN2_BURN_RATE_KG_PER_MIN = 0.4;
const BN2_CRUISE_SPEED_KTAS = 140;
const RESERVE_FUEL_KG = 35;
const TAXI_FUEL_KG = 3;

const CG_FWD_LIMIT_MM = 2057.4;
const CG_AFT_LIMIT_MM = 2565.4;

export interface WbAircraft {
  emptyWeightKg: number;
  mtowKg: number;
  mlwKg: number;
  cruiseSpeedKtas?: number;
  burnRateKgPerMin?: number;
}

export interface WbLeg {
  id: number;
  originCode: string;
  destinationCode: string;
  distanceNm: number | null;
  legSequence: number;
  freightWeightKg?: number;
}

export interface WbPassenger {
  id: number;
  name: string;
  clothedWeightKg: number;
  baggageWeightKg: number;
  originCode: string;
  destinationCode: string;
  seatRow?: number | null;
  seatSide?: string | null;
}

export interface WbInput {
  aircraft: WbAircraft;
  legs: WbLeg[];
  passengers: WbPassenger[];
  pilotWeightKg: number;
  startingFuelKg: number;
  reserveFuelKg?: number;
  taxiFuelKg?: number;
  distanceMap: Record<string, number>;
}

export interface WbSectorResult {
  legSequence: number;
  originCode: string;
  destinationCode: string;
  distanceNm: number;
  plannedTimeMin: number;
  fuelOnBoardKg: number;
  fuelBurnKg: number;
  fuelRemainingKg: number;
  takeoffWeightKg: number;
  landingWeightKg: number;
  cogMm: number;
  cogStatus: "ok" | "warning" | "violation";
  towStatus: "ok" | "warning" | "violation";
  mtowUsedPct: number;
  mlwUsedPct: number;
  onBoardPassengerCount: number;
  onBoardBaggageKg: number;
}

export interface WbOutput {
  sectors: WbSectorResult[];
  totalBurnKg: number;
  totalDistanceNm: number;
  warnings: string[];
  errors: string[];
}

function getDistance(
  distanceMap: Record<string, number>,
  origin: string,
  destination: string
): number {
  const key = `${origin}-${destination}`;
  if (distanceMap[key] != null) return distanceMap[key];
  const reverseKey = `${destination}-${origin}`;
  if (distanceMap[reverseKey] != null) return distanceMap[reverseKey];
  return 0;
}

function getPassengersOnSector(
  passengers: WbPassenger[],
  stopCodes: string[],
  sectorIndex: number
): WbPassenger[] {
  const origin = stopCodes[sectorIndex];
  const destination = stopCodes[sectorIndex + 1];
  if (!origin || !destination) return [];
  return passengers.filter((p) => {
    const originIdx = stopCodes.indexOf(p.originCode);
    const destIdx = stopCodes.indexOf(p.destinationCode);
    return originIdx <= sectorIndex && destIdx > sectorIndex;
  });
}

function buildSeatAssignments(passengers: WbPassenger[]): SeatAssignment[] {
  return passengers.map((p) => ({
    passengerId: p.id,
    bookingLegId: 0,
    seatRow: p.seatRow ?? null,
    seatSide: (p.seatSide as "L" | "R" | "C") ?? null,
    clothedWeightKg: p.clothedWeightKg,
    baggageWeightKg: p.baggageWeightKg,
  }));
}

export function computeClientWeightBalance(input: WbInput): WbOutput {
  const {
    aircraft,
    legs,
    passengers,
    pilotWeightKg,
    startingFuelKg,
    distanceMap,
  } = input;

  const reserveFuelKg = input.reserveFuelKg ?? RESERVE_FUEL_KG;
  const taxiFuelKg = input.taxiFuelKg ?? TAXI_FUEL_KG;
  const burnRateKgPerMin = aircraft.burnRateKgPerMin ?? BN2_BURN_RATE_KG_PER_MIN;
  const cruiseSpeedKtas = aircraft.cruiseSpeedKtas ?? BN2_CRUISE_SPEED_KTAS;

  const stopCodes: string[] = ["STY"];
  for (const leg of legs) {
    if (leg.destinationCode && leg.destinationCode !== "STY") {
      if (!stopCodes.includes(leg.destinationCode)) {
        stopCodes.push(leg.destinationCode);
      }
    }
  }
  if (legs.length > 0 && legs[legs.length - 1].destinationCode !== "STY") {
    stopCodes.push("STY");
  }
  if (stopCodes[stopCodes.length - 1] !== "STY") {
    stopCodes.push("STY");
  }

  const warnings: string[] = [];
  const errors: string[] = [];

  let fuelRemainingKg = startingFuelKg - taxiFuelKg;
  if (fuelRemainingKg < 0) {
    errors.push("Starting fuel insufficient for taxi");
    fuelRemainingKg = 0;
  }

  const sectors: WbSectorResult[] = [];
  let totalBurnKg = 0;
  let totalDistanceNmTotal = 0;

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const distanceNm =
      leg.distanceNm ??
      getDistance(distanceMap, leg.originCode, leg.destinationCode);

    if (distanceNm <= 0) {
      errors.push(`Sector ${i + 1}: Unknown distance ${leg.originCode}→${leg.destinationCode}`);
    }

    totalDistanceNmTotal += distanceNm;

    const flightTimeMin = cruiseSpeedKtas > 0
      ? (distanceNm / cruiseSpeedKtas) * 60
      : 0;

    const fuelBurnKg = flightTimeMin * burnRateKgPerMin;
    const fuelOnBoardKg = fuelRemainingKg;

    fuelRemainingKg -= fuelBurnKg;
    if (fuelRemainingKg < 0) {
      warnings.push(`Sector ${i + 1}: Fuel exhaustion — negative remaining fuel`);
      fuelRemainingKg = 0;
    }

    totalBurnKg += fuelBurnKg;

    const sectorPassengers = getPassengersOnSector(passengers, stopCodes, i);
    const onBoardBaggageKg = sectorPassengers.reduce(
      (sum, p) => sum + p.baggageWeightKg,
      0
    );
    const freightKg = leg.freightWeightKg ?? 0;
    const totalBaggageKg = onBoardBaggageKg + freightKg;

    const seatAssignments = buildSeatAssignments(sectorPassengers);

    const takeoffCg = computeCG(
      seatAssignments,
      totalBaggageKg,
      fuelOnBoardKg,
      aircraft.emptyWeightKg,
      pilotWeightKg
    );

    const takeoffTotalWeight =
      aircraft.emptyWeightKg +
      pilotWeightKg +
      sectorPassengers.reduce((s, p) => s + p.clothedWeightKg, 0) +
      totalBaggageKg +
      fuelOnBoardKg;

    const landingTotalWeight =
      aircraft.emptyWeightKg +
      pilotWeightKg +
      sectorPassengers.reduce((s, p) => s + p.clothedWeightKg, 0) +
      totalBaggageKg +
      fuelRemainingKg;

    const mtowUsedPct = aircraft.mtowKg > 0 ? (takeoffTotalWeight / aircraft.mtowKg) * 100 : 0;
    const mlwUsedPct = aircraft.mlwKg > 0 ? (landingTotalWeight / aircraft.mlwKg) * 100 : 0;

    const towStatus: "ok" | "warning" | "violation" =
      takeoffTotalWeight > aircraft.mtowKg
        ? "violation"
        : mtowUsedPct > 95
          ? "warning"
          : "ok";

    const mlwStatus: "ok" | "warning" | "violation" =
      landingTotalWeight > aircraft.mlwKg
        ? "violation"
        : mlwUsedPct > 95
          ? "warning"
          : "ok";

    const cogMmWarning = takeoffCg.cogMm < CG_FWD_LIMIT_MM + 100 || takeoffCg.cogMm > CG_AFT_LIMIT_MM - 100;

    if (takeoffCg.status === "violation") {
      errors.push(`Sector ${i + 1}: CG violation at ${takeoffCg.cogMm.toFixed(1)}mm`);
    } else if (cogMmWarning || towStatus === "warning" || mlwStatus !== "ok") {
      warnings.push(
        `Sector ${i + 1}: ${towStatus === "warning" ? `MTOW ${mtowUsedPct.toFixed(1)}%` : ""}${mlwStatus === "warning" ? `MLW ${mlwUsedPct.toFixed(1)}%` : ""}${(towStatus === "warning" || mlwStatus !== "ok") && cogMmWarning ? ", " : ""}${cogMmWarning ? `CG near limit at ${takeoffCg.cogMm.toFixed(1)}mm` : ""}`
      );
    }

    const overallStatus: "ok" | "warning" | "violation" =
      takeoffCg.status === "violation" || towStatus === "violation"
        ? "violation"
        : takeoffCg.status === "warning" || towStatus === "warning"
          ? "warning"
          : "ok";

    sectors.push({
      legSequence: leg.legSequence,
      originCode: leg.originCode,
      destinationCode: leg.destinationCode,
      distanceNm,
      plannedTimeMin: Math.round(flightTimeMin),
      fuelOnBoardKg: Math.round(fuelOnBoardKg),
      fuelBurnKg: Math.round(fuelBurnKg * 10) / 10,
      fuelRemainingKg: Math.round(fuelRemainingKg * 10) / 10,
      takeoffWeightKg: Math.round(takeoffTotalWeight),
      landingWeightKg: Math.round(landingTotalWeight),
      cogMm: Math.round(takeoffCg.cogMm * 10) / 10,
      cogStatus: overallStatus,
      towStatus,
      mtowUsedPct: Math.round(mtowUsedPct * 10) / 10,
      mlwUsedPct: Math.round(mlwUsedPct * 10) / 10,
      onBoardPassengerCount: sectorPassengers.length,
      onBoardBaggageKg: totalBaggageKg,
    });

    if (i === legs.length - 1 && fuelRemainingKg < reserveFuelKg) {
      warnings.push(
        `Final reserve low: ${fuelRemainingKg.toFixed(1)}kg remaining (need ${reserveFuelKg}kg)`
      );
    }
  }

  return {
    sectors,
    totalBurnKg: Math.round(totalBurnKg * 10) / 10,
    totalDistanceNm: Math.round(totalDistanceNmTotal * 10) / 10,
    warnings,
    errors,
  };
}
