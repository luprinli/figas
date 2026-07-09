import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas", { disposeExternalPool: true }) });

async function main() {
  // Find ALL bookings with any legs on June 19 that have missing junction records
  const bkgs = await prisma.$queryRawUnsafe<Array<{bid:number; ref:string}>>(
    `SELECT DISTINCT b.id AS bid, b.booking_reference AS ref
     FROM bookings b
     JOIN booking_legs bl ON bl.booking_id = b.id
     WHERE bl.leg_date = '2026-06-19'
     ORDER BY b.id`
  );

  console.log(`June 19 bookings: ${bkgs.length}`);
  let totalCreated = 0;
  for (const b of bkgs) {
    const result = await prisma.$executeRawUnsafe(
      `INSERT INTO booking_leg_passengers (booking_leg_id, booking_passenger_id, clothed_weight_kg, baggage_weight_kg)
       SELECT bl.id, bp.id, COALESCE(bp.clothed_body_weight_kg, 70), 0
       FROM booking_legs bl
       CROSS JOIN booking_passengers bp
       LEFT JOIN booking_leg_passengers blp2 ON blp2.booking_leg_id = bl.id AND blp2.booking_passenger_id = bp.id
       WHERE bl.booking_id = $1 AND bl.leg_date = '2026-06-19' AND bp.booking_id = $1 AND blp2.id IS NULL`,
      b.bid
    );
    if (result > 0) {
      console.log(`  ${b.ref}: +${result} junction records`);
      totalCreated += result;
    }
  }

  console.log(`\nTotal created: ${totalCreated}`);

  // Also fix: reset any flight_leg_id for these bookings so they appear unassigned
  await prisma.$executeRawUnsafe(
    `UPDATE booking_leg_passengers blp
     SET flight_leg_id = NULL
     FROM booking_legs bl
     WHERE bl.id = blp.booking_leg_id AND bl.leg_date = '2026-06-19' AND blp.id > 0`
  );
  console.log("Reset flight_leg_id to NULL for all June 19 passengers");

  // Also clear booking_legs.flight_id
  await prisma.$executeRawUnsafe(
    `UPDATE booking_legs SET flight_id = NULL WHERE leg_date = '2026-06-19'`
  );
  console.log("Reset booking_legs.flight_id to NULL for all June 19 legs");

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
