import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import DataGrid from "../components/DataGrid";
import type { Column } from "../components/DataTable";
import EmptyState from "../components/EmptyState";
import Card from "../components/Card";

export const meta: MetaFunction = () => [{ title: "Finance Bookings - FIGAS" }];

export async function loader({ request }: LoaderFunctionArgs) {
  await requirePermission(request, Permission.FINANCE_VIEW);

  const result = await sql<Record<string, unknown>>`
    SELECT b.*, u.name AS user_name
 FROM bookings b
 JOIN users u ON u.id = b.user_id
 ORDER BY b.created_at DESC
 LIMIT 200
  `.execute(kdb);

  return json({ bookings: result.rows });
}

export default function FinanceBookings() {
  const { bookings } = useLoaderData<typeof loader>();

  const columns: Column<Record<string, unknown>>[] = [
    { key: "booking_reference", header: "Reference", sortable: true },
    { key: "user_name", header: "Client", sortable: true },
    { key: "status", header: "Status", sortable: true },
    { key: "payment_status", header: "Payment", sortable: true },
    { key: "total_amount_gbp", header: "Total (GBP)", sortable: true },
    { key: "created_at", header: "Created", sortable: true },
  ];

  return (
    <div className="p-6 space-y-5">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Bookings</h1>
      <Card>
        <DataGrid
          columns={columns}
          data={bookings as Record<string, unknown>[]}
          keyExtractor={(r) => String(r.id)}
          enableSort
          enableFilters
          initialSortColumn="created_at"
          initialSortDirection="desc"
          emptyState={<EmptyState title="No bookings found" />}
        />
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
