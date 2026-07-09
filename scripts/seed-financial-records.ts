/**
 * Financial Records Seeding — populates chart_of_accounts, invoices,
 * invoice_items, journal entries, and journal lines.
 *
 * Matches actual table schemas discovered from the database.
 * Idempotent — uses ON CONFLICT DO NOTHING where possible.
 */
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas";
const prisma = new PrismaClient({ adapter: new PrismaPg(DATABASE_URL, { disposeExternalPool: true }) });

async function main() {
  console.log("=== Financial Records Seed ===\n");

  // ═══════════════════════════════════════════════════════════
  // 1. Chart of Accounts (if empty)
  // ═══════════════════════════════════════════════════════════
  console.log("── Chart of Accounts ──");
  const coaCount = await prisma.$queryRawUnsafe<Array<{cnt:number}>>(
    "SELECT COUNT(*)::int AS cnt FROM chart_of_accounts"
  );
  if (coaCount[0].cnt === 0) {
    const coaRows = [
      ['1010', 'Cash at Bank',              'asset',    'Cash held in bank accounts'],
      ['1020', 'Accounts Receivable',       'asset',    'Amounts owed by customers'],
      ['1030', 'Prepaid Expenses',          'asset',    'Prepaid insurance, leases, etc.'],
      ['2010', 'Accounts Payable',          'liability', 'Amounts owed to suppliers'],
      ['2020', 'Deferred Revenue',          'liability', 'Unearned ticket revenue'],
      ['2030', 'VAT/GST Payable',           'liability', 'Value-added / goods & services tax collected'],
      ['3010', 'Retained Earnings',         'equity',    'Accumulated retained earnings'],
      ['3020', 'Current Year Earnings',     'equity',    'Current financial year profit/loss'],
      ['4010', 'Passenger Fare Revenue',    'revenue',   'Revenue from passenger ticket sales'],
      ['4020', 'Freight/Cargo Revenue',     'revenue',   'Revenue from freight and cargo transport'],
      ['4030', 'Baggage Fee Revenue',       'revenue',   'Revenue from baggage fees'],
      ['4040', 'Fuel Surcharge Revenue',    'revenue',   'Revenue from fuel surcharges'],
      ['4050', 'Cancellation Fee Revenue',  'revenue',   'Revenue from cancellation / change fees'],
      ['4060', 'Other Revenue',             'revenue',   'Miscellaneous revenue'],
      ['5010', 'Fuel Expense',              'expense',   'Aircraft fuel and oil costs'],
      ['5020', 'Maintenance Expense',       'expense',   'Aircraft maintenance and repair costs'],
      ['5030', 'Staff Costs',               'expense',   'Salaries, wages, and benefits'],
      ['5040', 'Landing & Handling Fees',   'expense',   'Airport landing and ground handling fees'],
      ['5050', 'Insurance Expense',         'expense',   'Aviation insurance premiums'],
      ['5060', 'Bank Charges & Processing Fees', 'expense', 'Bank fees and payment processing charges'],
    ];
    for (const [code, name, type, desc] of coaRows) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO chart_of_accounts (id, account_code, account_name, account_type, description, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
         ON CONFLICT (account_code) DO NOTHING`,
        code, name, type, desc
      );
    }
    console.log("  ✓ 20 accounts seeded");
  } else {
    console.log(`  ✓ ${coaCount[0].cnt} accounts already exist`);
  }

  // Pre-fetch account IDs
  const accounts = await prisma.$queryRawUnsafe<Array<{id:string; account_code:string}>>(
    "SELECT id, account_code FROM chart_of_accounts"
  );
  const acctMap: Record<string, string> = {};
  for (const a of accounts) { acctMap[a.account_code] = a.id; }

  // Pre-fetch users
  const financeUser = await prisma.$queryRawUnsafe<Array<{id:number}>>(
    "SELECT id FROM users WHERE email = 'finance@figas.gov.fk' LIMIT 1"
  );
  const financeUserId = financeUser[0]?.id || 1;

  // ═══════════════════════════════════════════════════════════════
  // 2. Invoices & Invoice Items (for organization-billed bookings)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n── Invoices ──");
  const orgBookings = await prisma.$queryRawUnsafe<Array<{
    booking_id: number; booking_reference: string; total_amount_gbp: number;
    organization_id: number; payment_status: string; payment_due_date: string;
  }>>(
    `SELECT b.id AS booking_id, b.booking_reference, b.total_amount_gbp,
            b.organization_id, b.payment_status, b.payment_due_date::text
     FROM bookings b
     WHERE b.organization_id IS NOT NULL
       AND b.payment_status != 'cancelled'
       AND b.total_amount_gbp > 0
       AND b.id NOT IN (SELECT booking_id FROM invoices WHERE booking_id IS NOT NULL)
     ORDER BY b.id`
  );

  let invCount = 0;
  for (const bk of orgBookings) {
    const invoiceNumber = `INV-${bk.booking_reference}`;
    const issueDate = bk.payment_due_date?.slice(0, 10) || "2026-06-01";
    const dueDate = issueDate; // payment_due_date is already the due date

    // Determine invoice status (must match InvoiceStatus enum: draft, issued, paid, overdue, cancelled, written_off)
    let invStatus = "issued";
    if (bk.payment_status === "paid") invStatus = "paid";
    else if (bk.payment_status === "overdue") invStatus = "overdue";
    else if (bk.payment_status === "partially_paid") invStatus = "issued";

    try {
      const invR = await prisma.$queryRawUnsafe<Array<{id:string}>>(
        `INSERT INTO invoices (id, invoice_number, booking_id, organization_id, user_id, status,
         issue_date, due_date, subtotal_gbp, total_gbp, currency, created_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::invoice_status, $6::date, $7::date, $8, $8, 'GBP', $9, NOW(), NOW())
         ON CONFLICT (invoice_number) DO UPDATE SET total_gbp = EXCLUDED.total_gbp
         RETURNING id::text`,
        invoiceNumber, bk.booking_id, bk.organization_id, financeUserId, invStatus,
        issueDate, dueDate, bk.total_amount_gbp, financeUserId
      );

      if (invR.length > 0) {
        const invId = invR[0].id;
        // Invoice items: fare + baggage fee
        await prisma.$executeRawUnsafe(
          `INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price_gbp, type, sort_order, created_at)
           VALUES (gen_random_uuid(), $1::uuid, $2, 1, $3, 'fare', 1, NOW())`,
          invId, `Passenger fare for ${bk.booking_reference}`, bk.total_amount_gbp * 0.85
        );
        await prisma.$executeRawUnsafe(
          `INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price_gbp, type, sort_order, created_at)
           VALUES (gen_random_uuid(), $1::uuid, $2, 1, $3, 'passenger_fee', 2, NOW())`,
          invId, `Passenger fees for ${bk.booking_reference}`, bk.total_amount_gbp * 0.15
        );
        invCount++;
      }
    } catch (e: unknown) { console.error(`  Invoice error for ${bk.booking_reference}: ${(e as Error).message}`); }
  }
  console.log(`  ✓ ${invCount} invoices created`);

  // ═══════════════════════════════════════════════════════════════
  // 3. Journal Entries & Journal Lines (for payments)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n── Journal Entries ──");
  const payments = await prisma.$queryRawUnsafe<Array<{
    id: number; booking_id: number; amount_gbp: number; method: string;
    booking_reference: string; paid_at: string;
  }>>(
    `SELECT p.id, p.booking_id, COALESCE(p.amount_gbp, 0) AS amount_gbp, 
            COALESCE(p.method, 'cash') AS method, b.booking_reference,
            COALESCE(p.paid_at::text, NOW()::text) AS paid_at
     FROM payments p
     JOIN bookings b ON b.id = p.booking_id
     WHERE p.id NOT IN (SELECT payment_id FROM accounting_journal_entries WHERE payment_id IS NOT NULL)
     ORDER BY p.id`
  );

  const jeCount = 0;
  for (const pay of payments) {
    const entryNumber = `JE-${pay.id.toString().padStart(6, "0")}`;
    const entryDate = pay.paid_at?.slice(0, 10) || "2026-06-01";
    const amount = Math.abs(pay.amount_gbp);
    const isRefund = pay.amount_gbp < 0;

    try {
      const jeR = await prisma.$queryRawUnsafe<Array<{id:string}>>(
        `INSERT INTO accounting_journal_entries 
         (id, entry_number, entry_type, description, booking_id, payment_id, entry_date, created_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::date, $7, NOW(), NOW())
         ON CONFLICT (entry_number) DO NOTHING
         RETURNING id::text`,
        entryNumber,
        isRefund ? "refund" : "payment",
        `${isRefund ? "Refund" : "Payment"} for booking ${pay.booking_reference} via ${pay.method}`,
        pay.booking_id,
        pay.id,
        entryDate,
        financeUserId
      );

      if (jeR.length > 0) {
        const jeId = jeR[0].id;
        const cashAccountId = acctMap["1010"];
        const revenueAccountId = isRefund ? acctMap["4060"] : acctMap["4010"];

        if (cashAccountId && revenueAccountId) {
          // Debit: Cash at Bank (receiving money) — or Credit if refund
          await prisma.$executeRawUnsafe(
            `INSERT INTO accounting_journal_lines (id, entry_id, account_id, debit_amount_gbp, credit_amount_gbp, description, created_at)
             VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5, NOW())`,
            jeId, cashAccountId, isRefund ? 0 : amount, isRefund ? amount : 0,
            `${isRefund ? "Refund" : "Payment"} received via ${pay.method}`
          );
          await prisma.$executeRawUnsafe(
            `INSERT INTO accounting_journal_lines (id, entry_id, account_id, debit_amount_gbp, credit_amount_gbp, description, created_at)
             VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5, NOW())`,
            jeId, revenueAccountId, isRefund ? amount : 0, isRefund ? 0 : amount,
            `Revenue from booking ${pay.booking_reference}`
          );
        }
      }
    } catch (e: unknown) { console.error(`  JE error for payment ${pay.id}: ${(e as Error).message}`); }
  }
  console.log(`  ✓ ${jeCount} journal entries created`);

  // ═══════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════
  const summary = await prisma.$queryRawUnsafe<Array<Record<string,number>>>(
    `SELECT
      (SELECT COUNT(*) FROM chart_of_accounts) AS chart_of_accounts,
      (SELECT COUNT(*) FROM invoices) AS invoices,
      (SELECT COUNT(*) FROM invoice_items) AS invoice_items,
      (SELECT COUNT(*) FROM accounting_journal_entries) AS journal_entries,
      (SELECT COUNT(*) FROM accounting_journal_lines) AS journal_lines,
      (SELECT COUNT(*) FROM payments) AS payments`
  );
  const s = summary[0];
  console.log("\n=== Financial Records Summary ===");
  console.log(`  Chart of Accounts:    ${s.chart_of_accounts}`);
  console.log(`  Invoices:             ${s.invoices}`);
  console.log(`  Invoice Items:        ${s.invoice_items}`);
  console.log(`  Journal Entries:      ${s.journal_entries}`);
  console.log(`  Journal Lines:        ${s.journal_lines}`);
  console.log(`  Payments:             ${s.payments}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
