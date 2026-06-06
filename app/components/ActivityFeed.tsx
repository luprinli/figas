import { Link } from "@remix-run/react";

export interface ActivityItem {
  id: string | number;
  user: string;
  action: string;
  target?: string;
  targetLink?: string;
  timestamp: string;
}

export interface ActivityFeedProps {
  items: ActivityItem[];
  emptyMessage?: string;
  maxItems?: number;
  viewAllLink?: string;
  className?: string;
}

export default function ActivityFeed({
  items,
  emptyMessage = "No recent activity.",
  maxItems = 10,
  viewAllLink,
  className = "",
}: ActivityFeedProps) {
  const visible = items.slice(0, maxItems);

  return (
    <div className={`rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-700 overflow-hidden ${className}`}>
      <div className="px-4 py-2 bg-slate-50 dark:bg-slate-700 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500">
          Recent Activity
        </span>
        {viewAllLink && (
          <Link to={viewAllLink} className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400">
            View all →
          </Link>
        )}
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-700">
        {visible.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
            {emptyMessage}
          </div>
        ) : (
          visible.map((item) => (
            <div key={item.id} className="px-4 py-2.5 flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <span className="text-sm text-slate-700 dark:text-slate-200">
                  <span className="font-medium">{item.user}</span>{" "}
                  {item.action}{" "}
                  {item.targetLink ? (
                    <Link to={item.targetLink} className="font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400">
                      {item.target}
                    </Link>
                  ) : (
                    item.target && <span className="font-medium text-slate-800 dark:text-slate-100">{item.target}</span>
                  )}
                </span>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0 ml-3">
                {item.timestamp}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
