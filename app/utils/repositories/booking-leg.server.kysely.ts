import { kdb } from "../db.server.kysely";
import { sql } from "kysely";
import type { BookingLegRow } from "./booking-leg";

export interface BookingLegWithDetails extends BookingLegRow {
  booking_reference: string;
  passenger_name: string;
  passenger_count: number;
  origin_code: string;
  destination_code: string;
}

export const bookingLegServerRepository = {
  async findUnassignedByDate(date: string): Promise<BookingLegWithDetails[]> {
    const rows = await kdb
      .selectFrom("booking_legs as bl")
      .innerJoin("bookings as b", "b.id", "bl.booking_id")
      .innerJoin("booking_passengers as bp", "bp.booking_id", "b.id")
      .leftJoin("booking_leg_passengers as blp", "blp.booking_leg_id", "bl.id")
      .select([
        "bl.id",
        "bl.booking_id",
        "bl.origin_code",
        "bl.destination_code",
        "bl.departure_date",
        "bl.flight_id",
        "bl.status",
        "bl.created_at",
        "bl.updated_at",
        "bl.leg_date",
        "bl.leg_sequence",
        "bl.preferred_time",
        "bl.preferred_time_start",
        "bl.preferred_time_end",
        "b.booking_reference",
      ])
      .select(sql<string>`ARRAY_TO_STRING(ARRAY_AGG(DISTINCT bp.first_name || ' ' || bp.last_name), ', ')`.as("passenger_name"))
      .select(sql<number>`COUNT(*)::int`.as("passenger_count"))
      .where("bl.flight_id", "is", null)
      .where("bl.leg_date", "=", date)
      .where("b.status", "not in", ["cancelled", "completed"])
      .groupBy(["bl.id", "b.booking_reference", "bl.origin_code", "bl.destination_code"])
      .orderBy("b.booking_reference")
      .execute();

    return rows.map((r: Record<string, unknown>) => ({
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
      booking_reference: String(r.booking_reference ?? ""),
      passenger_name: String(r.passenger_name ?? ""),
      passenger_count: Number(r.passenger_count ?? 0),
    })) as BookingLegWithDetails[];
  },

  async findByFlightId(flightId: number): Promise<BookingLegWithDetails[]> {
    const rows = await kdb
      .selectFrom("booking_legs as bl")
      .innerJoin("bookings as b", "b.id", "bl.booking_id")
      .innerJoin("booking_passengers as bp", "bp.booking_id", "b.id")
      .leftJoin("booking_leg_passengers as blp", "blp.booking_leg_id", "bl.id")
      .select([
        "bl.id",
        "bl.booking_id",
        "bl.origin_code",
        "bl.destination_code",
        "bl.departure_date",
        "bl.flight_id",
        "bl.status",
        "bl.created_at",
        "bl.updated_at",
        "bl.leg_date",
        "bl.leg_sequence",
        "bl.preferred_time",
        "bl.preferred_time_start",
        "bl.preferred_time_end",
        "b.booking_reference",
      ])
      .select(sql<string>`ARRAY_TO_STRING(ARRAY_AGG(DISTINCT bp.first_name || ' ' || bp.last_name), ', ')`.as("passenger_name"))
      .select(sql<number>`COUNT(*)::int`.as("passenger_count"))
      .where("bl.flight_id", "=", flightId)
      .groupBy(["bl.id", "b.booking_reference", "bl.origin_code", "bl.destination_code"])
      .orderBy("b.booking_reference")
      .execute();

    return rows.map((r: Record<string, unknown>) => ({
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
      booking_reference: String(r.booking_reference ?? ""),
      passenger_name: String(r.passenger_name ?? ""),
      passenger_count: Number(r.passenger_count ?? 0),
    })) as BookingLegWithDetails[];
  },

  async countUnassignedByDate(date: string): Promise<number> {
    const result = await kdb
      .selectFrom("booking_legs as bl")
      .innerJoin("bookings as b", "b.id", "bl.booking_id")
      .select(kdb.fn.countAll<number>().as("count"))
      .where("bl.flight_id", "is", null)
      .where("bl.leg_date", "=", date)
      .where("b.status", "not in", ["cancelled", "completed"])
      .execute();
    return Number(result[0]?.count ?? 0);
  },

  async countUnassignedByDates(dates: string[]): Promise<Map<string, number>> {
    if (dates.length === 0) return new Map();
    const results = await Promise.all(
      dates.map(async (date) => {
        const count = await this.countUnassignedByDate(date);
        return { date, count };
      })
    );
    const map = new Map<string, number>();
    for (const { date, count } of results) {
      map.set(date, count);
    }
    return map;
  },
};
