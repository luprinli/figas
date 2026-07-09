/**
 * Apply the remaining fix migrations that failed due to PL/pgSQL syntax
 * or missing tables.
 */
import { db } from "../app/utils/db.server";

async function main() {
  console.log("🔧 Applying remaining fix migrations...\n");

  // 1. fix-schema-mismatches.sql — only the parts that don't reference schedule_audit
  //    (schedule_audit table doesn't exist in the archive migrations)
  const schemaFixes = [
    // payments status column
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending'`,
    // invoice_items updated_at column
    `ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`,
  ];

  console.log("  Applying schema mismatch fixes...");
  for (const stmt of schemaFixes) {
    try {
      await db.$executeRawUnsafe(stmt);
      console.log(`    ✔ ${stmt.substring(0, 80)}...`);
    } catch (err: unknown) {
      console.log(`    ↪ ${(err as Error).message.substring(0, 80)}`);
    }
  }

  // 2. fix-flight-leg-status-enum.sql — create enum and alter column
  //    Using raw SQL via db.query() which may handle PL/pgSQL better
  console.log("\n  Applying flight leg status enum fix...");
  
  // First check if the enum type already exists
  const enumCheck = await db.query(`
    SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'flight_leg_status') as exists
  `);
  const enumExists = enumCheck.rows[0]?.exists;
  
  if (!enumExists) {
    // Create the enum type using a simpler approach
    try {
      await db.$executeRawUnsafe(`CREATE TYPE flight_leg_status AS ENUM ('scheduled', 'active', 'completed', 'cancelled')`);
      console.log("    ✔ Created flight_leg_status enum type");
    } catch (err: unknown) {
      if ((err as Error).message?.includes("already exists")) {
        console.log("    ↪ Enum type already exists");
      } else {
        console.error(`    ✘ ${(err as Error).message}`);
      }
    }
  } else {
    console.log("    ↪ Enum type already exists");
  }

  // Alter the column
  try {
    // Check if the column exists and its current type
    const colCheck = await db.query(`
      SELECT data_type FROM information_schema.columns 
      WHERE table_name = 'flight_legs' AND column_name = 'status'
    `);
    
    if (colCheck.rows.length > 0) {
      const currentType = colCheck.rows[0].data_type;
      if (currentType !== 'flight_leg_status' && currentType !== 'USER-DEFINED') {
        await db.$executeRawUnsafe(`
          ALTER TABLE flight_legs
            ALTER COLUMN status TYPE flight_leg_status USING status::flight_leg_status,
            ALTER COLUMN status SET DEFAULT 'scheduled'
        `);
        console.log("    ✔ Altered flight_legs.status to use enum type");
      } else {
        console.log("    ↪ Column already uses enum type");
      }
    }
  } catch (err: unknown) {
    console.log(`    ↪ ${(err as Error).message.substring(0, 120)}`);
  }

  // 3. Create schedule_audit table (needed by Prisma schema)
  console.log("\n  Creating schedule_audit table...");
  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS schedule_audit (
        id SERIAL PRIMARY KEY,
        schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
        action VARCHAR(50) NOT NULL,
        changed_by INTEGER NOT NULL REFERENCES users(id),
        changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        old_values JSONB,
        new_values JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    console.log("    ✔ Created schedule_audit table");
    
    // Create indexes
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_schedule_audit_schedule_id ON schedule_audit(schedule_id)`);
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_schedule_audit_changed_by ON schedule_audit(changed_by)`);
    console.log("    ✔ Created schedule_audit indexes");
  } catch (err: unknown) {
    console.log(`    ↪ ${(err as Error).message.substring(0, 120)}`);
  }

  console.log("\n✅ Remaining fix migrations applied.\n");
  await db.$disconnect();
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err);
  process.exit(1);
});
