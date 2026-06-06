import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { getUserId, getUserIdentity, redirectToRoleHome } from "../utils/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await getUserId(request);

  if (!userId) {
    // Not authenticated — redirect to login
    return redirect("/login");
  }

  // Authenticated — redirect to permission-based home
  const identity = await getUserIdentity(userId);
  const permissions = identity?.permissions ?? [];

  return redirect(redirectToRoleHome(permissions, request.url));
}
