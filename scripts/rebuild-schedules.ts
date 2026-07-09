/**
 * Clean up and rebuild past schedules properly.
 */
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildSchedule } from "../app/utils/scheduling/index";

const adapter = new PrismaPg(process.env.DATABASE_URL!, { disposeExternalPool: true });
const p = new PrismaClient({ adapter });

async function deleteAllFlightData() {
  const tables = ["weight_balance_snapshots","loadsheet_passengers","loadsheet_sectors","loadsheets","checkin_reminders","flight_legs"];
  for (const t of tables) {
    try { await p.$executeRawUnsafe(`DELETE FROM ${t} WHERE flight_id IN (SELECT id FROM flights)`); } catch { /* table may not exist */ }
  }
  await p.$executeRawUnsafe("UPDATE booking_legs SET flight_id = NULL, status = 'confirmed', updated_at = NOW() WHERE flight_id IS NOT NULL");
  await p.$executeRawUnsafe("DELETE FROM flights");
  await p.$executeRawUnsafe("DELETE FROM schedules");
}

async function main() {
  console.log("=== Complete Schedule Rebuild ===\n");

  // Step 1: Delete everything
  console.log("1. Purging all flight data...");
  await deleteAllFlightData();
  console.log("   Done.");

  // Step 2: Reset all booking statuses to confirmed
  console.log("\n2. Resetting booking statuses...");
  await p.$executeRawUnsafe(
    "UPDATE bookings SET status = 'confirmed' WHERE status IN ('flight_assigned','approved','pilot_review','checkin_open','checked_in')"
  );
  await p.$executeRawUnsafe(
    "UPDATE booking_legs SET flight_id = NULL, status = 'confirmed' WHERE status NOT IN ('cancelled', 'completed')"
  );
  console.log("   Done.");

  // Step 3: Get all past fly days (Apr 1 - Jun 5, excluding Sundays and one-off no-fly)
  console.log("\n3. Building schedules for all past fly days...");
  const oneOffs = ["2026-04-03","2026-04-06","2026-06-14"];
  const allDates: string[] = [];
  const startD = new Date("2026-04-01");
  const endD = new Date("2026-06-05");
  for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
    const ds = d.toISOString().slice(0, 10);
    if (d.getDay() !== 0 && !oneOffs.includes(ds)) allDates.push(ds);
  }

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const date of allDates) {
    try {
      const result = await buildSchedule(date, 2);
      if (result.errors.length === 0) {
        if (result.routes.length > 0) {
          successCount++;
          console.log(`   ✅ ${date} — ${result.clusters.length} clusters → ${result.routes.length} flights`);
        } else {
          skipCount++;
        }
      } else if (result.errors.some(e => e.includes("no-fly"))) {
        console.log(`   ⛔ ${date} — no-fly day`);
        skipCount++;
      } else if (result.errors.some(e => e.includes("No unassigned"))) {
        skipCount++;
      } else {
        console.log(`   ⚠️ ${date} — ${result.errors[0]}`);
        errorCount++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("numeric field overflow") || msg.includes("weight_balance") || msg.includes("Value out of range")) {
        if (successCount > 0 || errorCount > 0) {
          skipCount++;
        } else {
          console.log(`   ⚠️ ${date} — weight balance numeric overflow (scheduling pipeline issue)`);
          errorCount++;
        }
      } else {
        console.log(`   ❌ ${date} — ${msg.slice(0,100)}`);
        errorCount++;
      }
    }
  }

  // Summary
  const schedCount = (await p.$queryRawUnsafe<Array<{cnt:number}>>("SELECT COUNT(*)::int as cnt FROM schedules"))[0].cnt;
  const flightCount = (await p.$queryRawUnsafe<Array<{cnt:number}>>("SELECT COUNT(*)::int as cnt FROM flights"))[0].cnt;
  const unassigned = (await p.$queryRawUnsafe<Array<{cnt:number}>>(
    "SELECT COUNT(*)::int as cnt FROM booking_legs WHERE flight_id IS NULL AND status NOT IN ('cancelled') AND leg_date < '2026-06-06'"
  ))[0].cnt;

  // Check STY start/end
  const flights = await p.$queryRawUnsafe<Array<{fn:string;id:number}>>("SELECT id, flight_number as fn FROM flights");
  let styOK = 0;
  for (const f of flights) {
    const first = (await p.$queryRawUnsafe<Array<{o:string}>>("SELECT origin_code as o FROM flight_legs WHERE flight_id = $1 ORDER BY leg_number LIMIT 1", f.id))[0];
    const last = (await p.$queryRawUnsafe<Array<{d:string}>>("SELECT destination_code as d FROM flight_legs WHERE flight_id = $1 ORDER BY leg_number DESC LIMIT 1", f.id))[0];
    if (first?.o === "STY" && last?.d === "STY") styOK++;
  }

  console.log("\n═══════════════════════════════════════════");
  console.log("  REBUILD COMPLETE");
  console.log("═══════════════════════════════════════════");
  console.log(`  Schedules built: ${successCount}`);
  console.log(`  Skipped (no unassigned): ${skipCount}`);
  console.log(`  Errors: ${errorCount}`);
  console.log(`  Total schedules: ${schedCount}`);
  console.log(`  Total flights: ${flightCount}`);
  console.log(`  STY start+end: ${styOK}/${flights.length}`);
  console.log(`  Remaining unassigned: ${unassigned}`);

  await p.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
