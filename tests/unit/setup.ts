/**
 * Global setup for all tests (unit and integration).
 *
 * For unit tests: sets a mock DATABASE_URL so that app/utils/db.server.ts
 * doesn't throw during module import. Individual test files should mock the
 * specific repository/db methods they need.
 *
 * For integration tests: loads .env and uses TEST_DATABASE_URL so tests
 * run against the dedicated test database (figas_test).
 */
import { config } from "dotenv";

// Load .env file if present
config();

// Use TEST_DATABASE_URL for integration tests, fallback to mock for unit tests
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://mock:mock@localhost:5432/figas_test";
}
