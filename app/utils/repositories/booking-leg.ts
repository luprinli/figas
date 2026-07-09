import { db } from "../db.server";

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

export const bookingLegRepository = {
  async findByBookingId(bookingId: number): Promise<BookingLegRow[]> {
    const legs = await db.booking_legs.findMany({
      where: { booking_id: bookingId },
      orderBy: { leg_sequence: "asc" },
    });
    return legs as unknown as BookingLegRow[];
  },

  async findById(id: number): Promise<BookingLegRow | null> {
    const leg = await db.booking_legs.findUnique({
      where: { id },
    });
    return (leg as unknown as BookingLegRow) ?? null;
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
        `Origin and destination must be different: ${data.origin_code} → ${data.destination_code}`
      );
    }
    const leg = await db.booking_legs.create({
      data: {
        booking_id: data.booking_id,
        origin_code: data.origin_code,
        destination_code: data.destination_code,
        leg_date: new Date(data.leg_date),
        departure_date: data.departure_date ? new Date(data.departure_date) : null,
        preferred_time: data.preferred_time ?? null,
        preferred_time_start: data.preferred_time_start ?? null,
        preferred_time_end: data.preferred_time_end ?? null,
        leg_sequence: data.leg_sequence,
      },
    });
    return leg as unknown as BookingLegRow;
  },

  async assignFlight(id: number, flightId: number, client?: typeof db): Promise<void> {
    const c = client ?? db;
    await c.booking_legs.update({
      where: { id },
      data: { flight_id: flightId },
    });
  },

  async updateStatus(id: number, status: string, client?: typeof db): Promise<void> {
    const c = client ?? db;
    await c.booking_legs.update({
      where: { id },
      data: { status },
    });
  },

  async findByBookingIds(ids: number[]): Promise<Map<number, BookingLegRow[]>> {
    if (ids.length === 0) return new Map();
    const legs = await db.booking_legs.findMany({
      where: { booking_id: { in: ids } },
      orderBy: [{ booking_id: "asc" }, { leg_sequence: "asc" }],
    });
    const map = new Map<number, BookingLegRow[]>();
    for (const row of legs as unknown as BookingLegRow[]) {
      const existing = map.get(row.booking_id) ?? [];
      existing.push(row);
      map.set(row.booking_id, existing);
    }
    return map;
  },

  async findUnassignedLegs(): Promise<BookingLegRow[]> {
    const rows = await db.$queryRawUnsafe<
      Array<{
        id: number; booking_id: number; flight_id: number | null;
        origin_code: string; destination_code: string; leg_date: string;
        departure_date: string | null; preferred_time: string | null;
        preferred_time_start: string | null; preferred_time_end: string | null;
        leg_sequence: number; status: string;
        created_at: string; updated_at: string;
      }>
    >(
      `SELECT id, booking_id, flight_id, origin_code, destination_code,
              leg_date, departure_date, preferred_time, preferred_time_start,
              preferred_time_end, leg_sequence, status, created_at, updated_at
       FROM (
         SELECT DISTINCT bl.id, bl.booking_id, bl.flight_id,
                bl.origin_code, bl.destination_code,
                bl.leg_date::text AS leg_date,
                bl.departure_date::text AS departure_date,
                bl.preferred_time, bl.preferred_time_start,
                bl.preferred_time_end, bl.leg_sequence, bl.status,
                bl.created_at::text AS created_at,
                bl.updated_at::text AS updated_at
         FROM booking_legs bl
         JOIN booking_leg_passengers blp ON blp.booking_leg_id = bl.id
         JOIN bookings b ON b.id = bl.booking_id
         WHERE blp.flight_leg_id IS NULL
           AND b.status NOT IN ('cancelled', 'completed')
       ) sub
       ORDER BY sub.leg_date, sub.leg_sequence`
    );
    return rows.map((r) => ({
      id: Number(r.id),
      booking_id: Number(r.booking_id),
      flight_id: r.flight_id ? Number(r.flight_id) : null,
      origin_code: r.origin_code,
      destination_code: r.destination_code,
      leg_date: String(r.leg_date),
      departure_date: r.departure_date ? String(r.departure_date) : null,
      preferred_time: r.preferred_time ? String(r.preferred_time) : null,
      preferred_time_start: r.preferred_time_start ? String(r.preferred_time_start) : null,
      preferred_time_end: r.preferred_time_end ? String(r.preferred_time_end) : null,
      leg_sequence: Number(r.leg_sequence),
      status: r.status,
      created_at: String(r.created_at),
      updated_at: String(r.updated_at),
    })) as unknown as BookingLegRow[];
  },

  async delete(id: number): Promise<void> {
    await db.booking_legs.delete({ where: { id } });
  },

  async countByFlightId(flightId: number): Promise<number> {
    return db.booking_legs.count({
      where: { flight_id: flightId },
    });
  },
};
