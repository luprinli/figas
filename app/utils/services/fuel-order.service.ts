import { kdb } from "../db.server.kysely";
import { sql } from "kysely";
import { FuelOrderStatus } from "../constants";

export interface FuelOrderRow {
  id: number;
  flightId: number;
  flightLegId: number | null;
  status: string;
  requestedFuelKg: number;
  calculatedBreakdown: Record<string, unknown> | null;
  issuedBy: number | null;
  issuedAt: string | null;
  fuelerActualUpliftKg: number | null;
  fuelerConfirmedBy: number | null;
  fuelerConfirmedAt: string | null;
  fuelerNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

function toRow(r: Record<string, unknown>): FuelOrderRow {
  return {
    id: Number(r.id),
    flightId: Number(r.flight_id),
    flightLegId: r.flight_leg_id != null ? Number(r.flight_leg_id) : null,
    status: String(r.status ?? ""),
    requestedFuelKg: Number(r.requested_fuel_kg),
    calculatedBreakdown: typeof r.calculated_breakdown === "object" ? (r.calculated_breakdown as Record<string, unknown>) : null,
    issuedBy: r.issued_by != null ? Number(r.issued_by) : null,
    issuedAt: r.issued_at != null ? String(r.issued_at) : null,
    fuelerActualUpliftKg: r.fueler_actual_uplift_kg != null ? Number(r.fueler_actual_uplift_kg) : null,
    fuelerConfirmedBy: r.fueler_confirmed_by != null ? Number(r.fueler_confirmed_by) : null,
    fuelerConfirmedAt: r.fueler_confirmed_at != null ? String(r.fueler_confirmed_at) : null,
    fuelerNotes: r.fueler_notes != null ? String(r.fueler_notes) : null,
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

export async function calculateFuelRequirements(flightId: number): Promise<{ startingFuelKg: number; reserveFuelKg: number; breakdown: Record<string, unknown> }> {
  const wbResult = await sql<{
    fuel_weight_kg: string; starting_fuel_kg: string | null; reserve_fuel_kg: string | null;
  }>`
    SELECT wbs.fuel_weight_kg, wbs.starting_fuel_kg, wbs.reserve_fuel_kg
    FROM weight_balance_snapshots wbs
    JOIN flight_legs fl ON fl.id = wbs.flight_leg_id
    WHERE fl.flight_id = ${flightId}
    ORDER BY wbs.id DESC LIMIT 1
  `.execute(kdb);

  const startingFuelKg = wbResult.rows.length > 0
    ? Number(wbResult.rows[0].starting_fuel_kg ?? wbResult.rows[0].fuel_weight_kg ?? 45)
    : 45;
  const reserveFuelKg = wbResult.rows.length > 0
    ? Number(wbResult.rows[0].reserve_fuel_kg ?? 35)
    : 35;

  return {
    startingFuelKg,
    reserveFuelKg,
    breakdown: {
      startingFuelKg,
      reserveFuelKg,
      taxiFuelKg: 3,
      tripFuelKg: Math.max(0, startingFuelKg - reserveFuelKg - 3),
    },
  };
}

export async function getFuelOrder(flightId: number): Promise<FuelOrderRow | null> {
  try {
    const rows = await kdb.selectFrom("fuel_orders").selectAll()
      .where("flight_id", "=", flightId)
      .orderBy("id", "desc")
      .limit(1)
      .execute();
    return rows.length > 0 ? toRow(rows[0] as unknown as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function issueFuelOrder(
  flightId: number,
  userId: number,
  requestedFuelKg: number,
  breakdown?: Record<string, unknown>
): Promise<FuelOrderRow> {
  const rows = await kdb.insertInto("fuel_orders")
    .values({
      flight_id: flightId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      status: FuelOrderStatus.ISSUED as any,
      requested_fuel_kg: requestedFuelKg,
      calculated_breakdown: breakdown ?? {},
      issued_by: userId,
      issued_at: sql`NOW()`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .returningAll()
    .execute();
  return toRow(rows[0] as unknown as Record<string, unknown>);
}

export async function recordActualFuel(
  orderId: number,
  userId: number,
  actualKg: number,
  notes?: string
): Promise<FuelOrderRow> {
  await kdb.updateTable("fuel_orders")
    .set({
      status: FuelOrderStatus.COMPLETED,
      fueler_actual_uplift_kg: actualKg,
      fueler_confirmed_by: userId,
      fueler_confirmed_at: sql`NOW()`,
      fueler_notes: notes ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .where("id", "=", orderId)
    .execute();

  const rows = await kdb.selectFrom("fuel_orders").selectAll()
    .where("id", "=", orderId)
    .execute();
  return toRow(rows[0] as unknown as Record<string, unknown>);
}

export async function listPendingFuelOrders(): Promise<FuelOrderRow[]> {
  try {
    const rows = await kdb.selectFrom("fuel_orders")
      .selectAll()
      .where("status", "in", [FuelOrderStatus.ISSUED, FuelOrderStatus.FUELING])
      .orderBy("issued_at", "asc")
      .execute();
    return rows.map((r) => toRow(r as unknown as Record<string, unknown>));
  } catch {
    return [];
  }
}
