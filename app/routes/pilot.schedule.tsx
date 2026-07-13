import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData , useRouteError, isRouteErrorResponse } from "@remix-run/react";

import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import DataTable from "../components/DataTable";
import type { Column } from "../components/DataTable";
import EmptyState from "../components/EmptyState";

export const meta: MetaFunction = () => [{ title: "My Schedule - FIGAS" }];

export async function loader({ request }: LoaderFunctionArgs) {
    const user = await requirePermission(request, Permission.FLIGHT_VIEW);

    const pilotResult = await sql<{ id: number }>`
        SELECT id FROM pilots WHERE user_id = ${Number(user.id)} LIMIT 1
    `.execute(kdb);
    const pilotId = pilotResult.rows.length > 0 ? (pilotResult.rows[0] as { id: number }).id : 0;

    const schedules = await sql<Record<string, unknown>>`
        SELECT s.id, s.schedule_date, s.status
     FROM schedules s
     JOIN pilot_assignments pa ON pa.schedule_id = s.id
     WHERE pa.pilot_id = ${pilotId}
     ORDER BY s.schedule_date DESC
     LIMIT 50
    `.execute(kdb);

    return json({ user, schedules: schedules.rows });
}

export default function PilotSchedule() {
    const { schedules } = useLoaderData<typeof loader>();

    const columns: Column<Record<string, unknown>>[] = [
        { key: "schedule_date", header: "Date", sortable: true },
        { key: "status", header: "Status", sortable: true },
    ];

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">My Schedule</h2>
            <DataTable
                columns={columns}
                data={schedules as Record<string, unknown>[]}
                keyExtractor={(item) => String(item.id)}
                emptyState={<EmptyState title="No upcoming schedules." />}
            />
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
