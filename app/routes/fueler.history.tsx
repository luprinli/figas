import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";

import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import EmptyState from "../components/EmptyState";

export const meta: MetaFunction = () => [{ title: "Order History - FIGAS" }];

export async function loader({ request }: LoaderFunctionArgs) {
    await requirePermission(request, Permission.FLIGHT_FUEL_EXECUTE);

    let orders: Record<string, unknown>[] = [];
    try {
        const result = await sql<Record<string, unknown>>`
            SELECT fo.id, fo.flight_id, fo.status, fo.requested_fuel_kg,
                   fo.fueler_actual_uplift_kg, fo.fueler_confirmed_at,
                   fo.issued_at, fo.fueler_notes,
                   f.flight_number,
                   COALESCE(a.registration, 'Unassigned') AS aircraft_registration
            FROM fuel_orders fo
            JOIN flights f ON f.id = fo.flight_id
            LEFT JOIN aircraft a ON a.id = f.aircraft_id
            ORDER BY fo.fueler_confirmed_at DESC NULLS LAST, fo.issued_at DESC
            LIMIT 50
        `.execute(kdb);
        orders = result.rows;
    } catch {
        orders = [];
    }

    return json({ orders });
}

export default function FuelerHistory() {
    const { orders } = useLoaderData<typeof loader>();

    return (
        <div className="p-6 space-y-5">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Order History</h1>

            {orders.length === 0 ? (
                <EmptyState title="No orders yet" description="Fuel orders will appear here once processed." />
            ) : (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800">
                                    <th className="py-2 px-3 font-medium">Flight</th>
                                    <th className="py-2 px-3 font-medium">Aircraft</th>
                                    <th className="py-2 px-3 font-medium">Requested</th>
                                    <th className="py-2 px-3 font-medium">Actual</th>
                                    <th className="py-2 px-3 font-medium">Status</th>
                                    <th className="py-2 px-3 font-medium">Completed</th>
                                    <th className="py-2 px-3 font-medium">Notes</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {(orders as Array<Record<string, unknown>>).map((o) => (
                                    <tr key={o.id as number} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                        <td className="py-2 px-3 text-slate-800 dark:text-slate-200 font-medium">{o.flight_number as string}</td>
                                        <td className="py-2 px-3 text-slate-500 dark:text-slate-400">{o.aircraft_registration as string}</td>
                                        <td className="py-2 px-3 text-slate-600 dark:text-slate-400 tabular-nums">{o.requested_fuel_kg as number} kg</td>
                                        <td className="py-2 px-3 text-slate-600 dark:text-slate-400 tabular-nums">
                                            {o.fueler_actual_uplift_kg != null ? `${o.fueler_actual_uplift_kg} kg` : "—"}
                                        </td>
                                        <td className="py-2 px-3">
                                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                                o.status === "completed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                                                o.status === "issued" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                                                o.status === "fueling" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                                                "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                                            }`}>
                                                {o.status as string}
                                            </span>
                                        </td>
                                        <td className="py-2 px-3 text-slate-500 dark:text-slate-400 text-xs">
                                            {o.fueler_confirmed_at != null
                                                ? new Date(o.fueler_confirmed_at as string).toLocaleDateString("en-GB")
                                                : "—"}
                                        </td>
                                        <td className="py-2 px-3 text-slate-500 dark:text-slate-400 text-xs max-w-[200px] truncate">
                                            {o.fueler_notes != null ? String(o.fueler_notes) : "—"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

export function ErrorBoundary() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-red-600">Something went wrong</h1>
        <p className="mt-2 text-gray-600">An unexpected error occurred. Please try again.</p>
      </div>
    </div>
  );
}
