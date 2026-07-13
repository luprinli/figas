/**
 * Database singleton — Kysely type-safe query builder over PostgreSQL.
 *
 * The PrismaClient runtime has been removed (Phase E of the Kysely migration).
 * All queries now use the Kysely fluent API or `sql<T>` tagged templates,
 * compile-time checked against the generated `Database` type from
 * `schema.prisma`.
 *
 * Prisma CLI remains for schema management:
 *   prisma db push        — provision schema
 *   prisma validate       — lint schema
 *   prisma generate       — generate Kysely DB types (via scripts/generate-kysely-types.ts)
 */

import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { DB } from "../../generated/kysely/database";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("FATAL: DATABASE_URL environment variable is required.");
}

const pool = new Pool({
  connectionString: url,
  max: 10,
});

pool.on("error", (err) => {
  console.error("[db] Unexpected pool error:", err);
});

// Force UTC to avoid "time zone not recognized" errors from PostgreSQL
pool.on("connect", async (client) => {
  await client.query("SET timezone = 'UTC'");
});

export const db = new Kysely<DB>({
  dialect: new PostgresDialect({ pool }),
});

export const kdb = db;
