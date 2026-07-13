import type { ReactNode } from "react";
import { Link } from "@remix-run/react";

export interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  accentColor?: string;
  color?: "blue" | "emerald" | "amber" | "purple" | "red";
  icon?: ReactNode;
  trend?: {
    direction: "up" | "down";
    value: string;
  };
  to?: string;
  className?: string;
}

const COLOR_MAP: Record<string, string> = {
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  purple: "bg-purple-500",
  red: "bg-red-500",
};

export default function MetricCard({
  label,
  value,
  subtitle,
  accentColor,
  color,
  icon,
  trend,
  to,
  className,
}: MetricCardProps) {
  const resolvedAccent = accentColor ?? (color ? COLOR_MAP[color] : "bg-blue-500");
  const content = (
    <div
      className={[
        "relative flex items-start gap-4 overflow-hidden rounded-lg bg-white dark:bg-slate-800 p-6 shadow-sm dark:shadow-slate-900/20 ring-1 ring-slate-200 dark:ring-slate-700 transition-shadow",
        to ? "hover:shadow-md cursor-pointer" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="region"
      aria-label={`${label}: ${value}`}
    >
      <div className={`absolute left-0 top-0 h-full w-1 ${resolvedAccent}`} />
      {icon && <div className="shrink-0 text-slate-400 dark:text-slate-500">{icon}</div>}
      <div className="flex flex-1 flex-col">
        <p className="text-sm/5 font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-1 text-3xl/8 font-bold tracking-tight text-slate-900 dark:text-slate-100">{value}</p>
        {subtitle && <p className="mt-0.5 text-sm/5 text-slate-500 dark:text-slate-400">{subtitle}</p>}
        {trend && (
          <p className={`mt-1 text-sm/5 font-medium ${trend.direction === "up" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
            {trend.direction === "up" ? "\u2191" : "\u2193"} {trend.value}
          </p>
        )}
      </div>
    </div>
  );

  if (to) {
    return <Link to={to} className="block">{content}</Link>;
  }

  return content;
}
