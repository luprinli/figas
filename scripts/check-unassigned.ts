import { db } from "../app/utils/db.server";
import { sql } from "kysely";

async function main() {
  const r = await sql<{ legs: number; unassigned: number; flights: number; drafts: number }>`
    SELECT
      (SELECT COUNT(*) FROM booking_legs) AS legs,
      (SELECT COUNT(*) FROM booking_legs WHERE flight_id IS NULL) AS unassigned,
      (SELECT COUNT(*) FROM flights) AS flights,
      (SELECT COUNT(*) FROM schedules WHERE status = 'draft') AS drafts
  `.execute(db);
  
  const d = r.rows[0];
  console.log(`booking_legs: ${d.legs} total, ${d.unassigned} unassigned`);
  console.log(`flights: ${d.flights}, draft schedules: ${d.drafts}`);
  
  if (d.unassigned > 0) {
    const dates = await sql<{ leg_date: string; cnt: number }>`
      SELECT leg_date, COUNT(*)::int as cnt FROM booking_legs
      WHERE flight_id IS NULL GROUP BY leg_date ORDER BY leg_date LIMIT 5
    `.execute(db);
    console.log("Dates with unassigned:");
    dates.rows.forEach(r => console.log(`  ${r.leg_date}: ${r.cnt}`));
  }
  process.exit(0);
}
main();
