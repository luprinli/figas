/**
 * Diagnostic: Check current state of assigned legs and future flights
 *
 * Usage:
 *   node --env-file .env --import tsx prisma/diagnostic-schedule.ts
 */

import { db } from "../app/utils/db.server";

async function main() {
  console.log("=".repeat(60));
  console.log("SCHEDULE PAGE DIAGNOSTIC");
  console.log("=".repeat(60));

  // ── Step 1: Assigned vs unassigned booking legs ────────────────────
  const assignedLegs = await db.$queryRawUnsafe<
    { cnt: bigint }[]
  >(`SELECT COUNT(*) as cnt FROM booking_legs WHERE flight_id IS NOT NULL`);
  const unassignedLegs = await db.$queryRawUnsafe<
    { cnt: bigint }[]
  >(`SELECT COUNT(*) as cnt FROM booking_legs WHERE flight_id IS NULL`);
  const totalLegs = await db.$queryRawUnsafe<
    { cnt: bigint }[]
  >(`SELECT COUNT(*) as cnt FROM booking_legs`);

  console.log("\n--- Booking Legs ---");
  console.log(`Total booking legs:       ${totalLegs[0].cnt}`);
  console.log(`Assigned (flight_id NOT NULL): ${assignedLegs[0].cnt}`);
  console.log(`Unassigned (flight_id IS NULL): ${unassignedLegs[0].cnt}`);

  // ── Step 2: Flights on future schedules ───────────────────────────
  const futureFlights = await db.$queryRawUnsafe<
    { cnt: bigint }[]
  >(`SELECT COUNT(*) as cnt FROM flights f
     JOIN schedules s ON s.id = f.schedule_id
     WHERE s.schedule_date >= CURRENT_DATE`);
  const allFlights = await db.$queryRawUnsafe<
    { cnt: bigint }[]
  >(`SELECT COUNT(*) as cnt FROM flights`);
  const allSchedules = await db.$queryRawUnsafe<
    { cnt: bigint }[]
  >(`SELECT COUNT(*) as cnt FROM schedules`);

  console.log("\n--- Flights & Schedules ---");
  console.log(`Total schedules:      ${allSchedules[0].cnt}`);
  console.log(`Total flights:        ${allFlights[0].cnt}`);
  console.log(`Flights on future schedules: ${futureFlights[0].cnt}`);

  // ── Step 3: Future schedule details ───────────────────────────────
  const futureSchedules = await db.$queryRawUnsafe<
    { id: number; schedule_date: Date; status: string; flight_count: bigint }[]
  >(`SELECT s.id, s.schedule_date, s.status,
            COUNT(f.id) as flight_count
     FROM schedules s
     LEFT JOIN flights f ON f.schedule_id = s.id
     WHERE s.schedule_date >= CURRENT_DATE
     GROUP BY s.id, s.schedule_date, s.status
     ORDER BY s.schedule_date
     LIMIT 10`);

  console.log("\n--- Future Schedules (up to 10) ---");
  for (const sched of futureSchedules) {
    const dateStr = new Date(sched.schedule_date).toISOString().split("T")[0];
    console.log(
      `  ${dateStr} | id=${sched.id} | status=${sched.status} | flights=${sched.flight_count}`
    );
  }

  // ── Step 4: Unassigned booking legs with future dates ─────────────
  const futureUnassigned = await db.$queryRawUnsafe<
    { leg_date: Date; cnt: bigint }[]
  >(`SELECT bl.leg_date, COUNT(*) as cnt
     FROM booking_legs bl
     WHERE bl.flight_id IS NULL AND bl.leg_date >= CURRENT_DATE
     GROUP BY bl.leg_date
     ORDER BY bl.leg_date
     LIMIT 10`);

  console.log("\n--- Unassigned Booking Legs (Future Dates, up to 10) ---");
  if (futureUnassigned.length === 0) {
    console.log("  NONE");
  } else {
    for (const row of futureUnassigned) {
      const dateStr = new Date(row.leg_date).toISOString().split("T")[0];
      console.log(`  ${dateStr}: ${row.cnt} legs`);
    }
  }

  // ── Step 5: booking_leg_passengers linked to assigned legs ────────
  const assignedBlp = await db.$queryRawUnsafe<
    { cnt: bigint }[]
  >(`SELECT COUNT(*) as cnt FROM booking_leg_passengers blp
     JOIN booking_legs bl ON bl.id = blp.booking_leg_id
     WHERE bl.flight_id IS NOT NULL`);

  console.log("\n--- Passenger Records ---");
  console.log(`booking_leg_passengers linked to assigned legs: ${assignedBlp[0].cnt}`);

  // ── Step 6: Check if any assigned legs have matching future-dated flights ──
  const assignedWithFuture = await db.$queryRawUnsafe<
    { cnt: bigint }[]
  >(`SELECT COUNT(*) as cnt FROM booking_legs bl
     JOIN flights f ON f.id = bl.flight_id
     JOIN schedules s ON s.id = f.schedule_id
     WHERE s.schedule_date >= CURRENT_DATE`);

  console.log(`Assigned legs pointing to future-dated flights: ${assignedWithFuture[0].cnt}`);

  // ── Step 7: Detailed view of assigned legs with flights ─────────
  console.log("\n--- Assigned Legs Detail ---");
  const assignedDetail = await db.$queryRawUnsafe<
    { leg_id: number; flight_id: number; leg_date: Date; origin_code: string;
      destination_code: string; flight_number: string; schedule_date: Date; schedule_id: number }[]
  >(`SELECT bl.id as leg_id, bl.flight_id, bl.leg_date, bl.origin_code, bl.destination_code,
            f.flight_number, s.schedule_date, s.id as schedule_id
     FROM booking_legs bl
     JOIN flights f ON f.id = bl.flight_id
     JOIN schedules s ON s.id = f.schedule_id
     WHERE bl.flight_id IS NOT NULL
     ORDER BY s.schedule_date`);

  for (const row of assignedDetail) {
    const legDate = new Date(row.leg_date).toISOString().split("T")[0];
    const schedDate = new Date(row.schedule_date).toISOString().split("T")[0];
    console.log(
      `  leg_id=${row.leg_id} flight=${row.flight_number} (fid=${row.flight_id}) ` +
      `schedule=${schedDate} (sid=${row.schedule_id}) leg_date=${legDate} ` +
      `${row.origin_code}→${row.destination_code}`
    );
  }

  // ── Step 8: Passenger names on assigned legs ───────────────────
  console.log("\n--- Passengers on Assigned Legs ---");
  const assignedPassengers = await db.$queryRawUnsafe<
    { leg_id: number; passenger_name: string; booking_ref: string;
      origin_code: string; destination_code: string }[]
  >(`SELECT bl.id as leg_id,
            CONCAT(bp.first_name, ' ', bp.last_name) AS passenger_name,
            b.booking_reference AS booking_ref,
            bl.origin_code, bl.destination_code
     FROM booking_leg_passengers blp
     JOIN booking_legs bl ON bl.id = blp.booking_leg_id
     JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
     JOIN bookings b ON b.id = bl.booking_id
     WHERE bl.flight_id IS NOT NULL
     ORDER BY bl.id, bp.first_name`);

  if (assignedPassengers.length === 0) {
    console.log("  NONE (no passengers linked to assigned booking legs)");
  } else {
    for (const row of assignedPassengers) {
      console.log(
        `  leg_id=${row.leg_id} | ${row.passenger_name} | ${row.booking_ref} | ${row.origin_code}→${row.destination_code}`
      );
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("DIAGNOSTIC COMPLETE");

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
