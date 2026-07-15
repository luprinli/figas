import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, Link } from "@remix-run/react";

import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import { requireUser } from "../utils/layout.server";
import { recordActualFuel } from "../utils/services/fuel-order.service";
import EmptyState from "../components/EmptyState";
import { TourTrigger } from "../components/TourTrigger";
import { fuelerOrdersTour } from "../utils/tour/definitions/fueler-orders";

export const meta: MetaFunction = () => [{ title: "Fuel Orders - FIGAS" }];

export async function loader({ request }: LoaderFunctionArgs) {
    await requirePermission(request, Permission.FLIGHT_FUEL_EXECUTE);

    let orders: Record<string, unknown>[] = [];
    try {
        const result = await sql<Record<string, unknown>>`
            SELECT fo.id, fo.flight_id, fo.status, fo.requested_fuel_kg,
                   fo.issued_at, fo.flight_leg_id,
                   f.flight_number,
                   COALESCE(a.registration, 'Unassigned') AS aircraft_registration
            FROM fuel_orders fo
            JOIN flights f ON f.id = fo.flight_id
            LEFT JOIN aircraft a ON a.id = f.aircraft_id
            WHERE fo.status IN ('issued', 'fueling')
            ORDER BY fo.issued_at ASC
        `.execute(kdb);
        orders = result.rows;
    } catch {
        orders = [];
    }

    return json({ orders });
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
        await recordActualFuel(orderId, Number(userId), actualKg);
        return json({ success: true, message: "Fuel uplift recorded" });
    }

    return json({ error: "Unknown intent" }, { status: 400 });
}

export default function FuelerOrders() {
    const { orders } = useLoaderData<typeof loader>();
    const fetcher = useFetcher<{ success?: boolean; error?: string }>();

    return (
        <div className="p-6 space-y-5">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Fuel Orders</h1>
                <TourTrigger config={fuelerOrdersTour} />
            </div>

            {fetcher.data?.error && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 p-3">
                    <p className="text-sm text-red-600 dark:text-red-400">{fetcher.data.error}</p>
                </div>
            )}

            {orders.length === 0 ? (
                <EmptyState title="No pending orders" description="All fuel orders have been completed." />
            ) : (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
                    <div className="divide-y divide-slate-200 dark:divide-slate-700">
                        {(orders as Array<Record<string, unknown>>).map((o) => (
                            <div key={o.id as number} className="px-4 py-3">
                                <div className="flex items-center justify-between mb-2">
                                    <div>
                                        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                                            {o.flight_number as string}
                                        </span>
                                        <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                                            {o.aircraft_registration as string}
                                        </span>
                                        <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                            o.status === "issued" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                                            "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                        }`}>
                                            {o.status as string}
                                        </span>
                                    </div>
                                    <Link
                                        to={`/pilot/flight/${o.flight_id}/fuel`}
                                        className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400"
                                    >
                                        Flight Details
                                    </Link>
                                </div>
                                <div className="flex items-center gap-3">
                                    <p className="text-sm text-slate-600 dark:text-slate-400">
                                        Requested: <span className="font-bold tabular-nums">{o.requested_fuel_kg as number} kg</span>
                                    </p>
                                    {o.issued_at != null && (
                                        <p className="text-xs text-slate-400 dark:text-slate-500">
                                            Issued {new Date(o.issued_at as string).toLocaleString("en-GB")}
                                        </p>
                                    )}
                                </div>
                                <fetcher.Form method="post" className="mt-2 flex items-center gap-2">
                                    <input type="hidden" name="intent" value="record-uplift" />
                                    <input type="hidden" name="orderId" value={o.id as number} />
                                    <input
                                        type="number"
                                        name="actualKg"
                                        step="0.1"
                                        required
                                        className="w-28 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1.5 text-sm text-slate-800 dark:text-slate-100"
                                        placeholder="Kg uplifted"
                                    />
                                    <button
                                        type="submit"
                                        className="rounded bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400"
                                    >
                                        Record Uplift
                                    </button>
                                </fetcher.Form>
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
