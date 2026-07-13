import type { TourConfig } from "../types";

export const engineerDashboardTour: TourConfig = {
  pageKey: "engineer-dashboard",
  version: 1,
  showProgress: true,
  autoStart: true,
  steps: [
    {
      popover: {
        title: "Engineer Dashboard",
        description: "Track fleet status, airframe hours, defects, maintenance tasks, and life-limited components.",
      },
    },
    {
      element: '[data-tour="engineer-fleet"]',
      popover: {
        title: "Fleet Status",
        description: "Overview of all aircraft — registration, type, hours, and current defect status.",
        side: "bottom",
      },
    },
    {
      element: '[data-tour="engineer-actions"]',
      popover: {
        title: "Quick Actions",
        description: "Report a defect, create a maintenance task, install a component, or log flight hours.",
        side: "left",
      },
    },
    {
      element: "h1",
      popover: {
        title: "Engineer Menu",
        description: "Use the sidebar to manage defects, tasks, components, airframe hours, and loadsheets.",
        side: "right",
      },
    },
  ],
};

export default engineerDashboardTour;
