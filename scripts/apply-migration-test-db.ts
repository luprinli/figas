import { Pool } from "pg";

const TEST_DATABASE_URL =
  "postgresql://artisan:Murugami%402019@localhost:5432/figas_test";

async function main() {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  const client = await pool.connect();
  try {
    // Check if column exists
    const check = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'booking_leg_passengers' AND column_name = 'flight_leg_id'`
    );
    console.log("Column exists?", check.rows.length > 0);

    if (check.rows.length === 0) {
      // Add the column
      await client.query(
        "ALTER TABLE booking_leg_passengers ADD COLUMN flight_leg_id INTEGER REFERENCES flight_legs(id) ON DELETE SET NULL"
      );
      console.log("Column flight_leg_id added successfully");
      await client.query(
        "CREATE INDEX idx_booking_leg_passengers_flight_leg_id ON booking_leg_passengers(flight_leg_id)"
      );
      console.log("Index created successfully");
    } else {
      console.log("Column already exists, skipping");
    }
  } catch (err) {
    console.error("Error:", (err as Error).message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
