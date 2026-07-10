import type { LoaderFunctionArgs } from "@remix-run/node";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import { json } from "@remix-run/node";
import { useLoaderData, Link, useNavigation, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import DashboardCard from "../components/DashboardCard";
import AlertStrip from "../components/AlertStrip";
import type { AlertItem } from "../components/AlertStrip";
import Sparkline from "../components/Sparkline";
import DataTable from "../components/DataTable";
import type { Column } from "../components/DataTable";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";

export async function loader({ request }: LoaderFunctionArgs) {
    const user = await requirePermission(request, Permission.FINANCE_VIEW);

    const [revenueResult, outstandingResult, pendingInvoiceResult, overdueResult, recentPayments, agingResult, monthlyResult,
        opsSchedule, opsBookings, opsFlights, opsManifests] = await Promise.all([
        sql<{ total: string }>`SELECT COALESCE(SUM(p.amount_gbp), 0) as total FROM payments p WHERE p.status = 'succeeded'`.execute(kdb),
        sql<{ total: string }>`SELECT COALESCE(SUM(i.total_gbp - COALESCE((SELECT SUM(p.amount_gbp) FROM payments p WHERE p.booking_id = i.booking_id AND p.status = 'succeeded'), 0)), 0) as total FROM invoices i WHERE i.status = 'issued'`.execute(kdb),
        sql<{ cnt: string }>`SELECT COUNT(*) as cnt FROM invoices WHERE status = 'issued'`.execute(kdb),
        sql<{ cnt: string }>`SELECT COUNT(*) as cnt FROM invoices WHERE status = 'overdue'`.execute(kdb),
        sql<Record<string, unknown>>`
            SELECT p.id, p.amount_gbp, p.status, p.created_at, p.payment_method,
       COALESCE(b.booking_reference, '—') AS booking_reference
 FROM payments p
  LEFT JOIN invoices i ON i.booking_id = p.booking_id
 LEFT JOIN bookings b ON b.id = i.booking_id
 ORDER BY p.created_at DESC
 LIMIT 10
        `.execute(kdb),
        sql<{ overdue: string; due_30: string; due_60: string; due_90: string }>`
            SELECT
       COALESCE(SUM(CASE WHEN i.due_date < NOW() AND i.status = 'issued' THEN i.total_gbp - COALESCE(p.paid, 0) ELSE 0 END), 0) AS overdue,
       COALESCE(SUM(CASE WHEN i.due_date >= NOW() AND i.due_date < NOW() + INTERVAL '30 days' AND i.status = 'issued' THEN i.total_gbp - COALESCE(p.paid, 0) ELSE 0 END), 0) AS due_30,
       COALESCE(SUM(CASE WHEN i.due_date >= NOW() + INTERVAL '30 days' AND i.due_date < NOW() + INTERVAL '60 days' AND i.status = 'issued' THEN i.total_gbp - COALESCE(p.paid, 0) ELSE 0 END), 0) AS due_60,
       COALESCE(SUM(CASE WHEN i.due_date >= NOW() + INTERVAL '60 days' AND i.status = 'issued' THEN i.total_gbp - COALESCE(p.paid, 0) ELSE 0 END), 0) AS due_90
 FROM invoices i
 LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(p.amount_gbp), 0) AS paid FROM payments p WHERE p.booking_id = i.booking_id AND p.status = 'succeeded'
 ) p ON true
        `.execute(kdb),
        sql<{ month: string; total: string }>`
            SELECT DATE_TRUNC('month', p.created_at) AS month,
       COALESCE(SUM(p.amount_gbp), 0) AS total
 FROM payments p
 WHERE p.status = 'succeeded' AND p.created_at >= NOW() - INTERVAL '6 months'
 GROUP BY month
 ORDER BY month
        `.execute(kdb),
        // Operations Overview queries (read-only, finance:view permission) — isolated with fallbacks
        sql<{ status: string; flight_count: number }>`SELECT s.status, COUNT(f.id)::int AS flight_count FROM schedules s LEFT JOIN flights f ON f.schedule_id = s.id WHERE s.schedule_date = CURRENT_DATE::date GROUP BY s.status`.execute(kdb).catch(() => ({ rows: [] })),
        sql<{ total: number; active: number }>`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status NOT IN ('completed','cancelled'))::int AS active FROM bookings WHERE created_at::date = CURRENT_DATE::date`.execute(kdb).catch(() => ({ rows: [{ total: 0, active: 0 }] })),
        sql<{ total: number; unassigned: number }>`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE aircraft_id IS NULL)::int AS unassigned FROM flights WHERE departure_time::date = CURRENT_DATE::date`.execute(kdb).catch(() => ({ rows: [{ total: 0, unassigned: 0 }] })),
        sql<{ pending: number }>`SELECT COUNT(*)::int AS pending FROM flight_manifests WHERE signed_off_at IS NULL`.execute(kdb).catch(() => ({ rows: [{ pending: 0 }] })),
    ]);

    const totalRevenue = Number(revenueResult.rows[0].total);
    const outstanding = Number(outstandingResult.rows[0].total);
    const pendingInvoices = Number(pendingInvoiceResult.rows[0].cnt);
    const overdueInvoices = Number(overdueResult.rows[0].cnt);
    const agingRow = agingResult.rows[0];

    const monthlyData = monthlyResult.rows.map((r) => Number(r.total));

    // Operations Overview data
    const scheduleStatus = opsSchedule.rows ?? [];
    const bookingsToday = opsBookings.rows?.[0] ?? { total: 0, active: 0 };
    const flightsToday = opsFlights.rows?.[0] ?? { total: 0, unassigned: 0 };
    const pendingManifests = Number((opsManifests.rows?.[0] ?? { pending: 0 }).pending);

    const opsData = { scheduleStatus, bookingsToday, flightsToday, pendingManifests };

    const alerts: AlertItem[] = [];
    if (overdueInvoices > 0) {
        alerts.push({
            id: "overdue",
            message: `${overdueInvoices} invoice${overdueInvoices > 1 ? "s" : ""} overdue — payment reminders recommended`,
            severity: "red",
            action: { label: "View", to: "/finance/payments?status=overdue" },
        });
    }
    if (Number(agingRow.due_90) > 500) {
        alerts.push({
            id: "aging90",
            message: `£${Number(agingRow.due_90).toLocaleString()} overdue by 90+ days`,
            severity: "amber",
            action: { label: "Review", to: "/finance/reports/aging" },
        });
    }

    return json({
        user,
        totalRevenue,
        outstanding,
        pendingInvoices,
        overdueInvoices,
        recentPayments: recentPayments.rows,
        aging: {
            overdue: Number(agingRow.overdue),
            due30: Number(agingRow.due_30),
            due60: Number(agingRow.due_60),
            due90: Number(agingRow.due_90),
        },
        monthlyData,
        alerts,
        opsData,
    });
}

export default function FinanceDashboard() {
    const { totalRevenue, outstanding, pendingInvoices, overdueInvoices, recentPayments, aging, monthlyData, alerts, opsData } = useLoaderData<typeof loader>();
    const navigation = useNavigation();
    const isLoading = navigation.state === "loading";

    if (isLoading) {
        return (
            <div className="p-6 space-y-6">
                <Skeleton className="h-8 w-48" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Skeleton className="h-28 rounded-lg" />
                    <Skeleton className="h-28 rounded-lg" />
                    <Skeleton className="h-28 rounded-lg" />
                    <Skeleton className="h-28 rounded-lg" />
                </div>
                <Skeleton className="h-32 rounded-lg" />
                <Skeleton className="h-48 rounded-lg" />
                <Skeleton className="h-48 rounded-lg" />
            </div>
        );
    }

    const paymentColumns: Column<Record<string, unknown>>[] = [
        { key: "booking_reference", header: "Booking", sortable: true },
        {
            key: "amount_gbp", header: "Amount", sortable: true,
            render: (item) => <span className="tabular-nums font-medium">£{Number(item.amount_gbp).toLocaleString()}</span>,
        },
        {
            key: "payment_method", header: "Method", sortable: true,
            render: (item) => {
                const method = item.payment_method as string;
                const colors: Record<string, string> = {
                    stripe: "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 dark:bg-emerald-900/30 dark:text-emerald-400",
                    bank_transfer: "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 dark:bg-blue-900/30 dark:text-blue-400",
                    pay_on_departure: "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 dark:bg-amber-900/30 dark:text-amber-400",
                };
                return (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[method] ?? "bg-slate-100 text-slate-700 dark:text-slate-200"}`}>
                        {method.replace(/_/g, " ")}
                    </span>
                );
            },
        },
        {
            key: "status", header: "Status", sortable: true,
            render: (item) => (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    item.status === "succeeded" ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 dark:bg-emerald-900/30 dark:text-emerald-400" :
                    item.status === "processing" ? "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 dark:bg-amber-900/30 dark:text-amber-400" :
                    "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 dark:bg-red-900/30 dark:text-red-400"
                }`}>
                    {item.status as string}
                </span>
            ),
        },
        { key: "created_at", header: "Date", sortable: true },
    ];

    const agingBuckets = [
        { label: "0–30 days", value: aging.due30, color: "text-emerald-600 dark:text-emerald-400" },
        { label: "31–60 days", value: aging.due60, color: "text-amber-600 dark:text-amber-400" },
        { label: "61–90 days", value: aging.due90, color: "text-amber-700 dark:text-amber-400 dark:text-amber-300" },
        { label: "90+ days", value: aging.overdue, color: "text-red-600 dark:text-red-400" },
    ];

    return (
        <div className="p-6 space-y-5">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Finance Dashboard</h1>

            {/* KPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <DashboardCard
                    label="Total Revenue"
                    value={`£${totalRevenue.toLocaleString()}`}
                    color="emerald"
                    to="/finance/reports/daily-sales"
                    trend={monthlyData.length >= 2 && monthlyData[monthlyData.length - 1] > monthlyData[monthlyData.length - 2]
                        ? { direction: "up", value: "+" + Math.round(((monthlyData[monthlyData.length - 1] - monthlyData[monthlyData.length - 2]) / monthlyData[monthlyData.length - 2]) * 100) + "% MoM" }
                        : undefined}
                />
                <DashboardCard
                    label="Outstanding"
                    value={`£${outstanding.toLocaleString()}`}
                    color={outstanding > 1000 ? "amber" : "emerald"}
                    to="/finance/payments"
                />
                <DashboardCard
                    label="Pending Invoices"
                    value={String(pendingInvoices)}
                    color="blue"
                    to="/finance/invoices"
                />
                <DashboardCard
                    label="Overdue"
                    value={String(overdueInvoices)}
                    color={overdueInvoices > 0 ? "red" : "emerald"}
                    to="/finance/payments?status=overdue"
                />
            </div>

            {/* Alerts */}
            {alerts.length > 0 && <AlertStrip alerts={alerts} />}

            {/* Revenue Sparkline */}
            {monthlyData.length >= 2 && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500">
                            Revenue Trend — 6 Months
                        </span>
                        <Sparkline data={monthlyData} width={240} height={40} color="#059669" />
                    </div>
                </div>
            )}

            {/* Operations Overview */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Operations Overview</h2>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="text-center">
                        <p className="text-xs text-slate-500 dark:text-slate-400">Schedule</p>
                        <p className="text-lg font-bold text-sky-600 dark:text-sky-400">
                            {opsData.scheduleStatus.length > 0 ? (opsData.scheduleStatus as Array<{ status: string; flight_count: number }>).find(s => s.status === 'published')?.flight_count ?? '—' : '—'}
                        </p>
                    </div>
                    <div className="text-center">
                        <p className="text-xs text-slate-500 dark:text-slate-400">Bookings Today</p>
                        <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{opsData.bookingsToday.total}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{opsData.bookingsToday.active} active</p>
                    </div>
                    <div className="text-center">
                        <p className="text-xs text-slate-500 dark:text-slate-400">Flights Today</p>
                        <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{opsData.flightsToday.total}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{opsData.flightsToday.unassigned} unassigned</p>
                    </div>
                    <div className="text-center">
                        <p className="text-xs text-slate-500 dark:text-slate-400">Pending Manifests</p>
                        <p className={`text-lg font-bold ${opsData.pendingManifests > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {opsData.pendingManifests}
                        </p>
                    </div>
                </div>
            </div>

            {/* Receivables Aging */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Receivables Aging</h2>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                    {agingBuckets.map((bucket) => (
                        <div key={bucket.label} className="text-center">
                            <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{bucket.label}</p>
                            <p className={`text-lg font-bold tabular-nums ${bucket.color}`}>
                                £{bucket.value.toLocaleString()}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Recent Payments */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Recent Payments</h2>
                    <Link to="/finance/payments" className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400">View all →</Link>
                </div>
                <DataTable
                    columns={paymentColumns}
                    data={recentPayments as Record<string, unknown>[]}
                    keyExtractor={(item) => String(item.id)}
                    emptyState={<EmptyState title="No recent payments." />}
                />
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
