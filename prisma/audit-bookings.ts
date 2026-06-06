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

import { db } from "../app/utils/db.server";

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

  // ── 5. Count Summary (run first so we can print partial progress) ────────

  const [
    totalBookings,
    totalBookingLegs,
    totalBookingPassengers,
    totalBookingLegPassengers,
    assignedLegs,
    unassignedLegs,
  ] = await Promise.all([
    db.bookings.count(),
    db.booking_legs.count(),
    db.booking_passengers.count(),
    db.booking_leg_passengers.count(),
    db.booking_legs.count({ where: { flight_id: { not: null } } }),
    db.booking_legs.count({ where: { flight_id: null } }),
  ]);

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

  // Early exit if there are no bookings at all
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
    await db.$disconnect();
    return;
  }

  // ── 1. Aggregated passenger-leg records ──────────────────────────────────

  // Each booking_leg_passenger row must represent exactly ONE passenger on
  // ONE leg. The schema enforces @@unique([booking_leg_id, booking_passenger_id]),
  // but we verify there are no rows violating this by checking for duplicate
  // (booking_leg_id, booking_passenger_id) pairs and NULL keys.

  const nullKeyRows = await db.$queryRawUnsafe<
    { id: number; booking_leg_id: number | null; booking_passenger_id: number | null }[]
  >(
    `SELECT id, booking_leg_id, booking_passenger_id
     FROM booking_leg_passengers
     WHERE booking_leg_id IS NULL OR booking_passenger_id IS NULL`,
  );

  if (nullKeyRows.length > 0) {
    pushFinding(
      findings,
      "aggregated_passenger_leg_records",
      "error",
      "booking_leg_passengers",
      nullKeyRows.map((r) => r.id),
      `Found ${nullKeyRows.length} booking_leg_passenger row(s) with NULL booking_leg_id or booking_passenger_id. Each row must reference exactly one leg and one passenger.`,
    );
  }

  // Check for duplicate (booking_leg_id, booking_passenger_id) — the unique
  // constraint should prevent this, but raw SQL or migration issues could
  // have bypassed it.
  const dupLegPassenger = await db.$queryRawUnsafe<
    { booking_leg_id: number; booking_passenger_id: number; cnt: bigint }[]
  >(
    `SELECT booking_leg_id, booking_passenger_id, COUNT(*)::bigint AS cnt
     FROM booking_leg_passengers
     GROUP BY booking_leg_id, booking_passenger_id
     HAVING COUNT(*) > 1`,
  );

  if (dupLegPassenger.length > 0) {
    pushFinding(
      findings,
      "aggregated_passenger_leg_records",
      "error",
      "booking_leg_passengers",
      dupLegPassenger.map((r) => r.booking_leg_id),
      `Found ${dupLegPassenger.length} duplicate (booking_leg_id, booking_passenger_id) group(s) with more than one row. Unique constraint is violated. Pairs: ${dupLegPassenger.map((r) => `(leg=${r.booking_leg_id}, pax=${r.booking_passenger_id}, count=${r.cnt})`).join("; ")}`,
    );
  }

  // ── 2. Orphan records ────────────────────────────────────────────────────

  // 2a. booking_leg_passengers → booking_legs
  const orphanBLPtoBL = await db.$queryRawUnsafe<
    { id: number; booking_leg_id: number }[]
  >(
    `SELECT blp.id, blp.booking_leg_id
     FROM booking_leg_passengers blp
     LEFT JOIN booking_legs bl ON bl.id = blp.booking_leg_id
     WHERE bl.id IS NULL`,
  );

  if (orphanBLPtoBL.length > 0) {
    pushFinding(
      findings,
      "orphan_records",
      "error",
      "booking_leg_passengers",
      orphanBLPtoBL.map((r) => r.id),
      `Found ${orphanBLPtoBL.length} booking_leg_passengers row(s) referencing non-existent booking_legs. booking_leg_ids: ${orphanBLPtoBL.map((r) => r.booking_leg_id).join(", ")}`,
    );
  }

  // 2b. booking_leg_passengers → booking_passengers
  const orphanBLPtoBP = await db.$queryRawUnsafe<
    { id: number; booking_passenger_id: number }[]
  >(
    `SELECT blp.id, blp.booking_passenger_id
     FROM booking_leg_passengers blp
     LEFT JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
     WHERE bp.id IS NULL`,
  );

  if (orphanBLPtoBP.length > 0) {
    pushFinding(
      findings,
      "orphan_records",
      "error",
      "booking_leg_passengers",
      orphanBLPtoBP.map((r) => r.id),
      `Found ${orphanBLPtoBP.length} booking_leg_passengers row(s) referencing non-existent booking_passengers. booking_passenger_ids: ${orphanBLPtoBP.map((r) => r.booking_passenger_id).join(", ")}`,
    );
  }

  // 2c. booking_leg_passengers → flight_legs (where flight_leg_id is not null)
  const orphanBLPtoFL = await db.$queryRawUnsafe<
    { id: number; flight_leg_id: number }[]
  >(
    `SELECT blp.id, blp.flight_leg_id
     FROM booking_leg_passengers blp
     LEFT JOIN flight_legs fl ON fl.id = blp.flight_leg_id
     WHERE blp.flight_leg_id IS NOT NULL AND fl.id IS NULL`,
  );

  if (orphanBLPtoFL.length > 0) {
    pushFinding(
      findings,
      "orphan_records",
      "error",
      "booking_leg_passengers",
      orphanBLPtoFL.map((r) => r.id),
      `Found ${orphanBLPtoFL.length} booking_leg_passengers row(s) referencing non-existent flight_legs. flight_leg_ids: ${orphanBLPtoFL.map((r) => r.flight_leg_id).join(", ")}`,
    );
  }

  // 2d. booking_legs → bookings
  const orphanBLtoB = await db.$queryRawUnsafe<
    { id: number; booking_id: number }[]
  >(
    `SELECT bl.id, bl.booking_id
     FROM booking_legs bl
     LEFT JOIN bookings b ON b.id = bl.booking_id
     WHERE b.id IS NULL`,
  );

  if (orphanBLtoB.length > 0) {
    pushFinding(
      findings,
      "orphan_records",
      "error",
      "booking_legs",
      orphanBLtoB.map((r) => r.id),
      `Found ${orphanBLtoB.length} booking_legs row(s) referencing non-existent bookings. booking_ids: ${orphanBLtoB.map((r) => r.booking_id).join(", ")}`,
    );
  }

  // 2e. booking_passengers → bookings
  const orphanBPtoB = await db.$queryRawUnsafe<
    { id: number; booking_id: number }[]
  >(
    `SELECT bp.id, bp.booking_id
     FROM booking_passengers bp
     LEFT JOIN bookings b ON b.id = bp.booking_id
     WHERE b.id IS NULL`,
  );

  if (orphanBPtoB.length > 0) {
    pushFinding(
      findings,
      "orphan_records",
      "error",
      "booking_passengers",
      orphanBPtoB.map((r) => r.id),
      `Found ${orphanBPtoB.length} booking_passengers row(s) referencing non-existent bookings. booking_ids: ${orphanBPtoB.map((r) => r.booking_id).join(", ")}`,
    );
  }

  // 2f. booking_legs → flights (where flight_id is not null)
  const orphanBLtoF = await db.$queryRawUnsafe<
    { id: number; flight_id: number }[]
  >(
    `SELECT bl.id, bl.flight_id
     FROM booking_legs bl
     LEFT JOIN flights f ON f.id = bl.flight_id
     WHERE bl.flight_id IS NOT NULL AND f.id IS NULL`,
  );

  if (orphanBLtoF.length > 0) {
    pushFinding(
      findings,
      "orphan_records",
      "error",
      "booking_legs",
      orphanBLtoF.map((r) => r.id),
      `Found ${orphanBLtoF.length} booking_legs row(s) referencing non-existent flights. flight_ids: ${orphanBLtoF.map((r) => r.flight_id).join(", ")}`,
    );
  }

  // ── 3. Duplicate key risks ──────────────────────────────────────────────

  // 3a. Check for duplicate booking_leg_id + flight_leg_id (unique constraint:
  //     @@unique([booking_leg_id, flight_leg_id]))
  const dupLegFlightLeg = await db.$queryRawUnsafe<
    { booking_leg_id: number; flight_leg_id: number; cnt: bigint }[]
  >(
    `SELECT booking_leg_id, flight_leg_id, COUNT(*)::bigint AS cnt
     FROM booking_leg_passengers
     WHERE flight_leg_id IS NOT NULL
     GROUP BY booking_leg_id, flight_leg_id
     HAVING COUNT(*) > 1`,
  );

  if (dupLegFlightLeg.length > 0) {
    pushFinding(
      findings,
      "duplicate_key_risks",
      "error",
      "booking_leg_passengers",
      dupLegFlightLeg.map((r) => r.booking_leg_id),
      `Found ${dupLegFlightLeg.length} duplicate (booking_leg_id, flight_leg_id) group(s). Unique constraint violated. Pairs: ${dupLegFlightLeg.map((r) => `(leg=${r.booking_leg_id}, flight_leg=${r.flight_leg_id}, count=${r.cnt})`).join("; ")}`,
    );
  }

  // 3b. Check for duplicate booking references
  const dupBookingRefs = await db.$queryRawUnsafe<
    { booking_reference: string; cnt: bigint }[]
  >(
    `SELECT booking_reference, COUNT(*)::bigint AS cnt
     FROM bookings
     GROUP BY booking_reference
     HAVING COUNT(*) > 1`,
  );

  if (dupBookingRefs.length > 0) {
    // Get the actual IDs for these duplicate references
    const refs = dupBookingRefs.map((r) => `'${r.booking_reference}'`).join(", ");
    const dupBookingIds = await db.$queryRawUnsafe<{ id: number }[]>(
      `SELECT id FROM bookings WHERE booking_reference IN (${refs})`,
    );

    pushFinding(
      findings,
      "duplicate_key_risks",
      "error",
      "bookings",
      dupBookingIds.map((r) => r.id),
      `Found ${dupBookingRefs.length} duplicate booking_reference(s): ${dupBookingRefs.map((r) => `${r.booking_reference} (${r.cnt}×)`).join(", ")}`,
    );
  }

  // ── 4. Unassigned vs assigned integrity ──────────────────────────────────

  // 4a. Assigned legs (flight_id IS NOT NULL) should have at least one
  //     booking_leg_passengers row for each passenger on the booking.
  //     We find booking_legs that are assigned but have zero passenger links.
  const assignedLegsWithNoPassengers = await db.$queryRawUnsafe<
    { id: number; booking_id: number }[]
  >(
    `SELECT bl.id, bl.booking_id
     FROM booking_legs bl
     WHERE bl.flight_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM booking_leg_passengers blp
         WHERE blp.booking_leg_id = bl.id
       )`,
  );

  if (assignedLegsWithNoPassengers.length > 0) {
    pushFinding(
      findings,
      "assigned_vs_unassigned_integrity",
      "warning",
      "booking_legs",
      assignedLegsWithNoPassengers.map((r) => r.id),
      `Found ${assignedLegsWithNoPassengers.length} assigned booking_leg(s) (flight_id IS NOT NULL) that have zero booking_leg_passengers rows. Booking IDs: ${assignedLegsWithNoPassengers.map((r) => r.booking_id).join(", ")}`,
    );
  }

  // 4b. Assigned legs: check that every booking_leg_passenger on an assigned
  //     leg has a matching booking_passenger that belongs to the same booking.
  const mismatchedPassengerBooking = await db.$queryRawUnsafe<
    {
      blp_id: number;
      blp_booking_leg_id: number;
      blp_passenger_id: number;
      bp_booking_id: number;
      bl_booking_id: number;
    }[]
  >(
    `SELECT blp.id AS blp_id, blp.booking_leg_id AS blp_booking_leg_id,
            blp.booking_passenger_id AS blp_passenger_id,
            bp.booking_id AS bp_booking_id, bl.booking_id AS bl_booking_id
     FROM booking_leg_passengers blp
     JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
     JOIN booking_legs bl ON bl.id = blp.booking_leg_id
     WHERE bp.booking_id != bl.booking_id`,
  );

  if (mismatchedPassengerBooking.length > 0) {
    pushFinding(
      findings,
      "assigned_vs_unassigned_integrity",
      "error",
      "booking_leg_passengers",
      mismatchedPassengerBooking.map((r) => r.blp_id),
      `Found ${mismatchedPassengerBooking.length} booking_leg_passengers row(s) where the passenger's booking_id does not match the leg's booking_id. This means a passenger from one booking is linked to a leg of a different booking.`,
    );
  }

  // 4c. Unassigned legs: check for structural issues. Unassigned legs (flight_id
  //     IS NULL) should still have valid origin/destination and date. We flag any
  //     unassigned legs missing origin_code or destination_code or leg_date.
  const unassignedMissingFields = await db.$queryRawUnsafe<
    { id: number; booking_id: number; missing_fields: string }[]
  >(
    `SELECT id, booking_id,
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
       AND (origin_code IS NULL OR destination_code IS NULL OR leg_date IS NULL)`,
  );

  if (unassignedMissingFields.length > 0) {
    pushFinding(
      findings,
      "assigned_vs_unassigned_integrity",
      "warning",
      "booking_legs",
      unassignedMissingFields.map((r) => r.id),
      `Found ${unassignedMissingFields.length} unassigned booking_leg(s) with missing required fields (origin_code, destination_code, or leg_date).`,
    );
  }

  // 4d. For assigned legs, check that all associated booking_leg_passengers
  //     with a flight_leg_id reference an actual flight_leg belonging to the
  //     same flight as the booking_leg's flight_id.
  const mismatchedFlightLeg = await db.$queryRawUnsafe<
    { blp_id: number; bl_flight_id: number; fl_flight_id: number }[]
  >(
    `SELECT blp.id AS blp_id, bl.flight_id AS bl_flight_id, fl.flight_id AS fl_flight_id
     FROM booking_leg_passengers blp
     JOIN booking_legs bl ON bl.id = blp.booking_leg_id
     JOIN flight_legs fl ON fl.id = blp.flight_leg_id
     WHERE bl.flight_id IS NOT NULL
       AND bl.flight_id != fl.flight_id`,
  );

  if (mismatchedFlightLeg.length > 0) {
    pushFinding(
      findings,
      "assigned_vs_unassigned_integrity",
      "error",
      "booking_leg_passengers",
      mismatchedFlightLeg.map((r) => r.blp_id),
      `Found ${mismatchedFlightLeg.length} booking_leg_passengers row(s) where the flight_leg's flight_id does not match the booking_leg's flight_id. The flight_leg belongs to a different flight than the leg is assigned to.`,
    );
  }

  // 4e. Booking legs without any passenger records at all (both assigned and
  //     unassigned) — flag as warning.
  const legsWithNoPassengerLinks = await db.$queryRawUnsafe<
    { id: number; booking_id: number; flight_id: number | null }[]
  >(
    `SELECT bl.id, bl.booking_id, bl.flight_id
     FROM booking_legs bl
     WHERE NOT EXISTS (
       SELECT 1 FROM booking_leg_passengers blp
       WHERE blp.booking_leg_id = bl.id
     )`,
  );

  if (legsWithNoPassengerLinks.length > 0) {
    pushFinding(
      findings,
      "assigned_vs_unassigned_integrity",
      "warning",
      "booking_legs",
      legsWithNoPassengerLinks.map((r) => r.id),
      `Found ${legsWithNoPassengerLinks.length} booking_leg(s) with zero booking_leg_passengers rows. These legs have no passengers assigned.`,
    );
  }

  // ── 5. Additional integrity checks ─────────────────────────────────────

  // 5a. Booking passengers without any leg assignments
  const passengersWithNoLegs = await db.$queryRawUnsafe<
    { id: number; booking_id: number; first_name: string; last_name: string }[]
  >(
    `SELECT bp.id, bp.booking_id, bp.first_name, bp.last_name
     FROM booking_passengers bp
     WHERE NOT EXISTS (
       SELECT 1 FROM booking_leg_passengers blp
       WHERE blp.booking_passenger_id = bp.id
     )`,
  );

  if (passengersWithNoLegs.length > 0) {
    pushFinding(
      findings,
      "passenger_leg_coverage",
      "warning",
      "booking_passengers",
      passengersWithNoLegs.map((r) => r.id),
      `Found ${passengersWithNoLegs.length} booking_passenger(s) that are not linked to any booking_leg_passengers. They belong to bookings but have no leg assignments.`,
    );
  }

  // 5b. Bookings with legs but no passengers
  const bookingsWithLegsNoPassengers = await db.$queryRawUnsafe<
    { id: number; booking_reference: string }[]
  >(
    `SELECT b.id, b.booking_reference
     FROM bookings b
     WHERE EXISTS (SELECT 1 FROM booking_legs bl WHERE bl.booking_id = b.id)
       AND NOT EXISTS (SELECT 1 FROM booking_passengers bp WHERE bp.booking_id = b.id)`,
  );

  if (bookingsWithLegsNoPassengers.length > 0) {
    pushFinding(
      findings,
      "booking_structure",
      "warning",
      "bookings",
      bookingsWithLegsNoPassengers.map((r) => r.id),
      `Found ${bookingsWithLegsNoPassengers.length} booking(s) that have legs but zero passengers. Refs: ${bookingsWithLegsNoPassengers.map((r) => r.booking_reference).join(", ")}`,
    );
  }

  // 5c. Bookings with passengers but no legs
  const bookingsWithPassengersNoLegs = await db.$queryRawUnsafe<
    { id: number; booking_reference: string }[]
  >(
    `SELECT b.id, b.booking_reference
     FROM bookings b
     WHERE NOT EXISTS (SELECT 1 FROM booking_legs bl WHERE bl.booking_id = b.id)
       AND EXISTS (SELECT 1 FROM booking_passengers bp WHERE bp.booking_id = b.id)`,
  );

  if (bookingsWithPassengersNoLegs.length > 0) {
    pushFinding(
      findings,
      "booking_structure",
      "warning",
      "bookings",
      bookingsWithPassengersNoLegs.map((r) => r.id),
      `Found ${bookingsWithPassengersNoLegs.length} booking(s) that have passengers but zero legs. Refs: ${bookingsWithPassengersNoLegs.map((r) => r.booking_reference).join(", ")}`,
    );
  }

  // 5d. Check booking_legs with leg_sequence inconsistencies (gaps or duplicates
  //     within the same booking)
  const legSequenceIssues = await db.$queryRawUnsafe<
    { booking_id: number; issue: string; details: string }[]
  >(
    `WITH leg_sequences AS (
       SELECT booking_id, leg_sequence, COUNT(*) AS cnt
       FROM booking_legs
       GROUP BY booking_id, leg_sequence
     )
     SELECT booking_id,
            'duplicate_sequence' AS issue,
            string_agg(leg_sequence::text, ', ' ORDER BY leg_sequence) AS details
     FROM leg_sequences
     WHERE cnt > 1
     GROUP BY booking_id`,
  );

  if (legSequenceIssues.length > 0) {
    pushFinding(
      findings,
      "leg_sequence_integrity",
      "warning",
      "booking_legs",
      legSequenceIssues.map((r) => r.booking_id),
      `Found ${legSequenceIssues.length} booking(s) with duplicate leg_sequence values within the same booking.`,
    );
  }

  // ── Build and output report ────────────────────────────────────────────

  const report: AuditReport = {
    timestamp: new Date().toISOString(),
    summary,
    findings,
    issues_count: findings.filter((f) => f.severity === "error").length,
  };

  console.log(JSON.stringify(report, null, 2));
  await db.$disconnect();
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
