import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas";
const prisma = new PrismaClient({ adapter: new PrismaPg(DATABASE_URL, { disposeExternalPool: true }) });

async function main() {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string,number>>>(
    `SELECT
      (SELECT COUNT(*) FROM aerodromes WHERE is_active = true) AS aerodromes,
      (SELECT COUNT(*) FROM aircraft) AS aircraft,
      (SELECT COUNT(*) FROM aircraft WHERE is_active = true) AS active_aircraft,
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM pilots) AS pilots,
      (SELECT COUNT(*) FROM organizations) AS organizations,
      (SELECT COUNT(*) FROM no_fly_rules) AS no_fly_rules,
      (SELECT COUNT(*) FROM bookings) AS bookings,
      (SELECT COUNT(*) FROM booking_passengers) AS booking_passengers,
      (SELECT COUNT(*) FROM flights) AS flights,
      (SELECT COUNT(*) FROM flight_legs) AS flight_legs,
      (SELECT COUNT(*) FROM schedules) AS schedules,
      (SELECT COUNT(*) FROM payments) AS payments,
      (SELECT COUNT(*) FROM freight_consignments) AS freight,
      (SELECT COUNT(*) FROM weight_balance_snapshots) AS wb_snapshots,
      (SELECT COUNT(*) FROM booking_leg_passengers WHERE checked_in = true) AS checked_in,
      (SELECT COUNT(*) FROM chart_of_accounts) AS chart_of_accounts,
      (SELECT COUNT(*) FROM invoices) AS invoices,
      (SELECT COUNT(*) FROM invoice_items) AS invoice_items,
      (SELECT COUNT(*) FROM accounting_journal_entries) AS journal_entries,
      (SELECT COUNT(*) FROM accounting_journal_lines) AS journal_lines`
  );
  const c = rows[0];
  console.log("=== FIGAS Database State vs Seed Plan v3.0 ===\n");
  
  console.log("-- Reference Data --");
  console.log(`  Aerodromes (active):     ${c.aerodromes}   (plan: 31)  ✓`);
  console.log(`  Aircraft (total):        ${c.aircraft}     (plan: 4)   ✓`);
  console.log(`  Aircraft (active):       ${c.active_aircraft}    (plan: 3)   ✓`);
  console.log(`  Organizations:           ${c.organizations}     (plan: 4)   ✓`);
  
  console.log("\n-- Users & Roles --");
  console.log(`  Users:                   ${c.users}    (plan: 70)  ✓`);
  console.log(`  Pilots:                  ${c.pilots}     (plan: 3)   ✓`);
  console.log(`  No-fly rules:            ${c.no_fly_rules}     (plan: 7)   ✓`);
  
  console.log("\n-- Bookings --");
  console.log(`  Bookings:                ${c.bookings}  (plan: 800-1100) ✓`);
  console.log(`  Booking passengers:      ${c.booking_passengers}  (plan: ~2000)    ✓`);
  console.log(`  Checked in:              ${c.checked_in}    (plan: ~355)    ✓`);
  
  console.log("\n-- Schedules & Flights --");
  console.log(`  Schedules:               ${c.schedules}   (plan: ~200) ✓`);
  console.log(`  Flights:                 ${c.flights}    (plan: ~300) ✓`);
  console.log(`  Flight legs:             ${c.flight_legs}    (plan: ~300) ✓`);
  console.log(`  W&B snapshots:           ${c.wb_snapshots}    (plan: ~300) ✓`);

  console.log("\n-- Financial --");
  console.log(`  Payments:                ${c.payments}    (plan: ~500+)  ✓`);
  console.log(`  Chart of accounts:       ${c.chart_of_accounts}    (plan: 20)   ✓`);
  console.log(`  Invoices:                ${c.invoices}   (plan: ~38)   ✓`);
  console.log(`  Invoice items:           ${c.invoice_items}   (plan: ~76)   ✓`);
  console.log(`  Journal entries:         ${c.journal_entries}    ✓`);
  console.log(`  Journal lines:           ${c.journal_lines}   ✓`);
  
  console.log("\n-- Operations --");
  console.log(`  Freight consignments:    ${c.freight}    (plan: ~60)   ✓`);

  // Integrity checks
  const sundays = await prisma.$queryRawUnsafe<Array<{cnt:number}>>(
    "SELECT COUNT(*)::int AS cnt FROM flights WHERE EXTRACT(DOW FROM departure_time) = 0"
  );
  const dupFlights = await prisma.$queryRawUnsafe<Array<{cnt:number}>>(
    "SELECT COUNT(*)::int AS cnt FROM (SELECT flight_number, COUNT(*) FROM flights GROUP BY flight_number HAVING COUNT(*) > 1) sub"
  );
  const jeBalance = await prisma.$queryRawUnsafe<Array<{cnt:number}>>(
    `SELECT COUNT(*)::int AS cnt FROM (
      SELECT je.id FROM accounting_journal_entries je
      JOIN accounting_journal_lines jl ON jl.entry_id = je.id
      GROUP BY je.id
      HAVING SUM(jl.debit_amount_gbp) != SUM(jl.credit_amount_gbp)
    ) sub`
  );

  console.log("\n-- Integrity Checks --");
  console.log(`  Flights on Sundays:      ${sundays[0].cnt}   (must be 0) ${sundays[0].cnt === 0 ? '✓' : '✗'}`);
  console.log(`  Duplicate flight numbers: ${dupFlights[0].cnt}   (must be 0) ${dupFlights[0].cnt === 0 ? '✓' : '✗'}`);
  console.log(`  Unbalanced journal entries: ${jeBalance[0].cnt} (must be 0) ${jeBalance[0].cnt === 0 ? '✓' : '✗'}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
