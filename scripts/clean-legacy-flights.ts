/**
 * Clean up legacy flights and schedules from old seed that have:
 * - Non-standard flight numbers (not FIG-YYYYMMDD-NNN)
 * - Null origin_code or destination_code
 * - Same origin_aerodrome_id as destination_aerodrome_id
 * - Schedules for future dates with "draft" or "building" status
 */
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!, { disposeExternalPool: true }) });

async function main() {
  console.log("=== Legacy Flight Cleanup ===\n");

  // Find bad flights
  const badFlights = await p.$queryRawUnsafe<Array<{id:number;fn:string;orig:string;dest:string;oa:number;da:number}>>(
    `SELECT id, flight_number as fn, COALESCE(f.origin_code, '') as orig, COALESCE(f.destination_code, '') as dest,
            origin_aerodrome_id as oa, destination_aerodrome_id as da
     FROM flights f
WHERE flight_number !~ '^FIG-[0-9]{8}-[0-9]{3}$'`
   );
  console.log(`Bad flights found: ${badFlights.length}`);
  for (const f of badFlights.slice(0, 15)) {
    console.log(`  ${f.fn} | ${f.orig} -> ${f.dest} | aero: ${f.oa} -> ${f.da}`);
  }

  if (badFlights.length > 0) {
    // Build IN clause since PrismaPg doesn't handle arrays well
    const ids = badFlights.map(f => f.id).join(",");

    await p.$executeRawUnsafe(
      `DELETE FROM weight_balance_snapshots WHERE flight_leg_id IN
       (SELECT id FROM flight_legs WHERE flight_id IN (${ids}))`
    );
    await p.$executeRawUnsafe(
      `UPDATE booking_legs SET flight_id = NULL, status = 'confirmed', updated_at = NOW()
       WHERE flight_id IN (${ids})`
    );
    await p.$executeRawUnsafe(
      `DELETE FROM flight_legs WHERE flight_id IN (${ids})`
    );
    await p.$executeRawUnsafe(
      `DELETE FROM flights WHERE id IN (${ids})`
    );

    // Clean orphan schedules (no flights)
    await p.$executeRawUnsafe(
      `DELETE FROM schedules WHERE id NOT IN (SELECT DISTINCT schedule_id FROM flights WHERE schedule_id IS NOT NULL)`
    );

    console.log(`\nCleaned ${badFlights.length} bad flights + orphan schedules`);
  }

  // Delete future schedules (>= 2026-06-06) that have status draft/building
  const futureScheds = await p.$queryRawUnsafe<Array<{cnt:number}>>(
    `SELECT COUNT(*)::int as cnt FROM schedules
     WHERE schedule_date >= '2026-06-06' AND status IN ('draft', 'building')`
  );
  if (futureScheds[0].cnt > 0) {
    await p.$executeRawUnsafe(
      `DELETE FROM weight_balance_snapshots WHERE flight_leg_id IN
       (SELECT fl.id FROM flight_legs fl JOIN flights f ON f.id = fl.flight_id
        JOIN schedules s ON s.id = f.schedule_id
        WHERE s.schedule_date >= '2026-06-06' AND s.status IN ('draft', 'building'))`
    );
    await p.$executeRawUnsafe(
      `UPDATE booking_legs SET flight_id = NULL, status = 'confirmed', updated_at = NOW()
       WHERE flight_id IN (SELECT f.id FROM flights f JOIN schedules s ON s.id = f.schedule_id
        WHERE s.schedule_date >= '2026-06-06' AND s.status IN ('draft', 'building'))`
    );
    await p.$executeRawUnsafe(
      `DELETE FROM flight_legs WHERE flight_id IN
       (SELECT f.id FROM flights f JOIN schedules s ON s.id = f.schedule_id
        WHERE s.schedule_date >= '2026-06-06' AND s.status IN ('draft', 'building'))`
    );
    await p.$executeRawUnsafe(
      `DELETE FROM flights WHERE schedule_id IN
       (SELECT id FROM schedules WHERE schedule_date >= '2026-06-06' AND status IN ('draft', 'building'))`
    );
    await p.$executeRawUnsafe(
      `DELETE FROM schedules WHERE schedule_date >= '2026-06-06' AND status IN ('draft', 'building')`
    );
    console.log(`Cleaned ${futureScheds[0].cnt} future draft/building schedules`);
  }

  // Verify
  const remaining = await p.$queryRawUnsafe<Array<{cnt:number}>>(
    `SELECT COUNT(*)::int as cnt FROM flights
     WHERE flight_number !~ '^FIG-[0-9]{8}-[0-9]{3}$'
        OR origin_code IS NULL OR destination_code IS NULL`
  );
  console.log(`\nRemaining bad flights: ${remaining[0].cnt}`);

  const goodFlights = await p.$queryRawUnsafe<Array<{cnt:number}>>(
    `SELECT COUNT(*)::int as cnt FROM flights
     WHERE flight_number ~ '^FIG-[0-9]{8}-[0-9]{3}$'`
  );
  console.log(`Good flights (FIG-YYYYMMDD-NNN): ${goodFlights[0].cnt}`);

  await p.$disconnect();
}
main().catch(err => { console.error(err); process.exit(1); });
