/**
 * Repair Script: Populate missing booking_leg_passengers junction records
 *
 * Finds bookings that have both booking_legs and booking_passengers but
 * zero booking_leg_passengers rows, and creates the missing junction
 * records linking each passenger to each leg.
 *
 * Usage:
 *   npx tsx prisma/repair-leg-passengers.ts           # dry-run (reports only)
 *   npx tsx prisma/repair-leg-passengers.ts --execute # actually insert rows
 */

import { db } from "../app/utils/db.server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BookingToRepair {
  booking_id: number;
  booking_reference: string;
  leg_count: number;
  passenger_count: number;
  missing_junctions: number;
}

interface LegInfo {
  id: number;
  leg_sequence: number;
  origin_code: string;
  destination_code: string;
  leg_date: string;
}

interface PassengerInfo {
  id: number;
  first_name: string;
  last_name: string;
  clothed_body_weight_kg: number | null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  const mode = execute ? "EXECUTE" : "DRY-RUN";
  console.log(`\n=== Repair Leg-Passengers (${mode}) ===\n`);

  // ── 1. Find bookings with legs + passengers but zero junction records ────
  const brokenBookings = await db.$queryRawUnsafe<
    {
      booking_id: number;
      booking_reference: string;
      leg_count: bigint;
      passenger_count: bigint;
    }[]
  >(
    `SELECT
       b.id AS booking_id,
       b.booking_reference,
       (SELECT COUNT(*) FROM booking_legs bl WHERE bl.booking_id = b.id) AS leg_count,
       (SELECT COUNT(*) FROM booking_passengers bp WHERE bp.booking_id = b.id) AS passenger_count
     FROM bookings b
     WHERE EXISTS (SELECT 1 FROM booking_legs bl WHERE bl.booking_id = b.id)
       AND EXISTS (SELECT 1 FROM booking_passengers bp WHERE bp.booking_id = b.id)
       AND NOT EXISTS (
         SELECT 1 FROM booking_leg_passengers blp
         JOIN booking_legs bl ON bl.id = blp.booking_leg_id
         WHERE bl.booking_id = b.id
       )
     ORDER BY b.id`,
  );

  if (brokenBookings.length === 0) {
    console.log("✓ No broken bookings found. All bookings with legs and passengers have junction records.\n");
    await db.$disconnect();
    return;
  }

  console.log(`Found ${brokenBookings.length} booking(s) with missing leg-passenger junctions:\n`);

  const repairs: BookingToRepair[] = [];
  let totalMissingJunctions = 0;

  for (const b of brokenBookings) {
    const legCount = Number(b.leg_count);
    const passengerCount = Number(b.passenger_count);
    const missing = legCount * passengerCount;
    totalMissingJunctions += missing;
    repairs.push({
      booking_id: b.booking_id,
      booking_reference: b.booking_reference,
      leg_count: legCount,
      passenger_count: passengerCount,
      missing_junctions: missing,
    });
  }

  // Print summary table
  console.log(
    `${"Booking ID".padEnd(12)} ${"Reference".padEnd(18)} ${"Legs".padEnd(6)} ${"Pax".padEnd(6)} ${"Missing".padEnd(8)}`,
  );
  console.log("-".repeat(52));
  for (const r of repairs) {
    console.log(
      `${String(r.booking_id).padEnd(12)} ${r.booking_reference.padEnd(18)} ${String(r.leg_count).padEnd(6)} ${String(r.passenger_count).padEnd(6)} ${String(r.missing_junctions).padEnd(8)}`,
    );
  }
  console.log("-".repeat(52));
  console.log(`${"TOTAL".padEnd(12)} ${String(brokenBookings.length).padEnd(18)} ${"".padEnd(6)} ${"".padEnd(6)} ${String(totalMissingJunctions).padEnd(8)}`);
  console.log();

  if (!execute) {
    console.log("DRY-RUN complete. Run with --execute to create the missing records.\n");
    await db.$disconnect();
    return;
  }

  // ── 2. Execute repairs ──────────────────────────────────────────────────
  let totalCreated = 0;
  let totalSkipped = 0;
  let bookingsFixed = 0;

  for (const repair of repairs) {
    // Fetch legs for this booking
    const legs = await db.$queryRawUnsafe<LegInfo[]>(
      `SELECT id, leg_sequence, origin_code, destination_code, leg_date
       FROM booking_legs
       WHERE booking_id = $1
       ORDER BY leg_sequence`,
      repair.booking_id,
    );

    // Fetch passengers for this booking
    const passengers = await db.$queryRawUnsafe<PassengerInfo[]>(
      `SELECT id, first_name, last_name, clothed_body_weight_kg
       FROM booking_passengers
       WHERE booking_id = $1
       ORDER BY id`,
      repair.booking_id,
    );

    let createdForBooking = 0;
    let skippedForBooking = 0;

    for (const leg of legs) {
      for (const passenger of passengers) {
        // Check if this combination already exists (safety check)
        const existing = await db.$queryRawUnsafe<{ id: number }[]>(
          `SELECT id FROM booking_leg_passengers
           WHERE booking_leg_id = $1 AND booking_passenger_id = $2`,
          leg.id,
          passenger.id,
        );

        if (existing.length > 0) {
          skippedForBooking++;
          continue;
        }

        // Create the junction record
        await db.$executeRawUnsafe(
          `INSERT INTO booking_leg_passengers
             (booking_leg_id, booking_passenger_id, clothed_weight_kg,
              baggage_weight_kg, baggage_description,
              freight_description, freight_weight_kg)
           VALUES ($1, $2, $3, 0, NULL, NULL, 0)`,
          leg.id,
          passenger.id,
          passenger.clothed_body_weight_kg ?? null,
        );
        createdForBooking++;
      }
    }

    totalCreated += createdForBooking;
    totalSkipped += skippedForBooking;
    bookingsFixed++;
    console.log(
      `✓ Booking #${repair.booking_id} (${repair.booking_reference}): created ${createdForBooking} junction record(s)` +
        (skippedForBooking > 0 ? `, skipped ${skippedForBooking} already-existing` : ""),
    );
  }

  console.log(`\n=== REPAIR COMPLETE ===`);
  console.log(`Bookings fixed: ${bookingsFixed}`);
  console.log(`Junction records created: ${totalCreated}`);
  if (totalSkipped > 0) {
    console.log(`Already-existing records skipped: ${totalSkipped}`);
  }
  console.log();

  await db.$disconnect();
}

main().catch((err) => {
  console.error("Repair script failed:", err);
  process.exit(1);
});
