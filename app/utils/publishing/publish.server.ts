/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomBytes } from "node:crypto";
import { kdb } from "../db.server.kysely";
import { sql } from "kysely";

export async function publishSchedule(scheduleId: number, publishedBy: number, amendmentNote?: string): Promise<{
  success: boolean;
  token?: string;
  version?: number;
  error?: string;
}> {
  const schedule = (await kdb.selectFrom("schedules").selectAll().where("id", "=", scheduleId).execute())[0] ?? null;
  if (!schedule) return { success: false, error: "Schedule not found" };

  const flights = await kdb.selectFrom("flights as f")
    .leftJoin("aircraft as a", "a.id", "f.aircraft_id")
    .leftJoin("pilots as p", "p.id", "f.pilot_id")
    .selectAll("f")
    .select(["a.type", "a.registration", "p.name"])
    .where("f.schedule_id", "=", scheduleId)
    .orderBy("f.id", "asc")
    .execute();

  if (flights.length === 0) return { success: false, error: "No flights on this schedule" };

  // Check if already published
  const existing = (await kdb.selectFrom("published_schedules")
    .selectAll()
    .where("schedule_id", "=", scheduleId)
    .where("is_active", "=", true)
    .orderBy("version", "desc")
    .limit(1)
    .execute())[0] ?? null;

  const nextVersion = existing ? existing.version + 1 : 1;
  const token = randomBytes(16).toString("hex");

  // Deactivate previous version
  if (existing) {
    await kdb.updateTable("published_schedules").set({ is_active: false } as any).where("id", "=", existing.id).execute();
  }

  const pub = (await kdb.insertInto("published_schedules").values({
    schedule_id: scheduleId,
    public_token: token,
    version: nextVersion,
    published_by: publishedBy,
    amendment_note: amendmentNote ?? null,
  } as any).returningAll().execute())[0];

  // Snapshot flights
  for (const f of flights) {
    // Snapshot the true STY \u2192 … \u2192 STY path from the ordered flight legs so the
    // public view shows the real route, not the flight-level STY↔STY round trip.
    const legs = await kdb.selectFrom("flight_legs")
      .select(["origin_code", "destination_code"])
      .where("flight_id", "=", f.id)
      .orderBy("leg_number", "asc")
      .execute();
    const routePath =
      legs.length > 0
        ? [legs[0].origin_code, ...legs.map((l) => l.destination_code)].join(" \u2192 ")
        : f.origin_code && f.destination_code
          ? `${f.origin_code} \u2192 ${f.destination_code}`
          : null;
    await kdb.insertInto("published_schedule_flights").values({
      published_schedule_id: pub.id,
      flight_id: f.id,
      flight_number: f.flight_number,
      origin_code: f.origin_code,
      destination_code: f.destination_code,
      departure_time: f.departure_time,
      arrival_time: f.arrival_time,
      status: f.status,
      aircraft_type: (f as any).type ?? null,
      aircraft_registration: (f as any).registration ?? null,
      pilot_name: (f as any).name ?? null,
      stop_count: legs.length,
      route_path: routePath,
    } as any).execute();
  }

  // Queue notifications for passengers, agents, and subscribers
  await queuePublishNotifications(scheduleId, token, nextVersion);

  // Dispatch queued notifications immediately (non-blocking)
  import("../email.server").then((m) => m.processPendingNotifications().catch(() => {}));

  return { success: true, token, version: nextVersion };
}

async function queuePublishNotifications(scheduleId: number, token: string, version: number): Promise<void> {
  const date = (await kdb.selectFrom("schedules").select("schedule_date").where("id", "=", scheduleId).execute())[0] ?? null;
  if (!date) return;

  // Query unique passenger emails for this schedule date
  const passengerEmailsResult = await sql<{ email: string; user_id: number | null }>`
    SELECT DISTINCT bp.email, bp.user_id
    FROM booking_passengers bp
    INNER JOIN booking_legs bl ON bl.booking_id = bp.booking_id
    INNER JOIN flights f ON f.id = bl.flight_id
    WHERE f.schedule_id = ${scheduleId} AND bp.email IS NOT NULL
  `.execute(kdb);
  const passengerEmails = passengerEmailsResult.rows;

  const type = version === 1 ? "schedule_published" : "schedule_amended";

  for (const p of passengerEmails) {
    await kdb.insertInto("notifications").values({
      recipient_email: p.email,
      recipient_type: p.user_id ? "passenger" : "guest",
      notification_type: type,
      type,
      flight_id: null,
      booking_id: null,
      status: "pending",
    } as any).execute();
  }
}

export async function getPublicSchedule(token: string): Promise<{
  schedule: Record<string, unknown> | null;
  flights: Record<string, unknown>[];
  error?: string;
}> {
  const pub = (await kdb.selectFrom("published_schedules")
    .selectAll()
    .where("public_token", "=", token)
    .where("is_active", "=", true)
    .execute())[0] ?? null;

  if (!pub) return { schedule: null, flights: [], error: "Schedule not found or has been superseded" };

  // Token expires 30 days after publication
  const publishedAt = pub.published_at ? new Date(String(pub.published_at)) : null;
  if (publishedAt) {
    const expiryDate = new Date(publishedAt);
    expiryDate.setDate(expiryDate.getDate() + 30);
    if (new Date() > expiryDate) {
      return { schedule: null, flights: [], error: "This schedule link has expired. Please request a new link." };
    }
  }

  const flights = await kdb.selectFrom("published_schedule_flights")
    .selectAll()
    .where("published_schedule_id", "=", pub.id)
    .orderBy("departure_time", "asc")
    .execute();

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
      routePath: f.route_path,
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
