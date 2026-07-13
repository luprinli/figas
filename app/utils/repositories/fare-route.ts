import { kdb } from "../db.server";
import { sql } from "kysely";

let fareCache: Map<string, FareRouteRow | null> | null = null;
let fareCacheTimestamp = 0;
const FARE_CACHE_TTL_MS = 60_000;

function invalidateFareCache(): void {
  fareCache = null;
  fareCacheTimestamp = 0;
}

export function clearFareCache(): void {
  invalidateFareCache();
}

export interface FareRouteRow {
  id: number;
  origin_code: string;
  destination_code: string;
  base_fare_gbp: number;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function dec(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toRow(r: Record<string, unknown>): FareRouteRow {
  return {
    id: Number(r.id),
    origin_code: String(r.origin_code ?? ""),
    destination_code: String(r.destination_code ?? ""),
    base_fare_gbp: dec(r.base_fare_gbp) ?? 0,
    currency: String(r.currency ?? "GBP"),
    is_active: Boolean(r.is_active),
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

export const fareRouteRepository = {
  async findByOriginDestination(originCode: string, destinationCode: string): Promise<FareRouteRow | null> {
    const cacheKey = `${originCode}|${destinationCode}`;
    if (fareCache && Date.now() - fareCacheTimestamp < FARE_CACHE_TTL_MS) {
      const cached = fareCache.get(cacheKey);
      if (cached !== undefined) return cached;
    }

    // Symmetric lookup: A\u2192B or B\u2192A
    const rows = await kdb
      .selectFrom("fare_routes")
      .selectAll()
      .where("is_active", "=", true)
      .where((eb) =>
        eb.or([
          eb.and([eb("origin_code", "=", originCode), eb("destination_code", "=", destinationCode)]),
          eb.and([eb("origin_code", "=", destinationCode), eb("destination_code", "=", originCode)]),
        ])
      )
      .execute();
    const result = rows.length > 0 ? toRow(rows[0] as unknown as Record<string, unknown>) : null;
    if (!fareCache) fareCache = new Map();
    fareCache.set(cacheKey, result);
    fareCacheTimestamp = Date.now();
    return result;
  },

  async findByOrigin(originCode: string): Promise<FareRouteRow[]> {
    const rows = await kdb
      .selectFrom("fare_routes")
      .selectAll()
      .where("origin_code", "=", originCode)
      .where("is_active", "=", true)
      .execute();
    return rows.map((r) => toRow(r as unknown as Record<string, unknown>));
  },

  async findByDestination(destinationCode: string): Promise<FareRouteRow[]> {
    const rows = await kdb
      .selectFrom("fare_routes")
      .selectAll()
      .where("destination_code", "=", destinationCode)
      .where("is_active", "=", true)
      .execute();
    return rows.map((r) => toRow(r as unknown as Record<string, unknown>));
  },

  async findAll(): Promise<FareRouteRow[]> {
    const rows = await kdb
      .selectFrom("fare_routes")
      .selectAll()
      .where("is_active", "=", true)
      .orderBy(sql`origin_code asc, destination_code asc`)
      .execute();
    return rows.map((r) => toRow(r as unknown as Record<string, unknown>));
  },

  async getBaseFare(originCode: string, destinationCode: string): Promise<number | null> {
    const route = await this.findByOriginDestination(originCode, destinationCode);
    return route ? Number(route.base_fare_gbp) : null;
  },
};
