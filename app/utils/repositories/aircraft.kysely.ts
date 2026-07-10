import { kdb } from "../db.server";

export interface AircraftRow {
  id: number;
  registration: string;
  type: string;
  manufacturer: string | null;
  model: string | null;
  year: number | null;
  seat_count: number;
  empty_weight_kg: number;
  max_takeoff_weight_kg: number;
  max_landing_weight_kg: number | null;
  max_payload_kg: number;
  fuel_capacity_kg: number;
  max_freight_weight: number;
  max_ramp_weight_kg: number | null;
  cg_arm_m: number | null;
  fuel_flow_kg_per_hour: number | null;
  cruise_speed_ktas: number | null;
  is_active: boolean;
  empty_arm_m: number | null;
  crew_arm_m: number | null;
  passenger_arm_m: number | null;
  baggage_arm_m: number | null;
  freight_arm_m: number | null;
  fuel_arm_m: number | null;
  created_at: string;
  updated_at: string;
}

function dec(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toRow(r: Record<string, unknown>): AircraftRow {
  return {
    id: Number(r.id),
    registration: String(r.registration ?? ""),
    type: String(r.type ?? ""),
    manufacturer: r.manufacturer != null ? String(r.manufacturer) : null,
    model: r.model != null ? String(r.model) : null,
    year: r.year != null ? Number(r.year) : null,
    seat_count: Number(r.seat_count ?? 0),
    empty_weight_kg: dec(r.empty_weight_kg) ?? 0,
    max_takeoff_weight_kg: dec(r.max_takeoff_weight_kg) ?? 0,
    max_landing_weight_kg: dec(r.max_landing_weight_kg),
    max_payload_kg: dec(r.max_payload_kg) ?? 0,
    fuel_capacity_kg: dec(r.fuel_capacity_kg) ?? 0,
    max_freight_weight: dec(r.max_freight_weight) ?? 0,
    max_ramp_weight_kg: dec(r.max_ramp_weight_kg),
    cg_arm_m: dec(r.cg_arm_m),
    fuel_flow_kg_per_hour: dec(r.fuel_flow_kg_per_hour),
    cruise_speed_ktas: dec(r.cruise_speed_ktas),
    is_active: Boolean(r.is_active),
    empty_arm_m: dec(r.empty_arm_m),
    crew_arm_m: dec(r.crew_arm_m),
    passenger_arm_m: dec(r.passenger_arm_m),
    baggage_arm_m: dec(r.baggage_arm_m),
    freight_arm_m: dec(r.freight_arm_m),
    fuel_arm_m: dec(r.fuel_arm_m),
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

export const aircraftRepository = {
  async findAll(): Promise<AircraftRow[]> {
    const rows = await kdb
      .selectFrom("aircraft")
      .selectAll()
      .where("is_active", "=", true)
      .orderBy("registration asc")
      .execute();
    return rows.map((r) => toRow(r as unknown as Record<string, unknown>));
  },

  async findById(id: number): Promise<AircraftRow | null> {
    const rows = await kdb
      .selectFrom("aircraft")
      .selectAll()
      .where("id", "=", id)
      .execute();
    return rows.length > 0 ? toRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async findByRegistration(registration: string): Promise<AircraftRow | null> {
    const rows = await kdb
      .selectFrom("aircraft")
      .selectAll()
      .where("registration", "=", registration)
      .execute();
    return rows.length > 0 ? toRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async create(data: {
    registration: string;
    type?: string;
    seat_count?: number;
    empty_weight_kg: number;
    max_takeoff_weight_kg: number;
    max_payload_kg: number;
    fuel_capacity_kg: number;
  }): Promise<AircraftRow> {
    const rows = await kdb
      .insertInto("aircraft")
      .values({
        registration: data.registration,
        type: data.type ?? "BN-2 Islander",
        seat_count: data.seat_count ?? 9,
        empty_weight_kg: String(data.empty_weight_kg),
        max_takeoff_weight_kg: String(data.max_takeoff_weight_kg),
        max_payload_kg: String(data.max_payload_kg),
        fuel_capacity_kg: String(data.fuel_capacity_kg),
      } as any)
      .returningAll()
      .execute();
    return toRow(rows[0] as unknown as Record<string, unknown>);
  },

  async update(
    id: number,
    data: Partial<{
      registration: string;
      type: string;
      seat_count: number;
      empty_weight_kg: number;
      max_takeoff_weight_kg: number;
      max_payload_kg: number;
      fuel_capacity_kg: number;
      is_active: boolean;
    }>
  ): Promise<void> {
    const setData: Record<string, unknown> = {};
    if (data.registration !== undefined) setData.registration = data.registration;
    if (data.type !== undefined) setData.type = data.type;
    if (data.seat_count !== undefined) setData.seat_count = data.seat_count;
    if (data.empty_weight_kg !== undefined) setData.empty_weight_kg = String(data.empty_weight_kg);
    if (data.max_takeoff_weight_kg !== undefined) setData.max_takeoff_weight_kg = String(data.max_takeoff_weight_kg);
    if (data.max_payload_kg !== undefined) setData.max_payload_kg = String(data.max_payload_kg);
    if (data.fuel_capacity_kg !== undefined) setData.fuel_capacity_kg = String(data.fuel_capacity_kg);
    if (data.is_active !== undefined) setData.is_active = data.is_active;
    await kdb
      .updateTable("aircraft")
      .set(setData as any)
      .where("id", "=", id)
      .execute();
  },
};
