import type { TourConfig } from "../types";

export const bookingWizardTour: TourConfig = {
  pageKey: "booking-wizard",
  version: 1,
  showProgress: true,
  autoStart: false,
  steps: [
    {
      popover: {
        title: "New Booking",
        description:
          "Create a booking by defining the route and passengers. Each step builds toward a confirmed reservation.",
      },
    },
    {
      element: '[data-tour="booking-legs"]',
      popover: {
        title: "Step 1 \u2014 Add Legs",
        description:
          "Define each leg of the itinerary: origin, destination, date, and preferred time. Bookings can have multiple legs for complex routes.",
        side: "bottom",
      },
    },
    {
      element: '[data-tour="booking-passengers"]',
      popover: {
        title: "Step 2 \u2014 Add Passengers",
        description:
          "Add each passenger travelling on this booking: name, date of birth, weight, and residency status. Use the + Self button to auto-fill your own details.",
        side: "bottom",
      },
    },
    {
      element: 'button[type="button"]',
      popover: {
        title: "Step 3 \u2014 Create Booking",
        description:
          "When legs and passengers are complete, click Create Booking. You will be prompted to review all details before the booking is submitted.",
        side: "top",
      },
    },
    {
      popover: {
        title: "What Happens Next",
        description:
          "The booking enters the PENDING state. Operations staff confirm it, assign it to a flight via the schedule builder, and the passenger checks in on the day of travel.",
      },
    },
  ],
};

export default bookingWizardTour;
