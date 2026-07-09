import { ScheduleStatus } from "../../utils/constants";
import StatusBadge from "../StatusBadge";

export interface ScheduleStatusBarProps {
  status: string;
  scheduleDate: string;
  flightCount: number;
  assignedLegCount: number;
  className?: string;
}

/**
 * ScheduleStatusBar displays the current status of a daily schedule,
 * along with summary counts (flights, assigned legs).
 */
export default function ScheduleStatusBar({
  status,
  scheduleDate,
  flightCount,
  assignedLegCount,
  className,
}: ScheduleStatusBarProps) {
  const statusLabel = getStatusLabel(status);

  return (
    <div
      data-testid="schedule-status-bar"
      data-tour="schedule-status"
      className={[
        "flex flex-wrap items-center gap-4 rounded-lg bg-white dark:bg-slate-800 px-4 py-3 shadow-sm dark:shadow-slate-900/20 ring-1 ring-slate-200 dark:ring-slate-700",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Status:</span>
        <StatusBadge status={status} />
        {statusLabel && (
          <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">({statusLabel})</span>
        )}
      </div>

      <div className="h-4 w-px bg-slate-200 dark:bg-slate-600" aria-hidden="true" />

      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">Date:</span>
        <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{scheduleDate}</span>
      </div>

      <div className="h-4 w-px bg-slate-200 dark:bg-slate-600" aria-hidden="true" />

      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">Flights:</span>
        <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{flightCount}</span>
      </div>

      <div className="h-4 w-px bg-slate-200 dark:bg-slate-600" aria-hidden="true" />

      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">Assigned Legs:</span>
        <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{assignedLegCount}</span>
      </div>
    </div>
  );
}

function getStatusLabel(status: string): string {
  switch (status) {
    case ScheduleStatus.BUILDING:
      return "Schedule is being built";
    case ScheduleStatus.APPROVED:
      return "Approved by operations";
    case ScheduleStatus.PUBLISHED:
      return "Published to pilots";
    case ScheduleStatus.PILOT_ASSIGNED:
      return "Pilots assigned to flights";
    case ScheduleStatus.LOADSHEET_GENERATED:
      return "Load sheets generated";
    case ScheduleStatus.IN_PROGRESS:
      return "Flights in progress";
    case ScheduleStatus.COMPLETED:
      return "All flights completed";
    case ScheduleStatus.CANCELLED:
      return "Schedule cancelled";
    default:
      return "";
  }
}
