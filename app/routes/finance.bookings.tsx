import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import DataGrid from "../components/DataGrid";
import type { Column } from "../components/DataTable";
import EmptyState from "../components/EmptyState";
import Card from "../components/Card";

export const meta: MetaFunction = () => [{ title: "Finance Bookings - FIGAS" }];

export async function loader({ request }: LoaderFunctionArgs) {
  await requirePermission(request, Permission.FINANCE_VIEW);

  const result = await sql<Record<string, unknown>>`
    SELECT b.*, u.name AS user_name
 FROM bookings b
 JOIN users u ON u.id = b.user_id
 ORDER BY b.created_at DESC
 LIMIT 200
  `.execute(kdb);

  return json({ bookings: result.rows });
}

export default function FinanceBookings() {
  const { bookings } = useLoaderData<typeof loader>();

  const columns: Column<Record<string, unknown>>[] = [
    { key: "booking_reference", header: "Reference", sortable: true },
    { key: "user_name", header: "Client", sortable: true },
    { key: "status", header: "Status", sortable: true },
    { key: "payment_status", header: "Payment", sortable: true },
    { key: "total_amount_gbp", header: "Total (GBP)", sortable: true },
    { key: "created_at", header: "Created", sortable: true },
  ];

  return (
    <div className="p-6 space-y-5">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Bookings</h1>
      <Card>
        <DataGrid
          columns={columns}
          data={bookings as Record<string, unknown>[]}
          keyExtractor={(r) => String(r.id)}
          enableSort
          enableFilters
          initialSortColumn="created_at"
          initialSortDirection="desc"
          emptyState={<EmptyState title="No bookings found" />}
        />
      </Card>
    </div>
  );
}
