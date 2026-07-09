/**
 * Lazy registry mapping a pageKey to its tour definition loader.
 *
 * Used by the (future) global "help" launcher and to keep each page's tour
 * definition in its own chunk. Pages may also import their definition
 * directly for the smallest footprint.
 */

import type { TourConfig } from "./types";

export const tourRegistry: Record<
  string,
  () => Promise<{ default: TourConfig }>
> = {
  "operations-schedule": () =>
    import("./definitions/operations-schedule"),
  "checkin-counter": () => import("./definitions/checkin-counter"),
  "pilot-briefing": () => import("./definitions/pilot-briefing"),
};
