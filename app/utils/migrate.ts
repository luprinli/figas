import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "./db.server";
import { sql } from "kysely";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONSOLIDATED_DIR = path.resolve(__dirname, "../../migrations/consolidated");
const MIGRATIONS_TABLE = "_migrations";

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

async function applyMigration(filename: string, migrationSql: string): Promise<void> {
  try {
    await db.transaction().execute(async (tx) => {
      await sql`${sql.raw(migrationSql)}`.execute(tx);
      await sql`
        INSERT INTO ${sql.raw(MIGRATIONS_TABLE)} (filename) VALUES (${filename})
      `.execute(tx);
    });
    console.log(`  \u2714 ${filename}`);
  } catch (err) {
    console.error(`  \u2718 ${filename} \u2013 FAILED`);
    throw err;
  }
}

async function main(): Promise<void> {
  console.log("\n\uD83D\uDCE6 FIGAS Migration Runner\n");

  if (!fs.existsSync(CONSOLIDATED_DIR)) {
    console.log(`Migrations directory not found: ${CONSOLIDATED_DIR}\n`);
    return;
  }

  await ensureMigrationsTable();

  const files = fs.readdirSync(CONSOLIDATED_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("No migration files found.\n");
    return;
  }

  const applied = await getAppliedMigrations();
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log("All migrations are already applied.\n");
    return;
  }

  console.log(`Found ${pending.length} pending migration(s):\n`);

  for (const file of pending) {
    const filePath = path.join(CONSOLIDATED_DIR, file);
    const migrationSql = fs.readFileSync(filePath, "utf-8");
    await applyMigration(file, migrationSql);
  }

  console.log("\n\u2705 All pending migrations applied successfully.\n");
}

main().catch((err) => {
  console.error("\n\u274C Migration failed:", err);
  process.exit(1);
});
