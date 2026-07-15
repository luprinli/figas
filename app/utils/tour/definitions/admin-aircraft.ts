import type { TourConfig } from "../types";

export const adminAircraftTour: TourConfig = {
  pageKey: "admin-aircraft",
  version: 1,
  showProgress: true,
  autoStart: false,
  steps: [
    {
      popover: {
        title: "Aircraft Fleet Management",
        description:
          "Manage the FIGAS fleet: registration, type, seat count, weight limits, and fuel capacity.",
      },
    },
    {
      element: "table",
      popover: {
        title: "Fleet Table",
        description:
          "Each aircraft row shows registration, type, seat count, empty/max weights, payload capacity, and fuel limits.",
        side: "top",
      },
    },
    {
      element: '[data-tour="admin-aircraft-create"]',
      popover: {
        title: "Add Aircraft",
        description:
          "Register a new aircraft with its registration mark, type, seating, and performance specifications.",
        side: "left",
      },
    },
  ],
};

export default adminAircraftTour;
