import type { TourConfig } from "../types";

export const fuelerOrdersTour: TourConfig = {
  pageKey: "fueler-orders",
  version: 1,
  showProgress: true,
  autoStart: false,
  steps: [
    {
      popover: {
        title: "Active Fuel Orders",
        description:
          "Issued and in-progress fuel orders. Record the actual uplift amount for each order to complete the fuel cycle.",
      },
    },
    {
      element: '[data-tour="fueler-orders-list"]',
      popover: {
        title: "Order List",
        description:
          "Each order shows flight number, aircraft registration, requested fuel, and current status. Click Record Uplift to log the actual amount dispensed.",
        side: "top",
      },
    },
    {
      popover: {
        title: "Completing an Order",
        description:
          "Enter the actual kilograms uplifted. This is recorded against the flight for fuel accounting and triggers the completed status.",
      },
    },
  ],
};

export default fuelerOrdersTour;
