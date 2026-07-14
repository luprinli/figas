import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";

import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import { requireUser } from "../utils/layout.server";
import { notifyFlightLogSubmitted, notifyDefectReported } from "../utils/services/efb-notification.service";
import EmptyState from "../components/EmptyState";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
    { title: `Flight Log — ${data?.flightNumber ?? ""} - FIGAS` },
];

export async function loader({ request, params }: LoaderFunctionArgs) {
    await requirePermission(request, Permission.FLIGHT_VIEW);

    const flightId = Number(params.flightId);
    if (!flightId) throw new Response("Flight ID required", { status: 400 });

    const flight = await sql<{
        flight_number: string; departure_time: string; arrival_time: string;
        origin_code: string; destination_code: string;
        aircraft_id: string; aircraft_registration: string; aircraft_type: string;
    }>`
        SELECT f.flight_number, f.departure_time, f.arrival_time,
               ao.code AS origin_code, ad.code AS destination_code,
               f.aircraft_id, a.registration AS aircraft_registration,
               a.type AS aircraft_type
        FROM flights f
        JOIN aerodromes ao ON ao.id = f.origin_aerodrome_id
        JOIN aerodromes ad ON ad.id = f.destination_aerodrome_id
        LEFT JOIN aircraft a ON a.id = f.aircraft_id
        WHERE f.id = ${flightId}
    `.execute(kdb);

    if (flight.rows.length === 0) {
        throw new Response("Flight not found", { status: 404 });
    }
    const f = flight.rows[0];

    const existingLog = await sql<{
        id: string; block_off_time: string | null; block_on_time: string | null;
        tach_start: string | null; tach_end: string | null; cycles: string;
        fuel_uplift_ltr: string | null; fuel_start_ltr: string | null;
        fuel_end_ltr: string | null; oil_uplift_ltr: string | null;
        remarks: string | null; created_at: string | null;
    }>`
        SELECT id, block_off_time, block_on_time, tach_start, tach_end,
               cycles, fuel_uplift_ltr, fuel_start_ltr, fuel_end_ltr,
               oil_uplift_ltr, remarks, created_at
        FROM flight_logs
        WHERE flight_id = ${flightId}
        ORDER BY id DESC LIMIT 1
    `.execute(kdb);

    const opsLegs = await sql<{
        atd: string | null; ata: string | null;
    }>`
        SELECT atd, ata FROM flight_legs
        WHERE flight_id = ${flightId} ORDER BY leg_number
    `.execute(kdb);

    let totalBlockMinutes = 0;
    for (const leg of opsLegs.rows) {
        if (leg.atd && leg.ata) {
            const diff = (new Date(leg.ata).getTime() - new Date(leg.atd).getTime()) / 60_000;
            if (diff > 0) totalBlockMinutes += Math.round(diff);
        }
    }

    const defects = await sql<{
        id: string; title: string; severity: string; description: string;
        reported_at: string | null; deferral_status: string;
    }>`
        SELECT id, title, severity, description, reported_at, deferral_status
        FROM defects
        WHERE aircraft_id = ${Number(f.aircraft_id)}
        ORDER BY reported_at DESC LIMIT 10
    `.execute(kdb);

    const logSubmitted = existingLog.rows.length > 0;
    const logData = logSubmitted ? {
        id: Number(existingLog.rows[0].id),
        blockOffTime: existingLog.rows[0].block_off_time,
        blockOnTime: existingLog.rows[0].block_on_time,
        tachStart: existingLog.rows[0].tach_start != null ? Number(existingLog.rows[0].tach_start) : null,
        tachEnd: existingLog.rows[0].tach_end != null ? Number(existingLog.rows[0].tach_end) : null,
        cycles: Number(existingLog.rows[0].cycles),
        fuelUpliftLtr: existingLog.rows[0].fuel_uplift_ltr != null ? Number(existingLog.rows[0].fuel_uplift_ltr) : null,
        fuelStartLtr: existingLog.rows[0].fuel_start_ltr != null ? Number(existingLog.rows[0].fuel_start_ltr) : null,
        fuelEndLtr: existingLog.rows[0].fuel_end_ltr != null ? Number(existingLog.rows[0].fuel_end_ltr) : null,
        oilUpliftLtr: existingLog.rows[0].oil_uplift_ltr != null ? Number(existingLog.rows[0].oil_uplift_ltr) : null,
        remarks: existingLog.rows[0].remarks,
        createdAt: existingLog.rows[0].created_at,
    } : null;

    return json({
        flightNumber: f.flight_number,
        departureTime: f.departure_time,
        originCode: f.origin_code,
        destinationCode: f.destination_code,
        aircraftId: Number(f.aircraft_id),
        aircraftRegistration: f.aircraft_registration,
        aircraftType: f.aircraft_type,
        logSubmitted,
        logData,
        totalBlockMinutes: totalBlockMinutes > 0 ? totalBlockMinutes : null,
        defects: defects.rows,
    });
}

export async function action({ request, params }: ActionFunctionArgs) {
    const { userId } = await requireUser(request);
    const flightId = Number(params.flightId);
    if (!flightId) return json({ error: "Flight ID required" }, { status: 400 });

    const formData = await request.formData();
    const intent = formData.get("intent")?.toString();

    if (intent === "submit-log") {
        const existing = await sql<{ id: string }>`
            SELECT id FROM flight_logs WHERE flight_id = ${flightId} LIMIT 1
        `.execute(kdb);
        if (existing.rows.length > 0) {
            return json({ error: "Flight log already submitted" }, { status: 409 });
        }

        const flight = await sql<{ aircraft_id: string; origin_code: string; destination_code: string; departure_time: string }>`
            SELECT f.aircraft_id, ao.code AS origin_code, ad.code AS destination_code,
                   f.departure_time
            FROM flights f
            JOIN aerodromes ao ON ao.id = f.origin_aerodrome_id
            JOIN aerodromes ad ON ad.id = f.destination_aerodrome_id
            WHERE f.id = ${flightId}
        `.execute(kdb);
        if (flight.rows.length === 0) {
            return json({ error: "Flight not found" }, { status: 404 });
        }
        const f = flight.rows[0];

        await sql`
            INSERT INTO flight_logs (
                flight_id, aircraft_id, departure_date,
                block_off_time, block_on_time,
                tach_start, tach_end, cycles,
                fuel_uplift_ltr, fuel_start_ltr, fuel_end_ltr,
                oil_uplift_ltr, origin_code, destination_code,
                remarks, created_by
            ) VALUES (
                ${flightId}, ${Number(f.aircraft_id)}, ${f.departure_time}::date,
                ${formData.get("blockOffTime")?.toString() || null}::time,
                ${formData.get("blockOnTime")?.toString() || null}::time,
                ${formData.get("tachStart")?.toString() || null}::numeric,
                ${formData.get("tachEnd")?.toString() || null}::numeric,
                ${Number(formData.get("cycles") ?? 1)},
                ${formData.get("fuelUpliftLtr")?.toString() || null}::int,
                ${formData.get("fuelStartLtr")?.toString() || null}::int,
                ${formData.get("fuelEndLtr")?.toString() || null}::int,
                ${formData.get("oilUpliftLtr")?.toString() || null}::numeric,
                ${f.origin_code}, ${f.destination_code},
                ${formData.get("remarks")?.toString() || null},
                ${Number(userId)}
            )
        `.execute(kdb);

        void notifyFlightLogSubmitted(flightId);
        return json({ success: true, message: "Flight log submitted" });
    }

    if (intent === "report-defect") {
        const flight = await sql<{ aircraft_id: string }>`
            SELECT aircraft_id FROM flights WHERE id = ${flightId}
        `.execute(kdb);
        if (flight.rows.length === 0) {
            return json({ error: "Flight not found" }, { status: 404 });
        }

        const title = formData.get("defectTitle")?.toString() ?? "";
        const description = formData.get("defectDescription")?.toString() ?? "";
        const severity = formData.get("defectSeverity")?.toString() ?? "minor";
        const ataChapter = formData.get("defectAtaChapter")?.toString() || null;

        if (!title.trim()) {
            return json({ error: "Defect title is required" }, { status: 400 });
        }

        await sql`
            INSERT INTO defects (
                aircraft_id, reported_by, title, description,
                severity, ata_chapter, deferral_status
            ) VALUES (
                ${Number(flight.rows[0].aircraft_id)}, ${Number(userId)},
                ${title}, ${description || null},
                ${severity}, ${ataChapter}, 'open'
            )
        `.execute(kdb);

        void notifyDefectReported(flightId);
        return json({ success: true, message: "Defect reported" });
    }

    return json({ error: "Unknown intent" }, { status: 400 });
}

export default function LogTab() {
    const data = useLoaderData<typeof loader>();
    const logFetcher = useFetcher<{ success?: boolean; error?: string; message?: string }>();
    const defectFetcher = useFetcher<{ success?: boolean; error?: string; message?: string }>();

    return (
        <div className="space-y-6">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                Flight Log — {data.flightNumber}
            </h2>

            {logFetcher.data?.error && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 p-3">
                    <p className="text-sm text-red-600 dark:text-red-400">{logFetcher.data.error}</p>
                </div>
            )}
            {defectFetcher.data?.error && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 p-3">
                    <p className="text-sm text-red-600 dark:text-red-400">{defectFetcher.data.error}</p>
                </div>
            )}

            {data.logSubmitted && data.logData && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10 dark:border-emerald-800 p-5">
                    <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 mb-3">Flight Log Submitted</h3>
                    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        <div>
                            <dt className="text-xs text-emerald-600 dark:text-emerald-400">Tach Start</dt>
                            <dd className="font-medium text-emerald-800 dark:text-emerald-200 tabular-nums">
                                {data.logData.tachStart ?? "—"}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs text-emerald-600 dark:text-emerald-400">Tach End</dt>
                            <dd className="font-medium text-emerald-800 dark:text-emerald-200 tabular-nums">
                                {data.logData.tachEnd ?? "—"}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs text-emerald-600 dark:text-emerald-400">Cycles</dt>
                            <dd className="font-medium text-emerald-800 dark:text-emerald-200 tabular-nums">
                                {data.logData.cycles}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs text-emerald-600 dark:text-emerald-400">Fuel Uplift</dt>
                            <dd className="font-medium text-emerald-800 dark:text-emerald-200 tabular-nums">
                                {data.logData.fuelUpliftLtr != null ? `${data.logData.fuelUpliftLtr} L` : "—"}
                            </dd>
                        </div>
                    </dl>
                    {data.logData.remarks && (
                        <div className="mt-3">
                            <dt className="text-xs text-emerald-600 dark:text-emerald-400">Remarks</dt>
                            <dd className="text-sm text-emerald-700 dark:text-emerald-300 mt-0.5">{data.logData.remarks}</dd>
                        </div>
                    )}
                    {data.logData.createdAt && (
                        <p className="text-xs text-emerald-500 dark:text-emerald-500 mt-3">
                            Submitted {new Date(data.logData.createdAt).toLocaleString("en-GB")}
                        </p>
                    )}
                </div>
            )}

            {!data.logSubmitted && (
                <logFetcher.Form method="post" className="space-y-5">
                    <input type="hidden" name="intent" value="submit-log" />

                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
                        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-4">Flight Details</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                            <div>
                                <span className="text-xs text-slate-400">Route</span>
                                <p className="text-slate-700 dark:text-slate-200 font-medium">{data.originCode} → {data.destinationCode}</p>
                            </div>
                            <div>
                                <span className="text-xs text-slate-400">Aircraft</span>
                                <p className="text-slate-700 dark:text-slate-200 font-medium">{data.aircraftRegistration} ({data.aircraftType})</p>
                            </div>
                            <div>
                                <span className="text-xs text-slate-400">Date</span>
                                <p className="text-slate-700 dark:text-slate-200 font-medium">{new Date(data.departureTime).toLocaleDateString("en-GB")}</p>
                            </div>
                            <div>
                                <span className="text-xs text-slate-400">Block Time</span>
                                <p className="text-slate-700 dark:text-slate-200 font-medium tabular-nums">
                                    {data.totalBlockMinutes != null ? `${data.totalBlockMinutes} min` : "Not recorded"}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
                        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-4">Times & Tach</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                                <label htmlFor="log-block-off" className="block text-[10px] font-medium text-slate-500 uppercase mb-1">Block Off</label>
                                <input id="log-block-off" type="time" name="blockOffTime"
                                    className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-100" />
                            </div>
                            <div>
                                <label htmlFor="log-block-on" className="block text-[10px] font-medium text-slate-500 uppercase mb-1">Block On</label>
                                <input id="log-block-on" type="time" name="blockOnTime"
                                    className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-100" />
                            </div>
                            <div>
                                <label htmlFor="log-tach-start" className="block text-[10px] font-medium text-slate-500 uppercase mb-1">Tach Start</label>
                                <input id="log-tach-start" type="number" name="tachStart" step="0.1"
                                    className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-100" />
                            </div>
                            <div>
                                <label htmlFor="log-tach-end" className="block text-[10px] font-medium text-slate-500 uppercase mb-1">Tach End</label>
                                <input id="log-tach-end" type="number" name="tachEnd" step="0.1"
                                    className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-100" />
                            </div>
                        </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
                        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-4">Fuel & Oil</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                                <label htmlFor="log-fuel-uplift" className="block text-[10px] font-medium text-slate-500 uppercase mb-1">Fuel Uplift (L)</label>
                                <input id="log-fuel-uplift" type="number" name="fuelUpliftLtr"
                                    className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-100" />
                            </div>
                            <div>
                                <label htmlFor="log-fuel-start" className="block text-[10px] font-medium text-slate-500 uppercase mb-1">Fuel Start (L)</label>
                                <input id="log-fuel-start" type="number" name="fuelStartLtr"
                                    className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-100" />
                            </div>
                            <div>
                                <label htmlFor="log-fuel-end" className="block text-[10px] font-medium text-slate-500 uppercase mb-1">Fuel End (L)</label>
                                <input id="log-fuel-end" type="number" name="fuelEndLtr"
                                    className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-100" />
                            </div>
                            <div>
                                <label htmlFor="log-oil-uplift" className="block text-[10px] font-medium text-slate-500 uppercase mb-1">Oil Uplift (L)</label>
                                <input id="log-oil-uplift" type="number" name="oilUpliftLtr" step="0.1"
                                    className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-100" />
                            </div>
                        </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="log-cycles" className="block text-[10px] font-medium text-slate-500 uppercase mb-1">Cycles (Landings)</label>
                                <input id="log-cycles" type="number" name="cycles" defaultValue={1} min={1}
                                    className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-100" />
                            </div>
                        </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
                        <label htmlFor="log-remarks" className="block text-[10px] font-medium text-slate-500 uppercase mb-1">Remarks</label>
                        <textarea id="log-remarks" name="remarks" rows={3}
                            className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-800 dark:text-slate-100"
                            placeholder="Pilot remarks, observations, or notes..."
                        />
                    </div>

                    <div className="flex justify-center">
                        <button type="submit" className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-white hover:bg-primary-hover">
                            Submit Flight Log
                        </button>
                    </div>
                </logFetcher.Form>
            )}

            {/* Defect Reporting */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-4">Report Defect</h3>
                {defectFetcher.data?.success && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10 mb-3 p-2">
                        <p className="text-sm text-emerald-600 dark:text-emerald-400">{defectFetcher.data.message}</p>
                    </div>
                )}
                <defectFetcher.Form method="post" className="space-y-3">
                    <input type="hidden" name="intent" value="report-defect" />
                    <div>
                        <label htmlFor="defect-title" className="block text-[10px] font-medium text-slate-500 uppercase mb-1">Title *</label>
                        <input id="defect-title" type="text" name="defectTitle" required
                            className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1.5 text-sm text-slate-800 dark:text-slate-100"
                            placeholder="e.g. Oil leak on #2 cylinder" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="defect-severity" className="block text-[10px] font-medium text-slate-500 uppercase mb-1">Severity</label>
                            <select id="defect-severity" name="defectSeverity" defaultValue="minor"
                                className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1.5 text-sm text-slate-800 dark:text-slate-100">
                                <option value="minor">Minor</option>
                                <option value="major">Major</option>
                                <option value="critical">Critical</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="defect-ata" className="block text-[10px] font-medium text-slate-500 uppercase mb-1">ATA Chapter</label>
                            <input id="defect-ata" type="text" name="defectAtaChapter" maxLength={10}
                                className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1.5 text-sm text-slate-800 dark:text-slate-100"
                                placeholder="e.g. 72-00" />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="defect-desc" className="block text-[10px] font-medium text-slate-500 uppercase mb-1">Description</label>
                        <textarea id="defect-desc" name="defectDescription" rows={2}
                            className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1.5 text-sm text-slate-800 dark:text-slate-100"
                            placeholder="Detailed description of the defect..."
                        />
                    </div>
                    <button type="submit" className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">
                        Report Defect
                    </button>
                </defectFetcher.Form>
            </div>

            {/* Recent Defects for this Aircraft */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-4">
                    Recent Defects — {data.aircraftRegistration}
                </h3>
                {data.defects.length === 0 ? (
                    <EmptyState title="No defects" description="No defects reported for this aircraft." />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-slate-500 dark:text-slate-400">
                                    <th className="py-2 pr-3 font-medium">Title</th>
                                    <th className="py-2 pr-3 font-medium">Severity</th>
                                    <th className="py-2 font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {(data.defects as Array<Record<string, unknown>>).map((d) => (
                                    <tr key={d.id as number}>
                                        <td className="py-2 pr-3 text-slate-800 dark:text-slate-200">
                                            <p className="font-medium">{d.title as string}</p>
                                            {d.description != null && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{d.description as string}</p>}
                                        </td>
                                        <td className="py-2 pr-3">
                                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                                d.severity === "critical" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                                                d.severity === "major" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                                                "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                            }`}>
                                                {d.severity as string}
                                            </span>
                                        </td>
                                        <td className="py-2">
                                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                                d.deferral_status === "closed" ? "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300" :
                                                "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                            }`}>
                                                {d.deferral_status as string}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
