/**
 * Comprehensive Database Audit Script
 *
 * Dumps a snapshot of all reference/lookup data, booking patterns,
 * and schedule status from the FIGAS database.
 *
 * Usage:
 *   node --env-file .env --import tsx prisma/audit-db.ts
 */

import { db } from "../app/utils/db.server";
import { sql } from "kysely";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AerodromeRecord {
  code: string;
  name: string;
  city: string | null;
  is_active: boolean;
}

interface UserRecord {
  id: number;
  name: string;
  role: string;
  is_active: boolean;
  email_domain: string;
}

interface OrganizationRecord {
  id: number;
  name: string;
  is_active: boolean;
}

interface FareRecord {
  origin_code: string;
  destination_code: string;
  base_fare_gbp: string;
  is_active: boolean;
}

interface AircraftRecord {
  registration: string;
  type: string;
  seat_count: number;
  mtow_kg: string | null;
  is_active: boolean;
}

interface ScheduleRecord {
  id: number;
  schedule_date: string;
  status: string;
}

interface BookingStatusCount {
  status: string;
  booking_source: string;
  count: number;
}

interface AuditOutput {
  timestamp: string;
  aerodromes: AerodromeRecord[];
  users: UserRecord[];
  organizations: OrganizationRecord[];
  booking_references: string[];
  bookings_by_status_source: BookingStatusCount[];
  fares: FareRecord[];
  aircraft: AircraftRecord[];
  schedules: ScheduleRecord[];
  counts: {
    aerodromes: number;
    users: number;
    organizations: number;
    distinct_booking_references: number;
    fares: number;
    aircraft: number;
    schedules: number;
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Run all queries in parallel where possible
  const [
    aerodromeResult,
    userResult,
    orgResult,
    bookingRefResult,
    bookingStatusSourceResult,
    fareResult,
    aircraftResult,
    scheduleResult,
  ] = await Promise.all([
    sql<AerodromeRecord>`SELECT code, name, city, is_active FROM aerodromes ORDER BY code`.execute(db),
    sql<{ id: number; name: string; role: string; is_active: boolean; email: string }>`SELECT id, name, role, is_active, email FROM users ORDER BY id`.execute(db),
    sql<OrganizationRecord>`SELECT id, name, is_active FROM organizations ORDER BY id`.execute(db),
    sql<{ booking_reference: string }>`SELECT booking_reference FROM bookings ORDER BY booking_reference`.execute(db),
    sql<BookingStatusCount>`SELECT status, booking_source, COUNT(*)::int AS count FROM bookings GROUP BY status, booking_source ORDER BY status, booking_source`.execute(db),
    sql<FareRecord>`SELECT origin_code, destination_code, base_fare_gbp::text AS base_fare_gbp, is_active FROM fare_routes ORDER BY origin_code, destination_code`.execute(db),
    sql<AircraftRecord>`SELECT registration, type, seat_count, max_takeoff_weight_kg::text AS mtow_kg, is_active FROM aircraft ORDER BY registration`.execute(db),
    sql<ScheduleRecord>`SELECT id, schedule_date::text AS schedule_date, status::text AS status FROM schedules ORDER BY schedule_date`.execute(db),
  ]);

  const bookingRefs = bookingRefResult.rows.map((r) => r.booking_reference);

  const output: AuditOutput = {
    timestamp: new Date().toISOString(),
    aerodromes: aerodromeResult.rows,
    users: userResult.rows.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      is_active: u.is_active,
      email_domain: extractDomain(u.email),
    })),
    organizations: orgResult.rows,
    booking_references: bookingRefs,
    bookings_by_status_source: bookingStatusSourceResult.rows,
    fares: fareResult.rows,
    aircraft: aircraftResult.rows,
    schedules: scheduleResult.rows,
    counts: {
      aerodromes: aerodromeResult.rows.length,
      users: userResult.rows.length,
      organizations: orgResult.rows.length,
      distinct_booking_references: bookingRefs.length,
      fares: fareResult.rows.length,
      aircraft: aircraftResult.rows.length,
      schedules: scheduleResult.rows.length,
    },
  };

  console.log(JSON.stringify(output, null, 2));
}

function extractDomain(email: string): string {
  const atIdx = email.lastIndexOf("@");
  return atIdx >= 0 ? email.slice(atIdx + 1) : email;
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      error: "Audit script execution failed",
      message: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
});
