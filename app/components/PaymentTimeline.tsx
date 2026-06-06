export interface PaymentTimelineEvent {
  id: string;
  type: "payment" | "refund" | "invoice" | "reminder";
  status: string;
  amount?: number;
  description: string;
  timestamp: string;
  actor?: string;
}

export interface PaymentTimelineProps {
  events: PaymentTimelineEvent[];
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusColor(status: string): string {
  const lower = status.toLowerCase();
  if (lower === "success" || lower === "paid" || lower === "completed") return "text-green-600 bg-green-100";
  if (lower === "failed" || lower === "overdue" || lower === "cancelled") return "text-red-600 bg-red-100";
  if (lower === "pending" || lower === "processing") return "text-amber-600 bg-amber-100";
  return "text-slate-600 bg-slate-100 dark:bg-slate-700";
}

function getEventIcon(type: PaymentTimelineEvent["type"]): string {
  switch (type) {
    case "payment":
      return "£";
    case "refund":
      return "↩";
    case "invoice":
      return "📄";
    case "reminder":
      return "🔔";
  }
}

export default function PaymentTimeline({ events }: PaymentTimelineProps) {
  const sortedEvents = [...events].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  if (sortedEvents.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 text-center">
        <p className="text-sm/5 text-slate-500 dark:text-slate-400 dark:text-slate-500">No payment events recorded</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/20">
      <h3 className="text-base/6 font-semibold text-slate-900 dark:text-slate-100 mb-4">
        Payment Timeline
      </h3>

      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-slate-200" />

        <ul className="space-y-4 relative">
          {sortedEvents.map((event) => {
            const statusColor = getStatusColor(event.status);

            return (
              <li key={event.id} className="flex items-start gap-3">
                {/* Icon circle */}
                <div
                  className={[
                    "relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    statusColor,
                  ].join(" ")}
                >
                  {getEventIcon(event.type)}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm/5 font-medium text-slate-900 dark:text-slate-100">
                        {event.description}
                      </p>
                      {event.amount !== undefined && (
                        <p className="mt-0.5 text-sm/5 font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                          £{event.amount.toFixed(2)}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs/5 text-slate-500 dark:text-slate-400 dark:text-slate-500">
                      {formatTimestamp(event.timestamp)}
                    </span>
                  </div>
                  {event.actor && (
                    <p className="mt-0.5 text-xs/5 text-slate-500 dark:text-slate-400 dark:text-slate-500">
                      by {event.actor}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
