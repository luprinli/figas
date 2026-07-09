import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!, { disposeExternalPool: true }) });

async function main() {
  // Check FIG060601
  console.log("=== FIG060601 ===\n");
  const flight = await p.$queryRawUnsafe<Array<Record<string,unknown>>>(
    `SELECT * FROM flights WHERE flight_number = 'FIG060601'`
  );
  console.log("Flight:", JSON.stringify(flight[0]));

  const legs = await p.$queryRawUnsafe<Array<Record<string,unknown>>>(
    `SELECT * FROM flight_legs WHERE flight_id = (SELECT id FROM flights WHERE flight_number = 'FIG060601') ORDER BY leg_sequence`
  );
  console.log("\nLegs:");
  for (const l of legs) console.log(`  ${l.leg_sequence}: ${l.origin_code} -> ${l.destination_code} (leg_id: ${l.id})`);

  // Check booking legs assigned
  const bookings = await p.$queryRawUnsafe<Array<Record<string,unknown>>>(
    `SELECT bl.*, b.booking_reference FROM booking_legs bl
     JOIN bookings b ON b.id = bl.booking_id
     WHERE bl.flight_id = (SELECT id FROM flights WHERE flight_number = 'FIG060601')`
  );
  console.log("\nBooking legs assigned:", bookings.length);
  for (const bk of bookings) console.log(`  ${bk.booking_reference}: ${bk.origin_code} -> ${bk.destination_code}`);

  // Check W&B snapshots
  const wb = await p.$queryRawUnsafe<Array<Record<string,unknown>>>(
    `SELECT wb.* FROM weight_balance_snapshots wb
     JOIN flight_legs fl ON fl.id = wb.flight_leg_id
     WHERE fl.flight_id = (SELECT id FROM flights WHERE flight_number = 'FIG060601')`
  );
  console.log("\nW&B snapshots:", wb.length);

  await p.$disconnect();
}
main();
