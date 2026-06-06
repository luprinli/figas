import { useState, useEffect } from "react";

interface CountdownBarProps {
  departureDate: string; // ISO date string
  className?: string;
}

/**
 * Calculates the time remaining between now and the departure date.
 * Returns an object with days, hours, minutes, and a total milliseconds remaining.
 */
function calculateTimeRemaining(departureDate: Date, now: Date) {
  const diffMs = departureDate.getTime() - now.getTime();
  const isPast = diffMs <= 0;
  const absDiffMs = Math.abs(diffMs);

  const totalDays = Math.floor(absDiffMs / (1000 * 60 * 60 * 24));
  const totalHours = Math.floor(absDiffMs / (1000 * 60 * 60));
  const hours = Math.floor((absDiffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((absDiffMs % (1000 * 60 * 60)) / (1000 * 60));

  return {
    isPast,
    totalDays,
    totalHours,
    hours,
    minutes,
    diffMs: isPast ? 0 : diffMs,
    absDiffMs,
  };
}

/**
 * Formats the countdown text based on time remaining.
 */
function formatCountdownText(
  isPast: boolean,
  totalDays: number,
  totalHours: number,
  hours: number,
  minutes: number,
): string {
  if (isPast) {
    return "Departed";
  }

  if (totalHours < 24) {
    if (totalHours < 1) {
      return `Departing today! (${minutes}m)`;
    }
    return `Departing today! (${totalHours}h ${minutes}m)`;
  }

  return `${totalDays} day${totalDays !== 1 ? "s" : ""}, ${hours} hour${hours !== 1 ? "s" : ""} until departure`;
}

/**
 * CountdownBar Component
 *
 * A visual progress bar showing time until departure.
 * Uses a fixed 30-day window as the total wait time denominator for the progress bar.
 * Updates every minute via useEffect.
 */
export default function CountdownBar({ departureDate, className = "" }: CountdownBarProps) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    // Update immediately, then every minute
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => clearInterval(timer);
  }, []);

  // Parse the departure date
  const parsedDeparture = new Date(departureDate);

  // Handle invalid date
  if (isNaN(parsedDeparture.getTime())) {
    return null;
  }

  const { isPast, totalDays, totalHours, hours, minutes, diffMs } =
    calculateTimeRemaining(parsedDeparture, now);

  // Progress bar calculation
  // Assume a 30-day (720-hour) total wait window from booking creation to departure
  const TOTAL_WAIT_HOURS = 30 * 24; // 720 hours
  const TOTAL_WAIT_MS = TOTAL_WAIT_HOURS * 60 * 60 * 1000;

  // Calculate progress: how much of the wait window has elapsed
  // If departure is in the past, bar is full
  // If departure is far out, bar is at the beginning
  const elapsedMs = isPast ? TOTAL_WAIT_MS : TOTAL_WAIT_MS - diffMs;
  const progressPercent = Math.min(100, Math.max(0, (elapsedMs / TOTAL_WAIT_MS) * 100));

  const countdownText = formatCountdownText(isPast, totalDays, totalHours, hours, minutes);

  return (
    <div className={`${className}`}>
      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-700 ease-in-out"
          style={{ width: `${progressPercent}%` }}
          role="progressbar"
          aria-valuenow={Math.round(progressPercent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${Math.round(progressPercent)}% of wait time elapsed`}
        />
      </div>

      {/* Countdown text */}
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
        {countdownText}
      </p>
    </div>
  );
}
