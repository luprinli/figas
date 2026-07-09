/**
 * fix-aerodrome-consolidation.ts
 *
 * Data-integrity cleanup for the Stanley aerodrome code split.
 *
 * The reference CSV (data/aerodromes.csv) lists Stanley as "PSY", but the
 * distance, heading and fare matrices — and the scheduling depot — all use
 * "STY". Older seeds inserted BOTH, leaving an orphan "PSY" Stanley record
 * with no routing data ("strange aerodrome that will be unmatched").
 *
 * This script (idempotent, non-destructive):
 *   1. Ensures a canonical STY aerodrome exists.
 *   2. Remaps any operational references from PSY → STY
 *      (booking_legs, flight_legs, flights: both *_code and *_aerodrome_id).
 *   3. Deactivates the orphan PSY record (is_active = false) so it disappears
 *      from active-aerodrome dropdowns. (Deactivate, not delete — avoids FK risk.)
 *   4. Reports any bookings/flight legs whose aerodrome codes are unknown or
 *      lack distance coverage (unroutable).
 *
 * Usage (Render Shell or locally):
 *   node --env-file-if-exists=.env --import tsx scripts/fix-aerodrome-consolidation.ts
 */

import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is required.");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(DATABASE_URL, { disposeExternalPool: true }),
});

const CANONICAL = "STY";
const LEGACY = "PSY";

async function main() {
  console.log("🔧 Aerodrome consolidation (PSY → STY)\n");

  // 1. Look up the two Stanley records.
  const rows = await prisma.$queryRawUnsafe<Array<{ id: number; code: string; is_active: boolean }>>(
    `SELECT id, code, is_active FROM aerodromes WHERE code IN ($1, $2)`,
    CANONICAL,
    LEGACY
  );
  const sty = rows.find((r) => r.code === CANONICAL);
  const psy = rows.find((r) => r.code === LEGACY);

  if (!psy) {
    console.log("  ✓ No legacy 'PSY' record found — nothing to consolidate.");
  } else {
    // Ensure STY exists (copy PSY's geo/limits if STY is missing).
    if (!sty) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO aerodromes (code, name, city, latitude, longitude, runway_length,
             mlw_limit_kg, mtow_limit_kg, is_active, timezone, created_at, updated_at)
         SELECT 'STY', 'Stanley Airport', 'Stanley', latitude, longitude, runway_length,
             mlw_limit_kg, mtow_limit_kg, true, 'Atlantic/Stanley', NOW(), NOW()
         FROM aerodromes WHERE code = 'PSY'
         ON CONFLICT (code) DO NOTHING`
      );
      console.log("  ✓ Created canonical STY from PSY geo/limits.");
    }
    const styId = (sty?.id ?? (await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      `SELECT id FROM aerodromes WHERE code = 'STY'`
    ))[0]?.id);

    // 2. Remap operational references PSY → STY.
    const codeRemaps: Array<[string, string]> = [
      ["booking_legs", "origin_code"],
      ["booking_legs", "destination_code"],
      ["flight_legs", "origin_code"],
      ["flight_legs", "destination_code"],
      ["flights", "origin_code"],
      ["flights", "destination_code"],
      ["booking_leg_passengers", "origin_code"],
      ["booking_leg_passengers", "destination_code"],
    ];
    for (const [table, col] of codeRemaps) {
      try {
        const res = await prisma.$executeRawUnsafe(
          `UPDATE ${table} SET ${col} = $1 WHERE ${col} = $2`,
          CANONICAL,
          LEGACY
        );
        if (res > 0) console.log(`  ✓ ${table}.${col}: remapped ${res} row(s) PSY → STY`);
      } catch (err) {
        console.log(`  ↪ skip ${table}.${col} (${(err as Error).message.slice(0, 60)})`);
      }
    }
    // id-based FK columns on flights.
    if (styId) {
      for (const col of ["origin_aerodrome_id", "destination_aerodrome_id"]) {
        try {
          const res = await prisma.$executeRawUnsafe(
            `UPDATE flights SET ${col} = $1 WHERE ${col} = $2`,
            styId,
            psy.id
          );
          if (res > 0) console.log(`  ✓ flights.${col}: remapped ${res} row(s) → STY id ${styId}`);
        } catch (err) {
          console.log(`  ↪ skip flights.${col} (${(err as Error).message.slice(0, 60)})`);
        }
      }
    }

    // 3. Deactivate the orphan PSY (non-destructive).
    await prisma.$executeRawUnsafe(
      `UPDATE aerodromes SET is_active = false, updated_at = NOW() WHERE code = 'PSY'`
    );
    console.log("  ✓ Deactivated orphan PSY record (is_active = false).");
  }

  // 4. Report unroutable / unmatched aerodrome codes referenced by bookings.
  console.log("\n── Integrity report ──");

  const activeCodes = (await prisma.$queryRawUnsafe<Array<{ code: string }>>(
    `SELECT code FROM aerodromes WHERE is_active = true`
  )).map((r) => r.code);
  const codeSet = new Set(activeCodes);

  const legCodes = await prisma.$queryRawUnsafe<Array<{ code: string; n: number }>>(
    `SELECT code, COUNT(*)::int AS n FROM (
        SELECT origin_code AS code FROM booking_legs
        UNION ALL SELECT destination_code FROM booking_legs
     ) t GROUP BY code ORDER BY code`
  );
  const unknown = legCodes.filter((r) => !codeSet.has(r.code));
  if (unknown.length === 0) {
    console.log("  ✓ All booking_leg aerodrome codes exist as active aerodromes.");
  } else {
    console.log("  ⚠️  booking_leg codes NOT matching an active aerodrome:");
    for (const u of unknown) console.log(`     ${u.code}: ${u.n} references`);
  }

  await prisma.$disconnect();
  console.log("\n✅ Done.");
}

main().catch(async (err) => {
  console.error("❌ Failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
