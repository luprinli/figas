import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL!, { disposeExternalPool: true });
const p = new PrismaClient({ adapter });

async function main() {
  console.log("Fixing no-fly rule dates to noon Atlantic/Stanley time...\n");

  // Delete all existing one-off rules
  await p.$executeRawUnsafe("DELETE FROM no_fly_rules WHERE rule_type = 'one_off'");

  // Re-insert with correct timezone handling (noon local time = 15:00 UTC)
  const holidays: Array<{label:string; desc:string; date:string}> = [
    { label: "Good Friday 2026", desc: "Good Friday", date: "2026-04-03" },
    { label: "Easter Monday 2026", desc: "Easter Monday", date: "2026-04-06" },
    { label: "Liberation Day 2026", desc: "Liberation Day", date: "2026-06-14" },
    { label: "Christmas Day 2026", desc: "Christmas Day", date: "2026-12-25" },
    { label: "Boxing Day 2026", desc: "Boxing Day", date: "2026-12-26" },
    { label: "New Year's Eve 2026", desc: "New Year's Eve", date: "2026-12-31" },
  ];

  for (const h of holidays) {
    await p.$executeRawUnsafe(
      `INSERT INTO no_fly_rules (label, description, rule_type, is_active, specific_date, priority, created_by, created_at, updated_at)
       VALUES ($1, $2, 'one_off', true, ($3::date + '12:00'::time)::timestamp AT TIME ZONE 'Atlantic/Stanley', 20, 1, NOW(), NOW())`,
      h.label, h.desc, h.date
    );
    console.log(`  ✅ ${h.label} → ${h.date}`);
  }

  // Verify
  const rules = await p.$queryRawUnsafe<Array<Record<string,unknown>>>(
    "SELECT label, specific_date::text as sd, specific_date::date::text as cast_date FROM no_fly_rules WHERE rule_type = 'one_off' ORDER BY specific_date"
  );
  console.log("\nVerification:");
  for (const r of rules) console.log(`  ${r.label}: DB=${r.sd} Cast=${r.cast_date}`);

  // Now migrate bookings on all no-fly days
  console.log("\n--- Migrating bookings ---");
  const oneOffDates = holidays.map(h => h.date);
  const allNoFly = new Set<string>();
  for (let d = new Date("2026-04-01"); d <= new Date("2026-12-31"); d.setDate(d.getDate() + 1)) {
    const ds = d.toISOString().slice(0, 10);
    if (d.getDay() === 0 || oneOffDates.includes(ds)) allNoFly.add(ds);
  }

  const bad = await p.$queryRawUnsafe<Array<{id:number;date:string;orig:string;dest:string}>>(
    `SELECT bl.id, bl.leg_date::date::text as date, bl.origin_code as orig, bl.destination_code as dest
     FROM booking_legs bl JOIN bookings b ON b.id = bl.booking_id
     WHERE bl.leg_date::date::text = ANY(ARRAY[$1])
       AND b.status != 'cancelled'
       AND bl.flight_id IS NULL
     ORDER BY bl.leg_date`,
    Array.from(allNoFly)
  );

  console.log(`Found: ${bad.length} bookings on no-fly days`);
  if (bad.length > 0) {
    for (const bk of bad.slice(0, 5)) console.log(`  ${bk.date}: ${bk.orig} → ${bk.dest}`);
    let migrated = 0;
    for (const bk of bad) {
      const next = new Date(bk.date);
      let ns: string;
      do { next.setDate(next.getDate() + 1); ns = next.toISOString().slice(0, 10); }
      while (allNoFly.has(ns));
      await p.$executeRawUnsafe(
        `UPDATE booking_legs SET leg_date = $1::date, departure_date = $1::date, updated_at = NOW()
         WHERE id = $2`, ns, bk.id
      );
      migrated++;
    }
    console.log(`Migrated: ${migrated}`);
  }

  await p.$disconnect();
  console.log("Done.");
}
main().catch(err => { console.error(err); process.exit(1); });
