import type {
  ActionFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useNavigation, useSearchParams , useRouteError, isRouteErrorResponse } from "@remix-run/react";


import { commitSession, getSession } from "../session.server";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import { hashPassword } from "../utils/password.server";

import Button from "../components/Button";
import TextField from "../components/TextField";

export const meta: MetaFunction = () => [{ title: "Sign Up - FIGAS" }];

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const name = formData.get("name");
  const email = formData.get("email");
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");

  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string" ||
    typeof confirmPassword !== "string"
  ) {
    return json(
      { error: "All fields are required.", fields: { name: "", email: "" } },
      { status: 400 }
    );
  }

  const trimmedName = name.trim();
  const trimmedEmail = email.toLowerCase().trim();

  if (!trimmedName) {
    return json(
      { error: "Name is required.", fields: { name: trimmedName, email: trimmedEmail } },
      { status: 400 }
    );
  }

  if (!trimmedEmail) {
    return json(
      { error: "Email is required.", fields: { name: trimmedName, email: trimmedEmail } },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return json(
      { error: "Password must be at least 8 characters.", fields: { name: trimmedName, email: trimmedEmail } },
      { status: 400 }
    );
  }

  if (password !== confirmPassword) {
    return json(
      { error: "Passwords do not match.", fields: { name: trimmedName, email: trimmedEmail } },
      { status: 400 }
    );
  }


  const existingUser = (await kdb.selectFrom("users").select("id").where("email", "=", trimmedEmail).execute())[0] ?? null;

  if (existingUser) {
    return json(
      { error: "An account with this email already exists.", fields: { name: trimmedName, email: trimmedEmail } },
      { status: 409 }
    );
  }

  // Hash password and create user
  const hashedPassword = await hashPassword(password);

  const user = (await kdb.insertInto("users").values({
    name: trimmedName,
    email: trimmedEmail,
    password: hashedPassword,
    role: "passenger",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any).returning(["id", "role"]).execute())[0];

  try {
    const role = await sql<{ id: number }>`SELECT id FROM roles WHERE name = 'passenger' LIMIT 1`.execute(kdb);
    if (role.rows.length > 0) {
      await sql`INSERT INTO user_roles (user_id, role_id) VALUES (${user.id}, ${role.rows[0].id}) ON CONFLICT DO NOTHING`.execute(kdb);
    }
  } catch {
    // Non-critical — user can still be assigned roles later via admin
  }

  // Create session and redirect
  const session = await getSession(request.headers.get("Cookie"));
  session.set("userId", String(user.id));

  return redirect("/bookings", {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
}

export default function SignUp() {
  const actionData = useActionData<{ error?: string; fields?: { name: string; email: string } }>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();

  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="w-full max-w-2xl px-8 py-10 space-y-8 bg-white dark:bg-slate-800 shadow-md dark:shadow-slate-900/30 rounded-xl lg:space-y-10 lg:px-10 lg:py-12 ">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 sm:text-3xl lg:text-4xl">
          Sign Up for FIGAS
        </h1>
        <p className="text-sm">
          Already have an account?{" "}
          <Link
            className="underline text-cyan-600 dark:text-cyan-400"
            to={{
              pathname: "/login",
              search: searchParams.toString(),
            }}
          >
            Sign in
          </Link>
        </p>
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
            id="name"
            name="name"
            label="Name"
            required
            type="text"
            placeholder="Name Surname"
            defaultValue={actionData?.fields?.name}
          />
          <TextField
            id="email"
            name="email"
            label="Email address"
            required
            type="email"
            placeholder="Email address"
            defaultValue={actionData?.fields?.email}
          />
          <TextField
            id="password"
            name="password"
            label="Password"
            required
            type="password"
            placeholder="password"
          />
          <TextField
            id="confirmPassword"
            name="confirmPassword"
            label="Confirm Password"
            required
            type="password"
            placeholder="confirm password"
          />
          <Button type="submit" className="w-full" loading={isSubmitting}>
            Sign Up
          </Button>
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
