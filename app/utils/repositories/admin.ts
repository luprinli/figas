import { db } from "../db.server";
import {
  assignRole as pbacAssignRole,
  revokeRole as pbacRevokeRole,
  getUserRoles as pbacGetUserRoles,
} from "../permissions.server";
import { hashPassword } from "../password.server";

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

export const adminRepository = {
  async getDashboardStats(): Promise<DashboardStats> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalUsers, bookingsThisMonth, flightsThisMonth, activeAircraft, revenueResult] =
      await Promise.all([
        db.users.count(),
        db.bookings.count({
          where: { created_at: { gte: startOfMonth } },
        }),
        db.flights.count({
          where: { created_at: { gte: startOfMonth } },
        }),
        db.aircraft.count({
          where: { is_active: true },
        }),
        db.bookings.aggregate({
          _sum: { total_amount_gbp: true },
          where: {
            payment_status: "paid",
            created_at: { gte: startOfMonth },
          },
        }),
      ]);

    return {
      totalUsers,
      bookingsThisMonth,
      flightsThisMonth,
      activeAircraft,
      revenueThisMonth: Number(revenueResult._sum.total_amount_gbp ?? 0),
    };
  },

  async searchUsers(query?: string): Promise<UserRow[]> {
    if (!query) {
      return db.users.findMany({
        select: { id: true, name: true, email: true, role: true, is_active: true, created_at: true },
        orderBy: { created_at: "desc" },
        take: 100,
      }) as unknown as UserRow[];
    }
    return db.users.findMany({
      select: { id: true, name: true, email: true, role: true, is_active: true, created_at: true },
      where: {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: { created_at: "desc" },
      take: 100,
    }) as unknown as UserRow[];
  },

  async searchUsersPaginated(
    query: string | undefined,
    page: number,
    perPage: number
  ): Promise<{ rows: UserRow[]; totalCount: number }> {
    const offset = (page - 1) * perPage;
    if (!query) {
      const [totalCount, rows] = await Promise.all([
        db.users.count(),
        db.users.findMany({
          select: { id: true, name: true, email: true, role: true, is_active: true, created_at: true },
          orderBy: { created_at: "desc" },
          skip: offset,
          take: perPage,
        }),
      ]);
      return { rows: rows as unknown as UserRow[], totalCount };
    }
    const where = {
      OR: [
        { name: { contains: query, mode: "insensitive" as const } },
        { email: { contains: query, mode: "insensitive" as const } },
      ],
    };
    const [totalCount, rows] = await Promise.all([
      db.users.count({ where }),
      db.users.findMany({
        select: { id: true, name: true, email: true, role: true, is_active: true, created_at: true },
        where,
        orderBy: { created_at: "desc" },
        skip: offset,
        take: perPage,
      }),
    ]);
    return { rows: rows as unknown as UserRow[], totalCount };
  },

  async findUserById(id: number): Promise<UserRow | null> {
    const result = await db.users.findUnique({
      select: { id: true, name: true, email: true, role: true, is_active: true, created_at: true },
      where: { id },
    });
    return (result as unknown as UserRow) ?? null;
  },

  /**
   * Assign a role to a user. Delegates to permissions.server.ts assignRole().
   * Records audit log entry and validates actor permissions.
   */
  async assignRole(
    actorId: number,
    userId: number,
    roleId: number
  ): Promise<void> {
    await pbacAssignRole(actorId, userId, roleId);
  },

  /**
   * Remove a role from a user. Delegates to permissions.server.ts revokeRole().
   * Records audit log entry and validates actor permissions.
   */
  async revokeRole(
    actorId: number,
    userId: number,
    roleId: number
  ): Promise<void> {
    await pbacRevokeRole(actorId, userId, roleId);
  },

  /**
   * Get all roles for a user. Delegates to permissions.server.ts getUserRoles().
   */
  async getUserRoles(
    userId: number
  ): Promise<{ id: number; slug: string; name: string; hierarchyLevel: number }[]> {
    return pbacGetUserRoles(userId);
  },

  async updateUserStatus(
    userId: number,
    isActive: boolean
  ): Promise<void> {
    await db.users.update({
      where: { id: userId },
      data: { is_active: isActive, updated_at: new Date() },
    });
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
    const hashedPassword = await hashPassword(user.password);
    const result = await db.users.create({
      data: {
        name: user.name,
        email: user.email,
        password: hashedPassword,
        role: user.role ?? "passenger",
        date_of_birth: new Date(user.date_of_birth),
        clothed_body_weight_kg: user.clothed_body_weight_kg,
        residency_status: user.residency_status ?? "resident",
      },
      select: { id: true, name: true, email: true, role: true, is_active: true, created_at: true },
    });
    return result as unknown as UserRow;
  },

  async resetUserPassword(
    userId: number,
    hashedPassword: string
  ): Promise<void> {
    await db.users.update({
      where: { id: userId },
      data: { password: hashedPassword, updated_at: new Date() },
    });
  },

  async getAllAerodromes(): Promise<AerodromeRow[]> {
    return db.aerodromes.findMany({
      select: { id: true, code: true, name: true, is_active: true },
      orderBy: { name: "asc" },
    }) as unknown as AerodromeRow[];
  },

  async getAllAerodromesPaginated(
    page: number,
    perPage: number
  ): Promise<{ rows: AerodromeRow[]; totalCount: number }> {
    const offset = (page - 1) * perPage;
    const [totalCount, rows] = await Promise.all([
      db.aerodromes.count(),
      db.aerodromes.findMany({
        select: { id: true, code: true, name: true, is_active: true },
        orderBy: { name: "asc" },
        skip: offset,
        take: perPage,
      }),
    ]);
    return { rows: rows as unknown as AerodromeRow[], totalCount };
  },

  async findAerodromeById(id: number): Promise<AerodromeRow | null> {
    const result = await db.aerodromes.findUnique({
      select: { id: true, code: true, name: true, is_active: true },
      where: { id },
    });
    return (result as unknown as AerodromeRow) ?? null;
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
    const result = await db.aerodromes.create({
      data: {
        code: data.code,
        name: data.name,
        runway_length: data.runway_length ?? null,
        runway_type: data.runway_type ?? null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        timezone: data.timezone ?? "Atlantic/Stanley",
      },
      select: { id: true, code: true, name: true, is_active: true },
    });
    return result as unknown as AerodromeRow;
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
    await db.aerodromes.update({
      where: { id },
      data: { ...data, updated_at: new Date() },
    });
  },

  async toggleAerodromeActive(
    id: number,
    isActive: boolean
  ): Promise<void> {
    await db.aerodromes.update({
      where: { id },
      data: { is_active: isActive, updated_at: new Date() },
    });
  },

  async getAllAircraft(): Promise<AdminAircraftRow[]> {
    return db.aircraft.findMany({
      select: { id: true, registration: true, type: true, seat_count: true, is_active: true },
      orderBy: { registration: "asc" },
    }) as unknown as AdminAircraftRow[];
  },

  async getAllAircraftPaginated(
    page: number,
    perPage: number
  ): Promise<{ rows: AdminAircraftRow[]; totalCount: number }> {
    const offset = (page - 1) * perPage;
    const [totalCount, rows] = await Promise.all([
      db.aircraft.count(),
      db.aircraft.findMany({
        select: { id: true, registration: true, type: true, seat_count: true, is_active: true },
        orderBy: { registration: "asc" },
        skip: offset,
        take: perPage,
      }),
    ]);
    return { rows: rows as unknown as AdminAircraftRow[], totalCount };
  },

  async findAircraftById(id: number): Promise<AdminAircraftRow | null> {
    const result = await db.aircraft.findUnique({
      select: { id: true, registration: true, type: true, seat_count: true, is_active: true },
      where: { id },
    });
    return (result as unknown as AdminAircraftRow) ?? null;
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
    const result = await db.aircraft.create({
      data: {
        registration: data.registration,
        type: data.type ?? "BN-2 Islander",
        seat_count: data.seat_count ?? 9,
        empty_weight_kg: data.empty_weight_kg,
        max_takeoff_weight_kg: data.max_takeoff_weight_kg,
        max_payload_kg: data.max_payload_kg,
        fuel_capacity_kg: data.fuel_capacity_kg,
      },
      select: { id: true, registration: true, type: true, seat_count: true, is_active: true },
    });
    return result as unknown as AdminAircraftRow;
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
    await db.aircraft.update({
      where: { id },
      data: { ...data, updated_at: new Date() },
    });
  },

  async getAllFareRoutes(): Promise<FareRouteRow[]> {
    return db.fare_routes.findMany({
      select: { id: true, origin_code: true, destination_code: true, base_fare_gbp: true, is_active: true },
      orderBy: [{ origin_code: "asc" }, { destination_code: "asc" }],
    }) as unknown as FareRouteRow[];
  },

  async getAllFareRoutesPaginated(
    page: number,
    perPage: number
  ): Promise<{ rows: FareRouteRow[]; totalCount: number }> {
    const offset = (page - 1) * perPage;
    const [totalCount, rows] = await Promise.all([
      db.fare_routes.count(),
      db.fare_routes.findMany({
        select: { id: true, origin_code: true, destination_code: true, base_fare_gbp: true, is_active: true },
        orderBy: [{ origin_code: "asc" }, { destination_code: "asc" }],
        skip: offset,
        take: perPage,
      }),
    ]);
    return { rows: rows as unknown as FareRouteRow[], totalCount };
  },

  async findFareRouteById(id: number): Promise<FareRouteRow | null> {
    const result = await db.fare_routes.findUnique({
      select: { id: true, origin_code: true, destination_code: true, base_fare_gbp: true, is_active: true },
      where: { id },
    });
    return (result as unknown as FareRouteRow) ?? null;
  },

  async createFareRoute(data: {
    origin_code: string;
    destination_code: string;
    base_fare_gbp: number;
    currency?: string;
  }): Promise<FareRouteRow> {
    const result = await db.fare_routes.create({
      data: {
        origin_code: data.origin_code,
        destination_code: data.destination_code,
        base_fare_gbp: data.base_fare_gbp,
        base_fare: data.base_fare_gbp, // base_fare is required in Prisma schema
        currency: data.currency ?? "GBP",
      },
      select: { id: true, origin_code: true, destination_code: true, base_fare_gbp: true, is_active: true },
    });
    return result as unknown as FareRouteRow;
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
    const updateData: Record<string, unknown> = { ...data, updated_at: new Date() };
    // If base_fare_gbp is being updated, also update base_fare
    if (data.base_fare_gbp !== undefined) {
      updateData.base_fare = data.base_fare_gbp;
    }
    await db.fare_routes.update({
      where: { id },
      data: updateData,
    });
  },

  async getSettings(): Promise<Record<string, string>> {
    const rows = await db.system_settings.findMany({
      select: { key: true, value: true },
    });
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value ?? "";
    }
    return settings;
  },

  async updateSettings(
    settings: Record<string, string>
  ): Promise<void> {
    // system_settings table is managed by Prisma migrations, no need for inline DDL
    for (const [key, value] of Object.entries(settings)) {
      await db.system_settings.upsert({
        where: { key },
        create: { key, value },
        update: { value, updated_at: new Date() },
      });
    }
  },

  // ── Fuel Rules ──────────────────────────────────────────────────────────────

  async getAllFuelRulesPaginated(
    page: number,
    perPage: number
  ): Promise<{ rows: FuelRuleRow[]; totalCount: number }> {
    const offset = (page - 1) * perPage;
    const [totalCount, rows] = await Promise.all([
      db.fuel_rules.count(),
      db.fuel_rules.findMany({
        orderBy: [{ flight_time_minutes: "asc" }, { sectors: "asc" }],
        skip: offset,
        take: perPage,
      }),
    ]);
    return { rows: rows as unknown as FuelRuleRow[], totalCount };
  },

  async findFuelRuleById(id: number): Promise<FuelRuleRow | null> {
    const result = await db.fuel_rules.findUnique({
      where: { id },
    });
    return (result as unknown as FuelRuleRow) ?? null;
  },

  async createFuelRule(data: {
    flight_time_minutes: number;
    sectors: number;
    required_fuel_kg: number;
    minimum_fuel_kg: number;
    fuel_state: string;
  }): Promise<FuelRuleRow> {
    const result = await db.fuel_rules.create({
      data: {
        flight_time_minutes: data.flight_time_minutes,
        sectors: data.sectors,
        required_fuel_kg: data.required_fuel_kg,
        minimum_fuel_kg: data.minimum_fuel_kg,
        fuel_state: data.fuel_state,
      },
    });
    return result as unknown as FuelRuleRow;
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
    await db.fuel_rules.update({
      where: { id },
      data: { ...data, updated_at: new Date() },
    });
  },

  async deleteFuelRule(id: number): Promise<void> {
    await db.fuel_rules.delete({
      where: { id },
    });
  },

  // ── Aerodrome Distances ─────────────────────────────────────────────────────

  async getAllAerodromeDistancesPaginated(
    page: number,
    perPage: number
  ): Promise<{ rows: AerodromeDistanceRow[]; totalCount: number }> {
    const offset = (page - 1) * perPage;
    const [totalCount, rows] = await Promise.all([
      db.aerodrome_distances.count(),
      db.aerodrome_distances.findMany({
        orderBy: [{ origin_code: "asc" }, { destination_code: "asc" }],
        skip: offset,
        take: perPage,
      }),
    ]);
    return { rows: rows as unknown as AerodromeDistanceRow[], totalCount };
  },

  async findAerodromeDistanceById(id: number): Promise<AerodromeDistanceRow | null> {
    const result = await db.aerodrome_distances.findUnique({
      where: { id },
    });
    return (result as unknown as AerodromeDistanceRow) ?? null;
  },

  async createAerodromeDistance(data: {
    origin_code: string;
    destination_code: string;
    distance_nm: number;
  }): Promise<AerodromeDistanceRow> {
    const result = await db.aerodrome_distances.create({
      data: {
        origin_code: data.origin_code,
        destination_code: data.destination_code,
        distance_nm: data.distance_nm,
      },
    });
    return result as unknown as AerodromeDistanceRow;
  },

  async updateAerodromeDistance(
    id: number,
    data: Partial<{
      origin_code: string;
      destination_code: string;
      distance_nm: number;
    }>
  ): Promise<void> {
    await db.aerodrome_distances.update({
      where: { id },
      data: { ...data, updated_at: new Date() },
    });
  },

  async deleteAerodromeDistance(id: number): Promise<void> {
    await db.aerodrome_distances.delete({
      where: { id },
    });
  },

  // ── Aerodrome Headings ──────────────────────────────────────────────────────

  async getAllAerodromeHeadingsPaginated(
    page: number,
    perPage: number
  ): Promise<{ rows: AerodromeHeadingRow[]; totalCount: number }> {
    const offset = (page - 1) * perPage;
    const [totalCount, rows] = await Promise.all([
      db.aerodrome_headings.count(),
      db.aerodrome_headings.findMany({
        orderBy: [{ origin_code: "asc" }, { destination_code: "asc" }],
        skip: offset,
        take: perPage,
      }),
    ]);
    return { rows: rows as unknown as AerodromeHeadingRow[], totalCount };
  },

  async findAerodromeHeadingById(id: number): Promise<AerodromeHeadingRow | null> {
    const result = await db.aerodrome_headings.findUnique({
      where: { id },
    });
    return (result as unknown as AerodromeHeadingRow) ?? null;
  },

  async createAerodromeHeading(data: {
    origin_code: string;
    destination_code: string;
    heading_degrees: number;
  }): Promise<AerodromeHeadingRow> {
    const result = await db.aerodrome_headings.create({
      data: {
        origin_code: data.origin_code,
        destination_code: data.destination_code,
        heading_degrees: data.heading_degrees,
      },
    });
    return result as unknown as AerodromeHeadingRow;
  },

  async updateAerodromeHeading(
    id: number,
    data: Partial<{
      origin_code: string;
      destination_code: string;
      heading_degrees: number;
    }>
  ): Promise<void> {
    await db.aerodrome_headings.update({
      where: { id },
      data: { ...data, updated_at: new Date() },
    });
  },

  async deleteAerodromeHeading(id: number): Promise<void> {
    await db.aerodrome_headings.delete({
      where: { id },
    });
  },

  // ── Airframe Hours ──────────────────────────────────────────────────────────

  async getAllAirframeHoursPaginated(
    page: number,
    perPage: number
  ): Promise<{ rows: AirframeHourRow[]; totalCount: number }> {
    const offset = (page - 1) * perPage;
    const [totalCount, rows] = await Promise.all([
      db.airframe_hours.count(),
      db.airframe_hours.findMany({
        orderBy: [{ aircraft_id: "asc" }, { last_reading_date: "desc" }],
        skip: offset,
        take: perPage,
      }),
    ]);
    return { rows: rows as unknown as AirframeHourRow[], totalCount };
  },

  async findAirframeHourById(id: number): Promise<AirframeHourRow | null> {
    const result = await db.airframe_hours.findUnique({
      where: { id },
    });
    return (result as unknown as AirframeHourRow) ?? null;
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
    const result = await db.airframe_hours.create({
      data: {
        aircraft_id: data.aircraft_id,
        last_reading_date: new Date(data.last_reading_date),
        total_hours: data.total_hours,
        next_check_date: data.next_check_date ? new Date(data.next_check_date) : new Date(),
        next_check_type: data.next_check_type ?? 0,
        days_remaining: data.days_remaining ?? 0,
        next_check_due_hours: data.next_check_due_hours ?? "",
        hours_until_next_check: data.hours_until_next_check ?? "",
        next_500_hour_check: data.next_500_hour_check ?? "",
        hours_until_500_check: data.hours_until_500_check ?? "",
        next_1000_hour_check: data.next_1000_hour_check ?? "",
        hours_until_1000_check: data.hours_until_1000_check ?? "",
        status: data.status ?? "",
      },
    });
    return result as unknown as AirframeHourRow;
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
    const updateData: Record<string, unknown> = { ...data, updated_at: new Date() };
    // Convert date strings to Date objects
    if (data.last_reading_date !== undefined) {
      updateData.last_reading_date = new Date(data.last_reading_date);
    }
    if (data.next_check_date !== undefined) {
      updateData.next_check_date = data.next_check_date ? new Date(data.next_check_date) : null;
    }
    await db.airframe_hours.update({
      where: { id },
      data: updateData,
    });
  },

  async deleteAirframeHour(id: number): Promise<void> {
    await db.airframe_hours.delete({
      where: { id },
    });
  },
};
