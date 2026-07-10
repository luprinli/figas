import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "./db.server";
import { sql } from "kysely";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Directory where migration SQL files are stored.
 * Points to consolidated migrations by default.
 * Falls back to original migrations directory if consolidated doesn't exist.
 */
const MIGRATIONS_DIR = path.resolve(__dirname, "../../migrations/consolidated");

/** Name of the tracking table. */
const MIGRATIONS_TABLE = "_migrations";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureMigrationsTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS ${sql.raw(MIGRATIONS_TABLE)} (
      id          SERIAL PRIMARY KEY,
      filename    VARCHAR(255) NOT NULL UNIQUE,
      applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `.execute(db);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await sql`
    SELECT filename FROM ${sql.raw(MIGRATIONS_TABLE)} ORDER BY id
  `.execute(db);
  return new Set(result.rows.map((r: unknown) => (r as { filename: string }).filename));
}

async function applyMigration(
  filename: string,
  migrationSql: string
): Promise<void> {
  try {
    await db.transaction().execute(async (tx) => {
      await sql`${sql.raw(migrationSql)}`.execute(tx);
      await sql`
        INSERT INTO ${sql.raw(MIGRATIONS_TABLE)} (filename) VALUES (${filename})
      `.execute(tx);
    });
    console.log(`  ✔ ${filename}`);
  } catch (err) {
    console.error(`  ✘ ${filename} – FAILED`);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("\n📦 FIGAS Migration Runner\n");

  // Ensure the migrations directory exists
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log(`Migrations directory not found: ${MIGRATIONS_DIR}`);
    console.log("Nothing to migrate.\n");
    return;
  }

  // Read and sort migration files (alphabetical = chronological)
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("No migration files found.\n");
    return;
  }

  // Ensure the tracking table exists
  await ensureMigrationsTable();

  // Determine which migrations have already been applied
  const applied = await getAppliedMigrations();
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log("All migrations are already applied. Nothing to do.\n");
    return;
  }

  console.log(`Found ${pending.length} pending migration(s):\n`);

  for (const file of pending) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const migrationSql = fs.readFileSync(filePath, "utf-8");
    await applyMigration(file, migrationSql);
  }

  console.log("\n✅ All pending migrations applied successfully.\n");
}

main().catch((err) => {
  console.error("\n❌ Migration failed:", err);
  process.exit(1);
});
