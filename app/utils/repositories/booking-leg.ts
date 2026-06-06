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
    const legs = await db.booking_legs.findMany({
      where: {
        flight_id: null,
        booking: {
          status: { notIn: ["cancelled", "completed"] },
        },
      },
      orderBy: [{ leg_date: "asc" }, { leg_sequence: "asc" }],
    });
    return legs as unknown as BookingLegRow[];
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
