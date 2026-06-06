import pg from "pg";

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! });

  try {
    // Check flight_manifests table columns
    const manifestsResult = await pool.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'flight_manifests' ORDER BY ordinal_position"
    );
    console.log("=== flight_manifests columns ===");
    for (const c of manifestsResult.rows) {
      console.log(`  ${c.column_name} (${c.data_type})`);
    }

    // Check schedules table columns
    const schedulesResult = await pool.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'schedules' ORDER BY ordinal_position"
    );
    console.log("\n=== schedules columns ===");
    for (const c of schedulesResult.rows) {
      console.log(`  ${c.column_name} (${c.data_type})`);
    }

    // Check flights table columns
    const flightsResult = await pool.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'flights' ORDER BY ordinal_position"
    );
    console.log("\n=== flights columns ===");
    for (const c of flightsResult.rows) {
      console.log(`  ${c.column_name} (${c.data_type})`);
    }
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
