import type { MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData, useNavigation, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { checkinRepository } from "../utils/repositories/checkin";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import DataGrid from "../components/DataGrid";
import type { Column } from "../components/DataTable";
import EmptyState from "../components/EmptyState";
import DashboardCard from "../components/DashboardCard";
import Skeleton from "../components/Skeleton";
import Card from "../components/Card";

export const meta: MetaFunction = () => [{ title: "Check-In - FIGAS" }];

export async function loader() {
  const today = new Date().toISOString().slice(0, 10);

  const [pendingResult, flightsResult, recentResult] = await Promise.all([
    checkinRepository.findPending(),
    sql<Record<string, unknown>>`
      SELECT f.id, f.flight_number, f.departure_time, f.status,
         ao.code AS origin_code, ad.code AS destination_code,
         a.registration,
         COUNT(blp.id) FILTER (WHERE blp.checked_in = true)::int AS checked_in_count,
         COUNT(blp.id)::int AS total_passengers
       FROM flights f
       JOIN aerodromes ao ON ao.id = f.origin_aerodrome_id
       JOIN aerodromes ad ON ad.id = f.destination_aerodrome_id
       LEFT JOIN aircraft a ON a.id = f.aircraft_id
       LEFT JOIN booking_legs bl ON bl.flight_id = f.id
       LEFT JOIN booking_leg_passengers blp ON blp.booking_leg_id = bl.id
       WHERE f.departure_time::date = ${today}
       GROUP BY f.id, f.flight_number, f.departure_time, f.status, ao.code, ad.code, a.registration
       ORDER BY f.departure_time ASC
    `.execute(kdb),
    sql<Record<string, unknown>>`
      SELECT blp.id, blp.checked_in, blp.checked_in_at,
         blp.clothed_weight_kg, blp.baggage_weight_kg, blp.seat_number,
         bp.first_name, bp.last_name,
         bl.origin_code, bl.destination_code,
         b.booking_reference
       FROM booking_leg_passengers blp
       JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
       JOIN booking_legs bl ON bl.id = blp.booking_leg_id
       JOIN bookings b ON b.id = bl.booking_id
       WHERE blp.checked_in = true AND blp.checked_in_at::date = ${today}
       ORDER BY blp.checked_in_at DESC
       LIMIT 20
    `.execute(kdb),
  ]);

  const pendingCount = pendingResult.length;
  const flights = flightsResult.rows;
  const totalFlights = flights.length;
  const checkedInTotal = flights.reduce((s: number, f: Record<string, unknown>) => s + Number(f.checked_in_count ?? 0), 0);
  const passengerTotal = flights.reduce((s: number, f: Record<string, unknown>) => s + Number(f.total_passengers ?? 0), 0);
  const recent = recentResult.rows;

  return json({ pendingCount, flights, today, totalFlights, checkedInTotal, passengerTotal, recent });
}

export default function CheckinIndex() {
  const { pendingCount, flights, today, totalFlights, checkedInTotal, passengerTotal, recent } = useLoaderData<typeof loader>();
  const navigation = useNavigation();

  if (navigation.state === "loading" && !navigation.formData) {
    return (
      <div className="p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Skeleton className="h-20 rounded-lg" /><Skeleton className="h-20 rounded-lg" /><Skeleton className="h-20 rounded-lg" /><Skeleton className="h-20 rounded-lg" />
        </div>
        <Skeleton className="h-80 rounded-lg" />
      </div>
    );
  }

  const flightColumns: Column<Record<string, unknown>>[] = [
    { key: "flight_number", header: "Flight", sortable: true, render: (f) => (
      <Link to={`/checkin/counter?flightId=${f.id}`} className="font-medium text-blue-700 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300">{String(f.flight_number)}</Link>
    )},
    { key: "route", header: "Route", render: (f) => (
      <span className="text-slate-600 dark:text-slate-300">{String(f.origin_code)} → {String(f.destination_code)}</span>
    )},
    { key: "departure_time", header: "Time", sortable: true, render: (f) => (
      <span className="tabular-nums">{new Date(String(f.departure_time)).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
    )},
    { key: "registration", header: "Aircraft", render: (f) => (
      <span className="text-slate-600 dark:text-slate-300">{String(f.registration ?? "—")}</span>
    )},
    { key: "status", header: "Status", sortable: true, render: (f) => (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${String(f.status) === 'boarding' ? 'bg-amber-100 text-amber-800' : String(f.status) === 'scheduled' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-800'}`}>
        {String(f.status)}
      </span>
    )},
    { key: "progress", header: "Check-In", sortable: true, render: (f) => {
      const ci = Number(f.checked_in_count ?? 0);
      const tp = Number(f.total_passengers ?? 1);
      const pct = Math.round((ci / Math.max(1, tp)) * 100);
      return (
        <div className="flex items-center gap-2 min-w-[120px]">
          <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-600 overflow-hidden">
            <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-500' : 'bg-slate-300'}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs tabular-nums text-slate-500">{ci}/{tp}</span>
        </div>
      );
    }},
  ];

  return (
    <div className="p-6 space-y-5">
      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <DashboardCard label="Today's Flights" value={totalFlights} color="blue" />
        <DashboardCard label="Checked In" value={`${checkedInTotal}/${passengerTotal}`} color="emerald" />
        <DashboardCard label="Pending" value={pendingCount} color={pendingCount > 0 ? "amber" : "emerald"} />
        <DashboardCard label="Freight Consignments" value="New" color="purple" to="/checkin/freight" />
      </div>

      {/* Today's Flights */}
      <Card>
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Today&rsquo;s Schedule — {new Date(today).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
          </h2>
          <Link to="/checkin/lookup" className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400">Search →</Link>
        </div>
        <DataGrid
          columns={flightColumns}
          data={flights}
          keyExtractor={(f) => String(f.id)}
          enableSort
          initialSortColumn="departure_time"
          initialSortDirection="asc"
          emptyState={<EmptyState title="No flights scheduled today" description="Check back when flights are scheduled." />}
        />
      </Card>

      {/* Recently Checked In */}
      {recent.length > 0 && (
        <Card>
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Recently Checked In</h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {recent.slice(0, 10).map((r, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center justify-between bg-white dark:bg-slate-800">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-[10px]">✓</span>
                  <div>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{String(r.first_name)} {String(r.last_name)}</span>
                    <span className="ml-2 text-xs text-slate-500">{String(r.booking_reference)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>{String(r.origin_code)} → {String(r.destination_code)}</span>
                  <span className="tabular-nums">{Number(r.clothed_weight_kg ?? 0)} kg</span>
                  {r.seat_number ? <span className="font-mono text-slate-400">{String(r.seat_number)}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-700">
        <div className="mx-auto max-w-lg text-center">
          <div className="mb-4 text-5xl font-bold text-slate-300 dark:text-slate-500">{error.status}</div>
          <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Something went wrong</h1>
          <p className="mb-6 text-sm text-slate-500">{error.statusText}</p>
          <button onClick={() => window.location.reload()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Try Again</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-700">
      <div className="mx-auto max-w-lg text-center">
        <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Unexpected Error</h1>
        <p className="mb-6 text-sm text-slate-500">An unexpected error occurred.</p>
        <button onClick={() => window.location.reload()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Try Again</button>
      </div>
    </div>
  );
}
