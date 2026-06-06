import type { ReactNode } from "react";

export interface CardProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}

export default function Card({
  title,
  subtitle,
  children,
  className,
  actions,
}: CardProps) {
  return (
    <div
      className={[
        "rounded-lg bg-white dark:bg-slate-800 shadow-sm dark:shadow-slate-900/20 ring-1 ring-slate-200 dark:ring-slate-700",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {(title || subtitle || actions) && (
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-700 px-6 py-4">
          <div className="min-w-0 flex-1">
            {title && (
              <h3 className="text-base/6 font-semibold text-slate-900 dark:text-slate-100">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-0.5 text-sm/5 text-slate-500 dark:text-slate-400 dark:text-slate-500">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="px-6 py-4">{children}</div>
    </div>
  );
}
