import { db } from "../db.server";
import { ScheduleStatus } from "../../../generated/prisma/client";

export interface ScheduleRow {
  id: number;
  schedule_date: string;
  status: string;
  notes: string | null;
  created_by: number | null;
  approved_by: number | null;
  approved_at: string | null;
  published_by: number | null;
  published_at: string | null;
  cancelled_by: number | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleWithStats extends ScheduleRow {
  flight_count: number;
  total_passengers: number;
  total_bookings: number;
}

export const scheduleRepository = {
  async findById(id: number): Promise<ScheduleRow | null> {
    const schedule = await db.schedules.findUnique({
      where: { id },
    });
    return (schedule as unknown as ScheduleRow) ?? null;
  },

  async findByDate(date: string): Promise<ScheduleRow | null> {
    // Compare by date range (UTC midnight to midnight) to avoid timezone
    // mismatch between local `new Date(date)` and UTC-stored timestamps.
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(start.getTime() + 86_400_000);
    const schedule = await db.schedules.findFirst({
      where: { schedule_date: { gte: start, lt: end } },
      orderBy: { created_at: "desc" },
    });
    return (schedule as unknown as ScheduleRow) ?? null;
  },

  async findByDateRange(startDate: string, endDate: string): Promise<ScheduleRow[]> {
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    end.setDate(end.getDate() + 1);
    const schedules = await db.schedules.findMany({
      where: { schedule_date: { gte: start, lt: end } },
      orderBy: { schedule_date: "desc" },
    });
    return schedules as unknown as ScheduleRow[];
  },

  async findByStatus(status: ScheduleStatus): Promise<ScheduleRow[]> {
    const schedules = await db.schedules.findMany({
      where: { status },
      orderBy: { schedule_date: "desc" },
    });
    return schedules as unknown as ScheduleRow[];
  },

  async create(data: {
    schedule_date: string;
    created_by: number;
    notes?: string | null;
  }): Promise<ScheduleRow> {
    const schedule = await db.schedules.create({
      data: {
        schedule_date: new Date(data.schedule_date),
        created_by: data.created_by,
        notes: data.notes ?? null,
      },
    });
    return schedule as unknown as ScheduleRow;
  },

  async updateStatus(
    id: number,
    status: ScheduleStatus,
    options?: {
      approved_by?: number;
      published_by?: number;
      cancelled_by?: number;
      cancellation_reason?: string;
    }
  ): Promise<void> {
    const data: Record<string, unknown> = {
      status,
    };

    if (status === "approved" && options?.approved_by !== undefined) {
      data.approved_by = options.approved_by;
      data.approved_at = new Date();
    }
    if (status === "published" && options?.published_by !== undefined) {
      data.published_by = options.published_by;
      data.published_at = new Date();
    }
    if (status === "cancelled") {
      if (options?.cancelled_by !== undefined) {
        data.cancelled_by = options.cancelled_by;
      }
      if (options?.cancellation_reason !== undefined) {
        data.cancellation_reason = options.cancellation_reason;
      }
      data.cancelled_at = new Date();
    }

    await db.schedules.update({
      where: { id },
      data,
    });
  },

  async updateNotes(id: number, notes: string): Promise<void> {
    await db.schedules.update({
      where: { id },
      data: { notes },
    });
  },

  async findUpcoming(limit = 10): Promise<ScheduleRow[]> {
    const schedules = await db.schedules.findMany({
      where: {
        schedule_date: { gte: new Date(new Date().toISOString().split("T")[0]) },
        status: { notIn: ["completed", "cancelled"] },
      },
      orderBy: { schedule_date: "asc" },
      take: limit,
    });
    return schedules as unknown as ScheduleRow[];
  },

  /**
   * Get schedule with aggregate statistics (flight count, passenger count, etc.).
   */
  async findWithStats(id: number): Promise<ScheduleWithStats | null> {
    const schedule = await db.schedules.findUnique({
      where: { id },
    });
    if (!schedule) return null;

    const [flightCount, bookingCount, passengerCount] = await Promise.all([
      db.flights.count({ where: { schedule_id: id } }),
      db.booking_legs.count({
        where: {
          flight: { schedule_id: id },
        },
      }),
      db.booking_leg_passengers.count({
        where: {
          booking_leg: {
            flight: { schedule_id: id },
          },
        },
      }),
    ]);

    return {
      ...schedule,
      flight_count: flightCount,
      total_passengers: passengerCount,
      total_bookings: bookingCount,
    } as unknown as ScheduleWithStats;
  },

  /**
   * Find schedules within a date range with stats.
   */
  async findRangeWithStats(startDate: string, endDate: string): Promise<ScheduleWithStats[]> {
    const schedules = await db.schedules.findMany({
      where: {
        schedule_date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      orderBy: { schedule_date: "desc" },
    });

    const schedulesWithStats = await Promise.all(
      schedules.map(async (schedule) => {
        const [flightCount, bookingCount, passengerCount] = await Promise.all([
          db.flights.count({ where: { schedule_id: schedule.id } }),
          db.booking_legs.count({
            where: { flight: { schedule_id: schedule.id } },
          }),
          db.booking_leg_passengers.count({
            where: {
              booking_leg: { flight: { schedule_id: schedule.id } },
            },
          }),
        ]);
        return {
          ...schedule,
          flight_count: flightCount,
          total_passengers: passengerCount,
          total_bookings: bookingCount,
        } as unknown as ScheduleWithStats;
      })
    );

    return schedulesWithStats;
  },

  /**
   * Create a schedule if one doesn't already exist for the given date.
   * Returns the existing schedule if one exists.
   */
  async findOrCreate(date: string, createdBy: number): Promise<ScheduleRow> {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(start.getTime() + 86_400_000);
    const existing = await db.schedules.findFirst({
      where: { schedule_date: { gte: start, lt: end } },
      orderBy: { created_at: "desc" },
    });
    if (existing) {
      return existing as unknown as ScheduleRow;
    }
    const schedule = await db.schedules.create({
      data: {
        schedule_date: start,
        created_by: createdBy,
        status: "draft" as ScheduleStatus,
      },
    });
    return schedule as unknown as ScheduleRow;
  },

  /**
   * Get the next N upcoming schedules with stats.
   */
  async findUpcomingWithStats(limit = 10): Promise<ScheduleWithStats[]> {
    const schedules = await db.schedules.findMany({
      where: {
        schedule_date: { gte: new Date(new Date().toDateString()) },
        status: { notIn: ["completed", "cancelled"] },
      },
      orderBy: { schedule_date: "asc" },
      take: limit,
    });

    const schedulesWithStats = await Promise.all(
      schedules.map(async (schedule) => {
        const [flightCount, bookingCount, passengerCount] = await Promise.all([
          db.flights.count({ where: { schedule_id: schedule.id } }),
          db.booking_legs.count({
            where: { flight: { schedule_id: schedule.id } },
          }),
          db.booking_leg_passengers.count({
            where: {
              booking_leg: { flight: { schedule_id: schedule.id } },
            },
          }),
        ]);
        return {
          ...schedule,
          flight_count: flightCount,
          total_passengers: passengerCount,
          total_bookings: bookingCount,
        } as unknown as ScheduleWithStats;
      })
    );

    return schedulesWithStats;
  },
};
