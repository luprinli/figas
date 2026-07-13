import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, useActionData, Link, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { requireAuth } from "../utils/auth.server";
import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { adminRepository } from "../utils/repositories/admin";

export const meta: MetaFunction = () => [{ title: "Settings - FIGAS" }];

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAuth(request);
  await requirePermission(request, Permission.SETTINGS_EDIT);

  const settings = await adminRepository.getSettings();

  return json({ settings });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAuth(request);
  await requirePermission(request, Permission.SETTINGS_EDIT);

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "update") {
    const settings: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      if (key !== "intent" && typeof value === "string") {
        settings[key] = value;
      }
    }

    try {
      await adminRepository.updateSettings(settings);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update settings";
      return json({ error: message }, { status: 400 });
    }
  }

  return redirect("/admin/settings");
}

const SETTING_METADATA: Record<
  string,
  { label: string; type: string; description: string }
> = {
  company_name: {
    label: "Company Name",
    type: "text",
    description: "The name of the airline company",
  },
  company_email: {
    label: "Company Email",
    type: "email",
    description: "Default email address for company communications",
  },
  company_phone: {
    label: "Company Phone",
    type: "text",
    description: "Contact phone number",
  },
  default_currency: {
    label: "Default Currency",
    type: "text",
    description: "Default currency for pricing (e.g. GBP)",
  },
  default_timezone: {
    label: "Default Timezone",
    type: "text",
    description: "Default timezone (e.g. Atlantic/Stanley)",
  },
  max_passengers_per_booking: {
    label: "Max Passengers Per Booking",
    type: "number",
    description: "Maximum number of passengers allowed per booking",
  },
  default_clothed_body_weight_kg: {
    label: "Default Body Weight (kg)",
    type: "number",
    description: "Default assumed clothed body weight per passenger",
  },
  bn2_mtow_kg: {
    label: "BN-2 MTOW (kg)",
    type: "number",
    description: "Maximum takeoff weight for BN-2 Islander aircraft",
  },
  bn2_max_payload_kg: {
    label: "BN-2 Max Payload (kg)",
    type: "number",
    description: "Maximum payload for BN-2 Islander aircraft",
  },
};

export default function Settings() {
  const { settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  // Determine which settings to show (only those with metadata, plus any custom ones)
  const knownKeys = Object.keys(SETTING_METADATA);
  const customKeys = Object.keys(settings).filter(
    (k) => !knownKeys.includes(k)
  );

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link
          to="/admin"
          className="text-blue-600 hover:underline text-sm"
        >
          â† Back to Dashboard
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-6">
        System Settings
      </h1>

      {actionData?.error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 text-red-700 dark:text-red-400 px-4 py-3 rounded text-sm mb-4">
          {actionData.error}
        </div>
      )}

      <Form method="post" className="space-y-4">
        <input type="hidden" name="intent" value="update" />

        {knownKeys.map((key) => {
          const meta = SETTING_METADATA[key];
          return (
            <div
              key={key}
              className="bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700 p-4"
            >
              <label
                htmlFor={`setting-${key}`}
                className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1"
              >
                {meta.label}
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{meta.description}</p>
              <input
                id={`setting-${key}`}
                type={meta.type}
                name={key}
                defaultValue={settings[key] ?? ""}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          );
        })}

        {/* Custom settings */}
        {customKeys.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700 p-4">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-3">
              Additional Settings
            </h2>
            {customKeys.map((key) => (
              <div key={key} className="mb-3">
                <label
                  htmlFor={`setting-${key}`}
                  className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
                >
                  {key.replace(/_/g, " ")}
                </label>
                <input
                  id={`setting-${key}`}
                  type="text"
                  name={key}
                  defaultValue={settings[key] ?? ""}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Save Settings
          </button>
        </div>
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