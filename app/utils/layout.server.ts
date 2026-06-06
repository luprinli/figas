import type { MetaFunction } from "@remix-run/node";
import { requireAuth, getUserIdentity } from "../utils/auth.server";

export async function requireUser(request: Request) {
  const userId = await requireAuth(request);
  const identity = await getUserIdentity(userId);
  const userIdentity = identity
    ? { name: identity.name, email: identity.email }
    : null;
  return { userId, userIdentity };
}

export function createLayoutMeta(section: string): MetaFunction {
  return () => [{ title: `${section} - FIGAS` }];
}
