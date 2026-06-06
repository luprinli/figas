import type { ReactNode } from "react";

export interface BadgeProps {
  variant?: "default" | "success" | "warning" | "danger" | "info";
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "bg-slate-100 text-slate-700 dark:text-slate-200 ring-slate-300 dark:ring-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-500",
  success: "bg-green-100 text-green-700 dark:text-green-400 ring-green-300 dark:bg-green-900/30 dark:text-green-400 dark:ring-green-700",
  warning: "bg-amber-100 text-amber-700 dark:text-amber-400 ring-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:ring-amber-700",
  danger: "bg-red-100 text-red-700 dark:text-red-400 ring-red-300 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-700",
  info: "bg-blue-100 text-blue-700 dark:text-blue-400 ring-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:ring-blue-700",
};

export default function Badge({
  variant = "default",
  children,
  className,
}: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs/5 font-medium ring-1 ring-inset",
        variantStyles[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}
