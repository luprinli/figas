/**
 * driver.js wrapper + async element guards.
 *
 * This is the ONLY module that imports driver.js and its CSS, so it must
 * never be evaluated on the server. It is loaded via dynamic `import()`
 * from client-only code paths (the `useTour` hook).
 */

import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import "~/styles/driver-theme.css";
import { markTourCompleted } from "./storage.client";
import type { TourConfig, TourStep } from "./types";

/** Poll for an element up to `timeout`ms (driver.js has no native wait). */
export function waitForElement(
  selector: string,
  timeout = 4000
): Promise<Element | null> {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);
    const started = Date.now();
    const interval = window.setInterval(() => {
      const el = document.querySelector(selector);
      if (el || Date.now() - started > timeout) {
        window.clearInterval(interval);
        resolve(el);
      }
    }, 100);
  });
}

function isPresent(step: TourStep): boolean {
  if (!step.element) return true; // centered modal step
  if (typeof step.element !== "string") return true;
  return !!document.querySelector(step.element);
}

/**
 * Build and start a driver.js tour from a TourConfig.
 * Returns the Driver instance, or null when there is nothing to show.
 */
export async function startTour(
  config: TourConfig
): Promise<Driver | null> {
  const steps = config.steps.filter(
    (s) => s.skipIfMissing === false || isPresent(s)
  );
  if (steps.length === 0) return null;

  const driverObj = driver({
    showProgress: config.showProgress ?? true,
    progressText: "{{current}} of {{total}}",
    // NOTE: driver.js v1 uses "previous" (not "prev").
    showButtons: ["next", "previous", "close"],
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    allowClose: true,
    smoothScroll: true,
    stagePadding: 6,
    stageRadius: 8,
    popoverClass: "figas-tour",
    steps: steps.map((s) => ({
      element: s.element,
      popover: s.popover,
      onHighlightStarted: s.onBeforeHighlight
        ? async () => {
            await s.onBeforeHighlight?.();
          }
        : undefined,
    })),
    onDestroyed: () => {
      // Fires on completion AND on close — either way stop re-offering
      // this version.
      markTourCompleted(config.pageKey, config.version);
    },
  });

  driverObj.drive();
  return driverObj;
}
