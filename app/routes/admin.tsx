import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { adminRepository } from "../utils/repositories/admin";
import { requireUser } from "../utils/layout.server";
import SidebarLayout from "../components/SidebarLayout";

export const meta: MetaFunction = () => [{ title: "Admin - FIGAS" }];

export async function loader({ request }: LoaderFunctionArgs) {
  const { userIdentity } = await requireUser(request);
  await requirePermission(request, Permission.ADMIN_ACCESS);

  const stats = await adminRepository.getDashboardStats();

  return json({ stats, userIdentity });
}

export default function AdminLayout() {
  const { stats, userIdentity } = useLoaderData<typeof loader>();

  const navItems = [
    { to: "/admin", label: "Dashboard" },
    { to: "/admin/users", label: "Users" },
    { to: "/admin/aerodromes", label: "Aerodromes" },
    { to: "/admin/aircraft", label: "Aircraft" },
    { to: "/admin/fares", label: "Fare Routes" },
    { to: "/admin/fuel-rules", label: "Fuel Rules" },
    { to: "/admin/aerodrome-distances", label: "Aerodrome Distances" },
    { to: "/admin/aerodrome-headings", label: "Aerodrome Headings" },
    { to: "/admin/airframe-hours", label: "Airframe Hours" },
    { to: "/admin/settings", label: "Settings" },
  ];

  return (
    <SidebarLayout
      title="Admin Panel"
      userIdentity={userIdentity}
      navItems={navItems}
      footer={
        <>
          <div className="flex justify-between">
            <span>Total Users</span>
            <span className="font-bold">{stats.totalUsers}</span>
          </div>
          <div className="flex justify-between">
            <span>Bookings (MTD)</span>
            <span className="font-bold">{stats.bookingsThisMonth}</span>
          </div>
          <div className="flex justify-between">
            <span>Revenue (MTD)</span>
            <span className="font-bold">Ã‚Â£{stats.revenueThisMonth.toLocaleString()}</span>
          </div>
        </>
      }
    />
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