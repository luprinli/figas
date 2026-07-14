import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";

import { requireAnyPermission } from "../utils/permissions.server";
import { Permission, FuelOrderStatus } from "../utils/constants";
import { requireUser } from "../utils/layout.server";
import { calculateFuelRequirements, getFuelOrder, issueFuelOrder, recordActualFuel }
    from "../utils/services/fuel-order.service";
import { notifyFuelOrderIssued, notifyFuelUpliftRecorded } from "../utils/services/efb-notification.service";
import EmptyState from "../components/EmptyState";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
    { title: `Fuel — ${data?.flightNumber ?? ""} - FIGAS` },
];

export async function loader({ request, params }: LoaderFunctionArgs) {
    await requireAnyPermission(request, [Permission.FLIGHT_VIEW, Permission.FLIGHT_FUEL_EXECUTE]);
    const flightId = Number(params.flightId);
    if (!flightId) throw new Response("Flight ID required", { status: 400 });

    let order;
    try {
        order = await getFuelOrder(flightId);
    } catch {
        order = null;
    }
    const fuelReq = await calculateFuelRequirements(flightId);

    const orderData = order ? {
        id: order.id,
        status: order.status,
        requestedFuelKg: order.requestedFuelKg,
        actualUpliftKg: order.fuelerActualUpliftKg,
    } : null;

    return json({
        flightNumber: "",
        fuelReq,
        order: orderData,
    });
}

export async function action({ request, params }: ActionFunctionArgs) {
    const { userId } = await requireUser(request);
    const flightId = Number(params.flightId);
    if (!flightId) return json({ error: "Flight ID required" }, { status: 400 });

    const formData = await request.formData();
    const intent = formData.get("intent")?.toString();

    if (intent === "issue-order") {
        const existing = await getFuelOrder(flightId);
        if (existing && existing.status !== FuelOrderStatus.CANCELLED) {
            return json({ error: "A fuel order already exists for this flight" }, { status: 409 });
        }

        const fuelReq = await calculateFuelRequirements(flightId);
        await issueFuelOrder(flightId, Number(userId), fuelReq.startingFuelKg, fuelReq.breakdown);
        void notifyFuelOrderIssued(flightId);
        return json({ success: true, message: "Fuel order issued" });
    }

    if (intent === "record-uplift") {
        const orderId = Number(formData.get("orderId"));
        const actualKg = Number(formData.get("actualKg"));
        if (!orderId || !actualKg) {
            return json({ error: "Order ID and actual uplift are required" }, { status: 400 });
        }
        const notes = formData.get("notes")?.toString() ?? "";
        await recordActualFuel(orderId, Number(userId), actualKg, notes);
        void notifyFuelUpliftRecorded(flightId);
        return json({ success: true, message: "Fuel uplift recorded" });
    }

    return json({ error: "Unknown intent" }, { status: 400 });
}

export default function FuelTab() {
    const { fuelReq, order } = useLoaderData<typeof loader>();
    const issueFetcher = useFetcher<{ success?: boolean; error?: string; message?: string }>();
    const upliftFetcher = useFetcher<{ success?: boolean; error?: string; message?: string }>();

    const isCompleted = order?.status === FuelOrderStatus.COMPLETED || upliftFetcher.data?.success;
    const hasOrder = order && order.status !== FuelOrderStatus.CANCELLED;

    return (
        <div className="space-y-6">
            {issueFetcher.data?.error && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800 p-3">
                    <p className="text-sm text-red-600 dark:text-red-400">{issueFetcher.data.error}</p>
                </div>
            )}
            {upliftFetcher.data?.error && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800 p-3">
                    <p className="text-sm text-red-600 dark:text-red-400">{upliftFetcher.data.error}</p>
                </div>
            )}

            {isCompleted && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10 dark:border-emerald-800 p-5">
                    <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 mb-1">Fuel Uplift Recorded</h3>
                    <p className="text-sm text-emerald-600 dark:text-emerald-400">
                        {order?.actualUpliftKg != null ? `${order.actualUpliftKg} kg confirmed` : "Uplift confirmed"}
                    </p>
                </div>
            )}

            {hasOrder && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-800 p-5">
                    <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-1">Fuel Order {order?.status}</h3>
                    <p className="text-sm text-blue-600 dark:text-blue-400 mb-3">
                        Requested: {order?.requestedFuelKg} kg
                    </p>
                    {!isCompleted && (
                        <upliftFetcher.Form method="post" className="space-y-3">
                            <input type="hidden" name="intent" value="record-uplift" />
                            <input type="hidden" name="orderId" value={order?.id} />
                            <div>
                                            <label htmlFor="actualKg" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                                Actual Uplift (kg)
                                            </label>
                                            <input
                                                id="actualKg"
                                                type="number"
                                                name="actualKg"
                                                step="0.1"
                                                required
                                                className="w-full sm:w-48 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-800 dark:text-slate-100"
                                                placeholder={String(order?.requestedFuelKg ?? 0)}
                                            />
                            </div>
                            <div>
                                            <label htmlFor="fuelNotes" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                                Notes (optional)
                                            </label>
                                            <input
                                                id="fuelNotes"
                                                type="text"
                                                name="notes"
                                    className="w-full sm:w-64 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-800 dark:text-slate-100"
                                    placeholder="e.g. Bowser #2, meter reading"
                                />
                            </div>
                            <button
                                type="submit"
                                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                            >
                                Confirm Uplift
                            </button>
                        </upliftFetcher.Form>
                    )}
                </div>
            )}

            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">Fuel Calculation</h2>
                {fuelReq.startingFuelKg === 0 ? (
                    <EmptyState title="No fuel data" description="Weight & balance data is not available for this flight." />
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            { label: "Taxi", kg: fuelReq.breakdown.taxiFuelKg as number },
                            { label: "Trip", kg: fuelReq.breakdown.tripFuelKg as number },
                            { label: "Reserve", kg: fuelReq.breakdown.reserveFuelKg as number },
                            { label: "Total Req.", kg: fuelReq.startingFuelKg },
                        ].map((item) => {
                            const total = fuelReq.startingFuelKg || 1;
                            const pct = Math.round((item.kg / total) * 100);
                            return (
                                <div key={item.label} className="bg-slate-50 dark:bg-slate-700 rounded-lg p-3 border border-slate-200 dark:border-slate-600">
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">{item.label}</span>
                                    <p className="text-lg font-bold text-slate-800 dark:text-slate-100 tabular-nums">{item.kg} kg</p>
                                    <div className="mt-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-600">
                                        <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {!hasOrder && (
                <div className="flex justify-center">
                    <issueFetcher.Form method="post">
                        <input type="hidden" name="intent" value="issue-order" />
                        <button
                            type="submit"
                            className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-white hover:bg-primary-hover"
                        >
                            Issue Fuel Order
                        </button>
                    </issueFetcher.Form>
                </div>
            )}
        </div>
    );
}
