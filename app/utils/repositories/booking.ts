import { db } from "../db.server";

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

export const bookingRepository = {
  async createPending(
    userId: number,
    organizationId: number | null,
    isOrganizationBilling: boolean,
    options?: {
      booking_source?: string;
      created_by?: number;
    }
  ): Promise<BookingRow> {
    // Retry up to 10 times on reference collision
    for (let attempt = 0; attempt < 10; attempt++) {
      const reference = generateReference();
      try {
        const result = await db.bookings.create({
          data: {
            user_id: userId,
            booking_reference: reference,
            status: "pending",
            organization_id: organizationId,
            is_organization_billing: isOrganizationBilling,
            booking_source: options?.booking_source ?? "customer_direct",
            created_by: options?.created_by ?? null,
          },
        });
        return result as unknown as BookingRow;
      } catch (err: unknown) {
        const prismaErr = err as { code?: string };
        // P2002 is Prisma's unique constraint violation code
        if (prismaErr.code === "P2002") continue;
        throw err;
      }
    }
    throw new Error("Failed to generate unique booking reference after 10 attempts");
  },

  async findById(id: number): Promise<BookingRow | null> {
    const result = await db.bookings.findUnique({
      where: { id },
    });
    return (result as unknown as BookingRow) ?? null;
  },

  async findByReference(reference: string): Promise<BookingRow | null> {
    const result = await db.bookings.findUnique({
      where: { booking_reference: reference },
    });
    return (result as unknown as BookingRow) ?? null;
  },

  async updateStatus(id: number, status: string): Promise<void> {
    await db.bookings.update({
      where: { id },
      data: { status, updated_at: new Date() },
    });
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
    updateData.updated_at = new Date();
    await db.bookings.update({
      where: { id },
      data: updateData,
    });
  },

  async cancel(id: number, cancelledBy: number, reason?: string): Promise<void> {
    await db.bookings.update({
      where: { id },
      data: {
        status: "cancelled",
        cancelled_at: new Date(),
        cancelled_by: cancelledBy,
        cancellation_reason: reason ?? null,
        updated_at: new Date(),
      },
    });
  },

  async findUpcomingByUserId(userId: number): Promise<Array<{ booking: BookingRow; firstLeg: { origin_code: string; destination_code: string; leg_date: string } | null }>> {
    const rows = await db.bookings.findMany({
      where: { user_id: userId },
      include: {
        booking_legs: {
          where: { leg_sequence: 1 },
          select: { origin_code: true, destination_code: true, leg_date: true },
          take: 1,
        },
      },
      orderBy: { created_at: "desc" },
      take: 5,
    });
    return rows.map((row) => ({
      booking: row as unknown as BookingRow,
      firstLeg: row.booking_legs[0]
        ? {
            origin_code: row.booking_legs[0].origin_code,
            destination_code: row.booking_legs[0].destination_code,
            leg_date: row.booking_legs[0].leg_date.toISOString().split("T")[0],
          }
        : null,
    }));
  },

  // ── Operations-wide methods ──────────────────────────────────────────────────

  async findAll(page = 1, pageSize = 20): Promise<{
    bookings: Array<{ booking: BookingRow; firstLeg: { origin_code: string; destination_code: string; leg_date: string; flight_id: number | null } | null; passenger: { first_name: string; last_name: string; email: string; phone: string | null } | null }>;
    totalCount: number;
    page: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * pageSize;
    const [totalCount, rows] = await Promise.all([
      db.bookings.count(),
      db.bookings.findMany({
        skip: offset,
        take: pageSize,
        include: {
          booking_legs: {
            where: { leg_sequence: 1 },
            select: { origin_code: true, destination_code: true, leg_date: true, flight_id: true },
            take: 1,
          },
          booking_passengers: {
            select: { first_name: true, last_name: true, email: true, phone: true },
            orderBy: { id: "asc" },
            take: 1,
          },
        },
        orderBy: { created_at: "desc" },
      }),
    ]);
    return {
      bookings: rows.map((row) => ({
        booking: row as unknown as BookingRow,
        firstLeg: row.booking_legs[0]
          ? {
              origin_code: row.booking_legs[0].origin_code,
              destination_code: row.booking_legs[0].destination_code,
              leg_date: row.booking_legs[0].leg_date.toISOString().split("T")[0],
              flight_id: row.booking_legs[0].flight_id,
            }
          : null,
        passenger: row.booking_passengers[0]
          ? {
              first_name: row.booking_passengers[0].first_name,
              last_name: row.booking_passengers[0].last_name,
              email: row.booking_passengers[0].email ?? "",
              phone: row.booking_passengers[0].phone,
            }
          : null,
      })),
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / pageSize),
    };
  },

  async findByStatus(status: string, page = 1, pageSize = 20): Promise<{
    bookings: Array<{ booking: BookingRow; firstLeg: { origin_code: string; destination_code: string; leg_date: string; flight_id: number | null } | null; passenger: { first_name: string; last_name: string; email: string; phone: string | null } | null }>;
    totalCount: number;
    page: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * pageSize;

    // Map simplified categories to actual DB status queries
    let where: Record<string, unknown>;
    if (status === "upcoming") {
      where = { status: { notIn: ["completed", "cancelled"] } };
    } else if (status === "completed") {
      where = { status: "completed" };
    } else if (status === "cancelled") {
      where = { status: "cancelled" };
    } else {
      where = { status };
    }

    const [totalCount, rows] = await Promise.all([
      db.bookings.count({ where }),
      db.bookings.findMany({
        where,
        skip: offset,
        take: pageSize,
        include: {
          booking_legs: {
            where: { leg_sequence: 1 },
            select: { origin_code: true, destination_code: true, leg_date: true, flight_id: true },
            take: 1,
          },
          booking_passengers: {
            select: { first_name: true, last_name: true, email: true, phone: true },
            orderBy: { id: "asc" },
            take: 1,
          },
        },
        orderBy: { created_at: "desc" },
      }),
    ]);

    return {
      bookings: rows.map((row) => ({
        booking: row as unknown as BookingRow,
        firstLeg: row.booking_legs[0]
          ? {
              origin_code: row.booking_legs[0].origin_code,
              destination_code: row.booking_legs[0].destination_code,
              leg_date: row.booking_legs[0].leg_date.toISOString().split("T")[0],
              flight_id: row.booking_legs[0].flight_id,
            }
          : null,
        passenger: row.booking_passengers[0]
          ? {
              first_name: row.booking_passengers[0].first_name,
              last_name: row.booking_passengers[0].last_name,
              email: row.booking_passengers[0].email ?? "",
              phone: row.booking_passengers[0].phone,
            }
          : null,
      })),
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / pageSize),
    };
  },

  async findBySource(source: string, page = 1, pageSize = 20): Promise<{
    bookings: Array<{ booking: BookingRow; firstLeg: { origin_code: string; destination_code: string; leg_date: string; flight_id: number | null } | null; passenger: { first_name: string; last_name: string; email: string; phone: string | null } | null }>;
    totalCount: number;
    page: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * pageSize;
    const [totalCount, rows] = await Promise.all([
      db.bookings.count({ where: { booking_source: source } }),
      db.bookings.findMany({
        where: { booking_source: source },
        skip: offset,
        take: pageSize,
        include: {
          booking_legs: {
            where: { leg_sequence: 1 },
            select: { origin_code: true, destination_code: true, leg_date: true, flight_id: true },
            take: 1,
          },
          booking_passengers: {
            select: { first_name: true, last_name: true, email: true, phone: true },
            orderBy: { id: "asc" },
            take: 1,
          },
        },
        orderBy: { created_at: "desc" },
      }),
    ]);
    return {
      bookings: rows.map((row) => ({
        booking: row as unknown as BookingRow,
        firstLeg: row.booking_legs[0]
          ? {
              origin_code: row.booking_legs[0].origin_code,
              destination_code: row.booking_legs[0].destination_code,
              leg_date: row.booking_legs[0].leg_date.toISOString().split("T")[0],
              flight_id: row.booking_legs[0].flight_id,
            }
          : null,
        passenger: row.booking_passengers[0]
          ? {
              first_name: row.booking_passengers[0].first_name,
              last_name: row.booking_passengers[0].last_name,
              email: row.booking_passengers[0].email ?? "",
              phone: row.booking_passengers[0].phone,
            }
          : null,
      })),
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / pageSize),
    };
  },

  async findUnassigned(page = 1, pageSize = 20): Promise<{
    bookings: Array<{ booking: BookingRow; firstLeg: { origin_code: string; destination_code: string; leg_date: string } | null; passenger: { first_name: string; last_name: string; email: string; phone: string | null } | null }>;
    totalCount: number;
    page: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * pageSize;
    const [totalCount, rows] = await Promise.all([
      db.bookings.count({
        where: {
          status: { notIn: ["cancelled", "completed"] },
          booking_legs: { some: { flight_id: null } },
        },
      }),
      db.bookings.findMany({
        where: {
          status: { notIn: ["cancelled", "completed"] },
          booking_legs: { some: { flight_id: null } },
        },
        skip: offset,
        take: pageSize,
        distinct: ["id"],
        include: {
          booking_legs: {
            where: { flight_id: null },
            select: { origin_code: true, destination_code: true, leg_date: true },
            take: 1,
          },
          booking_passengers: {
            select: { first_name: true, last_name: true, email: true, phone: true },
            orderBy: { id: "asc" },
            take: 1,
          },
        },
        orderBy: { created_at: "desc" },
      }),
    ]);
    return {
      bookings: rows.map((row) => ({
        booking: row as unknown as BookingRow,
        firstLeg: row.booking_legs[0]
          ? {
              origin_code: row.booking_legs[0].origin_code,
              destination_code: row.booking_legs[0].destination_code,
              leg_date: row.booking_legs[0].leg_date.toISOString().split("T")[0],
            }
          : null,
        passenger: row.booking_passengers[0]
          ? {
              first_name: row.booking_passengers[0].first_name,
              last_name: row.booking_passengers[0].last_name,
              email: row.booking_passengers[0].email ?? "",
              phone: row.booking_passengers[0].phone,
            }
          : null,
      })),
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / pageSize),
    };
  },

  async search(query: string, page = 1, pageSize = 20): Promise<{
    bookings: Array<{ booking: BookingRow; firstLeg: { origin_code: string; destination_code: string; leg_date: string; flight_id: number | null } | null; passenger: { first_name: string; last_name: string; email: string; phone: string | null } | null }>;
    totalCount: number;
    page: number;
    totalPages: number;
  }> {
    const pattern = `%${query}%`;
    const offset = (page - 1) * pageSize;
    // ILIKE search across booking_reference and passenger fields - use raw query for ILIKE support
    const [countResult, dataResult] = await Promise.all([
      db.$queryRawUnsafe(
        `SELECT COUNT(DISTINCT b.id) as cnt
         FROM bookings b
         LEFT JOIN booking_passengers p ON p.booking_id = b.id
         WHERE b.booking_reference ILIKE $1 OR p.first_name ILIKE $1 OR p.last_name ILIKE $1 OR p.email ILIKE $1 OR p.phone ILIKE $1`,
        pattern
      ) as Promise<Record<string, unknown>[]>,
      db.$queryRawUnsafe(
        `SELECT DISTINCT b.*, bl.origin_code, bl.destination_code, bl.leg_date, bl.flight_id,
                p.first_name AS passenger_first_name, p.last_name AS passenger_last_name,
                p.email AS passenger_email, p.phone AS passenger_phone
         FROM bookings b
         LEFT JOIN booking_legs bl ON bl.booking_id = b.id AND bl.leg_sequence = 1
         LEFT JOIN booking_passengers p ON p.booking_id = b.id
         WHERE b.booking_reference ILIKE $1 OR p.first_name ILIKE $1 OR p.last_name ILIKE $1 OR p.email ILIKE $1 OR p.phone ILIKE $1
         ORDER BY b.created_at DESC
         LIMIT $2 OFFSET $3`,
        pattern, pageSize, offset
      ) as Promise<Record<string, unknown>[]>,
    ]);
    const totalCount = Number((countResult[0] as { cnt: string | bigint })?.cnt ?? 0);
    return {
      bookings: dataResult.map((row: Record<string, unknown>) => ({
        booking: row as unknown as BookingRow,
        firstLeg: row.origin_code
          ? { origin_code: row.origin_code as string, destination_code: row.destination_code as string, leg_date: row.leg_date as string, flight_id: (row.flight_id as number) ?? null }
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

  async findByDateRange(startDate: string, endDate: string, page = 1, pageSize = 20): Promise<{
    bookings: Array<{ booking: BookingRow; firstLeg: { origin_code: string; destination_code: string; leg_date: string; flight_id: number | null } | null; passenger: { first_name: string; last_name: string; email: string; phone: string | null } | null }>;
    totalCount: number;
    page: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * pageSize;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const [totalCount, rows] = await Promise.all([
      db.bookings.count({
        where: {
          booking_legs: {
            some: {
              leg_date: { gte: start, lte: end },
            },
          },
        },
      }),
      db.bookings.findMany({
        where: {
          booking_legs: {
            some: {
              leg_date: { gte: start, lte: end },
            },
          },
        },
        skip: offset,
        take: pageSize,
        distinct: ["id"],
        include: {
          booking_legs: {
            where: { leg_date: { gte: start, lte: end } },
            select: { origin_code: true, destination_code: true, leg_date: true, flight_id: true },
            take: 1,
          },
          booking_passengers: {
            select: { first_name: true, last_name: true, email: true, phone: true },
            orderBy: { id: "asc" },
            take: 1,
          },
        },
        orderBy: { created_at: "desc" },
      }),
    ]);
    return {
      bookings: rows.map((row) => ({
        booking: row as unknown as BookingRow,
        firstLeg: row.booking_legs[0]
          ? {
              origin_code: row.booking_legs[0].origin_code,
              destination_code: row.booking_legs[0].destination_code,
              leg_date: row.booking_legs[0].leg_date.toISOString().split("T")[0],
              flight_id: row.booking_legs[0].flight_id,
            }
          : null,
        passenger: row.booking_passengers[0]
          ? {
              first_name: row.booking_passengers[0].first_name,
              last_name: row.booking_passengers[0].last_name,
              email: row.booking_passengers[0].email ?? "",
              phone: row.booking_passengers[0].phone,
            }
          : null,
      })),
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / pageSize),
    };
  },

  async findByUserIdAndDateRange(userId: number, startDate: string, endDate: string, page = 1, pageSize = 20): Promise<{
    bookings: Array<{ booking: BookingRow; firstLeg: { origin_code: string; destination_code: string; leg_date: string } | null }>;
    totalCount: number;
    page: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * pageSize;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const [totalCount, rows] = await Promise.all([
      db.bookings.count({
        where: {
          user_id: userId,
          booking_legs: {
            some: {
              leg_date: { gte: start, lte: end },
            },
          },
        },
      }),
      db.bookings.findMany({
        where: {
          user_id: userId,
          booking_legs: {
            some: {
              leg_date: { gte: start, lte: end },
            },
          },
        },
        skip: offset,
        take: pageSize,
        distinct: ["id"],
        include: {
          booking_legs: {
            where: { leg_date: { gte: start, lte: end } },
            select: { origin_code: true, destination_code: true, leg_date: true },
            take: 1,
          },
        },
        orderBy: { created_at: "desc" },
      }),
    ]);
    return {
      bookings: rows.map((row) => {
        const rowWithLegs = row as unknown as typeof row & { booking_legs: Array<{ origin_code: string; destination_code: string; leg_date: Date }> };
        return {
          booking: row as unknown as BookingRow,
          firstLeg: rowWithLegs.booking_legs[0]
            ? {
                origin_code: rowWithLegs.booking_legs[0].origin_code,
                destination_code: rowWithLegs.booking_legs[0].destination_code,
                leg_date: rowWithLegs.booking_legs[0].leg_date.toISOString().split("T")[0],
              }
            : null,
        };
      }),
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / pageSize),
    };
  },

  async findByFlightId(flightId: number): Promise<Array<{ booking: BookingRow; firstLeg: { origin_code: string; destination_code: string; leg_date: string } | null }>> {
    const rows = await db.bookings.findMany({
      where: {
        booking_legs: { some: { flight_id: flightId } },
      },
      include: {
        booking_legs: {
          select: { origin_code: true, destination_code: true, leg_date: true },
          take: 1,
        },
      },
      orderBy: { created_at: "desc" },
    });
    return rows.map((row) => ({
      booking: row as unknown as BookingRow,
      firstLeg: row.booking_legs[0]
        ? {
            origin_code: row.booking_legs[0].origin_code,
            destination_code: row.booking_legs[0].destination_code,
            leg_date: row.booking_legs[0].leg_date.toISOString().split("T")[0],
          }
        : null,
    }));
  },
  // ── Booking Information Surfacing methods ─────────────────────────────────────

  async getHoursInStatus(bookingId: number): Promise<number> {
    const result = await db.bookings.findUnique({
      where: { id: bookingId },
      select: { updated_at: true },
    });
    if (!result) return 0;
    const updatedAt = new Date(result.updated_at);
    const now = new Date();
    const diffMs = now.getTime() - updatedAt.getTime();
    return Math.round(diffMs / (1000 * 60 * 60));
  },

  async getDaysUntilDeparture(bookingId: number): Promise<number | null> {
    const earliestLeg = await db.booking_legs.findFirst({
      where: { booking_id: bookingId },
      orderBy: { leg_date: "asc" },
      select: { leg_date: true },
    });
    if (!earliestLeg) return null;
    const legDate = new Date(earliestLeg.leg_date);
    const now = new Date();
    // Zero out time components for date-only comparison
    const legDateOnly = new Date(legDate.getFullYear(), legDate.getMonth(), legDate.getDate());
    const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffMs = legDateOnly.getTime() - nowDateOnly.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  },

  async findNeedsAttention(page = 1, pageSize = 20): Promise<PaginatedResult> {
    const offset = (page - 1) * pageSize;

    const [countResult, dataResult] = await Promise.all([
      db.$queryRawUnsafe(
        `SELECT COUNT(*) as cnt FROM (
          SELECT b.id
          FROM bookings b
          WHERE
            -- Stuck (no update in > 48 hours) and not in a terminal state
            (b.updated_at < NOW() - INTERVAL '48 hours' AND b.status NOT IN ('cancelled', 'completed'))
            OR
            -- Overdue payments
            (b.payment_status = 'pending' AND b.payment_due_date IS NOT NULL AND b.payment_due_date < CURRENT_DATE)
            OR
            -- Approaching departure without flight assignment (upcoming bookings with no flight within 2 days)
            (b.status NOT IN ('cancelled', 'completed')
             AND EXISTS (
               SELECT 1 FROM booking_legs bl
               WHERE bl.booking_id = b.id
                 AND bl.flight_id IS NULL
                 AND bl.leg_date <= CURRENT_DATE + INTERVAL '2 days'
                 AND bl.leg_date >= CURRENT_DATE
             ))
            OR
            -- Recently cancelled (within last hour)
            (b.status = 'cancelled' AND b.cancelled_at IS NOT NULL AND b.cancelled_at >= NOW() - INTERVAL '1 hour')
        ) sub`
      ) as Promise<Record<string, unknown>[]>,
      db.$queryRawUnsafe(
        `SELECT DISTINCT b.*, bl.origin_code, bl.destination_code, bl.leg_date,
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
           -- Stuck (no update in > 48 hours) and not in a terminal state
           (b.updated_at < NOW() - INTERVAL '48 hours' AND b.status NOT IN ('cancelled', 'completed'))
           OR
           -- Overdue payments
           (b.payment_status = 'pending' AND b.payment_due_date IS NOT NULL AND b.payment_due_date < CURRENT_DATE)
           OR
           -- Approaching departure without flight assignment
           (b.status NOT IN ('cancelled', 'completed')
            AND EXISTS (
              SELECT 1 FROM booking_legs bl2
              WHERE bl2.booking_id = b.id
                AND bl2.flight_id IS NULL
                AND bl2.leg_date <= CURRENT_DATE + INTERVAL '2 days'
                AND bl2.leg_date >= CURRENT_DATE
            ))
           OR
           -- Recently cancelled
           (b.status = 'cancelled' AND b.cancelled_at IS NOT NULL AND b.cancelled_at >= NOW() - INTERVAL '1 hour')
         ORDER BY b.created_at DESC
         LIMIT $1 OFFSET $2`,
        pageSize, offset
      ) as Promise<Record<string, unknown>[]>,
    ]);

    const totalCount = Number((countResult[0] as { cnt: string | bigint })?.cnt ?? 0);
    return {
      bookings: dataResult.map((row: Record<string, unknown>) => ({
        booking: row as unknown as BookingRow,
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
      db.bookings.count(),
      db.bookings.count({
        where: { status: { notIn: ["completed", "cancelled"] } },
      }),
      db.bookings.count({
        where: { status: "completed" },
      }),
      db.bookings.count({
        where: { status: "cancelled" },
      }),
    ]);
    return { total, upcoming, completed, cancelled };
  },

  async findFlightsWithCapacity(): Promise<Array<{ id: number; flightNumber: string; route: string; availableSeats: number }>> {
    // Step 1: Fetch scheduled flights with aircraft info
    const flights = await db.flights.findMany({
      where: { status: "scheduled" },
      include: {
        aircraft: {
          select: { seat_count: true },
        },
      },
      orderBy: { departure_time: "asc" },
    });

    // Step 2: For each flight, count assigned passengers (non-cancelled bookings)
    const results = await Promise.all(
      flights.map(async (flight) => {
        const seatCount = flight.aircraft?.seat_count ?? 0;

        // Count distinct booking_passengers for this flight via booking_legs
        const assignedResult = await db.booking_legs.findMany({
          where: {
            flight_id: flight.id,
            booking: { status: { not: "cancelled" } },
          },
          select: {
            booking: {
              select: {
                booking_passengers: {
                  select: { id: true },
                },
              },
            },
          },
        });

        // Count unique passenger IDs across all booking legs for this flight
        const passengerIds = new Set<number>();
        for (const leg of assignedResult) {
          for (const p of leg.booking.booking_passengers) {
            passengerIds.add(p.id);
          }
        }
        const seatsTaken = passengerIds.size;
        const availableSeats = seatCount - seatsTaken;

        if (availableSeats <= 0) return null;

        const originCode = flight.origin_code ?? "";
        const destCode = flight.destination_code ?? "";
        return {
          id: flight.id,
          flightNumber: flight.flight_number,
          route: `${originCode} → ${destCode}`,
          availableSeats,
        };
      })
    );

    return results.filter((r): r is NonNullable<typeof r> => r !== null);
  },

  async findAgentPortfolio(agentUserId: number): Promise<ClientGroup[]> {
    const rows = await db.bookings.findMany({
      where: {
        booking_source: "booking_agent",
        created_by: agentUserId,
      },
      include: {
        booking_legs: {
          where: { leg_sequence: 1 },
          select: { origin_code: true, destination_code: true, leg_date: true },
          take: 1,
        },
        booking_passengers: {
          select: { first_name: true, last_name: true, email: true },
          orderBy: { id: "asc" },
          take: 1,
        },
      },
      orderBy: { created_at: "desc" },
    });

    // Sort in application code by passenger name (Prisma doesn't support ordering by nested relation fields in findMany)
    rows.sort((a, b) => {
      const aPassenger = (a as unknown as { booking_passengers: Array<{ first_name: string; last_name: string }> }).booking_passengers[0];
      const bPassenger = (b as unknown as { booking_passengers: Array<{ first_name: string; last_name: string }> }).booking_passengers[0];
      const aLastName = aPassenger?.last_name ?? "";
      const bLastName = bPassenger?.last_name ?? "";
      const lastNameCmp = aLastName.localeCompare(bLastName);
      if (lastNameCmp !== 0) return lastNameCmp;
      const aFirstName = aPassenger?.first_name ?? "";
      const bFirstName = bPassenger?.first_name ?? "";
      return aFirstName.localeCompare(bFirstName);
    });

    const groups = new Map<string, ClientGroup>();

    for (const row of rows) {
      const rowWithIncludes = row as unknown as {
        booking_passengers: Array<{ first_name: string; last_name: string; email: string }>;
        booking_legs: Array<{ origin_code: string; destination_code: string; leg_date: Date }>;
        payment_status: string;
      };
      const passenger = rowWithIncludes.booking_passengers[0];
      const firstName = passenger?.first_name ?? "";
      const lastName = passenger?.last_name ?? "";
      const clientEmail = passenger?.email ?? "";
      const clientName = `${firstName} ${lastName}`.trim() || "Unknown Client";

      const leg = rowWithIncludes.booking_legs[0];

      if (!groups.has(clientName)) {
        groups.set(clientName, {
          clientName,
          clientEmail,
          bookings: [],
        });
      }

      const group = groups.get(clientName)!;
      group.bookings.push({
        booking: row as unknown as BookingRow,
        firstLeg: leg
          ? { origin_code: leg.origin_code, destination_code: leg.destination_code, leg_date: leg.leg_date.toISOString().split("T")[0] }
          : null,
        paymentStatus: rowWithIncludes.payment_status ?? "pending",
      });
    }

    return Array.from(groups.values());
  },

  async findRecentActivity(agentUserId: number, limit = 20): Promise<ActivityItem[]> {
    // Calculate date 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Step 1: Fetch audit_log entries for bookings by this agent
    const auditRows = await db.audit_log.findMany({
      where: {
        entity_type: "booking",
        created_at: { gte: thirtyDaysAgo },
      },
      orderBy: { created_at: "desc" },
      take: limit,
    });

    if (auditRows.length === 0) return [];

    // Step 2: Collect unique booking IDs and fetch related bookings
    const bookingIds = [...new Set(auditRows.map((r) => r.entity_id).filter((id): id is number => id !== null))];

    const bookings = await db.bookings.findMany({
      where: {
        id: { in: bookingIds },
        booking_source: "booking_agent",
        created_by: agentUserId,
      },
      include: {
        booking_passengers: {
          select: { first_name: true, last_name: true },
          orderBy: { id: "asc" },
          take: 1,
        },
      },
    });

    // Step 3: Build a lookup map
    const bookingMap = new Map(bookings.map((b) => [b.id, b]));

    // Step 4: Filter audit rows to only those matching the agent's bookings, then map
    return auditRows
      .filter((row) => row.entity_id !== null && bookingMap.has(row.entity_id))
      .map((row) => {
        const action = row.action;
        const newValues = row.new_values as Record<string, unknown> | null;
        const booking = bookingMap.get(row.entity_id!);
        const passenger = booking?.booking_passengers[0];

        let type: ActivityItem["type"] = "status_change";
        let description = "";

        switch (action) {
          case "create":
            type = "new_booking";
            description = `Booking ${booking?.booking_reference ?? "N/A"} created`;
            break;
          case "cancel":
            type = "cancellation";
            description = `Booking ${booking?.booking_reference ?? "N/A"} cancelled`;
            break;
          case "payment":
            type = "payment";
            description = `Payment received for ${booking?.booking_reference ?? "N/A"}`;
            break;
          case "update_status":
            type = "status_change";
            description = newValues?.status
              ? `Status changed to ${newValues.status}`
              : `Booking ${booking?.booking_reference ?? "N/A"} updated`;
            break;
          default:
            description = `Booking ${booking?.booking_reference ?? "N/A"} ${action}`;
        }

        return {
          type,
          bookingRef: booking?.booking_reference ?? "",
          clientName: `${passenger?.first_name ?? ""} ${passenger?.last_name ?? ""}`.trim() || "Unknown",
          timestamp: row.created_at.toISOString(),
          description,
        };
      });
  },
};
