/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "../app/utils/db.server";
import { sql } from "kysely";
import { scheduleRepository } from "../app/utils/repositories/schedule";

function safeDateStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 4); // today + 4 to avoid overlap with E2E seeds (today, +1, +2)
  return d.toISOString().slice(0, 10);
}

const TARGET_DATE = safeDateStr();
const RESET_FLAG = process.argv.includes("--reset");

interface BookingDef {
  ref: string;
  origin: string;
  dest: string;
  names: string[];
  weight: number;
}

async function buildBookingDefs(): Promise<{ defs: BookingDef[], codes: string[] }> {
  const allRows = await sql`SELECT code FROM aerodromes WHERE is_active = true ORDER BY code`.execute(db);
  const allCodes = allRows.rows.map((r: any) => r.code as string);

  const depot = allCodes.find((c) => c === "STY") ?? allCodes.find((c) => c === "PSY");
  if (!depot) {
    console.error("❌ Neither STY nor PSY found in active aerodromes. Run seed:full first.");
    process.exit(1);
  }

  const nonDepotCodes = allCodes.filter((c) => c !== depot);
  if (nonDepotCodes.length < 3) {
    console.error(`❌ Need at least 3 non-depot aerodromes (have ${nonDepotCodes.length}). Run seed:full first.`);
    process.exit(1);
  }

  // Filter to aerodromes that have distance data from/to the depot
  const distances = await sql`SELECT origin_code, destination_code FROM aerodrome_distances`.execute(db);
  const allPairs = new Set<string>();
  for (const row of distances.rows) {
    const r = row as any;
    const o = String(r.origin_code);
    const d = String(r.destination_code);
    allPairs.add(`${o}→${d}`);
    allPairs.add(`${d}→${o}`); // bidirectional
  }
  const reachableFromDepot = nonDepotCodes.filter((c) => allPairs.has(`${depot}→${c}`));
  if (reachableFromDepot.length < 3) {
    console.error(`❌ Need at least 3 aerodromes with distance data from ${depot} (have ${reachableFromDepot.length}).`);
    process.exit(1);
  }

  // Pick the first 3 that also have mutual distances (needed for CVRP multi-stop merges)
  const meshCodes: string[] = [];
  for (const c of reachableFromDepot) {
    if (meshCodes.length >= 3) break;
    let allConnected = allPairs.has(`${c}→${depot}`); // back to depot
    for (const existing of meshCodes) {
      if (!allPairs.has(`${c}→${existing}`) || !allPairs.has(`${existing}→${c}`)) {
        allConnected = false;
        break;
      }
    }
    if (allConnected) meshCodes.push(c);
  }
  if (meshCodes.length < 3) {
    console.error(`❌ Need at least 3 mutually-connected aerodromes (have ${meshCodes.length}).`);
    console.error(`  Reachable: ${reachableFromDepot.join(", ")}`);
    process.exit(1);
  }

  const [a1, a2, a3] = meshCodes;

  const defs: BookingDef[] = [
    { ref: "PARITY-001", origin: depot, dest: a1, names: ["Alice Smith", "Bob Jones", "Carol Lee"], weight: 75 },
    { ref: "PARITY-002", origin: depot, dest: a2, names: ["Dave Brown", "Eve White"], weight: 80 },
    { ref: "PARITY-003", origin: depot, dest: a3, names: ["Frank Black"], weight: 90 },
    { ref: "PARITY-004", origin: a1, dest: depot, names: ["Grace Adams", "Heidi Park"], weight: 70 },
    { ref: "PARITY-005", origin: a2, dest: depot, names: ["Ivan Reed", "Julia Hart", "Kate Shaw", "Leo Fox"], weight: 75 },
  ];

  console.log(`  Depot: ${depot}  |  Destinations: ${a1}, ${a2}, ${a3}`);
  return { defs, codes: [depot, a1, a2, a3] };
}

async function seedParityTest() {
  console.log("\n🌱 Seeding parity test data...\n");

  const adminResult = await sql`SELECT id FROM users WHERE email = 'admin@figas.gov.fk' LIMIT 1`.execute(db);
  if (adminResult.rows.length === 0) {
    console.error("❌ Admin user not found. Run seed:full or seed:users first.");
    process.exit(1);
  }
  const userId = Number((adminResult.rows[0] as any).id);

  // ── Reset: delete existing PARITY data and their flights ──────────────────
    if (RESET_FLAG) {
      console.log("  🔄 Resetting existing PARITY data...");
      const existingBookings = await sql`SELECT id FROM bookings WHERE booking_reference LIKE 'PARITY-%'`.execute(db);
      const bookingIds = existingBookings.rows.map((r: any) => Number(r.id));

      if (bookingIds.length > 0) {
        const existingLegs = await sql`SELECT id FROM booking_legs WHERE booking_id = ANY(${bookingIds}::int[])`.execute(db);
        const legIds = existingLegs.rows.map((r: any) => Number(r.id));

        // Delete in FK-safe order
        if (legIds.length > 0) {
          await sql`DELETE FROM loadsheet_passengers WHERE booking_leg_id = ANY(${legIds}::int[])`.execute(db);
          await sql`DELETE FROM booking_leg_passengers WHERE booking_leg_id = ANY(${legIds}::int[])`.execute(db);
        }
        await sql`DELETE FROM booking_legs WHERE booking_id = ANY(${bookingIds}::int[])`.execute(db);
        await sql`DELETE FROM booking_passengers WHERE booking_id = ANY(${bookingIds}::int[])`.execute(db);
        await sql`DELETE FROM bookings WHERE booking_reference LIKE 'PARITY-%'`.execute(db);
      }

      // Also clear all flights for the target date to ensure a clean slate
      const schedule = await scheduleRepository.findByDate(TARGET_DATE);
      if (schedule) {
        const flightRows = await sql`SELECT id FROM flights WHERE schedule_id = ${schedule.id}`.execute(db);
        const flightIds = flightRows.rows.map((r: any) => Number(r.id));
        if (flightIds.length > 0) {
          await sql`DELETE FROM loadsheets WHERE flight_id = ANY(${flightIds}::int[])`.execute(db);
          await sql`DELETE FROM booking_leg_passengers WHERE flight_leg_id IN (SELECT id FROM flight_legs WHERE flight_id = ANY(${flightIds}::int[]))`.execute(db);
          await sql`UPDATE booking_legs SET flight_id = NULL WHERE flight_id = ANY(${flightIds}::int[])`.execute(db);
          await sql`DELETE FROM weight_balance_snapshots WHERE schedule_id = ${schedule.id}`.execute(db);
          await sql`DELETE FROM pilot_assignments WHERE schedule_id = ${schedule.id}`.execute(db);
          await sql`DELETE FROM flight_legs WHERE flight_id = ANY(${flightIds}::int[])`.execute(db);
          await sql`DELETE FROM flights WHERE schedule_id = ${schedule.id}`.execute(db);
          console.log(`  ✅ Cleared ${flightIds.length} existing flight(s) for ${TARGET_DATE}`);
        }
      }
      console.log("  ✅ Existing PARITY data cleared.");
    }

  // ── Resolve aerodromes dynamically ─────────────────────────────────────
  const { defs: BOOKING_DEFS, codes: aeroCodes } = await buildBookingDefs();

  // ── Ensure existing PARITY bookings are unassigned (idempotent) ──────────
  await sql`
    UPDATE booking_leg_passengers SET flight_leg_id = NULL
    WHERE booking_leg_id IN (
      SELECT bl.id FROM booking_legs bl
      JOIN bookings b ON b.id = bl.booking_id
      WHERE b.booking_reference LIKE 'PARITY-%'
    )
    AND flight_leg_id IS NOT NULL
  `.execute(db);
  await sql`
    UPDATE booking_legs SET flight_id = NULL
    WHERE id IN (
      SELECT bl.id FROM booking_legs bl
      JOIN bookings b ON b.id = bl.booking_id
      WHERE b.booking_reference LIKE 'PARITY-%'
    )
    AND flight_id IS NOT NULL
  `.execute(db);

  // ── Ensure existing PARITY bookings are unassigned (idempotent) ──────────
  await sql`
    UPDATE booking_leg_passengers SET flight_leg_id = NULL
    WHERE booking_leg_id IN (
      SELECT bl.id FROM booking_legs bl
      JOIN bookings b ON b.id = bl.booking_id
      WHERE b.booking_reference LIKE 'PARITY-%'
    )
    AND flight_leg_id IS NOT NULL
  `.execute(db);
  await sql`
    UPDATE booking_legs SET flight_id = NULL
    WHERE id IN (
      SELECT bl.id FROM booking_legs bl
      JOIN bookings b ON b.id = bl.booking_id
      WHERE b.booking_reference LIKE 'PARITY-%'
    )
    AND flight_id IS NOT NULL
  `.execute(db);

  // ── No-fly day check ──────────────────────────────────────────────────
  try {
    const dateObj = new Date(TARGET_DATE);
    const dayOfWeek = dateObj.getUTCDay();
    const noFlyResult = await sql`
      SELECT id FROM no_fly_rules
      WHERE is_active = true
        AND (
          specific_date = ${TARGET_DATE}
          OR (rule_type = 'recurring' AND ${dayOfWeek} = ANY(day_of_week))
        )
      LIMIT 1
    `.execute(db);
    if (noFlyResult.rows.length > 0) {
      console.warn(`  ⚠ ${TARGET_DATE} is a no-fly day — bookings may not be schedulable.`);
      console.warn("  Consider editing TARGET_DATE in the script.\n");
    }
  } catch {
    console.warn("  ⚠ Could not check no-fly rules — proceeding without check.\n");
  }

  // ── Ensure schedule exists in buildable state ──────────────────────────
  let s = await scheduleRepository.findByDate(TARGET_DATE);
  if (!s) {
    s = await scheduleRepository.create({
      schedule_date: TARGET_DATE,
      created_by: userId,
      notes: `Parity test schedule for ${TARGET_DATE}`,
    });
    console.log(`  ✅ Created schedule for ${TARGET_DATE} (id=${s.id})`);
  } else {
    // Reset to building status if it's in an incompatible state
    if (s.status !== "building" && s.status !== "draft") {
      await scheduleRepository.updateStatus(s.id, "building" as any);
      console.log(`  ✅ Reset schedule ${s.id} from "${s.status}" to "building"`);

      // Clear any leftover flights from prior auto-builds on this schedule
      const flightRows = await sql`SELECT id FROM flights WHERE schedule_id = ${s.id}`.execute(db);
      const flightIds = flightRows.rows.map((r: any) => Number(r.id));
      if (flightIds.length > 0) {
        await sql`DELETE FROM loadsheets WHERE flight_id = ANY(${flightIds}::int[])`.execute(db);
        await sql`DELETE FROM booking_leg_passengers WHERE flight_leg_id IN (SELECT id FROM flight_legs WHERE flight_id = ANY(${flightIds}::int[]))`.execute(db);
        await sql`UPDATE booking_legs SET flight_id = NULL WHERE flight_id = ANY(${flightIds}::int[])`.execute(db);
        await sql`DELETE FROM weight_balance_snapshots WHERE schedule_id = ${s.id}`.execute(db);
        await sql`DELETE FROM pilot_assignments WHERE schedule_id = ${s.id}`.execute(db);
        await sql`DELETE FROM flight_legs WHERE flight_id = ANY(${flightIds}::int[])`.execute(db);
        await sql`DELETE FROM flights WHERE schedule_id = ${s.id}`.execute(db);
        console.log(`  ✅ Cleared ${flightIds.length} existing flights on schedule ${s.id}`);
      }
    } else {
      console.log(`  ✅ Schedule exists for ${TARGET_DATE} (id=${s.id}, status=${s.status})`);
    }
  }

  // ── Ensure 2 active aircraft ─────────────────────────────────────────────
  const aircraftCount = await sql`SELECT COUNT(*)::int as cnt FROM aircraft WHERE is_active = true`.execute(db);
  const acCount = (aircraftCount.rows[0] as any).cnt;
  if (acCount < 2) {
    console.warn(`  ⚠ Only ${acCount} active aircraft found — parity test may produce more flights than expected.`);
  }

  // ── Create bookings ──────────────────────────────────────────────────────
  let totalBookings = 0;
  let totalPassengers = 0;

  for (const b of BOOKING_DEFS) {
    const existing = await sql`SELECT b.id as booking_id, bl.leg_date FROM bookings b
      JOIN booking_legs bl ON bl.booking_id = b.id
      WHERE b.booking_reference = ${b.ref}
      LIMIT 1`.execute(db);
    if (existing.rows.length > 0) {
      const rawDate = (existing.rows[0] as any).leg_date;
      const existingDate = typeof rawDate === "string"
        ? String(rawDate).slice(0, 10)
        : new Date(rawDate).toISOString().slice(0, 10);
      if (existingDate === TARGET_DATE) {
        console.log(`  ⏭  Skipping ${b.ref} (already exists on ${TARGET_DATE})`);
        continue;
      }
      // Date mismatch — delete and re-create
      console.log(`  🔄 Re-creating ${b.ref} (date changed from ${existingDate} to ${TARGET_DATE})`);
      const bookingIdResult = await sql`SELECT id FROM bookings WHERE booking_reference = ${b.ref}`.execute(db);
      const bkId = Number((bookingIdResult.rows[0] as any).id);
      const legIdResult = await sql`SELECT id FROM booking_legs WHERE booking_id = ${bkId}`.execute(db);
      const legIds = legIdResult.rows.map((r: any) => Number(r.id));
      if (legIds.length > 0) {
        await sql`DELETE FROM loadsheet_passengers WHERE booking_leg_id = ANY(${legIds}::int[])`.execute(db);
        await sql`DELETE FROM booking_leg_passengers WHERE booking_leg_id = ANY(${legIds}::int[])`.execute(db);
        await sql`DELETE FROM booking_legs WHERE booking_id = ${bkId}`.execute(db);
      }
      await sql`DELETE FROM booking_passengers WHERE booking_id = ${bkId}`.execute(db);
      await sql`DELETE FROM bookings WHERE id = ${bkId}`.execute(db);
    }

    const bookingResult = await sql`
      INSERT INTO bookings (user_id, booking_reference, status, is_organization_billing, payment_status, total_amount, booking_source, created_by)
      VALUES (${userId}, ${b.ref}, 'confirmed', false, 'pending', 100.00, 'online', ${userId})
      RETURNING id
    `.execute(db);
    const bookingId = Number((bookingResult.rows[0] as any).id);

    const legResult = await sql`
      INSERT INTO booking_legs (booking_id, origin_code, destination_code, leg_date, departure_date, leg_sequence, status)
      VALUES (${bookingId}, ${b.origin}, ${b.dest}, ${TARGET_DATE}, ${TARGET_DATE}, 1, 'confirmed')
      RETURNING id
    `.execute(db);
    const bookingLegId = Number((legResult.rows[0] as any).id);

    for (const name of b.names) {
      const parts = name.split(" ");
      const firstName = parts[0];
      const lastName = parts.slice(1).join(" ") || "Passenger";

      const bpResult = await sql`
        INSERT INTO booking_passengers (booking_id, first_name, last_name, clothed_body_weight_kg)
        VALUES (${bookingId}, ${firstName}, ${lastName}, ${b.weight})
        RETURNING id
      `.execute(db);
      const bpId = Number((bpResult.rows[0] as any).id);

      await sql`
        INSERT INTO booking_leg_passengers (booking_leg_id, booking_passenger_id, clothed_weight_kg, baggage_weight_kg)
        VALUES (${bookingLegId}, ${bpId}, ${b.weight}, 10)
      `.execute(db);
    }

    totalBookings++;
    totalPassengers += b.names.length;
    console.log(`  ✅ ${b.ref}: ${b.names.length} pax, ${b.origin}→${b.dest}, weight=${b.weight}kg/ea`);
  }

  // ── Verify ───────────────────────────────────────────────────────────────
  console.log("\n📊 Verification:");
  const countResult = await sql`
    SELECT COUNT(*)::int AS cnt FROM booking_legs bl
    JOIN bookings b ON b.id = bl.booking_id
    WHERE bl.leg_date = ${TARGET_DATE}
      AND bl.flight_id IS NULL
      AND b.booking_reference LIKE 'PARITY-%'
  `.execute(db);
  const paxResult = await sql`
    SELECT COUNT(*)::int AS cnt FROM booking_leg_passengers blp
    JOIN booking_legs bl ON bl.id = blp.booking_leg_id
    JOIN bookings b ON b.id = bl.booking_id
    WHERE bl.leg_date = ${TARGET_DATE}
      AND blp.flight_leg_id IS NULL
      AND b.booking_reference LIKE 'PARITY-%'
  `.execute(db);
  const unassignedBookings = (countResult.rows[0] as any).cnt;
  const unassignedPax = (paxResult.rows[0] as any).cnt;
  console.log(`  ${TARGET_DATE}: ${unassignedBookings} unassigned bookings, ${unassignedPax} unassigned passengers`);

  console.log(`\n✅ Parity seed complete!`);
  console.log(`  Total: ${totalBookings} new bookings, ${totalPassengers} new passengers`);
  console.log(`  Target date: ${TARGET_DATE}`);

  // ── Write config for test consumption ────────────────────────────────────
  const fs = await import("node:fs");
  const path = await import("node:path");
  const configDir = path.resolve(import.meta.dirname ?? ".", "..", "tests", "e2e", "helpers");
  const configPath = path.join(configDir, "parity-config.json");
  fs.writeFileSync(configPath, JSON.stringify({
    targetDate: TARGET_DATE,
    depotCode: aeroCodes[0],
    aerodromeCodes: aeroCodes,
    bookings: BOOKING_DEFS.map((b) => ({
      ref: b.ref,
      origin: b.origin,
      dest: b.dest,
      passengerCount: b.names.length,
      names: b.names,
    })),
  }, null, 2));
  console.log(`  Config written to ${configPath}\n`);
}

seedParityTest().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
