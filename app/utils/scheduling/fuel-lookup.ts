/**
 * Shared fuel lookup module — single source of truth for ceiling-match
 * fuel calculation logic.
 *
 * Both the scheduling pipeline (fuel-planning.ts) and the UI (fuel-data.server.ts)
 * import from here to ensure consistent fuel calculations.
 */

import { db } from "../db.server";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FuelCsvRow {
  ftMins: number;
  sectors: number;
  requiredFuelKg: number;
  minimumFuelKg: number;
  fuelState: string;
}

// ── Cached DB data ────────────────────────────────────────────────────────────

let fuelRulesCache: FuelCsvRow[] | null = null;

/**
 * Load fuel rules from the database, with in-memory caching.
 */
export async function loadFuelRules(): Promise<FuelCsvRow[]> {
  if (fuelRulesCache) return fuelRulesCache;
  const rows = await db.fuel_rules.findMany({
    select: {
      flight_time_minutes: true,
      sectors: true,
      required_fuel_kg: true,
      minimum_fuel_kg: true,
      fuel_state: true,
    },
    orderBy: [{ flight_time_minutes: "asc" }, { sectors: "asc" }],
  });
  fuelRulesCache = rows.map((r) => ({
    ftMins: r.flight_time_minutes,
    sectors: r.sectors,
    requiredFuelKg: Number(r.required_fuel_kg),
    minimumFuelKg: Number(r.minimum_fuel_kg),
    fuelState: r.fuel_state,
  }));
  return fuelRulesCache;
}

/**
 * Clear the fuel rules cache (useful for testing).
 */
export function clearFuelRulesCache(): void {
  fuelRulesCache = null;
}

/**
 * Look up fuel rules using ceiling-match on flight time and sectors.
 *
 * Algorithm:
 * 1. Filter candidates where sectors >= sectorsSoFar
 * 2. If no candidates, use max sector entries
 * 3. Find row with ftMins >= flightTimeMinutes (ceiling match)
 * 4. If no match, use max ftMins entry
 */
export async function lookupFuelByFlightTime(
  flightTimeMinutes: number,
  sectorsSoFar: number
): Promise<FuelCsvRow | null> {
  const FUEL_MATRIX = await loadFuelRules();

  // Step 1: Filter candidates where sectors >= sectorsSoFar
  let candidates = FUEL_MATRIX.filter((r) => r.sectors >= sectorsSoFar);

  // Step 2: If no candidates, use the maximum sector entries
  if (candidates.length === 0) {
    const maxSectors = Math.max(...FUEL_MATRIX.map((r) => r.sectors));
    candidates = FUEL_MATRIX.filter((r) => r.sectors === maxSectors);
  }

  // Step 3: Find row with ftMins >= flightTimeMinutes (ceiling match)
  const ceilingMatch = candidates
    .filter((r) => r.ftMins >= flightTimeMinutes)
    .sort((a, b) => a.ftMins - b.ftMins);

  if (ceilingMatch.length > 0) {
    return ceilingMatch[0];
  }

  // Step 4: Flight time exceeds all entries; use the max ftMins entry
  const fallback = candidates.sort((a, b) => b.ftMins - a.ftMins);
  return fallback[0] ?? null;
}
