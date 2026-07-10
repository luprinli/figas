import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link, useNavigation, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import DashboardCard from "../components/DashboardCard";
import Skeleton from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import { Building2 } from "lucide-react";

export const meta: MetaFunction = () => [{ title: "Pilot Dashboard - FIGAS" }];

export async function loader({ request }: LoaderFunctionArgs) {
    const user = await requirePermission(request, Permission.FLIGHT_VIEW);

    const today = new Date().toISOString().slice(0, 10);

    const pilotResult = await sql<{ id: number }>`
        SELECT id FROM pilots WHERE user_id = ${Number(user.id)} LIMIT 1
    `.execute(kdb);
    const pilotId = pilotResult.rows.length > 0 ? (pilotResult.rows[0] as { id: number }).id : 0;

    const [flightsResult, scheduleResult] = await Promise.all([
        sql<Record<string, unknown>>`
            SELECT f.id, f.flight_number, f.departure_time, f.arrival_time, f.status,
              ao.code AS origin_code, ad.code AS destination_code,
              a.registration AS aircraft_registration, a.type AS aircraft_type,
              COALESCE((SELECT COUNT(*) FROM booking_legs bl WHERE bl.flight_id = f.id), 0) AS passenger_count
       FROM flights f
       JOIN pilot_assignments pa ON pa.flight_id = f.id
       JOIN aerodromes ao ON ao.id = f.origin_aerodrome_id
       JOIN aerodromes ad ON ad.id = f.destination_aerodrome_id
       JOIN aircraft a ON a.id = f.aircraft_id
       WHERE pa.pilot_id = ${pilotId} AND f.departure_time::date = ${today}
       ORDER BY f.departure_time
        `.execute(kdb),
        sql<Record<string, unknown>>`
            SELECT s.id, s.schedule_date, s.status
       FROM schedules s
       JOIN pilot_assignments pa ON pa.schedule_id = s.id
       WHERE pa.pilot_id = ${pilotId} AND s.schedule_date >= ${today}
       ORDER BY s.schedule_date
       LIMIT 5
        `.execute(kdb),
    ]);

    return json({
        user,
        flights: flightsResult.rows,
        schedules: scheduleResult.rows,
        today,
    });
}

export default function PilotDashboard() {
    const { user, flights, schedules, today } = useLoaderData<typeof loader>();
    const navigation = useNavigation();
    const isLoading = navigation.state === "loading";

    if (isLoading) {
        return (
            <div className="p-6 space-y-6">
                <Skeleton className="h-8 w-48" />
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Skeleton className="h-28 rounded-lg" />
                    <Skeleton className="h-28 rounded-lg" />
                    <Skeleton className="h-28 rounded-lg" />
                    <Skeleton className="h-28 rounded-lg" />
                </div>
                <Skeleton className="h-48 rounded-lg" />
                <Skeleton className="h-32 rounded-lg" />
            </div>
        );
    }

    const activeSchedule = schedules.find((s) => s.status === "published");
    const nextFlight = (flights as Array<Record<string, unknown>>).find(
        (f) => f.status !== "completed" && f.status !== "cancelled"
    );

    return (
        <div className="p-6 space-y-5">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                    Welcome, {user.name}
                </h1>
                <span className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
                    {new Date(today).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </span>
            </div>

            {/* KPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <DashboardCard
                    label="Today's Flights"
                    value={flights.length}
                    color="blue"
                    icon={
                        <Building2 size={24} />
                    }
                />
                <DashboardCard
                    label="Active Schedule"
                    value={activeSchedule ? "Published" : "—"}
                    color="emerald"
                    to={activeSchedule ? `/pilot/schedule/${activeSchedule.id}` : undefined}
                />
                <DashboardCard
                    label="Next Flight"
                    value={nextFlight ? (nextFlight.departure_time as string).slice(11, 16) : "—"}
                    color={nextFlight ? "blue" : "purple"}
                />
                <DashboardCard
                    label="Upcoming Schedules"
                    value={schedules.length}
                    color="purple"
                />
            </div>

            {/* Today's Sorties */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
Today&rsquo;s Sorties
                    </h2>
                </div>
                {flights.length === 0 ? (
                    <div className="bg-white dark:bg-slate-800">
                        <EmptyState title="No flights assigned today" description="Check your schedule for upcoming assignments." />
                    </div>
                ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
                        {(flights as Array<Record<string, unknown>>).map((flight) => (
                            <div
                                key={flight.id as number}
                                className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 dark:hover:bg-slate-700/50 transition-colors"
                            >
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="text-center w-16 shrink-0">
                                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                                            {(flight.departure_time as string).slice(11, 16)}
                                        </p>
                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
                                            {(flight.arrival_time as string).slice(11, 16)}
                                        </p>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                            {flight.flight_number as string}
                                        </p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                            {flight.origin_code as string} → {flight.destination_code as string}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                                        {flight.aircraft_registration as string}
                                    </span>
                                    <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/30 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400 dark:text-blue-400">
                                        {flight.passenger_count as number ?? 0} pax
                                    </span>
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                                        flight.status === "scheduled" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" :
                                        flight.status === "boarding" ? "bg-amber-100 text-amber-800 dark:text-amber-400 dark:bg-amber-900/30 dark:text-amber-400" :
                                        flight.status === "in_progress" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" :
                                        flight.status === "completed" ? "bg-slate-100 text-slate-800 dark:text-slate-100 dark:bg-slate-700 dark:text-slate-300 dark:text-slate-500" :
                                        "bg-red-100 text-red-800 dark:text-red-400 dark:bg-red-900/30 dark:text-red-400"
                                    }`}>
                                        {(flight.status as string).replace("_", " ")}
                                    </span>
                                    <Link
                                        to={`/pilot/briefing/${flight.id}`}
                                        className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                    >
                                        Briefing
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Upcoming Schedule */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                        Upcoming Schedule
                    </h2>
                </div>
                {schedules.length === 0 ? (
                    <div className="bg-white dark:bg-slate-800">
                        <EmptyState title="No upcoming schedules" description="Your next assignments will appear here." />
                    </div>
                ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
                        {(schedules as Array<Record<string, unknown>>).map((s) => (
                            <div key={s.id as number} className="px-4 py-3 flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100 dark:text-slate-200">
                                        {new Date((s.schedule_date as string) ?? "").toLocaleDateString("en-GB", {
                                            weekday: "short", day: "numeric", month: "short",
                                        })}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                                        Status: {(s.status as string).replace("_", " ")}
                                    </p>
                                </div>
                                <Link
                                    to={`/operations/schedule/${s.id}`}
                                    className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400"
                                >
                                    View Schedule
                                </Link>
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
