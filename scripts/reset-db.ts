/**
 * Database reset script — drops public schema, recreates it, and applies
 * the consolidated bootstrap migration for a clean-slate development environment.
 *
 * Usage: node --env-file-if-exists=.env --import tsx scripts/reset-db.ts
 *    or: npm run db:reset
 */

import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOOTSTRAP_FILE = path.resolve(__dirname, "../migrations/consolidated/000-bootstrap-consolidated.sql");

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL environment variable is required.");
    process.exit(1);
  }
  return url;
}

async function main() {
  const databaseUrl = getDatabaseUrl();
  const pool = new pg.Pool({ connectionString: databaseUrl });

  try {
    const sql = fs.readFileSync(BOOTSTRAP_FILE, "utf-8");
    console.log(`Applying bootstrap migration (${(sql.length / 1024).toFixed(0)} KB)...`);
    await pool.query(sql);
    console.log("  Done — schema, triggers, and seeds applied successfully.");
  } catch (err) {
    console.error("Reset failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
