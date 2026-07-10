import { db } from "../app/utils/db.server";
import { sql } from "kysely";

async function main() {
  // 1. Find the date (not today) with the most bookings
  const dates = await sql<{ leg_date: string; cnt: number }>`
    SELECT bl.leg_date, COUNT(*)::int as cnt
    FROM booking_legs bl
    WHERE bl.leg_date != CURRENT_DATE
    GROUP BY bl.leg_date
    ORDER BY cnt DESC
    LIMIT 5
  `.execute(db);
  
  console.log("Dates with most bookings:");
  dates.rows.forEach(r => console.log(`  ${r.leg_date}: ${r.cnt}`));
  
  if (dates.rows.length === 0) { console.log("No bookings found"); process.exit(1); }
  
  // 2. Pick the richest date and free its bookings + delete its flights + schedules
  const target = dates.rows[0].leg_date;
  console.log(`\nTargeting: ${target}`);
  
  // Find flights on that date to delete
  const flights = await sql<{ id: number; schedule_id: number }>`
    SELECT f.id, f.schedule_id FROM flights f
    JOIN schedules s ON s.id = f.schedule_id
    WHERE s.schedule_date = ${target}::date
  `.execute(db);
  
  console.log(`Flights to free: ${flights.rows.length}`);
  
  for (const f of flights.rows) {
    // Unassign booking legs
    await sql`UPDATE booking_legs SET flight_id = NULL WHERE flight_id = ${f.id}`.execute(db);
    // Delete flight legs
    await sql`DELETE FROM flight_legs WHERE flight_id = ${f.id}`.execute(db);
    // Delete W&B snapshots
    await sql`DELETE FROM weight_balance_snapshots WHERE flight_leg_id IN (SELECT id FROM flight_legs WHERE flight_id = ${f.id})`.execute(db);
    // Delete pilot assignments
    await sql`DELETE FROM pilot_assignments WHERE flight_id = ${f.id}`.execute(db);
    // Delete the flight
    await sql`DELETE FROM flights WHERE id = ${f.id}`.execute(db);
  }
  
  // Delete the schedules too (auto-build creates new ones)
  for (const f of flights.rows) {
    await sql`DELETE FROM schedules WHERE id = ${f.schedule_id}`.execute(db);
  }
  
  // 3. Verify unassigned count
  const verify = await sql<{ cnt: number }>`
    SELECT COUNT(*)::int as cnt FROM booking_legs
    WHERE leg_date = ${target}::date AND flight_id IS NULL
  `.execute(db);
  
  console.log(`\nUnassigned bookings on ${target}: ${verify.rows[0].cnt}`);
  console.log(`Navigate to /operations/schedule?date=${target} for auto-build test`);
  process.exit(0);
}

main();
