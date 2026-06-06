import type { ReactNode } from "react";
import { Link } from "@remix-run/react";

export interface DashboardCardProps {
  label: string;
  value: string | number;
  trend?: { direction: "up" | "down"; value: string };
  color?: "blue" | "emerald" | "amber" | "red" | "purple";
  to?: string;
  icon?: ReactNode;
  className?: string;
}

const colorMap = {
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  purple: "bg-purple-500",
};

const trendColor = {
  up: "text-emerald-600",
  down: "text-red-600",
};

export default function DashboardCard({
  label,
  value,
  trend,
  color = "blue",
  to,
  icon,
  className = "",
}: DashboardCardProps) {
  const content = (
    <div
      className={[
        "relative flex items-start gap-4 overflow-hidden rounded-lg bg-white dark:bg-slate-800 p-6 shadow-sm dark:shadow-slate-900/20 ring-1 ring-slate-200 dark:ring-slate-700 transition-shadow hover:shadow-md",
        to ? "cursor-pointer" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="region"
      aria-label={`${label}: ${value}`}
    >
      <div className={`absolute left-0 top-0 h-full w-1 ${colorMap[color]}`} />
      <div className="flex flex-1 flex-col">
        <p className="text-sm/5 font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">{label}</p>
        <p className="mt-1 text-3xl/8 font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {value}
        </p>
        {trend && (
          <p className={`mt-1 text-sm/5 font-medium ${trendColor[trend.direction]}`}>
            {trend.direction === "up" ? "\u2191" : "\u2193"} {trend.value}
          </p>
        )}
      </div>
      {icon && <div className="shrink-0 text-slate-400 dark:text-slate-500">{icon}</div>}
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="block" tabIndex={0}>
        {content}
      </Link>
    );
  }

  return content;
}
