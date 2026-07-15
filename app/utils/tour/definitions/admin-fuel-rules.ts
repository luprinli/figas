import type { TourConfig } from "../types";

export const adminFuelRulesTour: TourConfig = {
  pageKey: "admin-fuel-rules",
  version: 1,
  showProgress: true,
  autoStart: false,
  steps: [
    {
      popover: {
        title: "Fuel Rule Configuration",
        description:
          "Define fuel requirements by flight time and sectors. These rules power the automatic fuel planning for every flight.",
      },
    },
    {
      element: "table",
      popover: {
        title: "Fuel Rules Table",
        description:
          "Each rule maps flight time (minutes) + sector count to required fuel (kg), minimum fuel (kg), and fuel state.",
        side: "top",
      },
    },
    {
      element: '[data-tour="admin-fuel-rules-create"]',
      popover: {
        title: "Add Fuel Rule",
        description:
          "Create a new fuel requirement rule for a specific flight time and sector combination.",
        side: "left",
      },
    },
  ],
};

export default adminFuelRulesTour;
