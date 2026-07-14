import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link, useRouteError, isRouteErrorResponse } from "@remix-run/react";

import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import EmptyState from "../components/EmptyState";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
    { title: `Schedule ${data?.scheduleDate ?? ""} - FIGAS` },
];

export async function loader({ request, params }: LoaderFunctionArgs) {
    await requirePermission(request, Permission.FLIGHT_VIEW);

    const scheduleId = Number(params.scheduleId);

    const schedule = await sql<{ id: number; schedule_date: string; status: string; notes: string | null }>`
        SELECT id, schedule_date, status, notes FROM schedules WHERE id = ${scheduleId}
    `.execute(kdb);

    if (schedule.rows.length === 0) {
        throw new Response("Schedule not found", { status: 404 });
    }
    const s = schedule.rows[0];

    const flights = await sql<{
        id: number; flight_number: string; status: string;
        origin_code: string; destination_code: string;
        departure_time: string; arrival_time: string;
        aircraft_registration: string;
    }>`
        SELECT f.id, f.flight_number, f.status,
               ao.code AS origin_code, ad.code AS destination_code,
               f.departure_time, f.arrival_time,
               COALESCE(a.registration, 'Unassigned') AS aircraft_registration
        FROM flights f
        JOIN aerodromes ao ON ao.id = f.origin_aerodrome_id
        JOIN aerodromes ad ON ad.id = f.destination_aerodrome_id
        LEFT JOIN aircraft a ON a.id = f.aircraft_id
        WHERE f.schedule_id = ${scheduleId}
        ORDER BY f.sort_order ASC NULLS LAST, f.departure_time
    `.execute(kdb);

    return json({
        scheduleId: s.id,
        scheduleDate: s.schedule_date,
        scheduleStatus: s.status,
        notes: s.notes,
        flights: flights.rows,
    });
}

export default function PilotScheduleDetail() {
    const data = useLoaderData<typeof loader>();

    return (
        <div className="p-6 space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                        Schedule — {new Date(data.scheduleDate).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    </h1>
                    <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400 mt-1">
                        {data.scheduleStatus.replace("_", " ")}
                    </span>
                </div>
                <Link to="/pilot/schedule" className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400">
                    Back to My Schedule
                </Link>
            </div>

            {data.notes && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/10 p-4">
                    <p className="text-sm text-amber-700 dark:text-amber-300">{data.notes}</p>
                </div>
            )}

            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Flights</h2>
                </div>
                {data.flights.length === 0 ? (
                    <div className="bg-white dark:bg-slate-800">
                        <EmptyState title="No flights" description="No flights assigned to this schedule." />
                    </div>
                ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
                        {(data.flights as Array<Record<string, unknown>>).map((f) => (
                            <div key={f.id as number} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                        {f.flight_number as string}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {f.origin_code as string} → {f.destination_code as string} · {f.aircraft_registration as string}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                        f.status === "scheduled" ? "bg-blue-100 text-blue-700" :
                                        f.status === "completed" ? "bg-slate-100 text-slate-600" :
                                        "bg-amber-100 text-amber-700"
                                    }`}>
                                        {(f.status as string).replace("_", " ")}
                                    </span>
                                    <Link
                                        to={`/pilot/flight/${f.id}`}
                                        className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400"
                                    >
                                        View
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export function ErrorBoundary() {
    const error = useRouteError();
    if (isRouteErrorResponse(error)) {
        return <div className="flex min-h-screen items-center justify-center bg-slate-50"><div className="text-center"><div className="text-5xl font-bold text-slate-300">{error.status}</div><h1 className="text-xl font-semibold">Error</h1><button onClick={() => window.location.reload()} className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm text-white">Try Again</button></div></div>;
    }
    return <div className="flex min-h-screen items-center justify-center bg-slate-50"><div className="text-center"><h1 className="text-xl font-semibold">Error</h1><button onClick={() => window.location.reload()} className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm text-white">Try Again</button></div></div>;
}
