import { kdb } from "../db.server";

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

function dec(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toRow(r: Record<string, unknown>): WeightBalanceSnapshotRow {
  return {
    id: Number(r.id),
    flight_leg_id: Number(r.flight_leg_id),
    schedule_id: r.schedule_id != null ? Number(r.schedule_id) : null,
    passenger_weight_kg: dec(r.passenger_weight_kg) ?? 0,
    baggage_weight_kg: dec(r.baggage_weight_kg) ?? 0,
    freight_weight_kg: dec(r.freight_weight_kg) ?? 0,
    fuel_weight_kg: dec(r.fuel_weight_kg) ?? 0,
    crew_weight_kg: dec(r.crew_weight_kg) ?? 0,
    empty_weight_kg: dec(r.empty_weight_kg) ?? 0,
    total_weight_kg: dec(r.total_weight_kg) ?? 0,
    required_fuel_kg: dec(r.required_fuel_kg),
    minimum_fuel_kg: dec(r.minimum_fuel_kg),
    fuel_state: r.fuel_state != null ? String(r.fuel_state) : null,
    fuel_rule_applied: r.fuel_rule_applied != null ? String(r.fuel_rule_applied) : null,
    total_moment_kgm: dec(r.total_moment_kgm),
    cg_position_pct: dec(r.cg_position_pct),
    effective_mtow_kg: dec(r.effective_mtow_kg),
    effective_mlw_kg: dec(r.effective_mlw_kg),
    mtow_used_pct: dec(r.mtow_used_pct),
    mlw_used_pct: dec(r.mlw_used_pct),
    binding_constraint: r.binding_constraint != null ? String(r.binding_constraint) : null,
    binding_constraint_detail: r.binding_constraint_detail != null ? String(r.binding_constraint_detail) : null,
    computed_by: String(r.computed_by ?? "system"),
    computed_at: String(r.computed_at ?? ""),
    notes: r.notes != null ? String(r.notes) : null,
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

function n(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const num = Number(v);
  if (!isFinite(num)) return null;
  return Math.round(num * 100) / 100;
}

export const weightBalanceRepository = {
  async findById(id: number): Promise<WeightBalanceSnapshotRow | null> {
    const rows = await kdb
      .selectFrom("weight_balance_snapshots")
      .selectAll()
      .where("id", "=", id)
      .execute();
    return rows.length > 0 ? toRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async findByFlightLegId(flightLegId: number): Promise<WeightBalanceSnapshotRow | null> {
    const rows = await kdb
      .selectFrom("weight_balance_snapshots")
      .selectAll()
      .where("flight_leg_id", "=", flightLegId)
      .orderBy("created_at", "desc")
      .limit(1)
      .execute();
    return rows.length > 0 ? toRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async findByScheduleId(scheduleId: number): Promise<WeightBalanceSnapshotRow[]> {
    const rows = await kdb
      .selectFrom("weight_balance_snapshots")
      .selectAll()
      .where("schedule_id", "=", scheduleId)
      .orderBy("flight_leg_id", "asc")
      .execute();
    return rows.map((r) => toRow(r as unknown as Record<string, unknown>));
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
    const rows = await kdb
      .insertInto("weight_balance_snapshots")
      .values({
        flight_leg_id: data.flight_leg_id,
        schedule_id: data.schedule_id ?? undefined,
        passenger_weight_kg: String(n(data.passenger_weight_kg) ?? 0),
        baggage_weight_kg: String(n(data.baggage_weight_kg) ?? 0),
        freight_weight_kg: String(n(data.freight_weight_kg) ?? 0),
        fuel_weight_kg: String(n(data.fuel_weight_kg) ?? 0),
        crew_weight_kg: String(n(data.crew_weight_kg) ?? 0),
        empty_weight_kg: String(n(data.empty_weight_kg) ?? 0),
        total_weight_kg: String(n(data.total_weight_kg) ?? 0),
        required_fuel_kg: n(data.required_fuel_kg) != null ? String(n(data.required_fuel_kg)) : undefined,
        minimum_fuel_kg: n(data.minimum_fuel_kg) != null ? String(n(data.minimum_fuel_kg)) : undefined,
        fuel_state: data.fuel_state ?? undefined,
        fuel_rule_applied: data.fuel_rule_applied ?? undefined,
        total_moment_kgm: n(data.total_moment_kgm) != null ? String(n(data.total_moment_kgm)) : undefined,
        cg_position_pct: n(data.cg_position_pct) != null ? String(n(data.cg_position_pct)) : undefined,
        effective_mtow_kg: n(data.effective_mtow_kg) != null ? String(n(data.effective_mtow_kg)) : undefined,
        effective_mlw_kg: n(data.effective_mlw_kg) != null ? String(n(data.effective_mlw_kg)) : undefined,
        mtow_used_pct: n(data.mtow_used_pct) != null ? String(n(data.mtow_used_pct)) : undefined,
        mlw_used_pct: n(data.mlw_used_pct) != null ? String(n(data.mlw_used_pct)) : undefined,
        binding_constraint: data.binding_constraint ?? undefined,
        binding_constraint_detail: data.binding_constraint_detail ?? undefined,
        computed_by: data.computed_by ?? "system",
        notes: data.notes ?? undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .returningAll()
      .execute();
    return toRow(rows[0] as unknown as Record<string, unknown>);
  },

  async deleteByScheduleId(scheduleId: number): Promise<void> {
    await kdb
      .deleteFrom("weight_balance_snapshots")
      .where("schedule_id", "=", scheduleId)
      .execute();
  },
};
