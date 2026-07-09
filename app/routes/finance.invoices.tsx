import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link , useRouteError, isRouteErrorResponse } from "@remix-run/react";
import DataGrid from "../components/DataGrid";
import { requirePermission } from "../utils/permissions.server";
import { Permission, DEFAULT_PAGE_SIZE } from "../utils/constants";
import { db } from "../utils/db.server";
import { requireUser } from "../utils/layout.server";
import PageHeader from "../components/PageHeader";
import type { Column } from "../components/DataTable";
import InvoiceStatusBadge from "../components/InvoiceStatusBadge";
import Pagination from "../components/Pagination";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import Card from "../components/Card";

interface InvoiceRow {
  id: string;
  invoice_number: string;
  booking_reference: string | null;
  organization_name: string | null;
  issue_date: string;
  due_date: string;
  total_gbp: number;
  status: string;
}

interface InvoicesData {
  invoices: InvoiceRow[];
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
    whereClause = "WHERE i.status = $1";
    params.push(status);
  }

  // Count total
  const countResult = await db.query(
    `SELECT COUNT(*)::int AS total FROM invoices i ${whereClause}`,
    params
  );
  const total = Number(countResult.rows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));

  // Fetch page
  const dataParams = [...params, DEFAULT_PAGE_SIZE, offset];
  const dataResult = await db.query(
    `SELECT i.id, i.invoice_number, b.booking_reference,
            o.name AS organization_name,
            i.issue_date, i.due_date, i.total_gbp, i.status
     FROM invoices i
     LEFT JOIN bookings b ON b.id = i.booking_id
     LEFT JOIN organizations o ON o.id = i.organization_id
     ${whereClause}
     ORDER BY i.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    dataParams
  );
  const invoices = dataResult.rows as unknown as InvoiceRow[];

  return json<InvoicesData>({
    invoices,
    currentPage: page,
    totalPages,
    currentStatus: status,
  });
}

export default function InvoiceList() {
  const data = useLoaderData<typeof loader>();

  const columns: Column<InvoiceRow>[] = [
    {
      key: "invoice_number",
      header: "Invoice #",
      sortable: true,
      render: (inv) => (
        <Link
          to={`/finance/invoices/${inv.id}`}
          className="text-sm/5 font-medium text-cyan-600 hover:text-cyan-700"
        >
          {inv.invoice_number}
        </Link>
      ),
    },
    {
      key: "booking_reference",
      header: "Booking",
      render: (inv) => (
        <span className="text-sm/5 text-slate-700 dark:text-slate-200">
          {inv.booking_reference ?? "—"}
        </span>
      ),
    },
    {
      key: "organization_name",
      header: "Organization",
      render: (inv) => (
        <span className="text-sm/5 text-slate-700 dark:text-slate-200">
          {inv.organization_name ?? "—"}
        </span>
      ),
    },
    {
      key: "issue_date",
      header: "Issue Date",
      sortable: true,
      render: (inv) => (
        <span className="text-sm/5 text-slate-500 dark:text-slate-400 tabular-nums">
          {inv.issue_date ? new Date(inv.issue_date).toLocaleDateString() : "—"}
        </span>
      ),
    },
    {
      key: "due_date",
      header: "Due Date",
      sortable: true,
      render: (inv) => (
        <span className="text-sm/5 text-slate-500 dark:text-slate-400 tabular-nums">
          {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "—"}
        </span>
      ),
    },
    {
      key: "total_gbp",
      header: "Total",
      sortable: true,
      className: "text-right",
      render: (inv) => (
        <span className="text-sm/5 font-medium text-slate-900 dark:text-slate-100 tabular-nums">
          £{Number(inv.total_gbp).toFixed(2)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (inv) => <InvoiceStatusBadge status={inv.status} />,
    },
    {
      key: "actions",
      header: "Actions",
      render: (inv) => (
        <Link
          to={`/finance/invoices/${inv.id}`}
          className="text-sm/5 font-medium text-cyan-600 hover:text-cyan-700"
        >
          View
        </Link>
      ),
    },
  ];

  const statusOptions = [
    { value: "", label: "All Statuses" },
    { value: "draft", label: "Draft" },
    { value: "issued", label: "Issued" },
    { value: "paid", label: "Paid" },
    { value: "overdue", label: "Overdue" },
    { value: "cancelled", label: "Cancelled" },
    { value: "written_off", label: "Written Off" },
  ];

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Invoices"
        description="Manage and view all invoices"
        actions={
          <Button
            variant="outlined"
            onClick={() => {
              const rows = data.invoices as Array<Record<string, unknown>>;
              const headers = ["Invoice #", "Booking", "Issue Date", "Due Date", "Total", "Status"];
              const csv = [
                headers.join(","),
                ...rows.map((r) => [
                  r.invoiceNumber, r.booking_reference ?? "", r.issue_date ?? "",
                  r.due_date ?? "", r.total_gbp ?? "", r.status ?? "",
                ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
              ].join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = `invoices_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
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
              const url = val ? `/finance/invoices?status=${val}` : "/finance/invoices";
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

      {/* Invoices table */}
      <Card>
        {data.invoices.length > 0 ? (
          <DataGrid
            columns={columns}
            data={data.invoices}
            keyExtractor={(inv) => inv.id}
            enableSort
            enableFilters
            initialSortColumn="issue_date"
            initialSortDirection="desc"
            rowClassName={(inv) => inv.status === 'overdue' ? 'bg-red-50/30 dark:bg-red-950/20' : undefined}
          />
        ) : (
          <EmptyState
            title="No invoices found"
            description={
              data.currentStatus
                ? `No invoices with status "${data.currentStatus}".`
                : "No invoices have been created yet."
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
              ? `/finance/invoices?status=${data.currentStatus}`
              : "/finance/invoices"
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