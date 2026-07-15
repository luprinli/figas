import type { TourConfig } from "../types";

export const bookingDetailTour: TourConfig = {
  pageKey: "booking-detail",
  version: 1,
  showProgress: true,
  autoStart: false,
  steps: [
    {
      popover: {
        title: "Booking Detail",
        description:
          "Full view of a booking: status, itinerary, passengers, costs, and payment options. Everything you need to manage this reservation.",
      },
    },
    {
      element: '[data-tour="booking-header"]',
      popover: {
        title: "Booking Header",
        description:
          "Booking reference, status, source, and timeline. The reference is the unique identifier passengers use at check-in.",
        side: "bottom",
      },
    },
    {
      element: '[data-tour="booking-itinerary"]',
      popover: {
        title: "Itinerary",
        description:
          "Each leg of the journey with origin, destination, date, flight assignment, and passenger count.",
        side: "top",
      },
    },
    {
      element: '[data-tour="booking-cost"]',
      popover: {
        title: "Cost Summary",
        description:
          "Fare breakdown per leg including base fare, passenger surcharge, and baggage charges.",
        side: "left",
      },
    },
    {
      element: '[data-tour="booking-payment"]',
      popover: {
        title: "Payment Options",
        description:
          "Collect payment via Stripe, invoice, pay-on-departure, or pay-on-arrival. The payment method determines the billing workflow.",
        side: "top",
      },
    },
    {
      element: '[data-tour="booking-actions"]',
      popover: {
        title: "Actions",
        description:
          "Change status, cancel the booking, or manage passengers. Available actions depend on your permissions and the booking state.",
        side: "left",
      },
    },
  ],
};

export default bookingDetailTour;
