import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData , useRouteError, isRouteErrorResponse } from "@remix-run/react";

import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import { requireUser } from "../utils/layout.server";
import PageHeader from "../components/PageHeader";
import Card from "../components/Card";
import AgingReceivablesTable from "../components/AgingReceivablesTable";
import type { AgingReceivablesBuckets } from "../components/AgingReceivablesTable";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";

interface AgingData {
  buckets: AgingReceivablesBuckets;
  totalOverdue: number;
}

function buildAgingBuckets(rows: Array<{ bucket: string; count: number; total_amount: number }>): AgingReceivablesBuckets {
  const buckets: AgingReceivablesBuckets = {
    "0-30": { count: 0, total: 0 },
    "31-60": { count: 0, total: 0 },
    "61-90": { count: 0, total: 0 },
    "90+": { count: 0, total: 0 },
  };

  for (const row of rows) {
    if (row.bucket === "0-30 days") {
      buckets["0-30"] = { count: row.count, total: Number(row.total_amount) };
    } else if (row.bucket === "31-60 days") {
      buckets["31-60"] = { count: row.count, total: Number(row.total_amount) };
    } else if (row.bucket === "61-90 days") {
      buckets["61-90"] = { count: row.count, total: Number(row.total_amount) };
    } else if (row.bucket === "90+ days") {
      buckets["90+"] = { count: row.count, total: Number(row.total_amount) };
    }
  }

  return buckets;
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  await requirePermission(request, Permission.FINANCE_VIEW);

  // Aging buckets
  const agingResult = await sql<{ bucket: string; count: number; total_amount: number }>`
    SELECT
       CASE
         WHEN CURRENT_DATE - due_date::date <= 30 THEN '0-30 days'
         WHEN CURRENT_DATE - due_date::date <= 60 THEN '31-60 days'
         WHEN CURRENT_DATE - due_date::date <= 90 THEN '61-90 days'
         ELSE '90+ days'
       END AS bucket,
       COUNT(*)::int AS count,
       SUM(amount_due_gbp) AS total_amount
     FROM invoices
     WHERE status = ${"issued"}
       AND due_date < CURRENT_DATE
     GROUP BY bucket
     ORDER BY bucket
  `.execute(kdb);

  const buckets = buildAgingBuckets(agingResult.rows);
  const totalOverdue = Object.values(buckets).reduce((sum, b) => sum + b.total, 0);

  return json<AgingData>({ buckets, totalOverdue });
}

export default function AgingReport() {
  const data = useLoaderData<typeof loader>();

  const hasData = Object.values(data.buckets).some((b) => b.count > 0);

  // Build CSV export URL
  const csvData = (() => {
    if (!hasData) return "";
    const headers = "Bucket,Count,Total Amount\n";
    const rows = Object.entries(data.buckets).map(([key, bucket]) => {
      return `${key},${bucket.count},£${bucket.total.toFixed(2)}`;
    });
    return encodeURIComponent(headers + rows.join("\n"));
  })();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Aging Report"
        description="Aging receivables summary grouped by aging buckets"
        actions={
          hasData ? (
            <a
              href={`data:text/csv;charset=utf-8,${csvData}`}
              download="aging-report.csv"
            >
              <Button variant="outlined">Export CSV</Button>
            </a>
          ) : undefined
        }
      />

      <Card title="Aging Receivables">
        {hasData ? (
          <>
            <AgingReceivablesTable buckets={data.buckets} />

            <div className="mt-4 text-sm/5 text-slate-500 dark:text-slate-400 dark:text-slate-500">
              <p>
                <strong>Total Overdue:</strong>{" "}
                <span className="tabular-nums">
                  £{data.totalOverdue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </p>
              <p className="mt-1">
                This report shows outstanding invoices grouped by the number of days past due.
              </p>
            </div>
          </>
        ) : (
          <EmptyState
            title="No overdue invoices"
            description="There are currently no overdue invoices to report."
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
