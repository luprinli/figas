import { kdb } from "../db.server";
import { sql } from "kysely";

export interface PilotAssignmentRow {
  id: number;
  schedule_id: number;
  flight_id: number;
  pilot_id: number;
  role: string;
  status: string;
  confirmed_at: string | null;
  declined_at: string | null;
  declined_reason: string | null;
  notes: string | null;
  assigned_by: number | null;
  created_at: string;
  updated_at: string;
}

function toRow(r: Record<string, unknown>): PilotAssignmentRow {
  return {
    id: Number(r.id),
    schedule_id: Number(r.schedule_id),
    flight_id: Number(r.flight_id),
    pilot_id: Number(r.pilot_id),
    role: String(r.role ?? ""),
    status: String(r.status ?? ""),
    confirmed_at: r.confirmed_at != null ? String(r.confirmed_at) : null,
    declined_at: r.declined_at != null ? String(r.declined_at) : null,
    declined_reason: r.declined_reason != null ? String(r.declined_reason) : null,
    notes: r.notes != null ? String(r.notes) : null,
    assigned_by: r.assigned_by != null ? Number(r.assigned_by) : null,
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

export const pilotAssignmentRepository = {
  async findById(id: number): Promise<PilotAssignmentRow | null> {
    const rows = await kdb
      .selectFrom("pilot_assignments")
      .selectAll()
      .where("id", "=", id)
      .execute();
    return rows.length > 0 ? toRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async findByScheduleId(scheduleId: number): Promise<PilotAssignmentRow[]> {
    const rows = await kdb
      .selectFrom("pilot_assignments")
      .selectAll()
      .where("schedule_id", "=", scheduleId)
      .orderBy(sql`flight_id asc, role asc`)
      .execute();
    return rows.map((r) => toRow(r as unknown as Record<string, unknown>));
  },

  async findByFlightId(flightId: number): Promise<PilotAssignmentRow[]> {
    const rows = await kdb
      .selectFrom("pilot_assignments")
      .selectAll()
      .where("flight_id", "=", flightId)
      .orderBy("role asc")
      .execute();
    return rows.map((r) => toRow(r as unknown as Record<string, unknown>));
  },

  async findByPilotId(pilotId: number): Promise<PilotAssignmentRow[]> {
    const rows = await kdb
      .selectFrom("pilot_assignments")
      .selectAll("pilot_assignments")
      .leftJoin("schedules", "schedules.id", "pilot_assignments.schedule_id")
      .where("pilot_assignments.pilot_id", "=", pilotId)
      .where("schedules.status", "not in", ["completed", "cancelled"])
      .orderBy("schedules.schedule_date desc")
      .execute();
    return rows.map((r) => toRow(r as unknown as Record<string, unknown>));
  },

  async create(data: {
    schedule_id: number;
    flight_id: number;
    pilot_id: number;
    role?: string;
    assigned_by?: number | null;
    notes?: string | null;
  }): Promise<PilotAssignmentRow> {
    const rows = await kdb
      .insertInto("pilot_assignments")
      .values({
        schedule_id: data.schedule_id,
        flight_id: data.flight_id,
        pilot_id: data.pilot_id,
        role: data.role ?? "captain",
        assigned_by: data.assigned_by ?? undefined,
        notes: data.notes ?? undefined,
      } as any)
      .returningAll()
      .execute();
    return toRow(rows[0] as unknown as Record<string, unknown>);
  },

  async updateStatus(
    id: number,
    status: string,
    options?: { declined_reason?: string }
  ): Promise<void> {
    const data: Record<string, unknown> = { status };

    if (status === "confirmed") {
      data.confirmed_at = sql`NOW()`;
    }
    if (status === "declined") {
      data.declined_at = sql`NOW()`;
      if (options?.declined_reason !== undefined) {
        data.declined_reason = options.declined_reason;
      }
    }

    await kdb
      .updateTable("pilot_assignments")
      .set(data as any)
      .where("id", "=", id)
      .execute();
  },

  async delete(id: number): Promise<void> {
    await kdb.deleteFrom("pilot_assignments").where("id", "=", id).execute();
  },

  async isPilotAvailable(
    pilotId: number,
    scheduleDate: string
  ): Promise<boolean> {
    const result = await kdb
      .selectFrom("pilot_assignments")
      .leftJoin("schedules", "schedules.id", "pilot_assignments.schedule_id")
      .where("pilot_assignments.pilot_id", "=", pilotId)
      .where("pilot_assignments.status", "!=", "declined")
      .where("schedules.schedule_date", "=", scheduleDate)
      .where("schedules.status", "not in", ["completed", "cancelled"])
      .select(kdb.fn.countAll<number>().as("count"))
      .execute();
    const count = Number(result[0]?.count ?? 0);
    return count === 0;
  },
};
