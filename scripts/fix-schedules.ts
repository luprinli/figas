/**
 * Fix schedules and flights:
 * 1. Delete ALL future schedules (>= 2026-06-06)
 * 2. Delete all past schedules and rebuild via auto-build pipeline
 */
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildSchedule } from "../app/utils/scheduling/index";

const adapter = new PrismaPg(process.env.DATABASE_URL!, { disposeExternalPool: true });
const p = new PrismaClient({ adapter });

async function main() {
  console.log("=== Schedule & Flight Fix ===\n");
  console.log("Current date: 2026-06-06\n");

  // ── Step 0: Get all past dates with unassigned bookings ──
  const datesResult = await p.$queryRawUnsafe<Array<{d:string}>>(
    `SELECT DISTINCT leg_date::date::text AS d
     FROM booking_legs
     WHERE leg_date < '2026-06-06'
       AND flight_id IS NULL
       AND status NOT IN ('cancelled')
     ORDER BY d`
  );
  const pastDates = datesResult.map(r => r.d);
  console.log(`Past dates with unassigned bookings: ${pastDates.length}`);

async function deleteSchedulesForDateRange(whereClause: string) {
  // Delete in dependency order (most dependent first)
  await p.$executeRawUnsafe(`
    DELETE FROM weight_balance_snapshots WHERE flight_leg_id IN (
      SELECT fl.id FROM flight_legs fl JOIN flights f ON f.id = fl.flight_id
      JOIN schedules s ON s.id = f.schedule_id WHERE s.schedule_date ${whereClause})`);
  await p.$executeRawUnsafe(`
    DELETE FROM loadsheet_passengers WHERE loadsheet_id IN (
      SELECT l.id FROM loadsheets l JOIN flights f ON f.id = l.flight_id
      JOIN schedules s ON s.id = f.schedule_id WHERE s.schedule_date ${whereClause})`);
  await p.$executeRawUnsafe(`
    DELETE FROM loadsheet_sectors WHERE loadsheet_id IN (
      SELECT l.id FROM loadsheets l JOIN flights f ON f.id = l.flight_id
      JOIN schedules s ON s.id = f.schedule_id WHERE s.schedule_date ${whereClause})`);
  await p.$executeRawUnsafe(`
    DELETE FROM loadsheets WHERE flight_id IN (
      SELECT f.id FROM flights f JOIN schedules s ON s.id = f.schedule_id WHERE s.schedule_date ${whereClause})`);
  await p.$executeRawUnsafe(`
    DELETE FROM checkin_reminders WHERE flight_id IN (
      SELECT f.id FROM flights f JOIN schedules s ON s.id = f.schedule_id WHERE s.schedule_date ${whereClause})`);
  await p.$executeRawUnsafe(`
    DELETE FROM flight_legs WHERE flight_id IN (
      SELECT f.id FROM flights f JOIN schedules s ON s.id = f.schedule_id WHERE s.schedule_date ${whereClause})`);
  await p.$executeRawUnsafe(`
    UPDATE booking_legs SET flight_id = NULL, status = 'confirmed', updated_at = NOW()
    WHERE flight_id IN (
      SELECT f.id FROM flights f JOIN schedules s ON s.id = f.schedule_id WHERE s.schedule_date ${whereClause})`);
  await p.$executeRawUnsafe(`
    DELETE FROM flights WHERE schedule_id IN (
      SELECT id FROM schedules WHERE schedule_date ${whereClause})`);
  await p.$executeRawUnsafe(
    `DELETE FROM schedules WHERE schedule_date ${whereClause}`);
}

  // ── Step 1: Delete future schedules ──
  console.log("\n1. Deleting future schedules (>= 2026-06-06)...");
  await deleteSchedulesForDateRange(">= '2026-06-06'");
  console.log("   Future schedules deleted.");

  // ── Step 2: Delete past schedules for rebuild ──
  console.log("\n2. Deleting past schedules (< 2026-06-06)...");
  await deleteSchedulesForDateRange("< '2026-06-06'");
  console.log("   Past schedules deleted.");

  // ── Step 3: Reset booking statuses ──
  console.log("\n3. Resetting booking statuses...");
  await p.$executeRawUnsafe(
    `UPDATE bookings SET status = 'confirmed'
     WHERE status IN ('flight_assigned', 'approved', 'pilot_review', 'checkin_open', 'checked_in')
       AND id IN (SELECT booking_id FROM booking_legs WHERE leg_date < '2026-06-06' AND status NOT IN ('cancelled'))`
  );
  await p.$executeRawUnsafe(
    "UPDATE booking_legs SET flight_id = NULL, status = 'confirmed' WHERE leg_date < '2026-06-06' AND status NOT IN ('cancelled') AND flight_id IS NOT NULL"
  );
  console.log("   Bookings reset to confirmed.");

  // ── Step 4: Rebuild past schedules via auto-build ──
  console.log("\n4. Rebuilding past schedules via auto-build...");
  const opsUserId = 2; // ops@figas.gov.fk
  let successCount = 0;
  let failCount = 0;
  let totalFlights = 0;

  for (const date of pastDates) {
    try {
      const dayName = new Date(date).toLocaleDateString("en-US", { weekday: "short" });
      if (dayName === "Sun") continue; // skip Sundays
      const result = await buildSchedule(date, opsUserId);
      if (result.errors.length === 0) {
        successCount++;
        totalFlights += result.routes.length;
        if (result.routes.length > 0) {
          console.log(`   ✅ ${date} — ${result.clusters.length} clusters, ${result.routes.length} flights`);
        }
      } else if (result.errors.some(e => e.includes("no-fly"))) {
        console.log(`   ⛔ ${date} — no-fly day`);
        failCount++;
      } else if (result.errors.some(e => e.includes("No unassigned"))) {
        // No bookings for this date - skip silently
        failCount++;
      } else {
        console.log(`   ⚠️ ${date} — ${result.errors.join(", ")}`);
        failCount++;
      }
    } catch (err) {
      console.log(`   ❌ ${date} — ${err instanceof Error ? err.message : "unknown error"}`);
      failCount++;
    }
  }

  // ── Summary ──
  const finalSch = await p.$queryRawUnsafe<Array<{cnt:number}>>("SELECT COUNT(*)::int as cnt FROM schedules");
  const finalFl = await p.$queryRawUnsafe<Array<{cnt:number}>>("SELECT COUNT(*)::int as cnt FROM flights");
  const finalLegs = await p.$queryRawUnsafe<Array<{cnt:number}>>("SELECT COUNT(*)::int as cnt FROM flight_legs");

  console.log("\n═══════════════════════════════════════════");
  console.log("  FIX COMPLETE");
  console.log("═══════════════════════════════════════════");
  console.log(`  Rebuilds succeeded: ${successCount}`);
  console.log(`  Rebuilds skipped/errored: ${failCount}`);
  console.log(`  Total flights created: ${totalFlights}`);
  console.log(`  Total schedules (all past): ${finalSch[0].cnt}`);
  console.log(`  Total flights: ${finalFl[0].cnt}`);
  console.log(`  Total flight legs: ${finalLegs[0].cnt}`);

  await p.$disconnect();
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
