import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, useNavigation , useRouteError, isRouteErrorResponse } from "@remix-run/react";

import { requirePermission } from "../utils/permissions.server";
import { Permission, PaymentTerms } from "../utils/constants";
import { requireUser } from "../utils/layout.server";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import PageHeader from "../components/PageHeader";
import Card from "../components/Card";
import Button from "../components/Button";

interface FinanceSettings {
  paymentTerms: string;
  defaultPaymentMethod: string;
  invoicePrefix: string;
  defaultTaxRate: number;
  creditEnabled: boolean;
  defaultCreditLimit: number;
  creditPeriodDays: number;
  reminderPaymentDue: boolean;
  reminderOverdue1d: boolean;
  reminderOverdue7d: boolean;
  reminderOverdue30d: boolean;
}

interface SettingsData {
  settings: FinanceSettings;
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  await requirePermission(request, Permission.FINANCE_VIEW);

  // Fetch settings from system_settings table
  const result = await sql<{ key: string; value: string }>`
    SELECT key, value FROM system_settings
  `.execute(kdb);

  const settingsMap = new Map<string, string>();
  for (const row of result.rows) {
    settingsMap.set(row.key, row.value);
  }

  const settings: FinanceSettings = {
    paymentTerms: settingsMap.get("payment_terms") ?? PaymentTerms.NET_30,
    defaultPaymentMethod: settingsMap.get("default_payment_method") ?? "bank_transfer",
    invoicePrefix: settingsMap.get("invoice_prefix") ?? "INV-",
    defaultTaxRate: parseFloat(settingsMap.get("default_tax_rate") ?? "0"),
    creditEnabled: settingsMap.get("credit_enabled") === "true",
    defaultCreditLimit: parseFloat(settingsMap.get("default_credit_limit") ?? "5000"),
    creditPeriodDays: parseInt(settingsMap.get("credit_period_days") ?? "30", 10),
    reminderPaymentDue: settingsMap.get("reminder_payment_due") === "true",
    reminderOverdue1d: settingsMap.get("reminder_overdue_1d") === "true",
    reminderOverdue7d: settingsMap.get("reminder_overdue_7d") === "true",
    reminderOverdue30d: settingsMap.get("reminder_overdue_30d") === "true",
  };

  return json<SettingsData>({ settings });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  await requirePermission(request, Permission.SETTINGS_EDIT);

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent !== "save-settings") {
    return json({ error: "Unknown intent" }, { status: 400 });
  }

  const paymentTerms = formData.get("paymentTerms") as string;
  const defaultPaymentMethod = formData.get("defaultPaymentMethod") as string;
  const invoicePrefix = formData.get("invoicePrefix") as string;
  const defaultTaxRate = parseFloat((formData.get("defaultTaxRate") as string) ?? "0");
  const creditEnabled = formData.get("creditEnabled") === "on";
  const defaultCreditLimit = parseFloat((formData.get("defaultCreditLimit") as string) ?? "5000");
  const creditPeriodDays = parseInt((formData.get("creditPeriodDays") as string) ?? "30", 10);
  const reminderPaymentDue = formData.get("reminderPaymentDue") === "on";
  const reminderOverdue1d = formData.get("reminderOverdue1d") === "on";
  const reminderOverdue7d = formData.get("reminderOverdue7d") === "on";
  const reminderOverdue30d = formData.get("reminderOverdue30d") === "on";

  if (!paymentTerms || !defaultPaymentMethod || !invoicePrefix) {
    return json({ error: "Missing required fields" }, { status: 400 });
  }

  // Upsert settings
  const settings: Array<{ key: string; value: string }> = [
    { key: "payment_terms", value: paymentTerms },
    { key: "default_payment_method", value: defaultPaymentMethod },
    { key: "invoice_prefix", value: invoicePrefix },
    { key: "default_tax_rate", value: String(defaultTaxRate) },
    { key: "credit_enabled", value: String(creditEnabled) },
    { key: "default_credit_limit", value: String(defaultCreditLimit) },
    { key: "credit_period_days", value: String(creditPeriodDays) },
    { key: "reminder_payment_due", value: String(reminderPaymentDue) },
    { key: "reminder_overdue_1d", value: String(reminderOverdue1d) },
    { key: "reminder_overdue_7d", value: String(reminderOverdue7d) },
    { key: "reminder_overdue_30d", value: String(reminderOverdue30d) },
  ];

  for (const setting of settings) {
    await sql`
      INSERT INTO system_settings (key, value, updated_at)
       VALUES (${setting.key}, ${setting.value}, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = ${setting.value}, updated_at = NOW()
    `.execute(kdb);
  }

  return redirect("/finance/settings");
}

const PAYMENT_TERMS_OPTIONS = [
  { value: "due_on_receipt", label: "Due on Receipt" },
  { value: "net_7", label: "Net 7" },
  { value: "net_15", label: "Net 15" },
  { value: "net_30", label: "Net 30" },
  { value: "pay_on_departure", label: "Pay on Departure" },
  { value: "pay_on_arrival", label: "Pay on Arrival" },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: "stripe", label: "Stripe" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "pay_on_departure", label: "Pay on Departure" },
  { value: "pay_on_arrival", label: "Pay on Arrival" },
  { value: "invoice", label: "Invoice" },
];

export default function FinanceSettings() {
  const data = useLoaderData<typeof loader>();
  const navigation = useNavigation();

  const isSaving = navigation.state === "submitting" && navigation.formData?.get("intent") === "save-settings";

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Finance Settings"
        description="Configure finance module preferences (Admin only)"
      />

      <Form method="post">
        <input type="hidden" name="intent" value="save-settings" />

        {/* General Settings */}
        <Card title="General Settings" className="mb-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="paymentTerms" className="block text-sm/5 font-medium text-slate-700 dark:text-slate-200 mb-1">
                Default Payment Terms
              </label>
              <select
                id="paymentTerms"
                name="paymentTerms"
                defaultValue={data.settings.paymentTerms}
                className="block w-full max-w-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm/5 text-slate-900 dark:text-slate-100 shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {PAYMENT_TERMS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="defaultPaymentMethod" className="block text-sm/5 font-medium text-slate-700 dark:text-slate-200 mb-1">
                Default Payment Method
              </label>
              <select
                id="defaultPaymentMethod"
                name="defaultPaymentMethod"
                defaultValue={data.settings.defaultPaymentMethod}
                className="block w-full max-w-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm/5 text-slate-900 dark:text-slate-100 shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {PAYMENT_METHOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="invoicePrefix" className="block text-sm/5 font-medium text-slate-700 dark:text-slate-200 mb-1">
                Invoice Number Prefix
              </label>
              <input
                id="invoicePrefix"
                name="invoicePrefix"
                type="text"
                defaultValue={data.settings.invoicePrefix}
                className="block w-full max-w-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm/5 text-slate-900 dark:text-slate-100 shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="defaultTaxRate" className="block text-sm/5 font-medium text-slate-700 dark:text-slate-200 mb-1">
                Default Tax Rate (%)
              </label>
              <input
                id="defaultTaxRate"
                name="defaultTaxRate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                defaultValue={data.settings.defaultTaxRate}
                className="block w-full max-w-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm/5 text-slate-900 dark:text-slate-100 shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </Card>

        {/* Reminder Schedule */}
        <Card title="Payment Reminder Schedule" className="mb-6">
          <div className="space-y-3">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                name="reminderPaymentDue"
                defaultChecked={data.settings.reminderPaymentDue}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm/5 text-slate-700 dark:text-slate-200">
                Send reminder when payment is due
              </span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                name="reminderOverdue1d"
                defaultChecked={data.settings.reminderOverdue1d}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm/5 text-slate-700 dark:text-slate-200">
                Send reminder 1 day after due date
              </span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                name="reminderOverdue7d"
                defaultChecked={data.settings.reminderOverdue7d}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm/5 text-slate-700 dark:text-slate-200">
                Send reminder 7 days after due date
              </span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                name="reminderOverdue30d"
                defaultChecked={data.settings.reminderOverdue30d}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm/5 text-slate-700 dark:text-slate-200">
                Send reminder 30 days after due date
              </span>
            </label>
          </div>
        </Card>

        {/* Credit Management */}
        <Card title="Credit Management" className="mb-6">
          <div className="space-y-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                name="creditEnabled"
                defaultChecked={data.settings.creditEnabled}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm/5 text-slate-700 dark:text-slate-200">
                Enable credit accounts for clients
              </span>
            </label>
            <div>
              <label htmlFor="defaultCreditLimit" className="block text-sm/5 font-medium text-slate-700 dark:text-slate-200 mb-1">
                Default Credit Limit (£)
              </label>
              <input
                id="defaultCreditLimit"
                name="defaultCreditLimit"
                type="number"
                step="100"
                min="0"
                defaultValue={data.settings.defaultCreditLimit}
                disabled={!data.settings.creditEnabled}
                className="block w-full max-w-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm/5 text-slate-900 dark:text-slate-100 shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>
            <div>
              <label htmlFor="creditPeriodDays" className="block text-sm/5 font-medium text-slate-700 dark:text-slate-200 mb-1">
                Credit Period (days)
              </label>
              <input
                id="creditPeriodDays"
                name="creditPeriodDays"
                type="number"
                step="1"
                min="0"
                max="365"
                defaultValue={data.settings.creditPeriodDays}
                disabled={!data.settings.creditEnabled}
                className="block w-full max-w-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm/5 text-slate-900 dark:text-slate-100 shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>
          </div>
        </Card>

        {/* Save Button */}
        <div className="flex items-center gap-3">
          <Button type="submit" loading={isSaving}>
            Save Settings
          </Button>
        </div>
      </Form>
    </div>
  );
}



export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-700 dark:bg-slate-900">
        <div className="mx-auto max-w-lg text-center px-4">
          <div className="mb-4 text-5xl font-bold text-slate-300 dark:text-slate-500 dark:text-slate-600 dark:text-slate-300 dark:text-slate-500">{error.status}</div>
          <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Something went wrong</h1>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">{error.statusText}</p>
          <button onClick={() => window.location.reload()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Try Again</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-700 dark:bg-slate-900">
      <div className="mx-auto max-w-lg text-center px-4">
        <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Unexpected Error</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">An unexpected error occurred. Please try again.</p>
        <button onClick={() => window.location.reload()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Try Again</button>
      </div>
    </div>
  );
}
