import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSearchParams , useRouteError, isRouteErrorResponse } from "@remix-run/react";

import { useState } from "react";
import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import { requireUser } from "../utils/layout.server";
import PageHeader from "../components/PageHeader";
import DataTable from "../components/DataTable";
import type { Column } from "../components/DataTable";
import Card from "../components/Card";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import DateRangePicker from "../components/DateRangePicker";

interface DailySalesRow {
  entry_date: string;
  total_debit: number;
  total_credit: number;
}

interface DailySalesData {
  rows: DailySalesRow[];
  totalDebit: number;
  totalCredit: number;
  netTotal: number;
  dateFrom: string;
  dateTo: string;
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  await requirePermission(request, Permission.FINANCE_VIEW);

  const url = new URL(request.url);
  const dateFrom = url.searchParams.get("dateFrom") || "";
  const dateTo = url.searchParams.get("dateTo") || "";

  let rows: DailySalesRow[];

  if (dateFrom && dateTo) {
    const result = await sql<DailySalesRow>`
      SELECT aje.entry_date,
              COALESCE(SUM(ajl.debit_amount_gbp), 0) AS total_debit,
              COALESCE(SUM(ajl.credit_amount_gbp), 0) AS total_credit
       FROM accounting_journal_entries aje
       JOIN accounting_journal_lines ajl ON ajl.entry_id = aje.id
       WHERE aje.entry_date >= ${dateFrom} AND aje.entry_date <= ${dateTo} AND aje.posting_date IS NOT NULL
       GROUP BY aje.entry_date
       ORDER BY aje.entry_date DESC
    `.execute(kdb);
    rows = result.rows as unknown as DailySalesRow[];
  } else if (dateFrom) {
    const result = await sql<DailySalesRow>`
      SELECT aje.entry_date,
              COALESCE(SUM(ajl.debit_amount_gbp), 0) AS total_debit,
              COALESCE(SUM(ajl.credit_amount_gbp), 0) AS total_credit
       FROM accounting_journal_entries aje
       JOIN accounting_journal_lines ajl ON ajl.entry_id = aje.id
       WHERE aje.entry_date >= ${dateFrom} AND aje.posting_date IS NOT NULL
       GROUP BY aje.entry_date
       ORDER BY aje.entry_date DESC
    `.execute(kdb);
    rows = result.rows as unknown as DailySalesRow[];
  } else if (dateTo) {
    const result = await sql<DailySalesRow>`
      SELECT aje.entry_date,
              COALESCE(SUM(ajl.debit_amount_gbp), 0) AS total_debit,
              COALESCE(SUM(ajl.credit_amount_gbp), 0) AS total_credit
       FROM accounting_journal_entries aje
       JOIN accounting_journal_lines ajl ON ajl.entry_id = aje.id
       WHERE aje.entry_date <= ${dateTo} AND aje.posting_date IS NOT NULL
       GROUP BY aje.entry_date
       ORDER BY aje.entry_date DESC
    `.execute(kdb);
    rows = result.rows as unknown as DailySalesRow[];
  } else {
    const result = await sql<DailySalesRow>`
      SELECT aje.entry_date,
              COALESCE(SUM(ajl.debit_amount_gbp), 0) AS total_debit,
              COALESCE(SUM(ajl.credit_amount_gbp), 0) AS total_credit
       FROM accounting_journal_entries aje
       JOIN accounting_journal_lines ajl ON ajl.entry_id = aje.id
       WHERE aje.posting_date IS NOT NULL
       GROUP BY aje.entry_date
       ORDER BY aje.entry_date DESC
    `.execute(kdb);
    rows = result.rows as unknown as DailySalesRow[];
  }

  const totalDebit = rows.reduce((sum, r) => sum + Number(r.total_debit), 0);
  const totalCredit = rows.reduce((sum, r) => sum + Number(r.total_credit), 0);
  const netTotal = totalDebit - totalCredit;

  return json<DailySalesData>({
    rows,
    totalDebit,
    totalCredit,
    netTotal,
    dateFrom,
    dateTo,
  });
}

export default function DailySalesReport() {
  const data = useLoaderData<typeof loader>();
  const [, setSearchParams] = useSearchParams();
  const [dateFrom, setDateFrom] = useState(data.dateFrom);
  const [dateTo, setDateTo] = useState(data.dateTo);

  const columns: Column<DailySalesRow>[] = [
    {
      key: "entry_date",
      header: "Date",
      render: (r) => (
        <span className="text-sm/5 font-medium text-slate-900 dark:text-slate-100 tabular-nums">
          {r.entry_date ? new Date(r.entry_date).toLocaleDateString("en-GB") : "—"}
        </span>
      ),
    },
    {
      key: "total_debit",
      header: "Debit Total",
      className: "text-right",
      render: (r) => (
        <span className="text-sm/5 text-slate-900 dark:text-slate-100 tabular-nums">
          Â£{Number(r.total_debit).toFixed(2)}
        </span>
      ),
    },
    {
      key: "total_credit",
      header: "Credit Total",
      className: "text-right",
      render: (r) => (
        <span className="text-sm/5 text-slate-900 dark:text-slate-100 tabular-nums">
          Â£{Number(r.total_credit).toFixed(2)}
        </span>
      ),
    },
    {
      key: "net",
      header: "Net",
      className: "text-right",
      render: (r) => {
        const net = Number(r.total_debit) - Number(r.total_credit);
        return (
          <span
            className={`text-sm/5 font-medium tabular-nums ${net >= 0 ? "text-green-600" : "text-red-600"
              }`}
          >
            Â£{net.toFixed(2)}
          </span>
        );
      },
    },
  ];

  const handleFilter = () => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    setSearchParams(params, { replace: true });
  };

  const handleDateChange = (range: { dateFrom: string; dateTo: string }) => {
    setDateFrom(range.dateFrom);
    setDateTo(range.dateTo);
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Daily Sales Report"
        description="View daily sales totals with debit and credit breakdowns"
        actions={
          <Button
            variant="outlined"
            onClick={() => {
              const headers = ["Date", "Debit", "Credit", "Net"];
              const csv = [
                headers.join(","),
                ...data.rows.map((r: Record<string, unknown>) => [
                  r.entry_date, r.total_debit, r.total_credit,
                  Number(r.total_credit ?? 0) - Number(r.total_debit ?? 0),
                ].map((v) => `"${String(v)}"`).join(",")),
              ].join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = `daily_sales_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export CSV
          </Button>
        }
      />

      {/* Date Range Filter */}
      <Card>
        <div className="flex items-end gap-4">
          <div>
            <span className="block text-sm/5 font-medium text-slate-700 dark:text-slate-200 mb-1">
              Date Range
            </span>
            <DateRangePicker
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateChange={handleDateChange}
            />
          </div>
          <Button onClick={handleFilter}>Filter</Button>
        </div>
      </Card>

      {/* Sales Data Table */}
      <Card>
        {data.rows.length > 0 ? (
          <>
            <DataTable
              columns={columns}
              data={data.rows}
              keyExtractor={(r) => r.entry_date}
            />

            {/* Totals Row */}
            <div className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-4">
              <div className="grid grid-cols-4 gap-4 text-sm/5">
                <div className="font-medium text-slate-700 dark:text-slate-200">Totals:</div>
                <div className="text-right font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  Â£{data.totalDebit.toFixed(2)}
                </div>
                <div className="text-right font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  Â£{data.totalCredit.toFixed(2)}
                </div>
                <div
                  className={`text-right font-bold tabular-nums ${data.netTotal >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                >
                  Â£{data.netTotal.toFixed(2)}
                </div>
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            title="No sales data found"
            description="No journal entries found for the selected date range."
          />
        )}
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
