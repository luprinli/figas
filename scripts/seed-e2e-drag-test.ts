/**
 * Seeds additional unassigned bookings across multiple dates for the E2E
 * drag-and-drop validation test suite.
 *
 * Creates 14 bookings (28+ passengers) spread across 3 dates:
 *   - Day 0 (today):     5 bookings, 12 passengers (mixed origins/destinations)
 *   - Day 1 (tomorrow):  5 bookings, 10 passengers
 *   - Day 2 (day+2):     4 bookings,  8 passengers
 *
 * Usage:
 *   npx tsx scripts/seed-e2e-drag-test.ts
 *
 * Pre-requisites:
 *   - Database must be migrated and have basic reference data (aerodromes, users)
 *   - Run `npm run seed:full` or `npm run seed` first for baseline data
 */

import { db } from "../app/utils/db.server";
import { scheduleRepository } from "../app/utils/repositories/schedule";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function seedE2EDragTest() {
  console.log("🌱 Seeding E2E drag-test data...\n");

  const day0 = todayISO();
  const day1 = daysFromNow(1);
  const day2 = daysFromNow(2);

  // 1. Get admin user
  const userResult = await db.query(
    "SELECT id, name FROM users WHERE email = 'admin@figas.gov.fk' LIMIT 1"
  );
  if (userResult.rows.length === 0) {
    console.error("❌ Admin user not found. Run seed:full or seed:users first.");
    process.exit(1);
  }
  const userId = Number(userResult.rows[0].id);
  console.log(`  Admin user: "${userResult.rows[0].name}" (id=${userId})`);

  // 2. Get aerodrome codes (first 6 active ones for variety)
  const aerodromes = await db.query(
    "SELECT code FROM aerodromes WHERE is_active = true ORDER BY code LIMIT 8"
  );
  if (aerodromes.rows.length < 4) {
    console.error("❌ Need at least 4 active aerodromes.");
    process.exit(1);
  }
  const aeroCodes = aerodromes.rows.map((r: Record<string, unknown>) => r.code);
  console.log(`  Aerodromes available: ${aeroCodes.join(", ")}\n`);

  // 3. Ensure schedules exist for all target dates
  for (const date of [day0, day1, day2]) {
    let s = await scheduleRepository.findByDate(date);
    if (!s) {
      s = await scheduleRepository.create({
        schedule_date: date,
        created_by: userId,
        notes: `E2E drag-test schedule for ${date}`,
      });
      console.log(`  Created schedule for ${date} (id=${s.id})`);
    } else {
      console.log(`  Schedule exists for ${date} (id=${s.id})`);
    }
  }

  // 4. Booking definitions with distinct passenger names per group
  const bookingDefs = [
    // ──── DAY 0 (today) ────
    { ref: "DRAG-001", names: ["Oliver Stone", "Emma Watson", "Liam Neeson"], origin: aeroCodes[0], dest: aeroCodes[3], weight: 75, date: day0 },
    { ref: "DRAG-002", names: ["Mia Chen", "Zoe Saldana"], origin: aeroCodes[0], dest: aeroCodes[4], weight: 80, date: day0 },
    { ref: "DRAG-003", names: ["Liam O'Brien", "Noah Reed", "Ava Price", "Ella Hart"], origin: aeroCodes[1], dest: aeroCodes[0], weight: 70, date: day0 },
    { ref: "DRAG-004", names: ["Sophia Patel"], origin: aeroCodes[0], dest: aeroCodes[2], weight: 95, date: day0 },
    { ref: "DRAG-005", names: ["Noah Kim", "Ivy Song"], origin: aeroCodes[2], dest: aeroCodes[0], weight: 85, date: day0 },
    // ──── DAY 1 (tomorrow) ────
    { ref: "DRAG-006", names: ["Ava Garcia", "Leo Mendez", "Rosa Vega"], origin: aeroCodes[0], dest: aeroCodes[3], weight: 75, date: day1 },
    { ref: "DRAG-007", names: ["Ethan Wright", "Owen Bryce"], origin: aeroCodes[0], dest: aeroCodes[1], weight: 80, date: day1 },
    { ref: "DRAG-008", names: ["Isabella Lee"], origin: aeroCodes[3], dest: aeroCodes[0], weight: 90, date: day1 },
    { ref: "DRAG-009", names: ["Mason Hall", "Tessa Lane"], origin: aeroCodes[0], dest: aeroCodes[5] || aeroCodes[0], weight: 75, date: day1 },
    { ref: "DRAG-010", names: ["Charlotte Diaz", "Ryan Firth"], origin: aeroCodes[1], dest: aeroCodes[4], weight: 70, date: day1 },
    // ──── DAY 2 (day after tomorrow) ────
    { ref: "DRAG-011", names: ["James Martin", "Henry Ford", "Grace Hopper"], origin: aeroCodes[0], dest: aeroCodes[2], weight: 80, date: day2 },
    { ref: "DRAG-012", names: ["Amelia White"], origin: aeroCodes[0], dest: aeroCodes[4], weight: 100, date: day2 },
    { ref: "DRAG-013", names: ["Benjamin Clark", "Clara Barton"], origin: aeroCodes[2], dest: aeroCodes[0], weight: 75, date: day2 },
    { ref: "DRAG-014", names: ["Harper Young", "Felix Baum"], origin: aeroCodes[3], dest: aeroCodes[1], weight: 70, date: day2 },
  ];

  let totalBookings = 0;
  let totalPassengers = 0;

  for (const b of bookingDefs) {
    const existing = await db.query(
      "SELECT id FROM bookings WHERE booking_reference = $1",
      [b.ref]
    );
    if (existing.rows.length > 0) {
      console.log(`  ⏭  Skipping ${b.ref} (already exists)`);
      continue;
    }

    const booking = await db.query(
      `INSERT INTO bookings (user_id, booking_reference, status, is_organization_billing, payment_status, total_amount, booking_source, created_by)
       VALUES ($1, $2, 'confirmed', false, 'pending', 100.00, 'online', $3)
       RETURNING id`,
      [userId, b.ref, userId]
    );
    const bookingId = booking.rows[0].id;

    const legResult = await db.query(
      `INSERT INTO booking_legs (booking_id, origin_code, destination_code, leg_date, departure_date, leg_sequence, status)
       VALUES ($1, $2, $3, $4, $4, 1, 'confirmed')
       RETURNING id`,
      [bookingId, b.origin, b.dest, b.date]
    );
    const bookingLegId = legResult.rows[0].id;

    for (let i = 0; i < b.names.length; i++) {
      const passengerName = b.names[i];
      const parts = passengerName.split(" ");
      const firstName = parts[0];
      const lastName = parts.slice(1).join(" ") || "Passenger";

      const bpResult = await db.query(
        `INSERT INTO booking_passengers (booking_id, first_name, last_name, clothed_body_weight_kg)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [bookingId, firstName, lastName, b.weight]
      );
      const bpId = bpResult.rows[0].id;

      await db.query(
        `INSERT INTO booking_leg_passengers (booking_leg_id, booking_passenger_id, clothed_weight_kg, baggage_weight_kg)
         VALUES ($1, $2, $3, $4)`,
        [bookingLegId, bpId, b.weight, 10]
      );
    }

    totalBookings++;
    totalPassengers += b.names.length;
    console.log(`  ✅ ${b.ref}: ${b.names.length} pax, ${b.origin}→${b.dest}, date=${b.date}, weight=${b.weight}kg/ea`);
  }

  // 5. Verify the seeded data
  console.log("\n📊 Verification:");
  for (const date of [day0, day1, day2]) {
    const count = await db.query(
      `SELECT COUNT(*) as cnt FROM booking_legs bl
       JOIN bookings b ON b.id = bl.booking_id
       WHERE bl.leg_date = $1 AND bl.flight_id IS NULL`,
      [date]
    );
    const paxCount = await db.query(
      `SELECT COUNT(*) as cnt FROM booking_leg_passengers blp
       JOIN booking_legs bl ON bl.id = blp.booking_leg_id
       WHERE bl.leg_date = $1 AND bl.flight_id IS NULL`,
      [date]
    );
    console.log(`  ${date}: ${count.rows[0].cnt} unassigned bookings, ${paxCount.rows[0].cnt} unassigned passengers`);
  }

  console.log(`\n✅ Seed complete!`);
  console.log(`  Total: ${totalBookings} new bookings, ${totalPassengers} new passengers`);
  console.log(`  (Additional bookings may exist from prior seed runs)\n`);
  console.log("  Ready for E2E drag-and-drop tests.\n");
}

seedE2EDragTest().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
