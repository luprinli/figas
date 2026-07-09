import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas";
const prisma = new PrismaClient({ adapter: new PrismaPg(DATABASE_URL, { disposeExternalPool: true }) });

async function main() {
  const accts = await prisma.$queryRawUnsafe<Array<{id:string; account_code:string; account_name:string; account_type:string}>>(
    "SELECT id, account_code, account_name, account_type FROM chart_of_accounts ORDER BY account_code LIMIT 20"
  );
  console.log("\n=== Chart of Accounts ===");
  for (const a of accts) {
    console.log(`  ${a.account_code} (${a.account_type}): ${a.account_name} [${a.id}]`);
  }

  const users = await prisma.$queryRawUnsafe<Array<{id:number; email:string; name:string}>>(
    "SELECT id, email, name FROM users WHERE email IN ('finance@figas.gov.fk','ops@figas.gov.fk')"
  );
  console.log("\n=== Key Users ===");
  for (const u of users) {
    console.log(`  id=${u.id}: ${u.email} (${u.name})`);
  }

  const orgs = await prisma.$queryRawUnsafe<Array<{id:number; code:string; name:string}>>(
    "SELECT id, code, name FROM organizations"
  );
  console.log("\n=== Organizations ===");
  for (const o of orgs) {
    console.log(`  id=${o.id}: ${o.code} - ${o.name}`);
  }

  const currentInvoices = await prisma.$queryRawUnsafe<Array<{cnt:number}>>(
    "SELECT COUNT(*) as cnt FROM invoices"
  );
  const currentJEs = await prisma.$queryRawUnsafe<Array<{cnt:number}>>(
    "SELECT COUNT(*) as cnt FROM accounting_journal_entries"
  );
  console.log(`\nCurrent invoices: ${currentInvoices[0].cnt}`);
  console.log(`Current journal entries: ${currentJEs[0].cnt}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
