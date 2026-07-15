import type { TourConfig } from "../types";

export const checkinLookupTour: TourConfig = {
  pageKey: "checkin-lookup",
  version: 1,
  showProgress: true,
  autoStart: false,
  steps: [
    {
      popover: {
        title: "Booking Lookup",
        description:
          "Find a booking by reference, passenger name, or flight number to start the check-in process.",
      },
    },
    {
      element: "form",
      popover: {
        title: "Search",
        description:
          "Enter a booking reference (e.g. FIG-20260714-001) and press Enter. The system matches against references, names, and flight numbers.",
        side: "bottom",
      },
    },
    {
      element: "table",
      popover: {
        title: "Search Results",
        description:
          "Matching bookings with reference, passenger name, origin/destination, status, and date. Click a row to proceed to the check-in counter.",
        side: "top",
      },
    },
  ],
};

export default checkinLookupTour;
