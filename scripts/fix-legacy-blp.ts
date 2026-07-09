import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas", { disposeExternalPool: true }) });

async function main() {
  // Check if the 9 legacy bookings even have passengers and are active
  const legacy = await prisma.$queryRawUnsafe<Array<{booking_id:number; ref:string; status:string; pax:number; legs:number; blp:number}>>(
    `SELECT b.id AS booking_id, b.booking_reference AS ref, b.status,
            (SELECT COUNT(*) FROM booking_passengers WHERE booking_id = b.id) AS pax,
            (SELECT COUNT(*) FROM booking_legs WHERE booking_id = b.id) AS legs,
            (SELECT COUNT(*) FROM booking_leg_passengers blp JOIN booking_legs bl ON bl.id = blp.booking_leg_id WHERE bl.booking_id = b.id) AS blp
     FROM bookings b
     WHERE b.id >= 50169 AND b.id <= 51004
       AND (SELECT COUNT(*) FROM booking_legs WHERE booking_id = b.id) > 1
     ORDER BY b.id`
  );
  
  console.log("Legacy multi-leg bookings (missing junction records):");
  for (const b of legacy) {
    console.log(`  ${b.ref} (id=${b.booking_id}): status=${b.status}, ${b.pax} pax, ${b.legs} legs, ${b.blp} blp rows`);
    
    if (b.pax > 0 && b.blp === 0 && b.status !== 'cancelled') {
      console.log(`    → Creating ${b.pax * b.legs} junction records...`);
      await prisma.$executeRawUnsafe(
        `INSERT INTO booking_leg_passengers (booking_leg_id, booking_passenger_id, clothed_weight_kg, baggage_weight_kg)
         SELECT bl.id, bp.id, COALESCE(bp.clothed_body_weight_kg, 70), 0
         FROM booking_legs bl
         CROSS JOIN booking_passengers bp
         LEFT JOIN booking_leg_passengers blp ON blp.booking_leg_id = bl.id AND blp.booking_passenger_id = bp.id
         WHERE bl.booking_id = $1 AND bp.booking_id = $1 AND blp.id IS NULL
         ON CONFLICT (booking_leg_id, booking_passenger_id) DO NOTHING`,
        b.booking_id
      );
    }
  }
  
  // Verify after fix
  const after = await prisma.$queryRawUnsafe<Array<{blp:number}>>(
    `SELECT COUNT(*)::int AS blp FROM booking_leg_passengers blp 
     JOIN booking_legs bl ON bl.id = blp.booking_leg_id 
     WHERE bl.booking_id >= 50169 AND bl.booking_id <= 51004`
  );
  console.log(`\nAfter fix: ${after[0].blp} junction records for these bookings`);
  
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
