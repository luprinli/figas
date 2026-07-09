import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL!, { disposeExternalPool: true });
const p = new PrismaClient({ adapter });

async function main() {
  console.log("=== Flight Integrity Check ===\n");

  // Check flight structure
  const flights = await p.$queryRawUnsafe<Array<{fn:string;orig:string;dest:string;dep:string;legs:number}>>(
    `SELECT f.flight_number as fn, f.origin_code as orig, f.destination_code as dest,
            f.departure_time::date::text as dep,
            (SELECT COUNT(*) FROM flight_legs fl WHERE fl.flight_id = f.id) as legs
     FROM flights f ORDER BY departure_time`
  );

  console.log("All flights:");
  let stvStartEndOk = 0;
  let stvIssues = 0;
  for (const f of flights) {
    const firstLeg = await p.$queryRawUnsafe<Array<{orig:string}>>(
      "SELECT origin_code as orig FROM flight_legs WHERE flight_id = (SELECT id FROM flights WHERE flight_number = $1) ORDER BY leg_number LIMIT 1", f.fn
    );
    const lastLeg = await p.$queryRawUnsafe<Array<{dest:string}>>(
      "SELECT destination_code as dest FROM flight_legs WHERE flight_id = (SELECT id FROM flights WHERE flight_number = $1) ORDER BY leg_number DESC LIMIT 1", f.fn
    );
    const startStv = firstLeg.length > 0 && firstLeg[0].orig === "STY";
    const endStv = lastLeg.length > 0 && lastLeg[0].dest === "STY";
    const ok = startStv && endStv;
    const icon = ok ? "✅" : "⚠️";
    if (ok) stvStartEndOk++; else stvIssues++;
    console.log(`  ${icon} ${f.fn} (${f.dep}) — ${f.legs} legs${!ok ? ' NOT STY start/end' : ''}`);
  }

  // Schedule counts
  const pastSch = await p.$queryRawUnsafe<Array<{cnt:number}>>("SELECT COUNT(*)::int as cnt FROM schedules WHERE schedule_date < '2026-06-06'");
  const futureSch = await p.$queryRawUnsafe<Array<{cnt:number}>>("SELECT COUNT(*)::int as cnt FROM schedules WHERE schedule_date >= '2026-06-06'");

  console.log(`\nPast schedules: ${pastSch[0].cnt} | Future schedules: ${futureSch[0].cnt}`);
  console.log(`STY start+end OK: ${stvStartEndOk}/${flights.length} | Issues: ${stvIssues}`);

  // Unassigned bookings
  const unassigned = await p.$queryRawUnsafe<Array<{cnt:number}>>(
    "SELECT COUNT(*)::int as cnt FROM booking_legs WHERE flight_id IS NULL AND status NOT IN ('cancelled') AND leg_date < '2026-06-06'"
  );
  console.log(`\nRemaining unassigned booking legs (past): ${unassigned[0].cnt}`);

  await p.$disconnect();
}
main();
