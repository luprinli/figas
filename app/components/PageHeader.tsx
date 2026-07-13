import type { ReactNode } from "react";
import { Link } from "@remix-run/react";

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbs?: { label: string; to?: string }[];
  className?: string;
}

export default function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
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
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="mb-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400" aria-label="Breadcrumbs">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1">
                {crumb.to ? (
                  <Link to={crumb.to} className="hover:text-slate-700 dark:hover:text-slate-200 transition-colors">{crumb.label}</Link>
                ) : (
                  <span>{crumb.label}</span>
                )}
                {i < breadcrumbs.length - 1 && <span>/</span>}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-2xl/7 font-bold text-slate-900 dark:text-slate-100 sm:truncate">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm/5 text-slate-500 dark:text-slate-400">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-3">{actions}</div>
      )}
    </div>
  );
}
