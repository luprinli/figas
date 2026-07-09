import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas";
const prisma = new PrismaClient({ adapter: new PrismaPg(DATABASE_URL, { disposeExternalPool: true }) });

async function main() {
  const tables = ["loadsheet_sectors","seat_assignments","sign_offs","loadsheets","flight_manifests","flight_logs","published_schedule_flights","loadsheet_passengers","flight_legs"];
  for (const t of tables) {
    const cols = await prisma.$queryRawUnsafe<Array<{column_name:string}>>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, t
    );
    console.log(`${t}: [${cols.map(c => c.column_name).join(", ")}]`);
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
