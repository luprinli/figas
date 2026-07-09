import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas", { disposeExternalPool: true }) });

async function main() {
  // Flight 150 details
  const fl = await prisma.$queryRawUnsafe<Array<{id:number; flight_number:string; origin:string; dest:string; status:string}>>(
    "SELECT id, flight_number, origin_code AS origin, destination_code AS dest, status FROM flights WHERE id = 150"
  );
  if (fl.length === 0) { console.log("Flight 150 not found"); await prisma.$disconnect(); return; }
  console.log(`Flight: ${fl[0].flight_number} ${fl[0].origin}→${fl[0].dest} status=${fl[0].status}`);
  
  // Flight legs
  const flegs = await prisma.$queryRawUnsafe<Array<{leg_num:number; origin:string; dest:string}>>(
    "SELECT leg_number AS leg_num, origin_code AS origin, destination_code AS dest FROM flight_legs WHERE flight_id = 150 ORDER BY leg_number"
  );
  console.log(`Flight legs (${flegs.length}):`);
  for (const l of flegs) console.log(`  ${l.leg_num}: ${l.origin}→${l.dest}`);
  
  // Booking legs on this flight
  const blegs = await prisma.$queryRawUnsafe<Array<{id:number; ref:string; origin:string; dest:string; date:string}>>(
    `SELECT bl.id, b.booking_reference AS ref, bl.origin_code AS origin, bl.destination_code AS dest, bl.leg_date::text AS date
     FROM booking_legs bl JOIN bookings b ON b.id = bl.booking_id WHERE bl.flight_id = 150 ORDER BY bl.id`
  );
  console.log(`\nBooking legs on flight (${blegs.length}):`);
  for (const bl of blegs) {
    const pax = await prisma.$queryRawUnsafe<Array<{name:string}>>(
      `SELECT CONCAT(bp.first_name, ' ', bp.last_name) AS name
       FROM booking_leg_passengers blp
       JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
       WHERE blp.booking_leg_id = $1 ORDER BY bp.id`,
      bl.id
    );
    console.log(`  ${bl.ref} ${bl.origin}→${bl.dest} (${bl.date}): ${pax.map(p => p.name).join(', ')}`);
  }
  
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
