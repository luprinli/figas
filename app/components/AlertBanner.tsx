interface Alert {
  severity: "warning" | "error" | "info";
  message: string;
}

interface AlertBannerProps {
  alerts: Alert[];
  className?: string;
  onDismiss?: (index: number) => void;
}

const severityStyles: Record<
  Alert["severity"],
  { bg: string; border: string; text: string; icon: string }
> = {
  error: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-700",
    icon: "text-red-500",
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    icon: "text-amber-500",
  },
  info: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
    icon: "text-blue-500",
  },
};

function SeverityIcon({ severity }: { severity: Alert["severity"] }) {
  // SVG icons for each severity level
  switch (severity) {
    case "error":
      return (
        <svg
          className="h-5 w-5 shrink-0 text-red-500"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
            clipRule="evenodd"
          />
        </svg>
      );
    case "warning":
      return (
        <svg
          className="h-5 w-5 shrink-0 text-amber-500"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
      );
    case "info":
      return (
        <svg
          className="h-5 w-5 shrink-0 text-blue-500"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
            clipRule="evenodd"
          />
        </svg>
      );
  }
}

export default function AlertBanner({
  alerts,
  className = "",
  onDismiss,
}: AlertBannerProps) {
  if (!alerts || alerts.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {alerts.map((alert, index) => {
        const styles = severityStyles[alert.severity];
        return (
          <div
            key={index}
            role="alert"
            className={`rounded-lg border ${styles.bg} ${styles.border} p-4`}
          >
            <div className="flex items-start gap-3">
              <SeverityIcon severity={alert.severity} />
              <p className={`text-sm flex-1 pt-0.5 ${styles.text}`}>
                {alert.message}
              </p>
              {onDismiss && (
                <button
                  type="button"
                  onClick={() => onDismiss(index)}
                  className={`shrink-0 rounded-md p-1.5 ${styles.bg} ${styles.text} hover:opacity-70 transition-opacity focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400`}
                  aria-label={`Dismiss alert: ${alert.message}`}
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
