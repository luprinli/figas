import { Link, Outlet } from "@remix-run/react";
import ProfilePopup from "../components/ProfilePopup";

type NavItem = {
  to: string;
  label: string;
};

type Props = {
  title: string;
  userIdentity: { name: string; email: string } | null;
  navItems: NavItem[];
  footer?: React.ReactNode;
};

export default function SidebarLayout({ title, userIdentity, navItems, footer }: Props) {
  return (
    <div className="flex min-h-screen">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-white focus:outline-none">
        Skip to main content
      </a>
      <aside className="w-64 bg-slate-800 text-white dark:text-slate-200 p-4 space-y-2" aria-label="Sidebar navigation">
        <div className="flex items-center justify-between mb-4 px-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <ProfilePopup user={userIdentity} />
        </div>
        <nav className="space-y-1" aria-label="Main navigation">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="block px-3 py-2 rounded hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {footer && (
          <div className="border-t border-slate-600 dark:border-slate-500 mt-4 pt-4 px-3 space-y-2 text-sm">
            {footer}
          </div>
        )}
      </aside>
      <main id="main-content" className="flex-1 bg-slate-50 dark:bg-slate-900">
        <Outlet />
      </main>
    </div>
  );
}
