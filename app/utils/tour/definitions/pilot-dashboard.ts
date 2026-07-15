import type { TourConfig } from "../types";

export const pilotDashboardTour: TourConfig = {
  pageKey: "pilot-dashboard",
  version: 1,
  showProgress: true,
  autoStart: true,
  steps: [
    {
      popover: {
        title: "Pilot Dashboard",
        description:
          "Your command centre. View today's sorties, upcoming schedules, and jump to your briefing for each flight.",
      },
    },
    {
      element: '[data-tour="pilot-kpis"]',
      popover: {
        title: "Key Metrics",
        description:
          "Today's flight count, active schedule status, next departure time, and upcoming schedule count — at a glance.",
        side: "bottom",
      },
    },
    {
      element: '[data-tour="pilot-sorties"]',
      popover: {
        title: "Today's Sorties",
        description:
          "Each flight assigned to you today with departure time, flight number, route, aircraft, passenger count, and status. Click Briefing to open the full briefing sheet.",
        side: "top",
      },
    },
    {
      element: '[data-tour="pilot-upcoming"]',
      popover: {
        title: "Upcoming Schedule",
        description:
          "Future schedules you are assigned to. View dates and statuses for planning ahead.",
        side: "top",
      },
    },
  ],
};

export default pilotDashboardTour;
