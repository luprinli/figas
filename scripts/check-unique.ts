import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas";
const prisma = new PrismaClient({ adapter: new PrismaPg(DATABASE_URL, { disposeExternalPool: true }) });

async function main() {
  const r = await prisma.$queryRawUnsafe<Array<{tbl:string; conname:string; def:string}>>(
    `SELECT conname, conrelid::regclass::text AS tbl, pg_get_constraintdef(oid) AS def
     FROM pg_constraint
     WHERE contype = 'u'
       AND conrelid::regclass::text IN ('pilots', 'no_fly_rules')
     ORDER BY tbl`
  );
  console.log("Unique constraints:");
  for (const c of r) {
    console.log(`  ${c.tbl}: ${c.conname} = ${c.def}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
