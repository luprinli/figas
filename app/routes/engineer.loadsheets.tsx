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
    `SELECT f.id, f.flight_number, f.departure_time,
       a.registration AS aircraft_registration, a.type AS aircraft_type,
       COALESCE(ls.status::text, 'none') AS loadsheet_status,
       COALESCE(ls.total_pax, 0) AS total_pax,
       COALESCE(ls.empty_weight_kg, 0) + COALESCE(ls.pilot_weight_kg, 0) AS total_weight
 FROM loadsheets ls
 JOIN flights f ON f.id = ls.flight_id
 LEFT JOIN aircraft a ON a.id = f.aircraft_id
 WHERE f.departure_time::date = $1
 ORDER BY f.departure_time ASC`,
    [date]
  );

  return json({ loadsheets: result.rows, date });
}

export default function EngineerLoadsheets() {
  const { loadsheets, date } = useLoaderData<typeof loader>();
  const [, setSearchParams] = useSearchParams();

  const columns: Column<Record<string, unknown>>[] = [
    { key: "flight_number", header: "Flight", sortable: true, render: (r) => (
      <Link to={`/ops/flight/${r.id}/loadsheet/print`} target="_blank" className="font-medium text-sky-600 hover:text-sky-800 dark:text-sky-400">
        {String(r.flight_number)}
      </Link>
    )},
    { key: "aircraft_registration", header: "Aircraft", sortable: true, render: (r) => (
      <span className="font-medium text-slate-700 dark:text-slate-200">{String(r.aircraft_registration ?? "—")}</span>
    )},
    { key: "aircraft_type", header: "Type" },
    { key: "total_pax", header: "Pax", className: "text-right", sortable: true },
    { key: "total_weight", header: "Weight (kg)", className: "text-right", sortable: true, render: (r) => (
      <span className="tabular-nums">{Number(r.total_weight).toLocaleString()}</span>
    )},
    { key: "loadsheet_status", header: "Status", sortable: true, render: (r) => (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        r.loadsheet_status === 'finalized' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
        r.loadsheet_status === 'draft' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
        'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
      }`}>{String(r.loadsheet_status)}</span>
    )},
  ];

  return (
    <div className="p-6 space-y-5">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Loadsheets</h1>
      <Card>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Date:</span>
          <DatePicker value={date} onChange={(d) => setSearchParams({ date: d })} label="" />
        </div>
        <DataGrid
          columns={columns}
          data={loadsheets as Record<string, unknown>[]}
          keyExtractor={(r) => String(r.id)}
          enableSort
          enableFilters
          initialSortColumn="flight_number"
          initialSortDirection="asc"
          emptyState={<EmptyState title="No loadsheets for this date" />}
        />
      </Card>
    </div>
  );
}
