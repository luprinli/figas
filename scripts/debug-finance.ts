import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas";
const prisma = new PrismaClient({ adapter: new PrismaPg(DATABASE_URL, { disposeExternalPool: true }) });

async function main() {
  // Check org bookings
  const orgBks = await prisma.$queryRawUnsafe<Array<{cnt:number}>>(
    `SELECT COUNT(*)::int AS cnt FROM bookings WHERE organization_id IS NOT NULL AND payment_status != 'cancelled'`
  );
  console.log(`Org bookings (org_id NOT NULL, not cancelled): ${orgBks[0].cnt}`);

  const orgBksDetail = await prisma.$queryRawUnsafe<Array<{id:number; ref:string; org_id:number|null; pay_status:string; total:number}>>(
    `SELECT id, booking_reference AS ref, organization_id AS org_id, payment_status AS pay_status, total_amount_gbp AS total
     FROM bookings WHERE organization_id IS NOT NULL ORDER BY id LIMIT 10`
  );
  console.log("\nSample org bookings:");
  for (const b of orgBksDetail) {
    console.log(`  ${b.ref}: org=${b.org_id} status=${b.pay_status} total=${b.total}`);
  }

  // Check how many bookings have is_organization_billing = true
  const orgBill = await prisma.$queryRawUnsafe<Array<{cnt:number}>>(
    `SELECT COUNT(*)::int AS cnt FROM bookings WHERE is_organization_billing = true`
  );
  console.log(`\nBookings with is_organization_billing=true: ${orgBill[0].cnt}`);

  // Check payment-booking join for journal entries
  const payWithBk = await prisma.$queryRawUnsafe<Array<{cnt:number}>>(
    `SELECT COUNT(*)::int AS cnt FROM payments p JOIN bookings b ON b.id = p.booking_id`
  );
  console.log(`Payments with valid booking: ${payWithBk[0].cnt}`);

  // Check if any journal entries exist at all
  const jeAny = await prisma.$queryRawUnsafe<Array<{cnt:number}>>(
    `SELECT COUNT(*)::int AS cnt FROM accounting_journal_entries`
  );
  console.log(`Existing journal entries (any): ${jeAny[0].cnt}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
