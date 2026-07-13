import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link, useSearchParams, useNavigation , useRouteError, isRouteErrorResponse } from "@remix-run/react";

import { useState, useMemo } from "react";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import { requireUser } from "../utils/layout.server";
import { getUserPermissions } from "../utils/permissions.server";
import DataTable from "../components/DataTable";
import type { Column } from "../components/DataTable";
import DatePicker from "../components/DatePicker";
import MetricCard from "../components/MetricCard";
import Skeleton from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import Button from "../components/Button";

interface LoadsheetRow {
  flight_id: number;
  flight_number: string;
  origin_code: string;
  destination_code: string;
  departure_time: string;
  aircraft_registration: string | null;
  aircraft_type: string | null;
  pilot_name: string | null;
  pilot_id: number | null;
  loadsheet_status: string | null;
  loadsheet_id: number | null;
  total_pax: number;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { userId, userIdentity } = await requireUser(request);
  const url = new URL(request.url);
  const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const view = url.searchParams.get("view") || "";
  const permissions = await getUserPermissions(Number(userId));

  const isPilot = permissions.includes("flight:view") && !permissions.includes("schedule:create");
  const isOps = permissions.includes("schedule:create") || permissions.includes("schedule:update") || permissions.includes("schedule:view");

  let pilotId: number | null = null;
  let pilotFilter = false;

  if (isPilot) {
    const pilotResult = await sql<{ id: number }>`
      SELECT id FROM pilots WHERE user_id = ${Number(userId)} LIMIT 1
    `.execute(kdb);
    if (pilotResult.rows.length > 0) {
      pilotId = pilotResult.rows[0].id;
      if (view !== "all") {
        pilotFilter = true;
      }
    }
  }

  const showAll = view === "all" || isOps;

  let result;
  if (pilotFilter && pilotId) {
    result = await sql<Record<string, unknown>>`
      SELECT
        f.id AS flight_id,
        f.flight_number,
        f.origin_code,
        f.destination_code,
        f.departure_time,
        a.registration AS aircraft_registration,
        a.type AS aircraft_type,
        p.name AS pilot_name,
        p.id AS pilot_id,
        ls.status AS loadsheet_status,
        ls.id AS loadsheet_id,
        COALESCE(ls.total_pax, 0) AS total_pax
      FROM flights f
      INNER JOIN loadsheets ls ON ls.flight_id = f.id
      LEFT JOIN aircraft a ON a.id = f.aircraft_id
      LEFT JOIN pilots p ON p.id = f.pilot_id
      WHERE f.departure_time::date = ${date}
        AND f.schedule_id IS NOT NULL
        AND f.pilot_id = ${pilotId}
      ORDER BY f.departure_time ASC
    `.execute(kdb);
  } else {
    result = await sql<Record<string, unknown>>`
      SELECT
        f.id AS flight_id,
        f.flight_number,
        f.origin_code,
        f.destination_code,
        f.departure_time,
        a.registration AS aircraft_registration,
        a.type AS aircraft_type,
        p.name AS pilot_name,
        p.id AS pilot_id,
        ls.status AS loadsheet_status,
        ls.id AS loadsheet_id,
        COALESCE(ls.total_pax, 0) AS total_pax
      FROM flights f
      INNER JOIN loadsheets ls ON ls.flight_id = f.id
      LEFT JOIN aircraft a ON a.id = f.aircraft_id
      LEFT JOIN pilots p ON p.id = f.pilot_id
      WHERE f.departure_time::date = ${date}
        AND f.schedule_id IS NOT NULL
      ORDER BY f.departure_time ASC
    `.execute(kdb);
  }

  const flights = result.rows.map((r) => ({
    flight_id: Number(r.flight_id),
    flight_number: String(r.flight_number),
    origin_code: String(r.origin_code),
    destination_code: String(r.destination_code),
    departure_time: String(r.departure_time),
    aircraft_registration: r.aircraft_registration ? String(r.aircraft_registration) : null,
    aircraft_type: r.aircraft_type ? String(r.aircraft_type) : null,
    pilot_name: r.pilot_name ? String(r.pilot_name) : null,
    pilot_id: r.pilot_id ? Number(r.pilot_id) : null,
    loadsheet_status: r.loadsheet_status ? String(r.loadsheet_status) : null,
    loadsheet_id: r.loadsheet_id ? Number(r.loadsheet_id) : null,
    total_pax: Number(r.total_pax ?? 0),
  })) as LoadsheetRow[];

  const stats = {
    total: flights.length,
    withLoadsheet: flights.filter((f) => f.loadsheet_status).length,
    finalized: flights.filter((f) => f.loadsheet_status === "finalized").length,
    draft: flights.filter((f) => f.loadsheet_status === "draft").length,
  };

  return json({
    flights, date, view, userIdentity,
    isPilot, isOps, showAll, stats,
  });
}

const statusColors: Record<string, string> = {
  draft: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  review: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  finalized: "bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-200",
  archived: "bg-slate-300 text-slate-500 dark:bg-slate-700 dark:text-slate-300",
};

export default function LoadsheetsIndex() {
  const { flights, date, view, userIdentity, isPilot, isOps, showAll, stats } = useLoaderData<typeof loader>();
  const [, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";
  const [sortColumn, setSortColumn] = useState("departure_time");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  function navigateDate(d: string) {
    const params = new URLSearchParams();
    params.set("date", d);
    if (view) params.set("view", view);
    setSearchParams(params, { replace: true });
  }

  function toggleView() {
    const params = new URLSearchParams();
    params.set("date", date);
    params.set("view", showAll ? "" : "all");
    setSearchParams(params, { replace: true });
  }

  const sortedFlights = useMemo(() => {
    return [...flights].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";
      switch (sortColumn) {
        case "flight_number": aVal = a.flight_number; bVal = b.flight_number; break;
        case "departure_time": aVal = a.departure_time; bVal = b.departure_time; break;
        case "pilot_name": aVal = a.pilot_name ?? ""; bVal = b.pilot_name ?? ""; break;
        case "aircraft_registration": aVal = a.aircraft_registration ?? ""; bVal = b.aircraft_registration ?? ""; break;
        case "total_pax": aVal = a.total_pax; bVal = b.total_pax; break;
        case "loadsheet_status": aVal = a.loadsheet_status ?? ""; bVal = b.loadsheet_status ?? ""; break;
        default: return 0;
      }
      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [flights, sortColumn, sortDirection]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-5">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
        </div>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  const columns: Column<LoadsheetRow>[] = [
    {
      key: "flight_number", header: "Flight", sortable: true,
      render: (f) => (
        <Link to={`/ops/flight/${f.flight_id}/loadsheet`} className="font-bold text-sky-700 dark:text-sky-400 hover:text-sky-900 dark:hover:text-sky-300">
          {f.flight_number}
        </Link>
      ),
    },
    { key: "departure_time", header: "Time", sortable: true, render: (f) => (
      <span className="tabular-nums text-slate-600 dark:text-slate-300">
        {f.departure_time ? new Date(f.departure_time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "TBC"}
      </span>
    )},
    { key: "route", header: "Route", render: (f) => (
      <span className="text-slate-600 dark:text-slate-300">{f.origin_code} \u2192 {f.destination_code}</span>
    )},
    {
      key: "loadsheet_status", header: "Status", sortable: true,
      render: (f) => f.loadsheet_status ? (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[f.loadsheet_status] ?? ""}`}>
          {f.loadsheet_status}
        </span>
      ) : (
        <span className="rounded-full bg-slate-50 dark:bg-slate-700 px-2 py-0.5 text-xs text-slate-500 dark:text-slate-400">No loadsheet</span>
      ),
    },
    { key: "pilot_name", header: "Pilot", sortable: true, render: (f) => (
      <span className="text-slate-600 dark:text-slate-300">{f.pilot_name ?? "Unassigned"}</span>
    )},
    { key: "aircraft_registration", header: "Aircraft", sortable: true, render: (f) => (
      <span className="text-slate-600 dark:text-slate-300">{f.aircraft_registration ?? "Unassigned"}</span>
    )},
    { key: "total_pax", header: "Pax", sortable: true, className: "text-right", render: (f) => (
      <span className="tabular-nums text-slate-600 dark:text-slate-300 font-medium">{f.total_pax}</span>
    )},
  ];

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Loadsheets</h1>
          {userIdentity && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {isPilot ? "My assigned flights" : "Flight operations"} — {new Date(date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isPilot && (
            <button
              type="button"
              onClick={toggleView}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                showAll ? "bg-sky-600 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
              }`}
            >
              {showAll ? "All Loadsheets" : "My Loadsheets"}
            </button>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total Flights" value={stats.total} color="blue" />
        <MetricCard label="With Loadsheet" value={stats.withLoadsheet} color="emerald" />
        <MetricCard label="Finalized" value={stats.finalized} color="purple" />
        <MetricCard label="Draft" value={stats.draft} color={stats.draft > 0 ? "amber" : "emerald"} />
      </div>

      {/* Date Quick Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date:</span>
        <button
          type="button"
          onClick={() => navigateDate(today)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            date === today ? "bg-sky-600 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
          }`}
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => navigateDate(tomorrow)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            date === tomorrow ? "bg-sky-600 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
          }`}
        >
          Tomorrow
        </button>
        <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />
        <DatePicker
          value={date}
          onChange={(d) => navigateDate(d)}
          label=""
        />
        {isOps && flights.length > 0 && (
          <Button
            color="primary"
            onClick={() => {
              const ids = flights
                .filter((f) => f.loadsheet_id)
                .map((f) => f.flight_id);
              ids.forEach((id, i) => {
                setTimeout(() => {
                  window.open(`/ops/flight/${id}/loadsheet/print`, `_blank_${id}`, "width=1024,height=768");
                }, i * 500);
              });
            }}
          >
            Print All ({flights.filter((f) => f.loadsheet_id).length})
          </Button>
        )}
      </div>

      {/* Flights Table */}
      {sortedFlights.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-12 text-center">
          <EmptyState
            title={isPilot && !showAll ? "No loadsheets assigned to you for this date" : "No flights scheduled for this date"}
            description="Select a different date or toggle the view."
          />
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              Flights
              <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
                ({sortedFlights.length})
              </span>
            </h2>
          </div>
          <DataTable
            columns={columns}
            data={sortedFlights}
            keyExtractor={(f) => f.flight_id}
            sortable
            onSort={(col, dir) => { setSortColumn(col); setSortDirection(dir); }}
            emptyState={<EmptyState title="No flights to display" />}
            actions={(f) => (
              <Link
                to={`/ops/flight/${f.flight_id}/loadsheet`}
                className="text-sky-600 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300 font-medium text-xs"
              >
                {f.loadsheet_status ? "View" : "Generate"}
              </Link>
            )}
            rowClassName={(f) => {
              if (!f.loadsheet_status) return "bg-amber-50/30 dark:bg-amber-950/20";
              if (f.loadsheet_status === "draft") return "bg-amber-50/20 dark:bg-amber-950/10";
              return undefined;
            }}
          />
        </div>
      )}
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
