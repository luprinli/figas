import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas";
const prisma = new PrismaClient({ adapter: new PrismaPg(DATABASE_URL, { disposeExternalPool: true }) });

async function main() {
  const tables = [
    "invoices", "invoice_items", "accounting_journal_entries", "accounting_journal_lines",
    "aircraft", "pilots", "no_fly_rules"
  ];
  
  for (const table of tables) {
    const cols = await prisma.$queryRawUnsafe<Array<{column_name:string; data_type:string; is_nullable:string; column_default:string|null}>>(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = '${table}'
      ORDER BY ordinal_position
    `);
    console.log(`\n=== ${table} (${cols.length} columns) ===`);
    for (const c of cols) {
      const nullable = c.is_nullable === 'YES' ? '' : ' NOT NULL';
      const def = c.column_default ? ` DEFAULT ${c.column_default}` : '';
      console.log(`  ${c.column_name}: ${c.data_type}${nullable}${def}`);
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
