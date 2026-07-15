import type { TourConfig } from "../types";

export const adminAerodromesTour: TourConfig = {
  pageKey: "admin-aerodromes",
  version: 1,
  showProgress: true,
  autoStart: false,
  steps: [
    {
      popover: {
        title: "Aerodrome Management",
        description:
          "Manage the 30+ aerodromes across the Falkland Islands: codes, runway details, coordinates, and timezone.",
      },
    },
    {
      element: "table",
      popover: {
        title: "Aerodrome Table",
        description:
          "Each aerodrome is listed with its ICAO code, name, runway length/type, coordinates, and active status.",
        side: "top",
      },
    },
    {
      element: '[data-tour="admin-aerodromes-create"]',
      popover: {
        title: "Add Aerodrome",
        description:
          "Register a new landing site with its code, name, runway specifications, and GPS coordinates.",
        side: "left",
      },
    },
  ],
};

export default adminAerodromesTour;
