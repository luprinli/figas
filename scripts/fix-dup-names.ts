import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!, { disposeExternalPool: true }) });

async function main() {
  console.log("=== Fix Duplicate Passenger Names ===\n");

  // Find bookings with duplicate passenger names
  const dups = await p.$queryRawUnsafe<Array<Record<string,unknown>>>(
    `SELECT booking_id, first_name, last_name, COUNT(*)::int as cnt
     FROM booking_passengers
     GROUP BY booking_id, first_name, last_name
     HAVING COUNT(*) > 1
     ORDER BY cnt DESC LIMIT 20`
  );

  console.log(`Bookings with duplicate passenger names: ${dups.length}`);
  for (const d of dups.slice(0, 10)) {
    console.log(`  booking ${d.booking_id}: ${d.first_name} ${d.last_name} ×${d.cnt}`);
  }

  // Count total passengers with duplicated names
  const totalAffected = await p.$queryRawUnsafe<Array<{cnt:number}>>(
    `WITH dups AS (
       SELECT booking_id, first_name, last_name, COUNT(*) as cnt
       FROM booking_passengers GROUP BY booking_id, first_name, last_name
       HAVING COUNT(*) > 1
     )
     SELECT SUM(cnt - 1)::int as cnt FROM dups`
  );
  console.log(`Total extra duplicate records: ${totalAffected[0].cnt || 0}`);

  // Fix: append sequential suffix to duplicate names within same booking
  const bookings = await p.$queryRawUnsafe<Array<{id:number}>>(
    `SELECT DISTINCT booking_id as id FROM (
       SELECT booking_id FROM booking_passengers
       GROUP BY booking_id, first_name, last_name HAVING COUNT(*) > 1) sub`
  );

  let fixed = 0;
  for (const bk of bookings) {
    const pax = await p.$queryRawUnsafe<Array<{id:number;fn:string;ln:string}>>(
      `SELECT id, first_name as fn, last_name as ln FROM booking_passengers WHERE booking_id = $1 ORDER BY id`, bk.id
    );

    // Group by name and assign suffixes
    const nameMap = new Map<string, number>();
    for (const paxItem of pax) {
      const key = `${paxItem.fn}|${paxItem.ln}`;
      const count = nameMap.get(key) ?? 0;
      nameMap.set(key, count + 1);

      if (count > 0) {
        // This is a duplicate — append suffix
        const newFn = `${paxItem.fn} (#${count + 1})`;
        await p.$executeRawUnsafe(
          `UPDATE booking_passengers SET first_name = $1, updated_at = NOW() WHERE id = $2`,
          newFn, paxItem.id
        );
        fixed++;
      }
    }
  }

  console.log(`\nFixed: ${fixed} duplicate passenger names`);

  await p.$disconnect();
}
main().catch(err => { console.error(err); process.exit(1); });
