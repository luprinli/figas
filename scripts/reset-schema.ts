import { db } from "../app/utils/db.server";

async function reset() {
  await db.$executeRawUnsafe("DROP SCHEMA public CASCADE");
  await db.$executeRawUnsafe("CREATE SCHEMA public");
  console.log("Schema reset successfully");
  process.exit(0);
}

reset().catch(err => { console.error(err); process.exit(1); });
