import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "FATAL: DATABASE_URL environment variable is required.\n" +
      "Example: postgresql://user:password@localhost:5432/figas"
  );
}

/**
 * PrismaClient singleton with backward-compatible raw SQL helpers.
 *
 * Previously this module exported a `pg.Pool`-based `db` object with a
 * `.query(text, params)` method. As of Phase 4b, the pool has been replaced
 * with a PrismaClient singleton. The `db` export is now the PrismaClient
 * instance itself, augmented with `.query()` and `.queryOne()` shims that
 * delegate to `$queryRawUnsafe` / `$queryRaw` for backward compatibility
 * during the migration from raw SQL to Prisma ORM.
 */

const globalForPrisma = globalThis as unknown as {
  __prisma?: PrismaClient;
};

const adapter = new PrismaPg(url, {
  disposeExternalPool: true,
});

const prisma: PrismaClient =
  globalForPrisma.__prisma ??
  new PrismaClient({
    adapter,
    log: ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__prisma = prisma;
}

// ---------------------------------------------------------------------------
// Raw SQL query result shape (matches pg.Pool query result convention)
// ---------------------------------------------------------------------------

interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
}

/**
 * Execute a raw SQL query via Prisma's $queryRawUnsafe.
 * Returns a result shaped like pg.Pool's query result for backward compatibility.
 */
async function query(
  text: string,
  params?: unknown[]
): Promise<QueryResult> {
  const rows = params
    ? await prisma.$queryRawUnsafe<Record<string, unknown>[]>(text, ...params)
    : await prisma.$queryRawUnsafe<Record<string, unknown>[]>(text);
  return { rows, rowCount: rows.length };
}

/**
 * Execute a raw SQL query and return the first row (or null).
 */
async function queryOne(
  text: string,
  params?: unknown[]
): Promise<Record<string, unknown> | null> {
  const rows = params
    ? await prisma.$queryRawUnsafe<Record<string, unknown>[]>(text, ...params)
    : await prisma.$queryRawUnsafe<Record<string, unknown>[]>(text);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * The augmented db export — a PrismaClient with backward-compatible
 * `.query()` and `.queryOne()` raw SQL helpers.
 */
export const db = prisma as PrismaClient & {
  query(text: string, params?: unknown[]): Promise<QueryResult>;
  queryOne(text: string, params?: unknown[]): Promise<Record<string, unknown> | null>;
};

db.query = query;
db.queryOne = queryOne;
