import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas";
const prisma = new PrismaClient({ adapter: new PrismaPg(DATABASE_URL, { disposeExternalPool: true }) });

async function main() {
  const cols = await prisma.$queryRawUnsafe<Array<{column_name:string; data_type:string; is_nullable:string; column_default:string|null}>>(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'chart_of_accounts'
     ORDER BY ordinal_position`
  );
  console.log("=== chart_of_accounts columns ===");
  for (const c of cols) {
    console.log(`  ${c.column_name}: ${c.data_type} ${c.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'} ${c.column_default ? 'DEFAULT ' + c.column_default : ''}`);
  }

  const rows = await prisma.$queryRawUnsafe<Array<{id:unknown; account_code:string}>>(
    "SELECT id, account_code FROM chart_of_accounts LIMIT 3"
  );
  console.log("\nExisting rows:", JSON.stringify(rows));

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
