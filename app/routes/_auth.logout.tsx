import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

import { destroySession, getSession } from "../session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  return redirect("/login", {
    headers: {
      "Set-Cookie": await destroySession(session),
    },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  return redirect("/login", {
    headers: {
      "Set-Cookie": await destroySession(session),
    },
  });
}
