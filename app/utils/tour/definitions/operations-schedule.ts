import type { TourConfig } from "../types";

/**
 * Operations Schedule builder tour.
 *
 * Targets real anchors: `#unassign-pool` (dnd-kit droppable id, reused),
 * `[data-tour="…"]` attributes added to the toolbar, status bar, board,
 * auto-build panel, draft placeholder, and action cluster.
 *
 * Conditionally-rendered targets (status bar, board, new-flight) are skipped
 * automatically when absent, yielding a coherent shorter tour on empty days.
 */
export const operationsScheduleTour: TourConfig = {
  pageKey: "operations-schedule",
  version: 1,
  showProgress: true,
  autoStart: true,
  steps: [
    {
      element: '[data-tour="schedule-date"]',
      popover: {
        title: "Select a Date",
        description:
          "Choose any day to build or review its flight schedule. Use the arrows to step between days.",
        side: "bottom",
        align: "start",
      },
    },
    {
      element: '[data-tour="schedule-status"]',
      popover: {
        title: "Schedule Status",
        description:
          "Tracks the lifecycle: Draft → Approved → Published → Active → Completed.",
        side: "bottom",
      },
    },
    {
      element: '[data-tour="schedule-autobuild"]',
      popover: {
        title: "Auto-Build",
        description:
          "Generate an optimized schedule automatically, then fine-tune it by hand.",
        side: "bottom",
      },
    },
    {
      element: "#unassign-pool",
      popover: {
        title: "Unassigned Bookings",
        description:
          "Confirmed bookings land here. Drag one onto a flight to assign it.",
        side: "left",
      },
    },
    {
      element: '[data-tour="schedule-board"]',
      popover: {
        title: "Flight Board",
        description:
          "Each card is a flight. Drag bookings on, reorder flights, or move passengers between them.",
        side: "top",
      },
    },
    {
      element: '[data-tour="new-flight"]',
      popover: {
        title: "Create a Flight",
        description:
          "Drop a booking here and the system routes a brand-new flight for you.",
        side: "top",
      },
    },
    {
      element: '[data-tour="schedule-actions"]',
      popover: {
        title: "Schedule Actions",
        description:
          "Approve, publish, revise, or cancel. Buttons appear based on your permissions and the schedule's state.",
        side: "left",
      },
    },
  ],
};

export default operationsScheduleTour;
