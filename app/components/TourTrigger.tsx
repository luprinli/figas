import { useEffect, useState } from "react";
import { HelpCircle } from "lucide-react";

import { useTour } from "~/hooks/useTour";
import { isTourCompleted } from "~/utils/tour/storage.client";
import type { TourConfig } from "~/utils/tour/types";

interface TourTriggerProps {
  config: TourConfig;
  label?: string;
  autoStart?: boolean;
  /** Gate autostart on data readiness (e.g. `!isLoading`). */
  ready?: boolean;
  className?: string;
}

/**
 * "Take a tour" button. Also drives the first-time autostart when enabled.
 *
 * Renders identical markup on the server and first client paint (it does NOT
 * read localStorage during render), then refines its label after mount to
 * avoid a hydration mismatch. The button is never removed after completion —
 * it flips to "Replay tour" so help stays discoverable.
 */
export function TourTrigger({
  config,
  label = "Take a tour",
  autoStart = false,
  ready = true,
  className = "",
}: TourTriggerProps) {
  const { start } = useTour(config, { autoStart, ready });
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    setCompleted(isTourCompleted(config.pageKey, config.version));
  }, [config.pageKey, config.version]);

  return (
    <button
      type="button"
      onClick={() => void start()}
      className={`inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-800/50 ${className}`}
      aria-label={completed ? `Replay ${label}` : `Start ${label}`}
      title={completed ? "Replay tour" : label}
    >
      <HelpCircle size={14} aria-hidden />
      {completed ? "Replay tour" : label}
    </button>
  );
}
