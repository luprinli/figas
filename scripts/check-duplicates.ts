import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas";
const prisma = new PrismaClient({ adapter: new PrismaPg(DATABASE_URL, { disposeExternalPool: true }) });

async function main() {
  // Check duplicate aircraft by registration
  console.log("=== Duplicate Aircraft ===");
  const dupAircraft = await prisma.$queryRawUnsafe<Array<{registration:string; cnt:number; min_id:number; max_id:number}>>(
    `SELECT registration, COUNT(*) as cnt, MIN(id) as min_id, MAX(id) as max_id FROM aircraft GROUP BY registration HAVING COUNT(*) > 1`
  );
  for (const d of dupAircraft) {
    console.log(`  ${d.registration}: ${d.cnt} copies (min_id=${d.min_id}, max_id=${d.max_id})`);
  }
  if (dupAircraft.length === 0) console.log("  None");

  // Check duplicate pilots by user_id
  console.log("\n=== Duplicate Pilots ===");
  const dupPilots = await prisma.$queryRawUnsafe<Array<{user_id:number; name:string; cnt:number; min_id:number}>>(
    `SELECT user_id, name, COUNT(*) as cnt, MIN(id) as min_id FROM pilots GROUP BY user_id, name HAVING COUNT(*) > 1`
  );
  for (const d of dupPilots) {
    console.log(`  user_id=${d.user_id} (${d.name}): ${d.cnt} copies (min_id=${d.min_id})`);
  }
  if (dupPilots.length === 0) console.log("  None");

  // Check duplicate no_fly_rules
  console.log("\n=== Duplicate No-Fly Rules ===");
  const dupNfr = await prisma.$queryRawUnsafe<Array<{label:string; cnt:number; min_id:number}>>(
    `SELECT label, COUNT(*) as cnt, MIN(id) as min_id FROM no_fly_rules GROUP BY label HAVING COUNT(*) > 1`
  );
  for (const d of dupNfr) {
    console.log(`  ${d.label}: ${d.cnt} copies (min_id=${d.min_id})`);
  }
  if (dupNfr.length === 0) console.log("  None");

  // Check flights on Sundays
  console.log("\n=== Flights on Sundays (no-fly days) ===");
  const sundayFlights = await prisma.$queryRawUnsafe<Array<{flight_number:string; departure_time:string}>>(
    `SELECT flight_number, departure_time::text FROM flights WHERE EXTRACT(DOW FROM departure_time) = 0 ORDER BY departure_time`
  );
  console.log(`  Count: ${sundayFlights.length}`);
  for (const f of sundayFlights.slice(0, 10)) {
    console.log(`    ${f.flight_number} at ${f.departure_time}`);
  }
  if (sundayFlights.length > 10) console.log(`    ... and ${sundayFlights.length - 10} more`);

  // Also check one-off no-fly dates
  console.log("\n=== Flights on Holiday No-Fly Days ===");
  const holidays = ["2026-04-03","2026-04-06","2026-06-14","2026-12-25","2026-12-26","2026-12-31"];
  for (const h of holidays) {
    const hFlights = await prisma.$queryRawUnsafe<Array<{cnt:number}>>(
      `SELECT COUNT(*) as cnt FROM flights WHERE departure_time::date = $1::date`, h
    );
    if (hFlights[0].cnt > 0) {
      console.log(`  ${h}: ${hFlights[0].cnt} flights`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
