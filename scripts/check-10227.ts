import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!, { disposeExternalPool: true }) });
async function main() {
  // Check FIG-10227 passengers
  const pax = await p.$queryRawUnsafe<Array<Record<string,unknown>>>(
    `SELECT bp.id, bp.first_name, bp.last_name, bp.clothed_body_weight_kg,
            blp.baggage_weight_kg
     FROM booking_passengers bp
     JOIN booking_leg_passengers blp ON blp.booking_passenger_id = bp.id
     JOIN booking_legs bl ON bl.id = blp.booking_leg_id
     JOIN bookings b ON b.id = bl.booking_id
     WHERE b.booking_reference = 'FIG-10227'
     ORDER BY bp.id`
  );
  console.log("FIG-10227 passengers:");
  for (const p of pax) console.log(`  ${p.first_name} ${p.last_name} (wt:${p.clothed_body_weight_kg}kg bag:${p.baggage_weight_kg}kg)`);

  // Show unassigned for date around June 8-9
  const unassigned = await p.$queryRawUnsafe<Array<Record<string,unknown>>>(
    `SELECT b.booking_reference, bl.origin_code, bl.destination_code,
            bp.first_name, bp.last_name, COUNT(blp.id)::int as cnt
     FROM booking_legs bl
     JOIN bookings b ON b.id = bl.booking_id
     JOIN booking_leg_passengers blp ON blp.booking_leg_id = bl.id
     JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
     WHERE bl.leg_date BETWEEN '2026-06-08' AND '2026-06-09'
       AND b.status != 'cancelled'
       AND bl.flight_id IS NULL
     GROUP BY b.booking_reference, bl.origin_code, bl.destination_code, bp.first_name, bp.last_name
     ORDER BY b.booking_reference, bp.first_name`
  );
  console.log(`\nUnassigned passengers (Jun 8-9): ${unassigned.length}`);
  for (const u of unassigned) console.log(`  ${u.booking_reference}: ${u.first_name} ${u.last_name} | ${u.origin_code}→${u.destination_code}`);

  await p.$disconnect();
}
main();
