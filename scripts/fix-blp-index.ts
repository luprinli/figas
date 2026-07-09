import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas", { disposeExternalPool: true }) });

async function main() {
  console.log("Dropping invalid unique index booking_leg_passengers_booking_leg_id_flight_leg_id_key...");
  await prisma.$executeRawUnsafe(
    `DROP INDEX IF EXISTS booking_leg_passengers_booking_leg_id_flight_leg_id_key`
  );
  console.log("Done. The correct unique constraint (booking_leg_id, booking_passenger_id) remains.");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
