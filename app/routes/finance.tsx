import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData , useRouteError, isRouteErrorResponse } from "@remix-run/react";

import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { requireUser } from "../utils/layout.server";
import SidebarLayout from "../components/SidebarLayout";

export const meta: MetaFunction = () => [{ title: "Finance - FIGAS" }];

export async function loader({ request }: LoaderFunctionArgs) {
  const { userIdentity } = await requireUser(request);
  await requirePermission(request, Permission.FINANCE_VIEW);

  return json({ userIdentity });
}

export default function FinanceLayout() {
  const { userIdentity } = useLoaderData<typeof loader>();

  const navItems = [
    { to: "/finance", label: "Dashboard" },
    { to: "/finance/invoices", label: "Invoices" },
    { to: "/finance/payments", label: "Payments" },
    { to: "/finance/bookings", label: "Bookings" },
    { to: "/finance/flights", label: "Flights" },
    { to: "/finance/reconciliation", label: "Reconciliation" },
    { to: "/finance/reports", label: "Reports" },
    { to: "/finance/exports", label: "Exports" },
    { to: "/finance/settings", label: "Settings" },
  ];

  return (
    <SidebarLayout
      title="Finance"
      userIdentity={userIdentity}
      navItems={navItems}
      footer={
        <div className="text-sm text-slate-500 dark:text-slate-400">
          <span>{userIdentity?.name}</span>
          <span className="ml-2 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Finance
          </span>
        </div>
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