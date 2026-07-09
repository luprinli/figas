/**
 * Debug duplicate unassigned bookings for 2026-06-09
 * Step 1: Check raw data in booking_leg_passengers
 * Step 2: Run the EXACT query from the loader
 * Step 3: Check for duplicates at each table level
 */
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!, { disposeExternalPool: true }) });

async function main() {
  const date = "2026-06-09";
  console.log(`=== Debug: Duplicate Bookings for ${date} ===\n`);

  // Step 1: Raw counts per table
  console.log("1. Raw table counts for this date:");
  const legCount = await p.$queryRawUnsafe<Array<{cnt:number}>>(
    `SELECT COUNT(*)::int as cnt FROM booking_legs bl
     JOIN bookings b ON b.id = bl.booking_id
     WHERE bl.leg_date = $1 AND b.status NOT IN ('cancelled', 'completed') AND bl.flight_id IS NULL`, date);
  console.log(`   booking_legs: ${legCount[0].cnt}`);

  const blpCount = await p.$queryRawUnsafe<Array<{cnt:number}>>(
    `SELECT COUNT(*)::int as cnt FROM booking_leg_passengers blp
     JOIN booking_legs bl ON bl.id = blp.booking_leg_id
     JOIN bookings b ON b.id = bl.booking_id
     WHERE bl.leg_date = $1 AND b.status NOT IN ('cancelled', 'completed') AND bl.flight_id IS NULL`, date);
  console.log(`   booking_leg_passengers: ${blpCount[0].cnt}`);

  const bpCount = await p.$queryRawUnsafe<Array<{cnt:number}>>(
    `SELECT COUNT(*)::int as cnt FROM booking_passengers bp
     JOIN booking_leg_passengers blp ON blp.booking_passenger_id = bp.id
     JOIN booking_legs bl ON bl.id = blp.booking_leg_id
     JOIN bookings b ON b.id = bl.booking_id
     WHERE bl.leg_date = $1 AND b.status NOT IN ('cancelled', 'completed') AND bl.flight_id IS NULL`, date);
  console.log(`   booking_passengers: ${bpCount[0].cnt}`);

  if (blpCount[0].cnt === 0) { console.log("\nNo unassigned passengers for this date."); await p.$disconnect(); return; }

  // Step 2: Run the ACTUAL loader query
  console.log("\n2. Running the EXACT loader query:");
  const result = await p.$queryRawUnsafe<Array<Record<string,unknown>>>(
    `SELECT blp.id, b.booking_reference,
            bp.first_name || ' ' || bp.last_name AS passenger_name,
            bl.origin_code, bl.destination_code,
            (SELECT COUNT(*)::int FROM booking_leg_passengers blp2 WHERE blp2.booking_leg_id = bl.id) AS passenger_count
     FROM booking_leg_passengers blp
     JOIN booking_legs bl ON bl.id = blp.booking_leg_id
     JOIN bookings b ON b.id = bl.booking_id
     JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
     WHERE bl.flight_id IS NULL AND bl.leg_date = $1 AND b.status NOT IN ('cancelled', 'completed')
     ORDER BY b.booking_reference, bp.last_name, bp.first_name`, date
  );

  console.log(`   Rows returned: ${result.length}`);
  for (const r of result) {
    console.log(`   id=${r.id} ref=${r.booking_reference} name="${r.passenger_name}" pax_count=${r.passenger_count} ${r.origin_code}→${r.destination_code}`);
  }

  // Step 3: Check for duplicate blp.id values
  console.log("\n3. Duplicate check:");
  const ids = result.map(r => Number(r.id));
  const uniqueIds = new Set(ids);
  console.log(`   Total rows: ${ids.length}, Unique IDs: ${uniqueIds.size}`);

  if (ids.length !== uniqueIds.size) {
    const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
    console.log(`   DUPLICATE IDs: ${dupIds}`);
  } else {
    console.log("   ✅ No duplicate IDs");
  }

  // Step 4: Check booking_leg_passengers for structural duplicates
  console.log("\n4. Structural duplicates in booking_leg_passengers:");
  const structDups = await p.$queryRawUnsafe<Array<Record<string,unknown>>>(
    `SELECT booking_leg_id, booking_passenger_id, COUNT(*)::int as cnt
     FROM booking_leg_passengers
     WHERE booking_leg_id IN (
       SELECT bl.id FROM booking_legs bl JOIN bookings b ON b.id = bl.booking_id
       WHERE bl.leg_date = $1 AND b.status NOT IN ('cancelled', 'completed'))
     GROUP BY booking_leg_id, booking_passenger_id
     HAVING COUNT(*) > 1`, date
  );
  console.log(`   Duplicate groups: ${structDups.length}`);
  for (const d of structDups) console.log(`     leg_id=${d.booking_leg_id} pax_id=${d.booking_passenger_id} ×${d.cnt}`);

  // Step 5: Show full booking details for clarity
  console.log("\n5. Full booking details:");
  const details = await p.$queryRawUnsafe<Array<Record<string,unknown>>>(
    `SELECT b.booking_reference, bl.id as leg_id, bl.origin_code, bl.destination_code,
            bp.first_name, bp.last_name, blp.id as blp_id, blp.booking_passenger_id,
            blp.checked_in, bl.flight_id
     FROM booking_legs bl
     JOIN bookings b ON b.id = bl.booking_id
     JOIN booking_leg_passengers blp ON blp.booking_leg_id = bl.id
     JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
     WHERE bl.leg_date = $1 AND b.status NOT IN ('cancelled', 'completed')
     ORDER BY b.booking_reference, bp.first_name, bp.last_name`, date
  );
  for (const d of details) {
    console.log(`   ${d.booking_reference} leg=${d.leg_id} blp=${d.blp_id} bp=${d.booking_passenger_id} ${d.first_name} ${d.last_name} checked_in=${d.checked_in} flight_id=${d.flight_id}`);
  }

  await p.$disconnect();
}
main().catch(err => { console.error(err); process.exit(1); });
