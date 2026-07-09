import { randomBytes } from "node:crypto";
import { db } from "../db.server";

export async function publishSchedule(scheduleId: number, publishedBy: number, amendmentNote?: string): Promise<{
  success: boolean;
  token?: string;
  version?: number;
  error?: string;
}> {
  const schedule = await db.schedules.findUnique({ where: { id: scheduleId } });
  if (!schedule) return { success: false, error: "Schedule not found" };

  const flights = await db.flights.findMany({
    where: { schedule_id: scheduleId },
    orderBy: { id: "asc" },
    include: {
      aircraft: { select: { type: true, registration: true } },
      pilot: { select: { name: true } },
    },
  });

  if (flights.length === 0) return { success: false, error: "No flights on this schedule" };

  // Check if already published
  const existing = await db.published_schedules.findFirst({
    where: { schedule_id: scheduleId, is_active: true },
    orderBy: { version: "desc" },
  });

  const nextVersion = existing ? existing.version + 1 : 1;
  const token = randomBytes(16).toString("hex");

  // Deactivate previous version
  if (existing) {
    await db.published_schedules.update({
      where: { id: existing.id },
      data: { is_active: false },
    });
  }

  const pub = await db.published_schedules.create({
    data: {
      schedule_id: scheduleId,
      public_token: token,
      version: nextVersion,
      published_by: publishedBy,
      amendment_note: amendmentNote ?? null,
    },
  });

  // Snapshot flights
  for (const f of flights) {
    const legCount = await db.flight_legs.count({ where: { flight_id: f.id } });
    await db.published_schedule_flights.create({
      data: {
        published_schedule_id: pub.id,
        flight_id: f.id,
        flight_number: f.flight_number,
        origin_code: f.origin_code,
        destination_code: f.destination_code,
        departure_time: f.departure_time,
        arrival_time: f.arrival_time,
        status: f.status,
        aircraft_type: f.aircraft?.type ?? null,
        aircraft_registration: f.aircraft?.registration ?? null,
        pilot_name: f.pilot?.name ?? null,
        stop_count: legCount,
      },
    });
  }

  // Queue notifications for passengers, agents, and subscribers
  await queuePublishNotifications(scheduleId, token, nextVersion);

  return { success: true, token, version: nextVersion };
}

async function queuePublishNotifications(scheduleId: number, token: string, version: number): Promise<void> {
  const date = await db.schedules.findUnique({ where: { id: scheduleId }, select: { schedule_date: true } });
  if (!date) return;

  // Query unique passenger emails for this schedule date
  const passengerEmails = await db.$queryRawUnsafe<{ email: string; user_id: number | null }[]>(
    `SELECT DISTINCT bp.email, bp.user_id
     FROM booking_passengers bp
     INNER JOIN booking_legs bl ON bl.booking_id = bp.booking_id
     INNER JOIN flights f ON f.id = bl.flight_id
     WHERE f.schedule_id = $1 AND bp.email IS NOT NULL`,
    scheduleId
  );

  const type = version === 1 ? "schedule_published" : "schedule_amended";

  for (const p of passengerEmails) {
    await db.notifications.create({
      data: {
        recipient_email: p.email,
        recipient_type: p.user_id ? "passenger" : "guest",
        notification_type: type,
        type,
        flight_id: null,
        booking_id: null,
        status: "pending",
      } as Record<string, unknown> as never,
    });
  }
}

export async function getPublicSchedule(token: string): Promise<{
  schedule: Record<string, unknown> | null;
  flights: Record<string, unknown>[];
  error?: string;
}> {
  const pub = await db.published_schedules.findFirst({
    where: { public_token: token, is_active: true },
  });

  if (!pub) return { schedule: null, flights: [], error: "Schedule not found or has been superseded" };

  const flights = await db.published_schedule_flights.findMany({
    where: { published_schedule_id: pub.id },
    orderBy: { departure_time: "asc" },
  });

  return {
    schedule: {
      version: pub.version,
      publishedAt: pub.published_at,
      isAmendment: pub.version > 1,
      amendmentNote: pub.amendment_note,
      disclaimerText: pub.disclaimer_text,
    },
    flights: flights.map((f) => ({
      flightNumber: f.flight_number,
      originCode: f.origin_code,
      destinationCode: f.destination_code,
      departureTime: f.departure_time,
      arrivalTime: f.arrival_time,
      status: f.status,
      aircraftType: f.aircraft_type,
      aircraftRegistration: f.aircraft_registration,
      pilotName: f.pilot_name,
      stopCount: f.stop_count,
    })),
  };
}
