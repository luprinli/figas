import { config } from "dotenv";

config();

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://mock:mock@localhost:5432/figas_test";
}
