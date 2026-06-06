import { db } from "../db.server";

export interface WeightBalanceSnapshotRow {
  id: number;
  flight_leg_id: number;
  schedule_id: number | null;
  passenger_weight_kg: number;
  baggage_weight_kg: number;
  freight_weight_kg: number;
  fuel_weight_kg: number;
  crew_weight_kg: number;
  empty_weight_kg: number;
  total_weight_kg: number;
  required_fuel_kg: number | null;
  minimum_fuel_kg: number | null;
  fuel_state: string | null;
  fuel_rule_applied: string | null;
  total_moment_kgm: number | null;
  cg_position_pct: number | null;
  effective_mtow_kg: number | null;
  effective_mlw_kg: number | null;
  mtow_used_pct: number | null;
  mlw_used_pct: number | null;
  binding_constraint: string | null;
  binding_constraint_detail: string | null;
  computed_by: string;
  computed_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const weightBalanceRepository = {
  async findById(id: number): Promise<WeightBalanceSnapshotRow | null> {
    return db.weight_balance_snapshots.findUnique({
      where: { id },
    }) as unknown as WeightBalanceSnapshotRow | null;
  },

  async findByFlightLegId(flightLegId: number): Promise<WeightBalanceSnapshotRow | null> {
    return db.weight_balance_snapshots.findFirst({
      where: { flight_leg_id: flightLegId },
      orderBy: { created_at: "desc" },
    }) as unknown as WeightBalanceSnapshotRow | null;
  },

  async findByScheduleId(scheduleId: number): Promise<WeightBalanceSnapshotRow[]> {
    return db.weight_balance_snapshots.findMany({
      where: { schedule_id: scheduleId },
      orderBy: { flight_leg_id: "asc" },
    }) as unknown as WeightBalanceSnapshotRow[];
  },

  async create(data: {
    flight_leg_id: number;
    schedule_id?: number | null;
    passenger_weight_kg: number;
    baggage_weight_kg: number;
    freight_weight_kg: number;
    fuel_weight_kg: number;
    crew_weight_kg: number;
    empty_weight_kg: number;
    total_weight_kg: number;
    required_fuel_kg?: number | null;
    minimum_fuel_kg?: number | null;
    fuel_state?: string | null;
    fuel_rule_applied?: string | null;
    total_moment_kgm?: number | null;
    cg_position_pct?: number | null;
    effective_mtow_kg?: number | null;
    effective_mlw_kg?: number | null;
    mtow_used_pct?: number | null;
    mlw_used_pct?: number | null;
    binding_constraint?: string | null;
    binding_constraint_detail?: string | null;
    computed_by?: string;
    notes?: string | null;
  }): Promise<WeightBalanceSnapshotRow> {
    return db.weight_balance_snapshots.create({
      data: {
        flight_leg_id: data.flight_leg_id,
        schedule_id: data.schedule_id ?? null,
        passenger_weight_kg: data.passenger_weight_kg,
        baggage_weight_kg: data.baggage_weight_kg,
        freight_weight_kg: data.freight_weight_kg,
        fuel_weight_kg: data.fuel_weight_kg,
        crew_weight_kg: data.crew_weight_kg,
        empty_weight_kg: data.empty_weight_kg,
        total_weight_kg: data.total_weight_kg,
        required_fuel_kg: data.required_fuel_kg ?? null,
        minimum_fuel_kg: data.minimum_fuel_kg ?? null,
        fuel_state: data.fuel_state ?? null,
        fuel_rule_applied: data.fuel_rule_applied ?? null,
        total_moment_kgm: data.total_moment_kgm ?? null,
        cg_position_pct: data.cg_position_pct ?? null,
        effective_mtow_kg: data.effective_mtow_kg ?? null,
        effective_mlw_kg: data.effective_mlw_kg ?? null,
        mtow_used_pct: data.mtow_used_pct ?? null,
        mlw_used_pct: data.mlw_used_pct ?? null,
        binding_constraint: data.binding_constraint ?? null,
        binding_constraint_detail: data.binding_constraint_detail ?? null,
        computed_by: data.computed_by ?? "system",
        notes: data.notes ?? null,
      },
    }) as unknown as WeightBalanceSnapshotRow;
  },

  async deleteByScheduleId(scheduleId: number): Promise<void> {
    await db.weight_balance_snapshots.deleteMany({
      where: { schedule_id: scheduleId },
    });
  },
};
