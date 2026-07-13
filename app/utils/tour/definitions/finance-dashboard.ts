import type { TourConfig } from "../types";

export const financeDashboardTour: TourConfig = {
  pageKey: "finance-dashboard",
  version: 1,
  showProgress: true,
  autoStart: true,
  steps: [
    {
      popover: {
        title: "Finance Dashboard",
        description: "Monitor revenue, invoices, payments, and reconciliation from this central view.",
      },
    },
    {
      element: '[data-tour="finance-summary"]',
      popover: {
        title: "Financial Summary",
        description: "Daily totals, outstanding invoices, and revenue trends at a glance.",
        side: "bottom",
      },
    },
    {
      element: '[data-tour="finance-reports"]',
      popover: {
        title: "Reports & Exports",
        description: "Generate payment summaries, tax reports, aging receivables, and CSV/XML exports.",
        side: "left",
      },
    },
    {
      element: "h1",
      popover: {
        title: "Finance Menu",
        description: "Use the sidebar to manage invoices, payments, reconciliation, and financial reports.",
        side: "right",
      },
    },
  ],
};

export default financeDashboardTour;
