/**
 * Re-seed all bookings with realistic origin distribution.
 * Destroys existing booking and flight data.
 */
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!, { disposeExternalPool: true }) });

async function main() {
  console.log("=== Re-seeding Bookings ===\n");

  // Delete in dependency order
  console.log("1. Dropping dependent data...");
  await p.$executeRawUnsafe("DELETE FROM weight_balance_snapshots");
  await p.$executeRawUnsafe("DELETE FROM checkin_reminders");
  await p.$executeRawUnsafe("DELETE FROM payments WHERE booking_id IS NOT NULL");
  await p.$executeRawUnsafe("DELETE FROM booking_leg_passengers");
  await p.$executeRawUnsafe("DELETE FROM booking_passengers");
  await p.$executeRawUnsafe("DELETE FROM booking_legs");
  await p.$executeRawUnsafe("DELETE FROM flight_legs");
  await p.$executeRawUnsafe("DELETE FROM flights");
  await p.$executeRawUnsafe("DELETE FROM schedules");
  await p.$executeRawUnsafe("DELETE FROM bookings");
  console.log("   Done.");

  await p.$disconnect();
  console.log("\nNow run: node --env-file .env --import tsx scripts/seed-comprehensive.ts");
}
main().catch(err => { console.error(err); process.exit(1); });
