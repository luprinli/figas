import type {
  ActionFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useNavigation , useRouteError, isRouteErrorResponse } from "@remix-run/react";


import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";


import Button from "../components/Button";
import TextField from "../components/TextField";

export const meta: MetaFunction = () => [{ title: "Reset Password - FIGAS" }];

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const email = formData.get("email");

  if (typeof email !== "string" || !email.trim()) {
    return json(
      { error: "Email is required.", success: false },
      { status: 400 }
    );
  }

  const trimmedEmail = email.toLowerCase().trim();

  // Look up the user
  const result = await sql<{ id: number }>`
    SELECT id FROM users WHERE email = ${trimmedEmail}
  `.execute(kdb);

  const user = result.rows[0] ?? null;

  if (!user) {
    // Don't reveal whether the email exists for security
    return json(
      { error: null, success: true },
      { status: 200 }
    );
  }

  // Generate a reset token with 1-hour expiry (stored in DB for verification)
  const resetToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Store the reset token in the database
  await sql`
    UPDATE users SET reset_token = ${resetToken}, reset_token_expires_at = ${expiresAt}, updated_at = NOW() WHERE id = ${user.id}
  `.execute(kdb);

  // In production, send the reset link via email.
  // The reset link would be: https://figas.co/reset-password?token=${resetToken}
  // In production, you must configure an email provider (SendGrid/Mailgun) to send the reset token to the user's email
  // For development, log the token to the console so the developer can retrieve it (intentional for local dev only).
  if (process.env.NODE_ENV !== "production" && process.env.DEBUG_AUTH === "1") {
    console.log(`[DEV] Password reset token for ${trimmedEmail}: ${resetToken}`);
  }

  // Send password reset email (non-blocking)
  const resetLink = `${process.env.APP_URL ?? "https://figas.co"}/reset-password?token=${resetToken}`;
  import("../utils/email.server").then((m) =>
    m.sendEmailQuiet({
      to: trimmedEmail,
      subject: "Reset Your FIGAS Password",
      html: `<p>You requested a password reset.</p><p>Click <a href="${resetLink}">here</a> to reset your password. This link expires in 1 hour.</p><p>If you did not request this, please ignore this email.</p>`,
      text: `You requested a password reset.\n\nReset link: ${resetLink}\n\nThis link expires in 1 hour.\n\nIf you did not request this, please ignore this email.`,
      notificationType: "password_reset",
      recipientType: "user",
    })
  );

  return json(
    {
      error: null,
      success: true,
      // Never return the token in the response body Ã¢â‚¬â€ it's logged server-side for dev
    },
    { status: 200 }
  );
}

export default function ResetPassword() {
  const actionData = useActionData<{
    error?: string | null;
    success?: boolean;
  }>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="w-full max-w-2xl px-8 py-10 space-y-8 bg-white dark:bg-slate-800 shadow-md dark:shadow-slate-900/30 rounded-xl lg:space-y-10 lg:px-10 lg:py-12 ">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 sm:text-3xl lg:text-4xl">
        Forgot your password?
      </h1>

      {actionData?.success ? (
        <div className="p-4 rounded-md bg-green-50">
          <p className="text-sm text-green-800">
            If an account with that email exists, a password reset link has been sent.
          </p>
        </div>
      ) : (
        <Form method="POST" className="w-full space-y-4 lg:space-y-6">
          {actionData?.error && (
            <p className="p-3 text-sm rounded-md bg-rose-50 dark:bg-rose-900/30 text-rose-700">
              {actionData.error}
            </p>
          )}
          <fieldset disabled={isSubmitting} className="space-y-4 lg:space-y-6">
            <TextField
              id="email"
              name="email"
              label="Email address"
              required
              type="email"
              placeholder="Email address"
            />
            <Button type="submit" className="w-full" loading={isSubmitting}>
              Reset Password
            </Button>
          </fieldset>
        </Form>
      )}
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
