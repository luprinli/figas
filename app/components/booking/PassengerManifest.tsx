import type { BookingPassengerRow } from "../../utils/repositories/booking-passenger";
import type { BookingLegPassengerWithDetails } from "../../utils/repositories/booking-leg-passenger";
import { Users, AlertCircle } from "lucide-react";
import Skeleton from "../Skeleton";
import { Link } from "@remix-run/react";

interface PassengerManifestProps {
  passengers: BookingPassengerRow[];
  legPassengers: BookingLegPassengerWithDetails[];
  canManagePassengers: boolean;
  bookingId: number;
}

function BoardingPassCard({
  passenger,
  legPassengersForPassenger,
  canManagePassengers,
  bookingId,
}: {
  passenger: BookingPassengerRow;
  legPassengersForPassenger: BookingLegPassengerWithDetails[];
  canManagePassengers: boolean;
  bookingId: number;
}) {
  const isCheckedIn = legPassengersForPassenger.some((lp) => lp.checked_in);
  const isBoarded = legPassengersForPassenger.some((lp) => lp.boarded);
  const seatNumbers = legPassengersForPassenger
    .map((lp) => lp.seat_number)
    .filter(Boolean);
  const totalWeight = legPassengersForPassenger.reduce(
    (sum, lp) => sum + (lp.clothed_weight_kg ?? 0) + (lp.baggage_weight_kg ?? 0),
    0
  );

  return (
    <div className="relative rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
      {/* Perforated edge effect */}
      <div className="absolute right-0 top-0 bottom-0 w-3 bg-gradient-to-r from-transparent via-slate-100 to-slate-200 border-l border-dashed border-slate-300 dark:border-slate-600" />

      <div className="p-4 pr-5">
        {/* Header row */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {passenger.first_name} {passenger.last_name}
            </h4>
            {passenger.email && (
              <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{passenger.email}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isBoarded && (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                Boarded
              </span>
            )}
            {isCheckedIn && !isBoarded && (
              <span className="inline-flex items-center rounded-full bg-sky-100 dark:bg-sky-900/30 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                Checked In
              </span>
            )}
            {!isCheckedIn && (
              <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">
                Not Checked In
              </span>
            )}
          </div>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          {passenger.clothed_weight_kg != null && (
            <div>
              <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">Weight:</span>{" "}
              <span className="text-slate-600 dark:text-slate-300 dark:text-slate-500">{passenger.clothed_weight_kg} kg</span>
            </div>
          )}
          {totalWeight > 0 && (
            <div>
              <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">Total (inc. baggage):</span>{" "}
              <span className="text-slate-600 dark:text-slate-300 dark:text-slate-500">{totalWeight} kg</span>
            </div>
          )}
          {passenger.residency && (
            <div>
              <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">Residency:</span>{" "}
              <span className="text-slate-600 dark:text-slate-300 dark:text-slate-500">{passenger.residency}</span>
            </div>
          )}
          {passenger.date_of_birth && (
            <div>
              <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">DOB:</span>{" "}
              <span className="text-slate-600 dark:text-slate-300 dark:text-slate-500">
                {new Date(passenger.date_of_birth).toLocaleDateString("en-GB")}
              </span>
            </div>
          )}
        </div>

        {/* Seat assignments */}
        {seatNumbers.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {seatNumbers.map((sn, idx) => (
              <span
                key={idx}
                className="inline-flex items-center rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-mono text-sky-700 dark:text-sky-400 border border-sky-200"
              >
                Seat: {sn}
              </span>
            ))}
          </div>
        )}

        {/* Special requirements */}
        {passenger.special_requirements && (
          <div className="mt-2 rounded bg-amber-50 dark:bg-amber-900/30 border border-amber-200 px-2 py-1">
            <span className="text-[10px] font-medium text-amber-700">
              Special Requirements: {passenger.special_requirements}
            </span>
          </div>
        )}

        {/* Actions */}
        {canManagePassengers && (
          <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center gap-3">
            <Link
              to={`/operations/bookings/${bookingId}/passengers`}
              className="text-xs text-sky-600 hover:text-sky-800"
            >
              Edit
            </Link>
            <button
              type="button"
              className="text-xs text-red-600 hover:text-red-800"
              onClick={() => {
                if (confirm("Remove this passenger?")) {
                  // Remove passenger via fetcher
                }
              }}
            >
              Remove
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 p-6 text-center">
      <Users size={40} className="mx-auto text-slate-300 dark:text-slate-500 mb-2" absoluteStrokeWidth />
      <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">No passengers added yet.</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/20">
          <Skeleton className="h-5 w-32 rounded mb-2" />
          <Skeleton className="h-3 w-24 rounded mb-3" />
          <Skeleton className="h-3 w-full rounded mb-1" />
          <Skeleton className="h-3 w-3/4 rounded" />
        </div>
      ))}
    </div>
  );
}

export default function PassengerManifest({
  passengers,
  legPassengers,
  canManagePassengers,
  bookingId,
}: PassengerManifestProps) {
  // Loading state
  if (!passengers) {
    return <LoadingSkeleton />;
  }

  // Empty state
  if (passengers.length === 0) {
    return <EmptyState />;
  }

  // Error state
  if (legPassengers === undefined) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/30 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle size={20} className="text-red-500 mt-0.5 shrink-0" absoluteStrokeWidth />
          <div>
            <p className="text-sm font-medium text-red-800">Unable to load passenger details</p>
            <p className="text-xs text-red-600 mt-1">Some passenger information may be incomplete.</p>
          </div>
        </div>
      </div>
    );
  }

  // Normal state: render boarding-pass cards in responsive grid
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {passengers.map((passenger) => {
        const legPassengersForPassenger = legPassengers.filter(
          (lp) => lp.booking_passenger_id === passenger.id
        );

        return (
          <BoardingPassCard
            key={passenger.id}
            passenger={passenger}
            legPassengersForPassenger={legPassengersForPassenger}
            canManagePassengers={canManagePassengers}
            bookingId={bookingId}
          />
        );
      })}
    </div>
  );
}
