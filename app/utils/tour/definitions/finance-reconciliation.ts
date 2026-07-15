import type { TourConfig } from "../types";

export const financeReconciliationTour: TourConfig = {
  pageKey: "finance-reconciliation",
  version: 1,
  showProgress: true,
  autoStart: false,
  steps: [
    {
      popover: {
        title: "Bank Reconciliation",
        description:
          "Match bank statement transactions against system payments to ensure financial records are accurate and complete.",
      },
    },
    {
      element: '[data-tour="finance-recon-actions"]',
      popover: {
        title: "Reconciliation Actions",
        description:
          "Import bank statements (CSV), auto-match transactions, manually match entries, or flag discrepancies for review.",
        side: "bottom",
      },
    },
    {
      element: "table",
      popover: {
        title: "Transaction List",
        description:
          "Unmatched and matched transactions with amounts, dates, and descriptions. Matched, unmatched, and disputed counts are shown above.",
        side: "top",
      },
    },
  ],
};

export default financeReconciliationTour;
