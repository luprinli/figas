import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";

import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import MetricCard from "../components/MetricCard";
import EmptyState from "../components/EmptyState";
import { TourTrigger } from "../components/TourTrigger";
import { fuelerDashboardTour } from "../utils/tour/definitions/fueler-dashboard";
import { Clock, CheckCircle2, TrendingUp } from "lucide-react";

export const meta: MetaFunction = () => [{ title: "Fueler Dashboard - FIGAS" }];

export async function loader({ request }: LoaderFunctionArgs) {
    const user = await requirePermission(request, Permission.FLIGHT_FUEL_EXECUTE);

    let pendingOrders: Record<string, unknown>[] = [];
    let completedCount = 0;
    let totalKg = 0;

    try {
        const [pOrders, cToday, tLifted] = await Promise.all([
            sql<Record<string, unknown>>`
                SELECT fo.id, fo.flight_id, fo.status, fo.requested_fuel_kg,
                       f.flight_number,
                       COALESCE(a.registration, 'Unassigned') AS aircraft_registration,
                       fo.issued_at
                FROM fuel_orders fo
                JOIN flights f ON f.id = fo.flight_id
                LEFT JOIN aircraft a ON a.id = f.aircraft_id
                WHERE fo.status IN ('issued', 'fueling')
                ORDER BY fo.issued_at ASC
                LIMIT 20
            `.execute(kdb),
            sql<Record<string, unknown>>`
                SELECT COUNT(*)::int AS count
                FROM fuel_orders
                WHERE status = 'completed'
                  AND fueler_confirmed_at::date = CURRENT_DATE
            `.execute(kdb),
            sql<Record<string, unknown>>`
                SELECT COALESCE(SUM(fueler_actual_uplift_kg), 0) AS total_kg
                FROM fuel_orders
                WHERE status = 'completed'
                  AND fueler_confirmed_at::date = CURRENT_DATE
            `.execute(kdb),
        ]);
        pendingOrders = pOrders.rows;
        completedCount = Number((cToday.rows[0] as Record<string, unknown>)?.count ?? 0);
        totalKg = Number((tLifted.rows[0] as Record<string, unknown>)?.total_kg ?? 0);
    } catch {
        pendingOrders = [];
        completedCount = 0;
        totalKg = 0;
    }

    return json({
        user,
        pendingOrders,
        todayCompleted: completedCount,
        todayTotalKg: totalKg,
    });
}

export default function FuelerDashboard() {
    const { user, pendingOrders, todayCompleted, todayTotalKg } = useLoaderData<typeof loader>();

    return (
        <div className="p-6 space-y-5">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                    Welcome, {user.name}
                </h1>
                <TourTrigger config={fuelerDashboardTour} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <MetricCard
                    label="Pending Orders"
                    value={pendingOrders.length}
                    color="amber"
                    icon={<Clock size={24} />}
                />
                <MetricCard
                    label="Completed Today"
                    value={todayCompleted}
                    color="emerald"
                    icon={<CheckCircle2 size={24} />}
                />
                <MetricCard
                    label="Lifted Today"
                    value={`${todayTotalKg} kg`}
                    color="blue"
                    icon={<TrendingUp size={24} />}
                />
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Pending Fuel Orders</h2>
                    <Link to="/fueler/orders" className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400">View All</Link>
                </div>
                {pendingOrders.length === 0 ? (
                    <div className="bg-white dark:bg-slate-800">
                        <EmptyState title="No pending orders" description="All fuel orders have been completed." />
                    </div>
                ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
                        {(pendingOrders as Array<Record<string, unknown>>).map((o) => (
                            <div key={o.id as number} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                        {o.flight_number as string}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {o.aircraft_registration as string} · {o.requested_fuel_kg as number} kg
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                        o.status === "issued" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                                        "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                    }`}>
                                        {o.status as string}
                                    </span>
                                    <Link
                                        to={`/pilot/flight/${o.flight_id}/fuel`}
                                        className="rounded bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400"
                                    >
                                        Record Uplift
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
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-red-600">Something went wrong</h1>
        <p className="mt-2 text-gray-600">An unexpected error occurred. Please try again.</p>
      </div>
    </div>
  );
}
