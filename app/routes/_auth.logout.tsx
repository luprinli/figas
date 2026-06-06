import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

import { destroySession, getSession } from "../session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  console.log("[LOGOUT loader] GET request to /logout — redirecting to /login");
  const session = await getSession(request.headers.get("Cookie"));
  return redirect("/login", {
    headers: {
      "Set-Cookie": await destroySession(session),
    },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  console.log("[LOGOUT action] POST request to /logout — destroying session");
  const session = await getSession(request.headers.get("Cookie"));
  const sessionId = session.id;
  console.log("[LOGOUT action] Session ID:", sessionId);
  const cookieHeader = await destroySession(session);
  console.log("[LOGOUT action] Destroy cookie header:", cookieHeader);
  return redirect("/login", {
    headers: {
      "Set-Cookie": cookieHeader,
    },
  });
}
