import type { BookingLegRow } from "../../utils/repositories/booking-leg";
import type { BookingLegPassengerWithDetails } from "../../utils/repositories/booking-leg-passenger";
import { Calendar, Clock, Check, Package, AlertCircle } from "lucide-react";
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
            <Calendar size={14} className="text-slate-500 dark:text-slate-400" absoluteStrokeWidth />
            {new Date(leg.leg_date).toLocaleDateString(undefined, {
              weekday: "short",
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
          {leg.preferred_time && (
            <span className="flex items-center gap-1">
              <Clock size={14} className="text-slate-500 dark:text-slate-400" absoluteStrokeWidth />
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
                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                : leg.status === "cancelled"
                ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
            }`}
          >
            {leg.status}
          </span>
        </div>
      </div>

      {/* Passenger summary bar */}
      {passengersOnLeg.length > 0 && (
        <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
            <span>
              {passengersOnLeg.length} passenger{passengersOnLeg.length !== 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Check size={12} className="text-emerald-500" />
                {checkedInCount} checked in
              </span>
              <span className="flex items-center gap-1">
                <Check size={12} className="text-sky-500" />
                {boardedCount} boarded
              </span>
              {seatAssignment && (
                <span className="flex items-center gap-1">
                  <Package size={12} className="text-slate-500 dark:text-slate-400" absoluteStrokeWidth />
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
          <AlertCircle size={20} className="text-red-500 mt-0.5 shrink-0" absoluteStrokeWidth />
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
