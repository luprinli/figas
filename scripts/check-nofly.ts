import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL!, { disposeExternalPool: true });
const p = new PrismaClient({ adapter });

async function main() {
  // 1. Check no-fly rules
  console.log("=== No-Fly Rules ===\n");
  const rules = await p.$queryRawUnsafe<Array<Record<string,unknown>>>(
    "SELECT label, rule_type, is_active, day_of_week, specific_date, priority FROM no_fly_rules ORDER BY priority DESC"
  );
  for (const r of rules) console.log(`  ${r.label} | ${r.rule_type} | active:${r.is_active} | days:${r.day_of_week} | date:${r.specific_date} | priority:${r.priority}`);

  // 2. Check bookings on June 8
  console.log("\n=== Bookings on 2026-06-08 ===\n");
  const jun8 = await p.$queryRawUnsafe<Array<Record<string,unknown>>>(
    `SELECT b.booking_reference, b.status, bl.origin_code, bl.destination_code, bl.leg_date::text as ld
     FROM booking_legs bl JOIN bookings b ON b.id = bl.booking_id
     WHERE bl.leg_date = '2026-06-08' AND b.status != 'cancelled' LIMIT 20`
  );
  console.log(`Count: ${jun8.length}`);
  for (const b of jun8) console.log(`  ${b.booking_reference} | ${b.status} | ${b.origin_code} -> ${b.destination_code} | ${b.ld}`);

  // 3. Check day of week for June 8
  const d = new Date("2026-06-08");
  console.log(`\n2026-06-08 is a ${d.toLocaleDateString("en-US", { weekday: "long" })} (day ${d.getDay()})`);

  // 4. Find ALL bookings on no-fly days (Sundays + one-off holidays)
  console.log("\n=== Bookings on No-Fly Days (Apr 1 - Jun 5 past only) ===\n");
  const suspicious = await p.$queryRawUnsafe<Array<Record<string,unknown>>>(
    `SELECT bl.leg_date::text as ld, COUNT(*)::int as cnt
     FROM booking_legs bl JOIN bookings b ON b.id = bl.booking_id
     WHERE bl.leg_date BETWEEN '2026-04-01' AND '2026-06-05'
       AND b.status != 'cancelled'
       AND (EXTRACT(DOW FROM bl.leg_date) = 0 OR bl.leg_date::date IN ('2026-04-03','2026-04-06'))
     GROUP BY bl.leg_date ORDER BY ld`
  );
  console.log("Bookings on no-fly days (Sundays + holidays):");
  for (const s of suspicious) console.log(`  ${s.ld}: ${s.cnt} bookings`);

  await p.$disconnect();
}
main();
