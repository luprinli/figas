import type { TourConfig } from "../types";

export const financePaymentsTour: TourConfig = {
  pageKey: "finance-payments",
  version: 1,
  showProgress: true,
  autoStart: false,
  steps: [
    {
      popover: {
        title: "Payment Records",
        description:
          "Track all payments received across Stripe, bank transfers, cash, and invoices. Every payment creates a double-entry journal record.",
      },
    },
    {
      element: "table",
      popover: {
        title: "Payment Table",
        description:
          "Each row shows the booking reference, amount, payment method, status, and timestamp. Filter by status to find pending payments.",
        side: "top",
      },
    },
    {
      element: '[data-tour="finance-payments-filters"]',
      popover: {
        title: "Status Filters",
        description:
          "Quickly switch between processing, completed, failed, and refunded payments to reconcile daily transactions.",
        side: "bottom",
      },
    },
  ],
};

export default financePaymentsTour;
