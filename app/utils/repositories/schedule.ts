/* eslint-disable @typescript-eslint/no-explicit-any */
import { kdb } from "../db.server";
import { ScheduleStatus } from "../constants";

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

function toRow(r: unknown): ScheduleRow {
  const row = r as Record<string, unknown>;
  return {
    id: Number(row.id),
    schedule_date: String(row.schedule_date),
    status: String(row.status),
    notes: row.notes != null ? String(row.notes) : null,
    created_by: Number(row.created_by),
    approved_by: row.approved_by != null ? Number(row.approved_by) : null,
    approved_at: row.approved_at != null ? String(row.approved_at) : null,
    published_by: row.published_by != null ? Number(row.published_by) : null,
    published_at: row.published_at != null ? String(row.published_at) : null,
    cancelled_by: row.cancelled_by != null ? Number(row.cancelled_by) : null,
    cancelled_at: row.cancelled_at != null ? String(row.cancelled_at) : null,
    cancellation_reason: row.cancellation_reason != null ? String(row.cancellation_reason) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

async function fetchStats(scheduleId: number): Promise<{ flight_count: number; total_passengers: number; total_bookings: number }> {
  const [flightCountResult, bookingCountResult, passengerCountResult] = await Promise.all([
    kdb
      .selectFrom("flights")
      .select(kdb.fn.countAll<number>().as("cnt"))
      .where("schedule_id", "=", scheduleId)
      .execute(),
    kdb
      .selectFrom("booking_legs as bl")
      .innerJoin("flights as f", "f.id", "bl.flight_id")
      .select(kdb.fn.countAll<number>().as("cnt"))
      .where("f.schedule_id", "=", scheduleId)
      .execute(),
    kdb
      .selectFrom("booking_leg_passengers as blp")
      .innerJoin("booking_legs as bl", "bl.id", "blp.booking_leg_id")
      .innerJoin("flights as f", "f.id", "bl.flight_id")
      .select(kdb.fn.countAll<number>().as("cnt"))
      .where("f.schedule_id", "=", scheduleId)
      .execute(),
  ]);
  return {
    flight_count: Number(flightCountResult[0]?.cnt ?? 0),
    total_passengers: Number(passengerCountResult[0]?.cnt ?? 0),
    total_bookings: Number(bookingCountResult[0]?.cnt ?? 0),
  };
}

function toScheduleDateRange(startDate: string): [string, string] {
  const start = `${startDate}T00:00:00.000Z`;
  const startObj = new Date(start);
  const end = new Date(startObj.getTime() + 86_400_000).toISOString();
  return [start, end];
}

function toScheduleDateRangeEnd(startDate: string, endDate: string): [string, string] {
  const start = `${startDate}T00:00:00.000Z`;
  const endObj = new Date(`${endDate}T00:00:00.000Z`);
  endObj.setDate(endObj.getDate() + 1);
  return [start, endObj.toISOString()];
}

export const scheduleRepository = {
  async findById(id: number): Promise<ScheduleRow | null> {
    const rows = await kdb
      .selectFrom("schedules")
      .selectAll()
      .where("id", "=", id)
      .execute();
    return rows.length > 0 ? toRow(rows[0] as unknown) : null;
  },

  async findByDate(date: string): Promise<ScheduleRow | null> {
    const [start, end] = toScheduleDateRange(date);
    const rows = await kdb
      .selectFrom("schedules")
      .selectAll()
      .where("schedule_date", ">=", start)
      .where("schedule_date", "<", end)
      .orderBy("created_at", "desc")
      .limit(1)
      .execute();
    return rows.length > 0 ? toRow(rows[0] as unknown) : null;
  },

  async findByDateRange(startDate: string, endDate: string): Promise<ScheduleRow[]> {
    const [start, end] = toScheduleDateRangeEnd(startDate, endDate);
    const rows = await kdb
      .selectFrom("schedules")
      .selectAll()
      .where("schedule_date", ">=", start)
      .where("schedule_date", "<", end)
      .orderBy("schedule_date", "desc")
      .execute();
    return rows.map((r) => toRow(r as unknown));
  },

  async findByStatus(status: string): Promise<ScheduleRow[]> {
    const rows = await kdb
      .selectFrom("schedules")
      .selectAll()
      .where("status", "=", status)
      .orderBy("schedule_date", "desc")
      .execute();
    return rows.map((r) => toRow(r as unknown));
  },

  async create(data: {
    schedule_date: string;
    created_by: number;
    notes?: string | null;
  }): Promise<ScheduleRow> {
    const rows = await kdb
      .insertInto("schedules")
      .values({
        schedule_date: data.schedule_date,
        created_by: data.created_by,
        notes: data.notes ?? null,
      } as any)
      .returningAll()
      .execute();
    return toRow(rows[0] as unknown);
  },

  async updateStatus(
    id: number,
    status: string,
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
    const now = new Date().toISOString();

    if (status === ScheduleStatus.APPROVED && options?.approved_by !== undefined) {
      data.approved_by = options.approved_by;
      data.approved_at = now;
    }
    if (status === ScheduleStatus.PUBLISHED && options?.published_by !== undefined) {
      data.published_by = options.published_by;
      data.published_at = now;
    }
    if (status === ScheduleStatus.CANCELLED) {
      if (options?.cancelled_by !== undefined) {
        data.cancelled_by = options.cancelled_by;
      }
      if (options?.cancellation_reason !== undefined) {
        data.cancellation_reason = options.cancellation_reason;
      }
      data.cancelled_at = now;
    }

    await kdb
      .updateTable("schedules")
      .set(data as any)
      .where("id", "=", id)
      .execute();
  },

  async updateNotes(id: number, notes: string): Promise<void> {
    await kdb
      .updateTable("schedules")
      .set({ notes } as any)
      .where("id", "=", id)
      .execute();
  },

  async findUpcoming(limit = 10): Promise<ScheduleRow[]> {
    const today = new Date().toISOString().split("T")[0];
    const rows = await kdb
      .selectFrom("schedules")
      .selectAll()
      .where("schedule_date", ">=", today)
      .where("status", "not in", [ScheduleStatus.COMPLETED, ScheduleStatus.CANCELLED])
      .orderBy("schedule_date", "asc")
      .limit(limit)
      .execute();
    return rows.map((r) => toRow(r as unknown));
  },

  async findWithStats(id: number): Promise<ScheduleWithStats | null> {
    const rows = await kdb
      .selectFrom("schedules")
      .selectAll()
      .where("id", "=", id)
      .execute();
    if (rows.length === 0) return null;

    const schedule = toRow(rows[0] as unknown);
    const stats = await fetchStats(id);
    return { ...schedule, ...stats };
  },

  async findRangeWithStats(startDate: string, endDate: string): Promise<ScheduleWithStats[]> {
    const [start, end] = toScheduleDateRangeEnd(startDate, endDate);
    const rows = await kdb
      .selectFrom("schedules")
      .selectAll()
      .where("schedule_date", ">=", start)
      .where("schedule_date", "<=", end)
      .orderBy("schedule_date", "desc")
      .execute();

    const schedulesWithStats = await Promise.all(
      rows.map(async (row) => {
        const schedule = toRow(row as unknown);
        const stats = await fetchStats(schedule.id);
        return { ...schedule, ...stats } as ScheduleWithStats;
      })
    );
    return schedulesWithStats;
  },

  async findOrCreate(date: string, createdBy: number): Promise<ScheduleRow> {
    const [start, end] = toScheduleDateRange(date);
    const existingRows = await kdb
      .selectFrom("schedules")
      .selectAll()
      .where("schedule_date", ">=", start)
      .where("schedule_date", "<", end)
      .orderBy("created_at", "desc")
      .limit(1)
      .execute();
    if (existingRows.length > 0) {
      return toRow(existingRows[0] as unknown);
    }
    const rows = await kdb
      .insertInto("schedules")
      .values({
        schedule_date: start,
        created_by: createdBy,
        status: ScheduleStatus.DRAFT,
      } as any)
      .returningAll()
      .execute();
    return toRow(rows[0] as unknown);
  },

  async findUpcomingWithStats(limit = 10): Promise<ScheduleWithStats[]> {
    const today = new Date().toDateString();
    const rows = await kdb
      .selectFrom("schedules")
      .selectAll()
      .where("schedule_date", ">=", today)
      .where("status", "not in", [ScheduleStatus.COMPLETED, ScheduleStatus.CANCELLED])
      .orderBy("schedule_date", "asc")
      .limit(limit)
      .execute();

    const schedulesWithStats = await Promise.all(
      rows.map(async (row) => {
        const schedule = toRow(row as unknown);
        const stats = await fetchStats(schedule.id);
        return { ...schedule, ...stats } as ScheduleWithStats;
      })
    );
    return schedulesWithStats;
  },
};
