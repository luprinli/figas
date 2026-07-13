import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useNavigation , useRouteError, isRouteErrorResponse } from "@remix-run/react";


import { commitSession, getSession } from "../session.server";
import { getUserIdentity, redirectToRoleHome } from "../utils/auth.server";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import { verifyPassword } from "../utils/password.server";

import Button from "../components/Button";
import TextField from "../components/TextField";

export const meta: MetaFunction = () => [{ title: "Sign In - FIGAS" }];

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  const userId = session.get("userId");

  if (userId) {
    // Fetch user identity with PBAC permissions for redirect
    const identity = await getUserIdentity(userId);
    const permissions = identity?.permissions ?? [];
    return redirect(redirectToRoleHome(permissions, request.url));
  }

  return json({});
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string") {
    return json(
      { error: "Email and password must be provided." },
      { status: 400 }
    );
  }

  if (!email.trim() || !password.trim()) {
    return json(
      { error: "Email and password are required." },
      { status: 400 }
    );
  }

  const result = await sql<{ id: number; email: string; name: string; password: string; role: string }>`
    SELECT id, email, name, password, role FROM users WHERE email = ${email.toLowerCase().trim()}
  `.execute(kdb);

  const user = result.rows[0] ?? null;

  if (!user) {
    return json({ error: "Invalid credentials" }, { status: 401 });
  }

  const isValid = await verifyPassword(password, user.password);
  if (!isValid) {
    return json({ error: "Invalid credentials" }, { status: 401 });
  }

  const session = await getSession(request.headers.get("Cookie"));
  session.set("userId", String(user.id));

  // Fetch permissions for PBAC-based redirect
  const identity = await getUserIdentity(user.id);
  const permissions = identity?.permissions ?? [];

  const redirectTo = redirectToRoleHome(permissions, request.url);

  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
}

export default function LogIn() {
  const actionData = useActionData<{ error?: string }>();
  const navigation = useNavigation();

  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="w-full max-w-2xl px-8 py-10 space-y-8 bg-white dark:bg-slate-800 shadow-md dark:shadow-slate-900/30 rounded-xl lg:space-y-10 lg:px-10 lg:py-12 ">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 sm:text-3xl lg:text-4xl">
          Log In to FIGAS
        </h1>
        {process.env.NODE_ENV !== "production" && (
          <div className="flex gap-3 p-3 rounded-md bg-cyan-50 dark:bg-cyan-900/30">
            <div className="flex items-center justify-center w-5 h-5 font-serif italic text-white rounded-full bg-cyan-500">
              i
            </div>
            <div className="text-xs">
              <p>
                Email: <span className="font-medium">demo@example.com</span>
              </p>
              <p>
                Password: <span className="font-medium">demo123</span>
              </p>
            </div>
          </div>
        )}
      </div>
      <Form method="POST">
        {actionData?.error && (
          <p className="p-3 mb-4 text-sm rounded-md bg-rose-50 dark:bg-rose-900/30 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 dark:text-rose-400">
            {actionData.error}
          </p>
        )}
        <fieldset
          className="w-full space-y-4 lg:space-y-6 disabled:opacity-70"
          disabled={isSubmitting}
        >
          <TextField
            id="email"
            name="email"
            label="Email address"
            required
            type="email"
            placeholder="Email address"
          />
          <TextField
            id="password"
            name="password"
            label="Password"
            required
            type="password"
            placeholder="password"
          />
          <Link
            to="/reset-password"
            className="block text-sm tracking-wide underline text-cyan-600 dark:text-cyan-400"
          >
            Forgot password?
          </Link>
          <Button type="submit" className="w-full" loading={isSubmitting}>
            Login
          </Button>
          <p className="text-sm text-center">
            New to FIGAS?{" "}
            <Link className="underline text-cyan-600 dark:text-cyan-400" to="/signup">
              Create an account
            </Link>
          </p>
        </fieldset>
      </Form>
    </div>
  );
}



export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="mx-auto max-w-lg text-center px-4">
          <div className="mb-4 text-5xl font-bold text-slate-300 dark:text-slate-600">{error.status}</div>
          <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Something went wrong</h1>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">{error.statusText}</p>
          <button onClick={() => window.location.reload()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">Try Again</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="mx-auto max-w-lg text-center px-4">
        <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Unexpected Error</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">An unexpected error occurred. Please try again.</p>
        <button onClick={() => window.location.reload()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">Try Again</button>
      </div>
    </div>
  );
}
