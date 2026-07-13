/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "../app/utils/db.server";
import { sql } from "kysely";
import { scheduleRepository } from "../app/utils/repositories/schedule";

function todayISO(): string { return new Date().toISOString().slice(0, 10); }
function daysFromNow(n: number): string { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

/**
 * Deterministic E2E test data seed.
 * Guarantees unassigned bookings exist on today, tomorrow, and today+2
 * so that scheduling drag-and-drop tests have guaranteed data.
 */
async function seedE2ETestData() {
  console.log("\n🌱 Seeding E2E deterministic test data...\n");

  const day0 = todayISO();
  const day1 = daysFromNow(1);
  const day2 = daysFromNow(2);
  const dates = [day0, day1, day2];

  // Check no-fly rules for the target dates
  const noFlyResult = await sql`
    SELECT specific_date FROM no_fly_rules
    WHERE specific_date IS NOT NULL AND is_active = true
    AND specific_date IN (${day0}, ${day1}, ${day2})
  `.execute(db);
  const noFlySet = new Set(noFlyResult.rows.map((r: any) => String(r.specific_date).slice(0, 10)));
  const safeDates = dates.filter((d) => !noFlySet.has(d));

  if (safeDates.length === 0) {
    console.error("❌ All seed dates are no-fly days. Cannot proceed.");
    process.exit(1);
  }
  if (noFlySet.size > 0) {
    console.log(`  ⚠ Skipped no-fly dates: ${[...noFlySet].join(", ")}`);
  }

  // Get admin user
  const userResult = await sql`SELECT id, name FROM users WHERE email = 'admin@figas.gov.fk' LIMIT 1`.execute(db);
  if (userResult.rows.length === 0) {
    console.error("❌ Admin user not found. Run seed:full or seed:users first.");
    process.exit(1);
  }
  const userId = Number((userResult.rows[0] as any).id);

  // Get aerodromes
  const aerodromes = await sql`SELECT code FROM aerodromes WHERE is_active = true ORDER BY code LIMIT 8`.execute(db);
  const aeroCodes = aerodromes.rows.map((r: any) => r.code as string);
  if (aeroCodes.length < 4) {
    console.error("❌ Need at least 4 active aerodromes.");
    process.exit(1);
  }

  let totalBookings = 0;
  let totalFlights = 0;

  for (const date of safeDates) {
    // Ensure a schedule exists
    let s = await scheduleRepository.findByDate(date);
    if (!s) {
      s = await scheduleRepository.create({ schedule_date: date, created_by: userId });
      console.log(`  ✓ Created schedule for ${date}`);
    }

    // Create bookings with E2E- prefix (3 per date, each with 2 passengers)
    for (let b = 1; b <= 3; b++) {
      const ref = `E2E-${date.slice(5)}-B${String(b).padStart(2, "0")}`;
      const origin = aeroCodes[b % aeroCodes.length];
      const dest = aeroCodes[(b + 1) % aeroCodes.length];
      if (origin === dest) continue;

      // Check if booking already exists
      const existing = await sql`SELECT id FROM bookings WHERE booking_reference = ${ref}`.execute(db);
      if (existing.rows.length > 0) {
        console.log(`  ⏭ Booking ${ref} already exists`);
        continue;
      }

      const bookingResult = await sql`
        INSERT INTO bookings (booking_reference, user_id, status, payment_status, total_amount_gbp, booking_source, created_by, created_at, updated_at)
        VALUES (${ref}, ${userId}, 'confirmed', 'pending', 150.00, 'online', ${userId}, NOW(), NOW())
        RETURNING id
      `.execute(db);
      const bookingId = Number((bookingResult.rows[0] as any).id);

      // Create booking leg
      await sql`
        INSERT INTO booking_legs (booking_id, origin_code, destination_code, leg_date, departure_date, leg_sequence, status, created_at, updated_at)
        VALUES (${bookingId}, ${origin}, ${dest}, ${date}::date, ${date}::date, 1, 'confirmed', NOW(), NOW())
      `.execute(db);

      // Create 2 passengers per booking
      for (let p = 1; p <= 2; p++) {
        const passengerResult = await sql`
          INSERT INTO booking_passengers (booking_id, first_name, last_name, email, clothed_body_weight_kg, created_at, updated_at)
          VALUES (${bookingId}, ${`Test${b}${p}`}, ${`User${b}${p}`}, ${`e2e-test-${b}-${p}@example.com`}, 70, NOW(), NOW())
          RETURNING id
        `.execute(db);
        const passengerId = Number((passengerResult.rows[0] as any).id);

        // Create booking leg passenger junction (unassigned — no flight_leg_id)
        await sql`
          INSERT INTO booking_leg_passengers (booking_leg_id, booking_passenger_id, clothed_weight_kg, checked_in, boarded, created_at, updated_at)
          SELECT bl.id, ${passengerId}, 70, false, false, NOW(), NOW()
          FROM booking_legs bl WHERE bl.booking_id = ${bookingId} AND bl.leg_sequence = 1
        `.execute(db);
      }

      console.log(`  ✓ Created ${ref}: ${origin}→${dest} on ${date} (2 pax)`);
      totalBookings++;
    }

    // Create one flight with passengers for drag-target tests (idempotent)
    const flightNum = `E2E-FLT-${date.slice(5)}`;
    const existingFlight = await sql`SELECT id FROM flights WHERE flight_number = ${flightNum}`.execute(db);
    let flightId: number;
    if (existingFlight.rows.length > 0) {
      flightId = Number((existingFlight.rows[0] as any).id);
      console.log(`  ⏭ Flight ${flightNum} already exists`);
    } else {
      const flightResult = await sql`
        INSERT INTO flights (flight_number, origin_code, destination_code, departure_time, arrival_time, status, schedule_id, created_by, available_seats, base_fare, created_at, updated_at)
        VALUES (${flightNum}, ${aeroCodes[0]}, ${aeroCodes[1]},
                ${`${date}T10:00:00Z`}::timestamptz, ${`${date}T10:45:00Z`}::timestamptz,
                'scheduled', ${s.id}, ${userId}, 9, 0, NOW(), NOW())
        RETURNING id
      `.execute(db);
      flightId = Number((flightResult.rows[0] as any).id);
      console.log(`  ✓ Created flight ${flightNum}`);
    }
    totalFlights++;

    // Ensure flight leg exists for this flight (idempotent)
    const existingLeg = await sql`SELECT id FROM flight_legs WHERE flight_id = ${flightId} AND leg_number = 1`.execute(db);
    let legId: number;
    if (existingLeg.rows.length > 0) {
      legId = Number((existingLeg.rows[0] as any).id);
    } else {
      const legResult = await sql`
        INSERT INTO flight_legs (flight_id, leg_number, origin_code, destination_code, status, created_at, updated_at)
        VALUES (${flightId}, 1, ${aeroCodes[0]}, ${aeroCodes[1]}, 'scheduled', NOW(), NOW())
        RETURNING id
      `.execute(db);
      legId = Number((legResult.rows[0] as any).id);
    }

    // Assign first booking's passengers to the flight leg
    const firstBookingRef = `E2E-${date.slice(5)}-B01`;
    await sql`
      UPDATE booking_leg_passengers blp
      SET flight_leg_id = ${legId}
      FROM booking_legs bl
      JOIN bookings b ON b.id = bl.booking_id
      WHERE bl.id = blp.booking_leg_id
      AND b.booking_reference = ${firstBookingRef}
    `.execute(db);

    // Also set booking_legs.flight_id (required by the flights loader query)
    await sql`
      UPDATE booking_legs bl
      SET flight_id = ${flightId}
      FROM bookings b
      WHERE b.id = bl.booking_id
      AND b.booking_reference = ${firstBookingRef}
    `.execute(db);

    console.log(`  ✓ Created flight E2E-FLT-${date.slice(5)} with assigned passengers\n`);
  }

  console.log(`\n✅ Seeded: ${totalBookings} bookings, ${totalFlights} flights across ${safeDates.length} dates\n`);
}

seedE2ETestData().catch((err) => {
  console.error("❌ E2E seed failed:", err);
  process.exit(1);
});
