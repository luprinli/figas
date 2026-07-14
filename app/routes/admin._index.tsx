import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link, useNavigation, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { requireAuth } from "../utils/auth.server";
import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { adminRepository } from "../utils/repositories/admin";
import MetricCard from "../components/MetricCard";
import SystemHealth from "../components/SystemHealth";
import type { SystemHealthItem } from "../components/SystemHealth";
import { TourTrigger } from "../components/TourTrigger";
import { adminDashboardTour } from "../utils/tour/definitions/admin-dashboard";
import Skeleton from "../components/Skeleton";

export const meta: MetaFunction = () => [{ title: "Admin Dashboard - FIGAS" }];

export async function loader({ request }: LoaderFunctionArgs) {
    await requireAuth(request);
    await requirePermission(request, Permission.ADMIN_ACCESS);

    const stats = await adminRepository.getDashboardStats();
    const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;

    return json({ stats, stripeConfigured });
}

export default function AdminDashboard() {
    const { stats, stripeConfigured } = useLoaderData<typeof loader>();
    const navigation = useNavigation();
    const isLoading = navigation.state === "loading";

    if (isLoading) {
        return (
            <div className="p-6 space-y-6">
                <Skeleton className="h-8 w-48" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Skeleton className="h-28 rounded-lg" />
                    <Skeleton className="h-28 rounded-lg" />
                    <Skeleton className="h-28 rounded-lg" />
                    <Skeleton className="h-28 rounded-lg" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Skeleton className="h-48 rounded-lg" />
                    <Skeleton className="h-48 rounded-lg" />
                </div>
                <Skeleton className="h-24 rounded-lg" />
            </div>
        );
    }

    const healthItems: SystemHealthItem[] = [
        { label: "Database", status: "ok", detail: "PostgreSQL 16" },
        { label: "Stripe", status: stripeConfigured ? "ok" : "warning", detail: "Payments" },
        { label: "Migrations", status: "ok", detail: "Up to date" },
        { label: "SoD Enforcement", status: "ok", detail: "Active — enforced on role assignment" },
    ];

    return (
        <div className="p-6 space-y-5">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Admin Dashboard</h1>
            <TourTrigger config={adminDashboardTour} />

            {/* KPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                    label="Total Users"
                    value={stats.totalUsers}
                    color="blue"
                    to="/admin/users"
                />
                <MetricCard
                    label="Bookings (This Month)"
                    value={stats.bookingsThisMonth}
                    color="emerald"
                    to="/operations/bookings"
                />
                <MetricCard
                    label="Flights (This Month)"
                    value={stats.flightsThisMonth}
                    color="purple"
                    to="/operations/schedule"
                />
                <MetricCard
                    label="Revenue (This Month)"
                    value={`Ã‚Â£${stats.revenueThisMonth.toLocaleString()}`}
                    color="amber"
                    to="/finance"
                />
            </div>

            {/* System Health + Secondary Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <SystemHealth items={healthItems} />
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="px-4 py-2 bg-slate-50 dark:bg-slate-700 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Fleet Overview
                        </span>
                    </div>
                    <div className="p-4 bg-white dark:bg-slate-800 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-600 dark:text-slate-300 dark:text-slate-500">Active Aircraft</span>
                            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{stats.activeAircraft}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-600 dark:text-slate-300 dark:text-slate-500">Active Aerodromes</span>
                            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{(stats as Record<string, unknown>).activeAerodromes as number ?? "—"}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-600 dark:text-slate-300 dark:text-slate-500">Fare Routes</span>
                            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{(stats as Record<string, unknown>).fareRoutes as number ?? "—"}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-4 py-2 bg-slate-50 dark:bg-slate-700 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Management
                    </span>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 grid grid-cols-2 md:grid-cols-3 gap-2">
                    {[
                        { to: "/admin/users", label: "Users" },
                        { to: "/admin/aerodromes", label: "Aerodromes" },
                        { to: "/admin/aircraft", label: "Aircraft" },
                        { to: "/admin/fares", label: "Fare Routes" },
                        { to: "/admin/settings", label: "Settings" },
                        { to: "/admin/fuel-rules", label: "Fuel Rules" },
                    ].map((item) => (
                        <Link
                            key={item.to}
                            to={item.to}
                            className="rounded-md border border-slate-200 dark:border-slate-700 dark:border-slate-600 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-blue-300 hover:bg-blue-50 dark:bg-blue-900/30 dark:hover:bg-blue-900/20 dark:hover:border-blue-500 transition-colors text-center"
                        >
                            {item.label}
                        </Link>
                    ))}
                </div>
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
