import type { BookingLegRow } from "../../utils/repositories/booking-leg";
import type { BookingLegPassengerWithDetails } from "../../utils/repositories/booking-leg-passenger";
import AirportCodeBadge from "./AirportCodeBadge";
import AircraftIcon from "../icons/AircraftIcon";
import FlightPathArc from "../icons/FlightPathArc";
import Skeleton from "../Skeleton";

interface SeatAssignment {
  legId: number;
  flightId: number;
  seats: Array<{ seatNumber: string; passengerId: number | null }>;
}

interface FlightLegTimelineProps {
  legs: BookingLegRow[];
  legPassengers: BookingLegPassengerWithDetails[];
  seatAssignments: SeatAssignment[];
}

function LegCard({
  leg,
  passengersOnLeg,
  seatAssignment,
}: {
  leg: BookingLegRow;
  passengersOnLeg: BookingLegPassengerWithDetails[];
  seatAssignment?: SeatAssignment;
}) {
  const checkedInCount = passengersOnLeg.filter((p) => p.checked_in).length;
  const boardedCount = passengersOnLeg.filter((p) => p.boarded).length;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm dark:shadow-slate-900/20">
      {/* Header with airport badges */}
      <div className="flex items-center justify-between gap-4 p-4 pb-2">
        <AirportCodeBadge
          code={leg.origin_code}
          variant="origin"
          size="md"
        />
        <div className="flex flex-col items-center gap-1">
          <FlightPathArc className="w-8 h-6 text-sky-500" />
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
            Leg {leg.leg_sequence}
          </span>
        </div>
        <AirportCodeBadge
          code={leg.destination_code}
          variant="destination"
          size="md"
        />
      </div>

      {/* Details row */}
      <div className="px-4 pb-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {new Date(leg.leg_date).toLocaleDateString(undefined, {
              weekday: "short",
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
          {leg.preferred_time && (
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {leg.preferred_time}
            </span>
          )}
          {leg.flight_id && (
            <span className="flex items-center gap-1">
              <AircraftIcon className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 dark:text-slate-500" />
              Flight #{leg.flight_id}
            </span>
          )}
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
              leg.status === "scheduled"
                ? "bg-sky-100 dark:bg-sky-900/30 text-sky-700"
                : leg.status === "completed"
                ? "bg-emerald-100 text-emerald-700"
                : leg.status === "cancelled"
                ? "bg-red-100 text-red-700"
                : "bg-slate-100 text-slate-600 dark:text-slate-300 dark:text-slate-500"
            }`}
          >
            {leg.status}
          </span>
        </div>
      </div>

      {/* Passenger summary bar */}
      {passengersOnLeg.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
            <span>
              {passengersOnLeg.length} passenger{passengersOnLeg.length !== 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                {checkedInCount} checked in
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3 text-sky-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                {boardedCount} boarded
              </span>
              {seatAssignment && (
                <span className="flex items-center gap-1">
                  <svg className="w-3 h-3 text-slate-500 dark:text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  {seatAssignment.seats.filter((s) => s.seatNumber).length} seats
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 p-6 text-center">
      <FlightPathArc className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-500 mb-2" />
      <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">No legs defined for this booking.</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2].map((i) => (
        <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/20">
          <div className="flex items-center justify-between mb-3">
            <Skeleton className="h-10 w-20 rounded-lg" />
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-10 w-20 rounded-lg" />
          </div>
          <Skeleton className="h-4 w-48 rounded" />
          <div className="mt-2 flex gap-4">
            <Skeleton className="h-3 w-16 rounded" />
            <Skeleton className="h-3 w-16 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FlightLegTimeline({
  legs,
  legPassengers,
  seatAssignments,
}: FlightLegTimelineProps) {
  // Loading state: legs is null/undefined
  if (!legs) {
    return <LoadingSkeleton />;
  }

  // Empty state
  if (legs.length === 0) {
    return <EmptyState />;
  }

  // Error state: legs array exists but passengers data failed
  const hasError = legPassengers === undefined;

  if (hasError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/30 p-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-red-800">Unable to load passenger data</p>
            <p className="text-xs text-red-600 mt-1">Some leg details may be incomplete.</p>
          </div>
        </div>
      </div>
    );
  }

  // Normal state: render timeline
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {legs.map((leg) => {
        const passengersOnLeg = legPassengers.filter(
          (lp) => lp.booking_leg_id === leg.id
        );
        const seatAssignment = seatAssignments.find(
          (sa) => sa.legId === leg.id
        );

        return (
          <LegCard
            key={leg.id}
            leg={leg}
            passengersOnLeg={passengersOnLeg}
            seatAssignment={seatAssignment}
          />
        );
      })}
    </div>
  );
}
