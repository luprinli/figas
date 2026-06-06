import type { ReactNode } from "react";

import { Link } from "@remix-run/react";

export interface FinanceKPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: {
    direction: "up" | "down";
    percentage: number;
  };
  icon?: ReactNode;
  accentColor?: string;
  to?: string;
}

export default function FinanceKPICard({
  title,
  value,
  subtitle,
  trend,
  icon,
  accentColor = "bg-blue-500",
  to,
}: FinanceKPICardProps) {
  const content = (
    <div
      className={[
        "relative flex items-start gap-4 overflow-hidden rounded-lg bg-white dark:bg-slate-800 p-6 shadow-sm dark:shadow-slate-900/20 ring-1 ring-slate-200 dark:ring-slate-700 transition",
        to ? "hover:ring-2 hover:ring-slate-300 cursor-pointer" : undefined,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Accent color bar */}
      <div
        className={["absolute left-0 top-0 h-full w-1", accentColor].join(" ")}
      />

      {/* Icon */}
      {icon && (
        <div className="shrink-0 text-slate-500 dark:text-slate-400 dark:text-slate-500">{icon}</div>
      )}

      <div className="flex flex-1 flex-col">
        <p className="text-sm/5 font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">{title}</p>
        <p className="mt-1 text-3xl/8 font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {value}
        </p>
        {subtitle && (
          <p className="mt-0.5 text-sm/5 text-slate-500 dark:text-slate-400 dark:text-slate-500">{subtitle}</p>
        )}
        {trend && (
          <p
            className={[
              "mt-1 text-sm/5 font-medium",
              trend.direction === "up" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400",
            ].join(" ")}
          >
            {trend.direction === "up" ? "↑" : "↓"} {trend.percentage.toFixed(1)}%
          </p>
        )}
      </div>
    </div>
  );

  if (to) {
    return <Link to={to}>{content}</Link>;
  }

  return content;
}
