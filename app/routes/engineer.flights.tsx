import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link, useSearchParams } from "@remix-run/react";
import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { db } from "../utils/db.server";
import DataGrid from "../components/DataGrid";
import type { Column } from "../components/DataTable";
import EmptyState from "../components/EmptyState";
import Card from "../components/Card";
import DatePicker from "../components/DatePicker";

export async function loader({ request }: LoaderFunctionArgs) {
  await requirePermission(request, Permission.MAINTENANCE_VIEW);
  const url = new URL(request.url);
  const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);

  const result = await db.query(
    `SELECT f.id, f.flight_number, f.departure_time, f.status,
       ao.code AS origin_code, ad.code AS destination_code,
       a.registration AS aircraft_registration, a.type AS aircraft_type,
       COALESCE(ls.status::text, 'none') AS loadsheet_status
 FROM flights f
 JOIN aerodromes ao ON ao.id = f.origin_aerodrome_id
 JOIN aerodromes ad ON ad.id = f.destination_aerodrome_id
 LEFT JOIN aircraft a ON a.id = f.aircraft_id
 LEFT JOIN loadsheets ls ON ls.flight_id = f.id
 WHERE f.departure_time::date = $1
 ORDER BY f.departure_time ASC`,
    [date]
  );

  return json({ flights: result.rows, date });
}

export default function EngineerFlights() {
  const { flights, date } = useLoaderData<typeof loader>();
  const [, setSearchParams] = useSearchParams();

  const columns: Column<Record<string, unknown>>[] = [
    { key: "flight_number", header: "Flight", sortable: true, render: (r) => (
      <Link to={`/ops/flight/${r.id}/loadsheet/print`} target="_blank" className="font-medium text-sky-600 hover:text-sky-800 dark:text-sky-400" rel="noreferrer">
        {String(r.flight_number)}
      </Link>
    )},
    { key: "route", header: "Route", render: (r) => (
      <span className="text-slate-600 dark:text-slate-300">{String(r.origin_code)} → {String(r.destination_code)}</span>
    )},
    { key: "departure_time", header: "Departure", sortable: true },
    { key: "aircraft_registration", header: "Aircraft", sortable: true, render: (r) => (
      <span className="font-medium text-slate-700 dark:text-slate-200">{String(r.aircraft_registration ?? "—")}</span>
    )},
    { key: "aircraft_type", header: "Type" },
    { key: "status", header: "Status", sortable: true },
    { key: "loadsheet_status", header: "Loadsheet", sortable: true, render: (r) => (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        r.loadsheet_status === 'finalized' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
        r.loadsheet_status === 'draft' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
        'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
      }`}>{String(r.loadsheet_status)}</span>
    )},
  ];

  return (
    <div className="p-6 space-y-5">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Flights</h1>
      <Card>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Date:</span>
          <DatePicker value={date} onChange={(d) => setSearchParams({ date: d })} label="" />
        </div>
        <DataGrid
          columns={columns}
          data={flights as Record<string, unknown>[]}
          keyExtractor={(r) => String(r.id)}
          enableSort
          enableFilters
          initialSortColumn="departure_time"
          initialSortDirection="asc"
          emptyState={<EmptyState title="No flights for this date" />}
        />
      </Card>
    </div>
  );
}
