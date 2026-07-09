import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData , useRouteError, isRouteErrorResponse } from "@remix-run/react";

import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { db } from "../utils/db.server";
import SidebarLayout from "../components/SidebarLayout";

export const meta: MetaFunction = () => [{ title: "Engineer - FIGAS" }];

export async function loader({ request }: LoaderFunctionArgs) {
    const user = await requirePermission(request, Permission.MAINTENANCE_VIEW);

    const [aircraftCountResult, airframeHoursResult] = await Promise.all([
        db.query(
            `SELECT COUNT(*) as cnt FROM aircraft WHERE is_active = true`
        ),
        db.query(
            `SELECT COUNT(*) as cnt FROM airframe_hours`
        ),
    ]);

    const activeAircraft = Number(
        (aircraftCountResult.rows[0] as { cnt: string })?.cnt ?? 0
    );
    const airframeRecords = Number(
        (airframeHoursResult.rows[0] as { cnt: string })?.cnt ?? 0
    );

    return json({ user, activeAircraft, airframeRecords });
}

export default function EngineerLayout() {
    const { user, activeAircraft, airframeRecords } =
        useLoaderData<typeof loader>();

    const navItems = [
        { to: "/engineer", label: "Dashboard", end: true },
        { to: "/engineer/aircraft", label: "Aircraft Fleet", end: false },
        { to: "/engineer/airframe-hours", label: "Airframe Hours", end: false },
        { to: "/engineer/tasks", label: "Task Board", end: false },
        { to: "/engineer/defects", label: "Defects", end: false },
        { to: "/engineer/components", label: "Components", end: false },
        { to: "/engineer/flights", label: "Flights", end: false },
        { to: "/engineer/loadsheets", label: "Loadsheets", end: false },
        { to: "/engineer/maintenance", label: "Maintenance Log", end: false },
    ];

    return (
        <SidebarLayout
            title="Engineer Portal"
            userIdentity={{ name: user.name, email: user.email }}
            navItems={navItems}
            footer={
                <>
                    <div className="flex justify-between">
                        <span>Active Aircraft</span>
                        <span className="font-bold">{activeAircraft}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Airframe Records</span>
                        <span className="font-bold">{airframeRecords}</span>
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