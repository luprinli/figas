import { redirect } from "@remix-run/node";
import { getSession } from "../session.server";
import { kdb } from "./db.server.kysely";
import { sql } from "kysely";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PermissionUser {
    id: string;
    email: string;
    name: string;
    roles: { id: number; slug: string; name: string; hierarchyLevel: number }[];
    permissions: string[];
    /** @deprecated Use `permissions` directly. Roles are containers, not authorization primitives. */
    hierarchyLevel: number;
}

// ── Permission Cache with TTL ────────────────────────────────────────────────

interface CacheEntry {
    permissions: string[];
    timestamp: number;
}

const permissionCache = new Map<string, CacheEntry>();

/** Cache TTL in milliseconds (60 seconds). Balances stale-data risk against DB load. */
const CACHE_TTL_MS = 60_000;

export function clearPermissionCache(userId?: number): void {
    if (userId) {
        permissionCache.delete(`user:${userId}`);
    } else {
        permissionCache.clear();
    }
}

/**
 * Get a cached value, respecting TTL. Returns undefined if the entry is
 * missing or has expired (and cleans up the expired entry).
 */
function getCachedPermissions(userId: number): string[] | undefined {
    const key = `user:${userId}`;
    const entry = permissionCache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        permissionCache.delete(key);
        return undefined;
    }
    return entry.permissions;
}

/**
 * Store permissions in cache with the current timestamp.
 */
function setCachedPermissions(userId: number, permissions: string[]): void {
    permissionCache.set(`user:${userId}`, {
        permissions,
        timestamp: Date.now(),
    });
}

// ── Session Helpers ──────────────────────────────────────────────────────────

async function getUserIdFromSession(request: Request): Promise<number> {
    const session = await getSession(request.headers.get("Cookie"));
    const userId = session.get("userId");
    if (!userId) {
        throw redirect("/login");
    }
    return Number(userId);
}

// ── Core Permission Checks ───────────────────────────────────────────────────

/**
 * Require a specific permission. Throws redirect if unauthorized.
 * Used in route loaders/actions. Returns the user identity for downstream use.
 */
export async function requirePermission(
    request: Request,
    permission: string
): Promise<PermissionUser> {
    const userId = await getUserIdFromSession(request);
    const hasPerm = await hasPermission(userId, permission);
    if (!hasPerm) {
        throw redirect("/login");
    }
    return getPermissionUser(userId);
}

/**
 * Require any of the listed permissions. Throws redirect if unauthorized.
 */
export async function requireAnyPermission(
    request: Request,
    permissions: string[]
): Promise<PermissionUser> {
    const userId = await getUserIdFromSession(request);
    for (const perm of permissions) {
        if (await hasPermission(userId, perm)) {
            return getPermissionUser(userId);
        }
    }
    throw redirect("/login");
}

/**
 * Require all of the listed permissions. Throws redirect if unauthorized.
 */
export async function requireAllPermissions(
    request: Request,
    permissions: string[]
): Promise<PermissionUser> {
    const userId = await getUserIdFromSession(request);
    for (const perm of permissions) {
        if (!(await hasPermission(userId, perm))) {
            throw redirect("/login");
        }
    }
    return getPermissionUser(userId);
}

// ── Permission-Based Checks (Backward Compatible) ────────────────────────────

/**
 * Require a specific role slug. Throws redirect if unauthorized.
 * Kept for backward compatibility during migration.
 * Internally checks user_roles table, not users.role column.
 * NOTE: Roles are containers for permissions — prefer `requirePermission` for new code.
 */
export async function requireRole(
    request: Request,
    roleSlug: string
): Promise<PermissionUser> {
    const userId = await getUserIdFromSession(request);
    const userRoles = await getUserRoles(userId);
    const hasRole = userRoles.some((r) => r.slug === roleSlug);
    if (!hasRole) {
        throw redirect("/login");
    }
    return getPermissionUser(userId);
}

/**
 * Require any of the specified role slugs. Throws redirect if unauthorized.
 */
export async function requireAnyRole(
    request: Request,
    roleSlugs: string[]
): Promise<PermissionUser> {
    const userId = await getUserIdFromSession(request);
    const userRoles = await getUserRoles(userId);
    const hasRole = userRoles.some((r) => roleSlugs.includes(r.slug));
    if (!hasRole) {
        throw redirect("/login");
    }
    return getPermissionUser(userId);
}

// ── UI Rendering Helpers ─────────────────────────────────────────────────────

/**
 * Check if a user has a specific permission (for UI rendering).
 * Returns boolean, does not throw.
 * NOTE: Must only be called from loaders/actions, not from component render paths.
 * Pass the result via useLoaderData.
 */
export async function hasPermission(
    userId: number,
    permission: string
): Promise<boolean> {
    // Check cache first (with TTL-based expiration)
    const cached = getCachedPermissions(userId);
    if (cached) {
        return cached.includes(permission);
    }

    // Single EXISTS query to avoid N+1
    const [resource, action] = permission.split(":");
    if (!resource || !action) {
      throw new Error(`Invalid permission format: "${permission}". Expected format: "resource:action"`);
    }
    const result = await sql<{ exists: boolean }>`
      SELECT EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN role_permissions rp ON rp.role_id = ur.role_id
        JOIN permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = ${userId} AND p.resource = ${resource} AND p.action = ${action}
      ) AS exists
    `.execute(kdb);

    return result.rows[0]?.exists ?? false;
}

/**
 * Get all permissions for a user (flattened from all their roles).
 */
export async function getUserPermissions(userId: number): Promise<string[]> {
    const cached = getCachedPermissions(userId);
    if (cached) {
        return cached;
    }

    const result = await sql<{ resource: string; action: string }>`
      SELECT DISTINCT p.resource, p.action
      FROM user_roles ur
      JOIN role_permissions rp ON rp.role_id = ur.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = ${userId}
    `.execute(kdb);

    const permissions = result.rows.map((r) => `${r.resource}:${r.action}`);
    setCachedPermissions(userId, permissions);
    return permissions;
}

/**
 * Get all roles for a user.
 */
export async function getUserRoles(
    userId: number
): Promise<{ id: number; slug: string; name: string; hierarchyLevel: number }[]> {
    const result = await sql<{ id: number; slug: string; name: string; hierarchy_level: number }>`
      SELECT r.id, r.slug, r.name, r.hierarchy_level
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ${userId}
    `.execute(kdb);

    return result.rows.map((r) => {
        return {
            id: r.id,
            slug: r.slug,
            name: r.name,
            hierarchyLevel: r.hierarchy_level,
        };
    });
}

/**
 * Get the user's maximum hierarchy level across all assigned roles.
 * Hierarchy levels are used for DISPLAY/ORDERING only, NOT for permission inheritance.
 */
export async function getUserHierarchyLevel(userId: number): Promise<number> {
    const result = await sql<{ max_level: number }>`
      SELECT COALESCE(MAX(r.hierarchy_level), 0) AS max_level
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ${userId}
    `.execute(kdb);

    return result.rows[0]?.max_level ?? 0;
}

/**
 * Get full permission user context (roles + permissions + hierarchy level).
 * Useful for passing to layouts/components via useLoaderData.
 */
export async function getPermissionUser(userId: number): Promise<PermissionUser> {
    const userResult = await sql<{ id: number; email: string; name: string }>`
      SELECT id, email, name FROM users WHERE id = ${userId}
    `.execute(kdb);

    if (!userResult.rows[0]) {
        throw new Error(`User not found: ${userId}`);
    }

    const [roles, permissions, hierarchyLevel] = await Promise.all([
        getUserRoles(userId),
        getUserPermissions(userId),
        getUserHierarchyLevel(userId),
    ]);

    return {
        id: String(userResult.rows[0].id),
        email: userResult.rows[0].email,
        name: userResult.rows[0].name,
        roles,
        permissions,
        hierarchyLevel,
    };
}

// ── Admin Functions ──────────────────────────────────────────────────────────

/**
 * Assign a role to a user. Records audit log entry.
 * Validates that the actor has the `user:assign-role` permission.
 * Checks for segregation of duties conflicts before assigning.
 */
export async function assignRole(
    actorId: number,
    userId: number,
    roleId: number
): Promise<void> {
    await validateActorPermission(actorId, "user:assign-role");

    // Check SoD: validate that assigning this role won't create incompatible permission combinations
    await validateSoDForRole(userId, roleId);

    await sql`
      INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES (${userId}, ${roleId}, ${actorId}) ON CONFLICT DO NOTHING
    `.execute(kdb);

    await createAuditLogEntry({
        actorId,
        action: "role.assigned",
        entityType: "user_role",
        entityId: userId,
        newValues: { role_id: roleId },
    });

    clearPermissionCache(userId);
}

/**
 * Remove a role from a user. Records audit log entry.
 */
export async function revokeRole(
    actorId: number,
    userId: number,
    roleId: number
): Promise<void> {
    await validateActorPermission(actorId, "user:assign-role");

    await sql`
      DELETE FROM user_roles WHERE user_id = ${userId} AND role_id = ${roleId}
    `.execute(kdb);

    await createAuditLogEntry({
        actorId,
        action: "role.revoked",
        entityType: "user_role",
        entityId: userId,
        oldValues: { role_id: roleId },
    });

    clearPermissionCache(userId);
}

/**
 * Add a permission to a role. Records audit log entry.
 */
export async function addPermissionToRole(
    actorId: number,
    roleId: number,
    permissionId: number
): Promise<void> {
    await validateActorPermission(actorId, "role:manage-permissions");

    await sql`
      INSERT INTO role_permissions (role_id, permission_id) VALUES (${roleId}, ${permissionId}) ON CONFLICT DO NOTHING
    `.execute(kdb);

    await createAuditLogEntry({
        actorId,
        action: "permission.granted",
        entityType: "role_permission",
        entityId: roleId,
        newValues: { permission_id: permissionId },
    });
}

/**
 * Remove a permission from a role. Records audit log entry.
 */
export async function removePermissionFromRole(
    actorId: number,
    roleId: number,
    permissionId: number
): Promise<void> {
    await validateActorPermission(actorId, "role:manage-permissions");

    await sql`
      DELETE FROM role_permissions WHERE role_id = ${roleId} AND permission_id = ${permissionId}
    `.execute(kdb);

    await createAuditLogEntry({
        actorId,
        action: "permission.revoked",
        entityType: "role_permission",
        entityId: roleId,
        oldValues: { permission_id: permissionId },
    });
}

// ── Audit Log ────────────────────────────────────────────────────────────────

/**
 * Record an audit log entry.
 */
export async function createAuditLogEntry(params: {
    actorId: number;
    action: string;
    entityType: string;
    entityId?: number;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
}): Promise<void> {
    await sql`
      INSERT INTO audit_log (actor_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
      VALUES (
        ${params.actorId},
        ${params.action},
        ${params.entityType},
        ${params.entityId ?? null},
        ${params.oldValues ? JSON.stringify(params.oldValues) : null}::jsonb,
        ${params.newValues ? JSON.stringify(params.newValues) : null}::jsonb,
        ${params.ipAddress ?? null},
        ${params.userAgent ?? null}
      )
    `.execute(kdb);
}

/**
 * Query audit log with filters.
 */
export async function queryAuditLog(params: {
    actorId?: number;
    action?: string;
    entityType?: string;
    entityId?: number;
    dateFrom?: Date;
    dateTo?: Date;
    page?: number;
    perPage?: number;
}): Promise<{ entries: Record<string, unknown>[]; totalCount: number }> {
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 50;
    const offset = (page - 1) * perPage;

    // Use Kysely query builder for dynamic WHERE clauses
    let countQuery = kdb.selectFrom("audit_log").select(kdb.fn.countAll<number>().as("count"));
    let entriesQuery = kdb.selectFrom("audit_log").selectAll();

    if (params.actorId !== undefined) {
        countQuery = countQuery.where("actor_id", "=", params.actorId);
        entriesQuery = entriesQuery.where("actor_id", "=", params.actorId);
    }
    if (params.action !== undefined) {
        countQuery = countQuery.where("action", "=", params.action);
        entriesQuery = entriesQuery.where("action", "=", params.action);
    }
    if (params.entityType !== undefined) {
        countQuery = countQuery.where("entity_type", "=", params.entityType);
        entriesQuery = entriesQuery.where("entity_type", "=", params.entityType);
    }
    if (params.entityId !== undefined) {
        countQuery = countQuery.where("entity_id", "=", params.entityId);
        entriesQuery = entriesQuery.where("entity_id", "=", params.entityId);
    }
    if (params.dateFrom !== undefined) {
        countQuery = countQuery.where("created_at", ">=", params.dateFrom as never);
        entriesQuery = entriesQuery.where("created_at", ">=", params.dateFrom as never);
    }
    if (params.dateTo !== undefined) {
        countQuery = countQuery.where("created_at", "<=", params.dateTo as never);
        entriesQuery = entriesQuery.where("created_at", "<=", params.dateTo as never);
    }

    const countResult = await countQuery.executeTakeFirst();
    const entriesResult = await entriesQuery
        .orderBy("created_at", "desc")
        .limit(perPage)
        .offset(offset)
        .execute();

    return {
        entries: entriesResult as unknown as Record<string, unknown>[],
        totalCount: Number(countResult?.count ?? 0),
    };
}

// ── Validation Helpers ───────────────────────────────────────────────────────

/**
 * Validate that a role can be deleted (no users assigned to it).
 * Throws if users are still assigned.
 */
export async function validateRoleDeletion(roleId: number): Promise<void> {
    const result = await sql<{ count: number }>`
      SELECT COUNT(*)::int AS count FROM user_roles WHERE role_id = ${roleId}
    `.execute(kdb);

    if (result.rows[0] && Number(result.rows[0].count) > 0) {
        throw new Error(
            `Cannot delete role: ${Number(result.rows[0].count)} user(s) are still assigned to this role.`
        );
    }
}

/**
 * Validate that the actor has the required permission.
 * Throws if unauthorized.
 */
export async function validateActorPermission(
    actorId: number,
    requiredPermission: string
): Promise<void> {
    const hasPerm = await hasPermission(actorId, requiredPermission);
    if (!hasPerm) {
        throw new Error(
            `Actor ${actorId} does not have the required permission: ${requiredPermission}`
        );
    }
}

// ── Segregation of Duties (SoD) ─────────────────────────────────────────────

/**
 * Known incompatible permission combinations from plan section 9.1.
 * These pairs cannot be held by the same user simultaneously.
 */
const INCOMPATIBLE_PERMISSIONS: ReadonlyArray<[string, string, string]> = [
    ["finance:record-payment", "finance:reconcile", "Same person cannot record payments AND reconcile bank statements"],
    ["finance:create-invoice", "finance:record-payment", "Same person cannot create invoices AND record payments against them"],
    ["user:create", "user:assign-role", "Same person cannot create users AND assign them roles"],
];

/**
 * Validate segregation of duties — checks if a user has both incompatible permissions.
 * Throws if the user has both permissions.
 */
export async function validateSoD(
    userId: number,
    permissionA: string,
    permissionB: string
): Promise<void> {
    const [hasA, hasB] = await Promise.all([
        hasPermission(userId, permissionA),
        hasPermission(userId, permissionB),
    ]);

    if (hasA && hasB) {
        throw new Error(
            `Segregation of duties violation: User has both "${permissionA}" and "${permissionB}" permissions.`
        );
    }
}

/**
 * Validate all known SoD incompatible combinations for a user.
 * Checks all pairs from the INCOMPATIBLE_PERMISSIONS list.
 * Throws on the first violation found.
 */
export async function validateAllSoD(userId: number): Promise<void> {
    const userPerms = await getUserPermissions(userId);

    for (const [permA, permB, rationale] of INCOMPATIBLE_PERMISSIONS) {
        const hasA = userPerms.includes(permA);
        const hasB = userPerms.includes(permB);
        if (hasA && hasB) {
            throw new Error(
                `Segregation of duties violation: ${rationale}. User has both "${permA}" and "${permB}".`
            );
        }
    }
}

/**
 * Validate that assigning a specific role to a user would not create
 * an SoD conflict. Fetches the role's permissions and checks against
 * the user's existing permissions.
 * Throws if a conflict would be created.
 */
export async function validateSoDForRole(
    userId: number,
    roleId: number
): Promise<void> {
    const rolePermsResult = await sql<{ resource: string; action: string }>`
      SELECT p.resource, p.action
      FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = ${roleId}
    `.execute(kdb);

    const rolePermissions = rolePermsResult.rows.map(
        (r) => `${r.resource}:${r.action}`
    );


    const userPermissions = await getUserPermissions(userId);

    // Check each incompatible pair
    for (const [permA, permB, rationale] of INCOMPATIBLE_PERMISSIONS) {
        const roleHasA = rolePermissions.includes(permA);
        const roleHasB = rolePermissions.includes(permB);
        const userHasA = userPermissions.includes(permA);
        const userHasB = userPermissions.includes(permB);

        // Conflict if the role grants one and the user already has the other
        // OR if the role grants both (which would be a self-conflict in the role)
        if ((roleHasA && userHasB) || (roleHasB && userHasA) || (roleHasA && roleHasB)) {
            throw new Error(
                `Segregation of duties violation: ${rationale}. ` +
                `Assigning this role would grant "${roleHasA ? permA : permB}" ` +
                `while the user already has "${roleHasA ? permB : permA}".`
            );
        }
    }
}

// ── Approval Validation ─────────────────────────────────────────────────────

/**
 * Validate that the approver is not the same as the initiator.
 * Throws if initiatorId === approverId.
 */
export async function validateApproval(
    initiatorId: number,
    approverId: number
): Promise<void> {
    if (initiatorId === approverId) {
        throw new Error(
            "Self-approval is not permitted. A different user must approve this action."
        );
    }
}
