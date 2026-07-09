import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas", { disposeExternalPool: true }) });

async function main() {
  const schedules = await prisma.$queryRawUnsafe<Array<{id:number; schedule_date:string; status:string}>>(
    "SELECT id, schedule_date, status FROM schedules WHERE schedule_date >= '2026-06-15' AND schedule_date <= '2026-06-17' ORDER BY schedule_date"
  );
  console.log("Schedules 15-17 June:");
  for (const s of schedules) {
    console.log(`  id=${s.id}: ${s.schedule_date} status=${s.status}`);
  }

  // Also check bookings for June 16
  const bkgs = await prisma.$queryRawUnsafe<Array<{cnt:number}>>(
    "SELECT COUNT(*)::int AS cnt FROM bookings b JOIN booking_legs bl ON bl.booking_id = b.id WHERE bl.leg_date = '2026-06-16'"
  );
  console.log(`\nBookings on 2026-06-16: ${bkgs[0].cnt}`);

  // Check flights for June 16
  const flights = await prisma.$queryRawUnsafe<Array<{id:number; flight_number:string; status:string}>>(
    "SELECT id, flight_number, status FROM flights WHERE departure_time::date = '2026-06-16'"
  );
  console.log(`Flights on 2026-06-16: ${flights.length}`);
  for (const f of flights) {
    console.log(`  ${f.flight_number} status=${f.status}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
