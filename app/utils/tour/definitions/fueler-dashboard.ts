import type { TourConfig } from "../types";

export const fuelerDashboardTour: TourConfig = {
  pageKey: "fueler-dashboard",
  version: 1,
  showProgress: true,
  autoStart: true,
  steps: [
    {
      popover: {
        title: "Fueler Dashboard",
        description:
          "Monitor fuel orders, record uplifts, and track daily fuel usage across all flights.",
      },
    },
    {
      element: '[data-tour="fueler-metrics"]',
      popover: {
        title: "Daily Summary",
        description:
          "Pending orders, completed uplifts today, and total kilograms of fuel dispensed. Quick snapshot of fuel operations.",
        side: "bottom",
      },
    },
    {
      element: '[data-tour="fueler-pending"]',
      popover: {
        title: "Pending Orders",
        description:
          "Fuel orders awaiting your action. Each shows the flight number, aircraft, requested quantity, and issue time.",
        side: "top",
      },
    },
    {
      element: "h1",
      popover: {
        title: "Navigation",
        description:
          "Use the sidebar to switch between your dashboard, active orders, order history, and profile.",
        side: "right",
      },
    },
  ],
};

export default fuelerDashboardTour;
