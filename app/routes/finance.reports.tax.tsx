import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import PageHeader from "../components/PageHeader";
import DataTable from "../components/DataTable";
import type { Column } from "../components/DataTable";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";

export async function loader({ request }: LoaderFunctionArgs) {
  await requirePermission(request, Permission.FINANCE_VIEW);
  const result = await sql<Record<string, unknown>>`
    SELECT i.id, i.issue_date, i.total_gbp, i.tax_amount_gbp, b.booking_reference
     FROM invoices i LEFT JOIN bookings b ON b.id = i.booking_id
     WHERE i.tax_amount_gbp IS NOT NULL AND i.tax_amount_gbp > 0
     ORDER BY i.issue_date DESC LIMIT 100
  `.execute(kdb);
  return json({ invoices: result.rows });
}

export default function TaxReport() {
  const { invoices } = useLoaderData<typeof loader>();
  const data = invoices as Array<Record<string, unknown>>;
  const columns: Column<Record<string, unknown>>[] = [
    { key: "booking_reference", header: "Booking", sortable: true },
    { key: "issue_date", header: "Issue Date", sortable: true },
    { key: "total_gbp", header: "Total", sortable: true, render: (r) => `£${Number(r.total_gbp).toLocaleString()}` },
    { key: "tax_amount_gbp", header: "Tax", sortable: true, render: (r) => `£${Number(r.tax_amount_gbp).toLocaleString()}` },
  ];
  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Tax Report" description="Invoices with tax amounts" />
      <Card>
        <DataTable columns={columns} data={data} keyExtractor={(r) => String(r.id)} emptyState={<EmptyState title="No tax invoices found" />} />
      </Card>
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
