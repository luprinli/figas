import { db } from "../db.server";

export interface BookingPassengerRow {
  id: number;
  booking_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  clothed_weight_kg: number | null;
  residency: string | null;
  special_requirements: string | null;
  created_at: string;
  updated_at: string;
}

export const bookingPassengerRepository = {
  async create(params: {
    booking_id: number;
    first_name: string;
    last_name: string;
    email?: string | null;
    phone?: string | null;
    date_of_birth?: string | null;
    clothed_weight_kg?: number | null;
    residency?: string | null;
    special_requirements?: string | null;
  }): Promise<BookingPassengerRow> {
    const passenger = await db.booking_passengers.create({
      data: {
        booking_id: params.booking_id,
        first_name: params.first_name,
        last_name: params.last_name,
        email: params.email ?? null,
        phone: params.phone ?? null,
        date_of_birth: params.date_of_birth ? new Date(params.date_of_birth) : null,
        clothed_body_weight_kg: params.clothed_weight_kg ?? undefined,
        residency_status: params.residency ?? null,
        special_requirements: params.special_requirements ?? null,
      },
    });
    return mapPassengerRow(passenger);
  },

  async findByBookingId(bookingId: number): Promise<BookingPassengerRow[]> {
    const passengers = await db.booking_passengers.findMany({
      where: { booking_id: bookingId },
      orderBy: { id: "asc" },
    });
    return passengers.map(mapPassengerRow);
  },

  async findById(id: number): Promise<BookingPassengerRow | null> {
    const passenger = await db.booking_passengers.findUnique({
      where: { id },
    });
    return passenger ? mapPassengerRow(passenger) : null;
  },

  async update(
    id: number,
    params: Partial<{
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      date_of_birth: string | null;
      clothed_weight_kg: number | null;
      residency: string | null;
      special_requirements: string | null;
    }>
  ): Promise<BookingPassengerRow> {
    const data: Record<string, unknown> = {};
    if (params.first_name !== undefined) data.first_name = params.first_name;
    if (params.last_name !== undefined) data.last_name = params.last_name;
    if (params.email !== undefined) data.email = params.email;
    if (params.phone !== undefined) data.phone = params.phone;
    if (params.date_of_birth !== undefined) data.date_of_birth = params.date_of_birth ? new Date(params.date_of_birth) : null;
    if (params.clothed_weight_kg !== undefined) data.clothed_body_weight_kg = params.clothed_weight_kg;
    if (params.residency !== undefined) data.residency_status = params.residency;
    if (params.special_requirements !== undefined) data.special_requirements = params.special_requirements;

    if (Object.keys(data).length === 0) {
      const existing = await this.findById(id);
      if (!existing) throw new Error(`BookingPassenger ${id} not found`);
      return existing;
    }

    const passenger = await db.booking_passengers.update({
      where: { id },
      data,
    });
    return mapPassengerRow(passenger);
  },

  async delete(id: number): Promise<void> {
    await db.booking_passengers.delete({ where: { id } });
  },

  async search(query: string, limit = 10): Promise<BookingPassengerRow[]> {
    const pattern = `%${query}%`;
    const passengers = await db.$queryRawUnsafe(
      `SELECT * FROM booking_passengers
       WHERE first_name ILIKE $1 OR last_name ILIKE $1 OR email ILIKE $1
       ORDER BY last_name, first_name
       LIMIT $2`,
      pattern,
      limit
    ) as Record<string, unknown>[];
    return passengers.map(mapPassengerRow);
  },

  async findRecent(limit = 10): Promise<BookingPassengerRow[]> {
    const passengers = await db.booking_passengers.findMany({
      orderBy: { created_at: "desc" },
      take: limit,
    });
    return passengers.map(mapPassengerRow);
  },
};

/**
 * Map a Prisma booking_passengers row to the legacy BookingPassengerRow interface.
 * Handles field name differences between the schema and the legacy interface.
 */
function mapPassengerRow(row: Record<string, unknown>): BookingPassengerRow {
  return {
    id: row.id as number,
    booking_id: row.booking_id as number,
    first_name: row.first_name as string,
    last_name: row.last_name as string,
    email: (row.email as string) ?? null,
    phone: (row.phone as string) ?? null,
    date_of_birth: row.date_of_birth
      ? (row.date_of_birth instanceof Date ? row.date_of_birth.toISOString().split("T")[0] : String(row.date_of_birth))
      : null,
    clothed_weight_kg: (row.clothed_body_weight_kg as number) ?? null,
    residency: (row.residency_status as string) ?? null,
    special_requirements: (row.special_requirements as string) ?? null,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}
