import type { BookingLegRow } from "../utils/repositories/booking-leg";
import type { BookingLegPassengerWithDetails } from "../utils/repositories/booking-leg-passenger";
import ItineraryIcon from "./icons/ItineraryIcon";

interface ItineraryGroupProps {
  legs: BookingLegRow[];
  legPassengers?: BookingLegPassengerWithDetails[];
}

export default function ItineraryGroup({ legs, legPassengers = [] }: ItineraryGroupProps) {
  if (legs.length === 0) {
    return (
      <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4 text-sm text-yellow-700">
        No legs have been added to this booking yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
        <ItineraryIcon className="w-5 h-5 text-sky-600" />
        Itinerary ({legs.length} leg{legs.length !== 1 ? "s" : ""})
      </h3>

      {legs.map((leg, index) => {
        // Get freight data for this leg from booking_leg_passengers
        const legFreightItems = legPassengers.filter(
          (lp) => lp.booking_leg_id === leg.id && (lp.freight_description || (lp.freight_weight_kg ?? 0) > 0)
        );

        return (
          <div key={leg.id} className="relative">
            {/* Timeline connector */}
            {index < legs.length - 1 && (
              <div className="absolute left-5 top-10 bottom-0 w-0.5 bg-slate-200" />
            )}

            <div className="flex gap-4">
              {/* Timeline dot */}
              <div className="flex-shrink-0 mt-1">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-900/30 text-sm font-bold text-sky-700">
                  {leg.leg_sequence}
                </div>
              </div>

              {/* Leg card */}
              <div className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/20 mb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-slate-900 dark:text-slate-100">{leg.origin_code}</span>
                    <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">&rarr;</span>
                    <span className="text-lg font-bold text-slate-900 dark:text-slate-100">{leg.destination_code}</span>
                  </div>
                  <span className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
                    {new Date(leg.leg_date).toLocaleDateString(undefined, {
                      weekday: "short",
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600 dark:text-slate-300 dark:text-slate-500">
                  {leg.flight_id && (
                    <div>
                      <span className="font-medium text-slate-700 dark:text-slate-200">Flight:</span> #{leg.flight_id}
                    </div>
                  )}
                  {leg.preferred_time && (
                    <div>
                      <span className="font-medium text-slate-700 dark:text-slate-200">Preferred Time:</span> {leg.preferred_time}
                    </div>
                  )}
                  {leg.preferred_time_start && leg.preferred_time_end && (
                    <div>
                      <span className="font-medium text-slate-700 dark:text-slate-200">Time Window:</span> {leg.preferred_time_start} &ndash; {leg.preferred_time_end}
                    </div>
                  )}
                  <div>
                    <span className="font-medium text-slate-700 dark:text-slate-200">Status:</span>{" "}
                    <span className="capitalize">{leg.status.replace(/_/g, " ")}</span>
                  </div>
                </div>

                {legFreightItems.length > 0 && (
                  <div className="mt-3 border-t border-slate-100 dark:border-slate-700 pt-2 text-sm text-slate-600 dark:text-slate-300 dark:text-slate-500">
                    <span className="font-medium">Freight:</span>
                    {legFreightItems.map((lp, idx) => (
                      <div key={lp.id} className="ml-2">
                        {lp.freight_description ?? `Item ${idx + 1}`}
                        {lp.freight_weight_kg != null && lp.freight_weight_kg > 0 && ` (${lp.freight_weight_kg} kg)`}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
