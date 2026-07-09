/**
 * Restore realistic booking origins.
 * 
 * Business Rule: Bookings can originate from any aerodrome — passengers book
 * from where they are. Flight paths MUST always start and end at STY — the
 * aircraft departs from and returns to Stanley. These are two separate concerns.
 *
 * This script restores the booking origins that were incorrectly migrated to
 * STY by a previous fix. STY remains the most common origin (~75%) but other
 * aerodromes get proportional distribution.
 */
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!, { disposeExternalPool: true }) });

const AERODROMES = ["MPA","BVI","CCI","CHR","DGS","DWN","FXB","FBE","PGR","HLC","LYI","NWI","NHA","PBI","PHD","PHP","PSC","PST","RYC","SDI","SLI","SHB","SPI","SPP","WDI","WPI","GEI","ALB","BKI"];

async function main() {
  console.log("=== Restore Realistic Booking Origins ===\n");

  // Get all booking legs that were set to STY (excluding those assigned to flights)
  const bookingLegs = await p.$queryRawUnsafe<Array<{id:number;dest:string}>>(
    `SELECT bl.id, bl.destination_code AS dest
     FROM booking_legs bl JOIN bookings b ON b.id = bl.booking_id
     WHERE bl.origin_code = 'STY'
       AND bl.status NOT IN ('cancelled', 'completed')
       AND b.status NOT IN ('cancelled', 'completed')
     ORDER BY bl.id`
  );
  console.log(`Booking legs to restore: ${bookingLegs.length}`);

  // Distribute origins: 75% STY, 25% other aerodromes
  let styRemaining = Math.round(bookingLegs.length * 0.75);
  let updated = 0;

  for (const leg of bookingLegs) {
    const dest = leg.dest;
    if (styRemaining > 0) {
      styRemaining--; // Keep as STY
      continue;
    }
    // Pick a random aerodrome (not STY and not same as destination)
    let newOrigin: string;
    do { newOrigin = AERODROMES[Math.floor(Math.random() * AERODROMES.length)]; }
    while (newOrigin === dest || newOrigin === "STY");
    
    await p.$executeRawUnsafe(
      `UPDATE booking_legs SET origin_code = $1, updated_at = NOW() WHERE id = $2`,
      newOrigin, leg.id
    );
    updated++;
  }

  console.log(`Kept STY: ${styRemaining} of ${Math.round(bookingLegs.length * 0.75)}`);
  console.log(`Changed to non-STY: ${updated}`);

  // Summary
  const dist = await p.$queryRawUnsafe<Array<{orig:string;cnt:number}>>(
    `SELECT origin_code AS orig, COUNT(*)::int AS cnt
     FROM booking_legs WHERE status NOT IN ('cancelled', 'completed')
     GROUP BY origin_code ORDER BY cnt DESC LIMIT 10`
  );
  console.log("\nOrigin distribution:");
  for (const r of dist) console.log(`  ${r.orig}: ${r.cnt}`);

  await p.$disconnect();
  console.log("\nDone. Flight paths always start/end at STY via createFlightLegs().");
}
main().catch(err => { console.error(err); process.exit(1); });
