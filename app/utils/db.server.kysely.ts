/**
 * Kysely database singleton.
 *
 * Phase B of the Kysely migration — coexists alongside the Prisma-based
 * `db.server.ts` during the phased repository migration. When Phase E
 * completes, this file replaces `db.server.ts` entirely and becomes the
 * canonical `db` export.
 *
 * Kysely is stateless — the underlying `pg.Pool` handles connection reuse.
 * No `globalThis` singleton cache is needed.
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
  max: 10, // match the adapter-pg default; tune for Render's connection limit
});

export const kdb = new Kysely<DB>({
  dialect: new PostgresDialect({ pool }),
});
