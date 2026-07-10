import { db } from "../app/utils/db.server";
import { sql } from "kysely";

async function resetAll() {
  const dates = [
    new Date().toISOString().slice(0, 10),
    new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
  ];
  console.log("Resetting test data for dates:", dates.join(", "));

  // 1. Clear flight_leg_id from booking_leg_passengers
  await sql`
    UPDATE booking_leg_passengers SET flight_leg_id = NULL
    WHERE booking_leg_id IN (
      SELECT bl.id FROM booking_legs bl
      WHERE bl.leg_date = ANY(${dates}::date[])
    )
  `.execute(db);

  // 2. Delete flight_legs for test flights
  await sql`
    DELETE FROM flight_legs
    WHERE flight_id IN (
      SELECT f.id FROM flights f
      JOIN schedules s ON s.id = f.schedule_id
      WHERE s.schedule_date = ANY(${dates}::date[])
    )
  `.execute(db);

  // 3. Clear flight_id from booking_legs (unassign)
  await sql`
    UPDATE booking_legs SET flight_id = NULL
    WHERE leg_date = ANY(${dates}::date[])
  `.execute(db);

  // 4. Delete loadsheets referencing test flights
  await sql`
    DELETE FROM loadsheets
    WHERE flight_id IN (
      SELECT f.id FROM flights f
      JOIN schedules s ON s.id = f.schedule_id
      WHERE s.schedule_date = ANY(${dates}::date[])
    )
  `.execute(db);

  // 5. Delete flights
  await sql`
    DELETE FROM flights
    WHERE schedule_id IN (
      SELECT s.id FROM schedules s
      WHERE s.schedule_date = ANY(${dates}::date[])
    )
  `.execute(db);

  // 5. Reset schedule status to draft
  await sql`
    UPDATE schedules SET status = 'draft', approved_by = NULL, approved_at = NULL,
      published_by = NULL, published_at = NULL
    WHERE schedule_date = ANY(${dates}::date[])
  `.execute(db);

  // 6. Clean up TST and DRAG booking data
  await sql`DELETE FROM booking_leg_passengers WHERE booking_leg_id IN (SELECT bl.id FROM booking_legs bl JOIN bookings b ON b.id = bl.booking_id WHERE b.booking_reference LIKE 'TST-%' OR b.booking_reference LIKE 'DRAG-%')`.execute(db);
  await sql`DELETE FROM booking_legs WHERE booking_id IN (SELECT id FROM bookings WHERE booking_reference LIKE 'TST-%' OR booking_reference LIKE 'DRAG-%')`.execute(db);
  await sql`DELETE FROM booking_passengers WHERE booking_id IN (SELECT id FROM bookings WHERE booking_reference LIKE 'TST-%' OR booking_reference LIKE 'DRAG-%')`.execute(db);
  await sql`DELETE FROM bookings WHERE booking_reference LIKE 'TST-%' OR booking_reference LIKE 'DRAG-%'`.execute(db);

  console.log("Reset complete.");
  process.exit(0);
}

resetAll().catch((err) => { console.error(err); process.exit(1); });
