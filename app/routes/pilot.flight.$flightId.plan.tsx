import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, Link } from "@remix-run/react";

import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { requireUser } from "../utils/layout.server";
import {
    getFlightPlanDetails,
    getVerificationStatus,
    verifyFlightPlan,
} from "../utils/services/flight-plan.service";
import EmptyState from "../components/EmptyState";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
    { title: `Flight Plan — ${data?.planData.flightNumber ?? ""} - FIGAS` },
];

export async function loader({ request, params }: LoaderFunctionArgs) {
    const user = await requirePermission(request, Permission.FLIGHT_VIEW);
    const flightId = Number(params.flightId);
    if (!flightId) throw new Response("Flight ID required", { status: 400 });

    const [planData, verification] = await Promise.all([
        getFlightPlanDetails(flightId),
        getVerificationStatus(flightId, Number(user.id)),
    ]);

    return json({ planData, verification });
}

export async function action({ request, params }: ActionFunctionArgs) {
    const { userId } = await requireUser(request);
    const flightId = Number(params.flightId);
    if (!flightId) return json({ error: "Flight ID required" }, { status: 400 });

    const formData = await request.formData();
    const intent = formData.get("intent")?.toString();
    const notes = formData.get("notes")?.toString() ?? "";

    if (intent === "verify") {
        await verifyFlightPlan(flightId, Number(userId), "verified");
        return json({ success: true, message: "Flight plan verified" });
    }

    if (intent === "discrepancy") {
        if (!notes.trim()) {
            return json({ error: "Notes are required when reporting a discrepancy" }, { status: 400 });
        }
        await verifyFlightPlan(flightId, Number(userId), "discrepancy", notes);
        return json({ success: true, message: "Discrepancy reported" });
    }

    return json({ error: "Unknown intent" }, { status: 400 });
}

export default function FlightPlanTab() {
    const { planData, verification } = useLoaderData<typeof loader>();
    const fetcher = useFetcher<{ success?: boolean; error?: string; message?: string }>();
    const isVerified = verification.verified || fetcher.data?.success;

    return (
        <div className="space-y-6">
            {isVerified && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10 dark:border-emerald-800 p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                                Flight Plan Verified
                            </h3>
                            <p className="text-xs text-emerald-600 dark:text-emerald-400">
                                {verification.verifiedAt
                                    ? `Verified on ${new Date(verification.verifiedAt).toLocaleString("en-GB")}`
                                    : "Verification recorded"}
                            </p>
                        </div>
                        <Link
                            to={`/pilot/flight/${planData.flightId}/briefing`}
                            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover"
                        >
                            Go to Briefing
                        </Link>
                    </div>
                </div>
            )}

            {verification.status === "discrepancy" && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 p-4">
                    <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
                        Discrepancy Reported
                    </h3>
                    {verification.notes && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">{verification.notes}</p>
                    )}
                </div>
            )}

            {fetcher.data?.error && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800 p-3">
                    <p className="text-sm text-red-600 dark:text-red-400">{fetcher.data.error}</p>
                </div>
            )}

            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">Route</h2>
                {planData.legs.length === 0 ? (
                    <EmptyState title="No route legs" description="This flight has no defined route legs." />
                ) : (
                    <div className="flex items-center gap-0 flex-wrap">
                        {planData.legs.map((leg, idx) => (
                            <div key={leg.legNumber} className="flex items-center">
                                <div className="flex flex-col items-center bg-slate-50 dark:bg-slate-700 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-600 min-w-[80px]">
                                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                                        {leg.originCode}
                                    </span>
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                        {leg.etd ? new Date(leg.etd).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}
                                    </span>
                                </div>
                                <div className="flex flex-col items-center px-2 min-w-[80px]">
                                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                        {leg.distanceNm != null ? `${leg.distanceNm} nm` : "—"}
                                    </span>
                                    <div className="w-full h-0.5 bg-slate-300 dark:bg-slate-600 my-1 relative">
                                        <div className="absolute top-1/2 right-0 -translate-y-1/2 w-2 h-2 rotate-45 border-t-2 border-r-2 border-slate-400 dark:border-slate-500" />
                                    </div>
                                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                        {leg.heading != null ? `${leg.heading}°` : "—"}
                                    </span>
                                </div>
                                {idx === planData.legs.length - 1 && (
                                    <div className="flex flex-col items-center bg-slate-50 dark:bg-slate-700 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-600 min-w-[80px]">
                                        <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                                            {leg.destinationCode}
                                        </span>
                                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                            {leg.eta ? new Date(leg.eta).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}
                                        </span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {planData.fuelBreakdown && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">Fuel Breakdown</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                        {[
                            { label: "Taxi", kg: planData.fuelBreakdown.taxiFuelKg },
                            { label: "Trip", kg: planData.fuelBreakdown.tripFuelKg },
                            { label: "Reserve", kg: planData.fuelBreakdown.reserveFuelKg },
                            { label: "Starting Fuel", kg: planData.fuelBreakdown.startingFuelKg },
                        ].map((item) => {
                            const total = planData.fuelBreakdown!.startingFuelKg || 1;
                            const pct = Math.round((item.kg / total) * 100);
                            return (
                                <div key={item.label} className="bg-slate-50 dark:bg-slate-700 rounded-lg p-3 border border-slate-200 dark:border-slate-600">
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">{item.label}</span>
                                    <p className="text-lg font-bold text-slate-800 dark:text-slate-100 tabular-nums">{item.kg} kg</p>
                                    <div className="mt-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-600">
                                        <div
                                            className="h-1.5 rounded-full bg-blue-500"
                                            style={{ width: `${Math.min(pct, 100)}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {planData.fuelBreakdown.fuelState && (
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span>Fuel State: {planData.fuelBreakdown.fuelState}</span>
                            {planData.fuelBreakdown.fuelRuleApplied && (
                                <span className="rounded bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5">
                                    {planData.fuelBreakdown.fuelRuleApplied}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            )}

            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">Weather</h2>
                {planData.weather.length === 0 ? (
                    <EmptyState title="No weather data" description="Weather information is not available for this route." />
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {planData.weather.map((w) => (
                            <div key={w.aerodrome} className="border border-slate-200 dark:border-slate-600 rounded-lg p-3 bg-slate-50 dark:bg-slate-700">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{w.aerodrome}</span>
                                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                        w.category === "VFR" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                                        w.category === "MVFR" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                                        w.category === "IFR" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                                        "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                                    }`}>
                                        {w.category}
                                    </span>
                                </div>
                                <dl className="grid grid-cols-2 gap-1 text-xs">
                                    <dt className="text-slate-500 dark:text-slate-400">Wind</dt>
                                    <dd className="text-slate-700 dark:text-slate-300 font-medium">{w.wind}</dd>
                                    <dt className="text-slate-500 dark:text-slate-400">Temp</dt>
                                    <dd className="text-slate-700 dark:text-slate-300 font-medium">{w.temp}</dd>
                                    <dt className="text-slate-500 dark:text-slate-400">Vis</dt>
                                    <dd className="text-slate-700 dark:text-slate-300 font-medium">{w.visibility}</dd>
                                    <dt className="text-slate-500 dark:text-slate-400">Cond</dt>
                                    <dd className="text-slate-700 dark:text-slate-300 font-medium">{w.summary}</dd>
                                </dl>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {!isVerified && verification.status !== "discrepancy" && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">Verify Flight Plan</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                        Confirm the route, fuel, and weather are correct before accepting the briefing.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <fetcher.Form method="post" className="flex-1">
                            <input type="hidden" name="intent" value="verify" />
                            <button type="submit" className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                                Verify Plan
                            </button>
                        </fetcher.Form>
                        <fetcher.Form method="post" className="flex-1 flex flex-col gap-2">
                            <input type="hidden" name="intent" value="discrepancy" />
                            <textarea
                                name="notes"
                                rows={2}
                                placeholder="Describe the issue..."
                                className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
                            />
                            <button type="submit" className="w-full rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">
                                Report Discrepancy
                            </button>
                        </fetcher.Form>
                    </div>
                </div>
            )}
        </div>
    );
}
