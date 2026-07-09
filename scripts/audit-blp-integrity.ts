import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas", { disposeExternalPool: true }) });

async function main() {
  console.log("=== booking_leg_passengers Data Integrity Audit ===\n");

  // 1. Total counts
  const total = await prisma.$queryRawUnsafe<Array<{cnt:number}>>(
    "SELECT COUNT(*)::int AS cnt FROM booking_leg_passengers"
  );
  console.log(`1. Total booking_leg_passengers rows: ${total[0].cnt}`);

  // 2. Null id check (should be 0)
  const nullIds = await prisma.$queryRawUnsafe<Array<{cnt:number}>>(
    "SELECT COUNT(*)::int AS cnt FROM booking_leg_passengers WHERE id IS NULL"
  );
  console.log(`2. Rows with NULL id: ${nullIds[0].cnt} ${nullIds[0].cnt === 0 ? '✓' : '✗'}`);

  // 3. Orphan booking_leg_id (blp.booking_leg_id not in booking_legs)
  const orphanLegs = await prisma.$queryRawUnsafe<Array<{cnt:number}>>(
    "SELECT COUNT(*)::int AS cnt FROM booking_leg_passengers blp LEFT JOIN booking_legs bl ON bl.id = blp.booking_leg_id WHERE bl.id IS NULL"
  );
  console.log(`3. Orphan booking_leg_id: ${orphanLegs[0].cnt} ${orphanLegs[0].cnt === 0 ? '✓' : '✗'}`);

  // 4. Orphan booking_passenger_id
  const orphanPax = await prisma.$queryRawUnsafe<Array<{cnt:number}>>(
    "SELECT COUNT(*)::int AS cnt FROM booking_leg_passengers blp LEFT JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id WHERE bp.id IS NULL"
  );
  console.log(`4. Orphan booking_passenger_id: ${orphanPax[0].cnt} ${orphanPax[0].cnt === 0 ? '✓' : '✗'}`);

  // 5. Multi-passenger bookings: check if ALL passengers have junction records on ALL legs (wrong)
  //    A booking with 2 legs and 3 passengers should have 6 blp records (2x3).
  //    But if some passengers only belong on one leg, we need to verify.
  console.log("\n5. Multi-leg bookings: per-leg passenger breakdown");
  const multiLeg = await prisma.$queryRawUnsafe<Array<{booking_id:number; ref:string; leg_count:number; pax_count:number; blp_count:number; expected:number}>>(
    `SELECT b.id AS booking_id, b.booking_reference AS ref, 
            (SELECT COUNT(*) FROM booking_passengers WHERE booking_id = b.id) AS pax_count,
            (SELECT COUNT(*) FROM booking_legs WHERE booking_id = b.id) AS leg_count,
            (SELECT COUNT(*) FROM booking_leg_passengers blp JOIN booking_legs bl ON bl.id = blp.booking_leg_id WHERE bl.booking_id = b.id) AS blp_count,
            (SELECT COUNT(*) FROM booking_passengers WHERE booking_id = b.id) * (SELECT COUNT(*) FROM booking_legs WHERE booking_id = b.id) AS expected
     FROM bookings b
     WHERE (SELECT COUNT(*) FROM booking_legs WHERE booking_id = b.id) > 1
     ORDER BY b.id
     LIMIT 15`
  );
  let blpMismatchCount = 0;
  for (const b of multiLeg) {
    const ok = b.blp_count === b.expected;
    if (!ok) blpMismatchCount++;
    console.log(`  ${b.ref}: ${b.leg_count} legs × ${b.pax_count} pax = ${b.blp_count} blp rows ${ok ? '✓' : `✗ (expected ${b.expected})`}`);
  }
  if (multiLeg.length === 0) console.log("  No multi-leg bookings found");
  else if (blpMismatchCount === 0) console.log("  ✓ All multi-leg bookings have correct per-leg junction records");

  // 6. Check bookings where junction records span multiple dates (cross-date assignment bug)
  console.log("\n6. Bookings with legs on different dates—verify junction record distribution");
  const crossDate = await prisma.$queryRawUnsafe<Array<{ref:string; lid:number; ldate:string; bp_count:number}>>(
    `SELECT b.booking_reference AS ref, bl.id AS lid, bl.leg_date::text AS ldate,
            (SELECT COUNT(*) FROM booking_leg_passengers WHERE booking_leg_id = bl.id) AS bp_count
     FROM booking_legs bl
     JOIN bookings b ON b.id = bl.booking_id
     WHERE b.id IN (SELECT booking_id FROM booking_legs GROUP BY booking_id HAVING COUNT(DISTINCT leg_date) > 1)
     ORDER BY b.id, bl.id
     LIMIT 20`
  );
  if (crossDate.length === 0) {
    console.log("  ✓ No cross-date bookings found (all legs share same date)");
  } else {
    let prevRef = "";
    for (const r of crossDate) {
      if (r.ref !== prevRef) { console.log(`  ${r.ref}:`); prevRef = r.ref; }
      console.log(`    Leg ${r.lid}: ${r.ldate} → ${r.bp_count} junction records`);
    }
  }

  // 7. Check for duplicate (booking_leg_id, booking_passenger_id) pairs
  const dups = await prisma.$queryRawUnsafe<Array<{cnt:number}>>(
    `SELECT COUNT(*)::int AS cnt FROM (
      SELECT booking_leg_id, booking_passenger_id, COUNT(*) FROM booking_leg_passengers
      GROUP BY booking_leg_id, booking_passenger_id HAVING COUNT(*) > 1
    ) sub`
  );
  console.log(`\n7. Duplicate (booking_leg_id, booking_passenger_id) pairs: ${dups[0].cnt} ${dups[0].cnt === 0 ? '✓' : '✗'}`);

  // 8. Check that blp.id values returned by findUnassignedByDate match actual blp rows
  console.log("\n8. Verify findUnassignedByDate returns valid blp.id values");
  const sample = await prisma.$queryRawUnsafe<Array<{blp_id:number; bl_id:number; ref:string; pax:string; in_blp:boolean}>>(
    `SELECT blp.id AS blp_id, bl.id AS bl_id, b.booking_reference AS ref,
            bp.first_name || ' ' || bp.last_name AS pax,
            EXISTS(SELECT 1 FROM booking_leg_passengers WHERE id = blp.id) AS in_blp
     FROM booking_leg_passengers blp
     JOIN booking_legs bl ON bl.id = blp.booking_leg_id
     JOIN bookings b ON b.id = bl.booking_id
     JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
     WHERE blp.flight_leg_id IS NULL
     ORDER BY RANDOM() LIMIT 10`
  );
  for (const s of sample) {
    console.log(`  blp.id=${s.blp_id} → bl.id=${s.bl_id} (${s.ref}) pax=${s.pax} exists=${s.in_blp} ${s.in_blp ? '✓' : '✗'}`);
  }

  // 9. Check flight_leg_id consistency: blp.flight_leg_id must reference a valid flight_legs row
  const orphanFl = await prisma.$queryRawUnsafe<Array<{cnt:number}>>(
    "SELECT COUNT(*)::int AS cnt FROM booking_leg_passengers blp LEFT JOIN flight_legs fl ON fl.id = blp.flight_leg_id WHERE blp.flight_leg_id IS NOT NULL AND fl.id IS NULL"
  );
  console.log(`\n9. Orphan flight_leg_id: ${orphanFl[0].cnt} ${orphanFl[0].cnt === 0 ? '✓' : '✗'}`);

  // 10. Check that blp with flight_leg_id are also reachable via bl.flight_id
  console.log("\n10. Verify flight_leg_id → booking_legs.flight_id consistency");
  const flConsistency = await prisma.$queryRawUnsafe<Array<{cnt:number}>>(
    `SELECT COUNT(*)::int AS cnt FROM booking_leg_passengers blp
     JOIN flight_legs fl ON fl.id = blp.flight_leg_id
     JOIN booking_legs bl ON bl.id = blp.booking_leg_id
     WHERE bl.flight_id IS NULL OR bl.flight_id != fl.flight_id`
  );
  console.log(`  Inconsistent rows: ${flConsistency[0].cnt} ${flConsistency[0].cnt === 0 ? '✓' : '✗'}`);

  console.log("\n=== Audit Complete ===");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
