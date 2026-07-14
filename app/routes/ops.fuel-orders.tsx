import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, Link } from "@remix-run/react";

import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { requireUser } from "../utils/layout.server";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import {
    listPendingFuelOrders,
    recordActualFuel as recordFuelUplift,
} from "../utils/services/fuel-order.service";
import EmptyState from "../components/EmptyState";

export const meta: MetaFunction = () => [{ title: "Fuel Orders - FIGAS" }];

export async function loader({ request }: LoaderFunctionArgs) {
    await requirePermission(request, Permission.FLIGHT_FUEL_EXECUTE);

    let enrichedOrders: Array<{ id: number; flightId: number; status: string; requestedFuelKg: number; issuedAt: string | null; flightNumber: string; aircraftRegistration: string }> = [];
    try {
        const orders = await listPendingFuelOrders();

        enrichedOrders = await Promise.all(
            orders.map(async (o) => {
                const flight = await sql<{ flight_number: string; aircraft_registration: string }>`
                    SELECT f.flight_number, COALESCE(a.registration, 'Unassigned') AS aircraft_registration
                    FROM flights f
                    LEFT JOIN aircraft a ON a.id = f.aircraft_id
                    WHERE f.id = ${o.flightId}
                `.execute(kdb);

                return {
                    id: o.id,
                    flightId: o.flightId,
                    status: o.status,
                    requestedFuelKg: o.requestedFuelKg,
                    issuedAt: o.issuedAt,
                    flightNumber: flight.rows.length > 0 ? flight.rows[0].flight_number : `Flight #${o.flightId}`,
                    aircraftRegistration: flight.rows.length > 0 ? flight.rows[0].aircraft_registration : "Unassigned",
                };
            })
        );
    } catch {
        enrichedOrders = [];
    }

    return json({ orders: enrichedOrders });
}

export async function action({ request }: ActionFunctionArgs) {
    const { userId } = await requireUser(request);

    const formData = await request.formData();
    const intent = formData.get("intent")?.toString();

    if (intent === "record-uplift") {
        const orderId = Number(formData.get("orderId"));
        const actualKg = Number(formData.get("actualKg"));
        if (!orderId || !actualKg) {
            return json({ error: "Order ID and actual uplift are required" }, { status: 400 });
        }
        const notes = formData.get("notes")?.toString() ?? "";
        await recordFuelUplift(orderId, Number(userId), actualKg, notes);
        return json({ success: true, message: "Fuel uplift recorded" });
    }

    return json({ error: "Unknown intent" }, { status: 400 });
}

export default function FuelOrdersDashboard() {
    const { orders } = useLoaderData<typeof loader>();
    const fetcher = useFetcher<{ success?: boolean; error?: string }>();

    return (
        <div className="p-6 space-y-5">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Fuel Orders</h1>

            {fetcher.data?.error && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 p-3">
                    <p className="text-sm text-red-600 dark:text-red-400">{fetcher.data.error}</p>
                </div>
            )}

            {orders.length === 0 ? (
                <EmptyState title="No pending fuel orders" description="All fuel orders have been completed or no orders have been issued." />
            ) : (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
                    <div className="divide-y divide-slate-200 dark:divide-slate-700">
                        {orders.map((o) => (
                            <div key={o.id} className="px-4 py-3 flex items-center justify-between">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                                            {o.flightNumber}
                                        </span>
                                        <span className="text-xs text-slate-500 dark:text-slate-400">
                                            {o.aircraftRegistration}
                                        </span>
                                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                            o.status === "issued" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                                            "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                        }`}>
                                            {o.status}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                        Requested: {o.requestedFuelKg} kg
                                        {o.issuedAt ? ` · Issued ${new Date(o.issuedAt).toLocaleString("en-GB")}` : ""}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <fetcher.Form method="post" className="flex items-center gap-2">
                                        <input type="hidden" name="intent" value="record-uplift" />
                                        <input type="hidden" name="orderId" value={o.id} />
                                        <input
                                            type="number"
                                            name="actualKg"
                                            step="0.1"
                                            required
                                            className="w-24 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-xs text-slate-800 dark:text-slate-100"
                                            placeholder="kg"
                                        />
                                        <button
                                            type="submit"
                                            className="rounded bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400"
                                        >
                                            Record
                                        </button>
                                    </fetcher.Form>
                                    <Link
                                        to={`/pilot/flight/${o.flightId}/fuel`}
                                        className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400"
                                    >
                                        View
                                    </Link>
                                </div>
                            </div>
                        ))}
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
