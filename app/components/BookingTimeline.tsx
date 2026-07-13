import { BookingStatus } from "../utils/constants";

interface BookingTimelineProps {
  currentStatus: string;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
}

const STATUS_ORDER = [
  BookingStatus.PENDING,
  BookingStatus.PASSENGERS_ADDED,
  BookingStatus.WEIGHT_DECLARED,
  BookingStatus.FREIGHT_DECLARED,
  BookingStatus.FLIGHT_ASSIGNED,
  BookingStatus.COMPLETED,
];

const STATUS_LABELS: Record<string, string> = {
  [BookingStatus.PENDING]: "Pending",
  [BookingStatus.PASSENGERS_ADDED]: "Passengers Added",
  [BookingStatus.WEIGHT_DECLARED]: "Weight Declared",
  [BookingStatus.FREIGHT_DECLARED]: "Freight Declared",
  [BookingStatus.FLIGHT_ASSIGNED]: "Flight Assigned",
  [BookingStatus.COMPLETED]: "Completed",
  [BookingStatus.CANCELLED]: "Cancelled",
};

export default function BookingTimeline({
  currentStatus,
  cancelledAt,
  cancellationReason,
}: BookingTimelineProps) {
  const isCancelled = currentStatus === BookingStatus.CANCELLED;
  const currentIndex = STATUS_ORDER.findIndex((s) => s === currentStatus);

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/20">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Booking Progress</h3>

      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200" />

        <ul className="space-y-4 relative">
          {STATUS_ORDER.map((status, index) => {
            const isCompleted = index <= currentIndex && !isCancelled;
            const isCurrent = index === currentIndex && !isCancelled;

            return (
              <li key={status} className="flex items-center gap-3">
                {/* Dot */}
                <div
                  className={`relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isCompleted
                      ? "bg-green-500 text-white"
                      : isCurrent
                      ? "bg-sky-500 text-white ring-2 ring-sky-200"
                      : "bg-slate-100 text-slate-500 dark:text-slate-500"
                  }`}
                >
                  {isCompleted ? (
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>

                {/* Label */}
                <div>
                  <span
                    className={`text-sm font-medium ${
                      isCompleted
                        ? "text-green-700"
                        : isCurrent
                        ? "text-sky-700"
                        : "text-slate-500 dark:text-slate-500"
                    }`}
                  >
                    {STATUS_LABELS[status]}
                  </span>
                  {isCurrent && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-sky-100 dark:bg-sky-900/30 px-2 py-0.5 text-xs font-medium text-sky-700">
                      Current
                    </span>
                  )}
                </div>
              </li>
            );
          })}

          {/* Cancelled state */}
          {isCancelled && (
            <li className="flex items-center gap-3">
              <div className="relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold">
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </div>
              <div>
                <span className="text-sm font-medium text-red-700">Cancelled</span>
                {cancelledAt && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {new Date(cancelledAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                )}
                {cancellationReason && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 italic">
                    Reason: {cancellationReason}
                  </p>
                )}
              </div>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
