import { kdb } from "../db.server.kysely";
import { sql } from "kysely";

export interface CheckinReminderRow {
  id: number;
  flight_id: number;
  booking_id: number;
  passenger_id: number | null;
  reminder_type: string | null;
  scheduled_at: string;
  scheduled_for: string | null;
  sent_at: string | null;
  sent_via: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface PendingReminderRow extends CheckinReminderRow {
  booking_reference: string;
  flight_number: string;
}

export interface BookingSearchResult {
  id: number;
  booking_reference: string;
  status: string;
  passenger_id: number;
  first_name: string;
  last_name: string;
  email: string;
  flight_number: string | null;
  origin_code: string | null;
  destination_code: string | null;
  departure_time: string | null;
  checkin_status: string | null;
}

export interface PassengerCheckinDetail {
  id: number;
  booking_id: number;
  booking_reference: string;
  booking_status: string;
  user_id: number | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  date_of_birth: string;
  clothed_body_weight_kg: number;
  baggage_weight_kg: number | null;
  residency_status: string;
  flight_id: number | null;
  flight_number: string | null;
  origin_code: string | null;
  destination_code: string | null;
  departure_time: string | null;
  seat_number: string | null;
  payment_status: string;
  total_amount_gbp: number | null;
  organization_billing: boolean;
}

export const checkinRepository = {
  async create(
    flightId: number,
    bookingId: number,
    scheduledAt: string,
  ): Promise<CheckinReminderRow> {
    const rows = await kdb
      .insertInto("checkin_reminders")
      .values({
        flight_id: flightId,
        booking_id: bookingId,
        scheduled_at: scheduledAt,
      } as any)
      .returningAll()
      .execute();
    return rows[0] as unknown as CheckinReminderRow;
  },

  async findPending(): Promise<PendingReminderRow[]> {
    const now = new Date().toISOString();
    const rows = await kdb
      .selectFrom("checkin_reminders as cr")
      .innerJoin("bookings as b", "b.id", "cr.booking_id")
      .innerJoin("flights as f", "f.id", "cr.flight_id")
      .select([
        "cr.id",
        "cr.flight_id",
        "cr.booking_id",
        "cr.passenger_id",
        "cr.reminder_type",
        "cr.scheduled_at",
        "cr.scheduled_for",
        "cr.sent_at",
        "cr.sent_via",
        "cr.status",
        "cr.created_at",
        "cr.updated_at",
        "b.booking_reference",
        "f.flight_number",
      ])
      .where("cr.sent_at", "is", null)
      .where("cr.scheduled_at", "<=", now)
      .where("cr.flight_id", "is not", null)
      .orderBy("cr.scheduled_at asc")
      .execute();
    return (rows as unknown as PendingReminderRow[]);
  },

  async findById(id: number): Promise<CheckinReminderRow | null> {
    const rows = await kdb
      .selectFrom("checkin_reminders")
      .selectAll()
      .where("id", "=", id)
      .execute();
    return (rows[0] as unknown as CheckinReminderRow) ?? null;
  },

  async findByBookingId(bookingId: number): Promise<CheckinReminderRow | null> {
    const rows = await kdb
      .selectFrom("checkin_reminders")
      .selectAll()
      .where("booking_id", "=", bookingId)
      .limit(1)
      .execute();
    return (rows[0] as unknown as CheckinReminderRow) ?? null;
  },

  async markAsSent(id: number): Promise<void> {
    const now = new Date().toISOString();
    await kdb
      .updateTable("checkin_reminders")
      .set({ sent_at: now, updated_at: now } as any)
      .where("id", "=", id)
      .execute();
  },

  async searchBookings(query: string): Promise<BookingSearchResult[]> {
    const searchTerm = `%${query}%`;
    const result = await sql`
      SELECT DISTINCT
        b.id,
        b.booking_reference,
        b.status,
        bp.id AS passenger_id,
        bp.first_name,
        bp.last_name,
        bp.email,
        f.flight_number,
        a_orig.code AS origin_code,
        a_dest.code AS destination_code,
        f.departure_time,
        CASE WHEN blp.checked_in THEN 'Checked in' ELSE NULL END AS checkin_status
      FROM bookings b
      JOIN booking_passengers bp ON bp.booking_id = b.id
      LEFT JOIN booking_legs bl ON bl.booking_id = b.id
      LEFT JOIN booking_leg_passengers blp ON blp.booking_leg_id = bl.id AND blp.booking_passenger_id = bp.id
      LEFT JOIN flights f ON f.id = bl.flight_id
      LEFT JOIN aerodromes a_orig ON a_orig.id = f.origin_aerodrome_id
      LEFT JOIN aerodromes a_dest ON a_dest.id = f.destination_aerodrome_id
      WHERE (
        b.booking_reference ILIKE ${searchTerm}
        OR f.flight_number ILIKE ${searchTerm}
        OR bp.first_name ILIKE ${searchTerm}
        OR bp.last_name ILIKE ${searchTerm}
        OR bp.email ILIKE ${searchTerm}
      )
      ORDER BY b.booking_reference, bp.last_name, bp.first_name
    `.execute(kdb);
    return (result.rows ?? []) as unknown as BookingSearchResult[];
  },

  async getPassengerForCheckin(
    bookingId: number,
    passengerId: number,
  ): Promise<PassengerCheckinDetail | null> {
    const rows = await sql`
      SELECT
        bp.id,
        bp.booking_id,
        b.booking_reference,
        b.status AS booking_status,
        b.user_id,
        bp.first_name,
        bp.last_name,
        bp.email,
        bp.phone,
        bp.date_of_birth,
        bp.clothed_body_weight_kg,
        COALESCE(blp.baggage_weight_kg, 0) AS baggage_weight_kg,
        bp.residency_status,
        f.id AS flight_id,
        f.flight_number,
        a_orig.code AS origin_code,
        a_dest.code AS destination_code,
        f.departure_time,
        blp.seat_number,
        b.payment_status,
        b.total_amount_gbp,
        b.is_organization_billing AS organization_billing
      FROM booking_passengers bp
      JOIN bookings b ON b.id = bp.booking_id
      LEFT JOIN booking_legs bl ON bl.booking_id = b.id AND bl.leg_sequence = 1
      LEFT JOIN booking_leg_passengers blp ON blp.booking_leg_id = bl.id AND blp.booking_passenger_id = bp.id
      LEFT JOIN flights f ON f.id = bl.flight_id
      LEFT JOIN aerodromes a_orig ON a_orig.id = f.origin_aerodrome_id
      LEFT JOIN aerodromes a_dest ON a_dest.id = f.destination_aerodrome_id
      WHERE bp.booking_id = ${bookingId} AND bp.id = ${passengerId}
    `.execute(kdb);
    return (rows.rows[0] as unknown as PassengerCheckinDetail) ?? null;
  },

  async confirmCheckin(
    passengerId: number,
    actualWeight: number,
  ): Promise<void> {
    const now = new Date().toISOString();
    await kdb
      .updateTable("booking_passengers")
      .set({
        clothed_body_weight_kg: actualWeight,
        updated_at: now,
      } as any)
      .where("id", "=", passengerId)
      .execute();
  },

  async getOutstandingBalance(bookingId: number): Promise<number> {
    const rows = await sql`
      SELECT
        COALESCE(b.total_amount_gbp, 0) -
        COALESCE((
          SELECT SUM(amount_gbp) FROM payments WHERE booking_id = ${bookingId}
        ), 0) AS balance
      FROM bookings b
      WHERE b.id = ${bookingId}
    `.execute(kdb);
    return Number((rows.rows[0] as { balance: number } | undefined)?.balance ?? 0);
  },

  async recordPayment(
    bookingId: number,
    amountGbp: number,
    paymentMethod: string,
    transactionReference: string,
  ): Promise<void> {
    await kdb
      .insertInto("payments")
      .values({
        booking_id: bookingId,
        amount: String(amountGbp),
        amount_gbp: String(amountGbp),
        method: paymentMethod,
        payment_method: paymentMethod,
        transaction_reference: transactionReference,
        status: "completed",
        fee_gbp: "0",
        net_amount_gbp: String(amountGbp),
        currency: "GBP",
      } as any)
      .execute();
  },
};
