import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData , useRouteError, isRouteErrorResponse } from "@remix-run/react";

import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { db } from "../utils/db.server";
import DataTable from "../components/DataTable";
import type { Column } from "../components/DataTable";
import EmptyState from "../components/EmptyState";

export const meta: MetaFunction = () => [{ title: "My Flights - FIGAS" }];

export async function loader({ request }: LoaderFunctionArgs) {
    const user = await requirePermission(request, Permission.FLIGHT_VIEW);

    const pilot = await db.$queryRawUnsafe<{ id: number }[]>(
        `SELECT id FROM pilots WHERE user_id = $1 LIMIT 1`, Number(user.id)
    );
    const pilotId = pilot.length > 0 ? pilot[0].id : 0;

    const flights = await db.query(
        `SELECT f.id, f.flight_number, f.departure_time, f.arrival_time, f.status,
            ao.code AS origin_code, ad.code AS destination_code,
            a.registration AS aircraft_registration
     FROM flights f
     JOIN pilot_assignments pa ON pa.flight_id = f.id
     JOIN aerodromes ao ON ao.id = f.origin_aerodrome_id
     JOIN aerodromes ad ON ad.id = f.destination_aerodrome_id
     JOIN aircraft a ON a.id = f.aircraft_id
     WHERE pa.pilot_id = $1
     ORDER BY f.departure_time DESC
     LIMIT 50`,
        [pilotId]
    );

    return json({ user, flights: flights.rows });
}

export default function PilotFlights() {
    const { flights } = useLoaderData<typeof loader>();

    const columns: Column<Record<string, unknown>>[] = [
        { key: "flight_number", header: "Flight", sortable: true },
        { key: "origin_code", header: "From", sortable: true },
        { key: "destination_code", header: "To", sortable: true },
        { key: "departure_time", header: "Departure", sortable: true },
        { key: "arrival_time", header: "Arrival", sortable: true },
        { key: "aircraft_registration", header: "Aircraft", sortable: true },
        { key: "status", header: "Status", sortable: true },
    ];

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">My Flights</h2>
            <DataTable
                columns={columns}
                data={flights as Record<string, unknown>[]}
                keyExtractor={(item) => String(item.id)}
                emptyState={<EmptyState title="No flights assigned to you." />}
            />
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