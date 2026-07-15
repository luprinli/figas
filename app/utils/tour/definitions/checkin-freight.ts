import type { TourConfig } from "../types";

export const checkinFreightTour: TourConfig = {
  pageKey: "checkin-freight",
  version: 1,
  showProgress: true,
  autoStart: false,
  steps: [
    {
      popover: {
        title: "Freight Receiving",
        description:
          "Log and track freight consignments received at the counter. Each consignment gets a unique waybill number.",
      },
    },
    {
      element: "table",
      popover: {
        title: "Freight Table",
        description:
          "Waybill number, consignor/consignee, weight, dimensions, priority, hazardous flag, and payment mode. Filter and sort as needed.",
        side: "top",
      },
    },
    {
      element: '[data-tour="checkin-freight-create"]',
      popover: {
        title: "Log New Freight",
        description:
          "Record a new consignment: consignor and consignee names, description, weight, dimensions, priority, and hazardous classification.",
        side: "left",
      },
    },
    {
      element: '[data-tour="checkin-freight-metrics"]',
      popover: {
        title: "Freight Summary",
        description:
          "Unassigned vs assigned counts. Freight is assigned to a flight when it is loaded onto a specific sortie.",
        side: "bottom",
      },
    },
  ],
};

export default checkinFreightTour;
