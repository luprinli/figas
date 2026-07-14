/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Booking Data Integrity Audit Script
 *
 * Audits all existing bookings in the database to verify correct data structure.
 * This is a diagnostic script only — it does NOT modify any data.
 *
 * Usage:
 *   node --env-file .env --import tsx prisma/audit-bookings.ts
 *   or: npx tsx prisma/audit-bookings.ts
 *
 * Output: JSON report to stdout with all findings.
 */

import { kdb } from "../app/utils/db.server";
import { sql } from "kysely";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditFinding {
  check: string;
  severity: "error" | "warning" | "info";
  table: string;
  ids: number[];
  description: string;
}

interface SummaryCounts {
  total_bookings: number;
  total_booking_legs: number;
  total_booking_passengers: number;
  total_booking_leg_passengers: number;
  assigned_legs: number;
  unassigned_legs: number;
  avg_passengers_per_booking: number;
  avg_legs_per_booking: number;
}

interface AuditReport {
  timestamp: string;
  summary: SummaryCounts;
  findings: AuditFinding[];
  issues_count: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pushFinding(
  findings: AuditFinding[],
  check: string,
  severity: "error" | "warning" | "info",
  table: string,
  ids: number[],
  description: string,
): void {
  findings.push({ check, severity, table, ids, description });
}

// ---------------------------------------------------------------------------
// Main Audit
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const findings: AuditFinding[] = [];

  const [
    totalBookingsResult,
    totalBookingLegsResult,
    totalBookingPassengersResult,
    totalBookingLegPassengersResult,
    assignedLegsResult,
    unassignedLegsResult,
  ] = await Promise.all([
    kdb.selectFrom("bookings").select(kdb.fn.countAll<number>().as("cnt")).executeTakeFirstOrThrow(),
    kdb.selectFrom("booking_legs").select(kdb.fn.countAll<number>().as("cnt")).executeTakeFirstOrThrow(),
    kdb.selectFrom("booking_passengers").select(kdb.fn.countAll<number>().as("cnt")).executeTakeFirstOrThrow(),
    kdb.selectFrom("booking_leg_passengers").select(kdb.fn.countAll<number>().as("cnt")).executeTakeFirstOrThrow(),
    kdb.selectFrom("booking_legs")
      .select(kdb.fn.countAll<number>().as("cnt"))
      .where("flight_id", "is not", null)
      .executeTakeFirstOrThrow(),
    kdb.selectFrom("booking_legs")
      .select(kdb.fn.countAll<number>().as("cnt"))
      .where("flight_id", "is", null)
      .executeTakeFirstOrThrow(),
  ]);

  const totalBookings = totalBookingsResult.cnt;
  const totalBookingLegs = totalBookingLegsResult.cnt;
  const totalBookingPassengers = totalBookingPassengersResult.cnt;
  const totalBookingLegPassengers = totalBookingLegPassengersResult.cnt;
  const assignedLegs = assignedLegsResult.cnt;
  const unassignedLegs = unassignedLegsResult.cnt;

  const avgPassengersPerBooking =
    totalBookings > 0
      ? Math.round((totalBookingPassengers / totalBookings) * 100) / 100
      : 0;

  const avgLegsPerBooking =
    totalBookings > 0
      ? Math.round((totalBookingLegs / totalBookings) * 100) / 100
      : 0;

  const summary: SummaryCounts = {
    total_bookings: totalBookings,
    total_booking_legs: totalBookingLegs,
    total_booking_passengers: totalBookingPassengers,
    total_booking_leg_passengers: totalBookingLegPassengers,
    assigned_legs: assignedLegs,
    unassigned_legs: unassignedLegs,
    avg_passengers_per_booking: avgPassengersPerBooking,
    avg_legs_per_booking: avgLegsPerBooking,
  };

  if (totalBookings === 0) {
    const report: AuditReport = {
      timestamp: new Date().toISOString(),
      summary,
      findings: [
        {
          check: "count_summary",
          severity: "info",
          table: "bookings",
          ids: [],
          description: "No bookings found in the database. Nothing to audit.",
        },
      ],
      issues_count: 0,
    };
    console.log(JSON.stringify(report, null, 2));
    await kdb.destroy();
    return;
  }

  // ── 1. Aggregated passenger-leg records ──────────────────────────────────

  const nullKeyRows = await sql`
    SELECT id, booking_leg_id, booking_passenger_id
    FROM booking_leg_passengers
    WHERE booking_leg_id IS NULL OR booking_passenger_id IS NULL
  `.execute(kdb) as any as { id: number; booking_leg_id: number | null; booking_passenger_id: number | null }[];

  if (nullKeyRows.length > 0) {
    pushFinding(
      findings,
      "aggregated_passenger_leg_records",
      "error",
      "booking_leg_passengers",
      nullKeyRows.map((r: any) => r.id),
      `Found ${nullKeyRows.length} booking_leg_passenger row(s) with NULL booking_leg_id or booking_passenger_id.`,
    );
  }

  const dupLegPassenger = await sql`
    SELECT booking_leg_id, booking_passenger_id, COUNT(*)::bigint AS cnt
    FROM booking_leg_passengers
    GROUP BY booking_leg_id, booking_passenger_id
    HAVING COUNT(*) > 1
  `.execute(kdb) as any as { booking_leg_id: number; booking_passenger_id: number; cnt: bigint }[];

  if (dupLegPassenger.length > 0) {
    pushFinding(
      findings,
      "aggregated_passenger_leg_records",
      "error",
      "booking_leg_passengers",
      dupLegPassenger.map((r: any) => r.booking_leg_id),
      `Found ${dupLegPassenger.length} duplicate (booking_leg_id, booking_passenger_id) group(s). Pairs: ${dupLegPassenger.map((r: any) => `(leg=${r.booking_leg_id}, pax=${r.booking_passenger_id}, count=${r.cnt})`).join("; ")}`,
    );
  }

  // ── 2. Orphan records ────────────────────────────────────────────────────

  const orphanBLPtoBL = await sql`
    SELECT blp.id, blp.booking_leg_id
    FROM booking_leg_passengers blp
    LEFT JOIN booking_legs bl ON bl.id = blp.booking_leg_id
    WHERE bl.id IS NULL
  `.execute(kdb) as any as { id: number; booking_leg_id: number }[];

  if (orphanBLPtoBL.length > 0) {
    pushFinding(
      findings,
      "orphan_records",
      "error",
      "booking_leg_passengers",
      orphanBLPtoBL.map((r: any) => r.id),
      `Found ${orphanBLPtoBL.length} booking_leg_passengers row(s) referencing non-existent booking_legs. booking_leg_ids: ${orphanBLPtoBL.map((r: any) => r.booking_leg_id).join(", ")}`,
    );
  }

  const orphanBLPtoBP = await sql`
    SELECT blp.id, blp.booking_passenger_id
    FROM booking_leg_passengers blp
    LEFT JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
    WHERE bp.id IS NULL
  `.execute(kdb) as any as { id: number; booking_passenger_id: number }[];

  if (orphanBLPtoBP.length > 0) {
    pushFinding(
      findings,
      "orphan_records",
      "error",
      "booking_leg_passengers",
      orphanBLPtoBP.map((r: any) => r.id),
      `Found ${orphanBLPtoBP.length} booking_leg_passengers row(s) referencing non-existent booking_passengers. booking_passenger_ids: ${orphanBLPtoBP.map((r: any) => r.booking_passenger_id).join(", ")}`,
    );
  }

  const orphanBLPtoFL = await sql`
    SELECT blp.id, blp.flight_leg_id
    FROM booking_leg_passengers blp
    LEFT JOIN flight_legs fl ON fl.id = blp.flight_leg_id
    WHERE blp.flight_leg_id IS NOT NULL AND fl.id IS NULL
  `.execute(kdb) as any as { id: number; flight_leg_id: number }[];

  if (orphanBLPtoFL.length > 0) {
    pushFinding(
      findings,
      "orphan_records",
      "error",
      "booking_leg_passengers",
      orphanBLPtoFL.map((r: any) => r.id),
      `Found ${orphanBLPtoFL.length} booking_leg_passengers row(s) referencing non-existent flight_legs. flight_leg_ids: ${orphanBLPtoFL.map((r: any) => r.flight_leg_id).join(", ")}`,
    );
  }

  const orphanBLtoB = await sql`
    SELECT bl.id, bl.booking_id
    FROM booking_legs bl
    LEFT JOIN bookings b ON b.id = bl.booking_id
    WHERE b.id IS NULL
  `.execute(kdb) as any as { id: number; booking_id: number }[];

  if (orphanBLtoB.length > 0) {
    pushFinding(
      findings,
      "orphan_records",
      "error",
      "booking_legs",
      orphanBLtoB.map((r: any) => r.id),
      `Found ${orphanBLtoB.length} booking_legs row(s) referencing non-existent bookings. booking_ids: ${orphanBLtoB.map((r: any) => r.booking_id).join(", ")}`,
    );
  }

  const orphanBPtoB = await sql`
    SELECT bp.id, bp.booking_id
    FROM booking_passengers bp
    LEFT JOIN bookings b ON b.id = bp.booking_id
    WHERE b.id IS NULL
  `.execute(kdb) as any as { id: number; booking_id: number }[];

  if (orphanBPtoB.length > 0) {
    pushFinding(
      findings,
      "orphan_records",
      "error",
      "booking_passengers",
      orphanBPtoB.map((r: any) => r.id),
      `Found ${orphanBPtoB.length} booking_passengers row(s) referencing non-existent bookings. booking_ids: ${orphanBPtoB.map((r: any) => r.booking_id).join(", ")}`,
    );
  }

  const orphanBLtoF = await sql`
    SELECT bl.id, bl.flight_id
    FROM booking_legs bl
    LEFT JOIN flights f ON f.id = bl.flight_id
    WHERE bl.flight_id IS NOT NULL AND f.id IS NULL
  `.execute(kdb) as any as { id: number; flight_id: number }[];

  if (orphanBLtoF.length > 0) {
    pushFinding(
      findings,
      "orphan_records",
      "error",
      "booking_legs",
      orphanBLtoF.map((r: any) => r.id),
      `Found ${orphanBLtoF.length} booking_legs row(s) referencing non-existent flights. flight_ids: ${orphanBLtoF.map((r: any) => r.flight_id).join(", ")}`,
    );
  }

  // ── 3. Duplicate key risks ──────────────────────────────────────────────

  const dupLegFlightLeg = await sql`
    SELECT booking_leg_id, flight_leg_id, COUNT(*)::bigint AS cnt
    FROM booking_leg_passengers
    WHERE flight_leg_id IS NOT NULL
    GROUP BY booking_leg_id, flight_leg_id
    HAVING COUNT(*) > 1
  `.execute(kdb) as any as { booking_leg_id: number; flight_leg_id: number; cnt: bigint }[];

  if (dupLegFlightLeg.length > 0) {
    pushFinding(
      findings,
      "duplicate_key_risks",
      "error",
      "booking_leg_passengers",
      dupLegFlightLeg.map((r: any) => r.booking_leg_id),
      `Found ${dupLegFlightLeg.length} duplicate (booking_leg_id, flight_leg_id) group(s). Pairs: ${dupLegFlightLeg.map((r: any) => `(leg=${r.booking_leg_id}, flight_leg=${r.flight_leg_id}, count=${r.cnt})`).join("; ")}`,
    );
  }

  const dupBookingRefs = await sql`
    SELECT booking_reference, COUNT(*)::bigint AS cnt
    FROM bookings
    GROUP BY booking_reference
    HAVING COUNT(*) > 1
  `.execute(kdb) as any as { booking_reference: string; cnt: bigint }[];

  if (dupBookingRefs.length > 0) {
    const refs = dupBookingRefs.map((r: any) => `'${r.booking_reference}'`).join(", ");
    const dupBookingIds = await sql`
      SELECT id FROM bookings WHERE booking_reference IN (${sql.raw(refs)})
    `.execute(kdb) as any as { id: number }[];

    pushFinding(
      findings,
      "duplicate_key_risks",
      "error",
      "bookings",
      dupBookingIds.map((r: any) => r.id),
      `Found ${dupBookingRefs.length} duplicate booking_reference(s): ${dupBookingRefs.map((r: any) => `${r.booking_reference} (${r.cnt}—)`).join(", ")}`,
    );
  }

  // ── 4. Unassigned vs assigned integrity ──────────────────────────────────

  const assignedLegsWithNoPassengers = await sql`
    SELECT bl.id, bl.booking_id
    FROM booking_legs bl
    WHERE bl.flight_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM booking_leg_passengers blp
        WHERE blp.booking_leg_id = bl.id
      )
  `.execute(kdb) as any as { id: number; booking_id: number }[];

  if (assignedLegsWithNoPassengers.length > 0) {
    pushFinding(
      findings,
      "assigned_vs_unassigned_integrity",
      "warning",
      "booking_legs",
      assignedLegsWithNoPassengers.map((r: any) => r.id),
      `Found ${assignedLegsWithNoPassengers.length} assigned booking_leg(s) (flight_id IS NOT NULL) that have zero booking_leg_passengers rows. Booking IDs: ${assignedLegsWithNoPassengers.map((r: any) => r.booking_id).join(", ")}`,
    );
  }

  const mismatchedPassengerBooking = await sql`
    SELECT blp.id AS blp_id, blp.booking_leg_id AS blp_booking_leg_id,
            blp.booking_passenger_id AS blp_passenger_id,
            bp.booking_id AS bp_booking_id, bl.booking_id AS bl_booking_id
    FROM booking_leg_passengers blp
    JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
    JOIN booking_legs bl ON bl.id = blp.booking_leg_id
    WHERE bp.booking_id != bl.booking_id
  `.execute(kdb) as any as { blp_id: number; blp_booking_leg_id: number; blp_passenger_id: number; bp_booking_id: number; bl_booking_id: number }[];

  if (mismatchedPassengerBooking.length > 0) {
    pushFinding(
      findings,
      "assigned_vs_unassigned_integrity",
      "error",
      "booking_leg_passengers",
      mismatchedPassengerBooking.map((r: any) => r.blp_id),
      `Found ${mismatchedPassengerBooking.length} booking_leg_passengers row(s) where the passenger's booking_id does not match the leg's booking_id.`,
    );
  }

  const unassignedMissingFields = await sql`
    SELECT id, booking_id,
            CASE
              WHEN origin_code IS NULL AND destination_code IS NULL AND leg_date IS NULL THEN 'origin,destination,date'
              WHEN origin_code IS NULL AND destination_code IS NULL THEN 'origin,destination'
              WHEN origin_code IS NULL AND leg_date IS NULL THEN 'origin,date'
              WHEN destination_code IS NULL AND leg_date IS NULL THEN 'destination,date'
              WHEN origin_code IS NULL THEN 'origin'
              WHEN destination_code IS NULL THEN 'destination'
              WHEN leg_date IS NULL THEN 'date'
            END AS missing_fields
    FROM booking_legs
    WHERE flight_id IS NULL
      AND (origin_code IS NULL OR destination_code IS NULL OR leg_date IS NULL)
  `.execute(kdb) as any as { id: number; booking_id: number; missing_fields: string }[];

  if (unassignedMissingFields.length > 0) {
    pushFinding(
      findings,
      "assigned_vs_unassigned_integrity",
      "warning",
      "booking_legs",
      unassignedMissingFields.map((r: any) => r.id),
      `Found ${unassignedMissingFields.length} unassigned booking_leg(s) with missing required fields (origin_code, destination_code, or leg_date).`,
    );
  }

  const mismatchedFlightLeg = await sql`
    SELECT blp.id AS blp_id, bl.flight_id AS bl_flight_id, fl.flight_id AS fl_flight_id
    FROM booking_leg_passengers blp
    JOIN booking_legs bl ON bl.id = blp.booking_leg_id
    JOIN flight_legs fl ON fl.id = blp.flight_leg_id
    WHERE bl.flight_id IS NOT NULL
      AND bl.flight_id != fl.flight_id
  `.execute(kdb) as any as { blp_id: number; bl_flight_id: number; fl_flight_id: number }[];

  if (mismatchedFlightLeg.length > 0) {
    pushFinding(
      findings,
      "assigned_vs_unassigned_integrity",
      "error",
      "booking_leg_passengers",
      mismatchedFlightLeg.map((r: any) => r.blp_id),
      `Found ${mismatchedFlightLeg.length} booking_leg_passengers row(s) where the flight_leg's flight_id does not match the booking_leg's flight_id.`,
    );
  }

  const legsWithNoPassengerLinks = await sql`
    SELECT bl.id, bl.booking_id, bl.flight_id
    FROM booking_legs bl
    WHERE NOT EXISTS (
      SELECT 1 FROM booking_leg_passengers blp
      WHERE blp.booking_leg_id = bl.id
    )
  `.execute(kdb) as any as { id: number; booking_id: number; flight_id: number | null }[];

  if (legsWithNoPassengerLinks.length > 0) {
    pushFinding(
      findings,
      "assigned_vs_unassigned_integrity",
      "warning",
      "booking_legs",
      legsWithNoPassengerLinks.map((r: any) => r.id),
      `Found ${legsWithNoPassengerLinks.length} booking_leg(s) with zero booking_leg_passengers rows.`,
    );
  }

  // ── 5. Additional integrity checks ─────────────────────────────────────

  const passengersWithNoLegs = await sql`
    SELECT bp.id, bp.booking_id, bp.first_name, bp.last_name
    FROM booking_passengers bp
    WHERE NOT EXISTS (
      SELECT 1 FROM booking_leg_passengers blp
      WHERE blp.booking_passenger_id = bp.id
    )
  `.execute(kdb) as any as { id: number; booking_id: number; first_name: string; last_name: string }[];

  if (passengersWithNoLegs.length > 0) {
    pushFinding(
      findings,
      "passenger_leg_coverage",
      "warning",
      "booking_passengers",
      passengersWithNoLegs.map((r: any) => r.id),
      `Found ${passengersWithNoLegs.length} booking_passenger(s) that are not linked to any booking_leg_passengers.`,
    );
  }

  const bookingsWithLegsNoPassengers = await sql`
    SELECT b.id, b.booking_reference
    FROM bookings b
    WHERE EXISTS (SELECT 1 FROM booking_legs bl WHERE bl.booking_id = b.id)
      AND NOT EXISTS (SELECT 1 FROM booking_passengers bp WHERE bp.booking_id = b.id)
  `.execute(kdb) as any as { id: number; booking_reference: string }[];

  if (bookingsWithLegsNoPassengers.length > 0) {
    pushFinding(
      findings,
      "booking_structure",
      "warning",
      "bookings",
      bookingsWithLegsNoPassengers.map((r: any) => r.id),
      `Found ${bookingsWithLegsNoPassengers.length} booking(s) that have legs but zero passengers. Refs: ${bookingsWithLegsNoPassengers.map((r: any) => r.booking_reference).join(", ")}`,
    );
  }

  const bookingsWithPassengersNoLegs = await sql`
    SELECT b.id, b.booking_reference
    FROM bookings b
    WHERE NOT EXISTS (SELECT 1 FROM booking_legs bl WHERE bl.booking_id = b.id)
      AND EXISTS (SELECT 1 FROM booking_passengers bp WHERE bp.booking_id = b.id)
  `.execute(kdb) as any as { id: number; booking_reference: string }[];

  if (bookingsWithPassengersNoLegs.length > 0) {
    pushFinding(
      findings,
      "booking_structure",
      "warning",
      "bookings",
      bookingsWithPassengersNoLegs.map((r: any) => r.id),
      `Found ${bookingsWithPassengersNoLegs.length} booking(s) that have passengers but zero legs. Refs: ${bookingsWithPassengersNoLegs.map((r: any) => r.booking_reference).join(", ")}`,
    );
  }

  const legSequenceIssues = await sql`
    WITH leg_sequences AS (
      SELECT booking_id, leg_sequence, COUNT(*) AS cnt
      FROM booking_legs
      GROUP BY booking_id, leg_sequence
    )
    SELECT booking_id,
            'duplicate_sequence' AS issue,
            string_agg(leg_sequence::text, ', ' ORDER BY leg_sequence) AS details
    FROM leg_sequences
    WHERE cnt > 1
    GROUP BY booking_id
  `.execute(kdb) as any as { booking_id: number; issue: string; details: string }[];

  if (legSequenceIssues.length > 0) {
    pushFinding(
      findings,
      "leg_sequence_integrity",
      "warning",
      "booking_legs",
      legSequenceIssues.map((r: any) => r.booking_id),
      `Found ${legSequenceIssues.length} booking(s) with duplicate leg_sequence values within the same booking.`,
    );
  }

  const report: AuditReport = {
    timestamp: new Date().toISOString(),
    summary,
    findings,
    issues_count: findings.filter((f) => f.severity === "error").length,
  };

  console.log(JSON.stringify(report, null, 2));
  await kdb.destroy();
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