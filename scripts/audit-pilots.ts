import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas", { disposeExternalPool: true }) });

async function main() {
  console.log("=== Pilot Data Audit ===\n");

  // 1. All pilots with their linked user data
  const all = await prisma.$queryRawUnsafe<Array<{
    pid: number; pname: string; pemail: string; puser: number|null; pactive: boolean;
    uname: string|null; uemail: string|null; urole: string|null;
  }>>(
    `SELECT p.id AS pid, p.name AS pname, p.email AS pemail, p.user_id AS puser, p.is_active AS pactive,
            u.name AS uname, u.email AS uemail, u.role AS urole
     FROM pilots p
     LEFT JOIN users u ON u.id = p.user_id
     ORDER BY p.id`
  );
  console.log("All pilots:");
  let inconsistencies = 0;
  for (const r of all) {
    const nameMatch = r.pname === r.uname ? "✓" : `✗ (pilot="${r.pname}", user="${r.uname}")`;
    const emailMatch = r.pemail === r.uemail ? "✓" : `✗ (pilot="${r.pemail}", user="${r.uemail}")`;
    const roleOK = r.urole === "pilot" || r.urole === null ? (r.urole === "pilot" ? "✓ pilot" : "✓ (no user)") : `✗ role="${r.urole}"`;
    if (nameMatch !== "✓" || emailMatch !== "✓") inconsistencies++;
    console.log(`  id=${r.pid}: ${r.pname} <${r.pemail}> | user_id=${r.puser} | name=${nameMatch} email=${emailMatch} role=${roleOK}`);
  }
  console.log(`\nInconsistencies: ${inconsistencies}`);

  // 2. Pilots without user_id
  const orphans = await prisma.$queryRawUnsafe<Array<{cnt: number}>>(
    "SELECT COUNT(*)::int AS cnt FROM pilots WHERE user_id IS NULL"
  );
  console.log(`\nPilots with NULL user_id: ${orphans[0].cnt}`);

  // 3. Duplicate pilots by user_id
  const dups = await prisma.$queryRawUnsafe<Array<{cnt: number}>>(
    "SELECT COUNT(*)::int AS cnt FROM (SELECT user_id, COUNT(*) FROM pilots WHERE user_id IS NOT NULL GROUP BY user_id HAVING COUNT(*) > 1) sub"
  );
  console.log(`Duplicate user_id in pilots: ${dups[0].cnt}`);

  // 4. Users with pilot role that have no pilot record
  const missing = await prisma.$queryRawUnsafe<Array<{cnt: number}>>(
    "SELECT COUNT(*)::int AS cnt FROM users u LEFT JOIN pilots p ON p.user_id = u.id WHERE u.role = 'pilot' AND p.id IS NULL AND u.is_active = true"
  );
  console.log(`Active pilot users without pilot record: ${missing[0].cnt}`);

  // 5. Count total records
  const counts = await prisma.$queryRawUnsafe<Array<{pilots: number; users: number; pilot_users: number}>>(
    `SELECT (SELECT COUNT(*) FROM pilots)::int AS pilots,
            (SELECT COUNT(*) FROM users)::int AS users,
            (SELECT COUNT(*) FROM users WHERE role = 'pilot')::int AS pilot_users`
  );
  console.log(`\nTotals: ${counts[0].pilots} pilots, ${counts[0].users} users, ${counts[0].pilot_users} pilot-role users`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
