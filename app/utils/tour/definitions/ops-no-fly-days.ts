import type { TourConfig } from "../types";

export const opsNoFlyDaysTour: TourConfig = {
  pageKey: "ops-no-fly-days",
  version: 1,
  showProgress: true,
  autoStart: false,
  steps: [
    {
      popover: {
        title: "No-Fly Day Management",
        description:
          "Define days when no flights operate. The system enforces this at booking creation and schedule build time.",
      },
    },
    {
      element: '[data-tour="nofly-calendar"]',
      popover: {
        title: "No-Fly Calendar",
        description:
          "Monthly calendar view showing no-fly days highlighted in red. Days marked here will block bookings and flight generation.",
        side: "bottom",
      },
    },
    {
      element: '[data-tour="nofly-rules"]',
      popover: {
        title: "No-Fly Rules",
        description:
          "Manage one-off (specific date) and recurring (day-of-week with seasonal range) rules. Add, edit, or remove rules as the operational calendar changes.",
        side: "top",
      },
    },
    {
      element: '[data-tour="nofly-create"]',
      popover: {
        title: "Add No-Fly Rule",
        description:
          "Create a one-off no-fly date or a recurring rule (e.g. every Sunday). Recurring rules can be bounded by season start/end dates.",
        side: "left",
      },
    },
  ],
};

export default opsNoFlyDaysTour;
