import { useMemo, Fragment } from "react";
import { formatCompactName } from "../../utils/format-compact-name";

interface StopPassenger {
    id: number;
    booking_leg_id: number;
    compact_name: string;
    body_weight_kg: number;
    baggage_weight_kg: number;
}

interface StopManifestInput {
    aerodrome_code: string;
    aerodrome_name: string;
    leg_sequence: number;
    departing_passengers: StopPassenger[];
    arriving_passengers: StopPassenger[];
    net_body_weight_change: number;
    net_baggage_weight_change: number;
}

interface FlightLeg {
    leg_sequence: number;
    origin_code: string;
    destination_code: string;
    departure_time: string | null;
    arrival_time: string | null;
}

export interface StopActivityListProps {
    stopManifests: StopManifestInput[];
    flightLegs: FlightLeg[];
    flightStatus?: string;
    renderPassengerRow?: (params: {
        passenger: StopPassenger;
        aerodromeCode: string;
        flightId: number;
    }) => React.ReactNode;
    flightId?: number;
    perStopValidation?: Array<{
        stop_code: string;
        takeoff_weight_kg: number;
        mtow_kg: number;
        mtow_used_pct: number;
        mtow_status: "ok" | "warning" | "violation";
        landing_weight_kg: number;
        mlw_kg: number;
        mlw_used_pct: number;
        mlw_status: "ok" | "warning" | "violation";
    }> | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function computeTotal(passengers: StopPassenger[]): number {
    let t = 0;
    for (const p of passengers) t += p.body_weight_kg + p.baggage_weight_kg;
    return t;
}

function getMtowTextColor(pct: number): string {
    if (pct >= 100) return "text-red-600 dark:text-red-400";
    if (pct > 80) return "text-amber-600 dark:text-amber-400";
    return "text-green-600 dark:text-green-400";
}

function statusBadge(status: "ok" | "warning" | "violation"): { bg: string; text: string; label: string } {
    switch (status) {
        case "violation": return { bg: "bg-red-50 dark:bg-red-900/30 dark:bg-red-900/30 border-red-200 dark:border-red-800", text: "text-red-700 dark:text-red-400 dark:text-red-400", label: "!" };
        case "warning": return { bg: "bg-amber-50 dark:bg-amber-900/30 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800", text: "text-amber-700 dark:text-amber-400 dark:text-amber-400", label: "~" };
        default: return { bg: "", text: "", label: "" };
    }
}

function stopAccent(status: "ok" | "warning" | "violation"): string {
    switch (status) { case "violation": return "border-l-red-400"; case "warning": return "border-l-amber-400"; default: return "border-l-slate-200"; }
}

function formatTimeHM(iso: string | null): string | null {
    if (!iso) return null;
    try { return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }
    catch { return null; }
}

// ── Component ──────────────────────────────────────────────────────────────

export default function StopActivityList({
    stopManifests, flightLegs, flightStatus, renderPassengerRow, flightId, perStopValidation,
}: StopActivityListProps) {
    const orderedStops = useMemo(() => {
        if (!flightLegs || flightLegs.length === 0) {
            return stopManifests.map((sm) => ({
                aerodrome_code: sm.aerodrome_code, aerodrome_name: sm.aerodrome_name, leg_sequence: sm.leg_sequence,
                departing_passengers: sm.departing_passengers, arriving_passengers: sm.arriving_passengers,
                net_body_weight_change: sm.net_body_weight_change, net_baggage_weight_change: sm.net_baggage_weight_change,
                arrival_time: null as string | null, departure_time: null as string | null,
            }));
        }
        const codes: string[] = [flightLegs[0].origin_code];
        for (const leg of flightLegs) codes.push(leg.destination_code);

        const manifestMap = new Map(stopManifests.map(m => [m.aerodrome_code, m]));
        const depMap = new Map(flightLegs.map(l => [l.origin_code, l.departure_time]));
        const arrMap = new Map(flightLegs.map(l => [l.destination_code, l.arrival_time]));

        return codes.map((code) => {
            const m = manifestMap.get(code);
            return {
                aerodrome_code: code, aerodrome_name: m?.aerodrome_name ?? code,
                leg_sequence: m?.leg_sequence ?? 0,
                departing_passengers: m?.departing_passengers ?? [], arriving_passengers: m?.arriving_passengers ?? [],
                net_body_weight_change: m?.net_body_weight_change ?? 0, net_baggage_weight_change: m?.net_baggage_weight_change ?? 0,
                arrival_time: arrMap.get(code) ?? null, departure_time: depMap.get(code) ?? null,
            };
        });
    }, [stopManifests, flightLegs]);

    if (orderedStops.length === 0) {
        return <div className="rounded-md bg-slate-50 dark:bg-slate-700 p-3 text-center text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">No stop data available</div>;
    }

    // Label width for vertical alignment of titles
    const labelW = "w-16";

    return (
        <div className="space-y-1.5">
            {orderedStops.map((stop, index) => {
                const isFirst = index === 0;
                const isLast = index === orderedStops.length - 1;
                const isFinalArrival = isLast && !isFirst;

                const sv = perStopValidation?.[index];
                const displayWeightKg = isFinalArrival && sv ? sv.landing_weight_kg : sv?.takeoff_weight_kg ?? 0;
                const displayLimitKg = isFinalArrival && sv ? sv.mlw_kg : sv?.mtow_kg ?? 0;
                const displayUsedPct = isFinalArrival && sv ? sv.mlw_used_pct : sv?.mtow_used_pct ?? 0;
                const displayLabel = isFinalArrival ? "MLW" : "MTOW";
                const displayStatus = isFinalArrival && sv ? sv.mlw_status : sv?.mtow_status ?? "ok";
                const badge = statusBadge(displayStatus);
                const barPct = displayLimitKg > 0 ? Math.min(100, (displayWeightKg / displayLimitKg) * 100) : 0;
                const barColor = displayStatus === "violation" ? "bg-red-50 dark:bg-red-900/30 dark:bg-red-900/300" : displayStatus === "warning" ? "bg-amber-50 dark:bg-amber-900/30 dark:bg-amber-900/300" : "bg-green-50 dark:bg-green-900/30 dark:bg-green-900/300";
                const arrTime = formatTimeHM(stop.arrival_time);
                const depTime = formatTimeHM(stop.departure_time);
                const arrWeight = computeTotal(stop.arriving_passengers);
                const depWeight = computeTotal(stop.departing_passengers);

                return (
                    <div key={`${stop.aerodrome_code}-${index}`} className={`rounded border-l-[3px] bg-white dark:bg-slate-800 px-2.5 py-2 ${stopAccent(displayStatus)}`}>
                        {/* Header: aerodrome code + status */}
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{stop.aerodrome_code}</span>
                            {stop.aerodrome_name !== stop.aerodrome_code && <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{stop.aerodrome_name}</span>}
                            {badge.label && <span className={`ml-auto inline-flex items-center rounded border px-1.5 py-px text-[9px] font-bold ${badge.bg} ${badge.text}`}>{badge.label}</span>}
                        </div>

                        {/* Weight bar */}
                        {sv && (
                            <div className="mb-1.5">
                                <div className="flex items-center justify-between mb-0.5">
                                    <span className={`font-mono tabular-nums text-[11px] font-semibold ${getMtowTextColor(displayUsedPct)}`}>{displayWeightKg.toLocaleString()} / {displayLimitKg.toLocaleString()} kg</span>
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500">{displayLabel}</span>
                                </div>
                                <div className="h-1 w-full rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden"><div className={`h-1 rounded-full ${barColor} transition-all`} style={{ width: `${barPct}%` }} /></div>
                            </div>
                        )}

                        {/* Arrivals */}
                        <div className="flex items-start gap-2 mb-1">
                            <div className={`${labelW} flex-shrink-0 flex items-center gap-0.5 pt-0.5`}>
                                <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500">Arr</span>
                                {arrTime && <span className="font-mono text-[9px] text-slate-500 dark:text-slate-400 dark:text-slate-500">{arrTime}</span>}
                            </div>
                            <div className="flex-1 min-w-0">
                                {stop.arriving_passengers.length > 0 ? (
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                            {stop.arriving_passengers.map((p) =>
                                                renderPassengerRow && flightId
                                                    ? <Fragment key={p.id}>{renderPassengerRow({ passenger: p, aerodromeCode: stop.aerodrome_code, flightId })}</Fragment>
                                                    : <span key={p.id} className="text-xs text-slate-700 dark:text-slate-200">{formatCompactName(p.compact_name)}</span>
                                            )}
                                        </div>
                                        <span className="flex-shrink-0 font-mono tabular-nums text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500">{arrWeight}kg</span>
                                    </div>
                                ) : (
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400 italic">{isFirst ? "Origin — no arrivals" : "No arrivals"}</span>
                                )}
                            </div>
                        </div>

                        {/* Departures */}
                        <div className="flex items-start gap-2">
                            <div className={`${labelW} flex-shrink-0 flex items-center gap-0.5 pt-0.5`}>
                                <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500">Dep</span>
                                {depTime && <span className="font-mono text-[9px] text-slate-500 dark:text-slate-400 dark:text-slate-500">{depTime}</span>}
                            </div>
                            <div className="flex-1 min-w-0">
                                {stop.departing_passengers.length > 0 ? (
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                            {stop.departing_passengers.map((p) =>
                                                renderPassengerRow && flightId
                                                    ? <Fragment key={p.id}>{renderPassengerRow({ passenger: p, aerodromeCode: stop.aerodrome_code, flightId })}</Fragment>
                                                    : <span key={p.id} className="text-xs text-slate-700 dark:text-slate-200">{formatCompactName(p.compact_name)}</span>
                                            )}
                                        </div>
                                        <span className="flex-shrink-0 font-mono tabular-nums text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500">{depWeight}kg</span>
                                    </div>
                                ) : (
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400 italic">{isLast ? "Destination — no departures" : "No departures"}</span>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
