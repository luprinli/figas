/* eslint-disable @typescript-eslint/no-explicit-any */
import { kdb } from "../db.server.kysely";

export interface LoadsheetRow {
  id: number;
  flight_id: number;
  schedule_id: number | null;
  pilot_id: number | null;
  aircraft_id: number | null;
  status: string;
  empty_weight_kg: number | null;
  pilot_weight_kg: number | null;
  cabin_baggage_kg: number | null;
  total_pax: number;
  checksum: string | null;
  notes: string | null;
  finalized_at: string | null;
  finalized_by: number | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoadsheetPassengerRow {
  id: number;
  loadsheet_id: number;
  booking_passenger_id: number;
  booking_leg_id: number;
  seat_row: number | null;
  seat_side: string | null;
  clothed_weight_kg: number | null;
  baggage_weight_kg: number | null;
  freight_weight_kg: number | null;
  boarded: boolean;
  boarded_at: string | null;
}

export interface LoadsheetSectorRow {
  id: number;
  loadsheet_id: number;
  flight_leg_id: number;
  leg_sequence: number;
  origin_code: string | null;
  destination_code: string | null;
  distance_nm: number | null;
  planned_time_min: number | null;
  etd: string | null;
  eta: string | null;
  atd: string | null;
  ata: string | null;
  actual_time_min: number | null;
  fuel_on_board_kg: number | null;
  fuel_burn_kg: number | null;
  fuel_remaining_kg: number | null;
  takeoff_weight_kg: number | null;
  landing_weight_kg: number | null;
  cog_position_mm: number | null;
  cog_status: string | null;
  tow_status: string | null;
  notes: string | null;
}

const EDITABLE_STATUSES = ["draft", "review"];
const ACTIVE_STATUSES = ["active"];
const IMMUTABLE_STATUSES = ["finalized", "archived"];

function parseHHMM(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9]/g, "").substring(0, 4);
  if (cleaned.length < 3) return null;
  const h = cleaned.substring(0, cleaned.length === 3 ? 1 : 2);
  const m = cleaned.length === 3 ? cleaned.substring(1) : cleaned.substring(2);
  // PostgreSQL `time` columns expect a time‑only string, not a full timestamp.
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}:00`;
}

export function canEditLoadsheet(status: string): boolean {
  return EDITABLE_STATUSES.includes(status);
}

export function canEnterActualData(status: string): boolean {
  return ACTIVE_STATUSES.includes(status) || EDITABLE_STATUSES.includes(status);
}

export function isImmutable(status: string): boolean {
  return IMMUTABLE_STATUSES.includes(status);
}

export const loadsheetRepository = {
  async findByFlightId(flightId: number): Promise<LoadsheetRow | null> {
    const row = (await kdb.selectFrom("loadsheets").selectAll().where("flight_id", "=", flightId).execute())[0] ?? null;
    return (row as unknown as LoadsheetRow) ?? null;
  },

  async findById(id: number): Promise<LoadsheetRow | null> {
    const row = (await kdb.selectFrom("loadsheets").selectAll().where("id", "=", id).execute())[0] ?? null;
    return (row as unknown as LoadsheetRow) ?? null;
  },

  async create(data: {
    flight_id: number;
    schedule_id?: number | null;
    pilot_id?: number | null;
    aircraft_id?: number | null;
    empty_weight_kg?: number | null;
    pilot_weight_kg?: number | null;
    total_pax?: number;
  }): Promise<LoadsheetRow> {
    const row = (await kdb.insertInto("loadsheets").values({
      flight_id: data.flight_id,
      schedule_id: data.schedule_id ?? null,
      pilot_id: data.pilot_id ?? null,
      aircraft_id: data.aircraft_id ?? null,
      empty_weight_kg: data.empty_weight_kg ?? null,
      pilot_weight_kg: data.pilot_weight_kg ?? 80,
      total_pax: data.total_pax ?? 0,
    } as any).returningAll().execute())[0];
    return row as unknown as LoadsheetRow;
  },

  async updateStatus(id: number, status: string): Promise<void> {
    await kdb.updateTable("loadsheets").set({ status } as any).where("id", "=", id).execute();
  },

  async finalize(id: number, finalizedBy: number, checksum: string): Promise<void> {
    await kdb.updateTable("loadsheets").set({
      status: "finalized",
      finalized_at: new Date(),
      finalized_by: finalizedBy,
      checksum,
    } as any).where("id", "=", id).execute();
  },

  async addPassenger(data: {
    loadsheet_id: number;
    booking_passenger_id: number;
    booking_leg_id: number;
    seat_row: number | null;
    seat_side: string | null;
    clothed_weight_kg: number;
    baggage_weight_kg: number;
    freight_weight_kg?: number;
  }): Promise<LoadsheetPassengerRow> {
    const row = (await kdb.insertInto("loadsheet_passengers").values({
      loadsheet_id: data.loadsheet_id,
      booking_passenger_id: data.booking_passenger_id,
      booking_leg_id: data.booking_leg_id,
      seat_row: data.seat_row,
      seat_side: data.seat_side,
      clothed_weight_kg: data.clothed_weight_kg,
      baggage_weight_kg: data.baggage_weight_kg,
      freight_weight_kg: data.freight_weight_kg ?? 0,
    } as any).returningAll().execute())[0];
    return row as unknown as LoadsheetPassengerRow;
  },

  async updatePassengerBoarding(id: number, boarded: boolean): Promise<void> {
    await kdb.updateTable("loadsheet_passengers").set({ boarded, boarded_at: boarded ? new Date() : null } as any).where("id", "=", id).execute();
  },

  async findPassengers(loadsheetId: number): Promise<LoadsheetPassengerRow[]> {
    const rows = await kdb.selectFrom("loadsheet_passengers").selectAll()
      .where("loadsheet_id", "=", loadsheetId)
      .orderBy("seat_row", "asc").orderBy("seat_side", "asc")
      .execute();
    return rows as unknown as LoadsheetPassengerRow[];
  },

  async addSector(data: {
    loadsheet_id: number;
    flight_leg_id: number;
    leg_sequence: number;
    origin_code: string;
    destination_code: string;
    distance_nm: number;
    planned_time_min: number;
    etd?: string | null;
    eta?: string | null;
    fuel_on_board_kg: number;
    fuel_burn_kg: number;
    fuel_remaining_kg: number;
    takeoff_weight_kg: number;
    landing_weight_kg: number;
    cog_position_mm: number;
    cog_status: string;
    tow_status: string;
    notes?: string | null;
  }): Promise<LoadsheetSectorRow> {
    const row = (await kdb.insertInto("loadsheet_sectors").values({
      loadsheet_id: data.loadsheet_id,
      flight_leg_id: data.flight_leg_id,
      leg_sequence: data.leg_sequence,
      origin_code: data.origin_code,
      destination_code: data.destination_code,
      distance_nm: data.distance_nm,
      planned_time_min: data.planned_time_min,
      etd: parseHHMM(data.etd),
      eta: parseHHMM(data.eta),
      fuel_on_board_kg: data.fuel_on_board_kg,
      fuel_burn_kg: data.fuel_burn_kg,
      fuel_remaining_kg: data.fuel_remaining_kg,
      takeoff_weight_kg: data.takeoff_weight_kg,
      landing_weight_kg: data.landing_weight_kg,
      cog_position_mm: data.cog_position_mm,
      cog_status: data.cog_status,
      tow_status: data.tow_status,
      notes: data.notes ?? null,
    } as any).returningAll().execute())[0];
    return row as unknown as LoadsheetSectorRow;
  },

  async findSectors(loadsheetId: number): Promise<LoadsheetSectorRow[]> {
    const rows = await kdb.selectFrom("loadsheet_sectors").selectAll()
      .where("loadsheet_id", "=", loadsheetId)
      .orderBy("leg_sequence", "asc")
      .execute();
    return rows as unknown as LoadsheetSectorRow[];
  },

  async updateSectorATD(
    id: number,
    atd: string | null,
    ata: string | null,
    actualTimeMin: number | null
  ): Promise<void> {
    await kdb.updateTable("loadsheet_sectors").set({
      atd: parseHHMM(atd),
      ata: parseHHMM(ata),
      actual_time_min: actualTimeMin,
    } as any).where("id", "=", id).execute();
  },

  async logAudit(data: {
    loadsheet_id: number;
    action: string;
    field_name?: string | null;
    old_value?: string | null;
    new_value?: string | null;
    actor_id?: number | null;
    ip_address?: string | null;
  }): Promise<void> {
    await kdb.insertInto("loadsheet_audit_log").values(data as any).execute();
  },

  async deleteByFlightId(flightId: number): Promise<void> {
    const ls = (await kdb.selectFrom("loadsheets").selectAll().where("flight_id", "=", flightId).execute())[0] ?? null;
    if (ls) {
      await kdb.deleteFrom("loadsheets").where("id", "=", ls.id).execute();
    }
  },
};
