import { db } from "../app/utils/db.server";
import { sql } from "kysely";

async function reset() {
  await sql`DROP SCHEMA public CASCADE`.execute(db);
  await sql`CREATE SCHEMA public`.execute(db);
  console.log("Schema reset successfully");
  process.exit(0);
}

reset().catch(err => { console.error(err); process.exit(1); });
