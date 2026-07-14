import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link, useNavigation, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import MetricCard from "../components/MetricCard";
import ProgressBar from "../components/ProgressBar";
import Skeleton from "../components/Skeleton";
import { TourTrigger } from "../components/TourTrigger";
import { engineerDashboardTour } from "../utils/tour/definitions/engineer-dashboard";
import EmptyState from "../components/EmptyState";

export const meta: MetaFunction = () => [{ title: "Engineer Dashboard - FIGAS" }];

const SERVICE_INTERVAL_HOURS = 2500;

export async function loader({ request }: LoaderFunctionArgs) {
    const user = await requirePermission(request, Permission.MAINTENANCE_VIEW);

    const [aircraftResult, airframeHoursResult, openDefectsResult] = await Promise.all([
        sql<Record<string, unknown>>`
            SELECT id, registration, type, is_active,
              COALESCE((SELECT SUM(SPLIT_PART(total_hours, ':', 1)::int) FROM airframe_hours WHERE aircraft_id = a.id), 0)::int4 AS total_hours,
              COALESCE((SELECT last_reading_date FROM airframe_hours WHERE aircraft_id = a.id ORDER BY last_reading_date DESC LIMIT 1), NULL) AS last_recorded
       FROM aircraft a
       ORDER BY registration
        `.execute(kdb),
        sql<Record<string, unknown>>`
            SELECT ah.id, ah.aircraft_id, SPLIT_PART(ah.total_hours, ':', 1)::int::int4 AS total_hours, ah.last_reading_date AS recorded_at,
              a.registration
       FROM airframe_hours ah
       JOIN aircraft a ON a.id = ah.aircraft_id
        ORDER BY ah.last_reading_date DESC
        LIMIT 10
        `.execute(kdb),
        // Open defect count
        sql<{ aircraft_id: number; open_defects: number }>`
            SELECT aircraft_id, COUNT(*)::int AS open_defects
             FROM defects WHERE deferral_status != 'closed'
             GROUP BY aircraft_id
        `.execute(kdb),
    ]);

    return json({
        user,
        aircraft: aircraftResult.rows,
        airframeHours: airframeHoursResult.rows,
        openDefects: openDefectsResult.rows,
    });
}

export default function EngineerDashboard() {
    const { user, aircraft, airframeHours, openDefects } = useLoaderData<typeof loader>();
    const navigation = useNavigation();
    const isLoading = navigation.state === "loading";

    const defectMap = new Map(openDefects.map((d) => [d.aircraft_id, d.open_defects]));

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
                <Skeleton className="h-64 rounded-lg" />
                <Skeleton className="h-32 rounded-lg" />
            </div>
        );
    }

    const activeAircraft = aircraft.filter((a) => a.is_active === true).length;
    const totalHours = aircraft.reduce((sum, a) => sum + Number(a.total_hours ?? 0), 0);
    const dueForService = aircraft.filter(
        (a) => a.is_active === true && Number(a.total_hours ?? 0) / SERVICE_INTERVAL_HOURS > 0.75
    ).length;

    return (
        <div className="p-6 space-y-5">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                    Welcome, {user.name}
                </h1>
                <TourTrigger config={engineerDashboardTour} />
                <Link
                    to="/engineer/aircraft"
                    className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400"
                >
                    View Fleet \u2192
                </Link>
            </div>

            {/* KPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                    label="Active Aircraft"
                    value={`${activeAircraft}/${aircraft.length}`}
                    color="emerald"
                />
                <MetricCard
                    label="Due for Service"
                    value={dueForService}
                    color={dueForService > 0 ? "amber" : "emerald"}
                    to={dueForService > 0 ? undefined : undefined}
                />
                <MetricCard
                    label="Total Fleet Hours"
                    value={totalHours.toLocaleString()}
                    color="blue"
                />
                <MetricCard
                    label="Airframe Records"
                    value={airframeHours.length}
                    color="purple"
                />
            </div>

            {/* Fleet Status */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                        Fleet Status
                    </h2>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 space-y-3">
                    {aircraft.length === 0 ? (
                        <EmptyState title="No aircraft in fleet" description="Add aircraft to begin tracking." />
                    ) : (
                        (aircraft as Array<Record<string, unknown>>).map((ac) => {
                            const hours = Number(ac.total_hours ?? 0);
                            const isActive = ac.is_active === true;
                            return (
                                <ProgressBar
                                    key={ac.id as number}
                                    label={`${ac.registration as string}`}
                                    subtitle={`${ac.type as string}${isActive ? "" : " — Inactive"}${defectMap.has(ac.id as number) ? ` Ã‚· ${defectMap.get(ac.id as number)} open defect${defectMap.get(ac.id as number)! > 1 ? 's' : ''}` : ''}`}
                                    current={hours}
                                    max={SERVICE_INTERVAL_HOURS}
                                    onClick={isActive ? () => {
                                        window.location.href = `/engineer/aircraft`;
                                    } : undefined}
                                />
                            );
                        })
                    )}
                </div>
            </div>

            {/* Recent Airframe Hours */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                        Recent Airframe Hours
                    </h2>
                </div>
                {airframeHours.length === 0 ? (
                    <div className="bg-white dark:bg-slate-800">
                        <EmptyState title="No airframe hour records found." />
                    </div>
                ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
                        {(airframeHours as Array<Record<string, unknown>>).map((record) => (
                            <div key={record.id as number} className="px-4 py-3 flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100 dark:text-slate-200">
                                        {record.registration as string}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {new Date(record.recorded_at as string).toLocaleDateString("en-GB")}
                                    </p>
                                </div>
                                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 dark:text-slate-300 tabular-nums">
                                    {Number(record.total_hours ?? 0).toLocaleString()} hrs
                                </span>
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
