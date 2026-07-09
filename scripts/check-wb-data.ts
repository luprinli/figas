import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!, { disposeExternalPool: true }) });

async function main() {
  // Find flights with most passengers
  const big = await p.$queryRawUnsafe<Array<{ flight_number: string; pax_count: number; pax_wt: string; bag_wt: string }>>(`
    SELECT f.flight_number, f.id,
           COUNT(blp.id)::int as pax_count,
           COALESCE(SUM(COALESCE(blp.clothed_weight_kg, 70)), 0)::text as pax_wt,
           COALESCE(SUM(blp.baggage_weight_kg), 0)::text as bag_wt
    FROM flights f
    JOIN booking_legs bl ON bl.flight_id = f.id
    JOIN booking_leg_passengers blp ON blp.booking_leg_id = bl.id
    GROUP BY f.id, f.flight_number
    ORDER BY COUNT(blp.id) DESC
    LIMIT 10`);
  console.log("Flights by passenger count:");
  for (const r of big) console.log(`  ${r.flight_number}: ${r.pax_count} pax, ${r.pax_wt}kg, ${r.bag_wt}kg bag`);

  // Check existing w&b snapshots for values
  const wb = await p.$queryRawUnsafe<Array<Record<string, unknown>>>(`
    SELECT flight_leg_id, passenger_weight_kg::text, baggage_weight_kg::text,
           total_weight_kg::text, total_moment_kgm::text, cg_position_pct::text,
           mtow_used_pct::text, mlw_used_pct::text
    FROM weight_balance_snapshots ORDER BY total_weight_kg DESC LIMIT 5`);
  console.log("\nExisting W&B snapshots (largest by weight):");
  for (const r of wb) console.log(JSON.stringify(r));

  // Check schedules that had errors
  console.log("\nSchedules with status:");
  const sched = await p.$queryRawUnsafe<Array<Record<string, unknown>>>(`
    SELECT schedule_date::text, status, notes
    FROM schedules ORDER BY schedule_date DESC LIMIT 10`);
  for (const r of sched) console.log(JSON.stringify(r));

  await p.$disconnect();
}
main();
