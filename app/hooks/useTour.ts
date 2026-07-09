/**
 * React hook for the onboarding tour lifecycle.
 *
 * Handles client-only imports of driver.js (browser-only library),
 * tracks whether autostart has already been offered during this mount,
 * and cleans up on unmount.
 */

import { useCallback, useEffect, useRef } from "react";
import type { Driver } from "driver.js";
import type { TourConfig } from "~/utils/tour/types";
import { isTourCompleted } from "~/utils/tour/storage.client";

interface UseTourOptions {
  /** When true, auto-offer to first-time users once the page is ready. */
  autoStart?: boolean;
  /** Gate autostart on data readiness (e.g. `!isLoading`). */
  ready?: boolean;
}

export function useTour(config: TourConfig, opts: UseTourOptions = {}) {
  const driverRef = useRef<Driver | null>(null);
  // Guard against loader revalidation re-triggering autostart.
  const offeredRef = useRef(false);

  const start = useCallback(async () => {
    const { startTour } = await import(
      "~/utils/tour/tour-manager.client"
    );
    driverRef.current?.destroy();
    driverRef.current = await startTour(config);
  }, [config]);

  useEffect(() => {
    const ready = opts.ready ?? true;
    if (!opts.autoStart || offeredRef.current || !ready) return;
    if (isTourCompleted(config.pageKey, config.version)) return;

    offeredRef.current = true;
    const t = window.setTimeout(start, 400);
    return () => window.clearTimeout(t);
  }, [opts.autoStart, opts.ready, config.pageKey, config.version, start]);

  // Destroy the tour instance if the user navigates away mid-tour.
  useEffect(() => () => driverRef.current?.destroy(), []);

  return { start };
}
