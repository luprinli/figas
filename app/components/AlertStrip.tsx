

export interface AlertItem {
  id: string | number;
  message: string;
  severity: "red" | "amber" | "blue";
  timestamp?: string;
  action?: { label: string; to: string };
}

export interface AlertStripProps {
  alerts: AlertItem[];
  emptyMessage?: string;
  className?: string;
}

const severityStyles = {
  red: "border-l-red-500 bg-red-50 dark:bg-red-950 dark:border-l-red-400",
  amber: "border-l-amber-500 bg-amber-50 dark:bg-amber-950 dark:border-l-amber-400",
  blue: "border-l-blue-500 bg-blue-50 dark:bg-blue-950 dark:border-l-blue-400",
};

const severityDots = {
  red: "bg-red-500",
  amber: "bg-amber-500",
  blue: "bg-blue-500",
};

export default function AlertStrip({
  alerts,
  emptyMessage = "No alerts — all systems normal.",
  className = "",
}: AlertStripProps) {
  return (
    <div className={`rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden ${className}`}>
      <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Alerts {alerts.length > 0 && `(${alerts.length})`}
        </span>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-700">
        {alerts.length === 0 ? (
          <div className="px-4 py-4 text-center text-sm text-slate-500">
            {emptyMessage}
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className={`px-4 py-2.5 border-l-4 flex items-center justify-between ${severityStyles[alert.severity]}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`h-2 w-2 rounded-full shrink-0 ${severityDots[alert.severity]}`} />
                <span className="text-sm text-slate-700 dark:text-slate-200 truncate">
                  {alert.message}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {alert.timestamp && (
                  <span className="text-xs text-slate-500">{alert.timestamp}</span>
                )}
                {alert.action && (
                  <a
                    href={alert.action.to}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400"
                  >
                    {alert.action.label}
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
