import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export default function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={[
        "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl/7 font-bold text-slate-900 dark:text-slate-100 sm:truncate">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm/5 text-slate-500 dark:text-slate-400 dark:text-slate-500">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-3">{actions}</div>
      )}
    </div>
  );
}
