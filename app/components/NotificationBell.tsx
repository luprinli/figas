import { useState, useRef, useEffect } from "react";
import { Bell } from "lucide-react";
import type { AlertItem } from "./AlertStrip";

export interface NotificationBellProps {
  alerts: AlertItem[];
  className?: string;
}

export default function NotificationBell({ alerts, className = "" }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const hasCritical = alerts.some((a) => a.severity === "red");
  const hasAmber = alerts.some((a) => a.severity === "amber");

  return (
    <div ref={panelRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 rounded-full transition-colors ${
          hasCritical
            ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
            : hasAmber
              ? "text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30"
              : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
        }`}
        aria-label={`${alerts.length} alert${alerts.length !== 1 ? "s" : ""}`}
      >
        <Bell size={20} />
        {alerts.length > 0 && (
          <span
            className={`absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold text-white ${
              hasCritical ? "bg-red-500" : "bg-amber-500"
            }`}
          >
            {alerts.length > 9 ? "9+" : alerts.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 max-h-80 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg dark:shadow-slate-900/50">
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Alerts {alerts.length > 0 && `(${alerts.length})`}
            </span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {alerts.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                No alerts — all systems normal.
              </div>
            ) : (
              alerts.map((alert) => {
                const colors = {
                  red: "border-l-red-500 hover:bg-red-50 dark:hover:bg-red-900/20",
                  amber: "border-l-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20",
                  blue: "border-l-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20",
                };
                return (
                  <div key={alert.id} className={`px-3 py-2.5 border-l-3 ${colors[alert.severity]} transition-colors`}>
                    <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">{alert.message}</p>
                    <div className="mt-1 flex items-center gap-2">
                      {alert.timestamp && (
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">{alert.timestamp}</span>
                      )}
                      {alert.action && (
                        <a
                          href={alert.action.to}
                          className="text-[10px] font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400"
                        >
                          {alert.action.label}
                        </a>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
