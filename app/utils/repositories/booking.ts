/* eslint-disable @typescript-eslint/no-explicit-any */
import { kdb } from "../db.server";
import { sql } from "kysely";
import { BookingStatus, BookingSource, PaymentStatus, FlightStatus } from "../constants";
import { toDateString } from "../../types/shared";

export interface BookingRow {
  id: number;
  user_id: number;
  booking_reference: string;
  status: string;
  organization_id: number | null;
  is_organization_billing: boolean;
  total_amount: number | null;
  total_amount_gbp: number | null;
  payment_status: string;
  payment_method: string | null;
  payment_date: string | null;
  payment_due_date: string | null;
  payment_terms: string | null;
  notes: string | null;
  booking_source: string;
  created_by: number | null;
  cancelled_at: string | null;
  cancelled_by: number | null;
  cancellation_reason: string | null;
  stripe_session_id: string | null;
  invoice_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaginatedResult {
  bookings: Array<{
    booking: BookingRow;
    firstLeg: { origin_code: string; destination_code: string; leg_date: string } | null;
    passenger: { first_name: string; last_name: string; email: string; phone: string | null } | null;
  }>;
  totalCount: number;
  page: number;
  totalPages: number;
}

export interface ClientGroup {
  clientName: string;
  clientEmail: string;
  bookings: Array<{
    booking: BookingRow;
    firstLeg: { origin_code: string; destination_code: string; leg_date: string } | null;
    paymentStatus: string;
  }>;
}

export interface ActivityItem {
  type: "cancellation" | "new_booking" | "payment" | "status_change";
  bookingRef: string;
  clientName: string;
  timestamp: string;
  description: string;
}

function generateReference(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let ref = "";
  for (let i = 0; i < 3; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  for (let i = 0; i < 5; i++) ref += Math.floor(Math.random() * 10).toString();
  return ref;
}

function toBookingRow(r: unknown): BookingRow {
  const row = r as Record<string, unknown>;
  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    booking_reference: String(row.booking_reference),
    status: String(row.status),
    organization_id: row.organization_id != null ? Number(row.organization_id) : null,
    is_organization_billing: Boolean(row.is_organization_billing),
    total_amount: row.total_amount != null ? Number(row.total_amount) : null,
    total_amount_gbp: row.total_amount_gbp != null ? Number(row.total_amount_gbp) : null,
    payment_status: String(row.payment_status),
    payment_method: row.payment_method != null ? String(row.payment_method) : null,
    payment_date: row.payment_date != null ? String(row.payment_date) : null,
    payment_due_date: row.payment_due_date != null ? toDateString(row.payment_due_date) : null,
    payment_terms: row.payment_terms != null ? String(row.payment_terms) : null,
    notes: row.notes != null ? String(row.notes) : null,
    booking_source: String(row.booking_source),
    created_by: row.created_by != null ? Number(row.created_by) : null,
    cancelled_at: row.cancelled_at != null ? String(row.cancelled_at) : null,
    cancelled_by: row.cancelled_by != null ? Number(row.cancelled_by) : null,
    cancellation_reason: row.cancellation_reason != null ? String(row.cancellation_reason) : null,
    stripe_session_id: row.stripe_session_id != null ? String(row.stripe_session_id) : null,
    invoice_id: row.invoice_id != null ? String(row.invoice_id) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function formatLegDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toISOString().split("T")[0];
  } catch {
    return String(dateStr);
  }
}

async function fetchFirstLegAndPassenger(
  bookingId: number
): Promise<{
  firstLeg: { origin_code: string; destination_code: string; leg_date: string; flight_id: number | null } | null;
  passenger: { first_name: string; last_name: string; email: string; phone: string | null } | null;
}> {
  const [legRows, passengerRows] = await Promise.all([
    kdb
      .selectFrom("booking_legs")
      .select(["origin_code", "destination_code", "leg_date", "flight_id"])
      .where("booking_id", "=", bookingId)
      .where("leg_sequence", "=", 1)
      .limit(1)
      .execute(),
    kdb
      .selectFrom("booking_passengers")
      .select(["first_name", "last_name", "email", "phone"])
      .where("booking_id", "=", bookingId)
      .orderBy("id", "asc")
      .limit(1)
      .execute(),
  ]);

  return {
    firstLeg: legRows[0]
      ? {
          origin_code: String(legRows[0].origin_code ?? ""),
          destination_code: String(legRows[0].destination_code ?? ""),
          leg_date: formatLegDate(String(legRows[0].leg_date ?? "")),
          flight_id: legRows[0].flight_id != null ? Number(legRows[0].flight_id) : null,
        }
      : null,
    passenger: passengerRows[0]
      ? {
          first_name: String(passengerRows[0].first_name ?? ""),
          last_name: String(passengerRows[0].last_name ?? ""),
          email: String(passengerRows[0].email ?? ""),
          phone: passengerRows[0].phone != null ? String(passengerRows[0].phone) : null,
        }
      : null,
  };
}

export const bookingRepository = {
  async createPending(
    userId: number,
    organizationId: number | null,
    isOrganizationBilling: boolean,
    options?: {
      booking_source?: string;
      created_by?: number;
      payment_mode?: string;
    }
  ): Promise<BookingRow> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const reference = generateReference();
      try {
        const rows = await kdb
          .insertInto("bookings")
          .values({
            user_id: userId,
            booking_reference: reference,
            status: BookingStatus.PENDING,
            organization_id: organizationId,
            is_organization_billing: isOrganizationBilling,
            booking_source: options?.booking_source ?? BookingSource.CUSTOMER_DIRECT,
            created_by: options?.created_by ?? null,
            payment_mode: options?.payment_mode ?? "per_booking",
          } as any)
          .returningAll()
          .execute();
        return toBookingRow(rows[0] as unknown);
      } catch (err: unknown) {
        const pgErr = err as { code?: string; constraint?: string };
        if (pgErr.code === "23505" || pgErr.constraint?.includes("booking_reference")) continue;
        throw err;
      }
    }
    throw new Error("Unable to generate unique booking reference after 10 attempts");
  },

  async findById(id: number): Promise<BookingRow | null> {
    const rows = await kdb
      .selectFrom("bookings")
      .selectAll()
      .where("id", "=", id)
      .execute();
    return rows.length > 0 ? toBookingRow(rows[0] as unknown) : null;
  },

  async findByReference(reference: string): Promise<BookingRow | null> {
    const rows = await kdb
      .selectFrom("bookings")
      .selectAll()
      .where("booking_reference", "=", reference)
      .execute();
    return rows.length > 0 ? toBookingRow(rows[0] as unknown) : null;
  },

  async updateStatus(id: number, status: string): Promise<void> {
    const now = new Date().toISOString();
    await kdb
      .updateTable("bookings")
      .set({ status, updated_at: now } as any)
      .where("id", "=", id)
      .execute();
  },

  async updatePayment(
    id: number,
    data: {
      total_amount_gbp?: number;
      payment_method?: string;
      payment_status?: string;
    }
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.total_amount_gbp !== undefined) updateData.total_amount_gbp = data.total_amount_gbp;
    if (data.payment_method !== undefined) updateData.payment_method = data.payment_method;
    if (data.payment_status !== undefined) updateData.payment_status = data.payment_status;
    if (Object.keys(updateData).length === 0) return;
    updateData.updated_at = new Date().toISOString();
    await kdb
      .updateTable("bookings")
      .set(updateData as any)
      .where("id", "=", id)
      .execute();
  },

  async cancel(id: number, cancelledBy: number, reason?: string): Promise<void> {
    const now = new Date().toISOString();
    await kdb
      .updateTable("bookings")
      .set({
        status: BookingStatus.CANCELLED,
        cancelled_at: now,
        cancelled_by: cancelledBy,
        cancellation_reason: reason ?? null,
        updated_at: now,
      } as any)
      .where("id", "=", id)
      .execute();
  },

  async findUpcomingByUserId(userId: number): Promise<{
    bookings: Array<{ booking: BookingRow; firstLeg: { origin_code: string; destination_code: string; leg_date: string } | null }>;
    totalCount: number;
  }> {
    const [countResult, rows] = await Promise.all([
      kdb
        .selectFrom("bookings")
        .select(kdb.fn.countAll<number>().as("cnt"))
        .where("user_id", "=", userId)
        .execute(),
      kdb
        .selectFrom("bookings")
        .selectAll()
        .where("user_id", "=", userId)
        .orderBy("created_at desc")
        .limit(5)
        .execute(),
    ]);

    const totalCount = Number(countResult[0]?.cnt ?? 0);

    const results = await Promise.all(
      rows.map(async (row) => {
        const legRows = await kdb
          .selectFrom("booking_legs")
          .select(["origin_code", "destination_code", "leg_date"])
          .where("booking_id", "=", Number(row.id))
          .where("leg_sequence", "=", 1)
          .limit(1)
          .execute();

        return {
          booking: toBookingRow(row as unknown),
          firstLeg: legRows[0]
            ? {
                origin_code: String(legRows[0].origin_code ?? ""),
                destination_code: String(legRows[0].destination_code ?? ""),
                leg_date: formatLegDate(String(legRows[0].leg_date ?? "")),
              }
            : null,
        };
      })
    );
    return { bookings: results, totalCount };
  },

  async findAll(page = 1, pageSize = 20): Promise<{
    bookings: Array<{ booking: BookingRow; firstLeg: { origin_code: string; destination_code: string; leg_date: string; flight_id: number | null } | null; passenger: { first_name: string; last_name: string; email: string; phone: string | null } | null }>;
    totalCount: number;
    page: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * pageSize;
    const [countResult, rows] = await Promise.all([
      kdb.selectFrom("bookings").select(kdb.fn.countAll<number>().as("cnt")).execute(),
      kdb
        .selectFrom("bookings")
        .selectAll()
        .orderBy("created_at desc")
        .offset(offset)
        .limit(pageSize)
        .execute(),
    ]);
    const totalCount = Number(countResult[0]?.cnt ?? 0);

    const bookings = await Promise.all(
      rows.map(async (row) => {
        const { firstLeg, passenger } = await fetchFirstLegAndPassenger(Number(row.id));
        return {
          booking: toBookingRow(row as unknown),
          firstLeg,
          passenger,
        };
      })
    );

    return { bookings, totalCount, page, totalPages: Math.ceil(totalCount / pageSize) };
  },

  async findByStatus(status: string, page = 1, pageSize = 20): Promise<{
    bookings: Array<{ booking: BookingRow; firstLeg: { origin_code: string; destination_code: string; leg_date: string; flight_id: number | null } | null; passenger: { first_name: string; last_name: string; email: string; phone: string | null } | null }>;
    totalCount: number;
    page: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * pageSize;

    let statusFilter;
    if (status === "upcoming") {
      statusFilter = sql`status NOT IN (${BookingStatus.COMPLETED}, ${BookingStatus.CANCELLED})`;
    } else if (status === BookingStatus.COMPLETED) {
      statusFilter = sql`status = ${BookingStatus.COMPLETED}`;
    } else if (status === BookingStatus.CANCELLED) {
      statusFilter = sql`status = ${BookingStatus.CANCELLED}`;
    } else {
      statusFilter = sql`status = ${status}`;
    }

    const [countRows, dataRows] = await Promise.all([
      sql`SELECT COUNT(*)::int AS cnt FROM bookings WHERE ${statusFilter}`.execute(kdb),
      sql`SELECT * FROM bookings
        WHERE ${statusFilter}
        ORDER BY created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}`.execute(kdb),
    ]);

    const totalCount = Number((countRows.rows[0] as { cnt: number | bigint } | undefined)?.cnt ?? 0);

    const bookings = await Promise.all(
      (dataRows.rows as Record<string, unknown>[]).map(async (row) => {
        const { firstLeg, passenger } = await fetchFirstLegAndPassenger(Number(row.id));
        return {
          booking: toBookingRow(row as unknown),
          firstLeg,
          passenger,
        };
      }),
    );

    return { bookings, totalCount, page, totalPages: Math.ceil(totalCount / pageSize) };
  },

  async findBySource(source: string, page = 1, pageSize = 20): Promise<{
    bookings: Array<{ booking: BookingRow; firstLeg: { origin_code: string; destination_code: string; leg_date: string; flight_id: number | null } | null; passenger: { first_name: string; last_name: string; email: string; phone: string | null } | null }>;
    totalCount: number;
    page: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * pageSize;
    const [countResult, rows] = await Promise.all([
      kdb
        .selectFrom("bookings")
        .select(kdb.fn.countAll<number>().as("cnt"))
        .where("booking_source", "=", source)
        .execute(),
      kdb
        .selectFrom("bookings")
        .selectAll()
        .where("booking_source", "=", source)
        .orderBy("created_at desc")
        .offset(offset)
        .limit(pageSize)
        .execute(),
    ]);
    const totalCount = Number(countResult[0]?.cnt ?? 0);

    const bookings = await Promise.all(
      rows.map(async (row) => {
        const { firstLeg, passenger } = await fetchFirstLegAndPassenger(Number(row.id));
        return {
          booking: toBookingRow(row as unknown),
          firstLeg,
          passenger,
        };
      })
    );

    return { bookings, totalCount, page, totalPages: Math.ceil(totalCount / pageSize) };
  },

  async findUnassigned(page = 1, pageSize = 20): Promise<{
    bookings: Array<{ booking: BookingRow; firstLeg: { origin_code: string; destination_code: string; leg_date: string } | null; passenger: { first_name: string; last_name: string; email: string; phone: string | null } | null }>;
    totalCount: number;
    page: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * pageSize;

    const [countRows, dataRows] = await Promise.all([
      sql`
        SELECT COUNT(DISTINCT b.id)::int AS cnt
        FROM bookings b
        INNER JOIN booking_legs bl ON bl.booking_id = b.id
        WHERE b.status NOT IN (${BookingStatus.CANCELLED}, ${BookingStatus.COMPLETED})
          AND bl.flight_id IS NULL
      `.execute(kdb),
      sql`
        SELECT DISTINCT b.*
        FROM bookings b
        INNER JOIN booking_legs bl ON bl.booking_id = b.id
        WHERE b.status NOT IN (${BookingStatus.CANCELLED}, ${BookingStatus.COMPLETED})
          AND bl.flight_id IS NULL
        ORDER BY b.created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `.execute(kdb),
    ]);

    const totalCount = Number((countRows.rows[0] as { cnt: number | bigint } | undefined)?.cnt ?? 0);

    const bookings = await Promise.all(
      (dataRows.rows as Record<string, unknown>[]).map(async (row) => {
        const legRows = await kdb
          .selectFrom("booking_legs")
          .select(["origin_code", "destination_code", "leg_date"])
          .where("booking_id", "=", Number(row.id))
          .where("flight_id", "is", null)
          .limit(1)
          .execute();

        const passengerRows = await kdb
          .selectFrom("booking_passengers")
          .select(["first_name", "last_name", "email", "phone"])
          .where("booking_id", "=", Number(row.id))
          .orderBy("id", "asc")
          .limit(1)
          .execute();

        return {
          booking: toBookingRow(row as unknown),
          firstLeg: legRows[0]
            ? {
                origin_code: String(legRows[0].origin_code ?? ""),
                destination_code: String(legRows[0].destination_code ?? ""),
                leg_date: formatLegDate(String(legRows[0].leg_date ?? "")),
              }
            : null,
          passenger: passengerRows[0]
            ? {
                first_name: String(passengerRows[0].first_name ?? ""),
                last_name: String(passengerRows[0].last_name ?? ""),
                email: String(passengerRows[0].email ?? ""),
                phone: passengerRows[0].phone != null ? String(passengerRows[0].phone) : null,
              }
            : null,
        };
      })
    );

    return { bookings, totalCount, page, totalPages: Math.ceil(totalCount / pageSize) };
  },

  async search(query: string, page = 1, pageSize = 20): Promise<{
    bookings: Array<{ booking: BookingRow; firstLeg: { origin_code: string; destination_code: string; leg_date: string; flight_id: number | null } | null; passenger: { first_name: string; last_name: string; email: string; phone: string | null } | null }>;
    totalCount: number;
    page: number;
    totalPages: number;
  }> {
    const pattern = `%${query}%`;
    const offset = (page - 1) * pageSize;

    const [countResult, dataResult] = await Promise.all([
      sql`
        SELECT COUNT(DISTINCT b.id) as cnt
        FROM bookings b
        LEFT JOIN booking_passengers p ON p.booking_id = b.id
        WHERE b.booking_reference ILIKE ${pattern}
           OR p.first_name ILIKE ${pattern}
           OR p.last_name ILIKE ${pattern}
           OR p.email ILIKE ${pattern}
           OR p.phone ILIKE ${pattern}
           OR p.passport_number ILIKE ${pattern}
           OR p.id_document_number ILIKE ${pattern}
           OR p.nationality ILIKE ${pattern}
      `.execute(kdb),
      sql`
        SELECT DISTINCT b.*, bl.origin_code, bl.destination_code, bl.leg_date, bl.flight_id,
                p.first_name AS passenger_first_name, p.last_name AS passenger_last_name,
                p.email AS passenger_email, p.phone AS passenger_phone
        FROM bookings b
        LEFT JOIN booking_legs bl ON bl.booking_id = b.id AND bl.leg_sequence = 1
        LEFT JOIN booking_passengers p ON p.booking_id = b.id
        WHERE b.booking_reference ILIKE ${pattern}
           OR p.first_name ILIKE ${pattern}
           OR p.last_name ILIKE ${pattern}
           OR p.email ILIKE ${pattern}
           OR p.phone ILIKE ${pattern}
           OR p.passport_number ILIKE ${pattern}
           OR p.id_document_number ILIKE ${pattern}
           OR p.nationality ILIKE ${pattern}
        ORDER BY b.created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `.execute(kdb),
    ]);

    const totalCount = Number((countResult.rows[0] as { cnt: number | bigint } | undefined)?.cnt ?? 0);
    return {
      bookings: (dataResult.rows as Record<string, unknown>[]).map((row: Record<string, unknown>) => ({
        booking: toBookingRow(row),
        firstLeg: row.origin_code
          ? {
              origin_code: row.origin_code as string,
              destination_code: row.destination_code as string,
              leg_date: formatLegDate(row.leg_date as string),
              flight_id: (row.flight_id as number) ?? null,
            }
          : null,
        passenger: row.passenger_first_name
          ? {
              first_name: row.passenger_first_name as string,
              last_name: row.passenger_last_name as string,
              email: (row.passenger_email as string) ?? "",
              phone: row.passenger_phone as string | null,
            }
          : null,
      })),
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / pageSize),
    };
  },

  async searchByUser(query: string, userId: number, page = 1, pageSize = 20): Promise<{
    bookings: Array<{ booking: BookingRow; firstLeg: { origin_code: string; destination_code: string; leg_date: string; flight_id: number | null } | null; passenger: { first_name: string; last_name: string; email: string; phone: string | null } | null }>;
    totalCount: number;
    page: number;
    totalPages: number;
  }> {
    const pattern = `%${query}%`;
    const offset = (page - 1) * pageSize;

    const [countResult, dataResult] = await Promise.all([
      sql`
        SELECT COUNT(DISTINCT b.id) as cnt
        FROM bookings b
        LEFT JOIN booking_passengers p ON p.booking_id = b.id
        WHERE b.user_id = ${userId}
          AND (b.booking_reference ILIKE ${pattern}
            OR p.first_name ILIKE ${pattern}
            OR p.last_name ILIKE ${pattern}
            OR p.email ILIKE ${pattern}
            OR p.phone ILIKE ${pattern}
            OR p.passport_number ILIKE ${pattern}
            OR p.id_document_number ILIKE ${pattern}
            OR p.nationality ILIKE ${pattern})
      `.execute(kdb),
      sql`
        SELECT DISTINCT b.*, bl.origin_code, bl.destination_code, bl.leg_date, bl.flight_id,
                p.first_name AS passenger_first_name, p.last_name AS passenger_last_name,
                p.email AS passenger_email, p.phone AS passenger_phone
        FROM bookings b
        LEFT JOIN booking_legs bl ON bl.booking_id = b.id AND bl.leg_sequence = 1
        LEFT JOIN booking_passengers p ON p.booking_id = b.id
        WHERE b.user_id = ${userId}
          AND (b.booking_reference ILIKE ${pattern}
            OR p.first_name ILIKE ${pattern}
            OR p.last_name ILIKE ${pattern}
            OR p.email ILIKE ${pattern}
            OR p.phone ILIKE ${pattern}
            OR p.passport_number ILIKE ${pattern}
            OR p.id_document_number ILIKE ${pattern}
            OR p.nationality ILIKE ${pattern})
        ORDER BY b.created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `.execute(kdb),
    ]);

    const totalCount = Number((countResult.rows[0] as { cnt: number | bigint } | undefined)?.cnt ?? 0);
    return {
      bookings: (dataResult.rows as Record<string, unknown>[]).map((row: Record<string, unknown>) => ({
        booking: toBookingRow(row),
        firstLeg: row.origin_code
          ? {
              origin_code: row.origin_code as string,
              destination_code: row.destination_code as string,
              leg_date: formatLegDate(row.leg_date as string),
              flight_id: (row.flight_id as number) ?? null,
            }
          : null,
        passenger: row.passenger_first_name
          ? {
              first_name: row.passenger_first_name as string,
              last_name: row.passenger_last_name as string,
              email: (row.passenger_email as string) ?? "",
              phone: row.passenger_phone as string | null,
            }
          : null,
      })),
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / pageSize),
    };
  },

  async findByDateRange(startDate: string, endDate: string, page = 1, pageSize = 20): Promise<{
    bookings: Array<{ booking: BookingRow; firstLeg: { origin_code: string; destination_code: string; leg_date: string; flight_id: number | null } | null; passenger: { first_name: string; last_name: string; email: string; phone: string | null } | null }>;
    totalCount: number;
    page: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * pageSize;

    const [countRows, dataRows] = await Promise.all([
      sql`
        SELECT COUNT(DISTINCT b.id)::int AS cnt
        FROM bookings b
        INNER JOIN booking_legs bl ON bl.booking_id = b.id
        WHERE bl.leg_date >= ${startDate}::date
          AND bl.leg_date <= ${endDate}::date
      `.execute(kdb),
      sql`
        SELECT DISTINCT b.*
        FROM bookings b
        INNER JOIN booking_legs bl ON bl.booking_id = b.id
        WHERE bl.leg_date >= ${startDate}::date
          AND bl.leg_date <= ${endDate}::date
        ORDER BY b.created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `.execute(kdb),
    ]);

    const totalCount = Number((countRows.rows[0] as { cnt: number | bigint } | undefined)?.cnt ?? 0);

    const bookings = await Promise.all(
      (dataRows.rows as Record<string, unknown>[]).map(async (row) => {
        const bid = Number(row.id);
        const legRows = await kdb
          .selectFrom("booking_legs")
          .select(["origin_code", "destination_code", "leg_date", "flight_id"])
          .where("booking_id", "=", bid)
          .where("leg_date", ">=", startDate)
          .where("leg_date", "<=", endDate)
          .limit(1)
          .execute();

        const passengerRows = await kdb
          .selectFrom("booking_passengers")
          .select(["first_name", "last_name", "email", "phone"])
          .where("booking_id", "=", bid)
          .orderBy("id", "asc")
          .limit(1)
          .execute();

        return {
          booking: toBookingRow(row),
          firstLeg: legRows[0]
            ? {
                origin_code: String(legRows[0].origin_code ?? ""),
                destination_code: String(legRows[0].destination_code ?? ""),
                leg_date: formatLegDate(String(legRows[0].leg_date ?? "")),
                flight_id: legRows[0].flight_id != null ? Number(legRows[0].flight_id) : null,
              }
            : null,
          passenger: passengerRows[0]
            ? {
                first_name: String(passengerRows[0].first_name ?? ""),
                last_name: String(passengerRows[0].last_name ?? ""),
                email: String(passengerRows[0].email ?? ""),
                phone: passengerRows[0].phone != null ? String(passengerRows[0].phone) : null,
              }
            : null,
        };
      })
    );

    return { bookings, totalCount, page, totalPages: Math.ceil(totalCount / pageSize) };
  },

  async findByUserIdAndDateRange(userId: number, startDate: string, endDate: string, page = 1, pageSize = 20): Promise<{
    bookings: Array<{ booking: BookingRow; firstLeg: { origin_code: string; destination_code: string; leg_date: string } | null }>;
    totalCount: number;
    page: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * pageSize;

    const [countRows, dataRows] = await Promise.all([
      sql`
        SELECT COUNT(DISTINCT b.id)::int AS cnt
        FROM bookings b
        INNER JOIN booking_legs bl ON bl.booking_id = b.id
        WHERE b.user_id = ${userId}
          AND bl.leg_date >= ${startDate}::date
          AND bl.leg_date <= ${endDate}::date
      `.execute(kdb),
      sql`
        SELECT DISTINCT b.*
        FROM bookings b
        INNER JOIN booking_legs bl ON bl.booking_id = b.id
        WHERE b.user_id = ${userId}
          AND bl.leg_date >= ${startDate}::date
          AND bl.leg_date <= ${endDate}::date
        ORDER BY b.created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `.execute(kdb),
    ]);

    const totalCount = Number((countRows.rows[0] as { cnt: number | bigint } | undefined)?.cnt ?? 0);

    const bookings = await Promise.all(
      (dataRows.rows as Record<string, unknown>[]).map(async (row) => {
        const bid = Number(row.id);
        const legRows = await kdb
          .selectFrom("booking_legs")
          .select(["origin_code", "destination_code", "leg_date"])
          .where("booking_id", "=", bid)
          .where("leg_date", ">=", startDate)
          .where("leg_date", "<=", endDate)
          .limit(1)
          .execute();

        return {
          booking: toBookingRow(row),
          firstLeg: legRows[0]
            ? {
                origin_code: String(legRows[0].origin_code ?? ""),
                destination_code: String(legRows[0].destination_code ?? ""),
                leg_date: formatLegDate(String(legRows[0].leg_date ?? "")),
              }
            : null,
        };
      })
    );

    return { bookings, totalCount, page, totalPages: Math.ceil(totalCount / pageSize) };
  },

  async findByFlightId(flightId: number): Promise<Array<{ booking: BookingRow; firstLeg: { origin_code: string; destination_code: string; leg_date: string } | null }>> {
    const rows = await kdb
      .selectFrom("bookings as b")
      .innerJoin("booking_legs as bl", "bl.booking_id", "b.id")
      .selectAll("b")
      .where("bl.flight_id", "=", flightId)
      .orderBy("b.created_at desc")
      .execute();

    const results = await Promise.all(
      rows.map(async (row) => {
        const legRows = await kdb
          .selectFrom("booking_legs")
          .select(["origin_code", "destination_code", "leg_date"])
          .where("booking_id", "=", Number(row.id))
          .limit(1)
          .execute();

        return {
          booking: toBookingRow(row as unknown),
          firstLeg: legRows[0]
            ? {
                origin_code: String(legRows[0].origin_code ?? ""),
                destination_code: String(legRows[0].destination_code ?? ""),
                leg_date: formatLegDate(String(legRows[0].leg_date ?? "")),
              }
            : null,
        };
      })
    );
    return results;
  },

  async getHoursInStatus(bookingId: number): Promise<number> {
    const rows = await kdb
      .selectFrom("bookings")
      .select("updated_at")
      .where("id", "=", bookingId)
      .execute();
    if (rows.length === 0) return 0;
    const updatedAt = new Date(String(rows[0].updated_at));
    const now = new Date();
    const diffMs = now.getTime() - updatedAt.getTime();
    return Math.round(diffMs / (1000 * 60 * 60));
  },

  async getDaysUntilDeparture(bookingId: number): Promise<number | null> {
    const rows = await kdb
      .selectFrom("booking_legs")
      .select("leg_date")
      .where("booking_id", "=", bookingId)
      .orderBy("leg_date", "asc")
      .limit(1)
      .execute();
    if (rows.length === 0) return null;
    const legDate = new Date(String(rows[0].leg_date));
    const now = new Date();
    const legDateOnly = new Date(legDate.getFullYear(), legDate.getMonth(), legDate.getDate());
    const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffMs = legDateOnly.getTime() - nowDateOnly.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  },

  async findNeedsAttention(page = 1, pageSize = 20): Promise<PaginatedResult> {
    const offset = (page - 1) * pageSize;

    const [countResult, dataResult] = await Promise.all([
      sql`
        SELECT COUNT(*) as cnt FROM (
          SELECT b.id
          FROM bookings b
          WHERE
            (b.updated_at < NOW() - INTERVAL '48 hours' AND b.status NOT IN (${BookingStatus.CANCELLED}, ${BookingStatus.COMPLETED}))
            OR
            (b.payment_status = ${PaymentStatus.PENDING} AND b.payment_due_date IS NOT NULL AND b.payment_due_date < CURRENT_DATE)
            OR
            (b.status NOT IN (${BookingStatus.CANCELLED}, ${BookingStatus.COMPLETED})
             AND EXISTS (
               SELECT 1 FROM booking_legs bl
               WHERE bl.booking_id = b.id
                 AND bl.flight_id IS NULL
                 AND bl.leg_date <= CURRENT_DATE + INTERVAL '2 days'
                 AND bl.leg_date >= CURRENT_DATE
             ))
            OR
            (b.status = ${BookingStatus.CANCELLED} AND b.cancelled_at IS NOT NULL AND b.cancelled_at >= NOW() - INTERVAL '1 hour')
        ) sub
      `.execute(kdb),
      sql`
        SELECT DISTINCT b.*, bl.origin_code, bl.destination_code, bl.leg_date,
                p.first_name AS passenger_first_name, p.last_name AS passenger_last_name,
                p.email AS passenger_email, p.phone AS passenger_phone
        FROM bookings b
        LEFT JOIN booking_legs bl ON bl.booking_id = b.id AND bl.leg_sequence = 1
        LEFT JOIN LATERAL (
          SELECT first_name, last_name, email, phone
          FROM booking_passengers
          WHERE booking_id = b.id
          ORDER BY id
          LIMIT 1
        ) p ON true
        WHERE
          (b.updated_at < NOW() - INTERVAL '48 hours' AND b.status NOT IN (${BookingStatus.CANCELLED}, ${BookingStatus.COMPLETED}))
          OR
          (b.payment_status = ${PaymentStatus.PENDING} AND b.payment_due_date IS NOT NULL AND b.payment_due_date < CURRENT_DATE)
          OR
          (b.status NOT IN (${BookingStatus.CANCELLED}, ${BookingStatus.COMPLETED})
           AND EXISTS (
             SELECT 1 FROM booking_legs bl2
             WHERE bl2.booking_id = b.id
               AND bl2.flight_id IS NULL
               AND bl2.leg_date <= CURRENT_DATE + INTERVAL '2 days'
               AND bl2.leg_date >= CURRENT_DATE
           ))
          OR
          (b.status = ${BookingStatus.CANCELLED} AND b.cancelled_at IS NOT NULL AND b.cancelled_at >= NOW() - INTERVAL '1 hour')
        ORDER BY b.created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `.execute(kdb),
    ]);

    const totalCount = Number((countResult.rows[0] as { cnt: number | bigint } | undefined)?.cnt ?? 0);
    return {
      bookings: (dataResult.rows as Record<string, unknown>[]).map((row: Record<string, unknown>) => ({
        booking: toBookingRow(row),
        firstLeg: row.origin_code
          ? { origin_code: row.origin_code as string, destination_code: row.destination_code as string, leg_date: row.leg_date as string }
          : null,
        passenger: row.passenger_first_name
          ? {
              first_name: row.passenger_first_name as string,
              last_name: row.passenger_last_name as string,
              email: row.passenger_email as string,
              phone: row.passenger_phone as string | null,
            }
          : null,
      })),
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / pageSize),
    };
  },

  async getPipelineCounts(): Promise<Record<string, number>> {
    const [total, upcoming, completed, cancelled] = await Promise.all([
      kdb.selectFrom("bookings").select(kdb.fn.countAll<number>().as("cnt")).execute(),
      kdb
        .selectFrom("bookings")
        .select(kdb.fn.countAll<number>().as("cnt"))
        .where("status", "not in", [BookingStatus.COMPLETED, BookingStatus.CANCELLED])
        .execute(),
      kdb
        .selectFrom("bookings")
        .select(kdb.fn.countAll<number>().as("cnt"))
        .where("status", "=", BookingStatus.COMPLETED)
        .execute(),
      kdb
        .selectFrom("bookings")
        .select(kdb.fn.countAll<number>().as("cnt"))
        .where("status", "=", BookingStatus.CANCELLED)
        .execute(),
    ]);
    return {
      total: Number(total[0]?.cnt ?? 0),
      upcoming: Number(upcoming[0]?.cnt ?? 0),
      completed: Number(completed[0]?.cnt ?? 0),
      cancelled: Number(cancelled[0]?.cnt ?? 0),
    };
  },

  async findFlightsWithCapacity(): Promise<Array<{ id: number; flightNumber: string; route: string; availableSeats: number }>> {
    const flights = await kdb
      .selectFrom("flights as f")
      .innerJoin("aircraft as a", "a.id", "f.aircraft_id")
      .select([
        "f.id",
        "f.flight_number",
        "f.origin_code",
        "f.destination_code",
        "a.seat_count",
      ])
      .where("f.status", "=", FlightStatus.SCHEDULED)
      .orderBy("f.departure_time", "asc")
      .execute();

    const results = await Promise.all(
      flights.map(async (flight) => {
        const seatCount = flight.seat_count;
        const originCode = String(flight.origin_code ?? "");
        const destCode = String(flight.destination_code ?? "");

        const bookingLegs = await kdb
          .selectFrom("booking_legs as bl")
          .innerJoin("bookings as b", "b.id", "bl.booking_id")
          .select("bl.booking_id")
          .where("bl.flight_id", "=", Number(flight.id))
          .where("b.status", "!=", BookingStatus.CANCELLED)
          .execute();

        const uniqueBookingIds = [...new Set(bookingLegs.map((bl) => bl.booking_id))];

        let totalPassengers = 0;
        for (const bookingId of uniqueBookingIds) {
          const countResult = await kdb
            .selectFrom("booking_passengers")
            .select(kdb.fn.countAll<number>().as("cnt"))
            .where("booking_id", "=", bookingId)
            .execute();
          totalPassengers += Number(countResult[0]?.cnt ?? 0);
        }

        const availableSeats = seatCount - totalPassengers;
        if (availableSeats <= 0) return null;

        return {
          id: Number(flight.id),
          flightNumber: String(flight.flight_number ?? ""),
          route: `${originCode} -> ${destCode}`,
          availableSeats,
        };
      })
    );

    return results.filter((r): r is NonNullable<typeof r> => r !== null);
  },

  async findAgentPortfolio(agentUserId: number): Promise<ClientGroup[]> {
    const rows = await kdb
      .selectFrom("bookings as b")
      .selectAll("b")
      .where("b.booking_source", "=", "booking_agent")
      .where("b.created_by", "=", agentUserId)
      .orderBy("b.created_at desc")
      .execute();

    const groups = new Map<string, ClientGroup>();

    for (const row of rows) {
      const bookingId = Number(row.id);

      const [passengerRows, legRows] = await Promise.all([
        kdb
          .selectFrom("booking_passengers")
          .select(["first_name", "last_name", "email"])
          .where("booking_id", "=", bookingId)
          .orderBy("id", "asc")
          .limit(1)
          .execute(),
        kdb
          .selectFrom("booking_legs")
          .select(["origin_code", "destination_code", "leg_date"])
          .where("booking_id", "=", bookingId)
          .where("leg_sequence", "=", 1)
          .limit(1)
          .execute(),
      ]);

      const passenger = passengerRows[0];
      const firstName = passenger ? String(passenger.first_name ?? "") : "";
      const lastName = passenger ? String(passenger.last_name ?? "") : "";
      const clientEmail = passenger ? String(passenger.email ?? "") : "";
      const clientName = `${firstName} ${lastName}`.trim() || "Unknown Client";

      const leg = legRows[0];

      if (!groups.has(clientName)) {
        groups.set(clientName, {
          clientName,
          clientEmail,
          bookings: [],
        });
      }

      const group = groups.get(clientName)!;
      group.bookings.push({
        booking: toBookingRow(row as unknown),
        firstLeg: leg
          ? {
              origin_code: String(leg.origin_code ?? ""),
              destination_code: String(leg.destination_code ?? ""),
              leg_date: formatLegDate(String(leg.leg_date ?? "")),
            }
          : null,
        paymentStatus: String(row.payment_status ?? PaymentStatus.PENDING),
      });
    }

    const result = Array.from(groups.values());
    result.sort((a, b) => {
      const aLast = a.clientName.split(" ").pop() ?? "";
      const bLast = b.clientName.split(" ").pop() ?? "";
      const cmp = aLast.localeCompare(bLast);
      if (cmp !== 0) return cmp;
      return a.clientName.localeCompare(b.clientName);
    });
    return result;
  },

  async findRecentActivity(agentUserId: number, limit = 20): Promise<ActivityItem[]> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const auditRows = await kdb
      .selectFrom("audit_log")
      .selectAll()
      .where("entity_type", "=", "booking")
      .where("created_at", ">=", thirtyDaysAgo.toISOString())
      .orderBy("created_at desc")
      .limit(limit)
      .execute();

    if (auditRows.length === 0) return [];

    const bookingIds = [...new Set(auditRows.map((r) => r.entity_id).filter((id): id is number => id !== null))];

    const bookingRows = await kdb
      .selectFrom("bookings")
      .selectAll()
      .where("id", "in", bookingIds)
      .where("booking_source", "=", "booking_agent")
      .where("created_by", "=", agentUserId)
      .execute();

    const bookingMap = new Map(bookingRows.map((b) => [b.id, b]));
    const passengerMap = new Map<number, { first_name: string; last_name: string }>();

    for (const booking of bookingRows) {
      const pRows = await kdb
        .selectFrom("booking_passengers")
        .select(["first_name", "last_name"])
        .where("booking_id", "=", Number(booking.id))
        .orderBy("id", "asc")
        .limit(1)
        .execute();
      passengerMap.set(Number(booking.id), {
        first_name: String(pRows[0]?.first_name ?? ""),
        last_name: String(pRows[0]?.last_name ?? ""),
      });
    }

    return auditRows
      .filter((row) => row.entity_id != null && bookingMap.has(row.entity_id))
      .map((row) => {
        const action = row.action;
        const newValues = row.new_values as Record<string, unknown> | null;
        const booking = bookingMap.get(row.entity_id as number);
        const passenger = passengerMap.get(row.entity_id as number);

        let type: ActivityItem["type"] = "status_change";
        let description = "";
        const ref = booking ? String(booking.booking_reference ?? "") : "N/A";
        const clientName = `${passenger?.first_name ?? ""} ${passenger?.last_name ?? ""}`.trim() || "Unknown";

        switch (action) {
          case "create":
            type = "new_booking";
            description = `Booking ${ref} created`;
            break;
          case "cancel":
            type = "cancellation";
            description = `Booking ${ref} cancelled`;
            break;
          case "payment":
            type = "payment";
            description = `Payment received for ${ref}`;
            break;
          case "update_status":
            type = "status_change";
            description = newValues?.status
              ? `Status changed to ${newValues.status}`
              : `Booking ${ref} updated`;
            break;
          default:
            description = `Booking ${ref} ${action}`;
        }

        return {
          type,
          bookingRef: ref,
          clientName,
          timestamp: String(row.created_at ?? ""),
          description,
        };
      });
  },
};
