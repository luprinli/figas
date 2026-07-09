import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas", { disposeExternalPool: true }) });

async function main() {
  const pilots = await prisma.pilots.findMany({
    select: { id: true, name: true, email: true, is_active: true, license_number: true },
    orderBy: { id: "asc" },
  });
  console.log("Pilots:");
  for (const p of pilots) {
    console.log(`  id=${p.id}: "${p.name}" <${p.email}> active=${p.is_active} license=${p.license_number}`);
  }

  // Also check users linked to pilots
  const pilotUsers = await prisma.$queryRawUnsafe<Array<{uid:number; email:string; name:string}>>(
    `SELECT u.id AS uid, u.email, u.name FROM users u
     JOIN pilots p ON p.user_id = u.id
     WHERE p.is_active = true`
  );
  console.log("\nPilot user accounts:");
  for (const u of pilotUsers) {
    console.log(`  id=${u.uid}: "${u.name}" <${u.email}>`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
