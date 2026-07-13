import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requireAuth } from "../utils/auth.server";
import { hasPermission } from "../utils/permissions.server";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import { searchPassengers } from "../utils/services/passenger-search.service";
import type { SearchScope } from "../utils/services/passenger-search.types";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireAuth(request);
  const userId = Number(user);
  const url = new URL(request.url);

  const q = url.searchParams.get("q")?.trim() ?? "";
  const scope = (url.searchParams.get("scope") ?? "auto") as SearchScope;
  const dob = url.searchParams.get("dob") ?? undefined;

  if (q.length < 2) return json({ results: [] });

  // Security: only admins can use "global" scope
  if (scope === "global") {
    const isAdmin = await hasPermission(userId, "admin:access");
    if (!isAdmin) {
      return json({ error: "Insufficient permissions for global search" }, { status: 403 });
    }
  }

  // Fetch organization ID if this user belongs to one
  let organizationId: number | undefined;
  const orgResult = await sql<{ organization_id: number }>`
    SELECT uo.organization_id FROM user_organizations uo WHERE uo.user_id = ${userId} LIMIT 1
  `.execute(kdb);
  if (orgResult.rows.length > 0) {
    organizationId = Number((orgResult.rows[0] as { organization_id: number }).organization_id);
  }

  const results = await searchPassengers({
    query: q,
    bookerUserId: userId,
    organizationId,
    scope,
    dateOfBirth: dob,
  });

  return json({ results });
}
