/**
 * Shared, SSR-safe tour types.
 *
 * This module intentionally imports nothing from `driver.js` so that tour
 * definitions and the registry can be imported by server-rendered route
 * modules without pulling the browser-only driver.js library into the
 * server bundle.
 */

export type TourSide = "top" | "right" | "bottom" | "left";
export type TourAlign = "start" | "center" | "end";

export interface TourStep {
  /**
   * CSS selector (prefer `[data-tour="…"]`) or a live Element.
   * Omit for a centered modal step.
   */
  element?: string | Element;
  popover?: {
    title?: string;
    description: string;
    side?: TourSide;
    align?: TourAlign;
  };
  /**
   * Run before this step highlights. Use to open panels / switch modes so a
   * conditionally-rendered target exists. May be async.
   */
  onBeforeHighlight?: () => void | Promise<void>;
  /**
   * If `false`, the step is kept even when `element` is not in the DOM.
   * Defaults to `true` (missing targets are skipped).
   */
  skipIfMissing?: boolean;
}

export interface TourConfig {
  /** Stable key used for progress tracking, e.g. "operations-schedule". */
  pageKey: string;
  /** Bump when step content materially changes to re-show to returning users. */
  version: number;
  steps: TourStep[];
  showProgress?: boolean;
  /** Whether first-time visitors are auto-offered this tour. */
  autoStart?: boolean;
}
