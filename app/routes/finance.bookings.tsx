import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { db } from "../utils/db.server";
import DataTable from "../components/DataTable";
import type { Column } from "../components/DataTable";
import StatusBadge from "../components/StatusBadge";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import Card from "../components/Card";
import DatePicker from "../components/DatePicker";

export async function loader({ request }: LoaderFunctionArgs) {
  await requirePermission(request, Permission.FINANCE_VIEW);
  const url = new URL(request.url);
  const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);

  const result = await db.query(
    `SELECT b.id, b.booking_reference, b.status, b.total_amount_gbp, b.created_at,
       COALESCE(bl.origin_code, '—') AS origin_code, COALESCE(bl.destination_code, '—') AS destination_code,
       bp.first_name, bp.last_name
 FROM bookings b
 LEFT JOIN booking_legs bl ON bl.booking_id = b.id AND bl.leg_sequence = 1
 LEFT JOIN LATERAL (
   SELECT first_name, last_name FROM booking_passengers WHERE booking_id = b.id LIMIT 1
 ) bp ON true
 WHERE b.created_at::date = $1
 ORDER BY b.created_at DESC
 LIMIT 100`,
    [date]
  );

  return json({ bookings: result.rows, date });
}

export default function FinanceBookings() {
  const { bookings, date } = useLoaderData<typeof loader>();
  const [, setSearchParams] = useSearchParams();

  const columns: Column<Record<string, unknown>>[] = [
    { key: "booking_reference", header: "Reference", sortable: true, render: (r) => (
      <span className="font-medium text-slate-800 dark:text-slate-100">{r.booking_reference as string}</span>
    )},
    { key: "passenger", header: "Passenger", render: (r) => (
      <span className="text-slate-600 dark:text-slate-300">{r.first_name ? `${r.first_name} ${r.last_name}` : '—'}</span>
    )},
    { key: "route", header: "Route", render: (r) => (
      <span className="text-slate-600 dark:text-slate-300">{r.origin_code as string} → {r.destination_code as string}</span>
    )},
    { key: "status", header: "Status", sortable: true, render: (r) => <StatusBadge status={r.status as string} /> },
    { key: "total_amount_gbp", header: "Total", sortable: true, className: "text-right", render: (r) => (
      <span className="tabular-nums font-medium">{r.total_amount_gbp ? `£${Number(r.total_amount_gbp).toLocaleString()}` : '—'}</span>
    )},
  ];

  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Bookings" description="Read-only operational view — no modifications available" />
      <Card>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Date:</span>
          <DatePicker value={date} onChange={(d) => setSearchParams({ date: d })} label="" />
        </div>
        <DataTable
          columns={columns}
          data={bookings as Record<string, unknown>[]}
          keyExtractor={(r) => String(r.id)}
          sortable
          emptyState={<EmptyState title="No bookings for this date" />}
        />
      </Card>
    </div>
  );
}
