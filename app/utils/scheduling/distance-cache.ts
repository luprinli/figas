/**
 * Shared in-memory distance and heading cache.
 *
 * Both nearest-neighbor.ts and suggest-route.server.ts previously maintained
 * identical copies of this cache. Consolidating here eliminates the duplication.
 *
 * Data is loaded lazily from the database on first access and cached for the
 * lifetime of the server process. Call clearDistanceCaches() in tests to reset.
 */

import { db } from "../db.server";

// ── Row types ─────────────────────────────────────────────────────────────────

export interface DistanceRow {
  origin: string;
  destination: string;
  distance_nm: number;
}

export interface HeadingRow {
  origin: string;
  destination: string;
  heading: number;
}

// ── In-memory caches ──────────────────────────────────────────────────────────

let distanceCache: DistanceRow[] | null = null;
let headingCache: HeadingRow[] | null = null;

/** O(1) Map lookup keyed by "FROM→TO" (bidirectional). Built alongside distanceCache. */
let distanceMap: Map<string, number> | null = null;

function buildDistanceMap(distances: DistanceRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const d of distances) {
    map.set(`${d.origin}→${d.destination}`, d.distance_nm);
    map.set(`${d.destination}→${d.origin}`, d.distance_nm);
  }
  return map;
}

// ── Loaders ───────────────────────────────────────────────────────────────────

export async function loadDistances(): Promise<DistanceRow[]> {
  if (distanceCache) return distanceCache;
  const rows = await db.aerodrome_distances.findMany({
    select: { origin_code: true, destination_code: true, distance_nm: true },
  });
  distanceCache = rows.map((r) => ({
    origin: r.origin_code,
    destination: r.destination_code,
    distance_nm: Number(r.distance_nm),
  }));
  distanceMap = buildDistanceMap(distanceCache);
  return distanceCache;
}

export async function loadHeadings(): Promise<HeadingRow[]> {
  if (headingCache) return headingCache;
  const rows = await db.aerodrome_headings.findMany({
    select: { origin_code: true, destination_code: true, heading_degrees: true },
  });
  headingCache = rows.map((r) => ({
    origin: r.origin_code,
    destination: r.destination_code,
    heading: Number(r.heading_degrees),
  }));
  return headingCache;
}

// ── Lookup helpers ────────────────────────────────────────────────────────────

/**
 * Look up the distance between two aerodromes (bidirectional).
 * Returns 0 if the distance is unknown.
 */
/**
 * O(1) distance lookup using the pre-built Map.
 * Returns 0 if the distance is unknown or the cache hasn't been loaded.
 */
export function getDistanceFast(from: string, to: string): number {
  if (!distanceMap) return 0;
  return distanceMap.get(`${from}→${to}`) ?? 0;
}

/**
 * Look up the distance between two aerodromes (bidirectional).
 * Returns 0 if the distance is unknown.
 * @deprecated Use getDistanceFast for O(1) lookup. Kept for backward compatibility.
 */
export function getDistance(
  distances: DistanceRow[],
  from: string,
  to: string
): number {
  const row = distances.find(
    (d) =>
      (d.origin === from && d.destination === to) ||
      (d.origin === to && d.destination === from)
  );
  return row?.distance_nm ?? 0;
}

/**
 * Look up the heading from one aerodrome to another (directional).
 * Returns 0 if the heading is unknown.
 */
export function getHeading(
  headings: HeadingRow[],
  from: string,
  to: string
): number {
  const row = headings.find(
    (h) => h.origin === from && h.destination === to
  );
  return row?.heading ?? 0;
}

// ── Cache management ──────────────────────────────────────────────────────────

/**
 * Clear all in-memory caches (useful for testing).
 */
export function clearDistanceCaches(): void {
  distanceCache = null;
  headingCache = null;
  distanceMap = null;
}
