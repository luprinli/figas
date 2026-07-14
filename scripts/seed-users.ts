/**
 * Seed the main database (figas) with demo users.
 *
 * Creates the users documented in .env with hashed passwords so that
 * the login flow (verifyPassword) works correctly.
 *
 * Usage:
 *   node --env-file .env --import tsx scripts/seed-users.ts
 *
 * Idempotent — safe to re-run. Uses ON CONFLICT (email) DO UPDATE.
 */

import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { scrypt, randomBytes } from "node:crypto";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error(
    "FATAL: DATABASE_URL environment variable is required.\n" +
      "Example: postgresql://user:password@localhost:5432/figas"
  );
}

const adapter = new PrismaPg(DATABASE_URL, { disposeExternalPool: true });
const prisma = new PrismaClient({ adapter });

// ── Password hashing (mirrors app/utils/password.server.ts) ────────────────

function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16).toString("hex");
    scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      resolve(`${salt}:${key.toString("hex")}`);
    });
  });
}

// ── User definitions (matches .env documented credentials) ─────────────────

interface UserSeed {
  name: string;
  email: string;
  password: string;
  role: string;
}

const USERS: UserSeed[] = [
  { name: "Admin User",    email: "admin@figas.gov.fk",    password: "figas2024!", role: "admin" },
  { name: "Ops User",      email: "ops@figas.gov.fk",      password: "figas2024!", role: "operations" },
  { name: "Felix Pilot",   email: "felix.pilot@figas.gov.fk", password: "figas2024!", role: "pilot" },
  { name: "Oscar Pilot",   email: "oscar.pilot@figas.gov.fk", password: "figas2024!", role: "pilot" },
  { name: "Jessica Pilot", email: "jessica.pilot@figas.gov.fk", password: "figas2024!", role: "pilot" },
  { name: "Engineer User", email: "engineer@figas.gov.fk", password: "figas2024!", role: "engineer" },
  { name: "Passenger User", email: "passenger@figas.gov.fk", password: "figas2024!", role: "passenger" },
  { name: "Checkin User",  email: "checkin@figas.gov.fk",  password: "figas2024!", role: "checkin" },
  { name: "Finance User",  email: "finance@figas.gov.fk",  password: "figas2024!", role: "finance" },
];

async function main() {
  console.log("\n👤 Seeding demo users...\n");

  for (const u of USERS) {
    // Check if user already exists
    const existing = await prisma.users.findUnique({
      where: { email: u.email },
      select: { id: true, password: true },
    });

    if (existing) {
      // Check if the stored password is already hashed (contains ":")
      if (existing.password.includes(":")) {
        console.log(`  ⏭  ${u.email} — already exists with hashed password, skipping`);
        continue;
      }
      console.log(`  🔄 ${u.email} — exists with plain-text password, updating to hash`);
    }

    const hashed = await hashPassword(u.password);

    await prisma.users.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        password: hashed,
        role: u.role,
        is_active: true,
        updated_at: new Date(),
      },
      create: {
        name: u.name,
        email: u.email,
        password: hashed,
        role: u.role,
        is_active: true,
      },
    });

    console.log(`  ✓ ${u.email} — seeded (role: ${u.role})`);
  }

  console.log(`\n✅ ${USERS.length} users seeded successfully!\n`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("\n❌ Seed failed:", err);
  process.exit(1);
});
