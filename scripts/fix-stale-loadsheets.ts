import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas", { disposeExternalPool: true }) });

async function main() {
  // Delete stale loadsheets for flights 148 and any others from June 16-17 schedules
  const result = await prisma.$executeRawUnsafe(
    `DELETE FROM loadsheets WHERE flight_id = ANY(
      SELECT f.id FROM flights f
      WHERE f.schedule_id IN (SELECT id FROM schedules WHERE schedule_date >= '2026-06-16' AND schedule_date < '2026-06-18')
    )`
  );
  console.log(`Deleted ${result} stale loadsheet(s). Next page load will regenerate them with all passengers.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
