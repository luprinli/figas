/**
 * Fuel lookup backed by the fuel_rules database table.
 *
 * Previously this module contained a hardcoded 30×30 fuel matrix that
 * duplicated data from the fuel_rules table. It now queries the DB via
 * Prisma, with in-memory caching for performance.
 *
 * Fuel lookup logic is delegated to the shared fuel-lookup module.
 */

import { db } from "../db.server";
import { lookupFuelByFlightTime, clearFuelRulesCache } from "./fuel-lookup";
import { DEFAULT_CRUISE_SPEED_KTAS, DEFAULT_BN2_BURN_RATE_KG_PER_HOUR } from "../constants";

export { clearFuelRulesCache };

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Look up fuel consumption in kg between two aerodromes.
 * Returns 0 if the pair is not found in the lookup table.
 * The lookup is case-insensitive (uppercase keys).
 *
 * Note: This function previously used a hardcoded matrix. It now computes
 * fuel from the distance and the BN-2 Islander fuel burn rate (~45 kg/h
 * at 140 kt cruise), matched to the nearest fuel rule via ceiling-match
 * on flight time.
 */
export async function getFuelKg(origin: string, dest: string): Promise<number> {
    if (origin === dest) return 0;

    // Get distance from the DB
    const distances = await db.aerodrome_distances.findMany({
        where: {
            OR: [
                { origin_code: origin.toUpperCase(), destination_code: dest.toUpperCase() },
                { origin_code: dest.toUpperCase(), destination_code: origin.toUpperCase() },
            ],
        },
        select: { distance_nm: true },
    });

    if (distances.length === 0) return 0;
    const distanceNm = Number(distances[0].distance_nm);
    if (distanceNm <= 0) return 0;

    // Compute flight time at cruise speed
    const flightTimeMinutes = Math.round((distanceNm / DEFAULT_CRUISE_SPEED_KTAS) * 60);

    // Look up fuel rule by ceiling-match on flight time (1 sector)
    // using the shared lookup function
    const matchingRule = await lookupFuelByFlightTime(flightTimeMinutes, 1);

    if (matchingRule) {
        return matchingRule.requiredFuelKg;
    }

    // Fallback: compute from distance using BN-2 burn rate
    return Math.round((distanceNm / DEFAULT_CRUISE_SPEED_KTAS) * DEFAULT_BN2_BURN_RATE_KG_PER_HOUR);
}