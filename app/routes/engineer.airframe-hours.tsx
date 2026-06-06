import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { db } from "../utils/db.server";
import DataGrid from "../components/DataGrid";
import type { Column } from "../components/DataTable";
import EmptyState from "../components/EmptyState";
import Card from "../components/Card";

export const meta: MetaFunction = () => [{ title: "Airframe Hours - FIGAS" }];

export async function loader({ request }: LoaderFunctionArgs) {
    const user = await requirePermission(request, Permission.MAINTENANCE_VIEW);

    const entries = await db.query(
        `SELECT ah.id, ah.aircraft_id, SPLIT_PART(ah.total_hours, ':', 1)::int::int4 AS total_hours, ah.last_reading_date AS recorded_at,
       a.registration
 FROM airframe_hours ah
 JOIN aircraft a ON a.id = ah.aircraft_id
  ORDER BY ah.last_reading_date DESC
 LIMIT 100`
    );

    return json({ user, entries: entries.rows });
}

export default function EngineerAirframeHours() {
    const { entries } = useLoaderData<typeof loader>();

    const columns: Column<Record<string, unknown>>[] = [
        { key: "registration", header: "Aircraft", sortable: true },
        { key: "total_hours", header: "Hours", sortable: true },
        { key: "recorded_at", header: "Recorded", sortable: true },
    ];

    return (
        <div className="p-6 space-y-5">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Airframe Hours</h1>
            <Card>
            <DataGrid
                columns={columns}
                data={entries as Record<string, unknown>[]}
                keyExtractor={(item) => String(item.id)}
                enableSort
                enableFilters
                initialSortColumn="recorded_at"
                initialSortDirection="desc"
                emptyState={<EmptyState title="No airframe hours recorded." />}
            />
            </Card>
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