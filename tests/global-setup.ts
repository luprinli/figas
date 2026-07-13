import { config } from "dotenv";

export async function setup() {
  config();

  const dbUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
  if (!dbUrl || dbUrl.includes("mock")) return;
  process.env.DATABASE_URL = dbUrl;

  const { db } = await import("~/utils/db.server");
  const { sql } = await import("kysely");

  await sql`
    INSERT INTO aerodromes (code, name, city, runway_length, timezone, is_active, fuel_available)
    VALUES
      ('STY', 'Stanley Airport (Port Stanley)', 'Stanley', 1200.0, 'Atlantic/Stanley', true, true),
      ('MPA', 'Mpa Airport', 'Mpa', 900.0, 'Atlantic/Stanley', true, false),
      ('SHR', 'Shirley Airport', 'Shirley', 800.0, 'Atlantic/Stanley', true, false),
      ('PPS', 'Pebble Island Settlement', 'Pebble Island', 750.0, 'Atlantic/Stanley', true, false),
      ('SAU', 'Saunders Island Settlement', 'Saunders Island', 700.0, 'Atlantic/Stanley', true, false)
    ON CONFLICT (code) DO NOTHING
  `.execute(db);
}
