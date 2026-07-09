import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas", { disposeExternalPool: true }) });

async function main() {
  const r = await prisma.$queryRawUnsafe<Array<{indexname:string; indexdef:string}>>(
    `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'booking_leg_passengers' ORDER BY indexname`
  );
  console.log("Indexes on booking_leg_passengers:");
  for (const c of r) {
    console.log(`  ${c.indexname}: ${c.indexdef}`);
  }

  // Also check constraints
  const c2 = await prisma.$queryRawUnsafe<Array<{conname:string; contype:string; def:string}>>(
    `SELECT conname, contype, pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = 'booking_leg_passengers'::regclass ORDER BY conname`
  );
  console.log("\nConstraints on booking_leg_passengers:");
  for (const c of c2) {
    console.log(`  ${c.conname} (${c.contype}): ${c.def}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
