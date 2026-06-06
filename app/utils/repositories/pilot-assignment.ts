import { db } from "../db.server";
import type { PilotAssignmentRole, PilotAssignmentStatus } from "../../../generated/prisma/client";

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

export const pilotAssignmentRepository = {
  async findById(id: number): Promise<PilotAssignmentRow | null> {
    return db.pilot_assignments.findUnique({
      where: { id },
    }) as unknown as PilotAssignmentRow | null;
  },

  async findByScheduleId(scheduleId: number): Promise<PilotAssignmentRow[]> {
    return db.pilot_assignments.findMany({
      where: { schedule_id: scheduleId },
      orderBy: [{ flight_id: "asc" }, { role: "asc" }],
    }) as unknown as PilotAssignmentRow[];
  },

  async findByFlightId(flightId: number): Promise<PilotAssignmentRow[]> {
    return db.pilot_assignments.findMany({
      where: { flight_id: flightId },
      orderBy: { role: "asc" },
    }) as unknown as PilotAssignmentRow[];
  },

  async findByPilotId(pilotId: number): Promise<PilotAssignmentRow[]> {
    return db.pilot_assignments.findMany({
      where: {
        pilot_id: pilotId,
        schedule: {
          status: { notIn: ["completed", "cancelled"] },
        },
      },
      orderBy: { schedule: { schedule_date: "desc" } },
    }) as unknown as PilotAssignmentRow[];
  },

  async create(data: {
    schedule_id: number;
    flight_id: number;
    pilot_id: number;
    role?: string;
    assigned_by?: number | null;
    notes?: string | null;
  }): Promise<PilotAssignmentRow> {
    return db.pilot_assignments.create({
      data: {
        schedule_id: data.schedule_id,
        flight_id: data.flight_id,
        pilot_id: data.pilot_id,
        role: (data.role ?? "captain") as PilotAssignmentRole,
        assigned_by: data.assigned_by ?? null,
        notes: data.notes ?? null,
      },
    }) as unknown as PilotAssignmentRow;
  },

  async updateStatus(
    id: number,
    status: string,
    options?: { declined_reason?: string }
  ): Promise<void> {
    const data: Record<string, unknown> = {
      status: status as PilotAssignmentStatus,
    };

    if (status === "confirmed") {
      data.confirmed_at = new Date();
    }
    if (status === "declined") {
      data.declined_at = new Date();
      if (options?.declined_reason !== undefined) {
        data.declined_reason = options.declined_reason;
      }
    }

    await db.pilot_assignments.update({
      where: { id },
      data,
    });
  },

  async delete(id: number): Promise<void> {
    await db.pilot_assignments.delete({
      where: { id },
    });
  },

  async isPilotAvailable(
    pilotId: number,
    scheduleDate: string
  ): Promise<boolean> {
    const count = await db.pilot_assignments.count({
      where: {
        pilot_id: pilotId,
        status: { not: "declined" },
        schedule: {
          schedule_date: new Date(scheduleDate),
          status: { notIn: ["completed", "cancelled"] },
        },
      },
    });
    return count === 0;
  },
};
