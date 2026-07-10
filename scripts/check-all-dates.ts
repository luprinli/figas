import { db } from "../app/utils/db.server";
import { sql } from "kysely";

async function main() {
  const allDates = await sql`SELECT DISTINCT leg_date FROM booking_legs ORDER BY leg_date`.execute(db);
  console.log("All distinct leg_dates in booking_legs:");
  for (const r of allDates.rows) {
    const legDate = (r as any).leg_date;
    const cnt = await sql`SELECT COUNT(*)::int as c FROM booking_legs WHERE leg_date = ${legDate}::date AND flight_id IS NULL`.execute(db);
    const total = await sql`SELECT COUNT(*)::int as c FROM booking_legs WHERE leg_date = ${legDate}::date`.execute(db);
    console.log(`${legDate} | total: ${(total.rows[0] as any).c} | unassigned: ${(cnt.rows[0] as any).c}`);
  }

  const sched = await sql`SELECT COUNT(*)::int as c FROM schedules`.execute(db);
  console.log("\nTotal schedules:", (sched.rows[0] as any).c);

  const recentBookings = await sql`SELECT id, booking_reference, created_at FROM bookings ORDER BY created_at DESC LIMIT 5`.execute(db);
  console.log("\nRecent bookings:");
  for (const r of recentBookings.rows) {
    const row = r as any;
    console.log(row.id, row.booking_reference, row.created_at);
  }
}

main().catch(console.error).finally(() => process.exit(0));
