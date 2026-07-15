import type { TourConfig } from "../types";

export const opsLoadsheetsTour: TourConfig = {
  pageKey: "ops-loadsheets",
  version: 1,
  showProgress: true,
  autoStart: false,
  steps: [
    {
      popover: {
        title: "Loadsheet Overview",
        description:
          "View all flight loadsheets for a given date. Loadsheets contain passenger manifests, weight & balance data, and fuel calculations.",
      },
    },
    {
      element: '[data-tour="loadsheets-date"]',
      popover: {
        title: "Date Selector",
        description:
          "Pick any date to view loadsheets for that day's flights. The date defaults to today.",
        side: "bottom",
      },
    },
    {
      element: "table",
      popover: {
        title: "Loadsheet Table",
        description:
          "Each flight with its number, route, departure time, aircraft, pilot, loadsheet status, and passenger count. Click a row to open the full loadsheet.",
        side: "top",
      },
    },
    {
      element: '[data-tour="loadsheets-metrics"]',
      popover: {
        title: "Summary Metrics",
        description:
          "Total flights, total passengers, and completed loadsheet count for the selected date.",
        side: "bottom",
      },
    },
  ],
};

export default opsLoadsheetsTour;
