import { db } from "../app/utils/db.server";
import { sql } from "kysely";

async function main() {
  const date = process.argv[2] || "2026-11-17";
  
  // Check schedule status
  const sched = await sql<{ id: number; status: string }>`
    SELECT id, status FROM schedules WHERE schedule_date = ${date}::date
  `.execute(db);
  
  if (sched.rows.length === 0) {
    console.log(`No schedule for ${date}`);
    process.exit(0);
  }
  
  const { id, status } = sched.rows[0];
  console.log(`Schedule #${id} on ${date}: ${status}`);
  
  if (status === "draft" || status === "building") {
    // Cancel it: delete flights, flight_legs, W&B, pilot_assignments, then the schedule
    await sql`UPDATE booking_legs SET flight_id = NULL WHERE flight_id IN (SELECT id FROM flights WHERE schedule_id = ${id})`.execute(db);
    await sql`DELETE FROM pilot_assignments WHERE flight_id IN (SELECT id FROM flights WHERE schedule_id = ${id})`.execute(db);
    await sql`DELETE FROM weight_balance_snapshots WHERE flight_leg_id IN (SELECT id FROM flight_legs WHERE flight_id IN (SELECT id FROM flights WHERE schedule_id = ${id}))`.execute(db);
    await sql`DELETE FROM flight_legs WHERE flight_id IN (SELECT id FROM flights WHERE schedule_id = ${id})`.execute(db);
    await sql`DELETE FROM flights WHERE schedule_id = ${id}`.execute(db);
    await sql`DELETE FROM schedules WHERE id = ${id}`.execute(db);
    console.log(`Cleared schedule #${id} — ${date} is now free for auto-build`);
  } else {
    console.log(`Schedule is ${status} — not clearing`);
  }
  
  process.exit(0);
}

main();
