import Skeleton from "../Skeleton";

/**
 * ScheduleSkeleton renders pulsing placeholder UI while the schedule page
 * is loading for the first time.
 */
export default function ScheduleSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-label="Loading schedule">
      {/* Status bar placeholder */}
      <div className="mb-6">
        <Skeleton variant="rectangular" width="100%" height={64} />
      </div>

      {/* Date picker + action buttons area */}
      <div className="mb-4 flex items-center justify-between rounded-lg bg-white dark:bg-slate-800 px-4 py-2 shadow-sm dark:shadow-slate-900/20 ring-1 ring-slate-200 dark:ring-slate-700 dark:ring-slate-700">
        <Skeleton variant="rectangular" width={200} height={36} />
        <div className="flex items-center gap-2">
          <Skeleton variant="rectangular" width={80} height={32} />
          <Skeleton variant="rectangular" width={80} height={32} />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton variant="rectangular" width={80} height={32} />
          <Skeleton variant="rectangular" width={80} height={32} />
          <Skeleton variant="rectangular" width={80} height={32} />
        </div>
      </div>

      {/* Main content area: flight cards + unassigned panel */}
      <div className="flex gap-6">
        <div className="flex-1 space-y-4">
          {/* Flight card placeholders */}
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="block rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/20"
            >
              {/* Header: flight number + status */}
              <div className="mb-3 flex items-center justify-between">
                <Skeleton variant="text" width={120} height={20} />
                <Skeleton variant="rectangular" width={80} height={22} />
              </div>

              {/* Aircraft info */}
              <div className="mb-3">
                <Skeleton variant="text" width={180} height={16} />
              </div>

              {/* Route strip */}
              <div className="mb-3">
                <Skeleton variant="text" width="100%" height={24} />
              </div>

              {/* Timing */}
              <div className="mb-3">
                <Skeleton variant="text" width="60%" height={16} />
              </div>

              {/* Pilot */}
              <div className="mb-3">
                <Skeleton variant="text" width="40%" height={16} />
              </div>

              {/* Passenger summary */}
              <div className="mb-3">
                <Skeleton variant="text" width="70%" height={16} />
              </div>

              {/* Weight bar */}
              <Skeleton variant="rectangular" width="100%" height={20} />
            </div>
          ))}
        </div>

        {/* Unassigned bookings panel placeholder */}
        <div className="w-72 space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/20">
          <Skeleton variant="text" width={140} height={20} />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton variant="circular" width={8} height={8} />
              <Skeleton variant="text" width="80%" height={14} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
