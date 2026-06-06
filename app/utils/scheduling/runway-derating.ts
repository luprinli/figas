/**
 * Shared runway derating logic for short strips (< 400m).
 *
 * For strips shorter than 400m, effective MTOW/MLW is reduced by
 * RUNWAY_DERATING_PCT_PER_100M percent per 100m below 400m.
 *
 * This module consolidates the duplicate derating logic that previously
 * existed in both weight-balance.ts and flight-validation.ts.
 */

/** Derating percentage applied per 100m below the 400m threshold. */
export const RUNWAY_DERATING_PCT_PER_100M = 0.05; // 5%

/** Runway length threshold (metres) below which derating is applied. */
export const RUNWAY_DERATING_THRESHOLD_M = 400;

/**
 * Calculate the runway derating factor for a given runway length.
 *
 * Returns a multiplier between 0 and 1. For runways >= 400m (or unknown),
 * the factor is 1 (no derating). For runways < 400m, the factor is
 * `1 - deficit100m * RUNWAY_DERATING_PCT_PER_100M`.
 *
 * @param runwayLength - Runway length in metres (or null/undefined if unknown).
 * @returns Derating factor to multiply against MTOW/MLW.
 */
export function calculateRunwayDeratingFactor(
  runwayLength: number | null | undefined
): number {
  if (runwayLength == null || runwayLength <= 0 || runwayLength >= RUNWAY_DERATING_THRESHOLD_M) {
    return 1;
  }
  const deficit100m = (RUNWAY_DERATING_THRESHOLD_M - runwayLength) / 100;
  return 1 - deficit100m * RUNWAY_DERATING_PCT_PER_100M;
}

/**
 * Apply runway derating to a weight value (MTOW or MLW).
 *
 * @param weightKg - The weight value to derate (e.g., effective MTOW or MLW in kg).
 * @param runwayLength - Runway length in metres (or null/undefined if unknown).
 * @returns Derated weight rounded to the nearest kg.
 */
export function applyRunwayDerating(
  weightKg: number,
  runwayLength: number | null | undefined
): number {
  const factor = calculateRunwayDeratingFactor(runwayLength);
  if (factor >= 1) {
    return weightKg;
  }
  return Math.round(weightKg * factor);
}
