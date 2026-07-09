import { User } from "lucide-react";

export interface FlightCrewProps {
    pilot_name: string | null;
    pilot_status: string | null;
    /** When true, render minimal: name + status dot only (no badge) */
    compact?: boolean;
}

function pilotStatusDot(status: string | null): { bg: string; label: string } {
    switch (status) {
        case "confirmed":
            return { bg: "bg-green-50 dark:bg-green-900/30 dark:bg-green-900/300", label: "Confirmed" };
        case "assigned":
            return { bg: "bg-blue-50 dark:bg-blue-900/30 dark:bg-blue-900/300", label: "Assigned" };
        case "checked_in":
            return { bg: "bg-emerald-50 dark:bg-emerald-900/30 dark:bg-emerald-900/300", label: "Checked In" };
        case "declined":
            return { bg: "bg-red-50 dark:bg-red-900/30 dark:bg-red-900/300", label: "Declined" };
        default:
            return { bg: "bg-slate-300", label: "TBC" };
    }
}

export default function FlightCrew({
    pilot_name,
    pilot_status,
    compact = true,
}: FlightCrewProps) {
    const dot = pilotStatusDot(pilot_status);

    if (compact) {
        return (
            <span className="inline-flex items-center gap-1.5 text-[11px]">
                <User size={14} className="text-slate-500 dark:text-slate-400 shrink-0" strokeWidth={1.5} absoluteStrokeWidth />
                <span className={pilot_name ? "font-medium text-slate-700 dark:text-slate-200" : "text-slate-500 dark:text-slate-400 dark:text-slate-500"}>
                    {pilot_name ?? "Pilot TBC"}
                </span>
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot.bg}`} aria-label={dot.label} />
            </span>
        );
    }

    return (
        <div className="mb-2 flex items-center gap-2">
            <User size={16} className="text-slate-500 dark:text-slate-400 dark:text-slate-500" strokeWidth={1.5} absoluteStrokeWidth />
            {pilot_name ? (
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{pilot_name}</span>
            ) : (
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Pilot TBC</span>
            )}
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${dot.bg === "bg-green-50 dark:bg-green-900/30 dark:bg-green-900/300" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 dark:text-green-400" : dot.bg === "bg-blue-50 dark:bg-blue-900/30 dark:bg-blue-900/300" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 dark:text-blue-400 dark:text-blue-300" : dot.bg === "bg-red-50 dark:bg-red-900/30 dark:bg-red-900/300" ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 dark:text-red-400" : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 dark:text-slate-500"}`}>
                {dot.label}
            </span>
        </div>
    );
}
