import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas", { disposeExternalPool: true }) });

async function main() {
  const missing = await prisma.$queryRawUnsafe<Array<{bid:number; ref:string; pax:number; legs:number; blp:number}>>(
    `SELECT b.id AS bid, b.booking_reference AS ref,
            (SELECT COUNT(*) FROM booking_passengers WHERE booking_id = b.id)::int AS pax,
            (SELECT COUNT(*) FROM booking_legs WHERE booking_id = b.id)::int AS legs,
            (SELECT COUNT(*) FROM booking_leg_passengers blp JOIN booking_legs bl ON bl.id = blp.booking_leg_id WHERE bl.booking_id = b.id)::int AS blp
     FROM bookings b
     WHERE (SELECT COUNT(*) FROM booking_leg_passengers blp JOIN booking_legs bl ON bl.id = blp.booking_leg_id WHERE bl.booking_id = b.id) <
           (SELECT COUNT(*) FROM booking_passengers WHERE booking_id = b.id) * (SELECT COUNT(*) FROM booking_legs WHERE booking_id = b.id)
     ORDER BY b.id
     LIMIT 20`
  );

  console.log(`Bookings with missing junction records: ${missing.length}`);
  for (const b of missing) {
    console.log(`  bid=${b.bid} ${b.ref}: ${b.legs} legs × ${b.pax} pax = ${b.blp} blp (expected ${b.pax * b.legs})`);
    if (b.pax > 0) {
      const result = await prisma.$executeRawUnsafe(
        `INSERT INTO booking_leg_passengers (booking_leg_id, booking_passenger_id, clothed_weight_kg, baggage_weight_kg)
         SELECT bl.id, bp.id, COALESCE(bp.clothed_body_weight_kg, 70), 0
         FROM booking_legs bl
         CROSS JOIN booking_passengers bp
         LEFT JOIN booking_leg_passengers blp2 ON blp2.booking_leg_id = bl.id AND blp2.booking_passenger_id = bp.id
         WHERE bl.booking_id = $1 AND bp.booking_id = $1 AND blp2.id IS NULL
         ON CONFLICT (booking_leg_id, booking_passenger_id) DO NOTHING`,
        b.bid
      );
      console.log(`    → Inserted ${result} rows`);
    }
  }

  const total = await prisma.$queryRawUnsafe<Array<{cnt:number}>>(
    "SELECT COUNT(*)::int AS cnt FROM booking_leg_passengers"
  );
  console.log(`\nTotal booking_leg_passengers after fix: ${total[0].cnt}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
