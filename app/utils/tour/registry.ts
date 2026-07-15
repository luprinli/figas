/**
 * Lazy registry mapping a pageKey to its tour definition loader.
 *
 * Used by the (future) global "help" launcher and to keep each page's tour
 * definition in its own chunk. Pages may also import their definition
 * directly for the smallest footprint.
 */

import type { TourConfig } from "./types";

export const tourRegistry: Record<
  string,
  () => Promise<{ default: TourConfig }>
> = {
  // Dashboards
  "operations-schedule": () =>
    import("./definitions/operations-schedule"),
  "operations-dashboard": () =>
    import("./definitions/operations-dashboard"),
  "admin-dashboard": () =>
    import("./definitions/admin-dashboard"),
  "finance-dashboard": () =>
    import("./definitions/finance-dashboard"),
  "engineer-dashboard": () =>
    import("./definitions/engineer-dashboard"),
  "agent-dashboard": () =>
    import("./definitions/agent-dashboard"),
  "fueler-dashboard": () =>
    import("./definitions/fueler-dashboard"),
  "pilot-dashboard": () =>
    import("./definitions/pilot-dashboard"),

  // Check-in
  "checkin-counter": () => import("./definitions/checkin-counter"),
  "checkin-freight": () => import("./definitions/checkin-freight"),
  "checkin-lookup": () => import("./definitions/checkin-lookup"),

  // Booking
  "bookings-list": () =>
    import("./definitions/bookings-list"),
  "booking-wizard": () =>
    import("./definitions/booking-wizard"),
  "booking-detail": () =>
    import("./definitions/booking-detail"),
  "agent-booking-detail": () =>
    import("./definitions/agent-booking-detail"),

  // Pilot
  "pilot-briefing": () => import("./definitions/pilot-briefing"),

  // Admin subpages
  "admin-users": () =>
    import("./definitions/admin-users"),
  "admin-aerodromes": () =>
    import("./definitions/admin-aerodromes"),
  "admin-aircraft": () =>
    import("./definitions/admin-aircraft"),
  "admin-fares": () =>
    import("./definitions/admin-fares"),
  "admin-fuel-rules": () =>
    import("./definitions/admin-fuel-rules"),
  "admin-settings": () =>
    import("./definitions/admin-settings"),

  // Finance subpages
  "finance-invoices": () =>
    import("./definitions/finance-invoices"),
  "finance-payments": () =>
    import("./definitions/finance-payments"),
  "finance-reports": () =>
    import("./definitions/finance-reports"),
  "finance-reconciliation": () =>
    import("./definitions/finance-reconciliation"),

  // Fueler
  "fueler-orders": () =>
    import("./definitions/fueler-orders"),

  // Operations subpages
  "ops-no-fly-days": () =>
    import("./definitions/ops-no-fly-days"),
  "ops-loadsheets": () =>
    import("./definitions/ops-loadsheets"),
};
