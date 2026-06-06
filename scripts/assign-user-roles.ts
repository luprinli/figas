/**
 * Assign existing users to their PBAC roles based on their `role` column.
 *
 * Run after prisma/seed-pbac.ts has seeded roles and permissions.
 *
 * Usage:
 *   node --env-file .env --import tsx scripts/assign-user-roles.ts
 */
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL required");

const adapter = new PrismaPg(DATABASE_URL, { disposeExternalPool: true });
const prisma = new PrismaClient({ adapter });

const ROLE_MAP: Record<string, string> = {
  admin: "admin",
  operations: "operations",
  pilot: "pilot",
  engineer: "engineer",
  passenger: "passenger",
  checkin: "checkin",
  finance: "finance",
};

async function main() {
  console.log("\n🔗 Assigning users to PBAC roles...\n");

  const roles = await prisma.roles.findMany();
  const roleBySlug = new Map(roles.map((r) => [r.slug, r]));

  const users = await prisma.users.findMany({
    select: { id: true, email: true, role: true },
  });

  let assigned = 0;
  let skipped = 0;

  for (const user of users) {
    const roleSlug = ROLE_MAP[user.role];
    if (!roleSlug) {
      console.log(`  ⚠  ${user.email} — unknown role "${user.role}", skipping`);
      skipped++;
      continue;
    }

    const role = roleBySlug.get(roleSlug);
    if (!role) {
      console.log(`  ⚠  ${user.email} — role "${roleSlug}" not found in PBAC, skipping`);
      skipped++;
      continue;
    }

    // Check if already assigned
    const existing = await prisma.user_roles.findFirst({
      where: { user_id: user.id, role_id: role.id },
    });

    if (existing) {
      console.log(`  ⏭  ${user.email} — already assigned to "${roleSlug}"`);
      skipped++;
      continue;
    }

    await prisma.user_roles.create({
      data: { user_id: user.id, role_id: role.id },
    });
    console.log(`  ✓ ${user.email} → ${roleSlug}`);
    assigned++;
  }

  console.log(`\n✅ Done: ${assigned} assigned, ${skipped} skipped\n`);

  // Verify
  const userRoleCount = await prisma.user_roles.count();
  console.log(`Total user_roles records: ${userRoleCount}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
