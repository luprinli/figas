import type { TourConfig } from "../types";

export const adminFaresTour: TourConfig = {
  pageKey: "admin-fares",
  version: 1,
  showProgress: true,
  autoStart: false,
  steps: [
    {
      popover: {
        title: "Fare Route Configuration",
        description:
          "Set base fares between aerodrome pairs. These fares drive the cost calculation for all bookings.",
      },
    },
    {
      element: "table",
      popover: {
        title: "Fare Table",
        description:
          "Origin-destination pairs with base fare amount and currency. Used by the fare calculator to price bookings.",
        side: "top",
      },
    },
    {
      element: '[data-tour="admin-fares-create"]',
      popover: {
        title: "Add Fare Route",
        description:
          "Define a new fare between two aerodromes. The base fare is the starting point for passenger pricing.",
        side: "left",
      },
    },
    {
      element: '[data-tour="admin-fares-cache"]',
      popover: {
        title: "Fare Cache",
        description:
          "Fares are cached for performance. Clear the cache after making changes to ensure up-to-date pricing.",
        side: "bottom",
      },
    },
  ],
};

export default adminFaresTour;
