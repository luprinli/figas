/**
 * Seed utility for creating test data for the scheduling system.
 *
 * Usage:
 *   npx tsx app/utils/seed.ts
 *
 * This script creates:
 * - A test schedule for today
 * - Test unassigned bookings for today and future dates
 */

import { db } from "./db.server";
import { sql } from "kysely";
import { scheduleRepository } from "./repositories/schedule";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function seed() {
  console.log("🌱 Seeding scheduling test data...");
  const today = todayISO();
  const tomorrow = daysFromNow(1);
  const nextWeek = daysFromNow(7);

  // 1. Use the existing admin user (id=1, admin@figas.gov.fk)
  const userResult = await sql`
    SELECT id, name FROM users WHERE role = 'admin' ORDER BY id LIMIT 1
  `.execute(db);
  if (userResult.rows.length === 0) {
    console.error("  ❌ No admin user found. Run the main seed script first.");
    process.exit(1);
  }
  const userId = Number((userResult.rows[0] as { id: number | bigint }).id);
  console.log(`  Using admin user "${(userResult.rows[0] as { name: string }).name}" (id=${userId})`);

  // 2. Get aerodrome codes
  const aerodromes = await sql`
    SELECT id, code FROM aerodromes ORDER BY code LIMIT 10
  `.execute(db);
  if (aerodromes.rows.length < 2) {
    console.error("  ❌ Need at least 2 aerodromes in the database. Run migrations first.");
    process.exit(1);
  }
  const aeroCodes = aerodromes.rows.map((r) => (r as { code: string }).code);
  console.log(`  Found ${aerodromes.rows.length} aerodromes`);

  // 3. Create a schedule for today
  let schedule = await scheduleRepository.findByDate(today);
  if (!schedule) {
    schedule = await scheduleRepository.create({
      schedule_date: today,
      created_by: userId,
      notes: "Test schedule for e2e verification",
    });
    console.log(`  Created schedule for ${today} (id=${schedule.id})`);
  } else {
    console.log(`  Schedule already exists for ${today} (id=${schedule.id})`);
  }

  // 4. Create schedules for tomorrow and next week if they don't exist
  for (const date of [tomorrow, nextWeek]) {
    let s = await scheduleRepository.findByDate(date);
    if (!s) {
      s = await scheduleRepository.create({
        schedule_date: date,
        created_by: userId,
        notes: `Test schedule for ${date}`,
      });
      console.log(`  Created schedule for ${date} (id=${s.id})`);
    }
  }

  // 5. Create test unassigned bookings for today
  const todayBookings = [
    { ref: "TST-001", name: "Alice Johnson", origin: aeroCodes[0], dest: aeroCodes[1], pax: 2 },
    { ref: "TST-002", name: "Bob Smith", origin: aeroCodes[0], dest: aeroCodes[2], pax: 1 },
    { ref: "TST-003", name: "Carol Davis", origin: aeroCodes[1], dest: aeroCodes[3], pax: 3 },
    { ref: "TST-004", name: "David Wilson", origin: aeroCodes[2], dest: aeroCodes[0], pax: 1 },
  ];

  for (const b of todayBookings) {
    // Check if booking already exists
    const existing = await sql`
      SELECT id FROM bookings WHERE booking_reference = ${b.ref}
    `.execute(db);
    if (existing.rows.length > 0) {
      console.log(`  Booking ${b.ref} already exists`);
      continue;
    }

    // Create booking (user_id = admin user)
    const booking = await sql`
      INSERT INTO bookings (user_id, booking_reference, status, is_organization_billing, payment_status, total_amount, booking_source, created_by)
       VALUES (${userId}, ${b.ref}, 'confirmed', false, 'pending', 100.00, 'online', ${userId})
       RETURNING id
    `.execute(db);
    const bookingId = (booking.rows[0] as { id: number | bigint }).id;

    // Create booking leg (unassigned - no flight_id)
    // Use origin_code/destination_code as varchar columns
    const legResult = await sql`
      INSERT INTO booking_legs (booking_id, origin_code, destination_code, leg_date, departure_date, leg_sequence, status)
       VALUES (${bookingId}, ${b.origin}, ${b.dest}, ${today}, ${today}, 1, 'confirmed')
       RETURNING id
    `.execute(db);
    const bookingLegId = (legResult.rows[0] as { id: number | bigint }).id;

    // Create booking_passengers for this booking so that handleAssignBooking
    // can find passengers via findByBookingLegId() (which joins booking_leg_passengers
    // with booking_passengers).
    for (let i = 0; i < b.pax; i++) {
      const passengerName = i === 0 ? b.name : `${b.name} Guest ${i + 1}`;
      const bpResult = await sql`
        INSERT INTO booking_passengers (booking_id, first_name, last_name, clothed_weight_kg, baggage_weight_kg, created_by)
         VALUES (${bookingId}, ${passengerName.split(" ")[0]}, ${passengerName.split(" ").slice(1).join(" ") || "Passenger"}, 75, 10, ${userId})
         RETURNING id
      `.execute(db);
      const bpId = (bpResult.rows[0] as { id: number | bigint }).id;

      // Link passenger to booking leg via booking_leg_passengers
      await sql`
        INSERT INTO booking_leg_passengers (booking_leg_id, booking_passenger_id, clothed_weight_kg, baggage_weight_kg)
         VALUES (${bookingLegId}, ${bpId}, 75, 10)
      `.execute(db);
    }

    console.log(`  Created booking ${b.ref} for ${today} with ${b.pax} passenger(s)`);
  }

  // 6. Create test unassigned bookings for tomorrow
  const tomorrowBookings = [
    { ref: "TST-005", name: "Eve Brown", origin: aeroCodes[0], dest: aeroCodes[3], pax: 2 },
    { ref: "TST-006", name: "Frank Miller", origin: aeroCodes[1], dest: aeroCodes[2], pax: 1 },
  ];

  for (const b of tomorrowBookings) {
    const existing = await sql`
      SELECT id FROM bookings WHERE booking_reference = ${b.ref}
    `.execute(db);
    if (existing.rows.length > 0) {
      console.log(`  Booking ${b.ref} already exists`);
      continue;
    }

    const booking = await sql`
      INSERT INTO bookings (user_id, booking_reference, status, is_organization_billing, payment_status, total_amount, booking_source, created_by)
       VALUES (${userId}, ${b.ref}, 'confirmed', false, 'pending', 100.00, 'online', ${userId})
       RETURNING id
    `.execute(db);
    const bookingId = (booking.rows[0] as { id: number | bigint }).id;

    const legResult = await sql`
      INSERT INTO booking_legs (booking_id, origin_code, destination_code, leg_date, departure_date, leg_sequence, status)
       VALUES (${bookingId}, ${b.origin}, ${b.dest}, ${tomorrow}, ${tomorrow}, 1, 'confirmed')
       RETURNING id
    `.execute(db);
    const bookingLegId = (legResult.rows[0] as { id: number | bigint }).id;

    // Create booking_passengers and booking_leg_passengers for this booking
    for (let i = 0; i < b.pax; i++) {
      const passengerName = i === 0 ? b.name : `${b.name} Guest ${i + 1}`;
      const bpResult = await sql`
        INSERT INTO booking_passengers (booking_id, first_name, last_name, clothed_weight_kg, baggage_weight_kg, created_by)
         VALUES (${bookingId}, ${passengerName.split(" ")[0]}, ${passengerName.split(" ").slice(1).join(" ") || "Passenger"}, 75, 10, ${userId})
         RETURNING id
      `.execute(db);
      const bpId = (bpResult.rows[0] as { id: number | bigint }).id;

      await sql`
        INSERT INTO booking_leg_passengers (booking_leg_id, booking_passenger_id, clothed_weight_kg, baggage_weight_kg)
         VALUES (${bookingLegId}, ${bpId}, 75, 10)
      `.execute(db);
    }

    console.log(`  Created booking ${b.ref} for ${tomorrow} with ${b.pax} passenger(s)`);
  }

  console.log("✅ Seed complete!");
  console.log(`  Today (${today}): ${todayBookings.length} unassigned bookings`);
  console.log(`  Tomorrow (${tomorrow}): ${tomorrowBookings.length} unassigned bookings`);
  console.log(`  Next week (${nextWeek}): 0 unassigned bookings`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
