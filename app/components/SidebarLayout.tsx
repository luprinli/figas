import { useState } from "react";
import { NavLink, Outlet } from "@remix-run/react";
import { ChevronsLeft, ChevronsRight, type LucideIcon } from "lucide-react";
import ProfilePopup from "../components/ProfilePopup";

type NavItem = {
  to: string;
  label: React.ReactNode;
  icon?: LucideIcon;
};

type Props = {
  title: string;
  userIdentity: { name: string; email: string } | null;
  navItems: NavItem[];
  footer?: React.ReactNode;
  collapsible?: boolean;
};

export default function SidebarLayout({ title, userIdentity, navItems, footer, collapsible = false }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-white focus:outline-none">
        Skip to main content
      </a>
      <aside className={`${collapsed ? "w-16" : "w-56"} shrink-0 bg-slate-800 text-white transition-all duration-200 flex flex-col`} aria-label="Sidebar navigation">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          {!collapsed && <h2 className="text-sm font-bold tracking-wider">{title}</h2>}
          {collapsible && (
            <button type="button" onClick={() => setCollapsed(!collapsed)} className="text-slate-400 hover:text-white p-1 rounded" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
              {collapsed ? <ChevronsRight size={16} absoluteStrokeWidth /> : <ChevronsLeft size={16} absoluteStrokeWidth />}
            </button>
          )}
          {!collapsible && <ProfilePopup user={userIdentity} />}
        </div>
        <nav className="flex-1 py-3 space-y-0.5 px-2" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) => `flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${collapsed ? "justify-center" : ""} ${isActive ? "bg-slate-700 text-white" : "hover:bg-slate-700 text-slate-300"}`}
            >
              {Icon && <Icon size={16} absoluteStrokeWidth />}
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          )})}
        </nav>
        {userIdentity && (
          <div className="border-t border-slate-700 px-3 py-3">
            {!collapsed ? (
              <div className="text-xs text-slate-400">
                <p className="font-medium text-slate-300">{userIdentity.name}</p>
                <p className="truncate">{userIdentity.email}</p>
              </div>
            ) : (
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-600 text-xs font-bold mx-auto">
                {userIdentity.name?.charAt(0) ?? "?"}
              </div>
            )}
          </div>
        )}
        {footer && (
          <div className="border-t border-slate-700 mt-4 pt-4 px-3 space-y-2 text-sm">
            {footer}
          </div>
        )}
      </aside>
      <main id="main-content" className="flex-1 bg-slate-50 dark:bg-slate-900 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
