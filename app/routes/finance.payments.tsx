import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { useCallback } from "react";
import DataGrid from "../components/DataGrid";
import { requirePermission } from "../utils/permissions.server";
import { Permission, DEFAULT_PAGE_SIZE } from "../utils/constants";
import { db } from "../utils/db.server";
import { requireUser } from "../utils/layout.server";
import PageHeader from "../components/PageHeader";
import type { Column } from "../components/DataTable";
import PaymentStatusBadge from "../components/PaymentStatusBadge";
import Pagination from "../components/Pagination";
import EmptyState from "../components/EmptyState";
import Button from "../components/Button";
import Card from "../components/Card";

interface PaymentRow {
  id: string;
  booking_reference: string | null;
  booking_id: string | null;
  amount_gbp: number;
  payment_method: string;
  status: string;
  created_at: string;
}

interface PaymentsData {
  payments: PaymentRow[];
  currentPage: number;
  totalPages: number;
  currentStatus: string | null;
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  await requirePermission(request, Permission.FINANCE_VIEW);

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const status = url.searchParams.get("status") || null;
  const offset = (page - 1) * DEFAULT_PAGE_SIZE;

  let whereClause = "";
  const params: unknown[] = [];

  if (status) {
    whereClause = "WHERE p.status = $1";
    params.push(status);
  }

  // Count total
  const countResult = await db.query(
    `SELECT COUNT(*)::int AS total FROM payments p ${whereClause}`,
    params
  );
  const total = Number(countResult.rows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));

  // Fetch page
  const dataParams = [...params, DEFAULT_PAGE_SIZE, offset];
  const dataResult = await db.query(
    `SELECT p.id, b.booking_reference, b.id AS booking_id,
            p.amount_gbp, p.payment_method, p.status, p.created_at
     FROM payments p
     LEFT JOIN bookings b ON b.id = p.booking_id
     ${whereClause}
     ORDER BY p.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    dataParams
  );
  const payments = dataResult.rows as unknown as PaymentRow[];

  return json<PaymentsData>({
    payments,
    currentPage: page,
    totalPages,
    currentStatus: status,
  });
}

export default function PaymentList() {
  const data = useLoaderData<typeof loader>();

  const columns: Column<PaymentRow>[] = [
    {
      key: "booking_reference",
      header: "Booking Ref",
      render: (p) => (
        <span className="text-sm/5 font-medium text-slate-900 dark:text-slate-100">
          {p.booking_reference ?? "—"}
        </span>
      ),
    },
    {
      key: "amount_gbp",
      header: "Amount",
      sortable: true,
      className: "text-right",
      render: (p) => (
        <span className="text-sm/5 font-medium text-slate-900 dark:text-slate-100 tabular-nums">
          £{Number(p.amount_gbp).toFixed(2)}
        </span>
      ),
    },
    {
      key: "payment_method",
      header: "Method",
      render: (p) => (
        <span className="text-sm/5 text-slate-700 dark:text-slate-200">
          {p.payment_method?.replace(/_/g, " ") ?? "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (p) => <PaymentStatusBadge status={p.status} />,
    },
    {
      key: "created_at",
      header: "Date",
      sortable: true,
      render: (p) => (
        <span className="text-sm/5 text-slate-500 dark:text-slate-400 tabular-nums">
          {p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (p) =>
        p.booking_id ? (
          <Link
            to={`/operations/bookings/${p.booking_id}`}
            className="text-sm/5 font-medium text-cyan-600 hover:text-cyan-700"
          >
            View Booking
          </Link>
        ) : (
          <span className="text-sm/5 text-slate-500 dark:text-slate-400 dark:text-slate-500">—</span>
        ),
    },
  ];

  const statusOptions = [
    { value: "", label: "All Statuses" },
    { value: "pending", label: "Pending" },
    { value: "processing", label: "Processing" },
    { value: "paid", label: "Paid" },
    { value: "partially_paid", label: "Partially Paid" },
    { value: "invoiced", label: "Invoiced" },
    { value: "overdue", label: "Overdue" },
    { value: "refunded", label: "Refunded" },
    { value: "failed", label: "Failed" },
    { value: "cancelled", label: "Cancelled" },
  ];

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Payments"
        description="View and manage all payments"
        actions={
          <Button
            variant="outlined"
            onClick={() => {
              const rows = data.payments as Array<Record<string, unknown>>;
              const headers = ["Booking", "Amount", "Method", "Status", "Date"];
              const csv = [
                headers.join(","),
                ...rows.map((r) => [
                  r.booking_reference ?? "", r.amount_gbp ?? "",
                  r.payment_method ?? "", r.status ?? "", r.created_at ?? "",
                ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
              ].join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = `payments_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export CSV
          </Button>
        }
      />

      {/* Status filter */}
      <Card>
        <div className="flex items-center gap-4">
          <label htmlFor="status-filter" className="text-sm/5 font-medium text-slate-700 dark:text-slate-200">
            Filter by Status:
          </label>
          <select
            id="status-filter"
            defaultValue={data.currentStatus ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              const url = val ? `/finance/payments?status=${val}` : "/finance/payments";
              window.location.href = url;
            }}
            className="block rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm/5 text-slate-900 dark:text-slate-100 shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {/* Payments table */}
      <Card>
        {data.payments.length > 0 ? (
          <DataGrid
            columns={columns}
            data={data.payments}
            keyExtractor={(p) => p.id}
            enableSort
            enableFilters
            initialSortColumn="created_at"
            initialSortDirection="desc"
          />
        ) : (
          <EmptyState
            title="No payments found"
            description={
              data.currentStatus
                ? `No payments with status "${data.currentStatus}".`
                : "No payments have been recorded yet."
            }
          />
        )}
      </Card>

      {data.totalPages > 1 && (
        <Pagination
          currentPage={data.currentPage}
          totalPages={data.totalPages}
          baseUrl={
            data.currentStatus
              ? `/finance/payments?status=${data.currentStatus}`
              : "/finance/payments"
          }
        />
      )}
    </div>
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