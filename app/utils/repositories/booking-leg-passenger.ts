/* eslint-disable @typescript-eslint/no-explicit-any */
import { kdb } from "../db.server";
import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { DB } from "../../../generated/kysely/database";

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

function mapLegPassengerWithDetails(row: Record<string, unknown>): BookingLegPassengerWithDetails {
  const blp = row as Record<string, unknown>;

  return {
    id: Number(blp.id),
    booking_leg_id: Number(blp.booking_leg_id),
    booking_passenger_id: Number(blp.booking_passenger_id),
    clothed_weight_kg: blp.clothed_weight_kg != null ? Number(blp.clothed_weight_kg) : null,
    baggage_weight_kg: blp.baggage_weight_kg != null ? Number(blp.baggage_weight_kg) : null,
    baggage_description: blp.baggage_description != null ? String(blp.baggage_description) : null,
    freight_description: blp.freight_description != null ? String(blp.freight_description) : null,
    freight_weight_kg: blp.freight_weight_kg != null ? Number(blp.freight_weight_kg) : null,
    seat_number: blp.seat_number != null ? String(blp.seat_number) : null,
    checked_in: Boolean(blp.checked_in),
    checked_in_at: blp.checked_in_at != null ? String(blp.checked_in_at) : null,
    checked_in_by: blp.checked_in_by != null ? Number(blp.checked_in_by) : null,
    boarded: Boolean(blp.boarded),
    boarded_at: blp.boarded_at != null ? String(blp.boarded_at) : null,
    created_at: String(blp.created_at ?? ""),
    updated_at: String(blp.updated_at ?? ""),
    first_name: blp.first_name != null ? String(blp.first_name) : undefined,
    last_name: blp.last_name != null ? String(blp.last_name) : undefined,
    email: blp.email != null ? String(blp.email) : undefined,
    phone: blp.phone != null ? String(blp.phone) : undefined,
    date_of_birth: blp.date_of_birth != null ? String(blp.date_of_birth) : undefined,
    residency: blp.residency_status != null ? String(blp.residency_status) : undefined,
    special_requirements: blp.special_requirements != null ? String(blp.special_requirements) : undefined,
    origin_code: blp.origin_code != null ? String(blp.origin_code) : undefined,
    destination_code: blp.destination_code != null ? String(blp.destination_code) : undefined,
    leg_date: blp.leg_date != null ? String(blp.leg_date) : undefined,
    leg_sequence: blp.leg_sequence != null ? Number(blp.leg_sequence) : undefined,
  };
}

export const bookingLegPassengerRepository = {
  async findByBookingId(bookingId: number): Promise<BookingLegPassengerWithDetails[]> {
    const rows = await kdb
      .selectFrom("booking_leg_passengers as blp")
      .innerJoin("booking_legs as bl", "bl.id", "blp.booking_leg_id")
      .innerJoin("booking_passengers as bp", "bp.id", "blp.booking_passenger_id")
      .select([
        "blp.id",
        "blp.booking_leg_id",
        "blp.booking_passenger_id",
        "blp.clothed_weight_kg",
        "blp.baggage_weight_kg",
        "blp.baggage_description",
        "blp.freight_description",
        "blp.freight_weight_kg",
        "blp.seat_number",
        "blp.checked_in",
        "blp.checked_in_at",
        "blp.checked_in_by",
        "blp.boarded",
        "blp.boarded_at",
        "blp.flight_leg_id",
        "blp.discount_applied",
        "blp.line_fare_amount",
        "blp.created_at",
        "blp.updated_at",
        "bp.first_name",
        "bp.last_name",
        "bp.email",
        "bp.phone",
        "bp.date_of_birth",
        "bp.residency_status",
        "bp.special_requirements",
        "bl.origin_code",
        "bl.destination_code",
        "bl.leg_date",
        "bl.leg_sequence",
      ])
      .where("bl.booking_id", "=", bookingId)
      .orderBy(sql`bl.leg_sequence asc, bp.last_name asc, bp.first_name asc`)
      .execute();
    return rows.map((r) => mapLegPassengerWithDetails(r as unknown as Record<string, unknown>));
  },

  async findByLegId(legId: number): Promise<BookingLegPassengerRow[]> {
    const rows = await kdb
      .selectFrom("booking_leg_passengers")
      .selectAll()
      .where("booking_leg_id", "=", legId)
      .execute();
    return rows as unknown as BookingLegPassengerRow[];
  },

  async findById(id: number): Promise<BookingLegPassengerRow | null> {
    const rows = await kdb
      .selectFrom("booking_leg_passengers")
      .selectAll()
      .where("id", "=", id)
      .execute();
    return (rows[0] as unknown as BookingLegPassengerRow) ?? null;
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
    const rows = await kdb
      .insertInto("booking_leg_passengers")
      .values({
        booking_leg_id: data.booking_leg_id,
        booking_passenger_id: data.booking_passenger_id,
        clothed_weight_kg: data.clothed_weight_kg ?? undefined,
        baggage_weight_kg: data.baggage_weight_kg ?? undefined,
        baggage_description: data.baggage_description ?? null,
        freight_description: data.freight_description ?? null,
        freight_weight_kg: data.freight_weight_kg ?? undefined,
      } as any)
      .returningAll()
      .execute();
    return rows[0] as unknown as BookingLegPassengerRow;
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
      const existing = await bookingLegPassengerRepository.findById(id);
      if (!existing) throw new Error(`BookingLegPassenger ${id} not found`);
      return existing;
    }

    const rows = await kdb
      .updateTable("booking_leg_passengers")
      .set(data as any)
      .where("id", "=", id)
      .returningAll()
      .execute();
    return rows[0] as unknown as BookingLegPassengerRow;
  },

  async checkIn(id: number, checkedInBy: number): Promise<void> {
    const now = new Date().toISOString();
    await kdb
      .updateTable("booking_leg_passengers")
      .set({
        checked_in: true,
        checked_in_at: now,
        checked_in_by: checkedInBy,
      } as any)
      .where("id", "=", id)
      .execute();
  },

  async deleteByLegId(legId: number): Promise<void> {
    await kdb
      .deleteFrom("booking_leg_passengers")
      .where("booking_leg_id", "=", legId)
      .execute();
  },

  async delete(id: number): Promise<void> {
    await kdb
      .deleteFrom("booking_leg_passengers")
      .where("id", "=", id)
      .execute();
  },
};

export async function assignToFlightLeg(
  passengerId: number,
  flightLegId: number,
  client?: Kysely<DB>
): Promise<void> {
  const dbClient = client ?? kdb;
  await sql`
    UPDATE booking_leg_passengers SET flight_leg_id = ${flightLegId} WHERE id = ${passengerId}
  `.execute(dbClient);
}

export async function unassignFromFlightLeg(
  passengerId: number,
  client?: Kysely<DB>
): Promise<void> {
  const dbClient = client ?? kdb;
  await sql`
    UPDATE booking_leg_passengers SET flight_leg_id = NULL WHERE id = ${passengerId}
  `.execute(dbClient);
}

// ───────────────────────────────────────────────────────────────────────────────
// Canonical passenger query — single source of truth for flight-loadsheet
// consistency.  All callers (schedule loader, flight card, loadsheet) MUST use
// this or `countAssignedByFlightId` to avoid drift.
//
// Uses booking_leg_passengers.flight_leg_id (the sole canonical assignment column)
// joined through flight_legs.flight_id to scope to a flight.
// booking_legs.flight_id is a derived column (see migration 038 trigger).
// ───────────────────────────────────────────────────────────────────────────────

export interface PassengerManifestRow {
  id: number;
  booking_leg_id: number;
  booking_passenger_id: number;
  flight_leg_id: number | null;
  flight_id: number;
  passenger_name: string;
  body_weight_kg: number;
  baggage_weight_kg: number;
  freight_weight_kg: number;
  origin_code: string;
  destination_code: string;
}

export async function findManifestsByFlightId(
  flightIds: number[]
): Promise<PassengerManifestRow[]> {
  if (flightIds.length === 0) return [];
  const idList = flightIds.join(",");

  const rows = await sql`
    SELECT blp.id, blp.booking_leg_id, bp.id AS booking_passenger_id, blp.flight_leg_id, fl.flight_id,
            CONCAT(bp.first_name, ' ', bp.last_name) AS passenger_name,
            COALESCE(blp.clothed_weight_kg, 70)::int AS body_weight_kg,
            COALESCE(blp.baggage_weight_kg, 0)::int AS baggage_weight_kg,
            COALESCE(blp.freight_weight_kg, 0)::int AS freight_weight_kg,
            bl.origin_code, bl.destination_code
     FROM booking_leg_passengers blp
     JOIN flight_legs fl ON fl.id = blp.flight_leg_id
     JOIN booking_legs bl ON bl.id = blp.booking_leg_id
     JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
     WHERE fl.flight_id = ANY(${sql.raw(`ARRAY[${idList}]::int[]`)})
     ORDER BY blp.id
  `.execute(kdb);
  return rows.rows as PassengerManifestRow[];
}

/**
 * Canonical passenger count for a flight — single source of truth for both
 * flight card pax counts and loadsheet total_pax.
 */
export async function countAssignedByFlightId(
  flightId: number
): Promise<number> {
  const rows = await sql`
    SELECT COUNT(*)::int AS cnt
     FROM booking_leg_passengers blp
     JOIN flight_legs fl ON fl.id = blp.flight_leg_id
     WHERE fl.flight_id = ${flightId}
  `.execute(kdb);
  return Number((rows.rows[0] as { cnt: number | bigint } | undefined)?.cnt ?? 0);
}

export async function flightHasAssignedPassengers(
  flightId: number
): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM booking_leg_passengers blp
     JOIN flight_legs fl ON fl.id = blp.flight_leg_id
     WHERE fl.flight_id = ${flightId}
     LIMIT 1
  `.execute(kdb);
  return rows.rows.length > 0;
}

export async function findUnassignedByDate(
  date: string
): Promise<
  Array<{
    id: number;
    booking_leg_id: number;
    booking_id: number;
    booking_reference: string;
    passenger_name: string;
    passenger_first_name: string;
    passenger_last_name: string;
    origin_code: string;
    destination_code: string;
    leg_date: string;
    leg_sequence: number;
    clothed_weight_kg: number;
    baggage_weight_kg: number;
    freight_weight_kg: number;
    seat_number: string | null;
  }>
> {
  const rows = await sql`
    SELECT blp.id,
            bl.id AS booking_leg_id,
            bl.booking_id,
            b.booking_reference,
            COALESCE(NULLIF(TRIM(bp.first_name || ' ' || bp.last_name), ''), 'Unknown') AS passenger_name,
            bp.first_name AS passenger_first_name,
            bp.last_name AS passenger_last_name,
            bl.origin_code,
            bl.destination_code,
            bl.leg_date,
            bl.leg_sequence,
            COALESCE(blp.clothed_weight_kg, 70) AS clothed_weight_kg,
            COALESCE(blp.baggage_weight_kg, 0) AS baggage_weight_kg,
            COALESCE(blp.freight_weight_kg, 0) AS freight_weight_kg,
            blp.seat_number
     FROM booking_leg_passengers blp
     JOIN booking_legs bl ON bl.id = blp.booking_leg_id
     JOIN bookings b ON b.id = bl.booking_id
     JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
     WHERE blp.flight_leg_id IS NULL
       AND bl.leg_date = ${date}
       AND b.status NOT IN ('cancelled', 'completed')
     ORDER BY bl.leg_sequence, bp.last_name, bp.first_name
  `.execute(kdb);
  return rows.rows as any;
}

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
  const rows = await sql`
    SELECT blp.id, blp.booking_leg_id, blp.flight_leg_id,
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
      WHERE blp.booking_leg_id = ${bookingLegId}
      ORDER BY blp.id
  `.execute(kdb);
  return rows.rows as any;
}

export async function findByBookingLegIds(
  legIds: number[]
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
  if (legIds.length === 0) return [];
  const idList = legIds.join(",");
  const rows = await sql`
    SELECT blp.id, blp.booking_leg_id, blp.flight_leg_id,
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
      WHERE blp.booking_leg_id = ANY(${sql.raw(`ARRAY[${idList}]::int[]`)})
      ORDER BY blp.id
  `.execute(kdb);
  return rows.rows as any;
}

// ── Per-flight-leg assignment manifest lookup ─────────────────────────────────
// Uses booking_leg_passengers.flight_leg_id (direct assignment column) to find
// passengers assigned to a specific flight. Complements findManifestsByFlightId
// which uses the canonical booking_legs.flight_id column.

export interface AssignedManifestRow {
  id: number;
  booking_leg_id: number;
  flight_leg_id: number;
  passenger_name: string;
  body_weight_kg: number;
  baggage_weight_kg: number;
  freight_weight_kg: number;
  origin_code: string;
  destination_code: string;
}

export async function findAssignedManifestsByFlightId(
  flightId: number,
  options?: {
    bookingLegPassengerIds?: number[];
    client?: Kysely<DB>;
  }
): Promise<AssignedManifestRow[]> {
  const dbClient = options?.client ?? kdb;
  const passengerFilter = options?.bookingLegPassengerIds?.length
    ? sql`AND blp.id = ANY(${sql.raw(`ARRAY[${options.bookingLegPassengerIds.join(",")}]::int[]`)})`
    : sql``;

  const rows = await sql`
    SELECT blp.id, blp.booking_leg_id, blp.flight_leg_id,
            CONCAT(bp.first_name, ' ', bp.last_name) AS passenger_name,
            COALESCE(blp.clothed_weight_kg, 70)::int AS body_weight_kg,
            COALESCE(blp.baggage_weight_kg, 0)::int AS baggage_weight_kg,
            COALESCE(blp.freight_weight_kg, 0)::int AS freight_weight_kg,
            bl.origin_code, bl.destination_code
     FROM booking_leg_passengers blp
     JOIN booking_legs bl ON bl.id = blp.booking_leg_id
     JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
      WHERE blp.flight_leg_id IS NOT NULL
        AND blp.flight_leg_id IN (SELECT id FROM flight_legs WHERE flight_id = ${flightId}) ${passengerFilter}
      ORDER BY blp.id
  `.execute(dbClient);
  return rows.rows as AssignedManifestRow[];
}

// ── Check-in helpers ──────────────────────────────────────────────────────────

export async function findUncheckedByFlightId(flightId: number): Promise<Array<{ id: number }>> {
  const result = await sql<{ id: number }>`
    SELECT blp.id
     FROM booking_leg_passengers blp
     JOIN flight_legs fl ON fl.id = blp.flight_leg_id
     WHERE fl.flight_id = ${flightId} AND blp.checked_in = false
  `.execute(kdb);
  return result.rows;
}

export async function createPaymentForCheckin(
  legPaxId: number,
  amount: number,
  method: string,
  reference: string
): Promise<void> {
  await sql`
    INSERT INTO payments (booking_id, amount, amount_gbp, method, status, transaction_reference, created_at)
     VALUES ((SELECT bl.booking_id FROM booking_leg_passengers blp JOIN booking_legs bl ON bl.id = blp.booking_leg_id WHERE blp.id = ${legPaxId}), ${amount}, ${amount}, ${method}, 'completed', ${reference}, NOW())
  `.execute(kdb);
}

// ── Booking mutation helpers ───────────────────────────────────────────────────
// Junction-level operations.  Booking-level orchestration (passenger/leg CRUD plus
// fare recalc and audit) lives in booking-mutations.server.ts.

export async function addJunctionRecordsForPassenger(
  passengerId: number,
  legIds: number[],
  options?: { clothed_weight_kg?: number; baggage_weight_kg?: number; client?: Kysely<DB> }
): Promise<number> {
  const dbClient = options?.client ?? kdb;
  let count = 0;
  for (const legId of legIds) {
    await dbClient.insertInto("booking_leg_passengers")
      .values({
        booking_leg_id: legId,
        booking_passenger_id: passengerId,
        clothed_weight_kg: options?.clothed_weight_kg ?? 70,
        baggage_weight_kg: options?.baggage_weight_kg ?? 0,
        freight_weight_kg: 0,
      } as any)
      .execute();
    count++;
  }
  return count;
}

export async function removeJunctionRecordsForPassenger(
  passengerId: number,
  client?: Kysely<DB>
): Promise<Array<{ id: number; line_fare_amount: number | null; refund_amount_gbp: number | null }>> {
  const dbClient = client ?? kdb;
  const rows = await dbClient.selectFrom("booking_leg_passengers")
    .select(["id", "line_fare_amount"])
    .where("booking_passenger_id", "=", passengerId)
    .execute();
  const result = rows.map((r) => ({
    id: Number(r.id),
    line_fare_amount: r.line_fare_amount != null ? Number(r.line_fare_amount) : null,
    refund_amount_gbp: r.line_fare_amount != null ? Number(r.line_fare_amount) : null,
  }));
  await dbClient.deleteFrom("booking_leg_passengers")
    .where("booking_passenger_id", "=", passengerId)
    .execute();
  return result;
}

export async function removeJunctionRecordsForLeg(
  legId: number,
  client?: Kysely<DB>
): Promise<Array<{ id: number; booking_passenger_id: number; line_fare_amount: number | null; refund_amount_gbp: number | null }>> {
  const dbClient = client ?? kdb;
  const rows = await dbClient.selectFrom("booking_leg_passengers")
    .select(["id", "booking_passenger_id", "line_fare_amount"])
    .where("booking_leg_id", "=", legId)
    .execute();
  const result = rows.map((r) => ({
    id: Number(r.id),
    booking_passenger_id: Number(r.booking_passenger_id),
    line_fare_amount: r.line_fare_amount != null ? Number(r.line_fare_amount) : null,
    refund_amount_gbp: r.line_fare_amount != null ? Number(r.line_fare_amount) : null,
  }));
  await dbClient.deleteFrom("booking_leg_passengers")
    .where("booking_leg_id", "=", legId)
    .execute();
  return result;
}

export async function setRefundOnJunctionRecords(
  refunds: Array<{ id: number; amount: number }>,
  client?: Kysely<DB>
): Promise<void> {
  const dbClient = client ?? kdb;
  for (const r of refunds) {
    await dbClient.updateTable("booking_leg_passengers")
      .set({ refund_amount_gbp: r.amount, refunded_at: new Date() } as any)
      .where("id", "=", r.id)
      .execute();
  }
}
