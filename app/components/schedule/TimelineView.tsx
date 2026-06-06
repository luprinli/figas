import type { ReactNode } from "react";

export interface TimelineStop {
  aerodromeCode: string;
  legSequence: number;
  distanceNm: number;
  heading: number;
  departureTime?: string;
  arrivalTime?: string;
}

export interface TimelineViewProps {
  stops: TimelineStop[];
  className?: string;
  children?: ReactNode;
}

/**
 * TimelineView displays a vertical timeline of stops for a sortie route.
 * Shows the sequence of aerodromes visited, with distances and headings.
 */
export default function TimelineView({
  stops,
  className,
  children,
}: TimelineViewProps) {
  if (stops.length === 0) {
    return (
      <div className="text-sm text-slate-500 dark:text-slate-400 italic">No stops defined</div>
    );
  }

  return (
    <div className={className}>
      <div className="relative">
        {/* Vertical line */}
        <div
          className="absolute left-4 top-2 bottom-2 w-0.5 bg-slate-200 dark:bg-slate-600"
          aria-hidden="true"
        />

        <div className="space-y-4">
          {stops.map((stop, index) => (
            <TimelineStopItem
              key={`${stop.legSequence}-${stop.aerodromeCode}`}
              stop={stop}
              isFirst={index === 0}
              isLast={index === stops.length - 1}
            />
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}

interface TimelineStopItemProps {
  stop: TimelineStop;
  isFirst: boolean;
  isLast: boolean;
}

function TimelineStopItem({ stop, isFirst, isLast }: TimelineStopItemProps) {
  const label = isFirst
    ? "Departure"
    : isLast
      ? "Arrival"
      : `Stop #${stop.legSequence}`;

  return (
    <div className="relative flex items-start gap-4 pl-10">
      {/* Timeline dot */}
      <div
        className={[
          "absolute left-2.5 mt-1.5 h-3 w-3 rounded-full border-2",
          isFirst
            ? "border-emerald-500 bg-emerald-100"
            : isLast
              ? "border-blue-500 bg-blue-100 dark:bg-blue-900/30"
              : "border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-800",
        ].join(" ")}
        aria-hidden="true"
      />

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {stop.aerodromeCode}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">({label})</span>
        </div>

        <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
          <span>Leg {stop.legSequence}</span>
          <span>{stop.distanceNm.toFixed(0)} nm</span>
          <span>Heading {stop.heading.toFixed(0)}°</span>
          {stop.departureTime && <span>Dep: {stop.departureTime}</span>}
          {stop.arrivalTime && <span>Arr: {stop.arrivalTime}</span>}
        </div>
      </div>
    </div>
  );
}
