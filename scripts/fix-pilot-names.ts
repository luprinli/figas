import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas", { disposeExternalPool: true }) });

async function main() {
  await prisma.$executeRawUnsafe(
    `UPDATE pilots p SET name = u.name FROM users u WHERE u.id = p.user_id AND p.name = split_part(u.email, '@', 1)`
  );
  console.log("Updated pilot names from user accounts.");

  const pilots = await prisma.pilots.findMany({
    where: { is_active: true },
    select: { id: true, name: true, email: true },
    orderBy: { id: "asc" },
  });
  console.log("Current pilots:");
  for (const p of pilots) {
    console.log(`  id=${p.id}: "${p.name}" <${p.email}>`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
