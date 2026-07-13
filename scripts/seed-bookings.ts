/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Seed script for generating realistic bookings with passengers.
 *
 * Creates unassigned bookings (flight_id IS NULL) that will appear in the
 * "Unassigned Passengers" panel of the schedule builder at /operations/schedule.
 *
 * Usage:
 *   node --env-file .env --import tsx scripts/seed-bookings.ts
 *
 * Optional:
 *   node --env-file .env --import tsx scripts/seed-bookings.ts --date 2026-06-15
 */

import { Pool } from "pg";
import { fetchReferenceData, validateReferenceData } from "./lib/reference-data.js";
import { generatePassengers, pickPassengerCount } from "./lib/passenger-generator.js";
import { buildItinerary } from "./lib/itinerary-builder.js";
import { toISODate } from "./lib/date-utils.js";
import { writeBooking } from "./lib/booking-writer.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCliArgs(): { targetDate: string } {
  const args = process.argv.slice(2);
  const dateIndex = args.indexOf("--date");
  let targetDate: string;

  if (dateIndex !== -1 && args[dateIndex + 1]) {
    targetDate = args[dateIndex + 1];
  } else {
    targetDate = toISODate(new Date());
  }

  return { targetDate };
}

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "❌ DATABASE_URL environment variable is required.\n" +
        "   Set it in .env or pass it inline.\n" +
        "   Example: postgresql://user:password@localhost:5432/figas"
    );
    process.exit(1);
  }
  return url;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("🌱 Seeding realistic bookings for schedule builder...\n");

  const { targetDate } = parseCliArgs();
  console.log(`  Target date: ${targetDate}\n`);

  // 1. Connect to the database
  const databaseUrl = getDatabaseUrl();
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    // 2. Load reference data
    console.log("  Loading reference data...");
    const refData = await fetchReferenceData(pool);
    validateReferenceData(refData);
    console.log("");

    // 2b. Check no-fly dates — abort if target date is blocked
    const noFlyResult = await pool.query(
      `SELECT no_fly_date FROM no_fly_dates WHERE no_fly_date = $1`,
      [targetDate],
    );
    if (noFlyResult.rows.length > 0) {
      console.error(`\n  ❌ Cannot seed: ${targetDate} is a scheduled no-fly day.`);
      console.error("     Choose a different date with --date YYYY-MM-DD\n");
      process.exit(1);
    }

    // 2c. Fetch ALL upcoming no-fly dates for multi-day itinerary validation
    const allNoFlyResult = await pool.query(
      `SELECT no_fly_date FROM no_fly_dates WHERE no_fly_date >= CURRENT_DATE ORDER BY no_fly_date`,
    );
    const noFlyDates = new Set(allNoFlyResult.rows.map((r) => toISODate(r.no_fly_date)));

    // 3. Generate bookings
    const BOOKING_COUNT = 10;
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < BOOKING_COUNT; i++) {
      try {
        const passengerCount = pickPassengerCount();
        const passengers = generatePassengers(passengerCount);
        const itinerary = buildItinerary(refData, targetDate, i);

        // Validate no leg date falls on a no-fly day
        const blockedLegs = itinerary.legs.filter((l) => noFlyDates.has(l.leg_date));
        if (blockedLegs.length > 0) {
          const blocked = blockedLegs.map((l) => `${l.origin} → ${l.destination} (${l.leg_date})`).join(", ");
          console.warn(`  ⚠  Skipping booking ${i + 1}: legs on no-fly dates — ${blocked}`);
          continue;
        }

        await writeBooking(pool, {
          legs: itinerary.legs,
          passengers,
          refData,
        });

        const legInfo = itinerary.legs
          .map((l) => `${l.origin} → ${l.destination}`)
          .join(", ");
        console.log(
          `  ✅ Booking ${i + 1}/${BOOKING_COUNT}: [${legInfo}] (${passengerCount} pax, ${itinerary.type})`
        );
        successCount++;
      } catch (err) {
        console.error(`  ❌ Booking ${i + 1}/${BOOKING_COUNT} failed:`, err);
        errorCount++;
      }
    }

    // 4. Summary
    console.log("\n────────────────────────────────────────");
    console.log("  📊 Summary");
    console.log("────────────────────────────────────────");
    console.log(`  Target date:     ${targetDate}`);
    console.log(`  Successful:      ${successCount}`);
    console.log(`  Failed:          ${errorCount}`);
    console.log(`  Total bookings:  ${successCount + errorCount}`);
    console.log("────────────────────────────────────────");
    console.log("  ✅ Seed complete!");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
