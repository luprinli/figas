import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas", { disposeExternalPool: true }) });

async function main() {
  // Users with pilot role but no corresponding pilot record
  const missing = await prisma.$queryRawUnsafe<Array<{id:number; name:string; email:string; is_active:boolean}>>(
    `SELECT u.id, u.name, u.email, u.is_active
     FROM users u
     LEFT JOIN pilots p ON p.user_id = u.id
     WHERE u.role = 'pilot' AND p.id IS NULL
     ORDER BY u.id`
  );
  console.log("Users with pilot role but NO pilot record:");
  let created = 0;
  for (const u of missing) {
    console.log(`  id=${u.id}: ${u.name} <${u.email}> active=${u.is_active}`);
    // Create pilot record if active
    if (u.is_active) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO pilots (user_id, name, email, license_number, license_type, rating, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, 'CPL-GENERIC', 'CPL', 'BN-2 Type Rating', true, NOW(), NOW())`,
        u.id, u.name, u.email
      );
      created++;
    }
  }
  console.log(`\nCreated ${created} pilot records`);

  // Fix: deactivate any non-pilot active pilot records (should not happen)
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
