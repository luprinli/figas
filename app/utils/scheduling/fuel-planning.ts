import type { FuelPlan } from "./types";
import { kdb } from "../db.server.kysely";

// ── Fuel Rule Types & Caching ──────────────────────────────────────────────────

export interface FuelCsvRow {
  ftMins: number;
  sectors: number;
  requiredFuelKg: number;
  minimumFuelKg: number;
  fuelState: string;
}

let fuelRulesCache: FuelCsvRow[] | null = null;

export async function loadFuelRules(): Promise<FuelCsvRow[]> {
  if (fuelRulesCache) return fuelRulesCache;
  const rows = await kdb.selectFrom("fuel_rules")
    .select(["flight_time_minutes", "sectors", "required_fuel_kg", "minimum_fuel_kg", "fuel_state"])
    .orderBy("flight_time_minutes", "asc")
    .orderBy("sectors", "asc")
    .execute();
  fuelRulesCache = rows.map((r) => ({
    ftMins: r.flight_time_minutes,
    sectors: r.sectors,
    requiredFuelKg: Number(r.required_fuel_kg),
    minimumFuelKg: Number(r.minimum_fuel_kg),
    fuelState: r.fuel_state,
  }));
  return fuelRulesCache;
}

export function clearFuelRulesCache(): void {
  fuelRulesCache = null;
}

export async function lookupFuelByFlightTime(
  flightTimeMinutes: number,
  sectorsSoFar: number
): Promise<FuelCsvRow | null> {
  const FUEL_MATRIX = await loadFuelRules();
  let candidates = FUEL_MATRIX.filter((r) => r.sectors >= sectorsSoFar);
  if (candidates.length === 0) {
    const maxSectors = Math.max(...FUEL_MATRIX.map((r) => r.sectors));
    candidates = FUEL_MATRIX.filter((r) => r.sectors === maxSectors);
  }
  const ceilingMatch = candidates
    .filter((r) => r.ftMins >= flightTimeMinutes)
    .sort((a, b) => a.ftMins - b.ftMins);
  if (ceilingMatch.length > 0) return ceilingMatch[0];
  const fallback = candidates.sort((a, b) => b.ftMins - a.ftMins);
  return fallback[0] ?? null;
}

// ── Fuel Planning ──────────────────────────────────────────────────────────────

/**
 * Compute fuel plan for a given leg using flight time and sectors.
 *
 * @param flightTimeMinutes - Scheduled flight time for this leg
 * @param sectorsSoFar - Number of sectors completed including this leg (1-based)
 * @param previousFuelRemainingKg - Fuel remaining from previous leg (0 for first leg)
 * @param isStanleyDeparture - Whether this leg departs from Stanley (refuel point)
 */
export async function computeFuelPlan(
  flightTimeMinutes: number,
  sectorsSoFar: number,
  previousFuelRemainingKg: number = 0,
  isStanleyDeparture: boolean = false
): Promise<FuelPlan> {
  const rule = await lookupFuelByFlightTime(flightTimeMinutes, sectorsSoFar);

  if (!rule) {
    return {
      requiredFuelKg: 0,
      minimumFuelKg: 0,
      fuelState: "unknown",
      fuelRuleApplied: "no_rule_found",
      fuelOnBoardKg: 0,
      fuelBurnKg: 0,
      fuelRemainingKg: 0,
      fuelEnduranceMinutes: 0,
      legFlightTimeMinutes: flightTimeMinutes,
      sectorsSoFar,
      fuelOk: false,
      reserveOk: false,
      needsStanleyRevisit: false,
    };
  }

  const requiredFuelKg = rule.requiredFuelKg;
  const minimumFuelKg = rule.minimumFuelKg;

  // Determine fuel on board:
  // - First leg from Stanley: fuelOnBoard = minimumFuel (the Fuel State value)
  // - Revisit Stanley: fuelOnBoard = minimumFuel (reload per fuel.csv)
  // - Intermediate leg: fuelOnBoard = previousLeg.fuelRemaining
  let fuelOnBoardKg: number;
  if (isStanleyDeparture || sectorsSoFar === 1) {
    // At Stanley, load the Fuel State value (minimumFuel is what gets loaded)
    fuelOnBoardKg = minimumFuelKg;
  } else {
    // Intermediate leg: carry forward remaining fuel
    fuelOnBoardKg = previousFuelRemainingKg;
  }

  // Fuel burn = Required Fuel from fuel.csv
  const fuelBurnKg = requiredFuelKg;

  // Fuel remaining after this leg
  const fuelRemainingKg = Math.max(0, fuelOnBoardKg - fuelBurnKg);

  // Fuel endurance: how long fuel lasts at planned burn rate
  // If burn rate is 0, use a default of 60 minutes per 100kg
  const fuelEnduranceMinutes =
    fuelBurnKg > 0
      ? (fuelOnBoardKg / fuelBurnKg) * flightTimeMinutes
      : flightTimeMinutes;

  // Validation
  const fuelOk = fuelOnBoardKg >= requiredFuelKg;
  const reserveOk = fuelRemainingKg >= minimumFuelKg;
  const needsStanleyRevisit = !fuelOk || !reserveOk;

  return {
    requiredFuelKg,
    minimumFuelKg,
    fuelState: rule.fuelState,
    fuelRuleApplied: `FT ${flightTimeMinutes}min, sectors ${sectorsSoFar} \u2192 rule FT ${rule.ftMins}min, sectors ${rule.sectors}`,
    fuelOnBoardKg,
    fuelBurnKg,
    fuelRemainingKg,
    fuelEnduranceMinutes: Math.round(fuelEnduranceMinutes),
    legFlightTimeMinutes: flightTimeMinutes,
    sectorsSoFar,
    fuelOk,
    reserveOk,
    needsStanleyRevisit,
  };
}

/**
 * Compute flight time from distance and cruise speed.
 *
 * @param distanceNm - Distance in nautical miles
 * @param cruiseSpeedKtas - Cruise speed in knots (default 140 for BN-2 Islander)
 * @param taxiMinutes - Taxi time in minutes (default 5)
 */
export function computeFlightTime(
  distanceNm: number,
  cruiseSpeedKtas: number = 140,
  taxiMinutes: number = 5
): number {
  if (distanceNm <= 0 || cruiseSpeedKtas <= 0) return 0;
  const flightMinutes = (distanceNm / cruiseSpeedKtas) * 60;
  return Math.round(flightMinutes + taxiMinutes);
}
