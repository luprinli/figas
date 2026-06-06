import StatusBadge from "../StatusBadge";

export interface PilotAssignment {
  id: number;
  pilotId: number;
  pilotName: string;
  role: string;
  status: string;
  flightId: number;
  flightNumber: string;
}

export interface PilotAssignmentPanelProps {
  assignments: PilotAssignment[];
  className?: string;
}

/**
 * PilotAssignmentPanel displays pilot assignments for a schedule.
 * Shows which pilots are assigned to which flights and their roles.
 */
export default function PilotAssignmentPanel({
  assignments,
  className,
}: PilotAssignmentPanelProps) {
  if (assignments.length === 0) {
    return (
      <div className="text-sm text-slate-500 dark:text-slate-400 italic">
        No pilots assigned yet
      </div>
    );
  }

  // Group assignments by flight
  const grouped = new Map<string, PilotAssignment[]>();
  for (const a of assignments) {
    const key = `${a.flightNumber} (Flight #${a.flightId})`;
    const existing = grouped.get(key) ?? [];
    existing.push(a);
    grouped.set(key, existing);
  }

  return (
    <div className={className}>
      <div className="space-y-3">
        {Array.from(grouped.entries()).map(([flightLabel, pilots]) => (
          <div
            key={flightLabel}
            className="rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-white dark:bg-slate-800 p-3"
          >
            <h4 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              {flightLabel}
            </h4>
            <div className="space-y-2">
              {pilots.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded bg-slate-50 dark:bg-slate-700 px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      {p.pilotName}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                      ({formatRole(p.role)})
                    </span>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatRole(role: string): string {
  switch (role) {
    case "captain":
      return "Captain";
    case "first_officer":
      return "First Officer";
    case "relief":
      return "Relief Pilot";
    default:
      return role;
  }
}
