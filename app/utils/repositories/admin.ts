import { kdb } from "../db.server";
import { sql } from "kysely";

export interface DashboardStats {
  totalUsers: number;
  bookingsThisMonth: number;
  flightsThisMonth: number;
  activeAircraft: number;
  revenueThisMonth: number;
}

export interface UserRow {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export interface AerodromeRow {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
}

export interface AdminAircraftRow {
  id: number;
  registration: string;
  type: string;
  seat_count: number;
  is_active: boolean;
}

export interface FareRouteRow {
  id: number;
  origin_code: string;
  destination_code: string;
  base_fare_gbp: number;
  is_active: boolean;
}

export interface SystemSettings {
  id: number;
  key: string;
  value: string | null;
  description: string | null;
}

export interface FuelRuleRow {
  id: number;
  flight_time_minutes: number;
  sectors: number;
  required_fuel_kg: string;
  minimum_fuel_kg: string;
  fuel_state: string;
  created_at: string;
  updated_at: string;
}

export interface AerodromeDistanceRow {
  id: number;
  origin_code: string;
  destination_code: string;
  distance_nm: string;
  created_at: string;
  updated_at: string;
}

export interface AerodromeHeadingRow {
  id: number;
  origin_code: string;
  destination_code: string;
  heading_degrees: string;
  created_at: string;
  updated_at: string;
}

export interface AirframeHourRow {
  id: number;
  aircraft_id: number;
  last_reading_date: string;
  total_hours: string;
  next_check_date: string | null;
  next_check_type: number | null;
  days_remaining: number | null;
  next_check_due_hours: string | null;
  hours_until_next_check: string | null;
  next_500_hour_check: string | null;
  hours_until_500_check: string | null;
  next_1000_hour_check: string | null;
  hours_until_1000_check: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
}

function toUserRow(r: Record<string, unknown>): UserRow {
  return {
    id: Number(r.id),
    name: String(r.name ?? ""),
    email: String(r.email ?? ""),
    role: String(r.role ?? ""),
    is_active: Boolean(r.is_active),
    created_at: String(r.created_at ?? ""),
  };
}

function toAerodromeRow(r: Record<string, unknown>): AerodromeRow {
  return {
    id: Number(r.id),
    code: String(r.code ?? ""),
    name: String(r.name ?? ""),
    is_active: Boolean(r.is_active),
  };
}

function toAircraftRow(r: Record<string, unknown>): AdminAircraftRow {
  return {
    id: Number(r.id),
    registration: String(r.registration ?? ""),
    type: String(r.type ?? ""),
    seat_count: Number(r.seat_count ?? 0),
    is_active: Boolean(r.is_active),
  };
}

function toFareRouteRow(r: Record<string, unknown>): FareRouteRow {
  return {
    id: Number(r.id),
    origin_code: String(r.origin_code ?? ""),
    destination_code: String(r.destination_code ?? ""),
    base_fare_gbp: Number(r.base_fare_gbp ?? 0),
    is_active: Boolean(r.is_active),
  };
}

function toFuelRuleRow(r: Record<string, unknown>): FuelRuleRow {
  return {
    id: Number(r.id),
    flight_time_minutes: Number(r.flight_time_minutes ?? 0),
    sectors: Number(r.sectors ?? 0),
    required_fuel_kg: String(r.required_fuel_kg ?? ""),
    minimum_fuel_kg: String(r.minimum_fuel_kg ?? ""),
    fuel_state: String(r.fuel_state ?? ""),
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

function toDistanceRow(r: Record<string, unknown>): AerodromeDistanceRow {
  return {
    id: Number(r.id),
    origin_code: String(r.origin_code ?? ""),
    destination_code: String(r.destination_code ?? ""),
    distance_nm: String(r.distance_nm ?? ""),
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

function toHeadingRow(r: Record<string, unknown>): AerodromeHeadingRow {
  return {
    id: Number(r.id),
    origin_code: String(r.origin_code ?? ""),
    destination_code: String(r.destination_code ?? ""),
    heading_degrees: String(r.heading_degrees ?? ""),
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

function toAirframeHourRow(r: Record<string, unknown>): AirframeHourRow {
  return {
    id: Number(r.id),
    aircraft_id: Number(r.aircraft_id ?? 0),
    last_reading_date: String(r.last_reading_date ?? ""),
    total_hours: String(r.total_hours ?? ""),
    next_check_date: r.next_check_date != null ? String(r.next_check_date) : null,
    next_check_type: r.next_check_type != null ? Number(r.next_check_type) : null,
    days_remaining: r.days_remaining != null ? Number(r.days_remaining) : null,
    next_check_due_hours: r.next_check_due_hours != null ? String(r.next_check_due_hours) : null,
    hours_until_next_check: r.hours_until_next_check != null ? String(r.hours_until_next_check) : null,
    next_500_hour_check: r.next_500_hour_check != null ? String(r.next_500_hour_check) : null,
    hours_until_500_check: r.hours_until_500_check != null ? String(r.hours_until_500_check) : null,
    next_1000_hour_check: r.next_1000_hour_check != null ? String(r.next_1000_hour_check) : null,
    hours_until_1000_check: r.hours_until_1000_check != null ? String(r.hours_until_1000_check) : null,
    status: r.status != null ? String(r.status) : null,
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

export const adminRepository = {
  async getDashboardStats(): Promise<DashboardStats> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [totalUsers, bookingsThisMonth, flightsThisMonth, activeAircraft, revenueResult] =
      await Promise.all([
        kdb.selectFrom("users").select(kdb.fn.countAll<number>().as("cnt")).execute(),
        kdb
          .selectFrom("bookings")
          .select(kdb.fn.countAll<number>().as("cnt"))
          .where("created_at", ">=", startOfMonth)
          .execute(),
        kdb
          .selectFrom("flights")
          .select(kdb.fn.countAll<number>().as("cnt"))
          .where("created_at", ">=", startOfMonth)
          .execute(),
        kdb
          .selectFrom("aircraft")
          .select(kdb.fn.countAll<number>().as("cnt"))
          .where("is_active", "=", true)
          .execute(),
        kdb
          .selectFrom("bookings")
          .select(kdb.fn.sum<string>("total_amount_gbp").as("total"))
          .where("payment_status", "=", "paid")
          .where("created_at", ">=", startOfMonth)
          .execute(),
      ]);

    return {
      totalUsers: Number(totalUsers[0]?.cnt ?? 0),
      bookingsThisMonth: Number(bookingsThisMonth[0]?.cnt ?? 0),
      flightsThisMonth: Number(flightsThisMonth[0]?.cnt ?? 0),
      activeAircraft: Number(activeAircraft[0]?.cnt ?? 0),
      revenueThisMonth: Number(revenueResult[0]?.total ?? 0),
    };
  },

  async searchUsers(query?: string): Promise<UserRow[]> {
    if (!query) {
      const rows = await kdb
        .selectFrom("users")
        .select(["id", "name", "email", "role", "is_active", "created_at"])
        .orderBy("created_at desc")
        .limit(100)
        .execute();
      return rows.map((r) => toUserRow(r as unknown as Record<string, unknown>));
    }
    const rows = await kdb
      .selectFrom("users")
      .select(["id", "name", "email", "role", "is_active", "created_at"])
      .where((eb) => eb.or([
        eb("name", "ilike", `%${query}%`),
        eb("email", "ilike", `%${query}%`),
      ]))
      .orderBy("created_at desc")
      .limit(100)
      .execute();
    return rows.map((r) => toUserRow(r as unknown as Record<string, unknown>));
  },

  async searchUsersPaginated(
    query: string | undefined,
    page: number,
    perPage: number
  ): Promise<{ rows: UserRow[]; totalCount: number }> {
    const offset = (page - 1) * perPage;
    if (!query) {
      const [totalCountResult, rows] = await Promise.all([
        kdb.selectFrom("users").select(kdb.fn.countAll<number>().as("cnt")).execute(),
        kdb
          .selectFrom("users")
          .select(["id", "name", "email", "role", "is_active", "created_at"])
          .orderBy("created_at desc")
          .offset(offset)
          .limit(perPage)
          .execute(),
      ]);
      return { rows: rows.map((r) => toUserRow(r as unknown as Record<string, unknown>)), totalCount: Number(totalCountResult[0]?.cnt ?? 0) };
    }
    const [totalCountResult, rows] = await Promise.all([
      kdb
        .selectFrom("users")
        .select(kdb.fn.countAll<number>().as("cnt"))
        .where((eb) => eb.or([
          eb("name", "ilike", `%${query}%`),
          eb("email", "ilike", `%${query}%`),
        ]))
        .execute(),
      kdb
        .selectFrom("users")
        .select(["id", "name", "email", "role", "is_active", "created_at"])
        .where((eb) => eb.or([
          eb("name", "ilike", `%${query}%`),
          eb("email", "ilike", `%${query}%`),
        ]))
        .orderBy("created_at desc")
        .offset(offset)
        .limit(perPage)
        .execute(),
    ]);
    return { rows: rows.map((r) => toUserRow(r as unknown as Record<string, unknown>)), totalCount: Number(totalCountResult[0]?.cnt ?? 0) };
  },

  async findUserById(id: number): Promise<UserRow | null> {
    const rows = await kdb
      .selectFrom("users")
      .select(["id", "name", "email", "role", "is_active", "created_at"])
      .where("id", "=", id)
      .execute();
    return rows.length > 0 ? toUserRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async assignRole(
    actorId: number,
    userId: number,
    roleId: number
  ): Promise<void> {
    const { assignRole: pbacAssignRole } = await import("../permissions.server");
    await pbacAssignRole(actorId, userId, roleId);
  },

  async revokeRole(
    actorId: number,
    userId: number,
    roleId: number
  ): Promise<void> {
    const { revokeRole: pbacRevokeRole } = await import("../permissions.server");
    await pbacRevokeRole(actorId, userId, roleId);
  },

  async getUserRoles(
    userId: number
  ): Promise<{ id: number; slug: string; name: string; hierarchyLevel: number }[]> {
    const { getUserRoles: pbacGetUserRoles } = await import("../permissions.server");
    return pbacGetUserRoles(userId);
  },

  async updateUserStatus(
    userId: number,
    isActive: boolean
  ): Promise<void> {
    const now = new Date().toISOString();
    await kdb
      .updateTable("users")
      .set({ is_active: isActive, updated_at: now } as any)
      .where("id", "=", userId)
      .execute();
  },

  async createUser(user: {
    name: string;
    email: string;
    password: string;
    role?: string;
    date_of_birth: string;
    clothed_body_weight_kg: number;
    residency_status?: string;
  }): Promise<UserRow> {
    const { hashPassword } = await import("../password.server");
    const hashedPassword = await hashPassword(user.password);
    const rows = await kdb
      .insertInto("users")
      .values({
        name: user.name,
        email: user.email,
        password: hashedPassword,
        role: user.role ?? "passenger",
        date_of_birth: user.date_of_birth,
        clothed_body_weight_kg: user.clothed_body_weight_kg,
        residency_status: user.residency_status ?? "resident",
      } as any)
      .returning(["id", "name", "email", "role", "is_active", "created_at"])
      .execute();
    return toUserRow(rows[0] as unknown as Record<string, unknown>);
  },

  async resetUserPassword(
    userId: number,
    hashedPassword: string
  ): Promise<void> {
    const now = new Date().toISOString();
    await kdb
      .updateTable("users")
      .set({ password: hashedPassword, updated_at: now } as any)
      .where("id", "=", userId)
      .execute();
  },

  async getAllAerodromes(): Promise<AerodromeRow[]> {
    const rows = await kdb
      .selectFrom("aerodromes")
      .select(["id", "code", "name", "is_active"])
      .orderBy("name asc")
      .execute();
    return rows.map((r) => toAerodromeRow(r as unknown as Record<string, unknown>));
  },

  async getAllAerodromesPaginated(
    page: number,
    perPage: number
  ): Promise<{ rows: AerodromeRow[]; totalCount: number }> {
    const offset = (page - 1) * perPage;
    const [totalCountResult, rows] = await Promise.all([
      kdb.selectFrom("aerodromes").select(kdb.fn.countAll<number>().as("cnt")).execute(),
      kdb
        .selectFrom("aerodromes")
        .select(["id", "code", "name", "is_active"])
        .orderBy("name asc")
        .offset(offset)
        .limit(perPage)
        .execute(),
    ]);
    return { rows: rows.map((r) => toAerodromeRow(r as unknown as Record<string, unknown>)), totalCount: Number(totalCountResult[0]?.cnt ?? 0) };
  },

  async findAerodromeById(id: number): Promise<AerodromeRow | null> {
    const rows = await kdb
      .selectFrom("aerodromes")
      .select(["id", "code", "name", "is_active"])
      .where("id", "=", id)
      .execute();
    return rows.length > 0 ? toAerodromeRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async createAerodrome(data: {
    code: string;
    name: string;
    runway_length?: number | null;
    runway_type?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    timezone?: string;
  }): Promise<AerodromeRow> {
    const rows = await kdb
      .insertInto("aerodromes")
      .values({
        code: data.code,
        name: data.name,
        runway_length: data.runway_length != null ? String(data.runway_length) : null,
        runway_type: data.runway_type ?? null,
        latitude: data.latitude != null ? String(data.latitude) : null,
        longitude: data.longitude != null ? String(data.longitude) : null,
        timezone: data.timezone ?? "Atlantic/Stanley",
      } as any)
      .returning(["id", "code", "name", "is_active"])
      .execute();
    return toAerodromeRow(rows[0] as unknown as Record<string, unknown>);
  },

  async updateAerodrome(
    id: number,
    data: Partial<{
      code: string;
      name: string;
      runway_length: number | null;
      runway_type: string | null;
      latitude: number | null;
      longitude: number | null;
      timezone: string;
    }>
  ): Promise<void> {
    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = { ...data, updated_at: now };
    if (data.runway_length !== undefined) {
      updateData.runway_length = data.runway_length != null ? String(data.runway_length) : null;
    }
    if (data.latitude !== undefined) {
      updateData.latitude = data.latitude != null ? String(data.latitude) : null;
    }
    if (data.longitude !== undefined) {
      updateData.longitude = data.longitude != null ? String(data.longitude) : null;
    }
    await kdb
      .updateTable("aerodromes")
      .set(updateData as any)
      .where("id", "=", id)
      .execute();
  },

  async toggleAerodromeActive(
    id: number,
    isActive: boolean
  ): Promise<void> {
    const now = new Date().toISOString();
    await kdb
      .updateTable("aerodromes")
      .set({ is_active: isActive, updated_at: now } as any)
      .where("id", "=", id)
      .execute();
  },

  async getAllAircraft(): Promise<AdminAircraftRow[]> {
    const rows = await kdb
      .selectFrom("aircraft")
      .select(["id", "registration", "type", "seat_count", "is_active"])
      .orderBy("registration asc")
      .execute();
    return rows.map((r) => toAircraftRow(r as unknown as Record<string, unknown>));
  },

  async getAllAircraftPaginated(
    page: number,
    perPage: number
  ): Promise<{ rows: AdminAircraftRow[]; totalCount: number }> {
    const offset = (page - 1) * perPage;
    const [totalCountResult, rows] = await Promise.all([
      kdb.selectFrom("aircraft").select(kdb.fn.countAll<number>().as("cnt")).execute(),
      kdb
        .selectFrom("aircraft")
        .select(["id", "registration", "type", "seat_count", "is_active"])
        .orderBy("registration asc")
        .offset(offset)
        .limit(perPage)
        .execute(),
    ]);
    return { rows: rows.map((r) => toAircraftRow(r as unknown as Record<string, unknown>)), totalCount: Number(totalCountResult[0]?.cnt ?? 0) };
  },

  async findAircraftById(id: number): Promise<AdminAircraftRow | null> {
    const rows = await kdb
      .selectFrom("aircraft")
      .select(["id", "registration", "type", "seat_count", "is_active"])
      .where("id", "=", id)
      .execute();
    return rows.length > 0 ? toAircraftRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async createAircraft(data: {
    registration: string;
    type?: string;
    seat_count?: number;
    empty_weight_kg: number;
    max_takeoff_weight_kg: number;
    max_payload_kg: number;
    fuel_capacity_kg: number;
  }): Promise<AdminAircraftRow> {
    const rows = await kdb
      .insertInto("aircraft")
      .values({
        registration: data.registration,
        type: data.type ?? "BN-2 Islander",
        seat_count: data.seat_count ?? 9,
        empty_weight_kg: String(data.empty_weight_kg),
        max_takeoff_weight_kg: String(data.max_takeoff_weight_kg),
        max_payload_kg: String(data.max_payload_kg),
        fuel_capacity_kg: String(data.fuel_capacity_kg),
      } as any)
      .returning(["id", "registration", "type", "seat_count", "is_active"])
      .execute();
    return toAircraftRow(rows[0] as unknown as Record<string, unknown>);
  },

  async updateAircraft(
    id: number,
    data: Partial<{
      registration: string;
      type: string;
      seat_count: number;
      empty_weight_kg: number;
      max_takeoff_weight_kg: number;
      max_payload_kg: number;
      fuel_capacity_kg: number;
      is_active: boolean;
    }>
  ): Promise<void> {
    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = { ...data, updated_at: now };
    if (data.empty_weight_kg !== undefined) updateData.empty_weight_kg = String(data.empty_weight_kg);
    if (data.max_takeoff_weight_kg !== undefined) updateData.max_takeoff_weight_kg = String(data.max_takeoff_weight_kg);
    if (data.max_payload_kg !== undefined) updateData.max_payload_kg = String(data.max_payload_kg);
    if (data.fuel_capacity_kg !== undefined) updateData.fuel_capacity_kg = String(data.fuel_capacity_kg);
    await kdb
      .updateTable("aircraft")
      .set(updateData as any)
      .where("id", "=", id)
      .execute();
  },

  async getAllFareRoutes(): Promise<FareRouteRow[]> {
    const rows = await kdb
      .selectFrom("fare_routes")
      .select(["id", "origin_code", "destination_code", "base_fare_gbp", "is_active"])
      .orderBy(sql`origin_code asc, destination_code asc`)
      .execute();
    return rows.map((r) => toFareRouteRow(r as unknown as Record<string, unknown>));
  },

  async getAllFareRoutesPaginated(
    page: number,
    perPage: number
  ): Promise<{ rows: FareRouteRow[]; totalCount: number }> {
    const offset = (page - 1) * perPage;
    const [totalCountResult, rows] = await Promise.all([
      kdb.selectFrom("fare_routes").select(kdb.fn.countAll<number>().as("cnt")).execute(),
      kdb
        .selectFrom("fare_routes")
        .select(["id", "origin_code", "destination_code", "base_fare_gbp", "is_active"])
        .orderBy(sql`origin_code asc, destination_code asc`)
        .offset(offset)
        .limit(perPage)
        .execute(),
    ]);
    return { rows: rows.map((r) => toFareRouteRow(r as unknown as Record<string, unknown>)), totalCount: Number(totalCountResult[0]?.cnt ?? 0) };
  },

  async findFareRouteById(id: number): Promise<FareRouteRow | null> {
    const rows = await kdb
      .selectFrom("fare_routes")
      .select(["id", "origin_code", "destination_code", "base_fare_gbp", "is_active"])
      .where("id", "=", id)
      .execute();
    return rows.length > 0 ? toFareRouteRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async createFareRoute(data: {
    origin_code: string;
    destination_code: string;
    base_fare_gbp: number;
    currency?: string;
  }): Promise<FareRouteRow> {
    const rows = await kdb
      .insertInto("fare_routes")
      .values({
        origin_code: data.origin_code,
        destination_code: data.destination_code,
        base_fare_gbp: String(data.base_fare_gbp),
        base_fare: String(data.base_fare_gbp),
        currency: data.currency ?? "GBP",
      } as any)
      .returning(["id", "origin_code", "destination_code", "base_fare_gbp", "is_active"])
      .execute();
    return toFareRouteRow(rows[0] as unknown as Record<string, unknown>);
  },

  async updateFareRoute(
    id: number,
    data: Partial<{
      origin_code: string;
      destination_code: string;
      base_fare_gbp: number;
      currency: string;
      is_active: boolean;
    }>
  ): Promise<void> {
    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = { ...data, updated_at: now };
    if (data.base_fare_gbp !== undefined) {
      updateData.base_fare = String(data.base_fare_gbp);
      updateData.base_fare_gbp = String(data.base_fare_gbp);
    }
    await kdb
      .updateTable("fare_routes")
      .set(updateData as any)
      .where("id", "=", id)
      .execute();
  },

  async getSettings(): Promise<Record<string, string>> {
    const rows = await kdb
      .selectFrom("system_settings")
      .select(["key", "value"])
      .execute();
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = String(row.value ?? "");
    }
    return settings;
  },

  async updateSettings(
    settings: Record<string, string>
  ): Promise<void> {
    const now = new Date().toISOString();
    for (const [key, value] of Object.entries(settings)) {
      const existing = await kdb
        .selectFrom("system_settings")
        .select("id")
        .where("key", "=", key)
        .execute();
      if (existing.length > 0) {
        await kdb
          .updateTable("system_settings")
          .set({ value, updated_at: now } as any)
          .where("key", "=", key)
          .execute();
      } else {
        await kdb
          .insertInto("system_settings")
          .values({ key, value } as any)
          .execute();
      }
    }
  },

  async getAllFuelRulesPaginated(
    page: number,
    perPage: number
  ): Promise<{ rows: FuelRuleRow[]; totalCount: number }> {
    const offset = (page - 1) * perPage;
    const [totalCountResult, rows] = await Promise.all([
      kdb.selectFrom("fuel_rules").select(kdb.fn.countAll<number>().as("cnt")).execute(),
      kdb
        .selectFrom("fuel_rules")
        .selectAll()
        .orderBy(sql`flight_time_minutes asc, sectors asc`)
        .offset(offset)
        .limit(perPage)
        .execute(),
    ]);
    return { rows: rows.map((r) => toFuelRuleRow(r as unknown as Record<string, unknown>)), totalCount: Number(totalCountResult[0]?.cnt ?? 0) };
  },

  async findFuelRuleById(id: number): Promise<FuelRuleRow | null> {
    const rows = await kdb
      .selectFrom("fuel_rules")
      .selectAll()
      .where("id", "=", id)
      .execute();
    return rows.length > 0 ? toFuelRuleRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async createFuelRule(data: {
    flight_time_minutes: number;
    sectors: number;
    required_fuel_kg: number;
    minimum_fuel_kg: number;
    fuel_state: string;
  }): Promise<FuelRuleRow> {
    const rows = await kdb
      .insertInto("fuel_rules")
      .values({
        flight_time_minutes: data.flight_time_minutes,
        sectors: data.sectors,
        required_fuel_kg: String(data.required_fuel_kg),
        minimum_fuel_kg: String(data.minimum_fuel_kg),
        fuel_state: data.fuel_state,
      } as any)
      .returningAll()
      .execute();
    return toFuelRuleRow(rows[0] as unknown as Record<string, unknown>);
  },

  async updateFuelRule(
    id: number,
    data: Partial<{
      flight_time_minutes: number;
      sectors: number;
      required_fuel_kg: number;
      minimum_fuel_kg: number;
      fuel_state: string;
    }>
  ): Promise<void> {
    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = { ...data, updated_at: now };
    if (data.required_fuel_kg !== undefined) updateData.required_fuel_kg = String(data.required_fuel_kg);
    if (data.minimum_fuel_kg !== undefined) updateData.minimum_fuel_kg = String(data.minimum_fuel_kg);
    await kdb
      .updateTable("fuel_rules")
      .set(updateData as any)
      .where("id", "=", id)
      .execute();
  },

  async deleteFuelRule(id: number): Promise<void> {
    await kdb
      .deleteFrom("fuel_rules")
      .where("id", "=", id)
      .execute();
  },

  async getAllAerodromeDistancesPaginated(
    page: number,
    perPage: number
  ): Promise<{ rows: AerodromeDistanceRow[]; totalCount: number }> {
    const offset = (page - 1) * perPage;
    const [totalCountResult, rows] = await Promise.all([
      kdb.selectFrom("aerodrome_distances").select(kdb.fn.countAll<number>().as("cnt")).execute(),
      kdb
        .selectFrom("aerodrome_distances")
        .selectAll()
        .orderBy(sql`origin_code asc, destination_code asc`)
        .offset(offset)
        .limit(perPage)
        .execute(),
    ]);
    return { rows: rows.map((r) => toDistanceRow(r as unknown as Record<string, unknown>)), totalCount: Number(totalCountResult[0]?.cnt ?? 0) };
  },

  async findAerodromeDistanceById(id: number): Promise<AerodromeDistanceRow | null> {
    const rows = await kdb
      .selectFrom("aerodrome_distances")
      .selectAll()
      .where("id", "=", id)
      .execute();
    return rows.length > 0 ? toDistanceRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async createAerodromeDistance(data: {
    origin_code: string;
    destination_code: string;
    distance_nm: number;
  }): Promise<AerodromeDistanceRow> {
    const rows = await kdb
      .insertInto("aerodrome_distances")
      .values({
        origin_code: data.origin_code,
        destination_code: data.destination_code,
        distance_nm: String(data.distance_nm),
      } as any)
      .returningAll()
      .execute();
    return toDistanceRow(rows[0] as unknown as Record<string, unknown>);
  },

  async updateAerodromeDistance(
    id: number,
    data: Partial<{
      origin_code: string;
      destination_code: string;
      distance_nm: number;
    }>
  ): Promise<void> {
    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = { ...data, updated_at: now };
    if (data.distance_nm !== undefined) updateData.distance_nm = String(data.distance_nm);
    await kdb
      .updateTable("aerodrome_distances")
      .set(updateData as any)
      .where("id", "=", id)
      .execute();
  },

  async deleteAerodromeDistance(id: number): Promise<void> {
    await kdb
      .deleteFrom("aerodrome_distances")
      .where("id", "=", id)
      .execute();
  },

  async getAllAerodromeHeadingsPaginated(
    page: number,
    perPage: number
  ): Promise<{ rows: AerodromeHeadingRow[]; totalCount: number }> {
    const offset = (page - 1) * perPage;
    const [totalCountResult, rows] = await Promise.all([
      kdb.selectFrom("aerodrome_headings").select(kdb.fn.countAll<number>().as("cnt")).execute(),
      kdb
        .selectFrom("aerodrome_headings")
        .selectAll()
        .orderBy(sql`origin_code asc, destination_code asc`)
        .offset(offset)
        .limit(perPage)
        .execute(),
    ]);
    return { rows: rows.map((r) => toHeadingRow(r as unknown as Record<string, unknown>)), totalCount: Number(totalCountResult[0]?.cnt ?? 0) };
  },

  async findAerodromeHeadingById(id: number): Promise<AerodromeHeadingRow | null> {
    const rows = await kdb
      .selectFrom("aerodrome_headings")
      .selectAll()
      .where("id", "=", id)
      .execute();
    return rows.length > 0 ? toHeadingRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async createAerodromeHeading(data: {
    origin_code: string;
    destination_code: string;
    heading_degrees: number;
  }): Promise<AerodromeHeadingRow> {
    const rows = await kdb
      .insertInto("aerodrome_headings")
      .values({
        origin_code: data.origin_code,
        destination_code: data.destination_code,
        heading_degrees: String(data.heading_degrees),
      } as any)
      .returningAll()
      .execute();
    return toHeadingRow(rows[0] as unknown as Record<string, unknown>);
  },

  async updateAerodromeHeading(
    id: number,
    data: Partial<{
      origin_code: string;
      destination_code: string;
      heading_degrees: number;
    }>
  ): Promise<void> {
    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = { ...data, updated_at: now };
    if (data.heading_degrees !== undefined) updateData.heading_degrees = String(data.heading_degrees);
    await kdb
      .updateTable("aerodrome_headings")
      .set(updateData as any)
      .where("id", "=", id)
      .execute();
  },

  async deleteAerodromeHeading(id: number): Promise<void> {
    await kdb
      .deleteFrom("aerodrome_headings")
      .where("id", "=", id)
      .execute();
  },

  async getAllAirframeHoursPaginated(
    page: number,
    perPage: number
  ): Promise<{ rows: AirframeHourRow[]; totalCount: number }> {
    const offset = (page - 1) * perPage;
    const [totalCountResult, rows] = await Promise.all([
      kdb.selectFrom("airframe_hours").select(kdb.fn.countAll<number>().as("cnt")).execute(),
      kdb
        .selectFrom("airframe_hours")
        .selectAll()
        .orderBy(sql`aircraft_id asc, last_reading_date desc`)
        .offset(offset)
        .limit(perPage)
        .execute(),
    ]);
    return { rows: rows.map((r) => toAirframeHourRow(r as unknown as Record<string, unknown>)), totalCount: Number(totalCountResult[0]?.cnt ?? 0) };
  },

  async findAirframeHourById(id: number): Promise<AirframeHourRow | null> {
    const rows = await kdb
      .selectFrom("airframe_hours")
      .selectAll()
      .where("id", "=", id)
      .execute();
    return rows.length > 0 ? toAirframeHourRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async createAirframeHour(data: {
    aircraft_id: number;
    last_reading_date: string;
    total_hours: string;
    next_check_date?: string | null;
    next_check_type?: number | null;
    days_remaining?: number | null;
    next_check_due_hours?: string | null;
    hours_until_next_check?: string | null;
    next_500_hour_check?: string | null;
    hours_until_500_check?: string | null;
    next_1000_hour_check?: string | null;
    hours_until_1000_check?: string | null;
    status?: string | null;
  }): Promise<AirframeHourRow> {
    const rows = await kdb
      .insertInto("airframe_hours")
      .values({
        aircraft_id: data.aircraft_id,
        last_reading_date: data.last_reading_date,
        total_hours: data.total_hours,
        next_check_date: data.next_check_date ?? new Date().toISOString(),
        next_check_type: data.next_check_type ?? 0,
        days_remaining: data.days_remaining ?? 0,
        next_check_due_hours: data.next_check_due_hours ?? "",
        hours_until_next_check: data.hours_until_next_check ?? "",
        next_500_hour_check: data.next_500_hour_check ?? "",
        hours_until_500_check: data.hours_until_500_check ?? "",
        next_1000_hour_check: data.next_1000_hour_check ?? "",
        hours_until_1000_check: data.hours_until_1000_check ?? "",
        status: data.status ?? "",
      } as any)
      .returningAll()
      .execute();
    return toAirframeHourRow(rows[0] as unknown as Record<string, unknown>);
  },

  async updateAirframeHour(
    id: number,
    data: Partial<{
      aircraft_id: number;
      last_reading_date: string;
      total_hours: string;
      next_check_date: string | null;
      next_check_type: number | null;
      days_remaining: number | null;
      next_check_due_hours: string | null;
      hours_until_next_check: string | null;
      next_500_hour_check: string | null;
      hours_until_500_check: string | null;
      next_1000_hour_check: string | null;
      hours_until_1000_check: string | null;
      status: string | null;
    }>
  ): Promise<void> {
    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = { ...data, updated_at: now };
    if (data.last_reading_date !== undefined) {
      updateData.last_reading_date = data.last_reading_date;
    }
    if (data.next_check_date !== undefined) {
      updateData.next_check_date = data.next_check_date ?? null;
    }
    await kdb
      .updateTable("airframe_hours")
      .set(updateData as any)
      .where("id", "=", id)
      .execute();
  },

  async deleteAirframeHour(id: number): Promise<void> {
    await kdb
      .deleteFrom("airframe_hours")
      .where("id", "=", id)
      .execute();
  },
};
