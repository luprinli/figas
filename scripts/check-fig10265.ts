import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas", { disposeExternalPool: true }) });

async function main() {
  const bk = await prisma.$queryRawUnsafe<Array<{id:number; ref:string; status:string}>>(
    "SELECT id, booking_reference AS ref, status FROM bookings WHERE booking_reference = 'FIG-10265'"
  );
  if (bk.length === 0) { console.log("FIG-10265 not found"); await prisma.$disconnect(); return; }
  
  console.log(`Booking: ${bk[0].ref} (id=${bk[0].id}, status=${bk[0].status})`);
  
  const legs = await prisma.$queryRawUnsafe<Array<{id:number; origin:string; dest:string; date:string; flight_id:number|null}>>(
    "SELECT id, origin_code AS origin, destination_code AS dest, leg_date::text AS date, flight_id FROM booking_legs WHERE booking_id = $1 ORDER BY id", bk[0].id
  );
  console.log(`\nLegs (${legs.length}):`);
  for (const l of legs) {
    console.log(`  Leg ${l.id}: ${l.origin}→${l.dest} date=${l.date} flight=${l.flight_id ?? 'null'}`);
    const pax = await prisma.$queryRawUnsafe<Array<{name:string; bp_id:number; blp_id:number|null}>>(
      `SELECT CONCAT(bp.first_name, ' ', bp.last_name) AS name, bp.id AS bp_id, blp.id AS blp_id
       FROM booking_passengers bp
       LEFT JOIN booking_leg_passengers blp ON blp.booking_passenger_id = bp.id AND blp.booking_leg_id = $1
       WHERE bp.booking_id = $2
       ORDER BY bp.id`,
      l.id, bk[0].id
    );
    for (const p of pax) {
      console.log(`    ${p.name} (bp_id=${p.bp_id}) junction=${p.blp_id ? 'PRESENT' : 'MISSING'}`);
    }
  }
  
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
