import { db } from "../db.server";
import type { Prisma } from "../../../generated/prisma/client";

export interface BookingLegPassengerRow {
  id: number;
  booking_leg_id: number;
  booking_passenger_id: number;
  clothed_weight_kg: number | null;
  baggage_weight_kg: number | null;
  baggage_description: string | null;
  freight_description: string | null;
  freight_weight_kg: number | null;
  seat_number: string | null;
  checked_in: boolean;
  checked_in_at: string | null;
  checked_in_by: number | null;
  boarded: boolean;
  boarded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingLegPassengerWithDetails extends BookingLegPassengerRow {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  date_of_birth?: string;
  residency?: string;
  special_requirements?: string;
  origin_code?: string;
  destination_code?: string;
  leg_date?: string;
  leg_sequence?: number;
}

export const bookingLegPassengerRepository = {
  async findByBookingId(bookingId: number): Promise<BookingLegPassengerWithDetails[]> {
    const rows = await db.booking_leg_passengers.findMany({
      where: {
        booking_leg: {
          booking_id: bookingId,
        },
      },
      include: {
        booking_passenger: true,
        booking_leg: true,
      },
      orderBy: [
        { booking_leg: { leg_sequence: "asc" } },
        { booking_passenger: { last_name: "asc" } },
        { booking_passenger: { first_name: "asc" } },
      ],
    });
    return rows.map(mapLegPassengerWithDetails);
  },

  async findByLegId(legId: number): Promise<BookingLegPassengerRow[]> {
    const rows = await db.booking_leg_passengers.findMany({
      where: { booking_leg_id: legId },
    });
    return rows as unknown as BookingLegPassengerRow[];
  },

  async findById(id: number): Promise<BookingLegPassengerRow | null> {
    const row = await db.booking_leg_passengers.findUnique({
      where: { id },
    });
    return (row as unknown as BookingLegPassengerRow) ?? null;
  },

  async create(data: {
    booking_leg_id: number;
    booking_passenger_id: number;
    clothed_weight_kg?: number | null;
    baggage_weight_kg?: number | null;
    baggage_description?: string | null;
    freight_description?: string | null;
    freight_weight_kg?: number | null;
  }): Promise<BookingLegPassengerRow> {
    const row = await db.booking_leg_passengers.create({
      data: {
        booking_leg_id: data.booking_leg_id,
        booking_passenger_id: data.booking_passenger_id,
        clothed_weight_kg: data.clothed_weight_kg ?? undefined,
        baggage_weight_kg: data.baggage_weight_kg ?? undefined,
        baggage_description: data.baggage_description ?? null,
        freight_description: data.freight_description ?? null,
        freight_weight_kg: data.freight_weight_kg ?? undefined,
      },
    });
    return row as unknown as BookingLegPassengerRow;
  },

  async update(
    id: number,
    params: Partial<{
      clothed_weight_kg: number | null;
      baggage_weight_kg: number | null;
      baggage_description: string | null;
      freight_description: string | null;
      freight_weight_kg: number | null;
      seat_number: string | null;
      checked_in: boolean;
      checked_in_by: number | null;
      boarded: boolean;
    }>
  ): Promise<BookingLegPassengerRow> {
    const data: Record<string, unknown> = {};
    if (params.clothed_weight_kg !== undefined) data.clothed_weight_kg = params.clothed_weight_kg;
    if (params.baggage_weight_kg !== undefined) data.baggage_weight_kg = params.baggage_weight_kg;
    if (params.baggage_description !== undefined) data.baggage_description = params.baggage_description;
    if (params.freight_description !== undefined) data.freight_description = params.freight_description;
    if (params.freight_weight_kg !== undefined) data.freight_weight_kg = params.freight_weight_kg;
    if (params.seat_number !== undefined) data.seat_number = params.seat_number;
    if (params.checked_in !== undefined) data.checked_in = params.checked_in;
    if (params.checked_in_by !== undefined) data.checked_in_by = params.checked_in_by;
    if (params.boarded !== undefined) data.boarded = params.boarded;

    if (Object.keys(data).length === 0) {
      const existing = await this.findById(id);
      if (!existing) throw new Error(`BookingLegPassenger ${id} not found`);
      return existing;
    }

    const row = await db.booking_leg_passengers.update({
      where: { id },
      data,
    });
    return row as unknown as BookingLegPassengerRow;
  },

  async checkIn(id: number, checkedInBy: number): Promise<void> {
    await db.booking_leg_passengers.update({
      where: { id },
      data: {
        checked_in: true,
        checked_in_at: new Date(),
        checked_in_by: checkedInBy,
      },
    });
  },

  async deleteByLegId(legId: number): Promise<void> {
    await db.booking_leg_passengers.deleteMany({
      where: { booking_leg_id: legId },
    });
  },

  async delete(id: number): Promise<void> {
    await db.booking_leg_passengers.delete({ where: { id } });
  },
};

// ---------------------------------------------------------------------------
// Standalone utility functions for flight-leg assignment
// ---------------------------------------------------------------------------

/**
 * Assign a booking_leg_passenger to a specific flight_leg.
 * Updates the flight_leg_id column on the booking_leg_passengers table.
 *
 * @param passengerId - The booking_leg_passenger ID
 * @param flightLegId - The flight_leg ID to assign to
 * @param client - Optional Prisma client for transaction support
 */
export async function assignToFlightLeg(
  passengerId: number,
  flightLegId: number,
  client?: Prisma.TransactionClient
): Promise<void> {
  const dbClient = client ?? db;
  await dbClient.$executeRawUnsafe(
    `UPDATE booking_leg_passengers SET flight_leg_id = $1 WHERE id = $2`,
    flightLegId,
    passengerId
  );
}

/**
 * Unassign a booking_leg_passenger from their current flight_leg.
 * Sets flight_leg_id to NULL on the booking_leg_passengers table.
 *
 * @param passengerId - The booking_leg_passenger ID
 * @param client - Optional Prisma client for transaction support
 */
export async function unassignFromFlightLeg(
  passengerId: number,
  client?: Prisma.TransactionClient
): Promise<void> {
  const dbClient = client ?? db;
  await dbClient.$executeRawUnsafe(
    `UPDATE booking_leg_passengers SET flight_leg_id = NULL WHERE id = $1`,
    passengerId
  );
}

/**
 * Find all passenger manifests for one or more flights.
 * Joins booking_leg_passengers → booking_legs → booking_passengers → flight_legs
 * to resolve passenger names, weights, and route stops.
 *
 * This replaces the duplicated manifest query pattern that was repeated
 * 9 times across schedule-handlers.server.ts, config-generator.ts, and
 * create-loadsheet.server.ts.
 *
 * @param flightIds - Array of flight IDs to query manifests for
 * @returns Rows with passenger_name, body_weight_kg, origin_code, destination_code, etc.
 */
export async function findManifestsByFlightId(
  flightIds: number[]
): Promise<
  Array<{
    id: number;
    booking_leg_id: number;
    flight_leg_id: number;
    flight_id: number;
    passenger_name: string;
    body_weight_kg: number;
    baggage_weight_kg: number;
    freight_weight_kg: number;
    origin_code: string;
    destination_code: string;
  }>
> {
  const rows = await db.$queryRawUnsafe<
    Array<{
      id: number;
      booking_leg_id: number;
      flight_leg_id: number;
      flight_id: number;
      passenger_name: string;
      body_weight_kg: number;
      baggage_weight_kg: number;
      freight_weight_kg: number;
      origin_code: string;
      destination_code: string;
    }>
  >(
     `SELECT blp.id, blp.booking_leg_id, blp.flight_leg_id, fl.flight_id,
             CONCAT(bp.first_name, ' ', bp.last_name) AS passenger_name,
             COALESCE(blp.clothed_weight_kg, 70)::int AS body_weight_kg,
             COALESCE(blp.baggage_weight_kg, 0)::int AS baggage_weight_kg,
             COALESCE(blp.freight_weight_kg, 0)::int AS freight_weight_kg,
             bl.origin_code, bl.destination_code
      FROM booking_leg_passengers blp
      JOIN flight_legs fl ON fl.id = blp.flight_leg_id
      JOIN booking_legs bl ON bl.id = blp.booking_leg_id
      JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
      WHERE blp.flight_leg_id IS NOT NULL
        AND fl.flight_id = ANY($1::int[])
      ORDER BY blp.id`,
    flightIds
  );
  return rows;
}

/**
 * Find all unassigned booking_leg_passengers for a given date.
 * A passenger is unassigned when their flight_leg_id is NULL.
 *
 * @param date - Date string (YYYY-MM-DD)
 * @returns Rows ready for the UnassignPoolPanel (booking_reference, passenger_name, etc.)
 */
export async function findUnassignedByDate(
  date: string
): Promise<
  Array<{
    id: number;
    booking_leg_id: number;
    booking_reference: string;
    passenger_name: string;
    origin_code: string;
    destination_code: string;
    passenger_count: number;
  }>
> {
  const rows = await db.$queryRawUnsafe<
    Array<{
      id: number;
      booking_leg_id: number;
      booking_reference: string;
      passenger_name: string;
      origin_code: string;
      destination_code: string;
      passenger_count: number;
    }>
  >(
    `SELECT blp.id, bl.id AS booking_leg_id, b.booking_reference,
            bp.first_name || ' ' || bp.last_name AS passenger_name,
            bl.origin_code, bl.destination_code,
            1 AS passenger_count
     FROM booking_leg_passengers blp
     JOIN booking_legs bl ON bl.id = blp.booking_leg_id
     JOIN bookings b ON b.id = bl.booking_id
     JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
     WHERE blp.flight_leg_id IS NULL
       AND bl.leg_date = $1
       AND b.status NOT IN ('cancelled', 'completed')
     ORDER BY b.booking_reference, bp.last_name, bp.first_name`,
    date
  );
  return rows;
}

/**
 * Count passengers assigned to a flight via flight_leg_id.
 * Used for loadsheet stale detection and flight card pax counts.
 *
 * @param flightId - The flight ID
 * @returns Count of individually assigned passengers
 */
export async function countAssignedByFlightId(
  flightId: number
): Promise<number> {
  const rows = await db.$queryRawUnsafe<Array<{ cnt: number | bigint }>>(
    `SELECT COUNT(*)::int AS cnt
     FROM booking_leg_passengers blp
     JOIN flight_legs fl ON fl.id = blp.flight_leg_id
     WHERE fl.flight_id = $1`,
    flightId
  );
  return Number(rows[0]?.cnt ?? 0);
}

/**
 * Find all booking_leg_passengers for a given booking_leg.
 *
 * @param bookingLegId - The booking_leg ID
 * @returns Array of booking_leg_passenger rows with passenger names
 */
export async function findByBookingLegId(
  bookingLegId: number
): Promise<
  Array<{
    id: number;
    booking_leg_id: number;
    flight_leg_id: number | null;
    passenger_name: string;
    passenger_count: number;
    body_weight_kg: number;
    baggage_weight_kg: number;
    freight_weight_kg: number;
    origin_code: string;
    destination_code: string;
  }>
> {
  const rows = await db.$queryRawUnsafe<
    Array<{
      id: number;
      booking_leg_id: number;
      flight_leg_id: number | null;
      passenger_name: string;
      passenger_count: number;
      body_weight_kg: number;
      baggage_weight_kg: number;
      freight_weight_kg: number;
      origin_code: string;
      destination_code: string;
    }>
  >(
    `SELECT blp.id, blp.booking_leg_id, blp.flight_leg_id,
            CONCAT(bp.first_name, ' ', bp.last_name) AS passenger_name,
            1 AS passenger_count,
            COALESCE(blp.clothed_weight_kg, 70) AS body_weight_kg,
            COALESCE(blp.baggage_weight_kg, 0) AS baggage_weight_kg,
            COALESCE(blp.freight_weight_kg, 0) AS freight_weight_kg,
            bl.origin_code,
            bl.destination_code
     FROM booking_leg_passengers blp
     JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
     JOIN booking_legs bl ON bl.id = blp.booking_leg_id
     WHERE blp.booking_leg_id = $1
     ORDER BY blp.id`,
    bookingLegId
  );
  return rows;
}

/**
 * Map a Prisma booking_leg_passengers row (with includes) to the legacy
 * BookingLegPassengerWithDetails interface.
 */
function mapLegPassengerWithDetails(row: Record<string, unknown>): BookingLegPassengerWithDetails {
  const blp = row as {
    id: number;
    booking_leg_id: number;
    booking_passenger_id: number;
    clothed_weight_kg: number | null;
    baggage_weight_kg: number | null;
    baggage_description: string | null;
    freight_description: string | null;
    freight_weight_kg: number | null;
    seat_number: string | null;
    checked_in: boolean;
    checked_in_at: Date | string | null;
    checked_in_by: number | null;
    boarded: boolean;
    boarded_at: Date | string | null;
    created_at: Date | string;
    updated_at: Date | string;
    booking_passenger?: Record<string, unknown>;
    booking_leg?: Record<string, unknown>;
  };

  const bp = blp.booking_passenger as Record<string, unknown> | undefined;
  const bl = blp.booking_leg as Record<string, unknown> | undefined;

  return {
    id: blp.id,
    booking_leg_id: blp.booking_leg_id,
    booking_passenger_id: blp.booking_passenger_id,
    clothed_weight_kg: blp.clothed_weight_kg ?? null,
    baggage_weight_kg: blp.baggage_weight_kg ?? null,
    baggage_description: blp.baggage_description ?? null,
    freight_description: blp.freight_description ?? null,
    freight_weight_kg: blp.freight_weight_kg ?? null,
    seat_number: blp.seat_number ?? null,
    checked_in: blp.checked_in,
    checked_in_at: blp.checked_in_at ? (blp.checked_in_at instanceof Date ? blp.checked_in_at.toISOString() : String(blp.checked_in_at)) : null,
    checked_in_by: blp.checked_in_by ?? null,
    boarded: blp.boarded,
    boarded_at: blp.boarded_at ? (blp.boarded_at instanceof Date ? blp.boarded_at.toISOString() : String(blp.boarded_at)) : null,
    created_at: blp.created_at instanceof Date ? blp.created_at.toISOString() : String(blp.created_at),
    updated_at: blp.updated_at instanceof Date ? blp.updated_at.toISOString() : String(blp.updated_at),
    first_name: bp?.first_name as string | undefined,
    last_name: bp?.last_name as string | undefined,
    email: bp?.email as string | undefined,
    phone: bp?.phone as string | undefined,
    date_of_birth: bp?.date_of_birth ? (bp.date_of_birth instanceof Date ? bp.date_of_birth.toISOString().split("T")[0] : String(bp.date_of_birth)) : undefined,
    residency: bp?.residency_status as string | undefined,
    special_requirements: bp?.special_requirements as string | undefined,
    origin_code: bl?.origin_code as string | undefined,
    destination_code: bl?.destination_code as string | undefined,
    leg_date: bl?.leg_date ? (bl.leg_date instanceof Date ? bl.leg_date.toISOString().split("T")[0] : String(bl.leg_date)) : undefined,
    leg_sequence: bl?.leg_sequence as number | undefined,
  };
}
