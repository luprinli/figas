import { redirect } from "@remix-run/node";
import { getSession } from "../session.server";
import { db } from "./db.server";
import {
  getUserRoles,
  requireRole as pbacRequireRole,
  requireAnyRole as pbacRequireAnyRole,
  getPermissionUser,
  type PermissionUser,
} from "./permissions.server";

export interface UserIdentity {
  id: string;
  email: string;
  name: string;
  role: string;
  /** @deprecated Use `permissions` from PermissionUser instead. */
  roles: string[];
  /** @deprecated Use permission-based checks instead. */
  permissions: string[];
}

/**
 * Get the authenticated user's ID from the session.
 * Returns null if not authenticated.
 */
export async function getUserId(
  request: Request
): Promise<string | null> {
  const session = await getSession(request.headers.get("Cookie"));
  const userId = session.get("userId");
  return userId ?? null;
}

/**
 * Require authentication. Redirects to /login if not authenticated.
 */
export async function requireAuth(
  request: Request
): Promise<string> {
  const userId = await getUserId(request);
  if (!userId) {
    throw redirect("/login");
  }
  return userId;
}

/**
 * Get the user's roles from the PBAC user_roles table.
 * Delegates to permissions.server.ts getUserRoles().
 */
export async function getUserRole(
  userId: string | number
): Promise<string | null> {
  const roles = await getUserRoles(Number(userId));
  // Return the first role slug for backward compatibility
  return roles[0]?.slug ?? null;
}

/**
 * Get the full user identity including roles and permissions.
 */
export async function getUserIdentity(
  userId: string | number
): Promise<UserIdentity | null> {
  const numericId = typeof userId === "string" ? Number(userId) : userId;
  const row = await db.users.findUnique({
    where: { id: numericId },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!row) return null;

  // Fetch PBAC roles and permissions
  let permissionUser: PermissionUser | null = null;
  try {
    permissionUser = await getPermissionUser(numericId);
  } catch {
    // If PBAC tables aren't populated yet, return basic identity
  }

  return {
    id: String(row.id),
    email: row.email,
    name: row.name,
    role: row.role,
    roles: permissionUser?.roles.map((r) => r.slug) ?? [row.role],
    permissions: permissionUser?.permissions ?? [],
  };
}

/**
 * Require a specific role. Throws redirect if unauthorized.
 * Delegates to permissions.server.ts requireRole().
 * Returns the PermissionUser for downstream use.
 */
export async function requireRole(
  request: Request,
  role: string
): Promise<PermissionUser> {
  await requireAuth(request);
  return pbacRequireRole(request, role);
}

/**
 * Require any of the specified roles. Throws redirect if unauthorized.
 * Delegates to permissions.server.ts requireAnyRole().
 * Returns the PermissionUser for downstream use.
 */
export async function requireAnyRole(
  request: Request,
  roles: string[]
): Promise<PermissionUser> {
  await requireAuth(request);
  return pbacRequireAnyRole(request, roles);
}

/**
 * Determine the post-login redirect URL based on the user's PBAC permissions.
 *
 * Priority:
 * 1. If a `redirect` query parameter is provided, respect that (user intent).
 * 2. Otherwise, check PBAC permissions to determine the best destination.
 * 3. Fall back to the home page.
 */
export function redirectToRoleHome(
  permissions: string[],
  requestUrl?: string
): string {
  // 1. Check for explicit redirect parameter (user intent)
  if (requestUrl) {
    const url = new URL(requestUrl);
    const explicitRedirect = url.searchParams.get("redirect");
    if (explicitRedirect) {
      return explicitRedirect;
    }
  }

  // 2. Permission-based default — most specific roles first
  //    Operations is a superset of Pilot, so schedule:* must precede flight:manage-*
  //    Finance is a superset of Pilot (both have flight:view), so finance:view must precede flight:view
  if (permissions.includes("admin:access")) return "/admin";
  if (permissions.includes("schedule:create") || permissions.includes("schedule:edit") || permissions.includes("schedule:view")) return "/operations";
  if (permissions.includes("finance:view")) return "/finance";
  if (permissions.includes("flight:manage-manifest") || permissions.includes("flight:manage-seats")) return "/pilot";
  if (permissions.includes("checkin:process") || permissions.includes("checkin:view")) return "/checkin/counter";
  if (permissions.includes("maintenance:view")) return "/engineer";
  if (permissions.includes("flight:view")) return "/pilot";

  // 3. Fallback to home
  return "/bookings";
}
