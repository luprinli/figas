import { config } from "dotenv";

/**
 * Vitest global setup (referenced by vitest.config.ts).
 *
 * Loads .env and redirects DATABASE_URL to TEST_DATABASE_URL when present,
 * mirroring tests/unit/setup.ts so worker processes and the main process
 * agree on the database target.
 */
export default async function globalSetup(): Promise<void> {
  config();
  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  }
}
