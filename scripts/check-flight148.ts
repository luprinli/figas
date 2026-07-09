import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas", { disposeExternalPool: true }) });

async function main() {
  // Flight 148 details
  console.log("=== Flight 148: Booking Legs and Passengers ===\n");
  
  const legs = await prisma.$queryRawUnsafe<Array<{id:number; booking_reference:string; origin:string; dest:string; flight_id:number|null}>>(
    `SELECT bl.id, b.booking_reference, bl.origin_code AS origin, bl.destination_code AS dest, bl.flight_id
     FROM booking_legs bl
     JOIN bookings b ON b.id = bl.booking_id
     WHERE bl.flight_id = 148
     ORDER BY bl.id`
  );
  console.log(`Booking legs assigned to flight 148: ${legs.length}`);
  for (const l of legs) {
    const pax = await prisma.$queryRawUnsafe<Array<{name:string; blp_flight_leg_id:number|null}>>(
      `SELECT CONCAT(bp.first_name, ' ', bp.last_name) AS name, blp.flight_leg_id AS blp_flight_leg_id
       FROM booking_leg_passengers blp
       JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
       WHERE blp.booking_leg_id = $1
       ORDER BY bp.id`,
      l.id
    );
    console.log(`  Leg ${l.id} (${l.booking_reference}): ${l.origin}→${l.dest} — ${pax.length} passengers`);
    for (const p of pax) console.log(`    ${p.name}`);
  }

  // Flight legs for flight 148
  const fl = await prisma.$queryRawUnsafe<Array<{id:number; leg_number:number; origin:string; dest:string}>>(
    `SELECT id, leg_number, origin_code AS origin, destination_code AS dest FROM flight_legs WHERE flight_id = 148 ORDER BY leg_number`
  );
  console.log(`\nFlight legs: ${fl.length}`);
  for (const l of fl) console.log(`  Leg ${l.leg_number}: ${l.origin}→${l.dest}`);

  // All booking legs NOT on flight 148 but for June 17
  console.log(`\n=== Unassigned booking legs for June 17 ===`);
  const unassigned = await prisma.$queryRawUnsafe<Array<{id:number; ref:string; origin:string; dest:string}>>(
    `SELECT bl.id, b.booking_reference AS ref, bl.origin_code AS origin, bl.destination_code AS dest
     FROM booking_legs bl
     JOIN bookings b ON b.id = bl.booking_id
     WHERE bl.leg_date = '2026-06-17' AND bl.flight_id IS NULL
     ORDER BY bl.id`
  );
  for (const u of unassigned) {
    const cnt = await prisma.$queryRawUnsafe<Array<{cnt:number}>>(
      `SELECT COUNT(*)::int AS cnt FROM booking_leg_passengers WHERE booking_leg_id = $1`, u.id
    );
    console.log(`  Leg ${u.id} (${u.ref}): ${u.origin}→${u.dest} — ${cnt[0].cnt} passengers`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
