/**
 * PBAC Seed Script
 *
 * Seeds the permission-based access control (PBAC) tables:
 * 1. All 55 permissions from the permission catalog (resource:action format)
 * 2. All 7 roles: ADMIN, OPERATIONS, FINANCE, CHECKIN, PILOT, ENGINEER, PASSENGER
 * 3. Role-to-permission assignments as mapped in the consolidated master plan
 *
 * Idempotent — safe to re-run. Uses upsert operations within a transaction.
 *
 * Usage:
 *   node --env-file .env --import tsx prisma/seed-pbac.ts
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

// ── Permission Catalog ───────────────────────────────────────────────────────
// All 55 permissions in resource:action format (section 1.6 of the master plan)

interface PermissionSeed {
    resource: string;
    action: string;
    description: string;
}

const PERMISSIONS: PermissionSeed[] = [
    // Bookings (10)
    { resource: "booking", action: "create", description: "Create new bookings" },
    { resource: "booking", action: "view", description: "View booking details and list" },
    { resource: "booking", action: "edit", description: "Modify existing bookings" },
    { resource: "booking", action: "cancel", description: "Cancel/delete bookings" },
    { resource: "booking", action: "checkin", description: "Process passenger check-in" },
    { resource: "booking", action: "approve", description: "Approve bookings (pilot review step)" },
    { resource: "booking", action: "assign-flight", description: "Assign flights to booking legs" },
    { resource: "booking", action: "manage-passengers", description: "Add/remove passengers on bookings" },
    { resource: "booking", action: "manage-freight", description: "Manage freight declarations" },
    { resource: "booking", action: "manage-payment", description: "Process payments, mark as paid" },

    // Flights (7)
    { resource: "flight", action: "create", description: "Create new flights" },
    { resource: "flight", action: "view", description: "View flight details and list" },
    { resource: "flight", action: "edit", description: "Modify flight details" },
    { resource: "flight", action: "cancel", description: "Cancel/delete flights" },
    { resource: "flight", action: "manage-manifest", description: "View and approve flight manifests" },
    { resource: "flight", action: "assign-pilot", description: "Assign pilots to flights" },
    { resource: "flight", action: "manage-seats", description: "Manage seat assignments" },

    // Schedules (6)
    { resource: "schedule", action: "create", description: "Create new schedules" },
    { resource: "schedule", action: "view", description: "View schedules" },
    { resource: "schedule", action: "edit", description: "Modify schedules" },
    { resource: "schedule", action: "approve", description: "Approve schedules for publishing" },
    { resource: "schedule", action: "publish", description: "Publish schedules (make visible to passengers)" },
    { resource: "schedule", action: "assign-pilot", description: "Assign pilots to schedule legs" },

    // Users (6)
    { resource: "user", action: "create", description: "Create new user accounts" },
    { resource: "user", action: "view", description: "View user list and details" },
    { resource: "user", action: "edit", description: "Update user profile details" },
    { resource: "user", action: "delete", description: "Delete/deactivate user accounts" },
    { resource: "user", action: "assign-role", description: "Assign/revoke roles to users" },
    { resource: "user", action: "reset-password", description: "Reset user passwords" },

    // Roles (5)
    { resource: "role", action: "create", description: "Create custom roles" },
    { resource: "role", action: "view", description: "View role definitions" },
    { resource: "role", action: "edit", description: "Modify role definitions" },
    { resource: "role", action: "delete", description: "Delete custom roles" },
    { resource: "role", action: "manage-permissions", description: "Assign/remove permissions from roles" },

    // Finance (7)
    { resource: "finance", action: "view", description: "View financial data" },
    { resource: "finance", action: "create-invoice", description: "Generate invoices" },
    { resource: "finance", action: "record-payment", description: "Record incoming payments" },
    { resource: "finance", action: "reconcile", description: "Reconcile bank transactions" },
    { resource: "finance", action: "manage-exports", description: "Export financial data" },
    { resource: "finance", action: "manage-reminders", description: "Configure payment reminders" },
    { resource: "finance", action: "manage-credit", description: "Manage organization credit limits" },

    // Settings (2)
    { resource: "settings", action: "view", description: "View system settings" },
    { resource: "settings", action: "edit", description: "Modify system settings" },

    // Reports (2)
    { resource: "report", action: "view", description: "View reports" },
    { resource: "report", action: "export", description: "Export report data" },

    // Audit (2)
    { resource: "audit", action: "view", description: "View audit log" },
    { resource: "audit", action: "export", description: "Export audit log data" },

    // Check-in (3)
    { resource: "checkin", action: "view", description: "View check-in interface" },
    { resource: "checkin", action: "process", description: "Process passenger check-in" },
    { resource: "checkin", action: "manage-reminders", description: "Configure check-in reminders" },

    // Maintenance (3 existing + 5 new)
    { resource: "maintenance", action: "view", description: "View maintenance data" },
    { resource: "maintenance", action: "edit", description: "Record maintenance activities" },
    { resource: "maintenance", action: "manage-airframe", description: "Manage airframe hour records" },
    { resource: "maintenance", action: "log-flight", description: "Submit electronic tech log entries" },
    { resource: "maintenance", action: "create-task", description: "Create and assign maintenance tasks" },
    { resource: "maintenance", action: "sign-off", description: "Digitally certify work completed" },
    { resource: "maintenance", action: "defer-defect", description: "Approve defect deferrals per MEL" },
    { resource: "maintenance", action: "manage-components", description: "Add/remove/replace lifed components" },

    // Organizations (3)
    { resource: "organization", action: "view", description: "View organization list/details" },
    { resource: "organization", action: "create", description: "Create organizations" },
    { resource: "organization", action: "edit", description: "Modify organizations" },

    // Admin (1)
    { resource: "admin", action: "access", description: "Access admin panel" },

    // No-Fly Days (1)
    { resource: "no-fly", action: "manage", description: "Manage no-fly day rules" },

    // Loadsheet (2)
    { resource: "loadsheet", action: "view", description: "View flight loadsheets" },
    { resource: "loadsheet", action: "edit", description: "Create and modify flight loadsheets" },
];

// ── Role Definitions ─────────────────────────────────────────────────────────

interface RoleSeed {
    slug: string;
    name: string;
    description: string;
    hierarchyLevel: number;
    isSystem: boolean;
}

const ROLES: RoleSeed[] = [
    {
        slug: "admin",
        name: "Admin",
        description: "Full system access with all permissions",
        hierarchyLevel: 100,
        isSystem: true,
    },
    {
        slug: "operations",
        name: "Operations",
        description: "Flight operations and scheduling management",
        hierarchyLevel: 80,
        isSystem: true,
    },
    {
        slug: "finance",
        name: "Finance",
        description: "Financial management including invoices and payments",
        hierarchyLevel: 70,
        isSystem: true,
    },
    {
        slug: "checkin",
        name: "Check-in",
        description: "Check-in counter operations",
        hierarchyLevel: 60,
        isSystem: true,
    },
    {
        slug: "pilot",
        name: "Pilot",
        description: "Flight crew with access to flight manifests and schedules",
        hierarchyLevel: 50,
        isSystem: true,
    },
    {
        slug: "engineer",
        name: "Engineer",
        description: "Aircraft maintenance and airframe hour tracking",
        hierarchyLevel: 40,
        isSystem: true,
    },
    {
        slug: "passenger",
        name: "Passenger",
        description: "Self-service booking and itinerary access",
        hierarchyLevel: 10,
        isSystem: true,
    },
];

// ── Role-to-Permission Mapping ───────────────────────────────────────────────
// Maps each role slug to the list of permission keys (resource:action) it should have.
// Every permission is explicit — no wildcard patterns.

type PermissionKey = `${string}:${string}`;

const ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
    // ADMIN: All permissions in the catalog (explicitly assigned)
    admin: PERMISSIONS.map((p) => `${p.resource}:${p.action}` as PermissionKey),

    // OPERATIONS
    operations: [
        "booking:create",
        "booking:view",
        "booking:edit",
        "booking:cancel",
        "booking:approve",
        "booking:assign-flight",
        "booking:manage-passengers",
        "booking:manage-freight",
        "booking:manage-payment",
        "flight:create",
        "flight:view",
        "flight:edit",
        "flight:cancel",
        "flight:manage-manifest",
        "flight:assign-pilot",
        "flight:manage-seats",
        "schedule:create",
        "schedule:view",
        "schedule:edit",
        "schedule:approve",
        "schedule:publish",
        "schedule:assign-pilot",
        "checkin:view",
        "checkin:process",
        "report:view",
        "report:export",
        "no-fly:manage",
        "loadsheet:view",
        "loadsheet:edit",
    ],

    // FINANCE
    finance: [
        "booking:view",
        "booking:manage-payment",
        "flight:view",
        "finance:view",
        "finance:create-invoice",
        "finance:record-payment",
        "finance:reconcile",
        "finance:manage-exports",
        "finance:manage-reminders",
        "finance:manage-credit",
        "report:view",
        "report:export",
        "organization:view",
    ],

    // CHECKIN
    checkin: [
        "booking:view",
        "flight:view",
        "checkin:view",
        "checkin:process",
        "checkin:manage-reminders",
    ],

    // PILOT
    pilot: [
        "booking:view",
        "flight:view",
        "flight:manage-manifest",
        "flight:manage-seats",
        "schedule:view",
    ],

    // ENGINEER
    engineer: [
        "flight:view",
        "maintenance:view",
        "maintenance:edit",
        "maintenance:manage-airframe",
        "maintenance:log-flight",
        "maintenance:create-task",
        "maintenance:sign-off",
        "maintenance:defer-defect",
        "maintenance:manage-components",
    ],

    // PASSENGER
    passenger: [
        "booking:create",
        "booking:view",
        "booking:manage-passengers",
    ],
};

// ── Main Seed Function ───────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log("\n🌱 PBAC Seed Script\n");

    const prisma = new PrismaClient({ adapter });

    try {
        await prisma.$transaction(async (tx) => {
            // ── Step 1: Upsert all permissions ──────────────────────────────────
            console.log("Seeding permissions...");
            const permissionMap = new Map<string, number>();

            for (const perm of PERMISSIONS) {
                const record = await tx.permissions.upsert({
                    where: {
                        resource_action: {
                            resource: perm.resource,
                            action: perm.action,
                        },
                    },
                    update: {
                        description: perm.description,
                    },
                    create: {
                        resource: perm.resource,
                        action: perm.action,
                        description: perm.description,
                    },
                });
                permissionMap.set(`${perm.resource}:${perm.action}`, record.id);
            }
            console.log(`  ✓ ${PERMISSIONS.length} permissions seeded`);

            // ── Step 2: Upsert all roles ────────────────────────────────────────
            console.log("Seeding roles...");
            const roleMap = new Map<string, number>();

            for (const role of ROLES) {
                const record = await tx.roles.upsert({
                    where: { slug: role.slug },
                    update: {
                        name: role.name,
                        description: role.description,
                        hierarchy_level: role.hierarchyLevel,
                        is_system: role.isSystem,
                    },
                    create: {
                        slug: role.slug,
                        name: role.name,
                        description: role.description,
                        hierarchy_level: role.hierarchyLevel,
                        is_system: role.isSystem,
                    },
                });
                roleMap.set(role.slug, record.id);
            }
            console.log(`  ✓ ${ROLES.length} roles seeded`);

            // ── Step 3: Assign permissions to roles ─────────────────────────────
            console.log("Assigning permissions to roles...");
            let assignmentCount = 0;

            for (const [roleSlug, permissionKeys] of Object.entries(ROLE_PERMISSIONS)) {
                const roleId = roleMap.get(roleSlug);
                if (!roleId) {
                    console.warn(`  ⚠ Role not found: ${roleSlug}, skipping`);
                    continue;
                }

                for (const permKey of permissionKeys) {
                    const permissionId = permissionMap.get(permKey);
                    if (!permissionId) {
                        console.warn(`  ⚠ Permission not found: ${permKey}, skipping`);
                        continue;
                    }

                    await tx.role_permissions.upsert({
                        where: {
                            role_id_permission_id: {
                                role_id: roleId,
                                permission_id: permissionId,
                            },
                        },
                        update: {},
                        create: {
                            role_id: roleId,
                            permission_id: permissionId,
                        },
                    });
                    assignmentCount++;
                }
            }
            console.log(`  ✓ ${assignmentCount} role-permission assignments created`);
        });

        console.log("\n✅ PBAC seed completed successfully!\n");
    } catch (err) {
        console.error("\n❌ PBAC seed failed:", err);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
