/**
 * Shared route-filtering utilities used by both the flight display
 * (build-stop-activities.ts) and the loadsheet (create-loadsheet.server.ts).
 *
 * Extracting these into a single module eliminates the duplication that caused
 * the flight/loadsheet passenger-count drift (filter-divergence bug, 2026-07-20).
 *
 * Any future change to route-matching logic MUST modify ONLY this file.
 */

export interface ManifestRow {
  id: number;
  booking_leg_id: number;
  booking_passenger_id: number;
  flight_leg_id: number | null;
  flight_id: number;
  passenger_name: string;
  body_weight_kg: number | string;
  baggage_weight_kg: number | string;
  freight_weight_kg: number | string;
  origin_code: string;
  destination_code: string;
}

export interface RouteStop {
  origin_code: string | null;
  destination_code: string | null;
}

/**
 * Build an ordered, deduplicated stop list from flight metadata + leg codes.
 *
 * The sequence is:
 *   1. flight.origin_code (if present and not same as first leg origin)
 *   2. Each leg's origin_code (in order)
 *   3. Each leg's destination_code (in order)
 *   4. flight.destination_code (if present and not same as last leg dest)
 *
 * Consecutive duplicate codes are collapsed (e.g., "STY, STY, PHD" → "STY, PHD").
 * Round-trip routes (e.g., STY → ... → STY) retain both STY occurrences because
 * they are NOT consecutive — the last STY appears after all intermediate stops.
 */
export function buildOrderedStopSequence(
  flight: { origin_code?: string | null; destination_code?: string | null },
  legs: RouteStop[]
): string[] {
  const raw: string[] = [];

  // Flight-level origin: prepend only if it differs from the first leg's origin
  if (flight.origin_code) {
    const firstLegOrigin = legs[0]?.origin_code;
    if (!firstLegOrigin || flight.origin_code !== firstLegOrigin) {
      raw.push(flight.origin_code);
    }
  }

  for (const leg of legs) {
    if (leg.origin_code) raw.push(leg.origin_code);
    if (leg.destination_code) raw.push(leg.destination_code);
  }

  // Flight-level destination: append only if it differs from the last leg's destination
  if (flight.destination_code) {
    const lastLegDest = legs[legs.length - 1]?.destination_code;
    if (!lastLegDest || flight.destination_code !== lastLegDest) {
      raw.push(flight.destination_code);
    }
  }

  // Collapse consecutive duplicates
  return raw.filter((code, i) => i === 0 || code !== raw[i - 1]);
}

/**
 * Filter manifest rows to only those whose origin→destination ordering
 * matches the route sequence.
 *
 * A passenger is included if:
 *   1. origin_code appears in the stopSequence, AND
 *   2. destination_code appears AFTER origin_code in the stopSequence
 *
 * This prevents "arriving before departing" on routes where the same
 * code appears at both extremes (e.g., round-trip routes).
 */
export function filterManifestsByRoute<T extends { origin_code: string; destination_code: string }>(
  manifests: T[],
  stopSequence: string[]
): T[] {
  return manifests.filter((r) => {
    const originIdx = stopSequence.indexOf(r.origin_code);
    if (originIdx === -1) return false;
    const destIdx = stopSequence.indexOf(r.destination_code, originIdx + 1);
    return destIdx > originIdx;
  });
}
