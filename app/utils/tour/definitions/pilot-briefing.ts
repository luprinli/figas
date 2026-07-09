import type { TourConfig } from "../types";

/**
 * Pilot Briefing tour.
 *
 * Anchors: `#pilot-briefing` (whole sheet), `data-tour` attributes on key
 * BriefingSections, and `[data-tour="accept-briefing"]` on the accept button.
 * Not auto-started — offered via the header trigger.
 */
export const pilotBriefingTour: TourConfig = {
  pageKey: "pilot-briefing",
  version: 1,
  showProgress: true,
  autoStart: false,
  steps: [
    {
      element: "#pilot-briefing",
      popover: {
        title: "Your Briefing Sheet",
        description:
          "Everything you need for this sortie: route, crew, passengers, weight & balance, and fuel.",
        side: "top",
      },
    },
    {
      element: '[data-tour="briefing-route"]',
      popover: {
        title: "Route & Times",
        description:
          "Origin, destination, and estimated departure/arrival for the sortie.",
        side: "bottom",
      },
    },
    {
      element: '[data-tour="briefing-passengers"]',
      popover: {
        title: "Passenger Manifest",
        description:
          "Who is on board, their route, seat, and weight.",
        side: "top",
      },
    },
    {
      element: '[data-tour="briefing-wb"]',
      popover: {
        title: "Weight & Balance",
        description:
          "Total mass against MTOW/MLW, CG position, and the binding constraint. Confirm it is within limits.",
        side: "top",
      },
    },
    {
      element: '[data-tour="briefing-fuel"]',
      popover: {
        title: "Fuel Plan",
        description:
          "Required and reserve fuel, burn rate, endurance, and any Stanley refuel revisit.",
        side: "top",
      },
    },
    {
      element: '[data-tour="accept-briefing"]',
      popover: {
        title: "Accept Briefing",
        description:
          "Confirms you have reviewed the sortie and unlocks departure. This is recorded against your name.",
        side: "top",
      },
    },
  ],
};

export default pilotBriefingTour;
