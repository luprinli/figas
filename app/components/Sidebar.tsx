import { NavLink } from "@remix-run/react";
import React from "react";

import Logo from "../components/Logo";
import ArrowRightIcon from "./icons/ArrowRight";
import CloseIcon from "./icons/Close";

type NavItem = {
  label: string;
  href: string;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const COMMON_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/" },
  { label: "My Bookings", href: "/bookings" },
  { label: "Check-In", href: "/checkin" },
  { label: "Profile", href: "/profile" },
];

const ROLE_SECTIONS: { role: string; check: (p: string[]) => boolean; items: NavItem[] }[] = [
  {
    role: "Pilot",
    check: (p) => p.includes("flight:view") && !p.includes("schedule:create"),
    items: [
      { label: "Dashboard", href: "/pilot" },
      { label: "My Flights", href: "/pilot" },
      { label: "My Schedule", href: "/pilot" },
    ],
  },
  {
    role: "Engineer",
    check: (p) => p.includes("maintenance:view"),
    items: [
      { label: "Dashboard", href: "/engineer" },
      { label: "Aircraft Fleet", href: "/engineer" },
    ],
  },
  {
    role: "Agent",
    check: (p) => p.includes("booking:view"),
    items: [
      { label: "My Bookings", href: "/agent/bookings" },
    ],
  },
  {
    role: "Operations",
    check: (p) => p.includes("schedule:create"),
    items: [
      { label: "Operations Dashboard", href: "/operations" },
      { label: "Schedule", href: "/operations/schedule" },
      { label: "Bookings", href: "/operations/bookings" },
      { label: "Create Flight", href: "/operations/bookings/new" },
      { label: "Notifications", href: "/operations/notifications" },
    ],
  },
  {
    role: "Finance",
    check: (p) => p.includes("finance:view"),
    items: [
      { label: "Dashboard", href: "/finance" },
      { label: "Invoices", href: "/finance/invoices" },
      { label: "Payments", href: "/finance/payments" },
      { label: "Reconciliation", href: "/finance/reconciliation" },
      { label: "Reports", href: "/finance/reports" },
      { label: "Exports", href: "/finance/exports" },
      { label: "Settings", href: "/finance/settings" },
    ],
  },
  {
    role: "Administration",
    check: (p) => p.includes("admin:access"),
    items: [
      { label: "Admin Dashboard", href: "/admin" },
      { label: "Manage Users", href: "/admin/users" },
      { label: "Manage Aerodromes", href: "/admin/aerodromes" },
      { label: "Manage Aircraft", href: "/admin/aircraft" },
      { label: "Manage Fares", href: "/admin/fares" },
      { label: "Fuel Rules", href: "/admin/fuel-rules" },
      { label: "Aerodrome Distances", href: "/admin/aerodrome-distances" },
      { label: "Aerodrome Headings", href: "/admin/aerodrome-headings" },
      { label: "Airframe Hours", href: "/admin/airframe-hours" },
      { label: "Settings", href: "/admin/settings" },
    ],
  },
];

function NavSection({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <>
      <h3 className="px-2 pt-6 pb-2 text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
        {title}
      </h3>
      <ul className="border-t border-slate-200 dark:border-slate-700">
        {items.map((item) => (
          <li key={item.label}>
            <NavLink
              to={item.href}
              className={({ isActive }) =>
                isActive
                  ? "flex items-center justify-between px-2 py-4 border-b border-cyan-300"
                  : "flex items-center justify-between px-2 py-4 border-b border-slate-200 dark:border-slate-700 group hover:border-cyan-300"
              }
              end
            >
              {({ isActive }) => (
                <>
                  {item.label}
                  <span className={isActive ? "text-cyan-300" : "text-slate-300 dark:text-slate-600 group-hover:text-cyan-300"}>
                    <ArrowRightIcon />
                  </span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </>
  );
}

type Props = {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  userPermissions?: string[];
};

export default function Sidebar({ isOpen, setIsOpen, userPermissions = [] }: Props) {
  const visibleSections = ROLE_SECTIONS.filter((s) => s.check(userPermissions));

  return (
    <aside
      className={`fixed top-0 left-0 z-20 flex h-full p-2 w-64 transition-transform ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
    >
      <div className="flex flex-col gap-8 p-4 bg-white dark:bg-slate-800 rounded-lg shadow-md dark:shadow-slate-900/30 grow">
        <div className="flex items-center justify-between gap-4">
          <Logo />
          <button
            type="button"
            className="flex items-center justify-center w-8 h-8 transition rounded-md cursor-pointer md:hidden text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700"
            onClick={() => setIsOpen(false)}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="overflow-x-hidden overflow-y-scroll hide-scrollbar">
          <ul className="border-t border-slate-200 dark:border-slate-700">
            {COMMON_NAV_ITEMS.map((item) => (
              <li key={item.label}>
                <NavLink
                  to={item.href}
                  className={({ isActive }) =>
                    isActive
                      ? "flex items-center justify-between px-2 py-4 border-b border-cyan-300"
                      : "flex items-center justify-between px-2 py-4 border-b border-slate-200 dark:border-slate-700 group hover:border-cyan-300"
                  }
                  end
                >
                  {({ isActive }) => (
                    <>
                      {item.label}
                      <span className={isActive ? "text-cyan-300" : "text-slate-300 dark:text-slate-600 group-hover:text-cyan-300"}>
                        <ArrowRightIcon />
                      </span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>

          {visibleSections.map((section) => (
            <NavSection key={section.role} title={section.role} items={section.items} />
          ))}
        </div>
      </div>
    </aside>
  );
}
