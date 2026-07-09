import type { TourConfig } from "../types";

/**
 * Check-in Counter tour (workflow mode).
 *
 * The route renders two modes; this tour targets the workflow mode anchors.
 * Weight inputs (`#counter-body-weight` / `#counter-baggage-weight`) only
 * exist for STY departures and un-checked-in passengers, and the POS column
 * only activates once a passenger is selected — all such steps are skipped
 * automatically when their targets are absent.
 *
 * Not auto-started: this is a focused operational screen, offered via the
 * header trigger only.
 */
export const checkinCounterTour: TourConfig = {
  pageKey: "checkin-counter",
  version: 1,
  showProgress: true,
  autoStart: false,
  steps: [
    {
      element: '[data-tour="checkin-manifest"]',
      popover: {
        title: "Passenger Manifest",
        description:
          "Every passenger booked on this flight. Select one to begin check-in.",
        side: "right",
      },
    },
    {
      element: "#counter-body-weight",
      popover: {
        title: "Verify Weight",
        description:
          "Enter the measured passenger weight (required for Stanley departures).",
        side: "left",
      },
    },
    {
      element: "#counter-baggage-weight",
      popover: {
        title: "Baggage",
        description:
          "Record baggage weight — excess is flagged automatically for charging.",
        side: "left",
      },
    },
    {
      element: '[data-tour="checkin-pos"]',
      popover: {
        title: "Take Payment",
        description:
          "Collect any balance by card, cash, invoice, or pay-on-arrival.",
        side: "left",
      },
    },
    {
      element: '[data-tour="checkin-complete"]',
      popover: {
        title: "Complete Check-in",
        description:
          "Confirms the passenger and prints boarding and bag tags once the balance is settled.",
        side: "top",
      },
    },
    {
      popover: {
        title: "That's it",
        description:
          "Repeat for each passenger, then close out the flight when everyone is checked in.",
      },
    },
  ],
};

export default checkinCounterTour;
