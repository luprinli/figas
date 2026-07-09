import { Form, Link } from "@remix-run/react";
import { useState } from "react";
import { ChevronsLeft, ChevronsRight, LogOut } from "lucide-react";
import ProfilePopup from "../ProfilePopup";
import NotificationBell from "../NotificationBell";
import type { AlertItem } from "../AlertStrip";

export interface CheckinNavItem {
  to: string;
  label: string;
  end?: boolean;
  badge?: string | number;
}

interface CheckinSidebarProps {
  user: { name: string; email: string };
  pendingCount: number;
  flightsCount: number;
  alerts: AlertItem[];
  extraNavItems?: CheckinNavItem[];
}

export default function CheckinSidebar({ user, pendingCount, flightsCount, alerts, extraNavItems = [] }: CheckinSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const baseNavItems: CheckinNavItem[] = [
    { to: "/checkin", label: "Dashboard", end: true },
    { to: "/checkin/counter", label: "Counter", badge: pendingCount > 0 ? pendingCount : undefined, end: false },
    { to: "/checkin/lookup", label: "Lookup", end: false },
    { to: "/checkin/freight", label: "Freight", end: false },
    ...extraNavItems,
  ];

  return (
    <aside className={`${collapsed ? "w-16" : "w-60"} shrink-0 bg-slate-800 text-white transition-all duration-200 flex flex-col relative`}>
      <div className="flex items-center justify-between px-3 py-3 border-b border-slate-700 gap-2">
        {!collapsed && <h2 className="text-sm font-bold tracking-wider truncate">CHECK-IN</h2>}
        {!collapsed && <NotificationBell alerts={alerts} />}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-white rounded transition-colors shrink-0"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronsRight size={20} absoluteStrokeWidth /> : <ChevronsLeft size={20} absoluteStrokeWidth />}
        </button>
      </div>

      <nav className="flex-1 py-3 space-y-0.5 px-2">
        {baseNavItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={`block px-3 py-2.5 rounded text-sm transition-colors min-h-[44px] flex items-center gap-2 ${collapsed ? "justify-center px-0" : ""} hover:bg-slate-700 text-slate-300`}
          >
            {collapsed ? item.label.charAt(0) : item.label}
            {!collapsed && item.badge !== undefined && (
              <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-[20px] rounded-full bg-amber-500 text-[10px] font-bold text-white px-1">{item.badge}</span>
            )}
          </Link>
        ))}
      </nav>

      {!collapsed && (
        <div className="border-t border-slate-700 px-3 py-2.5 space-y-1.5 text-xs">
          <div className="flex justify-between text-slate-400">
            <span>Flights Today</span>
            <span className="font-bold text-slate-300 tabular-nums">{flightsCount}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Pending</span>
            <span className={`font-bold tabular-nums ${pendingCount > 0 ? 'text-amber-400' : 'text-slate-300'}`}>{pendingCount}</span>
          </div>
        </div>
      )}

      <div className="border-t border-slate-700 px-3 py-3">
        {!collapsed ? (
          <div className="flex items-center gap-3">
            <ProfilePopup user={user} />
            <div className="text-xs text-slate-400 min-w-0 flex-1">
              <p className="font-medium text-slate-300 truncate">{user.name}</p>
              <p className="truncate">{user.email}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <ProfilePopup user={user} />
            <Form action="/logout" method="POST">
              <button type="submit" className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500 hover:text-red-400 rounded transition-colors" title="Sign Out">
                <LogOut size={16} absoluteStrokeWidth />
              </button>
            </Form>
          </div>
        )}
      </div>
    </aside>
  );
}
