import type { RouteSuggestion } from "../../utils/scheduling/scheduling-types";

/**
 * OptimizationBar — Displays the route for a draft flight.
 *
 * This is a permanent, dynamic part of the flight card.
 * It always shows the current route and allows amending it.
 * The route recalculates automatically as passengers are added or removed.
 *
 * States:
 * - Calculating: Animated skeleton with "Optimizing route..." text
 * - Route available: Route summary, aircraft recommendation, weight warnings, "Amend Route" button
 * - No route: Not rendered (null)
 */

interface OptimizationBarProps {
    suggestion: RouteSuggestion | null;
    isCalculating: boolean;
    onAmend: () => void;
    /** Optional flight validation data for inline fuel and flight time display */
    validation?: {
        total_fuel_required_kg: number;
        fuel_capacity_kg: number;
        estimated_flight_time_hours: number;
        status: "ok" | "warning" | "violation";
        binding_constraint: string | null;
        weight_warnings: string[];
    } | null;
}

/**
 * Format a route summary string from suggested legs.
 * E.g., "PSY → BVI → NWI → PSY (245 nm, 3 stops)"
 */
function formatRouteSummary(legs: RouteSuggestion["suggested_legs"]): string {
    if (legs.length === 0) return "No route";

    const stops: string[] = [];
    // Collect unique stops in order
    for (const leg of legs) {
        if (stops.length === 0) {
            stops.push(leg.origin_code);
        }
        stops.push(leg.destination_code);
    }

    return stops.join(" → ");
}

/**
 * Classify a weight warning string by severity.
 * - "violation": keywords like exceed, violat, over
 * - "warning": keywords like unknown, may, approx
 * - "info": everything else
 */
function getWarningSeverity(warning: string): 'info' | 'warning' | 'violation' {
    const lower = warning.toLowerCase();
    if (lower.includes('exceed') || lower.includes('violat') || lower.includes('over')) {
        return 'violation';
    }
    if (lower.includes('unknown') || lower.includes('may') || lower.includes('approx')) {
        return 'warning';
    }
    return 'info';
}

/**
 * Get the color for a fuel percentage dot.
 * Green: <= 80% (safe)
 * Amber: > 80% and < 100% (warning)
 * Red: >= 100% (violation — exceeded)
 */
function getFuelDotColor(pct: number): string {
    if (pct >= 100) return "bg-red-50 dark:bg-red-900/30 dark:bg-red-900/300";
    if (pct > 80) return "bg-amber-50 dark:bg-amber-900/30 dark:bg-amber-900/300";
    return "bg-green-50 dark:bg-green-900/30 dark:bg-green-900/300";
}

export default function OptimizationBar({
    suggestion,
    isCalculating,
    onAmend,
    validation,
}: OptimizationBarProps) {
    // ── Calculating state ─────────────────────────────────────────────────────
    if (isCalculating) {
        return (
            <div className="mt-3 animate-pulse rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 dark:bg-blue-900/30 p-3">
                <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full bg-blue-300 dark:bg-blue-700" />
                    <div className="h-3 w-40 rounded bg-blue-200 dark:bg-blue-800" />
                </div>
                <div className="mt-2 flex gap-2">
                    <div className="h-2.5 w-32 rounded bg-blue-200 dark:bg-blue-800" />
                    <div className="h-2.5 w-24 rounded bg-blue-200 dark:bg-blue-800" />
                </div>
                <div className="mt-2 flex items-center gap-2">
                    <div className="h-6 w-20 rounded bg-blue-200 dark:bg-blue-800" />
                    <div className="h-6 w-16 rounded bg-blue-200 dark:bg-blue-800" />
                </div>
                <div className="mt-1.5 text-[10px] text-blue-400 dark:text-blue-300">Optimizing route...</div>
            </div>
        );
    }

    // ── No suggestion ─────────────────────────────────────────────────────────
    if (!suggestion) {
        return null;
    }

    // ── Route available (always shown as accepted/active) ─────────────────────
    const routeSummary = formatRouteSummary(suggestion.suggested_legs);
    const hasWarnings = suggestion.weight_warnings.length > 0;

    return (
        <div className="mt-3 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 dark:bg-emerald-900/30 p-3">
            {/* Header */}
            <div className="mb-2 flex items-center gap-1.5">
                <svg
                    className="h-4 w-4 text-emerald-500 dark:text-emerald-400"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                >
                    <polyline points="1,8 4,4 8,12 12,4 15,8" />
                </svg>
                <span className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                    Route
                </span>
                <svg className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M13.5 3.5L6 11L2.5 7.5" stroke="currentColor" strokeWidth="2" fill="none" />
                </svg>
            </div>

            {/* Route summary */}
            <div className="mb-2 flex items-center rounded bg-white dark:bg-slate-800 px-2.5 py-2 text-sm font-medium text-slate-800 dark:text-slate-100 shadow-sm dark:shadow-slate-900/20">
                <span>{routeSummary}</span>
                {hasWarnings && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 dark:text-amber-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 dark:bg-amber-400" />
                        {suggestion.weight_warnings.length} issue{suggestion.weight_warnings.length > 1 ? 's' : ''}
                    </span>
                )}
            </div>

            {/* Stats row */}
            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300 dark:text-slate-500">
                <span>
                    <span className="font-semibold">{suggestion.total_distance_nm}</span> nm
                </span>
                <span>
                    <span className="font-semibold">{suggestion.stop_count}</span> stop
                    {suggestion.stop_count !== 1 ? "s" : ""}
                </span>
                <span>
                    <span className="font-semibold">{suggestion.suggested_legs.length}</span> leg
                    {suggestion.suggested_legs.length !== 1 ? "s" : ""}
                </span>

                {/* Inline fuel display */}
                {validation && (
                    <span className="flex items-center gap-1">
                        <span
                            className={`inline-block h-2 w-2 rounded-full ${getFuelDotColor(
                                validation.fuel_capacity_kg > 0
                                    ? Math.round((validation.total_fuel_required_kg / validation.fuel_capacity_kg) * 100)
                                    : 0
                            )}`}
                        />
                        <span>
                            {validation.total_fuel_required_kg.toLocaleString()} /{" "}
                            {validation.fuel_capacity_kg.toLocaleString()} kg fuel
                        </span>
                    </span>
                )}

                {/* Inline flight time display */}
                {validation && (
                    <span>
                        <span className="font-semibold">
                            {validation.estimated_flight_time_hours.toFixed(1)}
                        </span>{" "}
                        hrs
                    </span>
                )}
            </div>

            {/* Aircraft recommendation */}
            {suggestion.aircraft_recommendation && (
                <div className="mb-2 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 dark:text-slate-500">
                    <svg
                        className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 dark:text-slate-500"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                    >
                        <path d="M8 1 L9 5 L14 6 L10 9 L11 14 L8 12 L5 14 L6 9 L2 6 L7 5 Z" />
                    </svg>
                    <span>
                        Recommended:{" "}
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                            {suggestion.aircraft_recommendation}
                        </span>
                    </span>
                </div>
            )}

            {/* Weight warnings */}
            {hasWarnings && (
                <div className="mb-2 rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 dark:bg-amber-900/30 px-2.5 py-1.5">
                    <div className="flex items-start gap-1.5">
                        <svg
                            className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500 dark:text-amber-400"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                        >
                            <path d="M8 1L1 14h14L8 1zm0 3.5v4M8 11v1" stroke="currentColor" strokeWidth="1.5" fill="none" />
                        </svg>
                        <div className="space-y-1">
                            {suggestion.weight_warnings.map((warning, i) => {
                                const severity = getWarningSeverity(warning);
                                const colors = {
                                    info: 'border-green-400 text-green-700 dark:text-green-400 dark:text-green-400',
                                    warning: 'border-amber-400 dark:border-amber-700 text-amber-700 dark:text-amber-400 dark:text-amber-400',
                                    violation: 'border-red-400 dark:border-red-700 text-red-700 dark:text-red-400 dark:text-red-400',
                                };
                                return (
                                    <div key={i} className={`border-l-2 pl-2 text-xs ${colors[severity]}`}>
                                        {warning}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Amend Route button */}
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={onAmend}
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 dark:text-emerald-400 hover:bg-emerald-50 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/30 transition-colors"
                >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M8 3v10M3 8h10" />
                    </svg>
                    Amend Route
                </button>
            </div>
        </div>
    );
}
