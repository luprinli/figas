/**
 * Migrate all non-STY booking origins to STY.
 * All FIGAS flights originate from Stanley.
 */
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!, { disposeExternalPool: true }) });

async function main() {
  console.log("=== Migrate Non-STY Booking Origins ===\n");

  // Count non-STY bookings
  const countBefore = await p.$queryRawUnsafe<Array<{cnt:number}>>(
    `SELECT COUNT(*)::int as cnt FROM booking_legs
     WHERE origin_code != 'STY' AND status NOT IN ('cancelled', 'completed')`
  );
  console.log(`Non-STY bookings before: ${countBefore[0].cnt}`);

  // Migrate unassigned bookings (safe to change)
  const result = await p.$executeRawUnsafe(
    `UPDATE booking_legs SET origin_code = 'STY', updated_at = NOW()
     WHERE origin_code != 'STY' AND flight_id IS NULL AND status NOT IN ('cancelled', 'completed')`
  );
  console.log(`Migrated: ${result} unassigned booking legs → STY`);

  // Count remaining
  const countAfter = await p.$queryRawUnsafe<Array<{cnt:number}>>(
    `SELECT COUNT(*)::int as cnt FROM booking_legs
     WHERE origin_code != 'STY' AND status NOT IN ('cancelled', 'completed')`
  );
  console.log(`Non-STY bookings after: ${countAfter[0].cnt}`);

  await p.$disconnect();
}
main().catch(err => { console.error("Fatal:", err); process.exit(1); });
