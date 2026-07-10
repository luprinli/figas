import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link , useRouteError, isRouteErrorResponse } from "@remix-run/react";

import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
    { title: `Schedule ${data?.schedule?.schedule_date ?? ""} - FIGAS` },
];

export async function loader({ request, params }: LoaderFunctionArgs) {
    await requirePermission(request, Permission.SCHEDULE_VIEW);

    const scheduleResult = await sql<{
        id: number; schedule_date: string; status: string; notes: string | null;
    }>`
        SELECT id, schedule_date, status, notes FROM schedules WHERE id = ${Number(params.scheduleId)}
    `.execute(kdb);

    if (scheduleResult.rows.length === 0) {
        throw new Response("Schedule not found", { status: 404 });
    }

    const schedule = scheduleResult.rows[0];

    const flightsResult = await sql<Record<string, unknown>>`
        SELECT f.id, f.flight_number, f.status,
       ao.code AS origin_code, ad.code AS destination_code,
       a.registration AS aircraft_registration
 FROM flights f
 JOIN aerodromes ao ON ao.id = f.origin_aerodrome_id
 JOIN aerodromes ad ON ad.id = f.destination_aerodrome_id
 LEFT JOIN aircraft a ON a.id = f.aircraft_id
 WHERE f.schedule_id = ${Number(params.scheduleId)}
 ORDER BY f.flight_number
    `.execute(kdb);

    // Build the true STY → … → STY route path from flight_legs (RULE 1).
    // The flight-level origin/destination aerodrome is STY↔STY for round-trip
    // sorties, so the human-readable path MUST come from the ordered legs.
    const legsResult = await sql<Record<string, unknown>>`
        SELECT flight_id, leg_number, origin_code, destination_code
 FROM flight_legs
 WHERE flight_id IN (SELECT id FROM flights WHERE schedule_id = ${Number(params.scheduleId)})
 ORDER BY flight_id, leg_number
    `.execute(kdb);
    const routeByFlight = new Map<number, string[]>();
    for (const row of legsResult.rows) {
        const fid = Number(row.flight_id);
        const codes = routeByFlight.get(fid) ?? [];
        if (codes.length === 0) codes.push(String(row.origin_code));
        codes.push(String(row.destination_code));
        routeByFlight.set(fid, codes);
    }
    const flightsWithRoute = flightsResult.rows.map((f) => {
        const codes = routeByFlight.get(Number(f.id)) ?? [];
        return {
            ...f,
            route: codes.length > 0 ? codes.join(" → ") : `${f.origin_code} → ${f.destination_code}`,
        };
    });

    return json({ schedule, flights: flightsWithRoute });
}

export default function ScheduleDetail() {
    const { schedule, flights } = useLoaderData<typeof loader>();

    return (
        <div className="space-y-6">
            <Link to="/operations/schedule" className="text-xs text-blue-600 hover:underline">
                ← Back to Schedule
            </Link>
            <div className="rounded-lg bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/20">
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                    Schedule — {schedule.schedule_date}
                </h2>
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400 mt-1 ring-1 ring-amber-300">
                    {schedule.status}
                </span>
                {schedule.notes && (
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">{schedule.notes}</p>
                )}
            </div>
            <div className="space-y-4">
                {flights.map((f: Record<string, unknown>) => (
                    <div key={f.id as number} className="rounded-lg bg-white dark:bg-slate-800 p-3 shadow-sm dark:shadow-slate-900/20 border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between">
                            <Link
                                to={`/ops/flight/${f.id}`}
                                className="font-medium text-blue-600 hover:underline"
                            >
                                {f.flight_number as string}
                            </Link>
                            <span className="text-sm font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">
                                {(f.route as string) ?? `${f.origin_code as string} → ${f.destination_code as string}`}
                            </span>
                            <span className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
                                {f.aircraft_registration as string ?? "Unassigned"}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
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
