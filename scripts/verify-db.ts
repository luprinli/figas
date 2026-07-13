import { db } from "../app/utils/db.server";
import { sql } from "kysely";

const EXPECTED_TABLES = [
  "users", "aerodromes", "aircraft", "organizations", "pilots",
  "fare_routes", "flights", "bookings", "booking_legs", "booking_passengers",
  "booking_leg_passengers", "seat_assignments", "checkin_reminders",
  "notifications", "flight_manifests", "system_settings", "payments",
  "fuel_rules", "aerodrome_distances", "aerodrome_headings",
  "airframe_hours", "payment_methods", "invoices", "invoice_items",
  "chart_of_accounts", "accounting_journal_entries",
  "accounting_journal_lines", "payment_reminders", "stripe_payments",
  "bank_transactions", "export_log", "schedules", "flight_legs",
  "pilot_assignments", "aircraft_assignments", "no_fly_rules",
  "weight_balance_snapshots", "roles", "permissions", "role_permissions",
  "user_roles", "audit_log", "password_reset_tokens",
  "email_verification_tokens", "data_table_migrations", "time_templates",
  "loadsheets", "loadsheet_passengers", "loadsheet_sectors",
  "loadsheet_audit_log", "published_schedules", "published_schedule_flights",
  "fare_matrix", "payment_allocations", "invoice_line_items",
  "flight_logs", "maintenance_tasks", "defects", "lifed_components",
  "sign_offs", "ata_chapters", "webhook_events", "freight_consignments",
];

async function main(): Promise<void> {
  console.log("\n\uD83D\uDD0D FIGAS Database Schema Verification\n");

  const result = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `.execute(db);

  const existing = new Set(
    result.rows.map((r: unknown) => (r as { table_name: string }).table_name)
  );

  const missing = EXPECTED_TABLES.filter((t) => !existing.has(t));
  const extra = [...existing].filter((t) => !EXPECTED_TABLES.includes(t));

  console.log(`Expected: ${EXPECTED_TABLES.length} tables`);
  console.log(`Found:    ${existing.size} tables\n`);

  if (missing.length > 0) {
    console.error(`\u274C Missing ${missing.length} table(s):`);
    missing.forEach((m) => console.error(`  - ${m}`));
  }

  if (extra.length > 0) {
    console.log(`\u2139\uFE0F  Extra ${extra.length} table(s) in database:`);
    extra.forEach((e) => console.log(`  - ${e}`));
  }

  if (missing.length === 0) {
    console.log("\u2705 All 63 expected tables present.\n");
    process.exit(0);
  } else {
    console.error(`\n\u274C Verification failed with ${missing.length} missing table(s).\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\u274C Verification error:", err);
  process.exit(1);
});
