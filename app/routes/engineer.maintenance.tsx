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

export const meta: MetaFunction = () => [{ title: "Maintenance Log - FIGAS" }];

export async function loader({ request }: LoaderFunctionArgs) {
    await requirePermission(request, Permission.MAINTENANCE_VIEW);

    const records = await db.query(
        `SELECT ah.id, ah.aircraft_id, SPLIT_PART(ah.total_hours, ':', 1)::int::int4 AS total_hours,
       ah.last_reading_date, ah.next_check_date, ah.next_check_type,
       a.registration, a.type
 FROM airframe_hours ah
 JOIN aircraft a ON a.id = ah.aircraft_id
 ORDER BY ah.last_reading_date DESC
 LIMIT 100`
    );

    return json({ records: records.rows });
}

export default function EngineerMaintenance() {
    const { records } = useLoaderData<typeof loader>();
    const data = records as Array<Record<string, unknown>>;

    const columns: Column<Record<string, unknown>>[] = [
        { key: "registration", header: "Aircraft", sortable: true },
        { key: "type", header: "Type" },
        { key: "total_hours", header: "Hours", sortable: true, render: (r) => (
            <span className="tabular-nums font-medium">{Number(r.total_hours).toLocaleString()}</span>
        )},
        { key: "last_reading_date", header: "Last Check", sortable: true, render: (r) => (
            <span>{r.last_reading_date ? new Date(String(r.last_reading_date)).toLocaleDateString() : "—"}</span>
        )},
        { key: "next_check_date", header: "Next Due", sortable: true, render: (r) => {
            const nextDate = r.next_check_date ? new Date(String(r.next_check_date)) : null;
            const now = new Date();
            const isOverdue = nextDate && nextDate < now;
            return (
                <span className={isOverdue ? "text-red-600 dark:text-red-400 font-medium" : "text-slate-600 dark:text-slate-300"}>
                    {nextDate ? nextDate.toLocaleDateString() : "—"}
                </span>
            );
        }},
        { key: "next_check_type", header: "Check Type", sortable: true },
    ];

    return (
        <div className="p-6 space-y-5">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Maintenance Log</h1>
            {data.length === 0 ? (
                <EmptyState title="No maintenance records found" description="Airframe hour records will appear here after flights are logged." />
            ) : (
                <Card>
                    <DataGrid
                        columns={columns}
                        data={data}
                        keyExtractor={(item) => String(item.id)}
                        enableSort
                        enableFilters
                        initialSortColumn="last_reading_date"
                        initialSortDirection="desc"
                        emptyState={<EmptyState title="No maintenance records found" />}
                    />
                </Card>
            )}
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
