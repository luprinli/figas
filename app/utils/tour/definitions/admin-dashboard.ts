import type { TourConfig } from "../types";

export const adminDashboardTour: TourConfig = {
  pageKey: "admin-dashboard",
  version: 1,
  showProgress: true,
  autoStart: true,
  steps: [
    {
      popover: {
        title: "Admin Dashboard",
        description: "Your central hub for managing FIGAS system configuration and settings.",
      },
    },
    {
      element: '[data-tour="admin-health"]',
      popover: {
        title: "System Health",
        description: "Quick status overview — database connectivity, payment integration, and migrations.",
        side: "bottom",
      },
    },
    {
      element: '[data-tour="admin-stats"]',
      popover: {
        title: "Key Metrics",
        description: "Users, bookings, and fleet activity at a glance.",
        side: "bottom",
      },
    },
    {
      element: "h1",
      popover: {
        title: "Navigation",
        description: "Use the sidebar to manage aerodromes, aircraft, fares, fuel rules, users, roles, and system settings.",
        side: "right",
      },
    },
  ],
};

export default adminDashboardTour;
