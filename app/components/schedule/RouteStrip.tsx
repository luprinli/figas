import { ArrowRight } from "lucide-react";
import { formatTimeHM } from "../../utils/format-time";

export interface RouteStripLeg {
    leg_sequence: number;
    origin_code: string;
    destination_code: string;
    departure_time: string | null;
    arrival_time: string | null;
    distance_nm: number | null;
}

export interface RouteStripProps {
    legs: RouteStripLeg[];
    compact?: boolean;
}

/**
 * RouteStrip visualizes a multi-stop sortie route as a horizontal dot-and-line strip.
 *
 * States:
 * - Loading: Skeleton placeholder
 * - Empty: "No route data" message
 * - Single leg: Simple origin \u2192 destination display
 * - Multi-leg: Full dot-and-line strip
 * - Compact: Collapsed view with "(N stops)" badge
 */
export default function RouteStrip({ legs, compact = false }: RouteStripProps) {
    // ── Loading state ──────────────────────────────────────────────────────
    if (legs == null) {
        return (
            <div className="h-6 animate-pulse rounded bg-slate-200 dark:bg-slate-600" />
        );
    }

    // ── Empty state ─────────────────────────────────────────────────────────
    if (legs.length === 0) {
        return (
            <div className="text-xs italic text-slate-500 dark:text-slate-500">No route data</div>
        );
    }

    // Build ordered list of stops from legs
    const stops: Array<{
        code: string;
        departure_time: string | null;
        arrival_time: string | null;
        distance_nm: number | null;
        isOrigin: boolean;
        isDestination: boolean;
        occurrenceIndex: number;
    }> = [];

    for (let i = 0; i < legs.length; i++) {
        const leg = legs[i];
        if (i === 0) {
            stops.push({
                code: leg.origin_code,
                departure_time: leg.departure_time,
                arrival_time: null,
                distance_nm: null,
                isOrigin: true,
                isDestination: false,
                occurrenceIndex: 0,
            });
        }
        stops.push({
            code: leg.destination_code,
            departure_time: null,
            arrival_time: leg.arrival_time,
            distance_nm: leg.distance_nm,
            isOrigin: false,
            isDestination: i === legs.length - 1,
            occurrenceIndex: 0,
        });
    }

    const codeCount = new Map<string, number>();
    for (const stop of stops) {
        const count = codeCount.get(stop.code) ?? 0;
        stop.occurrenceIndex = count;
        codeCount.set(stop.code, count + 1);
    }

    const totalOccurrences = new Map<string, number>();
    for (const stop of stops) {
        totalOccurrences.set(stop.code, (totalOccurrences.get(stop.code) ?? 0) + 1);
    }

    if (compact) {
        const firstCode = stops[0].code;
        const lastCode = stops[stops.length - 1].code;
        const stopCount = stops.length;

        return (
            <div
                className="group relative inline-flex items-center gap-1.5 text-xs"
                title={stops.map((s) => {
                    const time = s.departure_time ?? s.arrival_time ?? "";
                    const timeStr = time ? ` ${new Date(time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "";
                    return `${s.code}${timeStr}`;
                }).join(" \u2192 ")}
            >
                <span className="font-medium text-green-700 dark:text-green-400 dark:text-green-400">{firstCode}</span>
                <span className="text-slate-500 dark:text-slate-500">{'\u2192'}</span>
                <span className="font-medium text-red-700 dark:text-red-400 dark:text-red-400">{lastCode}</span>
                {stopCount > 2 && (
                    <span className="rounded-full bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400 dark:text-amber-400">
                        {stopCount} stops
                    </span>
                )}
            </div>
        );
    }

    function getStopColor(stop: typeof stops[0]): string {
        if (stop.isOrigin) return "text-green-600 dark:text-green-400";
        if (stop.isDestination) return "text-red-600 dark:text-red-400";
        return "text-blue-600";
    }

    function getStopDotFill(stop: typeof stops[0]): string {
        if (stop.isOrigin) return "fill-green-500";
        if (stop.isDestination) return "fill-red-500";
        return "fill-blue-400";
    }

    function getStopDotRing(stop: typeof stops[0]): string {
        if (stop.isOrigin) return "ring-green-200 dark:ring-green-700";
        if (stop.isDestination) return "ring-red-200 dark:ring-red-700";
        return "ring-blue-200 dark:ring-blue-700";
    }

    return (
        <div className="overflow-x-auto">
            <div className="flex items-center gap-0 min-w-max py-1" role="list" aria-label={`Route: ${stops.map(s => s.code).join(" \u2192 ")}`}>
                {stops.map((stop, idx) => {
                    const isLast = idx === stops.length - 1;
                    const time = stop.departure_time ?? stop.arrival_time;
                    const timeStr = formatTimeHM(time);
                    const showDuplicateBadge = totalOccurrences.get(stop.code)! > 1;

                    return (
                        <div key={`${stop.code}-${idx}`} className="flex items-center">
                            <div className="flex flex-col items-center">
                                <div className="group relative">
                                    <div
                                        className={[
                                            "h-3.5 w-3.5 rounded-full ring-1.5",
                                            getStopDotFill(stop),
                                            getStopDotRing(stop),
                                        ].join(" ")}
                                    />
                                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-[10px] text-white opacity-0 shadow-lg dark:shadow-slate-900/50 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                                        <div className="font-semibold">{stop.code}</div>
                                        {stop.distance_nm != null && (
                                            <div className="text-slate-300 dark:text-slate-500">{stop.distance_nm} nm</div>
                                        )}
                                        {timeStr && (
                                            <div className="text-slate-300 dark:text-slate-500">{timeStr}</div>
                                        )}
                                        <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                                    </div>
                                </div>

                                <div className="mt-1 flex items-center gap-0.5">
                                    <span className={`text-[10px] font-semibold leading-tight ${getStopColor(stop)}`}>
                                        {stop.code}
                                    </span>
                                    {showDuplicateBadge && (
                                        <span className="rounded bg-slate-100 dark:bg-slate-700 px-0.5 text-[8px] font-medium text-slate-500 dark:text-slate-500">
                                            {totalOccurrences.get(stop.code)!}�—
                                        </span>
                                    )}
                                </div>

                                {timeStr && (
                                    <span className="text-[9px] text-slate-500 dark:text-slate-500">{timeStr}</span>
                                )}
                            </div>

                            {!isLast && (
                                <div className="mx-1 flex items-center">
                                    <div className="h-0.5 w-5 bg-slate-300" />
                                    <ArrowRight size={14} className="text-slate-500 dark:text-slate-500" strokeWidth={2} absoluteStrokeWidth />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
