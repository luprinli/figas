/**
 * Seed the test database (figas_test) with reference data needed by
 * integration tests.
 *
 * Usage:
 *   set DATABASE_URL=postgresql://artisan:Murugami%402019@localhost:5432/figas_test
 *   npx tsx scripts/seed-test-db.ts
 */
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function query(sql: string, params: unknown[] = []) {
  return pool.query(sql, params);
}

async function main() {
  console.log("Seeding test database...");

  // ── 1. Aerodromes ──────────────────────────────────────────────────────────
  const aerodromes = [
    { code: "STY", name: "Stanley Airport", city: "Stanley", runway_length: 1200.0, timezone: "Atlantic/Stanley", is_active: true, fuel_available: true },
    { code: "MPA", name: "Mpa Airport", city: "Mpa", runway_length: 900.0, timezone: "Atlantic/Stanley", is_active: true, fuel_available: false },
    { code: "SHR", name: "Shirley Airport", city: "Shirley", runway_length: 800.0, timezone: "Atlantic/Stanley", is_active: true, fuel_available: false },
    { code: "PPS", name: "Pebble Island Settlement", city: "Pebble Island", runway_length: 750.0, timezone: "Atlantic/Stanley", is_active: true, fuel_available: false },
    { code: "SAU", name: "Saunders Island Settlement", city: "Saunders Island", runway_length: 700.0, timezone: "Atlantic/Stanley", is_active: true, fuel_available: false },
  ];

  for (const a of aerodromes) {
    await query(
      `INSERT INTO aerodromes (code, name, city, runway_length, timezone, is_active, fuel_available, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, city = EXCLUDED.city`,
      [a.code, a.name, a.city, a.runway_length, a.timezone, a.is_active, a.fuel_available]
    );
  }
  console.log(`  ✓ ${aerodromes.length} aerodromes`);

  // ── 2. Aircraft ────────────────────────────────────────────────────────────
  await query(
    `INSERT INTO aircraft (registration, type, manufacturer, model, seat_count, empty_weight_kg, max_takeoff_weight_kg, max_payload_kg, fuel_capacity_kg, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
     ON CONFLICT (registration) DO UPDATE SET type = EXCLUDED.type`,
    ["VP-FBZ", "BN-2 Islander", "Britten-Norman", "BN-2B-26", 9, 1870.0, 2994.0, 1124.0, 380.0, true]
  );
  console.log("  ✓ 1 aircraft");

  // ── 3. Users (with specific IDs matching MOCK_USER_IDS) ────────────────────
  const users = [
    { id: 1, name: "Ops User", email: "ops@figas.gov.fk", password: "figas2024!", role: "operations", is_active: true },
    { id: 2, name: "Admin User", email: "admin@figas.gov.fk", password: "figas2024!", role: "admin", is_active: true },
    { id: 3, name: "Pilot User", email: "pilot@figas.gov.fk", password: "figas2024!", role: "pilot", is_active: true },
    { id: 4, name: "Engineer User", email: "engineer@figas.gov.fk", password: "figas2024!", role: "engineer", is_active: true },
    { id: 5, name: "Agent User", email: "agent@figas.gov.fk", password: "figas2024!", role: "agent", is_active: true },
  ];

  for (const u of users) {
    await query(
      `INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, role = EXCLUDED.role`,
      [u.id, u.name, u.email, u.password, u.role, u.is_active]
    );
  }
  await query(`SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id), 0) FROM users))`);
  console.log(`  ✓ ${users.length} users`);

  // ── 4. Permissions ─────────────────────────────────────────────────────────
  const PERMISSIONS = [
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
    { resource: "flight", action: "create", description: "Create new flights" },
    { resource: "flight", action: "view", description: "View flight details and list" },
    { resource: "flight", action: "edit", description: "Modify flight details" },
    { resource: "flight", action: "cancel", description: "Cancel/delete flights" },
    { resource: "flight", action: "manage-manifest", description: "View and approve flight manifests" },
    { resource: "flight", action: "assign-pilot", description: "Assign pilots to flights" },
    { resource: "flight", action: "manage-seats", description: "Manage seat assignments" },
    { resource: "schedule", action: "create", description: "Create new schedules" },
    { resource: "schedule", action: "view", description: "View schedules" },
    { resource: "schedule", action: "edit", description: "Modify schedules" },
    { resource: "schedule", action: "approve", description: "Approve schedules for publishing" },
    { resource: "schedule", action: "publish", description: "Publish schedules (make visible to passengers)" },
    { resource: "schedule", action: "assign-pilot", description: "Assign pilots to schedule legs" },
    { resource: "user", action: "create", description: "Create new user accounts" },
    { resource: "user", action: "view", description: "View user list and details" },
    { resource: "user", action: "edit", description: "Update user profile details" },
    { resource: "user", action: "delete", description: "Delete/deactivate user accounts" },
    { resource: "user", action: "assign-role", description: "Assign/revoke roles to users" },
    { resource: "user", action: "reset-password", description: "Reset user passwords" },
    { resource: "role", action: "create", description: "Create custom roles" },
    { resource: "role", action: "view", description: "View role definitions" },
    { resource: "role", action: "edit", description: "Modify role definitions" },
    { resource: "role", action: "delete", description: "Delete custom roles" },
    { resource: "role", action: "manage-permissions", description: "Assign/remove permissions from roles" },
    { resource: "finance", action: "view", description: "View financial data" },
    { resource: "finance", action: "create-invoice", description: "Generate invoices" },
    { resource: "finance", action: "record-payment", description: "Record incoming payments" },
    { resource: "finance", action: "reconcile", description: "Reconcile bank transactions" },
    { resource: "finance", action: "manage-exports", description: "Export financial data" },
    { resource: "finance", action: "manage-reminders", description: "Configure payment reminders" },
    { resource: "finance", action: "manage-credit", description: "Manage organization credit limits" },
    { resource: "settings", action: "view", description: "View system settings" },
    { resource: "settings", action: "edit", description: "Modify system settings" },
    { resource: "report", action: "view", description: "View reports" },
    { resource: "report", action: "export", description: "Export report data" },
    { resource: "audit", action: "view", description: "View audit log" },
    { resource: "audit", action: "export", description: "Export audit log" },
    { resource: "aerodrome", action: "view", description: "View aerodrome list and details" },
    { resource: "aerodrome", action: "edit", description: "Modify aerodrome details" },
    { resource: "aircraft", action: "view", description: "View aircraft list and details" },
    { resource: "aircraft", action: "edit", description: "Modify aircraft details" },
    { resource: "no-fly", action: "view", description: "View no-fly day rules" },
    { resource: "no-fly", action: "edit", description: "Modify no-fly day rules" },
    { resource: "notification", action: "view", description: "View notifications" },
    { resource: "notification", action: "manage", description: "Manage notification preferences" },
  ];

  const permissionMap = new Map<string, number>();
  for (const p of PERMISSIONS) {
    await query(
      `INSERT INTO permissions (resource, action, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (resource, action) DO UPDATE SET description = EXCLUDED.description`,
      [p.resource, p.action, p.description]
    );
    const result = await query(
      `SELECT id FROM permissions WHERE resource = $1 AND action = $2`,
      [p.resource, p.action]
    );
    permissionMap.set(`${p.resource}:${p.action}`, result.rows[0].id);
  }
  console.log(`  ✓ ${PERMISSIONS.length} permissions`);

  // ── 5. Roles ───────────────────────────────────────────────────────────────
  const roles = [
    { slug: "admin", name: "ADMIN", description: "System administrator" },
    { slug: "operations", name: "OPERATIONS", description: "Operations staff" },
    { slug: "finance", name: "FINANCE", description: "Finance staff" },
    { slug: "checkin", name: "CHECKIN", description: "Check-in staff" },
    { slug: "pilot", name: "PILOT", description: "Pilot" },
    { slug: "engineer", name: "ENGINEER", description: "Engineer" },
    { slug: "passenger", name: "PASSENGER", description: "Passenger" },
    { slug: "agent", name: "AGENT", description: "Booking agent" },
  ];

  const roleMap = new Map<string, number>();
  for (const r of roles) {
    await query(
      `INSERT INTO roles (slug, name, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description`,
      [r.slug, r.name, r.description]
    );
    const result = await query(`SELECT id FROM roles WHERE slug = $1`, [r.slug]);
    roleMap.set(r.name, result.rows[0].id);
  }
  console.log(`  ✓ ${roles.length} roles`);

  // ── 6. Role-Permission assignments ─────────────────────────────────────────
  const opsPermissions = [
    "schedule:create", "schedule:view", "schedule:edit", "schedule:assign-pilot",
    "flight:create", "flight:view", "flight:edit", "flight:assign-pilot",
    "booking:view", "booking:assign-flight", "booking:manage-passengers", "booking:manage-freight",
    "aerodrome:view", "aircraft:view", "no-fly:view",
  ];

  const adminPermissions = PERMISSIONS.map(p => `${p.resource}:${p.action}`);

  const agentPermissions = [
    "booking:create", "booking:view", "booking:edit", "booking:cancel",
    "booking:manage-passengers", "booking:manage-payment",
  ];

  const rolePermAssignments: Array<{ role: string; perms: string[] }> = [
    { role: "ADMIN", perms: adminPermissions },
    { role: "OPERATIONS", perms: opsPermissions },
    { role: "AGENT", perms: agentPermissions },
  ];

  let assignmentCount = 0;
  for (const { role, perms } of rolePermAssignments) {
    const roleId = roleMap.get(role)!;
    for (const perm of perms) {
      const permId = permissionMap.get(perm);
      if (!permId) {
        console.warn(`  ⚠ Permission not found: ${perm}`);
        continue;
      }
      await query(
        `INSERT INTO role_permissions (role_id, permission_id)
         VALUES ($1, $2)
         ON CONFLICT (role_id, permission_id) DO NOTHING`,
        [roleId, permId]
      );
      assignmentCount++;
    }
  }
  console.log(`  ✓ ${assignmentCount} role-permission assignments`);

  // ── 7. User-Role assignments ───────────────────────────────────────────────
  const userRoleAssignments = [
    { userId: 1, roleName: "OPERATIONS" },
    { userId: 2, roleName: "ADMIN" },
    { userId: 3, roleName: "PILOT" },
    { userId: 4, roleName: "ENGINEER" },
    { userId: 5, roleName: "AGENT" },
  ];

  for (const { userId, roleName } of userRoleAssignments) {
    const roleId = roleMap.get(roleName)!;
    await query(
      `INSERT INTO user_roles (user_id, role_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [userId, roleId]
    );
  }
  console.log(`  ✓ ${userRoleAssignments.length} user-role assignments`);

  // ── 8. Booking (for booking_legs factory that defaults to booking_id: 1) ──
  await query(
    `INSERT INTO bookings (id, booking_reference, user_id, status, created_at, updated_at)
     VALUES (1, 'BK-00001', 5, 'confirmed', NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`
  );
  await query(`SELECT setval('bookings_id_seq', (SELECT COALESCE(MAX(id), 0) FROM bookings))`);
  console.log("  ✓ 1 booking (id=1)");

  // ── 9. Pilots table entry for user 3 (pilot) ──────────────────────────────
  await query(
    `INSERT INTO pilots (id, user_id, license_number, license_type, medical_expiry, created_at, updated_at)
     VALUES (1, 3, 'FIG-P-001', 'CPL', '2027-12-31', NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`
  );
  await query(`SELECT setval('pilots_id_seq', (SELECT COALESCE(MAX(id), 0) FROM pilots))`);
  console.log("  ✓ 1 pilot record");

  console.log("\n✅ Test database seeded successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => pool.end());
