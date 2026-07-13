export interface SystemHealthItem {
  label: string;
  status: "ok" | "warning" | "error" | "unknown";
  detail?: string;
}

export interface SystemHealthProps {
  items: SystemHealthItem[];
  className?: string;
}

const statusStyles = {
  ok: { dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400 dark:text-emerald-400", label: "Connected" },
  warning: { dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400 dark:text-amber-400", label: "Degraded" },
  error: { dot: "bg-red-500", text: "text-red-700 dark:text-red-400 dark:text-red-400", label: "Error" },
  unknown: { dot: "bg-slate-400", text: "text-slate-500 dark:text-slate-500", label: "Unknown" },
};

export default function SystemHealth({ items, className = "" }: SystemHealthProps) {
  return (
    <div className={`rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden ${className}`}>
      <div className="px-4 py-2 bg-slate-50 dark:bg-slate-700 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">
          System Health
        </span>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-700">
        {items.map((item, i) => {
          const style = statusStyles[item.status];
          return (
            <div key={i} className="px-4 py-2.5 flex items-center justify-between">
              <span className="text-sm text-slate-700 dark:text-slate-200">{item.label}</span>
              <div className="flex items-center gap-2">
                {item.detail && (
                  <span className="text-xs text-slate-500 dark:text-slate-500">{item.detail}</span>
                )}
                <span className={`inline-flex items-center gap-1 text-xs font-medium ${style.text}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                  {style.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
