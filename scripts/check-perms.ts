import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas", { disposeExternalPool: true }) });

async function main() {
  // Check schedule status for June 16
  const sch = await prisma.$queryRawUnsafe<Array<{id:number; schedule_date:string; status:string}>>(
    "SELECT id, schedule_date::text, status FROM schedules WHERE schedule_date = '2026-06-16'"
  );
  console.log("Schedule for June 16:");
  for (const s of sch) console.log(`  id=${s.id} date=${s.schedule_date} status=${s.status}`);

  // Check admin user's permissions
  const adminUser = await prisma.$queryRawUnsafe<Array<{id:number; email:string; role:string}>>(
    "SELECT id, email, role FROM users WHERE email = 'admin@figas.gov.fk'"
  );
  if (adminUser.length > 0) {
    const uid = adminUser[0].id;
    const perms = await prisma.$queryRawUnsafe<Array<{code:string}>>(
      `SELECT p.code FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN user_roles ur ON ur.role_id = rp.role_id
       WHERE ur.user_id = $1 AND p.code LIKE 'schedule:%'`, uid
    );
    console.log(`\nAdmin (id=${uid}) schedule permissions:`);
    for (const p of perms) console.log(`  ${p.code}`);
  }

  // Check if any role has schedule:edit
  const editPerm = await prisma.$queryRawUnsafe<Array<{perm_id:number; code:string}>>(
    "SELECT id as perm_id, code FROM permissions WHERE code = 'schedule:edit'"
  );
  console.log(`\nschedule:edit permission:`, editPerm[0]?.code || "NOT FOUND");
  
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
