import type { TourConfig } from "../types";

export const bookingsListTour: TourConfig = {
  pageKey: "bookings-list",
  version: 1,
  showProgress: true,
  autoStart: true,
  steps: [
    {
      popover: {
        title: "Bookings Overview",
        description: "View, search, and manage all bookings from this central list.",
      },
    },
    {
      element: "table",
      popover: {
        title: "Booking Table",
        description: "Each row shows a booking with its reference, route, passenger, status, and payment state. Click a booking to see full details.",
        side: "top",
      },
    },
    {
      element: '[data-tour="bookings-filters"]',
      popover: {
        title: "Quick Filters",
        description: "Switch between All, Upcoming, Completed, and Cancelled bookings. Use the date range picker for specific periods.",
        side: "bottom",
      },
    },
    {
      element: '[data-tour="bookings-search"]',
      popover: {
        title: "Search Bookings",
        description: "Search by booking reference, passenger name, or destination to find bookings quickly.",
        side: "bottom",
      },
    },
    {
      element: "a[href*='bookings/new']",
      popover: {
        title: "New Booking",
        description: "Create a new booking for a passenger — start with origin, destination, and date.",
        side: "left",
      },
    },
  ],
};

export default bookingsListTour;
