import { db } from "../db.server";

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
  // ── Weight & Balance arm positions (metres from datum) ─────────────────────
  empty_arm_m: number | null;
  crew_arm_m: number | null;
  passenger_arm_m: number | null;
  baggage_arm_m: number | null;
  freight_arm_m: number | null;
  fuel_arm_m: number | null;
  created_at: string;
  updated_at: string;
}

export const aircraftRepository = {
  async findAll(): Promise<AircraftRow[]> {
    return db.aircraft.findMany({
      where: { is_active: true },
      orderBy: { registration: "asc" },
    }) as unknown as AircraftRow[];
  },

  async findById(id: number): Promise<AircraftRow | null> {
    return db.aircraft.findUnique({
      where: { id },
    }) as unknown as AircraftRow | null;
  },

  async findByRegistration(registration: string): Promise<AircraftRow | null> {
    return db.aircraft.findUnique({
      where: { registration },
    }) as unknown as AircraftRow | null;
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
    return db.aircraft.create({
      data: {
        registration: data.registration,
        type: data.type ?? "BN-2 Islander",
        seat_count: data.seat_count ?? 9,
        empty_weight_kg: data.empty_weight_kg,
        max_takeoff_weight_kg: data.max_takeoff_weight_kg,
        max_payload_kg: data.max_payload_kg,
        fuel_capacity_kg: data.fuel_capacity_kg,
      },
    }) as unknown as AircraftRow;
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
    await db.aircraft.update({
      where: { id },
      data,
    });
  },
};
