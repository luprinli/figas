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
    aerodromeRows,
    userRows,
    orgRows,
    bookingRefRows,
    bookingStatusSourceRows,
    fareRows,
    aircraftRows,
    scheduleRows,
  ] = await Promise.all([
    db.$queryRawUnsafe<AerodromeRecord[]>(
      `SELECT code, name, city, is_active FROM aerodromes ORDER BY code`,
    ),
    db.$queryRawUnsafe<{ id: number; name: string; role: string; is_active: boolean; email: string }[]>(
      `SELECT id, name, role, is_active, email FROM users ORDER BY id`,
    ),
    db.$queryRawUnsafe<OrganizationRecord[]>(
      `SELECT id, name, is_active FROM organizations ORDER BY id`,
    ),
    db.$queryRawUnsafe<{ booking_reference: string }[]>(
      `SELECT booking_reference FROM bookings ORDER BY booking_reference`,
    ),
    db.$queryRawUnsafe<BookingStatusCount[]>(
      `SELECT status, booking_source, COUNT(*)::int AS count
       FROM bookings
       GROUP BY status, booking_source
       ORDER BY status, booking_source`,
    ),
    db.$queryRawUnsafe<FareRecord[]>(
      `SELECT origin_code, destination_code, base_fare_gbp::text AS base_fare_gbp, is_active
       FROM fare_routes
       ORDER BY origin_code, destination_code`,
    ),
    db.$queryRawUnsafe<AircraftRecord[]>(
      `SELECT registration, type, seat_count,
              max_takeoff_weight_kg::text AS mtow_kg, is_active
       FROM aircraft
       ORDER BY registration`,
    ),
    db.$queryRawUnsafe<ScheduleRecord[]>(
      `SELECT id, schedule_date::text AS schedule_date, status::text AS status
       FROM schedules
       ORDER BY schedule_date`,
    ),
  ]);

  const bookingRefs = bookingRefRows.map((r) => r.booking_reference);

  const output: AuditOutput = {
    timestamp: new Date().toISOString(),
    aerodromes: aerodromeRows,
    users: userRows.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      is_active: u.is_active,
      email_domain: extractDomain(u.email),
    })),
    organizations: orgRows,
    booking_references: bookingRefs,
    bookings_by_status_source: bookingStatusSourceRows,
    fares: fareRows,
    aircraft: aircraftRows,
    schedules: scheduleRows,
    counts: {
      aerodromes: aerodromeRows.length,
      users: userRows.length,
      organizations: orgRows.length,
      distinct_booking_references: bookingRefs.length,
      fares: fareRows.length,
      aircraft: aircraftRows.length,
      schedules: scheduleRows.length,
    },
  };

  console.log(JSON.stringify(output, null, 2));
  await db.$disconnect();
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
