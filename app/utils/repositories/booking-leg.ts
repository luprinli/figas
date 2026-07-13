/* eslint-disable @typescript-eslint/no-explicit-any */
import { kdb } from "../db.server.kysely";
import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { DB } from "../../../generated/kysely/database";
import { BookingStatus } from "../constants";

export interface BookingLegRow {
  id: number;
  booking_id: number;
  flight_id: number | null;
  origin_code: string;
  destination_code: string;
  leg_date: string;
  departure_date: string | null;
  preferred_time: string | null;
  preferred_time_start: string | null;
  preferred_time_end: string | null;
  leg_sequence: number;
  status: string;
  created_at: string;
  updated_at: string;
}

function toRow(r: Record<string, unknown>): BookingLegRow {
  return {
    id: Number(r.id),
    booking_id: Number(r.booking_id),
    flight_id: r.flight_id != null ? Number(r.flight_id) : null,
    origin_code: String(r.origin_code ?? ""),
    destination_code: String(r.destination_code ?? ""),
    leg_date: String(r.leg_date ?? ""),
    departure_date: r.departure_date != null ? String(r.departure_date) : null,
    preferred_time: r.preferred_time != null ? String(r.preferred_time) : null,
    preferred_time_start: r.preferred_time_start != null ? String(r.preferred_time_start) : null,
    preferred_time_end: r.preferred_time_end != null ? String(r.preferred_time_end) : null,
    leg_sequence: Number(r.leg_sequence),
    status: String(r.status ?? ""),
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

export const bookingLegRepository = {
  async findByBookingId(bookingId: number): Promise<BookingLegRow[]> {
    const rows = await kdb
      .selectFrom("booking_legs")
      .selectAll()
      .where("booking_id", "=", bookingId)
      .orderBy("leg_sequence", "asc")
      .execute();
    return rows.map((r) => toRow(r as unknown as Record<string, unknown>));
  },

  async findById(id: number): Promise<BookingLegRow | null> {
    const rows = await kdb
      .selectFrom("booking_legs")
      .selectAll()
      .where("id", "=", id)
      .execute();
    return rows.length > 0 ? toRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async create(data: {
    booking_id: number;
    origin_code: string;
    destination_code: string;
    leg_date: string;
    departure_date?: string | null;
    preferred_time?: string | null;
    preferred_time_start?: string | null;
    preferred_time_end?: string | null;
    leg_sequence: number;
  }): Promise<BookingLegRow> {
    if (data.origin_code === data.destination_code) {
      throw new Error(
        `Origin and destination must be different: ${data.origin_code} \u2192 ${data.destination_code}`
      );
    }
    const rows = await kdb
      .insertInto("booking_legs")
      .values({
        booking_id: data.booking_id,
        origin_code: data.origin_code,
        destination_code: data.destination_code,
        leg_date: data.leg_date,
        departure_date: data.departure_date ?? undefined,
        preferred_time: data.preferred_time ?? undefined,
        preferred_time_start: data.preferred_time_start ?? undefined,
        preferred_time_end: data.preferred_time_end ?? undefined,
        leg_sequence: data.leg_sequence,
      } as any)
      .returningAll()
      .execute();
    return toRow(rows[0] as unknown as Record<string, unknown>);
  },

  async assignFlight(id: number, flightId: number, client?: Kysely<DB>): Promise<void> {
    const c = client ?? kdb;
    await c
      .updateTable("booking_legs")
      .set({ flight_id: flightId } as any)
      .where("id", "=", id)
      .execute();
  },

  async updateStatus(id: number, status: string, client?: Kysely<DB>): Promise<void> {
    const c = client ?? kdb;
    await c
      .updateTable("booking_legs")
      .set({ status } as any)
      .where("id", "=", id)
      .execute();
  },

  async findByBookingIds(ids: number[]): Promise<Map<number, BookingLegRow[]>> {
    if (ids.length === 0) return new Map();
    const rows = await kdb
      .selectFrom("booking_legs")
      .selectAll()
      .where("booking_id", "in", ids)
      .orderBy(sql`booking_id asc, leg_sequence asc`)
      .execute();
    const map = new Map<number, BookingLegRow[]>();
    for (const r of rows) {
      const row = toRow(r as unknown as Record<string, unknown>);
      const existing = map.get(row.booking_id) ?? [];
      existing.push(row);
      map.set(row.booking_id, existing);
    }
    return map;
  },

  async findUnassignedLegs(): Promise<BookingLegRow[]> {
    const subq = kdb
      .selectFrom("booking_legs as bl")
      .innerJoin("booking_leg_passengers as blp", "blp.booking_leg_id", "bl.id")
      .innerJoin("bookings as b", "b.id", "bl.booking_id")
      .select([
        "bl.id",
        "bl.booking_id",
        "bl.flight_id",
        "bl.origin_code",
        "bl.destination_code",
        "bl.leg_date",
        "bl.departure_date",
        "bl.preferred_time",
        "bl.preferred_time_start",
        "bl.preferred_time_end",
        "bl.leg_sequence",
        "bl.status",
        "bl.created_at",
        "bl.updated_at",
      ])
      .where("blp.flight_leg_id", "is", null)
      .where("b.status", "not in", [BookingStatus.CANCELLED, BookingStatus.COMPLETED])
      .distinct()
      .as("sub");

    const rows = await kdb
      .selectFrom(subq)
      .selectAll()
      .orderBy(sql`leg_date asc, leg_sequence asc`)
      .execute();

    return rows.map((r) => toRow(r as unknown as Record<string, unknown>));
  },

  async delete(id: number): Promise<void> {
    await kdb.deleteFrom("booking_legs").where("id", "=", id).execute();
  },

  async countByFlightId(flightId: number): Promise<number> {
    const result = await kdb
      .selectFrom("booking_legs")
      .select(kdb.fn.countAll<number>().as("count"))
      .where("flight_id", "=", flightId)
      .execute();
    return Number(result[0]?.count ?? 0);
  },
};
