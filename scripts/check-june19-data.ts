import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas", { disposeExternalPool: true }) });

async function main() {
  // Check bookings and their passenger counts for June 19
  const bookings = await prisma.$queryRawUnsafe<Array<{ref:string; id:number; legs:number; bp:number; blp:number}>>(
    `SELECT b.booking_reference AS ref, b.id,
            (SELECT COUNT(*) FROM booking_legs WHERE booking_id = b.id)::int AS legs,
            (SELECT COUNT(*) FROM booking_passengers WHERE booking_id = b.id)::int AS bp,
            (SELECT COUNT(*) FROM booking_leg_passengers blp JOIN booking_legs bl ON bl.id = blp.booking_leg_id WHERE bl.booking_id = b.id)::int AS blp
     FROM bookings b
     WHERE b.id IN (SELECT booking_id FROM booking_legs WHERE leg_date = '2026-06-19')
     ORDER BY b.id`
  );
  
  console.log("Bookings for June 19:");
  for (const b of bookings) {
    const ok = b.blp === b.bp * b.legs;
    console.log(`  ${b.ref}: ${b.legs} legs × ${b.bp} pax = ${b.blp} blp rows ${ok ? '✓' : `✗ (expected ${b.bp * b.legs})`}`);
  }

  // Check unassigned
  const unassigned = await prisma.$queryRawUnsafe<Array<{cnt:number}>>(
    `SELECT COUNT(*)::int AS cnt FROM booking_leg_passengers blp
     JOIN booking_legs bl ON bl.id = blp.booking_leg_id
     WHERE blp.flight_leg_id IS NULL AND bl.leg_date = '2026-06-19'`
  );
  console.log(`\nUnassigned passengers: ${unassigned[0].cnt}`);

  // Check what the findUnassignedByDate query returns
  const details = await prisma.$queryRawUnsafe<Array<{blp_id:number; bl_id:number; ref:string; pax:string; origin:string; dest:string; fl_id:number|null}>>(
    `SELECT blp.id AS blp_id, bl.id AS bl_id, b.booking_reference AS ref,
            bp.first_name || ' ' || bp.last_name AS pax,
            bl.origin_code AS origin, bl.destination_code AS dest,
            blp.flight_leg_id AS fl_id
     FROM booking_leg_passengers blp
     JOIN booking_legs bl ON bl.id = blp.booking_leg_id
     JOIN bookings b ON b.id = bl.booking_id
     JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
     WHERE bl.leg_date = '2026-06-19'
     ORDER BY blp.id`
  );
  console.log(`\nAll booking_leg_passengers for June 19 (${details.length}):`);
  for (const d of details) {
    console.log(`  blp.id=${d.blp_id} | leg=${d.bl_id} | ${d.ref} | ${d.pax} | ${d.origin}→${d.dest} | fl_id=${d.fl_id ?? 'NULL'}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
