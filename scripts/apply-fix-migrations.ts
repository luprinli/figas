/**
 * Apply fix migrations from the migrations/ root directory.
 * These are standalone SQL files that add missing columns/constraints
 * to an existing database that was created from the archive migrations.
 *
 * Usage: node --env-file .env --import tsx scripts/apply-fix-migrations.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../app/utils/db.server";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIX_MIGRATIONS_DIR = path.resolve(__dirname, "../migrations");

// Fix migrations to apply, in dependency order
const FIX_FILES = [
  "fix-flights-created-by.sql",
  "fix-schema-mismatches.sql",
  "fix-schedule-status-enum.sql",
  "fix-booking-leg-passengers-unique.sql",
  "fix-aircraft-arm-positions.sql",
  "fix-flight-leg-status-enum.sql",
  "fix-aircraft-id-nullable.sql",
  "fix-add-flight-leg-id.sql",
];

async function main() {
  console.log("🔧 Applying fix migrations...\n");

  for (const file of FIX_FILES) {
    const filePath = path.join(FIX_MIGRATIONS_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.log(`  ⚠ ${file} not found, skipping`);
      continue;
    }

    const sql = fs.readFileSync(filePath, "utf-8");
    console.log(`  Applying ${file}...`);

    try {
      // Split by semicolons and execute each statement separately
      // to handle errors per-statement
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith("--"));

      for (const stmt of statements) {
        try {
          await db.$executeRawUnsafe(stmt + ";");
        } catch (err: unknown) {
      // Ignore "already exists" errors for safe operations
      const msg = (err as { message?: string })?.message || "";
          if (
            msg.includes("already exists") ||
            msg.includes("duplicate key") ||
            msg.includes("already has a default")
          ) {
            console.log(`    ↪ (already applied, skipping)`);
          } else {
            throw err;
          }
        }
      }
      console.log(`  ✔ ${file}`);
    } catch (err: unknown) {
      console.error(`  ✘ ${file} – FAILED: ${(err as Error).message}`);
      // Don't exit — try the next one
    }
  }

  console.log("\n✅ Fix migrations applied.\n");
  await db.$disconnect();
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err);
  process.exit(1);
});
