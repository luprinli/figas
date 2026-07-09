import { kdb } from "../db.server.kysely";
import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { DB } from "../../../generated/kysely/database";

export interface FlightLegRow {
  id: number;
  flight_id: number;
  leg_sequence: number;
  origin_code: string;
  destination_code: string;
  departure_time: string | null;
  arrival_time: string | null;
  distance_nm: number | null;
  heading: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

function toRow(r: Record<string, unknown>): FlightLegRow {
  return {
    id: Number(r.id),
    flight_id: Number(r.flight_id),
    leg_sequence: Number(r.leg_number ?? r.leg_sequence),
    origin_code: String(r.origin_code ?? ""),
    destination_code: String(r.destination_code ?? ""),
    departure_time: r.etd != null ? String(r.etd) : (r.departure_time != null ? String(r.departure_time) : null),
    arrival_time: r.eta != null ? String(r.eta) : (r.arrival_time != null ? String(r.arrival_time) : null),
    distance_nm: r.distance_nm != null ? Number(r.distance_nm) : null,
    heading: r.heading != null ? Number(r.heading) : null,
    status: String(r.status ?? ""),
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

export const flightLegRepository = {
  async findById(id: number): Promise<FlightLegRow | null> {
    const rows = await kdb
      .selectFrom("flight_legs")
      .selectAll()
      .where("id", "=", id)
      .execute();
    return rows.length > 0 ? toRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async findByFlightId(flightId: number): Promise<FlightLegRow[]> {
    const rows = await kdb
      .selectFrom("flight_legs")
      .selectAll()
      .where("flight_id", "=", flightId)
      .orderBy("leg_number asc")
      .execute();
    return rows.map((r) => toRow(r as unknown as Record<string, unknown>));
  },

  async findByScheduleId(scheduleId: number): Promise<FlightLegRow[]> {
    const rows = await kdb
      .selectFrom("flight_legs as fl")
      .innerJoin("flights as f", "f.id", "fl.flight_id")
      .select([
        "fl.id",
        "fl.flight_id",
        "fl.leg_number",
        "fl.origin_code",
        "fl.destination_code",
        "fl.etd",
        "fl.eta",
        "fl.distance_nm",
        "fl.heading",
        "fl.status",
        "fl.atd",
        "fl.ata",
        "fl.pax_on",
        "fl.pax_off",
        "fl.bags_on",
        "fl.bags_off",
        "fl.fuel_uplift_kg",
        "fl.fuel_on_board_kg",
        "fl.tow_kg",
        "fl.lw_kg",
        "fl.schedule_id",
        "fl.created_at",
        "fl.updated_at",
      ])
      .where("f.schedule_id", "=", scheduleId)
      .orderBy(sql`fl.flight_id asc, fl.leg_number asc`)
      .execute();
    return rows.map((r) => toRow(r as unknown as Record<string, unknown>));
  },

  async create(data: {
    flight_id: number;
    leg_sequence: number;
    origin_code: string;
    destination_code: string;
    departure_time?: string | null;
    arrival_time?: string | null;
    distance_nm?: number | null;
    heading?: number | null;
  }): Promise<FlightLegRow> {
    const rows = await kdb
      .insertInto("flight_legs")
      .values({
        flight_id: data.flight_id,
        leg_number: data.leg_sequence,
        origin_code: data.origin_code,
        destination_code: data.destination_code,
        etd: data.departure_time ?? undefined,
        eta: data.arrival_time ?? undefined,
        distance_nm: data.distance_nm != null ? String(data.distance_nm) : undefined,
        heading: data.heading != null ? String(data.heading) : undefined,
      } as any)
      .returningAll()
      .execute();
    return toRow(rows[0] as unknown as Record<string, unknown>);
  },

  async updateTimes(
    id: number,
    data: { departure_time?: string | null; arrival_time?: string | null }
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.departure_time !== undefined) {
      updateData.etd = data.departure_time ?? null;
    }
    if (data.arrival_time !== undefined) {
      updateData.eta = data.arrival_time ?? null;
    }
    if (Object.keys(updateData).length === 0) return;
    await kdb
      .updateTable("flight_legs")
      .set(updateData as any)
      .where("id", "=", id)
      .execute();
  },

  async updateStatus(id: number, status: string): Promise<void> {
    await kdb
      .updateTable("flight_legs")
      .set({ status } as any)
      .where("id", "=", id)
      .execute();
  },

  async updateActualTimes(
    id: number,
    atd?: string | null,
    ata?: string | null
  ): Promise<void> {
    const data: Record<string, unknown> = {};
    if (atd !== undefined) {
      data.atd = atd ?? null;
    }
    if (ata !== undefined) {
      data.ata = ata ?? null;
    }
    if (Object.keys(data).length === 0) return;
    await kdb
      .updateTable("flight_legs")
      .set(data as any)
      .where("id", "=", id)
      .execute();
  },

  async deleteByFlightId(flightId: number): Promise<void> {
    await kdb
      .deleteFrom("flight_legs")
      .where("flight_id", "=", flightId)
      .execute();
  },

  async replaceFlightLegs(
    flightId: number,
    legs: { leg_sequence: number; origin_code: string; destination_code: string }[],
    client?: Kysely<DB>
  ): Promise<FlightLegRow[]> {
    const exec = async (tx: Kysely<DB>): Promise<FlightLegRow[]> => {
      await tx
        .deleteFrom("flight_legs")
        .where("flight_id", "=", flightId)
        .execute();
      const inserted: FlightLegRow[] = [];
      for (const leg of legs) {
        const rows = await tx
          .insertInto("flight_legs")
          .values({
            flight_id: flightId,
            leg_number: leg.leg_sequence,
            origin_code: leg.origin_code,
            destination_code: leg.destination_code,
          } as any)
          .returningAll()
          .execute();
        inserted.push(toRow(rows[0] as unknown as Record<string, unknown>));
      }
      return inserted;
    };
    if (client) {
      return exec(client);
    }
    return kdb.transaction().execute(exec);
  },
};
