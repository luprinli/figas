/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "../app/utils/db.server";
import { sql } from "kysely";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TestBooking {
  id: number;
  booking_reference: string;
  reason: string;
  leg_count: number;
  passenger_count: number;
  leg_passenger_count: number;
}

interface DeletionPlan {
  bookings: TestBooking[];
  booking_ids: number[];
  total_booking_leg_passengers: number;
  total_booking_legs: number;
  total_booking_passengers: number;
  total_bookings: number;
}

// ---------------------------------------------------------------------------
// Reference patterns that identify test data
// ---------------------------------------------------------------------------

const TEST_PATTERNS = [
  "TST-%",
  "TEST-%",
  "SEED-%",
  "MOCK-%",
  "DEMO-%",
  "DEV-%",
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const isExecute = process.argv.includes("--execute");
  const mode = isExecute ? "EXECUTE" : "DRY RUN";
  console.log(`\n=== Cleanup Test/Mock Booking Data (${mode}) ===\n`);

  // ── Step 1: Identify test bookings by reference pattern ─────────────────

  console.log("Scanning for test bookings by reference pattern...");

  const patternConditions = TEST_PATTERNS.map(
    (p) => `b.booking_reference LIKE '${p}'`,
  ).join(" OR ");

  const byPatternResult = await sql<{ id: number; booking_reference: string }>`
    SELECT b.id, b.booking_reference
     FROM bookings b
     WHERE ${sql.raw(patternConditions)}
     ORDER BY b.id
  `.execute(db);
  const byPattern = byPatternResult.rows;

  console.log(
    `  Found ${byPattern.length} booking(s) matching test patterns (${TEST_PATTERNS.join(", ")}).`,
  );

  // ── Step 2: Identify broken bookings (legs but no passengers) ───────────

  console.log("Scanning for bookings with legs but no booking_passengers...");

  const legsNoPassengersResult = await sql<{ id: number; booking_reference: string }>`
    SELECT DISTINCT b.id, b.booking_reference
     FROM bookings b
     WHERE EXISTS (
       SELECT 1 FROM booking_legs bl WHERE bl.booking_id = b.id
     )
     AND NOT EXISTS (
       SELECT 1 FROM booking_passengers bp WHERE bp.booking_id = b.id
     )
     ORDER BY b.id
  `.execute(db);
  const legsNoPassengers = legsNoPassengersResult.rows;

  console.log(
    `  Found ${legsNoPassengers.length} booking(s) with legs but no passengers.`,
  );

  // ── Step 3: Identify broken bookings (passengers but no legs) ───────────

  console.log("Scanning for bookings with passengers but no booking_legs...");

  const passengersNoLegsResult = await sql<{ id: number; booking_reference: string }>`
    SELECT DISTINCT b.id, b.booking_reference
     FROM bookings b
     WHERE EXISTS (
       SELECT 1 FROM booking_passengers bp WHERE bp.booking_id = b.id
     )
     AND NOT EXISTS (
       SELECT 1 FROM booking_legs bl WHERE bl.booking_id = b.id
     )
     ORDER BY b.id
  `.execute(db);
  const passengersNoLegs = passengersNoLegsResult.rows;

  console.log(
    `  Found ${passengersNoLegs.length} booking(s) with passengers but no legs.`,
  );

  // ── Step 4: Deduplicate and build full target list ─────────────────────

  const targetMap = new Map<number, { ref: string; reason: string }>();

  for (const b of byPattern) {
    targetMap.set(b.id, {
      ref: b.booking_reference,
      reason: `Reference matches test pattern: ${b.booking_reference}`,
    });
  }

  for (const b of legsNoPassengers) {
    if (!targetMap.has(b.id)) {
      targetMap.set(b.id, {
        ref: b.booking_reference,
        reason: `Has booking_legs but zero booking_passengers (broken booking)`,
      });
    }
  }

  for (const b of passengersNoLegs) {
    if (!targetMap.has(b.id)) {
      targetMap.set(b.id, {
        ref: b.booking_reference,
        reason: `Has booking_passengers but zero booking_legs (broken booking)`,
      });
    }
  }

  const targetIds = Array.from(targetMap.keys());

  if (targetIds.length === 0) {
    console.log("\nNo test data found. Nothing to clean up.");
    return;
  }

  // ── Step 5: Get counts of related records for each target booking ──────

  console.log(`\nGathering related record counts for ${targetIds.length} target booking(s)...`);

  const idList = targetIds.join(", ");

  const legPassengerResult = await sql<{ booking_id: number; cnt: bigint }>`
    SELECT bl.booking_id, COUNT(blp.id)::bigint AS cnt
     FROM booking_leg_passengers blp
     JOIN booking_legs bl ON bl.id = blp.booking_leg_id
     WHERE bl.booking_id IN (${sql.raw(idList)})
     GROUP BY bl.booking_id
  `.execute(db);

  const legCountsResult = await sql<{ booking_id: number; cnt: bigint }>`
    SELECT booking_id, COUNT(id)::bigint AS cnt
     FROM booking_legs
     WHERE booking_id IN (${sql.raw(idList)})
     GROUP BY booking_id
  `.execute(db);

  const passengerCountsResult = await sql<{ booking_id: number; cnt: bigint }>`
    SELECT booking_id, COUNT(id)::bigint AS cnt
     FROM booking_passengers
     WHERE booking_id IN (${sql.raw(idList)})
     GROUP BY booking_id
  `.execute(db);

  const legPaxMap = new Map<number, number>();
  for (const r of legPassengerResult.rows) {
    legPaxMap.set(r.booking_id, Number(r.cnt));
  }
  const legMap = new Map<number, number>();
  for (const r of legCountsResult.rows) {
    legMap.set(r.booking_id, Number(r.cnt));
  }
  const paxMap = new Map<number, number>();
  for (const r of passengerCountsResult.rows) {
    paxMap.set(r.booking_id, Number(r.cnt));
  }

  const bookings: TestBooking[] = targetIds.map((id) => ({
    id,
    booking_reference: targetMap.get(id)!.ref,
    reason: targetMap.get(id)!.reason,
    leg_count: legMap.get(id) ?? 0,
    passenger_count: paxMap.get(id) ?? 0,
    leg_passenger_count: legPaxMap.get(id) ?? 0,
  }));

  const plan: DeletionPlan = {
    bookings,
    booking_ids: targetIds,
    total_booking_leg_passengers: bookings.reduce(
      (sum, b) => sum + b.leg_passenger_count,
      0,
    ),
    total_booking_legs: bookings.reduce((sum, b) => sum + b.leg_count, 0),
    total_booking_passengers: bookings.reduce(
      (sum, b) => sum + b.passenger_count,
      0,
    ),
    total_bookings: bookings.length,
  };

  // ── Step 6: Print deletion plan ────────────────────────────────────────

  console.log("\n─────────────────────────────────────────────────────────────");
  console.log(`  DELETION PLAN (${mode})`);
  console.log("─────────────────────────────────────────────────────────────");
  console.log(`  Total bookings to delete:     ${plan.total_bookings}`);
  console.log(`  Associated booking_legs:      ${plan.total_booking_legs}`);
  console.log(`  Associated booking_passengers: ${plan.total_booking_passengers}`);
  console.log(`  Associated leg_passengers:    ${plan.total_booking_leg_passengers}`);
  console.log("─────────────────────────────────────────────────────────────");

  for (const b of bookings) {
    console.log(
      `\n  [${b.booking_reference}] (ID: ${b.id})`,
    );
    console.log(`    Reason:     ${b.reason}`);
    console.log(
      `    Records:    ${b.leg_count} leg(s), ${b.passenger_count} passenger(s), ${b.leg_passenger_count} leg-passenger link(s)`,
    );
  }

  console.log(
    "\n─────────────────────────────────────────────────────────────",
  );

  if (!isExecute) {
    console.log(
      "\n  DRY RUN COMPLETE — no data was deleted.",
    );
    console.log(
      "  Re-run with --execute to perform the actual deletion.\n",
    );
    return;
  }

  // ── Step 7: Execute deletion in correct FK order ───────────────────────

  console.log("\n  EXECUTING DELETION...\n");

  try {
    await db.transaction().execute(async (tx) => {
      // 7a. Delete booking_leg_passengers for target booking_legs
      await tx
        .deleteFrom("booking_leg_passengers")
        .where("booking_leg_id", "in",
          tx.selectFrom("booking_legs").select("id").where("booking_id", "in", targetIds) as any
        )
        .execute();
      console.log(
        `  [1/4] Deleted booking_leg_passengers row(s).`,
      );

      // 7b. Delete booking_legs for target bookings
      await tx
        .deleteFrom("booking_legs")
        .where("booking_id", "in", targetIds)
        .execute();
      console.log(`  [2/4] Deleted booking_legs row(s).`);

      // 7c. Delete booking_passengers for target bookings
      await tx
        .deleteFrom("booking_passengers")
        .where("booking_id", "in", targetIds)
        .execute();
      console.log(
        `  [3/4] Deleted booking_passengers row(s).`,
      );

      // 7d. Delete the bookings themselves
      await tx
        .deleteFrom("bookings")
        .where("id", "in", targetIds)
        .execute();
      console.log(`  [4/4] Deleted booking(s).`);
    });

    console.log("\n  DELETION COMPLETE.\n");
  } catch (err) {
    console.error("\n  DELETION FAILED:", err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
