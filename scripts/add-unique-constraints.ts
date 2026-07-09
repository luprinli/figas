import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas";
const prisma = new PrismaClient({ adapter: new PrismaPg(DATABASE_URL, { disposeExternalPool: true }) });

async function main() {
  console.log("Adding unique constraints to prevent future duplication...");

  // pilots: unique on (user_id)
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_pilots_user_id_unique ON pilots(user_id) WHERE user_id IS NOT NULL`
  );
  console.log("  ✓ pilots.user_id unique index");

  // no_fly_rules: unique on (label)
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_nfr_label_unique ON no_fly_rules(label)`
  );
  console.log("  ✓ no_fly_rules.label unique index");

  // aircraft: check if unique constraint exists on registration
  const aircraftIdx = await prisma.$queryRawUnsafe<Array<{conname:string}>>(
    `SELECT conname FROM pg_constraint WHERE conrelid = 'aircraft'::regclass AND contype = 'u' AND conname LIKE '%registration%'`
  );
  if (aircraftIdx.length === 0) {
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_aircraft_registration_unique ON aircraft(registration)`
    );
    console.log("  ✓ aircraft.registration unique index");
  } else {
    console.log("  ✓ aircraft.registration unique already exists");
  }

  console.log("\nUnique constraints added successfully.");
  await prisma.$disconnect();
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
