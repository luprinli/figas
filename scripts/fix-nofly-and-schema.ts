/**
 * Fix script:
 * 1. Clean duplicate no-fly rules
 * 2. Migrate bookings on no-fly days to next available fly day
 * 3. Fix Decimal precision on weight_balance_snapshots to prevent overflow
 */
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL!, { disposeExternalPool: true });
const p = new PrismaClient({ adapter });

async function main() {
  console.log("=== No-Fly Day Fix & Schema Repair ===\n");

  // ── Step 1: Check and fix DB column types ──
  console.log("1. Checking DB column types vs Prisma schema...");
  const cols = await p.$queryRawUnsafe<Array<Record<string,string>>>(
    `SELECT column_name, data_type, numeric_precision, numeric_scale
     FROM information_schema.columns
     WHERE table_name = 'weight_balance_snapshots'
       AND data_type = 'numeric'
     ORDER BY ordinal_position`
  );
  let colFixes = 0;
  for (const c of cols) {
    const prec = parseInt(c.numeric_precision);
    const scale = parseInt(c.numeric_scale);
    if (prec < 10) {
      console.log(`   ⚠️ ${c.column_name}: Decimal(${prec},${scale}) — needs Decimal(10,2)`);
      await p.$executeRawUnsafe(
        `ALTER TABLE weight_balance_snapshots ALTER COLUMN "${c.column_name}" TYPE numeric(10,2)`
      );
      colFixes++;
    }
  }
  console.log(`   Fixed ${colFixes} columns${colFixes === 0 ? " — already correct" : ""}`);

  // ── Step 2: Clean duplicate no-fly rules ──
  console.log("\n2. Cleaning duplicate no-fly rules...");
  // Use a temp table approach: deduplicate by label keeping highest priority
  await p.$executeRawUnsafe(`
    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY label ORDER BY priority DESC, id) as rn
      FROM no_fly_rules
    )
    DELETE FROM no_fly_rules WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
  `);
  const ruleCount = (await p.$queryRawUnsafe<Array<{cnt:number}>>("SELECT COUNT(*)::int as cnt FROM no_fly_rules"))[0].cnt;
  console.log(`   Remaining rules: ${ruleCount}`);

  // ── Step 3: Find all bookings on no-fly days ──
  console.log("\n3. Finding bookings on no-fly days...");
  const oneOffDates = (await p.$queryRawUnsafe<Array<{sd:string}>>(
    "SELECT DISTINCT specific_date::date::text as sd FROM no_fly_rules WHERE rule_type = 'one_off' AND is_active = true"
  )).map(r => r.sd);
  
  void (await p.$queryRawUnsafe<Array<{cnt:number}>>(
    "SELECT COUNT(*)::int as cnt FROM no_fly_rules WHERE rule_type = 'recurring' AND is_active = true AND 0 = ANY(day_of_week)"
  ))[0].cnt;

  // Get all no-fly dates in range (Apr 1 - Dec 31 2026)
  const allNoFlyDates = new Set<string>();
  const startD = new Date("2026-04-01");
  const endD = new Date("2026-12-31");
  for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
    const ds = d.toISOString().slice(0, 10);
    if (d.getDay() === 0) allNoFlyDates.add(ds);
    if (oneOffDates.includes(ds)) allNoFlyDates.add(ds);
  }

  // Find ALL bookings on no-fly days (unassigned only, safe to migrate)
  const badBookings = await p.$queryRawUnsafe<Array<{legId:number;date:string;origin:string;dest:string}>>(
    `SELECT bl.id as "legId", bl.leg_date::date::text as date, bl.origin_code as origin, bl.destination_code as dest
     FROM booking_legs bl JOIN bookings b ON b.id = bl.booking_id
     WHERE bl.leg_date::date::text = ANY(ARRAY[$1])
       AND b.status != 'cancelled'
       AND bl.flight_id IS NULL
     ORDER BY bl.leg_date`,
    Array.from(allNoFlyDates)
  );

  // Also find bookings that ARE assigned (can't migrate these, just report)
  const assignedBad = await p.$queryRawUnsafe<Array<{cnt:number}>>(
    `SELECT COUNT(*)::int as cnt
     FROM booking_legs bl JOIN bookings b ON b.id = bl.booking_id
     WHERE bl.leg_date::date::text = ANY(ARRAY[$1])
       AND b.status != 'cancelled'
       AND bl.flight_id IS NOT NULL`,
    Array.from(allNoFlyDates)
  );
  console.log(`   Bookings on no-fly days: ${badBookings.length}`);

  // ── Step 4: Migrate to next available fly day ──
  console.log("\n4. Migrating bookings to next available fly day...");
  let migrated = 0;

  for (const bk of badBookings) {
    // Find next fly day
    const next = new Date(bk.date);
    let nextStr: string;
    do {
      next.setDate(next.getDate() + 1);
      nextStr = next.toISOString().slice(0, 10);
    } while (allNoFlyDates.has(nextStr));

    await p.$executeRawUnsafe(
      `UPDATE booking_legs SET leg_date = $1::date, departure_date = $1::date, updated_at = NOW()
       WHERE id = $2 AND flight_id IS NULL`,
      nextStr, bk.legId
    );
    migrated++;
    if (migrated <= 10 || migrated === badBookings.length) {
      console.log(`   ${bk.date} → ${nextStr}: ${bk.origin} → ${bk.dest}`);
    }
  }
  console.log(`   Migrated: ${migrated} booking legs`);

  // ── Step 5: Clean up checkin_reminders for no-fly days ──
  console.log("\n5. Cleaning checkin reminders on no-fly days...");
  const cfyRemoved = await p.$executeRawUnsafe(
    `DELETE FROM checkin_reminders
     WHERE scheduled_for::date::text = ANY(ARRAY[$1])`,
    Array.from(allNoFlyDates)
  );
  console.log(`   Removed: ${cfyRemoved} (affected)`);

  // ── Summary ──
  const remainingBad = (await p.$queryRawUnsafe<Array<{cnt:number}>>(
    `SELECT COUNT(*)::int as cnt FROM booking_legs bl
     JOIN bookings b ON b.id = bl.booking_id
     WHERE bl.leg_date::date::text = ANY(ARRAY[$1])
       AND b.status != 'cancelled'`,
    Array.from(allNoFlyDates)
  ))[0].cnt;

  console.log("\n═══════════════════════════════════════════");
  console.log("  FIX COMPLETE");
  console.log("═══════════════════════════════════════════");
  console.log(`  Column fixes: ${colFixes}`);
  console.log(`  No-fly rules (cleaned): ${ruleCount}`);
  console.log(`  Unassigned legs migrated: ${migrated}`);
  console.log(`  Assigned legs on no-fly (cannot migrate): ${(assignedBad[0] as Record<string, unknown>).cnt}`);
  console.log(`  Remaining on no-fly days: ${remainingBad}`);
  console.log(`  Reminders removed: ${cfyRemoved}`);

  await p.$disconnect();
}
main().catch(err => { console.error("Fatal:", err); process.exit(1); });
