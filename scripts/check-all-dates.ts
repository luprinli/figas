import { db } from "../app/utils/db.server";

async function main() {
  // Check ALL booking legs with their leg_dates
  const allDates = await db.query(
    `SELECT DISTINCT leg_date FROM booking_legs ORDER BY leg_date`
  );
  console.log("All distinct leg_dates in booking_legs:");
  for (const r of allDates.rows) {
    const cnt = await db.query(
      `SELECT COUNT(*)::int as c FROM booking_legs WHERE leg_date = $1::date AND flight_id IS NULL`,
      [r.leg_date]
    );
    const total = await db.query(
      `SELECT COUNT(*)::int as c FROM booking_legs WHERE leg_date = $1::date`,
      [r.leg_date]
    );
    console.log(`${r.leg_date} | total: ${total.rows[0].c} | unassigned: ${cnt.rows[0].c}`);
  }

  // Check schedules
  const sched = await db.query(`SELECT COUNT(*)::int as c FROM schedules`);
  console.log("\nTotal schedules:", sched.rows[0].c);

  // Check bookings
  const recentBookings = await db.query(
    `SELECT id, booking_reference, created_at FROM bookings ORDER BY created_at DESC LIMIT 5`
  );
  console.log("\nRecent bookings:");
  for (const r of recentBookings.rows) {
    console.log(r.id, r.booking_reference, r.created_at);
  }
}

main().catch(console.error).finally(() => process.exit(0));
