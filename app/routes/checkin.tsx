import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, useLoaderData, Outlet , useRouteError, isRouteErrorResponse } from "@remix-run/react";

import { useState } from "react";
import { ChevronsLeft, ChevronsRight, LogOut } from "lucide-react";
import { requireAnyPermission } from "../utils/permissions.server";
import { checkinRepository } from "../utils/repositories/checkin";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import ProfilePopup from "../components/ProfilePopup";

export const meta: MetaFunction = () => [{ title: "Check-In - FIGAS" }];

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireAnyPermission(request, ["checkin:view", "checkin:process"]);
  const pending = await checkinRepository.findPending();
  const today = new Date().toISOString().slice(0, 10);
  const flights = await sql<Record<string, unknown>>`
    SELECT f.id, f.flight_number FROM flights f WHERE f.departure_time::date = ${today} ORDER BY f.flight_number
  `.execute(kdb);
  return json({ user, pendingCount: pending.length, flights: flights.rows });
}

export default function CheckinLayout() {
  const { user, pendingCount } = useLoaderData<typeof loader>();
  const [collapsed, setCollapsed] = useState(false);

  const navItems = [
    { to: "/checkin", label: "Dashboard" },
    { to: "/checkin/counter", label: `Counter ${pendingCount > 0 ? `· ${pendingCount}` : ""}` },
    { to: "/checkin/lookup", label: "Lookup" },
    { to: "/checkin/freight", label: "Freight" },
    { to: "/operations/bookings", label: "Bookings" },
    { to: "/operations/loadsheets", label: "Loadsheets" },
  ];

  return (
    <div className="flex min-h-screen">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-white">Skip to content</a>
      <aside className={`${collapsed ? "w-16" : "w-56"} shrink-0 bg-slate-800 text-white transition-all duration-200 flex flex-col`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          {!collapsed && <h2 className="text-sm font-bold tracking-wider">CHECK-IN</h2>}
          <button onClick={() => setCollapsed(!collapsed)} className="text-slate-400 hover:text-white p-1 rounded">
            {collapsed
              ? <ChevronsRight size={16} absoluteStrokeWidth />
              : <ChevronsLeft size={16} absoluteStrokeWidth />}
          </button>
        </div>
        <nav className="flex-1 py-3 space-y-0.5 px-2">
          {navItems.map((item) => (
            <Link key={item.to} to={item.to}
              className={`block px-3 py-2 rounded text-sm transition-colors ${collapsed ? "text-center" : ""} hover:bg-slate-700 text-slate-300`}>
              {collapsed ? item.label.charAt(0) : item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-700 px-3 py-3">
          {!collapsed ? (
            <div className="flex items-center gap-3">
              <ProfilePopup user={{ name: user.name, email: user.email }} />
              <div className="text-xs text-slate-400 min-w-0 flex-1">
                <p className="font-medium text-slate-300 truncate">{user.name}</p>
                <p className="truncate">{user.email}</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <ProfilePopup user={{ name: user.name, email: user.email }} />
              <Form action="/logout" method="POST">
                <button type="submit" className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500 hover:text-red-400 rounded transition-colors" title="Sign Out">
                  <LogOut size={16} absoluteStrokeWidth />
                </button>
              </Form>
            </div>
          )}
        </div>
      </aside>
      <main id="main-content" className="flex-1 bg-slate-50 dark:bg-slate-900 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900"><div className="text-center"><div className="text-5xl font-bold text-slate-300">{error.status}</div><h1 className="text-xl font-semibold">Error</h1><button onClick={() => window.location.reload()} className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm text-white">Try Again</button></div></div>;
  }
  return <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900"><div className="text-center"><h1 className="text-xl font-semibold">Error</h1><button onClick={() => window.location.reload()} className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm text-white">Try Again</button></div></div>;
}
