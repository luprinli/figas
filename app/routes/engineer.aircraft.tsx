import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData , useRouteError, isRouteErrorResponse } from "@remix-run/react";

import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import DataGrid from "../components/DataGrid";
import type { Column } from "../components/DataTable";
import EmptyState from "../components/EmptyState";
import Card from "../components/Card";

export const meta: MetaFunction = () => [{ title: "Aircraft Fleet - FIGAS" }];

export async function loader({ request }: LoaderFunctionArgs) {
    const user = await requirePermission(request, Permission.MAINTENANCE_VIEW);

    const aircraft = await sql<Record<string, unknown>>`
        SELECT id, registration, type, is_active,
       COALESCE((SELECT SUM(SPLIT_PART(total_hours, ':', 1)::int) FROM airframe_hours WHERE aircraft_id = a.id), 0)::int4 AS total_hours
 FROM aircraft a
 ORDER BY registration
    `.execute(kdb);

    return json({ user, aircraft: aircraft.rows });
}

export default function EngineerAircraft() {
    const { aircraft } = useLoaderData<typeof loader>();

    const columns: Column<Record<string, unknown>>[] = [
        { key: "registration", header: "Registration", sortable: true },
        { key: "type", header: "Type", sortable: true },
        { key: "total_hours", header: "Total Hours", sortable: true },
        { key: "is_active", header: "Active", sortable: true },
    ];

    return (
        <div className="p-6 space-y-5">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Aircraft Fleet</h1>
            <Card>
            <DataGrid
                columns={columns}
                data={aircraft as Record<string, unknown>[]}
                keyExtractor={(item) => String(item.id)}
                enableSort
                enableFilters
                initialSortColumn="registration"
                emptyState={<EmptyState title="No aircraft in the fleet." />}
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
