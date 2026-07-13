import type { TourConfig } from "../types";

export const operationsDashboardTour: TourConfig = {
  pageKey: "operations-dashboard",
  version: 1,
  showProgress: true,
  autoStart: true,
  steps: [
    {
      popover: {
        title: "Operations Dashboard",
        description: "Your command centre for daily flight operations, scheduling, and check-in management.",
      },
    },
    {
      element: '[data-tour="ops-quick-links"]',
      popover: {
        title: "Quick Actions",
        description: "Jump directly to the schedule builder, check-in counter, booking list, or no-fly day management.",
        side: "bottom",
      },
    },
    {
      element: '[data-tour="ops-todays-flights"]',
      popover: {
        title: "Today's Schedule",
        description: "Active flights for today with real-time status, assigned aircraft, and passenger counts.",
        side: "top",
      },
    },
    {
      element: "h1",
      popover: {
        title: "Navigation",
        description: "Use the sidebar to navigate between Scheduling, Bookings, Check-in, Finance, Pilot Briefing, and No-Fly Days.",
        side: "right",
      },
    },
  ],
};

export default operationsDashboardTour;
