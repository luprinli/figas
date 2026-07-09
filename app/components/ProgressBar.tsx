export interface ProgressBarProps {
  current: number;
  max: number;
  label: string;
  subtitle?: string;
  colorThresholds?: { green: number; amber: number; red: number };
  className?: string;
  onClick?: () => void;
}

const defaultThresholds = { green: 75, amber: 90, red: 100 };

export default function ProgressBar({
  current,
  max,
  label,
  subtitle,
  colorThresholds = defaultThresholds,
  className = "",
  onClick,
}: ProgressBarProps) {
  const pct = Math.min(100, Math.round((current / max) * 100));
  const remaining = Math.max(0, max - current);

  const severity =
    pct >= colorThresholds.red ? "red" :
    pct >= colorThresholds.amber ? "amber" :
    "green";

  const accentColors = {
    red: "border-l-red-500 dark:border-l-red-400",
    amber: "border-l-amber-500 dark:border-l-amber-400",
    green: "border-l-emerald-500 dark:border-l-emerald-400",
  };

  const barColors = {
    red: "bg-red-500 dark:bg-red-400",
    amber: "bg-amber-500 dark:bg-amber-400",
    green: "bg-emerald-500 dark:bg-emerald-400",
  };

  const textColors = {
    red: "text-red-600 dark:text-red-400",
    amber: "text-amber-600 dark:text-amber-400",
    green: "text-emerald-600 dark:text-emerald-400",
  };

  const dotColors = {
    red: "bg-red-500",
    amber: "bg-amber-500",
    green: "bg-emerald-500",
  };

  return (
    <div
      className={`flex items-center gap-4 rounded-lg border border-slate-200 dark:border-slate-700 border-l-4 bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/20 ${accentColors[severity]} ${onClick ? "cursor-pointer hover:ring-2 hover:ring-blue-300 transition-all" : ""} ${className}`}
      onClick={onClick}
      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && onClick) { e.preventDefault(); onClick(); } }}
      role="button"
      tabIndex={0}
    >
      {/* Column 1: Aircraft identity */}
      <div className="w-36 shrink-0">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</p>
        {subtitle && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
        )}
      </div>

      {/* Column 2: Progress bar */}
      <div className="flex-1 min-w-0">
        <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColors[severity]}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Column 3: Metrics */}
      <div className="shrink-0 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <span className={`inline-block h-2 w-2 rounded-full ${dotColors[severity]}`} />
          <span className={`text-sm font-bold tabular-nums ${textColors[severity]}`}>{pct}%</span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap mt-0.5">
          {remaining.toLocaleString()} hrs to service
        </p>
      </div>
    </div>
  );
}
