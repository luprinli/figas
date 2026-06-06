import { db } from "../db.server";

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

export const aerodromeRepository = {
  async findAll(): Promise<AerodromeRow[]> {
    return db.aerodromes.findMany({
      where: { is_active: true },
      orderBy: { name: "asc" },
    }) as unknown as AerodromeRow[];
  },

  async findById(id: number): Promise<AerodromeRow | null> {
    return db.aerodromes.findUnique({
      where: { id },
    }) as unknown as AerodromeRow | null;
  },

  async findByCode(code: string): Promise<AerodromeRow | null> {
    return db.aerodromes.findUnique({
      where: { code },
    }) as unknown as AerodromeRow | null;
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
    return db.aerodromes.create({
      data: {
        code: data.code,
        name: data.name,
        runway_length: data.runway_length ?? null,
        runway_type: data.runway_type ?? null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        timezone: data.timezone ?? "Atlantic/Stanley",
      },
    }) as unknown as AerodromeRow;
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
    await db.aerodromes.update({
      where: { id },
      data,
    });
  },
};

// ---------------------------------------------------------------------------
// Standalone utility function for ICAO code lookup
// ---------------------------------------------------------------------------

/**
 * Find an aerodrome by its ICAO code using raw SQL.
 *
 * @param code - The ICAO code (e.g., 'EGYP', 'FALK')
 * @returns The aerodrome row or null if not found
 */
export async function findByCode(
  code: string
): Promise<{ id: number; code: string; name: string; is_active: boolean } | null> {
  const rows = await db.$queryRawUnsafe<
    Array<{ id: number; code: string; name: string; is_active: boolean }>
  >(
    `SELECT id, code, name, is_active FROM aerodromes WHERE code = $1 LIMIT 1`,
    code
  );
  return rows.length > 0 ? rows[0] : null;
}
