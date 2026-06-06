/**
 * Seed reference data (aerodromes, aircraft, fare routes, organizations)
 * needed by the booking seed script.
 *
 * Usage:
 *   node --env-file .env --import tsx scripts/seed-reference-data.ts
 */
import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL required");

const pool = new Pool({ connectionString: DATABASE_URL });

async function main() {
  console.log("🌱 Seeding reference data...\n");

  // ── 1. Aerodromes ────────────────────────────────────────────────────────
  const aerodromes = [
    { code: "PSY", name: "Stanley Airport (Port Stanley)", city: "Stanley", rw: 1200, tz: "Atlantic/Stanley" },
    { code: "MPA", name: "Mpa Airport", city: "Mpa", rw: 900, tz: "Atlantic/Stanley" },
    { code: "SHR", name: "Shirley Airport", city: "Shirley", rw: 800, tz: "Atlantic/Stanley" },
    { code: "PPS", name: "Pebble Island Settlement", city: "Pebble Island", rw: 750, tz: "Atlantic/Stanley" },
    { code: "SAU", name: "Saunders Island Settlement", city: "Saunders Island", rw: 700, tz: "Atlantic/Stanley" },
    { code: "ALB", name: "Albemarle", city: "Albemarle", rw: 580, tz: "Atlantic/Stanley" },
    { code: "BVI", name: "Beaver Island", city: "Beaver Island", rw: 325, tz: "Atlantic/Stanley" },
    { code: "CCI", name: "Carcass Island", city: "Carcass Island", rw: 600, tz: "Atlantic/Stanley" },
  ];

  for (const a of aerodromes) {
    await pool.query(
      `INSERT INTO aerodromes (code, name, city, runway_length, timezone, is_active, fuel_available, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, false, NOW(), NOW())
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, city = EXCLUDED.city`,
      [a.code, a.name, a.city, a.rw, a.tz]
    );
  }
  console.log(`  ✓ ${aerodromes.length} aerodromes`);

  // ── 2. Aircraft ──────────────────────────────────────────────────────────
  await pool.query(
    `INSERT INTO aircraft (registration, type, manufacturer, model, seat_count, empty_weight_kg, max_takeoff_weight_kg, max_payload_kg, fuel_capacity_kg, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, NOW(), NOW())
     ON CONFLICT (registration) DO UPDATE SET type = EXCLUDED.type`,
    ["VP-FBZ", "BN-2 Islander", "Britten-Norman", "BN-2B-26", 9, 1870, 2994, 1124, 380]
  );
  console.log("  ✓ 1 aircraft");

  // ── 3. Fare routes ──────────────────────────────────────────────────────
  const fareRoutes = [
    { origin: "PSY", dest: "MPA", fare: 85.00 },
    { origin: "PSY", dest: "SHR", fare: 75.00 },
    { origin: "PSY", dest: "PPS", fare: 95.00 },
    { origin: "PSY", dest: "SAU", fare: 105.00 },
    { origin: "MPA", dest: "SHR", fare: 45.00 },
    { origin: "MPA", dest: "PPS", fare: 55.00 },
    { origin: "SHR", dest: "PPS", fare: 40.00 },
    { origin: "SHR", dest: "SAU", fare: 50.00 },
  ];

  for (const fr of fareRoutes) {
    // Check if route already exists
    const existing = await pool.query(
      "SELECT id FROM fare_routes WHERE origin_code = $1 AND destination_code = $2",
      [fr.origin, fr.dest]
    );
    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO fare_routes (origin_code, destination_code, base_fare, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, true, NOW(), NOW())`,
        [fr.origin, fr.dest, fr.fare]
      );
    }
  }
  console.log(`  ✓ ${fareRoutes.length} fare routes`);

  // ── 4. Organizations ─────────────────────────────────────────────────────
  const existingOrg = await pool.query(
    "SELECT id FROM organizations WHERE name = $1",
    ["FIGAS Government Account"]
  );
  if (existingOrg.rows.length === 0) {
    await pool.query(
      `INSERT INTO organizations (name, credit_limit_gbp, is_active, created_at, updated_at)
       VALUES ($1, $2, true, NOW(), NOW())`,
      ["FIGAS Government Account", 50000.00]
    );
  }
  console.log("  ✓ 1 organization");

  console.log("\n✅ Reference data seeded successfully!");
  await pool.end();
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
