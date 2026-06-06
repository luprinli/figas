import { db } from "../db.server";
import type { BookingLegRow } from "./booking-leg";

/**
 * Server-only booking leg repository with write operations and advanced queries.
 * These functions should only be called from loaders/actions (server-side).
 */

export interface BookingLegWithDetails extends BookingLegRow {
  booking_reference: string;
  passenger_name: string;
  passenger_count: number;
  origin_code: string;
  destination_code: string;
}

export const bookingLegServerRepository = {
  /**
   * Find unassigned booking legs for a specific date with full details.
   * This is the same query used in the schedule builder loader.
   */
  async findUnassignedByDate(date: string): Promise<BookingLegWithDetails[]> {
    const rows = await db.$queryRawUnsafe(
      `SELECT bl.id, bl.booking_id, bl.origin_code, bl.destination_code,
              bl.departure_date, bl.flight_id, bl.status, bl.created_at, bl.updated_at,
              bl.leg_date, bl.leg_sequence, bl.preferred_time, bl.preferred_time_start, bl.preferred_time_end,
              b.booking_reference,
              ARRAY_TO_STRING(ARRAY_AGG(DISTINCT bp.first_name || ' ' || bp.last_name), ', ') AS passenger_name,
              COUNT(*)::int AS passenger_count,
              bl.origin_code,
              bl.destination_code
       FROM booking_legs bl
       JOIN bookings b ON b.id = bl.booking_id
       JOIN booking_passengers bp ON bp.booking_id = b.id
       LEFT JOIN booking_leg_passengers blp ON blp.booking_leg_id = bl.id
       WHERE bl.flight_id IS NULL
         AND bl.leg_date = $1
         AND b.status NOT IN ('cancelled', 'completed')
       GROUP BY bl.id, b.booking_reference, bl.origin_code, bl.destination_code
       ORDER BY b.booking_reference`,
      date
    ) as Record<string, unknown>[];
    return rows as unknown as BookingLegWithDetails[];
  },

  /**
   * Find booking legs by flight ID with passenger details.
   */
  async findByFlightId(flightId: number): Promise<BookingLegWithDetails[]> {
    const rows = await db.$queryRawUnsafe(
      `SELECT bl.id, bl.booking_id, bl.origin_code, bl.destination_code,
              bl.departure_date, bl.flight_id, bl.status, bl.created_at, bl.updated_at,
              bl.leg_date, bl.leg_sequence, bl.preferred_time, bl.preferred_time_start, bl.preferred_time_end,
              b.booking_reference,
              ARRAY_TO_STRING(ARRAY_AGG(DISTINCT bp.first_name || ' ' || bp.last_name), ', ') AS passenger_name,
              COUNT(*)::int AS passenger_count,
              bl.origin_code,
              bl.destination_code
       FROM booking_legs bl
       JOIN bookings b ON b.id = bl.booking_id
       JOIN booking_passengers bp ON bp.booking_id = b.id
       LEFT JOIN booking_leg_passengers blp ON blp.booking_leg_id = bl.id
       WHERE bl.flight_id = $1
       GROUP BY bl.id, b.booking_reference, bl.origin_code, bl.destination_code
       ORDER BY b.booking_reference`,
      flightId
    ) as Record<string, unknown>[];
    return rows as unknown as BookingLegWithDetails[];
  },

  /**
   * Get unassigned booking count for a specific date.
   * Useful for quick verification that date filtering works.
   */
  async countUnassignedByDate(date: string): Promise<number> {
    const count = await db.booking_legs.count({
      where: {
        flight_id: null,
        leg_date: new Date(date),
        booking: {
          status: { notIn: ["cancelled", "completed"] },
        },
      },
    });
    return count;
  },

  /**
   * Get unassigned booking counts for multiple dates.
   * Used to verify that different dates have different unassigned pools.
   */
  async countUnassignedByDates(dates: string[]): Promise<Map<string, number>> {
    if (dates.length === 0) return new Map();
    const results = await Promise.all(
      dates.map(async (date) => {
        const count = await db.booking_legs.count({
          where: {
            flight_id: null,
            leg_date: new Date(date),
            booking: {
              status: { notIn: ["cancelled", "completed"] },
            },
          },
        });
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
