import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { db } from "../utils/db.server";
import PilotBriefing from "../components/pilot/PilotBriefing";
import type { PilotBriefingData } from "../components/pilot/PilotBriefing";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
    { title: `Pilot Briefing — ${data?.flightNumber ?? ""} - FIGAS` },
];

export async function loader({ request, params }: LoaderFunctionArgs) {
    await requirePermission(request, Permission.FLIGHT_VIEW);

    const flight = await db.$queryRawUnsafe<Array<{
        id: number; flight_number: string; departure_time: string; arrival_time: string;
        origin_code: string; destination_code: string;
        aircraft_registration: string; aircraft_type: string;
        empty_weight_kg: number; mtow_kg: number; mlw_kg: number;
        operational_notes: string;
    }>>(
        `SELECT f.id, f.flight_number, f.departure_time, f.arrival_time,
       ao.code AS origin_code, ad.code AS destination_code,
       a.registration AS aircraft_registration, a.type AS aircraft_type,
       COALESCE(a.empty_weight_kg, 1627) AS empty_weight_kg,
       COALESCE(a.mtow_kg, 2994) AS mtow_kg,
       COALESCE(a.mlw_kg, 2994) AS mlw_kg,
       f.operational_notes
 FROM flights f
 JOIN aerodromes ao ON ao.id = f.origin_aerodrome_id
 JOIN aerodromes ad ON ad.id = f.destination_aerodrome_id
 LEFT JOIN aircraft a ON a.id = f.aircraft_id
 WHERE f.id = $1`,
        [Number(params.flightId)]
    );

    if (flight.length === 0) {
        throw new Response("Flight not found", { status: 404 });
    }

    const f = flight[0];

    const crew = await db.$queryRawUnsafe<Array<{ name: string; role: string }>>(
        `SELECT u.name, pa.role
 FROM pilot_assignments pa
 JOIN pilots p ON p.id = pa.pilot_id
 JOIN users u ON u.id = p.user_id
 WHERE pa.flight_id = $1`,
        [Number(params.flightId)]
    );

    const passengers = await db.$queryRawUnsafe<Array<{
        name: string; origin: string; destination: string; seat: string; weightKg: number;
    }>>(
        `SELECT bp.first_name || ' ' || bp.last_name AS name,
       blp.origin_code AS origin, blp.destination_code AS destination,
       COALESCE(blp.seat_number, '—') AS seat,
       COALESCE(blp.clothed_weight_kg, 70) AS "weightKg"
 FROM booking_leg_passengers blp
 JOIN booking_legs bl ON bl.id = blp.booking_leg_id
 JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
 WHERE blp.flight_leg_id IS NOT NULL
   AND bl.flight_id = $1`,
        [Number(params.flightId)]
    );

    const wbResult = await db.$queryRawUnsafe<Array<{
        passenger_weight_kg: number; baggage_weight_kg: number; freight_weight_kg: number;
        fuel_weight_kg: number; crew_weight_kg: number; total_weight_kg: number;
        mtow_used_pct: number; mlw_used_pct: number; cg_position_pct: number;
        binding_constraint: string;
    }>>(
        `SELECT passenger_weight_kg, baggage_weight_kg, freight_weight_kg,
       fuel_weight_kg, crew_weight_kg, total_weight_kg,
       mtow_used_pct, mlw_used_pct, cg_position_pct,
       COALESCE(binding_constraint, 'OK') AS binding_constraint
 FROM weight_balance_snapshots
 WHERE flight_id = $1
 ORDER BY id DESC LIMIT 1`,
        [Number(params.flightId)]
    );

    const briefingData: PilotBriefingData = {
        flightNumber: f.flight_number,
        date: f.departure_time,
        origin: f.origin_code,
        destination: f.destination_code,
        departureTime: f.departure_time,
        arrivalTime: f.arrival_time,
        aircraftRegistration: f.aircraft_registration ?? "Unassigned",
        aircraftType: f.aircraft_type ?? "BN-2 Islander",
        emptyWeightKg: Number(f.empty_weight_kg),
        mtowKg: Number(f.mtow_kg),
        mlwKg: Number(f.mlw_kg),
    crew: crew.map((c: { name: string; role: string }) => ({ name: c.name, role: c.role })),
    passengers: passengers.map((p: { name: string; origin: string; destination: string; seat: string; weightKg: number }) => ({
            name: p.name,
            origin: p.origin,
            destination: p.destination,
            seat: String(p.seat),
            weightKg: Number(p.weightKg),
        })),
        fuelPlan: {
            requiredFuelKg: 45,
            reserveFuelKg: 35,
            burnRateKgPerHr: 45,
            enduranceMinutes: 120,
            needsStanleyRevisit: false,
        },
        weightBalance: wbResult.length > 0 ? {
            passengerWeightKg: Number(wbResult[0].passenger_weight_kg),
            baggageWeightKg: Number(wbResult[0].baggage_weight_kg),
            freightWeightKg: Number(wbResult[0].freight_weight_kg),
            fuelWeightKg: Number(wbResult[0].fuel_weight_kg),
            crewWeightKg: Number(wbResult[0].crew_weight_kg),
            totalWeightKg: Number(wbResult[0].total_weight_kg),
            mtowUsedPct: Number(wbResult[0].mtow_used_pct),
            mlwUsedPct: Number(wbResult[0].mlw_used_pct),
            cgPositionPct: Number(wbResult[0].cg_position_pct),
            bindingConstraint: String(wbResult[0].binding_constraint),
        } : {
            passengerWeightKg: 0, baggageWeightKg: 0, freightWeightKg: 0,
            fuelWeightKg: 0, crewWeightKg: 80, totalWeightKg: 0,
            mtowUsedPct: 0, mlwUsedPct: 0, cgPositionPct: 0,
            bindingConstraint: "No data",
        },
        operationalNotes: f.operational_notes ?? "",
        aircraftStatus: "Operational",
        notams: [],
    };

    return json({ ...briefingData, flightNumber: f.flight_number });
}

export default function PilotBriefingRoute() {
    const data = useLoaderData<typeof loader>();
    return <PilotBriefing data={data as PilotBriefingData} />;
}



export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-700 dark:bg-slate-900">
        <div className="mx-auto max-w-lg text-center px-4">
          <div className="mb-4 text-5xl font-bold text-slate-300 dark:text-slate-500 dark:text-slate-600 dark:text-slate-300 dark:text-slate-500">{error.status}</div>
          <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Something went wrong</h1>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">{error.statusText}</p>
          <button onClick={() => window.location.reload()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Try Again</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-700 dark:bg-slate-900">
      <div className="mx-auto max-w-lg text-center px-4">
        <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Unexpected Error</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">An unexpected error occurred. Please try again.</p>
        <button onClick={() => window.location.reload()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Try Again</button>
      </div>
    </div>
  );
}