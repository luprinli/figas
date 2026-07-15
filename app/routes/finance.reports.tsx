import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { requireUser } from "../utils/layout.server";
import { useRouteError, isRouteErrorResponse } from "@remix-run/react";
import PageHeader from "../components/PageHeader";
import Card from "../components/Card";
import Button from "../components/Button";
import { TourTrigger } from "../components/TourTrigger";
import { financeReportsTour } from "../utils/tour/definitions/finance-reports";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  await requirePermission(request, Permission.FINANCE_VIEW);
  return json({});
}

const reportCards = [
  {
    title: "Daily Sales Report",
    description: "View daily sales totals with debit and credit breakdowns. Filter by date range.",
    to: "/finance/reports/daily-sales",
  },
  {
    title: "Aging Report",
    description: "View aging receivables summary grouped by aging buckets (0-30, 31-60, 61-90, 90+ days).",
    to: "/finance/reports/aging",
  },
  {
    title: "Payment Summary",
    description: "View payment summaries grouped by method and status over a date range.",
    to: "/finance/reports/payment-summary",
  },
  {
    title: "Tax Report",
    description: "View tax-related financial data for reporting purposes.",
    to: "/finance/reports/tax",
  },
];

export default function FinanceReports() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Finance Reports"
        description="Select a report to generate"
      />
      <div className="flex justify-end">
        <TourTrigger config={financeReportsTour} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2" data-tour="finance-reports-grid">
        {reportCards.map((report) => (
          <Card key={report.to} title={report.title}>
            <p className="text-sm/5 text-slate-500 dark:text-slate-400 mb-4">{report.description}</p>
            <Button to={report.to}>Generate</Button>
          </Card>
        ))}
      </div>
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