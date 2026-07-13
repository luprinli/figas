import { useState } from "react";
import { X } from "lucide-react";

export interface ValidationIssue {
  type: "error" | "warning";
  message: string;
}

export interface ValidationBannerProps {
  issues: ValidationIssue[];
}

/**
 * ValidationBanner renders a colored banner at the top of a flight card
 * showing validation issues (errors in red, warnings in amber).
 * It is dismissible — clicking the close button hides it for the session.
 */
export default function ValidationBanner({ issues }: ValidationBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (issues.length === 0 || dismissed) return null;

  const hasError = issues.some((i) => i.type === "error");

  const bgColor = hasError
    ? "bg-red-50 dark:bg-red-900/30 dark:bg-red-900/30 border-red-200 dark:border-red-800"
    : "bg-amber-50 dark:bg-amber-900/30 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800";

  const textColor = hasError ? "text-red-800 dark:text-red-400 dark:text-red-400" : "text-amber-800 dark:text-amber-400 dark:text-amber-400";
  const dotColor = hasError ? "bg-red-500 dark:bg-red-900/30" : "bg-amber-500 dark:bg-amber-900/30";

  return (
    <div
      className={`mb-3 rounded-md border px-3 py-2 ${bgColor}`}
      role="alert"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-1">
          {issues.map((issue, idx) => (
            <div key={idx} className="flex items-start gap-2 text-xs">
              <span
                className={`mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`}
                aria-hidden="true"
              />
              <span className={`${issue.type === "error" ? "font-medium" : ""} ${textColor}`}>
                {issue.message}
              </span>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className={`shrink-0 rounded p-0.5 transition hover:bg-black/5 ${textColor}`}
          aria-label="Dismiss validation warnings"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
