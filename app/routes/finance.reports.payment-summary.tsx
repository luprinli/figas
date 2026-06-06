import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { db } from "../utils/db.server";
import PageHeader from "../components/PageHeader";
import DataTable from "../components/DataTable";
import type { Column } from "../components/DataTable";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";

export async function loader({ request }: LoaderFunctionArgs) {
  await requirePermission(request, Permission.FINANCE_VIEW);
  const result = await db.query(
    `SELECT p.payment_method, COUNT(*)::int AS count, COALESCE(SUM(p.amount_gbp), 0) AS total
     FROM payments p WHERE p.status = 'succeeded'
     GROUP BY p.payment_method ORDER BY total DESC`
  );
  return json({ summary: result.rows });
}

export default function PaymentSummaryReport() {
  const { summary } = useLoaderData<typeof loader>();
  const data = summary as Array<Record<string, unknown>>;
  const columns: Column<Record<string, unknown>>[] = [
    { key: "payment_method", header: "Method", sortable: true },
    { key: "count", header: "Count", sortable: true },
    { key: "total", header: "Total (£)", sortable: true, render: (r) => `£${Number(r.total).toLocaleString()}` },
  ];
  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Payment Summary" description="Revenue breakdown by payment method" />
      <Card>
        <DataTable columns={columns} data={data}                 keyExtractor={(item) => String(item.payment_method)}
                emptyState={<EmptyState title="No payment data" />} />
      </Card>
    </div>
  );
}
