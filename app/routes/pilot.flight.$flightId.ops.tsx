import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";

import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import { requireUser } from "../utils/layout.server";
import EmptyState from "../components/EmptyState";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
    { title: `Ops — ${data?.flightNumber ?? ""} - FIGAS` },
];

function toLocalDatetime(iso: string | null): string {
    if (!iso) return "";
    try {
        const d = new Date(iso);
        const offset = d.getTimezoneOffset();
        const local = new Date(d.getTime() - offset * 60_000);
        return local.toISOString().slice(0, 16);
    } catch {
        return "";
    }
}

function computeBlockMinutes(atd: string | null, ata: string | null): number | null {
    if (!atd || !ata) return null;
    const d1 = new Date(atd).getTime();
    const d2 = new Date(ata).getTime();
    if (isNaN(d1) || isNaN(d2) || d2 <= d1) return null;
    return Math.round((d2 - d1) / 60_000);
}

export async function loader({ request, params }: LoaderFunctionArgs) {
    await requirePermission(request, Permission.FLIGHT_VIEW);

    const flightId = Number(params.flightId);
    if (!flightId) throw new Response("Flight ID required", { status: 400 });

    const flight = await sql<{ flight_number: string }>`
        SELECT flight_number FROM flights WHERE id = ${flightId}
    `.execute(kdb);

    if (flight.rows.length === 0) {
        throw new Response("Flight not found", { status: 404 });
    }

    let legs;
    try {
        legs = await sql<{
            id: string; leg_number: string; origin_code: string; destination_code: string;
            etd: string | null; eta: string | null;
            atd: string | null; ata: string | null;
            actual_passengers: string | null; actual_baggage_kg: string | null;
            actual_freight_kg: string | null; status: string;
        }>`
            SELECT id, leg_number, origin_code, destination_code,
                   etd, eta, atd, ata,
                   actual_passengers, actual_baggage_kg, actual_freight_kg, status
            FROM flight_legs
            WHERE flight_id = ${flightId}
            ORDER BY leg_number
        `.execute(kdb);
    } catch {
        legs = await sql<{
            id: string; leg_number: string; origin_code: string; destination_code: string;
            etd: string | null; eta: string | null;
            atd: string | null; ata: string | null;
            status: string;
        }>`
            SELECT id, leg_number, origin_code, destination_code,
                   etd, eta, atd, ata, status
            FROM flight_legs
            WHERE flight_id = ${flightId}
            ORDER BY leg_number
        `.execute(kdb);
    }

    const legsData = legs.rows.map((l) => {
        const r = l as Record<string, unknown>;
        return {
        id: Number(r.id ?? l.id),
        legNumber: Number(r.leg_number ?? l.leg_number),
        originCode: (r.origin_code ?? l.origin_code) as string,
        destinationCode: (r.destination_code ?? l.destination_code) as string,
        etd: (r.etd ?? l.etd) ? toLocalDatetime(String(r.etd ?? l.etd)) : "",
        eta: (r.eta ?? l.eta) ? toLocalDatetime(String(r.eta ?? l.eta)) : "",
        atd: (r.atd ?? l.atd) ? toLocalDatetime(String(r.atd ?? l.atd)) : "",
        ata: (r.ata ?? l.ata) ? toLocalDatetime(String(r.ata ?? l.ata)) : "",
        actualPassengers: r.actual_passengers != null ? Number(r.actual_passengers) : null,
        actualBaggageKg: r.actual_baggage_kg != null ? Number(r.actual_baggage_kg) : null,
        actualFreightKg: r.actual_freight_kg != null ? Number(r.actual_freight_kg) : null,
        status: String((r.status ?? l.status) || ""),
        blockMinutes: computeBlockMinutes(String(r.atd ?? l.atd ?? null), String(r.ata ?? l.ata ?? null)),
    };});

    const allSubmitted = legsData.every((l) => l.atd && l.ata);

    return json({
        flightNumber: flight.rows[0].flight_number,
        legs: legsData,
        allSubmitted,
        totalBlockMinutes: legsData.reduce((sum, l) => sum + (l.blockMinutes ?? 0), 0),
    });
}

export async function action({ request, params }: ActionFunctionArgs) {
    await requireUser(request);
    const flightId = Number(params.flightId);
    if (!flightId) return json({ error: "Flight ID required" }, { status: 400 });

    const formData = await request.formData();
    const intent = formData.get("intent")?.toString();

    if (intent === "save-leg") {
        const legId = Number(formData.get("legId"));
        if (!legId) return json({ error: "Leg ID required" }, { status: 400 });

        const atd = formData.get("atd")?.toString() || null;
        const ata = formData.get("ata")?.toString() || null;
        const actualPassengers = formData.get("actualPassengers")?.toString();
        const actualBaggageKg = formData.get("actualBaggageKg")?.toString();
        const actualFreightKg = formData.get("actualFreightKg")?.toString();

        const setClauses: string[] = [];
        const values: unknown[] = [];
        let paramIdx = 1;

        if (atd !== undefined) {
            if (atd && atd.length > 0) {
                setClauses.push(`atd = $${paramIdx}::timestamptz`); values.push(atd); paramIdx++;
            } else {
                setClauses.push(`atd = NULL`);
            }
        }
        if (ata !== undefined) {
            if (ata && ata.length > 0) {
                setClauses.push(`ata = $${paramIdx}::timestamptz`); values.push(ata); paramIdx++;
            } else {
                setClauses.push(`ata = NULL`);
            }
        }
        if (actualPassengers !== undefined) {
            setClauses.push(`actual_passengers = $${paramIdx}::int`); values.push(actualPassengers || null); paramIdx++;
        }
        if (actualBaggageKg !== undefined) {
            setClauses.push(`actual_baggage_kg = $${paramIdx}::numeric`); values.push(actualBaggageKg || null); paramIdx++;
        }
        if (actualFreightKg !== undefined) {
            setClauses.push(`actual_freight_kg = $${paramIdx}::numeric`); values.push(actualFreightKg || null); paramIdx++;
        }

        if (setClauses.length === 0) {
            return json({ error: "No fields to update" }, { status: 400 });
        }

        setClauses.push(`updated_at = NOW()`);
        await sql`UPDATE flight_legs SET ${sql.raw(setClauses.join(", "))} WHERE id = ${legId}`.execute(kdb);

        return json({ success: true, legId });
    }

    return json({ error: "Unknown intent" }, { status: 400 });
}

export default function OpsTab() {
    const { flightNumber, legs, allSubmitted, totalBlockMinutes } = useLoaderData<typeof loader>();
    const fetcher = useFetcher<{ success?: boolean; error?: string; legId?: number }>();

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                    In-Flight Operations — {flightNumber}
                </h2>
                {totalBlockMinutes > 0 && (
                    <span className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
                        Total Block: {totalBlockMinutes} min
                    </span>
                )}
            </div>

            {fetcher.data?.error && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 p-3">
                    <p className="text-sm text-red-600 dark:text-red-400">{fetcher.data.error}</p>
                </div>
            )}

            {allSubmitted && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10 dark:border-emerald-800 p-4">
                    <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">All legs submitted</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                        Total block time: {totalBlockMinutes} minutes across {legs.length} leg{legs.length !== 1 ? "s" : ""}
                    </p>
                </div>
            )}

            {legs.length === 0 ? (
                <EmptyState title="No legs" description="This flight has no defined route legs." />
            ) : (
                <div className="space-y-4">
                    {legs.map((leg) => (
                        <div key={leg.id}
                            className={`rounded-lg border bg-white dark:bg-slate-800 p-5 ${
                                fetcher.data?.legId === leg.id
                                    ? "border-emerald-300 dark:border-emerald-700 ring-1 ring-emerald-200"
                                    : leg.atd && leg.ata
                                        ? "border-emerald-200 dark:border-emerald-800"
                                        : "border-slate-200 dark:border-slate-700"
                            }`}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                                    Leg {leg.legNumber}: {leg.originCode} → {leg.destinationCode}
                                </h3>
                                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                    leg.atd && leg.ata ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                                    "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                                }`}>
                                    {leg.atd && leg.ata ? "Submitted" : leg.status}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2 text-xs">
                                <div>
                                    <span className="text-slate-400 dark:text-slate-500">Scheduled ETD</span>
                                    <p className="text-slate-700 dark:text-slate-300 font-medium">{leg.etd || "—"}</p>
                                </div>
                                <div>
                                    <span className="text-slate-400 dark:text-slate-500">Scheduled ETA</span>
                                    <p className="text-slate-700 dark:text-slate-300 font-medium">{leg.eta || "—"}</p>
                                </div>
                                {leg.blockMinutes != null && (
                                    <div>
                                        <span className="text-slate-400 dark:text-slate-500">Block Time</span>
                                        <p className="text-slate-700 dark:text-slate-300 font-medium tabular-nums">{leg.blockMinutes} min</p>
                                    </div>
                                )}
                            </div>

                            <fetcher.Form method="post" className="space-y-3">
                                <input type="hidden" name="intent" value="save-leg" />
                                <input type="hidden" name="legId" value={leg.id} />

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div>
                                        <label htmlFor={`atd-${leg.id}`} className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">
                                            Actual Departure
                                        </label>
                                        <input
                                            id={`atd-${leg.id}`}
                                            type="datetime-local"
                                            name="atd"
                                            defaultValue={leg.atd}
                                            className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-100"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor={`ata-${leg.id}`} className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">
                                            Actual Arrival
                                        </label>
                                        <input
                                            id={`ata-${leg.id}`}
                                            type="datetime-local"
                                            name="ata"
                                            defaultValue={leg.ata}
                                            className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-100"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor={`pax-${leg.id}`} className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">
                                            Actual Pax
                                        </label>
                                        <input
                                            id={`pax-${leg.id}`}
                                            type="number"
                                            name="actualPassengers"
                                            defaultValue={leg.actualPassengers ?? ""}
                                            min="0"
                                            className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-100"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor={`baggage-${leg.id}`} className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">
                                            Baggage (kg)
                                        </label>
                                        <input
                                            id={`baggage-${leg.id}`}
                                            type="number"
                                            name="actualBaggageKg"
                                            defaultValue={leg.actualBaggageKg ?? ""}
                                            min="0"
                                            step="0.1"
                                            className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-100"
                                        />
                                    </div>
                                </div>
                                <div className="w-full sm:w-1/4">
                                    <label htmlFor={`freight-${leg.id}`} className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">
                                        Freight (kg)
                                    </label>
                                    <input
                                        id={`freight-${leg.id}`}
                                        type="number"
                                        name="actualFreightKg"
                                        defaultValue={leg.actualFreightKg ?? ""}
                                        min="0"
                                        step="0.1"
                                        className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-100"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-white hover:bg-primary-hover"
                                >
                                    Save Leg {leg.legNumber}
                                </button>
                            </fetcher.Form>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
