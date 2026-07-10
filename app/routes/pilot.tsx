import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData , useRouteError, isRouteErrorResponse } from "@remix-run/react";

import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import SidebarLayout from "../components/SidebarLayout";

export const meta: MetaFunction = () => [{ title: "Pilot - FIGAS" }];

export async function loader({ request }: LoaderFunctionArgs) {
    const user = await requirePermission(request, Permission.FLIGHT_VIEW);

    const today = new Date().toISOString().slice(0, 10);

    // Get the pilot record for this user
    const pilotResult = await sql<{ id: number }>`
      SELECT id FROM pilots WHERE user_id = ${Number(user.id)} LIMIT 1
    `.execute(kdb);
    const pilotId = pilotResult.rows.length > 0 ? (pilotResult.rows[0] as { id: number }).id : 0;

    const [assignedFlightsResult, scheduleResult] = await Promise.all([
        sql<{ cnt: string }>`
            SELECT COUNT(*) as cnt FROM pilot_assignments pa
       JOIN flights f ON f.id = pa.flight_id
       WHERE pa.pilot_id = ${pilotId} AND f.departure_time::date = ${today}
        `.execute(kdb),
        sql<{ cnt: string }>`
            SELECT COUNT(*) as cnt FROM schedules WHERE schedule_date = ${today}
        `.execute(kdb),
    ]);

    const assignedFlights = Number(
        (assignedFlightsResult.rows[0] as { cnt: string })?.cnt ?? 0
    );
    const todaysSchedules = Number(
        (scheduleResult.rows[0] as { cnt: string })?.cnt ?? 0
    );

    return json({ user, assignedFlights, todaysSchedules });
}

export default function PilotLayout() {
    const { user, assignedFlights, todaysSchedules } =
        useLoaderData<typeof loader>();

    const navItems = [
        { to: "/pilot", label: "Dashboard", end: true },
        { to: "/pilot/flights", label: "My Flights", end: false },
        { to: "/pilot/schedule", label: "My Schedule", end: false },
    ];

    return (
        <SidebarLayout
            title="Pilot Portal"
            userIdentity={{ name: user.name, email: user.email }}
            navItems={navItems}
            footer={
                <>
                    <div className="flex justify-between">
                        <span>Today&rsquo;s Flights</span>
                        <span className="font-bold">{assignedFlights}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Active Schedules</span>
                        <span className="font-bold">{todaysSchedules}</span>
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
