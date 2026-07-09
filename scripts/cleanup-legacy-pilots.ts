import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas", { disposeExternalPool: true }) });

async function main() {
  // The 3 real pilots are linked to pilot1@figas.gov.fk, pilot2@figas.gov.fk, pilot3@figas.gov.fk
  // All other users with role 'pilot' are legacy duplicates from earlier seed runs.
  // Change their role to 'passenger' and remove their pilot records.
  
  const result = await prisma.$executeRawUnsafe(
    `UPDATE users SET role = 'passenger'
     WHERE role = 'pilot'
       AND email NOT IN ('pilot1@figas.gov.fk', 'pilot2@figas.gov.fk', 'pilot3@figas.gov.fk')`
  );
  console.log(`Fixed ${result} users: role 'pilot' → 'passenger'`);

  // Delete their pilot records (just created by the previous script)
  const deleted = await prisma.$executeRawUnsafe(
    `DELETE FROM pilots
     WHERE email NOT IN ('pilot1@figas.gov.fk', 'pilot2@figas.gov.fk', 'pilot3@figas.gov.fk')`
  );
  console.log(`Deleted ${deleted} legacy pilot records`);

  // Final count
  const counts = await prisma.$queryRawUnsafe<Array<{pilots:number; pilot_users:number}>>(
    `SELECT (SELECT COUNT(*) FROM pilots)::int AS pilots,
            (SELECT COUNT(*) FROM users WHERE role = 'pilot')::int AS pilot_users`
  );
  console.log(`\nFinal: ${counts[0].pilots} pilots, ${counts[0].pilot_users} pilot-role users`);
  console.log(`${counts[0].pilots === counts[0].pilot_users ? '✓' : '✗'} 1:1 pilot-to-user mapping`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
