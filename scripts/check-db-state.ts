/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "../app/utils/db.server";
import { sql } from "kysely";

async function main() {
  console.log("Checking database state...\n");

  // Check if _migrations table exists
  const migrationTable = await sql`
    SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '_migrations') as exists
  `.execute(db);
  console.log("_migrations table exists:", (migrationTable.rows[0] as any).exists);

  if ((migrationTable.rows[0] as any).exists) {
    const applied = await sql`SELECT filename FROM _migrations ORDER BY id`.execute(db);
    console.log("Applied migrations:", applied.rows.map((r: any) => r.filename).join(", ") || "(none)");
  }

  // List all tables
  const tables = await sql`
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name
  `.execute(db);
  console.log("\nTables in database (" + tables.rows.length + "):");
  console.log(tables.rows.map((r: any) => "  " + r.table_name).join("\n"));

  // Check schedules table
  const schedulesExist = tables.rows.some((r: any) => r.table_name === "schedules");
  if (schedulesExist) {
    const schedCount = await sql`SELECT COUNT(*) as cnt FROM schedules`.execute(db);
    console.log("\nSchedules count:", (schedCount.rows[0] as any).cnt);
    
    const checkConstraint = await sql`
      SELECT pg_get_constraintdef(oid) as def 
      FROM pg_constraint 
      WHERE conrelid = 'schedules'::regclass 
      AND conname = 'schedules_status_check'
    `.execute(db);
    if (checkConstraint.rows.length > 0) {
      console.log("Status CHECK constraint:", (checkConstraint.rows[0] as any).def);
    } else {
      console.log("Status CHECK constraint: NOT FOUND");
    }
  }

  // Check aircraft table for arm positions
  const aircraftExists = tables.rows.some((r: any) => r.table_name === "aircraft");
  if (aircraftExists) {
    const columns = await sql`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'aircraft' 
      ORDER BY ordinal_position
    `.execute(db);
    const hasArmColumns = columns.rows.some((r: any) => r.column_name === "empty_arm_m");
    console.log("\nAircraft arm position columns:", hasArmColumns ? "PRESENT" : "MISSING");
  }

  // Check booking_leg_passengers unique constraint
  const blpExists = tables.rows.some((r: any) => r.table_name === "booking_leg_passengers");
  if (blpExists) {
    const constraints = await sql`
      SELECT conname FROM pg_constraint 
      WHERE conrelid = 'booking_leg_passengers'::regclass
    `.execute(db);
    console.log("\nbooking_leg_passengers constraints:", constraints.rows.map((r: any) => r.conname).join(", "));
  }

  // Check flights created_by column
  const flightsExist = tables.rows.some((r: any) => r.table_name === "flights");
  if (flightsExist) {
    const columns = await sql`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'flights' 
      ORDER BY ordinal_position
    `.execute(db);
    console.log("\nFlights columns:", columns.rows.map((r: any) => r.column_name).join(", "));
  }
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
