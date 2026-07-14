import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";

import { requirePermission } from "../utils/permissions.server";
import { Permission, PilotAssignmentStatus } from "../utils/constants";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
    { title: `Overview — ${data?.flightNumber ?? ""} - FIGAS` },
];

export async function loader({ request, params }: LoaderFunctionArgs) {
    const user = await requirePermission(request, Permission.FLIGHT_VIEW);

    const flightId = Number(params.flightId);
    if (!flightId) throw new Response("Flight ID required", { status: 400 });

    const pilotResult = await sql<{ id: number }>`
        SELECT id FROM pilots WHERE user_id = ${Number(user.id)} LIMIT 1
    `.execute(kdb);
    const pilotId = pilotResult.rows.length > 0 ? (pilotResult.rows[0] as { id: number }).id : 0;

    const flight = await sql<{
        id: number; flight_number: string; departure_time: string; arrival_time: string;
        origin_code: string; destination_code: string; status: string;
        aircraft_registration: string; aircraft_type: string; operational_notes: string;
    }>`
        SELECT f.id, f.flight_number, f.departure_time, f.arrival_time, f.status,
               ao.code AS origin_code, ad.code AS destination_code,
               a.registration AS aircraft_registration, a.type AS aircraft_type,
               COALESCE(f.operational_notes, '') AS operational_notes
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

    const assignment = await sql<{
        id: number; status: string; role: string;
    }>`
        SELECT pa.id, pa.status, pa.role
        FROM pilot_assignments pa
        WHERE pa.flight_id = ${flightId} AND pa.pilot_id = ${pilotId}
        LIMIT 1
    `.execute(kdb);

    const assignmentStatus = assignment.rows.length > 0
        ? (assignment.rows[0] as { id: number; status: string }).status
        : null;

    const planSignOff = await sql<{ id: number }>`
        SELECT id FROM sign_offs
        WHERE entity_type = 'plan_verification' AND entity_id = ${flightId}
        AND signed_by = ${Number(user.id)} LIMIT 1
    `.execute(kdb);
    const planVerified = planSignOff.rows.length > 0;

    const briefingSignOff = await sql<{ id: number }>`
        SELECT id FROM sign_offs
        WHERE entity_type = 'briefing' AND entity_id = ${flightId}
        AND signed_by = ${Number(user.id)} LIMIT 1
    `.execute(kdb);
    const briefingAccepted = briefingSignOff.rows.length > 0;

    let fuelOrdered = false;
    try {
        const hasFuelOrder = await sql<{ id: number }>`
            SELECT id FROM fuel_orders WHERE flight_id = ${flightId} LIMIT 1
        `.execute(kdb);
        fuelOrdered = hasFuelOrder.rows.length > 0;
    } catch {
        fuelOrdered = false;
    }

    const opsStarted = await sql<{ count: string }>`
        SELECT COUNT(*) as count FROM flight_legs
        WHERE flight_id = ${flightId} AND atd IS NOT NULL
    `.execute(kdb);
    const departed = Number((opsStarted.rows[0] as { count: string }).count) > 0;

    let logged = false;
    try {
        const logSubmitted = await sql<{ id: number }>`
            SELECT id FROM flight_logs
            WHERE flight_id = ${flightId} LIMIT 1
        `.execute(kdb);
        logged = logSubmitted.rows.length > 0;
    } catch {
        logged = false;
    }

    const steps: Array<{ label: string; key: string; completed: boolean; active: boolean; href?: string }> = [
        {
            label: "Assigned", key: "assigned",
            completed: assignmentStatus !== null && assignmentStatus !== PilotAssignmentStatus.DECLINED,
            active: assignmentStatus === PilotAssignmentStatus.ASSIGNED,
            href: `/pilot/flight/${flightId}`,
        },
        {
            label: "Plan Verified", key: "plan",
            completed: planVerified,
            active: !planVerified && assignmentStatus === PilotAssignmentStatus.CONFIRMED,
            href: `/pilot/flight/${flightId}/plan`,
        },
        {
            label: "Briefing Accepted", key: "briefing",
            completed: briefingAccepted,
            active: !briefingAccepted && planVerified,
            href: `/pilot/flight/${flightId}/briefing`,
        },
        {
            label: "Fuel Ordered", key: "fuel",
            completed: fuelOrdered,
            active: !fuelOrdered && briefingAccepted,
            href: `/pilot/flight/${flightId}/fuel`,
        },
        {
            label: "Departed", key: "departed",
            completed: departed,
            active: !departed && fuelOrdered,
            href: `/pilot/flight/${flightId}/ops`,
        },
        {
            label: "Logged", key: "logged",
            completed: logged,
            active: !logged && departed,
            href: `/pilot/flight/${flightId}/log`,
        },
    ];

    const nextStep = steps.find((s) => !s.completed);

    return json({
        flightNumber: f.flight_number,
        originCode: f.origin_code,
        destinationCode: f.destination_code,
        departureTime: f.departure_time,
        arrivalTime: f.arrival_time,
        flightStatus: f.status,
        aircraftRegistration: f.aircraft_registration ?? "Unassigned",
        aircraftType: f.aircraft_type ?? "BN-2 Islander",
        operationalNotes: f.operational_notes,
        assignmentStatus,
        steps,
        nextStep,
    });
}

export default function PilotFlightOverview() {
    const data = useLoaderData<typeof loader>();

    return (
        <div className="space-y-6">
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">Status Timeline</h2>
                <div className="flex items-start gap-0 overflow-x-auto pb-2">
                    {data.steps.map((step, idx) => (
                        <div key={step.key} className="flex items-start flex-1 min-w-0">
                            <div className="flex flex-col items-center">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                    step.completed
                                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                        : step.active
                                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 ring-2 ring-blue-400"
                                            : "bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500"
                                }`}>
                                    {step.completed ? "✓" : idx + 1}
                                </div>
                                <span className={`mt-1 text-[10px] font-medium whitespace-nowrap ${
                                    step.completed
                                        ? "text-emerald-600 dark:text-emerald-400"
                                        : step.active
                                            ? "text-blue-600 dark:text-blue-400"
                                            : "text-slate-400 dark:text-slate-500"
                                }`}>
                                    {step.label}
                                </span>
                            </div>
                            {idx < data.steps.length - 1 && (
                                <div className={`flex-1 h-0.5 mt-4 mx-1 rounded ${
                                    step.completed
                                        ? "bg-emerald-400"
                                        : "bg-slate-200 dark:bg-slate-600"
                                }`} />
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-3">Flight Summary</h2>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                        <dt className="text-slate-500 dark:text-slate-400">Route</dt>
                        <dd className="font-medium text-slate-800 dark:text-slate-100">
                            {data.originCode} → {data.destinationCode}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-slate-500 dark:text-slate-400">Aircraft</dt>
                        <dd className="font-medium text-slate-800 dark:text-slate-100">
                            {data.aircraftRegistration} ({data.aircraftType})
                        </dd>
                    </div>
                    <div>
                        <dt className="text-slate-500 dark:text-slate-400">Departure</dt>
                        <dd className="font-medium text-slate-800 dark:text-slate-100">
                            {data.departureTime ? new Date(data.departureTime).toLocaleString("en-GB") : "—"}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-slate-500 dark:text-slate-400">Status</dt>
                        <dd>
                            <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400">
                                {data.flightStatus.replace("_", " ")}
                            </span>
                        </dd>
                    </div>
                </dl>
            </div>

            {data.nextStep && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-800 p-5">
                    <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-1">Next Action</h3>
                    <p className="text-sm text-blue-600 dark:text-blue-400 mb-3">
                        {data.nextStep.label === "Plan Verified" && "Review and verify your flight plan."}
                        {data.nextStep.label === "Briefing Accepted" && "Complete your pre-flight briefing."}
                        {data.nextStep.label === "Fuel Ordered" && "Issue a fuel order for this flight."}
                        {data.nextStep.label === "Departed" && "Record departure times and actuals."}
                        {data.nextStep.label === "Logged" && "Submit your post-flight log."}
                        {!["Plan Verified", "Briefing Accepted", "Fuel Ordered", "Departed", "Logged"].includes(data.nextStep.label) && `Proceed to ${data.nextStep.label}.`}
                    </p>
                    {data.nextStep.href && (
                        <Link
                            to={data.nextStep.href}
                            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
                        >
                            Go to {data.nextStep.label}
                        </Link>
                    )}
                </div>
            )}

            {data.operationalNotes && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">Operational Notes</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                        {data.operationalNotes}
                    </p>
                </div>
            )}
        </div>
    );
}
