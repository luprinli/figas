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
    const n = (v: number | null | undefined): number | null => {
      if (v === null || v === undefined) return null;
      const num = Number(v);
      if (!isFinite(num)) return null;
      return Math.round(num * 100) / 100;
    };
    return db.weight_balance_snapshots.create({
      data: {
        flight_leg_id: data.flight_leg_id,
        schedule_id: data.schedule_id ?? null,
        passenger_weight_kg: n(data.passenger_weight_kg) ?? 0,
        baggage_weight_kg: n(data.baggage_weight_kg) ?? 0,
        freight_weight_kg: n(data.freight_weight_kg) ?? 0,
        fuel_weight_kg: n(data.fuel_weight_kg) ?? 0,
        crew_weight_kg: n(data.crew_weight_kg) ?? 0,
        empty_weight_kg: n(data.empty_weight_kg) ?? 0,
        total_weight_kg: n(data.total_weight_kg) ?? 0,
        required_fuel_kg: n(data.required_fuel_kg),
        minimum_fuel_kg: n(data.minimum_fuel_kg),
        fuel_state: data.fuel_state ?? null,
        fuel_rule_applied: data.fuel_rule_applied ?? null,
        total_moment_kgm: n(data.total_moment_kgm),
        cg_position_pct: n(data.cg_position_pct),
        effective_mtow_kg: n(data.effective_mtow_kg),
        effective_mlw_kg: n(data.effective_mlw_kg),
        mtow_used_pct: n(data.mtow_used_pct),
        mlw_used_pct: n(data.mlw_used_pct),
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
