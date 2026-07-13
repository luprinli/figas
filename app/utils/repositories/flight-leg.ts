/* eslint-disable @typescript-eslint/no-explicit-any */
import { kdb } from "../db.server";
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

export const flightLegRepository = {
  async findById(id: number): Promise<FlightLegRow | null> {
    const rows = await kdb
      .selectFrom("flight_legs")
      .selectAll()
      .where("id", "=", id)
      .execute();
    return (rows[0] as unknown as FlightLegRow) ?? null;
  },

  async findByFlightId(flightId: number): Promise<FlightLegRow[]> {
    const rows = await kdb
      .selectFrom("flight_legs")
      .selectAll()
      .where("flight_id", "=", flightId)
      .orderBy("leg_number", "asc")
      .execute();
    return rows as unknown as FlightLegRow[];
  },

  async findByScheduleId(scheduleId: number): Promise<FlightLegRow[]> {
    const rows = await kdb
      .selectFrom("flight_legs as fl")
      .innerJoin("flights as f", "f.id", "fl.flight_id")
      .selectAll("fl")
      .where("f.schedule_id", "=", scheduleId)
      .orderBy("fl.flight_id", "asc")
      .orderBy("fl.leg_number", "asc")
      .execute();
    return rows as unknown as FlightLegRow[];
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
        etd: data.departure_time ? new Date(data.departure_time) : null,
        eta: data.arrival_time ? new Date(data.arrival_time) : null,
        distance_nm: data.distance_nm ?? undefined,
        heading: data.heading ?? undefined,
      } as any)
      .returningAll()
      .execute();
    return rows[0] as unknown as FlightLegRow;
  },

  async updateTimes(
    id: number,
    data: { departure_time?: string | null; arrival_time?: string | null }
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.departure_time !== undefined) {
      updateData.etd = data.departure_time ? new Date(data.departure_time) : null;
    }
    if (data.arrival_time !== undefined) {
      updateData.eta = data.arrival_time ? new Date(data.arrival_time) : null;
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
      data.atd = atd ? new Date(atd) : null;
    }
    if (ata !== undefined) {
      data.ata = ata ? new Date(ata) : null;
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
    const exec = async (tx: Kysely<DB>) => {
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
        inserted.push(rows[0] as unknown as FlightLegRow);
      }
      return inserted;
    };
    if (client) {
      return exec(client);
    }
    return kdb.transaction().execute(exec);
  },
};
