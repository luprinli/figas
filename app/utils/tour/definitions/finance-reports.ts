import type { TourConfig } from "../types";

export const financeReportsTour: TourConfig = {
  pageKey: "finance-reports",
  version: 1,
  showProgress: true,
  autoStart: false,
  steps: [
    {
      popover: {
        title: "Finance Reports",
        description:
          "Generate financial reports on demand: daily sales, aging receivables, payment summaries, and tax data.",
      },
    },
    {
      element: '[data-tour="finance-reports-grid"]',
      popover: {
        title: "Available Reports",
        description:
          "Daily Sales: debit/credit breakdowns by date. Aging: overdue receivables in 30-day buckets. Payment Summary: by method. Tax: GST/VAT data.",
        side: "bottom",
      },
    },
    {
      element: '[data-tour="finance-reports-export"]',
      popover: {
        title: "Export Options",
        description:
          "Reports can be exported as CSV for spreadsheet analysis or XML for accounting system integration.",
        side: "left",
      },
    },
  ],
};

export default financeReportsTour;
