/**
 * Aerodrome repository — Kysely implementation.
 *
 * Phase B proof‑of‑concept for the Kysely migration. Exposes the exact same
 * `aerodromeRepository` API as the Prisma version (same method signatures,
 * same return types). Callers can swap the import line to point here with
 * zero downstream changes.
 *
 * Kysely returns PostgreSQL `DECIMAL`/`NUMERIC` columns as `string` (wire
 * protocol). The `dec()` helper converts to `number | null` for backward
 * compatibility with the existing `AerodromeRow` interface.
 */

import { kdb } from "../db.server.kysely";
import type { Kysely } from "kysely";
import type { DB } from "../../../generated/kysely/database";

// ── Backward‑compatible Row type (identical to the Prisma version) ─────────────

export interface AerodromeRow {
  id: number;
  code: string;
  name: string;
  city: string | null;
  runway_length: number | null;
  runway_type: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  manufacturer: string | null;
  model: string | null;
  mtow_limit_kg: number | null;
  mlw_limit_kg: number | null;
  fuel_available: boolean;
  operating_hours: string | null;
  pilot_briefing_required: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert a Kysely DECIMAL string \u2192 number | null (safe). */
function dec(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Map a Kysely aerodrome row (with string decimals) to AerodromeRow. */
function toRow(r: Record<string, unknown>): AerodromeRow {
  return {
    id: Number(r.id),
    code: String(r.code ?? ""),
    name: String(r.name ?? ""),
    city: r.city != null ? String(r.city) : null,
    runway_length: dec(r.runway_length),
    runway_type: r.runway_type != null ? String(r.runway_type) : null,
    latitude: dec(r.latitude),
    longitude: dec(r.longitude),
    timezone: String(r.timezone ?? "Atlantic/Stanley"),
    manufacturer: r.manufacturer != null ? String(r.manufacturer) : null,
    model: r.model != null ? String(r.model) : null,
    mtow_limit_kg: dec(r.mtow_limit_kg),
    mlw_limit_kg: dec(r.mlw_limit_kg),
    fuel_available: Boolean(r.fuel_available),
    operating_hours: r.operating_hours != null ? String(r.operating_hours) : null,
    pilot_briefing_required: Boolean(r.pilot_briefing_required),
    is_active: Boolean(r.is_active),
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

// ── Repository ────────────────────────────────────────────────────────────────

export const aerodromeRepository = {
  async findAll(): Promise<AerodromeRow[]> {
    const rows = await kdb
      .selectFrom("aerodromes")
      .selectAll()
      .where("is_active", "=", true)
      .orderBy("name", "asc")
      .execute();
    return rows.map(toRow);
  },

  async findById(
    id: number,
    trx?: Kysely<DB>
  ): Promise<AerodromeRow | null> {
    const qb = (trx ?? kdb)
      .selectFrom("aerodromes")
      .selectAll()
      .where("id", "=", id);
    const rows = await qb.execute();
    return rows.length > 0 ? toRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async findByCode(
    code: string,
    trx?: Kysely<DB>
  ): Promise<AerodromeRow | null> {
    const qb = (trx ?? kdb)
      .selectFrom("aerodromes")
      .selectAll()
      .where("code", "=", code);
    const rows = await qb.execute();
    return rows.length > 0 ? toRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async create(data: {
    code: string;
    name: string;
    runway_length?: number | null;
    runway_type?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    timezone?: string;
  }): Promise<AerodromeRow> {
    const rows = await kdb
      .insertInto("aerodromes")
      // Cast: Kysely's InsertExpression requires all non-null columns even
      // when the DB has defaults. Safe at runtime because missing columns
      // use PostgreSQL DEFAULT values.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .values({
        code: data.code,
        name: data.name,
        runway_length: data.runway_length != null ? String(data.runway_length) : undefined,
        runway_type: data.runway_type ?? undefined,
        latitude: data.latitude != null ? String(data.latitude) : undefined,
        longitude: data.longitude != null ? String(data.longitude) : undefined,
        timezone: data.timezone ?? "Atlantic/Stanley",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .returningAll()
      .execute();
    return toRow(rows[0] as unknown as Record<string, unknown>);
  },

  async update(
    id: number,
    data: Partial<{
      code: string;
      name: string;
      runway_length: number | null;
      runway_type: string | null;
      latitude: number | null;
      longitude: number | null;
      timezone: string;
      is_active: boolean;
    }>
  ): Promise<void> {
    await kdb
      .updateTable("aerodromes")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set(data as any)
      .where("id", "=", id)
      .execute();
  },
};

// ── Standalone utility ────────────────────────────────────────────────────────

/**
 * Find an aerodrome by its ICAO code using a lightweight query.
 */
export async function findByCode(
  code: string
): Promise<{ id: number; code: string; name: string; is_active: boolean } | null> {
  const rows = await kdb
    .selectFrom("aerodromes")
    .select(["id", "code", "name", "is_active"])
    .where("code", "=", code)
    .execute();
  if (rows.length === 0) return null;
  return {
    id: Number(rows[0].id),
    code: String(rows[0].code),
    name: String(rows[0].name),
    is_active: Boolean(rows[0].is_active),
  };
}
