import type { TourConfig } from "../types";

export const agentDashboardTour: TourConfig = {
  pageKey: "agent-dashboard",
  version: 1,
  showProgress: true,
  autoStart: true,
  steps: [
    {
      popover: {
        title: "Agent Dashboard",
        description:
          "Your client portfolio and booking pipeline. Manage all bookings you have created for your clients.",
      },
    },
    {
      element: '[data-tour="agent-metrics"]',
      popover: {
        title: "Pipeline Overview",
        description:
          "Bookings broken down by status: pending, confirmed, assigned, and completed. Click any card to filter.",
        side: "bottom",
      },
    },
    {
      element: '[data-tour="agent-portfolio"]',
      popover: {
        title: "Client Portfolio",
        description:
          "Clients grouped with their bookings. Expand a client to see all their reservations and upcoming travel.",
        side: "top",
      },
    },
    {
      element: '[data-tour="agent-actions"]',
      popover: {
        title: "Quick Actions",
        description:
          "Create a new booking for an existing or new client. The booking wizard guides you through the 4-step process.",
        side: "left",
      },
    },
    {
      element: "h1",
      popover: {
        title: "Navigation",
        description:
          "Use the sidebar to switch between your booking portfolio, the full booking list, and your profile.",
        side: "right",
      },
    },
  ],
};

export default agentDashboardTour;
