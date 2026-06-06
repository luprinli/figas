import { redirect } from "@remix-run/node";
import { getSession } from "../session.server";
import { db } from "./db.server";

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
    const result = (await db.queryOne(
        `SELECT EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN role_permissions rp ON rp.role_id = ur.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = $1 AND p.resource = $2 AND p.action = $3
    ) AS exists`,
        [userId, resource, action]
    )) as { exists: boolean } | null;

    return result?.exists ?? false;
}

/**
 * Get all permissions for a user (flattened from all their roles).
 */
export async function getUserPermissions(userId: number): Promise<string[]> {
    const cached = getCachedPermissions(userId);
    if (cached) {
        return cached;
    }

    const result = await db.query(
        `SELECT DISTINCT p.resource, p.action
     FROM user_roles ur
     JOIN role_permissions rp ON rp.role_id = ur.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE ur.user_id = $1`,
        [userId]
    );

    const permissions = result.rows.map((r) => `${(r as { resource: string; action: string }).resource}:${(r as { resource: string; action: string }).action}`);
    setCachedPermissions(userId, permissions);
    return permissions;
}

/**
 * Get all roles for a user.
 */
export async function getUserRoles(
    userId: number
): Promise<{ id: number; slug: string; name: string; hierarchyLevel: number }[]> {
    const result = await db.query(
        `SELECT r.id, r.slug, r.name, r.hierarchy_level
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1`,
        [userId]
    );

    return result.rows.map((r) => {
        const row = r as { id: number; slug: string; name: string; hierarchy_level: number };
        return {
            id: row.id,
            slug: row.slug,
            name: row.name,
            hierarchyLevel: row.hierarchy_level,
        };
    });
}

/**
 * Get the user's maximum hierarchy level across all assigned roles.
 * Hierarchy levels are used for DISPLAY/ORDERING only, NOT for permission inheritance.
 */
export async function getUserHierarchyLevel(userId: number): Promise<number> {
    const result = (await db.queryOne(
        `SELECT COALESCE(MAX(r.hierarchy_level), 0) AS max_level
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1`,
        [userId]
    )) as { max_level: number } | null;

    return result?.max_level ?? 0;
}

/**
 * Get full permission user context (roles + permissions + hierarchy level).
 * Useful for passing to layouts/components via useLoaderData.
 */
export async function getPermissionUser(userId: number): Promise<PermissionUser> {
    const userResult = (await db.queryOne(
        "SELECT id, email, name FROM users WHERE id = $1",
        [userId]
    )) as { id: number; email: string; name: string } | null;

    if (!userResult) {
        throw new Error(`User not found: ${userId}`);
    }

    const [roles, permissions, hierarchyLevel] = await Promise.all([
        getUserRoles(userId),
        getUserPermissions(userId),
        getUserHierarchyLevel(userId),
    ]);

    return {
        id: String(userResult.id),
        email: userResult.email,
        name: userResult.name,
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

    await db.query(
        "INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        [userId, roleId, actorId]
    );

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

    await db.query(
        "DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2",
        [userId, roleId]
    );

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

    await db.query(
        "INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [roleId, permissionId]
    );

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

    await db.query(
        "DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2",
        [roleId, permissionId]
    );

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
    await db.query(
        `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)`,
        [
            params.actorId,
            params.action,
            params.entityType,
            params.entityId ?? null,
            params.oldValues ? JSON.stringify(params.oldValues) : null,
            params.newValues ? JSON.stringify(params.newValues) : null,
            params.ipAddress ?? null,
            params.userAgent ?? null,
        ]
    );
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
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.actorId !== undefined) {
        conditions.push(`actor_id = $${paramIndex++}`);
        values.push(params.actorId);
    }
    if (params.action !== undefined) {
        conditions.push(`action = $${paramIndex++}`);
        values.push(params.action);
    }
    if (params.entityType !== undefined) {
        conditions.push(`entity_type = $${paramIndex++}`);
        values.push(params.entityType);
    }
    if (params.entityId !== undefined) {
        conditions.push(`entity_id = $${paramIndex++}`);
        values.push(params.entityId);
    }
    if (params.dateFrom !== undefined) {
        conditions.push(`created_at >= $${paramIndex++}`);
        values.push(params.dateFrom);
    }
    if (params.dateTo !== undefined) {
        conditions.push(`created_at <= $${paramIndex++}`);
        values.push(params.dateTo);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 50;
    const offset = (page - 1) * perPage;

    const countResult = (await db.queryOne(
        `SELECT COUNT(*) AS count FROM audit_log ${whereClause}`,
        values
    )) as { count: number } | null;

    const entriesResult = (await db.query(
        `SELECT * FROM audit_log ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, perPage, offset]
    )) as { rows: Record<string, unknown>[] };

    return {
        entries: entriesResult.rows,
        totalCount: Number(countResult?.count ?? 0),
    };
}

// ── Validation Helpers ───────────────────────────────────────────────────────

/**
 * Validate that a role can be deleted (no users assigned to it).
 * Throws if users are still assigned.
 */
export async function validateRoleDeletion(roleId: number): Promise<void> {
    const result = (await db.queryOne(
        "SELECT COUNT(*) AS count FROM user_roles WHERE role_id = $1",
        [roleId]
    )) as { count: number } | null;

    if (result && Number(result.count) > 0) {
        throw new Error(
            `Cannot delete role: ${Number(result.count)} user(s) are still assigned to this role.`
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
    // Get the permissions that the role grants
    const rolePermsResult = await db.query(
        `SELECT p.resource, p.action
         FROM role_permissions rp
         JOIN permissions p ON p.id = rp.permission_id
         WHERE rp.role_id = $1`,
        [roleId]
    );

    const rolePermissions = rolePermsResult.rows.map(
        (r) => `${(r as { resource: string; action: string }).resource}:${(r as { resource: string; action: string }).action}`
    );

    // Get the user's current permissions
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
