import { kdb } from "../db.server.kysely";
import { sql } from "kysely";
import { MAX_PASSENGER_WEIGHT_KG, MIN_PASSENGER_WEIGHT_KG, MAX_PASSENGERS_PER_BOOKING } from "../constants";

export interface BookingPassengerRow {
  id: number;
  booking_id: number;
  user_id: number | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  clothed_weight_kg: number | null;
  residency: string | null;
  special_requirements: string | null;
  passport_number: string | null;
  id_document_number: string | null;
  nationality: string | null;
  created_at: string;
  updated_at: string;
}

function mapPassengerRow(row: Record<string, unknown>): BookingPassengerRow {
  return {
    id: Number(row.id),
    booking_id: Number(row.booking_id),
    user_id: row.user_id != null ? Number(row.user_id) : null,
    first_name: String(row.first_name ?? ""),
    last_name: String(row.last_name ?? ""),
    email: row.email != null ? String(row.email) : null,
    phone: row.phone != null ? String(row.phone) : null,
    date_of_birth: row.date_of_birth != null
      ? (row.date_of_birth instanceof Date ? (row.date_of_birth as Date).toISOString().split("T")[0] : String(row.date_of_birth))
      : null,
    clothed_weight_kg: row.clothed_body_weight_kg != null ? Number(row.clothed_body_weight_kg) : null,
    residency: row.residency_status != null ? String(row.residency_status) : null,
    special_requirements: row.special_requirements != null ? String(row.special_requirements) : null,
    passport_number: row.passport_number != null ? String(row.passport_number) : null,
    id_document_number: row.id_document_number != null ? String(row.id_document_number) : null,
    nationality: row.nationality != null ? String(row.nationality) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
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
    passenger_user_id?: number | null;
    }): Promise<BookingPassengerRow> {
      if (params.clothed_weight_kg != null) {
        if (params.clothed_weight_kg < MIN_PASSENGER_WEIGHT_KG) {
          throw new Error(`Passenger weight ${params.clothed_weight_kg}kg is below minimum ${MIN_PASSENGER_WEIGHT_KG}kg`);
        }
        if (params.clothed_weight_kg > MAX_PASSENGER_WEIGHT_KG) {
          throw new Error(`Passenger weight ${params.clothed_weight_kg}kg exceeds maximum ${MAX_PASSENGER_WEIGHT_KG}kg`);
        }
      }
      const countResult = await kdb
        .selectFrom("booking_passengers")
        .select(({ fn }) => [fn.countAll<number>().as("cnt")])
        .where("booking_id", "=", params.booking_id)
        .execute();
      if (Number(countResult[0]?.cnt ?? 0) >= MAX_PASSENGERS_PER_BOOKING) {
        throw new Error(`Booking ${params.booking_id} already has ${MAX_PASSENGERS_PER_BOOKING} passengers (maximum)`);
      }
      const rows = await kdb
      .insertInto("booking_passengers")
      .values({
        booking_id: params.booking_id,
        user_id: params.passenger_user_id ?? undefined,
        first_name: params.first_name,
        last_name: params.last_name,
        email: params.email ?? undefined,
        phone: params.phone ?? undefined,
        date_of_birth: params.date_of_birth ?? undefined,
        clothed_body_weight_kg: params.clothed_weight_kg ?? undefined,
        residency_status: params.residency ?? undefined,
        special_requirements: params.special_requirements ?? undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .returningAll()
      .execute();
    return mapPassengerRow(rows[0] as unknown as Record<string, unknown>);
  },

  async findByBookingId(bookingId: number): Promise<BookingPassengerRow[]> {
    const rows = await kdb
      .selectFrom("booking_passengers")
      .selectAll()
      .where("booking_id", "=", bookingId)
      .orderBy("id", "asc")
      .execute();
    return rows.map((r) => mapPassengerRow(r as unknown as Record<string, unknown>));
  },

  async findById(id: number): Promise<BookingPassengerRow | null> {
    const rows = await kdb
      .selectFrom("booking_passengers")
      .selectAll()
      .where("id", "=", id)
      .execute();
    return rows.length > 0 ? mapPassengerRow(rows[0] as unknown as Record<string, unknown>) : null;
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
    if (params.date_of_birth !== undefined) data.date_of_birth = params.date_of_birth ?? null;
    if (params.clothed_weight_kg !== undefined) data.clothed_body_weight_kg = params.clothed_weight_kg;
    if (params.residency !== undefined) data.residency_status = params.residency;
    if (params.special_requirements !== undefined) data.special_requirements = params.special_requirements;

    if (Object.keys(data).length === 0) {
      const existing = await bookingPassengerRepository.findById(id);
      if (!existing) throw new Error(`BookingPassenger ${id} not found`);
      return existing;
    }

    const rows = await kdb
      .updateTable("booking_passengers")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set(data as any)
      .where("id", "=", id)
      .returningAll()
      .execute();
    return mapPassengerRow(rows[0] as unknown as Record<string, unknown>);
  },

  async delete(id: number): Promise<void> {
    await kdb
      .deleteFrom("booking_passengers")
      .where("id", "=", id)
      .execute();
  },

  async search(query: string, limit = 10): Promise<BookingPassengerRow[]> {
    const pattern = `%${query}%`;
    const isNumeric = /^\d+$/.test(query.trim());
    const numericId = isNumeric ? parseInt(query.trim(), 10) : null;
    const result = await sql`
      SELECT * FROM booking_passengers
      WHERE first_name ILIKE ${pattern}
         OR last_name ILIKE ${pattern}
         OR email ILIKE ${pattern}
         OR passport_number ILIKE ${pattern}
         OR id_document_number ILIKE ${pattern}
         OR nationality ILIKE ${pattern}
         ${isNumeric ? sql`OR id = ${numericId}` : sql``}
      ORDER BY last_name, first_name
      LIMIT ${limit}
    `.execute(kdb);
    return (result.rows as Record<string, unknown>[]).map(mapPassengerRow);
  },

  async findRecent(limit = 10): Promise<BookingPassengerRow[]> {
    const rows = await kdb
      .selectFrom("booking_passengers")
      .selectAll()
      .orderBy("created_at desc")
      .limit(limit)
      .execute();
    return rows.map((r) => mapPassengerRow(r as unknown as Record<string, unknown>));
  },

  async updateWeightByLegPaxId(legPaxId: number, weightKg: number): Promise<void> {
    await sql`
      UPDATE booking_passengers SET clothed_body_weight_kg = ${weightKg}, updated_at = NOW()
      WHERE id = (SELECT booking_passenger_id FROM booking_leg_passengers WHERE id = ${legPaxId})
    `.execute(kdb);
  },
};
