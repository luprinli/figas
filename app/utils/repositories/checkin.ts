import { db } from "../db.server";

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
    const result = await db.checkin_reminders.create({
      data: {
        flight_id: flightId,
        booking_id: bookingId,
        scheduled_at: new Date(scheduledAt),
      },
    });
    return result as unknown as CheckinReminderRow;
  },

  async findPending(): Promise<PendingReminderRow[]> {
    const reminders = await db.checkin_reminders.findMany({
      where: {
        sent_at: null,
        scheduled_at: { lte: new Date() },
        flight_id: { not: null },
      },
      include: {
        booking: { select: { booking_reference: true } },
        flight: { select: { flight_number: true } },
      },
      orderBy: { scheduled_at: "asc" },
    });
    return reminders.map((r) => ({
      id: r.id,
      flight_id: r.flight_id ?? 0,
      booking_id: r.booking_id,
      passenger_id: r.passenger_id,
      reminder_type: r.reminder_type,
      scheduled_at: r.scheduled_at.toISOString(),
      scheduled_for: r.scheduled_for?.toISOString() ?? null,
      sent_at: r.sent_at?.toISOString() ?? null,
      sent_via: r.sent_via,
      status: r.status,
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at.toISOString(),
      booking_reference: r.booking.booking_reference,
      flight_number: r.flight!.flight_number,
    })) as unknown as PendingReminderRow[];
  },

  async findById(id: number): Promise<CheckinReminderRow | null> {
    const result = await db.checkin_reminders.findUnique({
      where: { id },
    });
    return (result as unknown as CheckinReminderRow) ?? null;
  },

  async findByBookingId(bookingId: number): Promise<CheckinReminderRow | null> {
    const result = await db.checkin_reminders.findFirst({
      where: { booking_id: bookingId },
    });
    return (result as unknown as CheckinReminderRow) ?? null;
  },

  async markAsSent(id: number): Promise<void> {
    await db.checkin_reminders.update({
      where: { id },
      data: { sent_at: new Date(), updated_at: new Date() },
    });
  },

  async searchBookings(query: string): Promise<BookingSearchResult[]> {
    const searchTerm = `%${query}%`;
    const rows = await db.$queryRawUnsafe(
      `SELECT DISTINCT
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
         b.booking_reference ILIKE $1
         OR f.flight_number ILIKE $1
         OR bp.first_name ILIKE $1
         OR bp.last_name ILIKE $1
         OR bp.email ILIKE $1
       )
       ORDER BY b.booking_reference, bp.last_name, bp.first_name`,
      searchTerm,
    ) as Record<string, unknown>[];
    return (rows ?? []) as unknown as BookingSearchResult[];
  },

  async getPassengerForCheckin(
    bookingId: number,
    passengerId: number,
  ): Promise<PassengerCheckinDetail | null> {
    const rows = await db.$queryRawUnsafe(
      `SELECT
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
       WHERE bp.booking_id = $1 AND bp.id = $2`,
      bookingId,
      passengerId,
    ) as Record<string, unknown>[];
    return (rows[0] as unknown as PassengerCheckinDetail) ?? null;
  },

  async confirmCheckin(
    passengerId: number,
    actualWeight: number,
  ): Promise<void> {
    // This method is deprecated in favor of bookingLegPassengerRepository.checkIn()
    // which handles per-leg check-in. This method updates the passenger's base weight
    // in booking_passengers for reference.
    await db.booking_passengers.update({
      where: { id: passengerId },
      data: {
        clothed_body_weight_kg: actualWeight,
        updated_at: new Date(),
      },
    });
  },

  async getOutstandingBalance(bookingId: number): Promise<number> {
    const rows = await db.$queryRawUnsafe(
      `SELECT
        COALESCE(b.total_amount_gbp, 0) -
        COALESCE((
          SELECT SUM(amount_gbp) FROM payments WHERE booking_id = $1
        ), 0) AS balance
       FROM bookings b
       WHERE b.id = $1`,
      bookingId,
    ) as Record<string, unknown>[];
    const row = rows[0] as { balance: number } | undefined;
    return row?.balance ?? 0;
  },

  async recordPayment(
    bookingId: number,
    amountGbp: number,
    paymentMethod: string,
    transactionReference: string,
  ): Promise<void> {
    await db.payments.create({
      data: {
        booking_id: bookingId,
        amount: amountGbp,
        amount_gbp: amountGbp,
        method: paymentMethod,
        transaction_reference: transactionReference,
        status: "completed",
      },
    });
  },
};
