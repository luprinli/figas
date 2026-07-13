import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link, useSearchParams, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import DataTable from "../components/DataTable";
import type { Column } from "../components/DataTable";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import Card from "../components/Card";
import DatePicker from "../components/DatePicker";

export async function loader({ request }: LoaderFunctionArgs) {
  await requirePermission(request, Permission.FINANCE_VIEW);
  const url = new URL(request.url);
  const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);

  const result = await sql<Record<string, unknown>>`
    SELECT f.id, f.flight_number, f.departure_time, f.status,
       ao.code AS origin_code, ad.code AS destination_code,
       a.registration AS aircraft_registration,
        COALESCE(ls.status::text, 'none') AS loadsheet_status,
       COALESCE(ls.total_pax, 0) AS total_pax
 FROM flights f
 JOIN aerodromes ao ON ao.id = f.origin_aerodrome_id
 JOIN aerodromes ad ON ad.id = f.destination_aerodrome_id
 LEFT JOIN aircraft a ON a.id = f.aircraft_id
 LEFT JOIN loadsheets ls ON ls.flight_id = f.id
 WHERE f.departure_time::date = ${date}
 ORDER BY f.departure_time ASC
  `.execute(kdb);

  return json({ flights: result.rows, date });
}

export default function FinanceFlights() {
  const { flights, date } = useLoaderData<typeof loader>();
  const [, setSearchParams] = useSearchParams();

  const columns: Column<Record<string, unknown>>[] = [
    { key: "flight_number", header: "Flight", sortable: true, render: (r) => (
      <Link to={`/ops/flight/${r.id}/loadsheet/print`} target="_blank" className="font-medium text-sky-600 hover:text-sky-800 dark:text-sky-400" rel="noreferrer">
        {r.flight_number as string}
      </Link>
    )},
    { key: "route", header: "Route", render: (r: Record<string, unknown>) => (
      <span className="text-slate-600 dark:text-slate-300">{String(r.origin_code)} \u2192 {String(r.destination_code)}</span>
    )},
    { key: "departure_time", header: "Departure", sortable: true, render: (r) => (
      <span className="tabular-nums text-slate-600 dark:text-slate-300">{new Date(r.departure_time as string).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
    )},
    { key: "status", header: "Status", sortable: true },
    { key: "aircraft_registration", header: "Aircraft" },
    { key: "total_pax", header: "Pax", className: "text-right" },
    { key: "loadsheet_status", header: "Loadsheet", render: (r) => (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        r.loadsheet_status === 'finalized' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
        r.loadsheet_status === 'draft' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
        'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
      }`}>{r.loadsheet_status as string}</span>
    )},
  ];

  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Flights" description="Read-only operational view — flight numbers link to printable loadsheets" />
      <Card>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Date:</span>
          <DatePicker value={date} onChange={(d) => setSearchParams({ date: d })} label="" />
        </div>
        <DataTable
          columns={columns}
          data={flights as Record<string, unknown>[]}
          keyExtractor={(r) => String(r.id)}
          sortable
          emptyState={<EmptyState title="No flights for this date" />}
        />
      </Card>
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
