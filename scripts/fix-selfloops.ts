/** Fix self-loop bookings (origin = destination) */
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!, { disposeExternalPool: true }) });

const AERODROMES = ["MPA","BVI","CCI","CHR","DGS","DWN","FXB","FBE","PGR","HLC","LYI","NWI","NHA","PBI","PHD","PHP","PSC","PST","RYC","SDI","SLI","SHB","SPI","SPP","WDI","WPI","GEI","ALB","BKI"];

async function main() {
  const loops = await p.$queryRawUnsafe<Array<{id:number;orig:string}>>(
    `SELECT id, origin_code AS orig FROM booking_legs WHERE origin_code = destination_code AND status NOT IN ('cancelled')`
  );
  console.log(`Self-loop bookings: ${loops.length}`);

  let fixed = 0;
  for (const l of loops) {
    let newDest: string;
    do { newDest = AERODROMES[Math.floor(Math.random() * AERODROMES.length)]; }
    while (newDest === l.orig);
    await p.$executeRawUnsafe(
      `UPDATE booking_legs SET destination_code = $1 WHERE id = $2`, newDest, l.id
    );
    fixed++;
    console.log(`  ${l.orig} → ${newDest}`);
  }
  console.log(`Fixed: ${fixed}`);

  // Verify
  const remaining = await p.$queryRawUnsafe<Array<{cnt:number}>>(
    "SELECT COUNT(*)::int AS cnt FROM booking_legs WHERE origin_code = destination_code AND status NOT IN ('cancelled')"
  );
  console.log(`Remaining: ${remaining[0].cnt}`);

  await p.$disconnect();
}
main().catch(err => { console.error(err); process.exit(1); });
