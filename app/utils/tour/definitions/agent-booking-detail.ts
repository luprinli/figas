import type { TourConfig } from "../types";

export const agentBookingDetailTour: TourConfig = {
  pageKey: "agent-booking-detail",
  version: 1,
  showProgress: true,
  autoStart: false,
  steps: [
    {
      popover: {
        title: "Booking Detail",
        description:
          "View and manage a client booking: update passengers, adjust legs, track status, and handle payment.",
      },
    },
    {
      element: '[data-tour="agent-booking-info"]',
      popover: {
        title: "Booking Info",
        description:
          "Reference, status, client details, and booking source. The reference is what the client uses at check-in.",
        side: "bottom",
      },
    },
    {
      element: "table",
      popover: {
        title: "Passenger List",
        description:
          "All passengers on this booking with their personal details and per-leg baggage allocation.",
        side: "top",
      },
    },
    {
      element: '[data-tour="agent-booking-actions"]',
      popover: {
        title: "Manage Booking",
        description:
          "Edit passengers, adjust legs, update status, or cancel. Actions available depend on booking state.",
        side: "left",
      },
    },
  ],
};

export default agentBookingDetailTour;
