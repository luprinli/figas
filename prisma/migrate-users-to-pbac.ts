/**
 * PBAC User Migration Script
 *
 * Reads each user's current `role` column value from the `users` table,
 * maps it to the corresponding role slug, and creates a `user_roles` record.
 * Logs all changes to the `audit_log` table.
 *
 * Role mapping:
 *   "admin"      → "admin"
 *   "operations" → "operations"
 *   "finance"    → "finance"
 *   "checkin"    → "checkin"
 *   "pilot"      → "pilot"
 *   "engineer"   → "engineer"
 *   "passenger"  → "passenger"
 *   Any other    → "passenger" (fallback)
 *
 * Idempotent — safe to re-run. Skips users who already have user_roles records.
 *
 * Usage:
 *   node --env-file .env --import tsx prisma/migrate-users-to-pbac.ts
 */

import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    throw new Error(
        "FATAL: DATABASE_URL environment variable is required.\n" +
            "Example: postgresql://user:password@localhost:5432/figas"
    );
}

const adapter = new PrismaPg(DATABASE_URL, { disposeExternalPool: true });

// ── Role Mapping ─────────────────────────────────────────────────────────────

const ROLE_MAPPING: Record<string, string> = {
    admin: "admin",
    operations: "operations",
    finance: "finance",
    checkin: "checkin",
    pilot: "pilot",
    engineer: "engineer",
    passenger: "passenger",
};

const FALLBACK_ROLE = "passenger";

// ── Main Migration Function ──────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log("\n🔄 PBAC User Migration Script\n");

    const prisma = new PrismaClient({ adapter });

    try {
        await prisma.$transaction(async (tx) => {
            // ── Step 1: Fetch all users ──────────────────────────────────────────
            const users = await tx.users.findMany({
                orderBy: { id: "asc" },
                select: { id: true, name: true, email: true, role: true },
            });
            console.log(`  📋 Found ${users.length} users to process`);

            // ── Step 2: Fetch role ID map ────────────────────────────────────────
            const roles = await tx.roles.findMany({
                select: { id: true, slug: true },
            });
            const roleMap = new Map<string, number>();
            for (const row of roles) {
                roleMap.set(row.slug, row.id);
            }
            console.log(`  📋 Found ${roleMap.size} roles in database`);

            // Verify all required roles exist
            const requiredRoles = Array.from(
                new Set([...Object.values(ROLE_MAPPING), FALLBACK_ROLE])
            );
            for (const slug of requiredRoles) {
                if (!roleMap.has(slug)) {
                    throw new Error(
                        `Required role "${slug}" not found in database. Run prisma/seed-pbac.ts first.`
                    );
                }
            }

            // ── Step 3: Process each user ────────────────────────────────────────
            let migratedCount = 0;
            let skippedCount = 0;
            let fallbackCount = 0;
            const auditEntries: Array<{
                userId: number;
                roleSlug: string;
            }> = [];

            for (const user of users) {
                const userId = user.id;
                const currentRole = user.role.toLowerCase();

                // Check if user already has a user_roles record
                const existingRole = await tx.user_roles.findFirst({
                    where: { user_id: userId },
                    select: { id: true },
                });

                if (existingRole) {
                    console.log(`  ⏭ User #${userId} (${user.email}) — already has roles, skipping`);
                    skippedCount++;
                    continue;
                }

                // Map the role
                const targetRoleSlug = ROLE_MAPPING[currentRole] ?? FALLBACK_ROLE;
                const targetRoleId = roleMap.get(targetRoleSlug);

                if (!targetRoleId) {
                    console.warn(
                        `  ⚠ User #${userId} (${user.email}) — role "${currentRole}" mapped to "${targetRoleSlug}" but role ID not found, skipping`
                    );
                    skippedCount++;
                    continue;
                }

                if (targetRoleSlug === FALLBACK_ROLE && currentRole !== FALLBACK_ROLE) {
                    console.log(
                        `  ⚠ User #${userId} (${user.email}) — unknown role "${currentRole}", falling back to "${FALLBACK_ROLE}"`
                    );
                    fallbackCount++;
                }

                // Create user_roles record
                await tx.user_roles.create({
                    data: {
                        user_id: userId,
                        role_id: targetRoleId,
                        assigned_by: null,
                    },
                });

                auditEntries.push({ userId, roleSlug: targetRoleSlug });
                migratedCount++;

                console.log(
                    `  ✓ User #${userId} (${user.email}) — "${currentRole}" → role "${targetRoleSlug}"`
                );
            }

            // ── Step 4: Log to audit_log ─────────────────────────────────────────
            console.log("\n  Logging changes to audit_log...");
            let auditCount = 0;

            for (const entry of auditEntries) {
                await tx.audit_log.create({
                    data: {
                        actor_id: entry.userId,
                        action: "user-role-migrated",
                        entity_type: "user_roles",
                        entity_id: entry.userId,
                        new_values: { role_slug: entry.roleSlug },
                    },
                });
                auditCount++;
            }

            // ── Summary ──────────────────────────────────────────────────────────
            console.log("\n── Migration Summary ──");
            console.log(`  Total users processed: ${users.length}`);
            console.log(`  Migrated (new roles):  ${migratedCount}`);
            console.log(`  Skipped (already set): ${skippedCount}`);
            console.log(`  Fallback to passenger: ${fallbackCount}`);
            console.log(`  Audit log entries:     ${auditCount}`);
        });

        console.log("\n✅ PBAC user migration completed successfully!\n");
    } catch (err) {
        console.error("\n❌ PBAC user migration failed:", err);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
