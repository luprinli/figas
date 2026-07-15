import type { TourConfig } from "../types";

export const financeInvoicesTour: TourConfig = {
  pageKey: "finance-invoices",
  version: 1,
  showProgress: true,
  autoStart: false,
  steps: [
    {
      popover: {
        title: "Invoice Management",
        description:
          "View, filter, and manage all invoices. Track issued, paid, overdue, and cancelled invoices across all bookings.",
      },
    },
    {
      element: "table",
      popover: {
        title: "Invoice Table",
        description:
          "Each row shows invoice number, booking, client, issue/due dates, amount, and status. Click an invoice to see full details.",
        side: "top",
      },
    },
    {
      element: '[data-tour="finance-invoices-filters"]',
      popover: {
        title: "Status Filters",
        description:
          "Filter by invoice status: drafted, issued, paid, overdue, cancelled. Use the page controls to browse large result sets.",
        side: "bottom",
      },
    },
  ],
};

export default financeInvoicesTour;
