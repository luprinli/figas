import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas", { disposeExternalPool: true }) });

async function main() {
  // Find schedules for June 16-17
  const schedules = await prisma.$queryRawUnsafe<Array<{id:number; schedule_date:string; status:string}>>(
    `SELECT id, schedule_date::text, status FROM schedules
     WHERE schedule_date >= '2026-06-16' AND schedule_date < '2026-06-18'
     ORDER BY schedule_date`
  );
  console.log("Schedules:");
  for (const s of schedules) console.log(`  id=${s.id} date=${s.schedule_date} status=${s.status}`);

  // Flights for those dates
  const flights = await prisma.$queryRawUnsafe<Array<{id:number; flight_number:string; schedule_id:number; status:string}>>(
    `SELECT f.id, f.flight_number, f.schedule_id, f.status FROM flights f
     WHERE f.schedule_id IN (SELECT id FROM schedules WHERE schedule_date >= '2026-06-16' AND schedule_date < '2026-06-18')
     ORDER BY f.flight_number`
  );
  console.log("\nFlights:");
  for (const f of flights) console.log(`  id=${f.id} ${f.flight_number} schedule=${f.schedule_id} status=${f.status}`);

  // Loadsheets for those flights
  const flightIds = flights.map(f => f.id);
  if (flightIds.length > 0) {
    const loads = await prisma.$queryRawUnsafe<Array<{id:number; flight_id:number; total_pax:number; status:string}>>(
      `SELECT id, flight_id, total_pax, status FROM loadsheets WHERE flight_id = ANY($1::int[])`,
      flightIds
    );
    console.log("\nLoadsheets:");
    for (const l of loads) console.log(`  id=${l.id} flight=${l.flight_id} pax=${l.total_pax} status=${l.status}`);

    // Count actual passengers per flight (via booking_legs)
    const paxCounts = await prisma.$queryRawUnsafe<Array<{flight_id:number; cnt:number}>>(
      `SELECT bl.flight_id, COUNT(*)::int AS cnt
       FROM booking_leg_passengers blp
       JOIN booking_legs bl ON bl.id = blp.booking_leg_id
       WHERE bl.flight_id = ANY($1::int[])
       GROUP BY bl.flight_id`,
      flightIds
    );
    console.log("\nActual passenger counts (via booking_legs):");
    for (const p of paxCounts) console.log(`  flight=${p.flight_id}: ${p.cnt} passengers`);

    // Loadsheet passenger counts
    const lsPax = await prisma.$queryRawUnsafe<Array<{flight_id:number; cnt:number}>>(
      `SELECT l.flight_id, COUNT(lp.id)::int AS cnt
       FROM loadsheets l
       LEFT JOIN loadsheet_passengers lp ON lp.loadsheet_id = l.id
       WHERE l.flight_id = ANY($1::int[])
       GROUP BY l.flight_id`,
      flightIds
    );
    console.log("\nLoadsheet passenger counts:");
    for (const p of lsPax) console.log(`  flight=${p.flight_id}: ${p.cnt} passengers`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
