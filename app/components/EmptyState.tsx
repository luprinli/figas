import type { ReactNode } from "react";

import Button from "./Button";

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; to: string };
  icon?: ReactNode;
}

export default function EmptyState({
  title,
  description,
  action,
  icon,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && (
        <div className="mb-4 text-slate-500 dark:text-slate-400 dark:text-slate-500">{icon}</div>
      )}
      <h3 className="text-base/6 font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm/5 text-slate-500 dark:text-slate-400 dark:text-slate-500">{description}</p>
      )}
      {action && (
        <div className="mt-6">
          <Button to={action.to}>{action.label}</Button>
        </div>
      )}
    </div>
  );
}
