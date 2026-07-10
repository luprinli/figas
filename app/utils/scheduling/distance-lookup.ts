import { db } from "../db.server";

// ── Types ─────────────────────────────────────────────────────────────────────

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

let dbMap: Map<string, number> | null = null;
let csvMap: Map<string, number> | null = null;
let headingCache: HeadingRow[] | null = null;
let distanceCache: DistanceRow[] | null = null;

// ── DB loaders ────────────────────────────────────────────────────────────────

export async function loadDistances(): Promise<DistanceRow[]> {
  if (distanceCache) return distanceCache;
  const rows = await db.selectFrom("aerodrome_distances")
    .select(["origin_code", "destination_code", "distance_nm"])
    .execute();
  distanceCache = rows.map((r) => ({
    origin: String(r.origin_code),
    destination: String(r.destination_code),
    distance_nm: Number(r.distance_nm),
  }));
  dbMap = buildBidirectionalMap(distanceCache);
  return distanceCache;
}

export async function loadHeadings(): Promise<HeadingRow[]> {
  if (headingCache) return headingCache;
  const rows = await db.selectFrom("aerodrome_headings")
    .select(["origin_code", "destination_code", "heading_degrees"])
    .execute();
  headingCache = rows.map((r) => ({
    origin: String(r.origin_code),
    destination: String(r.destination_code),
    heading: Number(r.heading_degrees),
  }));
  return headingCache;
}

// ── CSV loader (fallback) ─────────────────────────────────────────────────────

async function loadCSVMap(): Promise<Map<string, number>> {
  if (csvMap) return csvMap;
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const csvPath = path.resolve(process.cwd(), "data/distance.csv");
  const content = await fs.readFile(csvPath, "utf-8");
  csvMap = parseDistanceCSV(content);
  return csvMap;
}

function parseDistanceCSV(csvContent: string): Map<string, number> {
  const lines = csvContent.trim().split("\n");
  const headers = lines[0].split("\t").map((h) => h.trim()).filter(Boolean);
  const map = new Map<string, number>();

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split("\t");
    const origin = cells[0]?.trim();
    if (!origin) continue;
    for (let j = 1; j < cells.length; j++) {
      const dest = headers[j - 1];
      const val = parseInt(cells[j], 10);
      if (dest && !isNaN(val) && val > 0) {
        map.set(`${origin}→${dest}`, val);
        map.set(`${dest}→${origin}`, val);
      }
    }
  }
  return map;
}

// ── Map builder ───────────────────────────────────────────────────────────────

function buildBidirectionalMap(distances: DistanceRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const d of distances) {
    map.set(`${d.origin}→${d.destination}`, d.distance_nm);
    map.set(`${d.destination}→${d.origin}`, d.distance_nm);
  }
  return map;
}

// ── Unified lookup API ────────────────────────────────────────────────────────

export async function lookupDistance(from: string, to: string): Promise<number> {
  const key = `${from}→${to}`;
  if (!dbMap) await loadDistances();
  const dbVal = dbMap!.get(key);
  if (dbVal != null && dbVal > 0) return dbVal;
  if (!csvMap) await loadCSVMap();
  return csvMap!.get(key) ?? 0;
}

export function getDistanceFast(from: string, to: string): number {
  if (!dbMap) return 0;
  return dbMap.get(`${from}→${to}`) ?? 0;
}

export async function getCSVDistance(from: string, to: string): Promise<number> {
  if (!csvMap) await loadCSVMap();
  return csvMap!.get(`${from}→${to}`) ?? 0;
}

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

export function getHeading(
  headings: HeadingRow[],
  from: string,
  to: string
): number {
  const row = headings.find((h) => h.origin === from && h.destination === to);
  return row?.heading ?? 0;
}

// ── Cache management ──────────────────────────────────────────────────────────

export function clearDistanceCaches(): void {
  dbMap = null;
  csvMap = null;
  headingCache = null;
  distanceCache = null;
}

/** Exposed for loadsheet-calculations compatibility */
export async function loadCSVDistanceMap(): Promise<Map<string, number>> {
  return loadCSVMap();
}
