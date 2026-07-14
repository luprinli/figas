import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, NavLink, Outlet, useRouteError, isRouteErrorResponse } from "@remix-run/react";

import { requireAnyPermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
    { title: `Flight ${data?.flightNumber ?? ""} - FIGAS` },
];

export async function loader({ request, params }: LoaderFunctionArgs) {
    const user = await requireAnyPermission(request, [Permission.FLIGHT_VIEW, Permission.FLIGHT_FUEL_EXECUTE]);

    const flightId = Number(params.flightId);
    if (!flightId) throw new Response("Flight ID required", { status: 400 });

    const pilotResult = await sql<{ id: number }>`
        SELECT id FROM pilots WHERE user_id = ${Number(user.id)} LIMIT 1
    `.execute(kdb);
    const pilotId = pilotResult.rows.length > 0 ? (pilotResult.rows[0] as { id: number }).id : 0;

    const flight = await sql<{
        id: number; flight_number: string; departure_time: string; arrival_time: string;
        origin_code: string; destination_code: string; status: string;
        aircraft_registration: string; aircraft_type: string;
    }>`
        SELECT f.id, f.flight_number, f.departure_time, f.arrival_time, f.status,
               ao.code AS origin_code, ad.code AS destination_code,
               a.registration AS aircraft_registration, a.type AS aircraft_type
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
        ? (assignment.rows[0] as { id: number; status: string; role: string }).status
        : null;
    const assignmentId = assignment.rows.length > 0
        ? (assignment.rows[0] as { id: number; status: string; role: string }).id
        : null;

    const tabs = [
        { to: `/pilot/flight/${flightId}`, label: "Overview", end: true },
        { to: `/pilot/flight/${flightId}/plan`, label: "Plan", end: false },
        { to: `/pilot/flight/${flightId}/briefing`, label: "Briefing", end: false },
        { to: `/pilot/flight/${flightId}/fuel`, label: "Fuel", end: false },
        { to: `/pilot/flight/${flightId}/ops`, label: "Ops", end: false },
        { to: `/pilot/flight/${flightId}/log`, label: "Log", end: false },
    ];

    return json({
        flightId,
        flightNumber: f.flight_number,
        originCode: f.origin_code,
        destinationCode: f.destination_code,
        departureTime: f.departure_time,
        arrivalTime: f.arrival_time,
        flightStatus: f.status,
        aircraftRegistration: f.aircraft_registration,
        aircraftType: f.aircraft_type,
        assignmentStatus,
        assignmentId,
        tabs,
    });
}

export default function PilotFlightHub() {
    const { flightNumber, originCode, destinationCode, tabs } = useLoaderData<typeof loader>();

    return (
        <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                        {flightNumber}
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        {originCode} → {destinationCode}
                    </p>
                </div>
            </div>

            <nav className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto" aria-label="Flight tabs">
                {tabs.map((tab) => (
                    <NavLink
                        key={tab.to}
                        to={tab.to}
                        end={tab.end}
                        className={({ isActive }) =>
                            `px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                                isActive
                                    ? "border-primary text-primary dark:text-blue-400 dark:border-blue-400"
                                    : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-200"
                            }`
                        }
                    >
                        {tab.label}
                    </NavLink>
                ))}
            </nav>

            <Outlet />
        </div>
    );
}

export function ErrorBoundary() {
    const error = useRouteError();
    if (isRouteErrorResponse(error)) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
                <div className="mx-auto max-w-lg text-center px-4">
                    <div className="mb-4 text-5xl font-bold text-slate-300 dark:text-slate-600">{error.status}</div>
                    <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Something went wrong</h1>
                    <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">{error.statusText}</p>
                    <button onClick={() => window.location.reload()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">Try Again</button>
                </div>
            </div>
        );
    }
    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
            <div className="mx-auto max-w-lg text-center px-4">
                <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Unexpected Error</h1>
                <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">An unexpected error occurred. Please try again.</p>
                <button onClick={() => window.location.reload()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">Try Again</button>
            </div>
        </div>
    );
}
