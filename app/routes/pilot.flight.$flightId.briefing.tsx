import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";

import { requirePermission } from "../utils/permissions.server";
import { Permission, DEFAULT_BN2_EMPTY_WEIGHT_KG, DEFAULT_BN2_MTOW_KG, DEFAULT_CLOTHED_BODY_WEIGHT_KG } from "../utils/constants";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import { requireUser } from "../utils/layout.server";
import PilotBriefing from "../components/pilot/PilotBriefing";
import type { PilotBriefingData } from "../components/pilot/PilotBriefing";
import { TourTrigger } from "../components/TourTrigger";
import { pilotBriefingTour } from "../utils/tour/definitions/pilot-briefing";
import { initializeChecklist, toggleChecklistItem, computeChecklistStats }
    from "../utils/services/checklist.service";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
    { title: `Briefing — ${data?.flightNumber ?? ""} - FIGAS` },
];

export async function loader({ request, params }: LoaderFunctionArgs) {
    await requirePermission(request, Permission.FLIGHT_VIEW);

    const flightId = Number(params.flightId);

    const flight = await sql<{
        id: number; flight_number: string; departure_time: string; arrival_time: string;
        origin_code: string; destination_code: string;
        aircraft_registration: string; aircraft_type: string;
        empty_weight_kg: number; mtow_kg: number; mlw_kg: number;
        operational_notes: string;
    }>`
        SELECT f.id, f.flight_number, f.departure_time, f.arrival_time,
               ao.code AS origin_code, ad.code AS destination_code,
               a.registration AS aircraft_registration, a.type AS aircraft_type,
               COALESCE(a.empty_weight_kg, ${DEFAULT_BN2_EMPTY_WEIGHT_KG}) AS empty_weight_kg,
               COALESCE(a.max_takeoff_weight_kg, ${DEFAULT_BN2_MTOW_KG}) AS mtow_kg,
               COALESCE(a.max_takeoff_weight_kg, ${DEFAULT_BN2_MTOW_KG}) AS mlw_kg,
               f.operational_notes
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

    const legs = await sql<{
        leg_number: number; origin_code: string; destination_code: string;
        distance_nm: number | null; etd: string | null; eta: string | null;
    }>`
        SELECT leg_number, origin_code, destination_code, distance_nm, etd, eta
        FROM flight_legs WHERE flight_id = ${flightId} ORDER BY leg_number
    `.execute(kdb);

    const crew = await sql<{ name: string; role: string }>`
        SELECT u.name, pa.role
        FROM pilot_assignments pa
        JOIN pilots p ON p.id = pa.pilot_id
        JOIN users u ON u.id = p.user_id
        WHERE pa.flight_id = ${flightId}
    `.execute(kdb);

    const passengers = await sql<{
        name: string; origin: string; destination: string; seat: string; weightKg: number;
    }>`
        SELECT bp.first_name || ' ' || bp.last_name AS name,
               bl.origin_code AS origin, bl.destination_code AS destination,
               COALESCE(blp.seat_number, '—') AS seat,
               COALESCE(blp.clothed_weight_kg, ${DEFAULT_CLOTHED_BODY_WEIGHT_KG}) AS "weightKg"
        FROM booking_leg_passengers blp
        JOIN booking_legs bl ON bl.id = blp.booking_leg_id
        JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
        WHERE blp.flight_leg_id IS NOT NULL
          AND bl.flight_id = ${flightId}
    `.execute(kdb);

    const wbResult = await sql<{
        passenger_weight_kg: number; baggage_weight_kg: number; freight_weight_kg: number;
        fuel_weight_kg: number; crew_weight_kg: number; total_weight_kg: number;
        mtow_used_pct: number; mlw_used_pct: number; cg_position_pct: number;
        binding_constraint: string;
        required_fuel_kg: number | null;
        minimum_fuel_kg: number | null;
        fuel_state: string | null;
        fuel_rule_applied: string | null;
        starting_fuel_kg: number | null;
        reserve_fuel_kg: number | null;
    }>`
        SELECT wbs.passenger_weight_kg, wbs.baggage_weight_kg, wbs.freight_weight_kg,
               wbs.fuel_weight_kg, wbs.crew_weight_kg, wbs.total_weight_kg,
               wbs.mtow_used_pct, wbs.mlw_used_pct, wbs.cg_position_pct,
               COALESCE(wbs.binding_constraint, 'OK') AS binding_constraint,
               wbs.required_fuel_kg, wbs.minimum_fuel_kg,
               wbs.fuel_state, wbs.fuel_rule_applied,
               wbs.starting_fuel_kg, wbs.reserve_fuel_kg
        FROM weight_balance_snapshots wbs
        JOIN flight_legs fl ON fl.id = wbs.flight_leg_id
        WHERE fl.flight_id = ${flightId}
        ORDER BY wbs.id DESC LIMIT 1
    `.execute(kdb);

    const briefingData: PilotBriefingData = {
        flightNumber: f.flight_number,
        date: f.departure_time,
        origin: f.origin_code,
        destination: f.destination_code,
        departureTime: f.departure_time,
        arrivalTime: f.arrival_time,
        legs: legs.rows.map((l) => ({
            legNumber: Number(l.leg_number),
            originCode: l.origin_code,
            destinationCode: l.destination_code,
            distanceNm: l.distance_nm != null ? Number(l.distance_nm) : null,
            etd: l.etd,
            eta: l.eta,
        })),
        aircraftRegistration: f.aircraft_registration ?? "Unassigned",
        aircraftType: f.aircraft_type ?? "BN-2 Islander",
        emptyWeightKg: Number(f.empty_weight_kg),
        mtowKg: Number(f.mtow_kg),
        mlwKg: Number(f.mlw_kg),
        crew: crew.rows.map((c) => ({ name: c.name, role: c.role })),
        passengers: passengers.rows.map((p) => ({
            name: p.name,
            origin: p.origin,
            destination: p.destination,
            seat: String(p.seat),
            weightKg: Number(p.weightKg),
        })),
        fuelPlan: wbResult.rows.length > 0 ? {
            requiredFuelKg: Number(wbResult.rows[0].required_fuel_kg ?? 45),
            reserveFuelKg: Number(wbResult.rows[0].reserve_fuel_kg ?? 35),
            burnRateKgPerHr: 45,
            enduranceMinutes: wbResult.rows[0].fuel_weight_kg
                ? Math.round((Number(wbResult.rows[0].fuel_weight_kg) / 45) * 60)
                : 120,
            needsStanleyRevisit: wbResult.rows[0].fuel_state === "stanley_revisit",
        } : {
            requiredFuelKg: 45,
            reserveFuelKg: 35,
            burnRateKgPerHr: 45,
            enduranceMinutes: 120,
            needsStanleyRevisit: false,
        },
        weightBalance: wbResult.rows.length > 0 ? {
            passengerWeightKg: Number(wbResult.rows[0].passenger_weight_kg),
            baggageWeightKg: Number(wbResult.rows[0].baggage_weight_kg),
            freightWeightKg: Number(wbResult.rows[0].freight_weight_kg),
            fuelWeightKg: Number(wbResult.rows[0].fuel_weight_kg),
            crewWeightKg: Number(wbResult.rows[0].crew_weight_kg),
            totalWeightKg: Number(wbResult.rows[0].total_weight_kg),
            mtowUsedPct: Number(wbResult.rows[0].mtow_used_pct),
            mlwUsedPct: Number(wbResult.rows[0].mlw_used_pct),
            cgPositionPct: Number(wbResult.rows[0].cg_position_pct),
            bindingConstraint: String(wbResult.rows[0].binding_constraint),
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

    let checklist: Array<{ id: number; flightId: number; itemKey: string; itemLabel: string; checked: boolean; checkedBy: number | null; checkedAt: string | null }> = [];
    let checklistStats = { total: 0, checked: 0, pct: 0, byCategory: [] as Array<{ category: string; total: number; checked: number; pct: number }> };
    try {
        const loaded = await initializeChecklist(flightId);
        checklist = loaded;
        checklistStats = computeChecklistStats(loaded);
    } catch {
        checklist = [];
        checklistStats = { total: 0, checked: 0, pct: 0, byCategory: [] };
    }

    return json({ ...briefingData, flightNumber: f.flight_number, checklist, checklistStats });
}

export async function action({ request, params }: ActionFunctionArgs) {
    const { userId } = await requireUser(request);
    const flightId = Number(params.flightId);
    if (!flightId) return json({ error: "Flight ID required" }, { status: 400 });

    const formData = await request.formData();
    const intent = formData.get("intent")?.toString();

    if (intent === "accept-briefing") {
        const existing = await sql<{ id: number }>`
            SELECT id FROM sign_offs WHERE entity_type = 'briefing' AND entity_id = ${flightId} AND signed_by = ${Number(userId)} LIMIT 1
        `.execute(kdb);

        if (existing.rows.length > 0) {
            return json({ error: "Briefing already accepted" }, { status: 409 });
        }

        await sql`
            INSERT INTO sign_offs (entity_type, entity_id, signed_by, signed_at, certification_statement)
            VALUES ('briefing', ${flightId}, ${Number(userId)}, NOW(),
                    ${`I have reviewed and accept the briefing for flight #${flightId}`})
        `.execute(kdb);

        await sql`
            UPDATE pilot_assignments SET confirmed_at = NOW(), status = 'confirmed'
            WHERE flight_id = ${flightId} AND pilot_id IN (
                SELECT id FROM pilots WHERE user_id = ${Number(userId)}
            )
        `.execute(kdb);

        return json({ success: true, message: "Briefing accepted" });
    }

    if (intent === "toggle-checklist") {
        const itemKey = formData.get("itemKey")?.toString();
        if (!itemKey) return json({ error: "Item key required" }, { status: 400 });

        const updated = await toggleChecklistItem(flightId, itemKey, Number(userId));
        if (!updated) return json({ error: "Checklist item not found" }, { status: 404 });

        return json({ success: true, item: updated });
    }

    return json({ error: "Unknown intent" }, { status: 400 });
}

export default function PilotBriefingTab() {
    const data = useLoaderData<typeof loader>();
    const briefingFetcher = useFetcher<{ success?: boolean; error?: string; message?: string }>();
    const checklistFetcher = useFetcher<{ success?: boolean; item?: { id: number; itemKey: string; checked: boolean } }>();

    const accepted = briefingFetcher.data?.success === true;

    return (
        <div>
            <div className="flex justify-end px-4 pt-4 gap-2">
                <TourTrigger config={pilotBriefingTour} />
            </div>

            <PilotBriefing data={data as PilotBriefingData} />

            {/* Pre-Flight Checklist */}
            <div className="space-y-4 p-4">
                <div className="rounded-lg bg-white dark:bg-slate-800 p-4 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Pre-Flight Checklist
                        </h3>
                        <span className="text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400">
                            {data.checklistStats.checked}/{data.checklistStats.total} ({data.checklistStats.pct}%)
                        </span>
                    </div>

                    <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-600 mb-3">
                        <div
                            className="h-2 rounded-full bg-emerald-500 transition-all"
                            style={{ width: `${data.checklistStats.pct}%` }}
                        />
                    </div>

                    <div className="space-y-1">
                        {data.checklist.map((item) => {
                            const isChecked = checklistFetcher.data?.item?.itemKey === item.itemKey
                                ? checklistFetcher.data.item.checked
                                : item.checked;
                            return (
                                <checklistFetcher.Form method="post" key={item.id}>
                                    <input type="hidden" name="intent" value="toggle-checklist" />
                                    <input type="hidden" name="itemKey" value={item.itemKey} />
                                    <button type="submit"
                                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm transition-colors ${
                                            isChecked
                                                ? "bg-emerald-50 dark:bg-emerald-900/10 text-slate-500 dark:text-slate-400 line-through"
                                                : "hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                                        }`}
                                    >
                                        <span className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                                            isChecked
                                                ? "border-emerald-400 bg-emerald-400 text-white"
                                                : "border-slate-300 dark:border-slate-500"
                                        }`}>
                                            {isChecked ? "\u2713" : ""}
                                        </span>
                                        <span>{item.itemLabel}</span>
                                    </button>
                                </checklistFetcher.Form>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Accept Briefing */}
            <div className="mt-6 flex justify-center pb-6">
                {accepted ? (
                    <span className="rounded-md bg-emerald-100 px-4 py-2 text-sm font-medium text-emerald-700">
                        Briefing Accepted
                    </span>
                ) : (
                    <briefingFetcher.Form method="post">
                        <input type="hidden" name="intent" value="accept-briefing" />
                        <button
                            type="submit"
                            data-tour="accept-briefing"
                            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
                        >
                            Accept Briefing
                        </button>
                    </briefingFetcher.Form>
                )}
            </div>
        </div>
    );
}
