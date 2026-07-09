import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas";
const prisma = new PrismaClient({ adapter: new PrismaPg(DATABASE_URL, { disposeExternalPool: true }) });

async function main() {
  console.log("=== FIGAS Seed Data Cleanup ===\n");

  // ═══════════════════════════════════════════════════════════════════════
  // 1. Show current aircraft and clean up any beyond the 4 planned ones
  // ═══════════════════════════════════════════════════════════════════════
  console.log("── Cleaning Aircraft ──");
  const allAircraft = await prisma.$queryRawUnsafe<Array<{id:number; registration:string; is_active:boolean}>>(
    `SELECT id, registration, is_active FROM aircraft ORDER BY id`
  );
  console.log(`  Current: ${allAircraft.length} aircraft`);
  for (const a of allAircraft) {
    console.log(`    id=${a.id}: ${a.registration} active=${a.is_active}`);
  }
  
  // Keep only the 4 planned aircraft (VP-FBZ, VP-FAZ, VP-FCZ, VP-FDZ) by their lowest ids
  const plannedRegs = ["VP-FBZ", "VP-FAZ", "VP-FCZ", "VP-FDZ"];
  const keepIds: number[] = [];
  for (const reg of plannedRegs) {
    const r = await prisma.$queryRawUnsafe<Array<{id:number}>>(
      `SELECT MIN(id) as id FROM aircraft WHERE registration = $1`, reg
    );
    if (r.length > 0 && r[0].id) keepIds.push(r[0].id);
  }
  
  const toDeleteAircraft = allAircraft.filter(a => !keepIds.includes(a.id));
  if (toDeleteAircraft.length > 0) {
    // Handle foreign keys first
    for (const a of toDeleteAircraft) {
      await prisma.$executeRawUnsafe(`UPDATE flights SET aircraft_id = NULL WHERE aircraft_id = $1`, a.id);
      await prisma.$executeRawUnsafe(`UPDATE aircraft_assignments SET aircraft_id = NULL WHERE aircraft_id = $1`, a.id);
      await prisma.$executeRawUnsafe(`DELETE FROM airframe_hours WHERE aircraft_id = $1`, a.id);
      await prisma.$executeRawUnsafe(`DELETE FROM aircraft WHERE id = $1`, a.id);
    }
    console.log(`  Deleted ${toDeleteAircraft.length} extra aircraft`);
  }
  // Ensure the 4 kept have correct is_active status
  await prisma.$executeRawUnsafe(`UPDATE aircraft SET is_active = true WHERE registration IN ('VP-FBZ','VP-FAZ','VP-FCZ')`);
  await prisma.$executeRawUnsafe(`UPDATE aircraft SET is_active = false WHERE registration = 'VP-FDZ'`);
  console.log("  ✓ 4 aircraft (3 active, 1 OOS)");

  // ═══════════════════════════════════════════════════════════════════════
  // 2. Clean up duplicate pilots (keep min id, delete the rest)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── Cleaning Pilots ──");
  const pilotDups = await prisma.$queryRawUnsafe<Array<{user_id:number; dup_ids:number[]}>>(
    `SELECT user_id, ARRAY_AGG(id ORDER BY id) as dup_ids 
     FROM pilots 
     WHERE user_id IS NOT NULL 
     GROUP BY user_id HAVING COUNT(*) > 1`
  );
  let pilotDelCount = 0;
  for (const d of pilotDups) {
    const delIds = d.dup_ids.slice(1);
    for (const delId of delIds) {
      await prisma.$executeRawUnsafe(`UPDATE flights SET pilot_id = NULL WHERE pilot_id = $1`, delId);
      await prisma.$executeRawUnsafe(`DELETE FROM pilot_assignments WHERE pilot_id = $1`, delId);
      await prisma.$executeRawUnsafe(`DELETE FROM pilots WHERE id = $1`, delId);
      pilotDelCount++;
    }
  }
  console.log(`  Deleted ${pilotDelCount} duplicate pilots`);
  // Check what non-duplicate extra pilots exist
  const extraPilots = await prisma.$queryRawUnsafe<Array<{id:number; name:string; user_id:number|null}>>(
    `SELECT id, name, user_id FROM pilots WHERE user_id IS NULL OR user_id NOT IN (
      SELECT u.id FROM users u WHERE u.email IN ('pilot1@figas.gov.fk','pilot2@figas.gov.fk','pilot3@figas.gov.fk')
    ) ORDER BY id`
  );
  for (const ep of extraPilots) {
    // Delete pilots not linked to the 3 planned pilot users
    await prisma.$executeRawUnsafe(`UPDATE flights SET pilot_id = NULL WHERE pilot_id = $1`, ep.id);
    await prisma.$executeRawUnsafe(`DELETE FROM pilot_assignments WHERE pilot_id = $1`, ep.id);
    await prisma.$executeRawUnsafe(`DELETE FROM pilots WHERE id = $1`, ep.id);
    pilotDelCount++;
    console.log(`  Deleted extra pilot: ${ep.name} (id=${ep.id})`);
  }
  console.log(`  ✓ Pilots cleaned (total deleted: ${pilotDelCount})`);

  // ═══════════════════════════════════════════════════════════════════════
  // 3. Clean up duplicate no-fly rules (keep min id per label)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── Cleaning No-Fly Rules ──");
  const nfrDups = await prisma.$queryRawUnsafe<Array<{label:string; dup_ids:number[]}>>(
    `SELECT label, ARRAY_AGG(id ORDER BY id) as dup_ids 
     FROM no_fly_rules 
     GROUP BY label HAVING COUNT(*) > 1`
  );
  let nfrDelCount = 0;
  for (const d of nfrDups) {
    const delIds = d.dup_ids.slice(1);
    for (const delId of delIds) {
      await prisma.$executeRawUnsafe(`DELETE FROM no_fly_rules WHERE id = $1`, delId);
      nfrDelCount++;
    }
  }
  console.log(`  Deleted ${nfrDelCount} duplicate no-fly rules`);
  console.log("  ✓ 7 no-fly rules");

  // ═══════════════════════════════════════════════════════════════════════
  // 4. Delete flights on Sundays (no-fly days) and their dependent data
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── Cleaning Sunday Flights ──");
  const sundayFlightIds = await prisma.$queryRawUnsafe<Array<{id:number; flight_number:string}>>(
    `SELECT id, flight_number FROM flights WHERE EXTRACT(DOW FROM departure_time) = 0`
  );
  console.log(`  Found ${sundayFlightIds.length} flights on Sundays`);
  for (const f of sundayFlightIds) {
    // Delete dependent data first (respecting FK constraints)
    await prisma.$executeRawUnsafe(`DELETE FROM weight_balance_snapshots WHERE flight_leg_id IN (SELECT id FROM flight_legs WHERE flight_id = $1)`, f.id);
    await prisma.$executeRawUnsafe(`DELETE FROM seat_assignments WHERE flight_id = $1`, f.id);
    await prisma.$executeRawUnsafe(`DELETE FROM loadsheet_passengers WHERE loadsheet_id IN (SELECT id FROM loadsheets WHERE flight_id = $1)`, f.id);
    await prisma.$executeRawUnsafe(`DELETE FROM loadsheet_sectors WHERE flight_leg_id IN (SELECT id FROM flight_legs WHERE flight_id = $1)`, f.id);
    await prisma.$executeRawUnsafe(`DELETE FROM loadsheet_audit_log WHERE loadsheet_id IN (SELECT id FROM loadsheets WHERE flight_id = $1)`, f.id);
    await prisma.$executeRawUnsafe(`DELETE FROM loadsheets WHERE flight_id = $1`, f.id);
    await prisma.$executeRawUnsafe(`DELETE FROM sign_offs WHERE entity_type = 'flight' AND entity_id = $1`, f.id);
    await prisma.$executeRawUnsafe(`DELETE FROM flight_manifests WHERE flight_id = $1`, f.id);
    await prisma.$executeRawUnsafe(`DELETE FROM flight_logs WHERE flight_id = $1`, f.id);
    await prisma.$executeRawUnsafe(`DELETE FROM pilot_assignments WHERE flight_id = $1`, f.id);
    await prisma.$executeRawUnsafe(`DELETE FROM aircraft_assignments WHERE flight_id = $1`, f.id);
    await prisma.$executeRawUnsafe(`DELETE FROM freight_consignments WHERE flight_id = $1`, f.id);
    await prisma.$executeRawUnsafe(`DELETE FROM published_schedule_flights WHERE flight_id = $1`, f.id);
    // Unlink booking_legs from this flight
    await prisma.$executeRawUnsafe(`UPDATE booking_legs SET flight_id = NULL WHERE flight_id = $1`, f.id);
    // Delete flight_legs
    await prisma.$executeRawUnsafe(`DELETE FROM flight_legs WHERE flight_id = $1`, f.id);
    // Delete the flight
    await prisma.$executeRawUnsafe(`DELETE FROM flights WHERE id = $1`, f.id);
  }
  console.log("  ✓ All Sunday flights and dependent data deleted");

  // ═══════════════════════════════════════════════════════════════════════
  // Also clean up any orphaned schedules (no flights)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── Cleaning Orphaned Schedules ──");
  const orphanResult = await prisma.$executeRawUnsafe(
    `DELETE FROM schedules WHERE id IN (
      SELECT s.id FROM schedules s 
      LEFT JOIN flights f ON f.schedule_id = s.id 
      WHERE f.id IS NULL
    )`
  );
  console.log(`  Deleted ${orphanResult} orphaned schedules`);

  // ═══════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════
  const counts = await prisma.$queryRawUnsafe<Array<Record<string,number>>>(
    `SELECT
      (SELECT COUNT(*) FROM aircraft) AS aircraft,
      (SELECT COUNT(*) FROM aircraft WHERE is_active = true) AS active_aircraft,
      (SELECT COUNT(*) FROM pilots) AS pilots,
      (SELECT COUNT(*) FROM no_fly_rules) AS no_fly_rules,
      (SELECT COUNT(*) FROM flights) AS flights,
      (SELECT COUNT(*) FROM schedules) AS schedules,
      (SELECT COUNT(*) FROM bookings) AS bookings,
      (SELECT COUNT(*) FROM flight_legs) AS flight_legs,
      (SELECT COUNT(*) FROM weight_balance_snapshots) AS wb_snapshots`
  );
  const c = counts[0];
  console.log("\n=== Post-Cleanup State ===");
  console.log(`  Aircraft (total):     ${c.aircraft} (plan: 4)`);
  console.log(`  Aircraft (active):    ${c.active_aircraft} (plan: 3)`);
  console.log(`  Pilots:               ${c.pilots} (plan: 3)`);
  console.log(`  No-fly rules:         ${c.no_fly_rules} (plan: 7)`);
  console.log(`  Flights:              ${c.flights}`);
  console.log(`  Flight legs:          ${c.flight_legs}`);
  console.log(`  Schedules:            ${c.schedules}`);
  console.log(`  W&B snapshots:        ${c.wb_snapshots}`);

  // Verify no Sunday flights remain
  const sundayCheck = await prisma.$queryRawUnsafe<Array<{cnt:number}>>(
    `SELECT COUNT(*) as cnt FROM flights WHERE EXTRACT(DOW FROM departure_time) = 0`
  );
  console.log(`  Sunday flights:       ${sundayCheck[0].cnt} (should be 0)`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
