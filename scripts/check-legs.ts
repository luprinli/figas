import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL!, { disposeExternalPool: true });
const p = new PrismaClient({ adapter });

async function main() {
  // Check legs for problematic flights
  const problematicFns = ["FIG-20260101-001","FIG-20260101-002","FIG-20260101-004","FIG-20260109-005","FIG-20260605-010"];
  for (const fn of problematicFns) {
    const legs = await p.$queryRawUnsafe<Array<{ln:number;orig:string;dest:string}>>(
      `SELECT fl.leg_number as ln, fl.origin_code as orig, fl.destination_code as dest
       FROM flight_legs fl JOIN flights f ON f.id = fl.flight_id
       WHERE f.flight_number = $1 ORDER BY fl.leg_number`, fn
    );
    console.log(`${fn}:`);
    for (const l of legs) console.log(`  Leg ${l.ln}: ${l.orig} -> ${l.dest}`);
  }

  // Check booking counts per origin for unassigned
  const origins = await p.$queryRawUnsafe<Array<{orig:string;cnt:number}>>(
    `SELECT origin_code as orig, COUNT(*)::int as cnt FROM booking_legs
     WHERE leg_date < '2026-06-06' AND flight_id IS NULL AND status NOT IN ('cancelled')
     GROUP BY origin_code ORDER BY cnt DESC LIMIT 10`
  );
  console.log("\nUnassigned booking origins (past dates):");
  for (const o of origins) console.log(`  ${o.orig}: ${o.cnt}`);

  await p.$disconnect();
}
main();
