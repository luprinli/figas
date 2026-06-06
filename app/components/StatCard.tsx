import type { ReactNode } from "react";

export interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: { value: string; positive: boolean };
  className?: string;
}

export default function StatCard({
  label,
  value,
  icon,
  trend,
  className,
}: StatCardProps) {
  return (
    <div
      className={[
        "relative flex items-start gap-4 overflow-hidden rounded-lg bg-white dark:bg-slate-800 p-6 shadow-sm dark:shadow-slate-900/20 ring-1 ring-slate-200 dark:ring-slate-700",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="region"
      aria-label={`${label}: ${value}`}
    >
      {/* Colored accent bar */}
      <div className="absolute left-0 top-0 h-full w-1 bg-cyan-500" />

      <div className="flex flex-1 flex-col">
        <p className="text-sm/5 font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">{label}</p>
        <p className="mt-1 text-3xl/8 font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {value}
        </p>
        {trend && (
          <p
            className={[
              "mt-1 text-sm/5 font-medium",
              trend.positive ? "text-green-600" : "text-red-600",
            ].join(" ")}
          >
            {trend.positive ? "↑" : "↓"} {trend.value}
          </p>
        )}
      </div>

      {icon && <div className="shrink-0 text-slate-500 dark:text-slate-400 dark:text-slate-500">{icon}</div>}
    </div>
  );
}
