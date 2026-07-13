import WeightBar from "../WeightBar";

export interface WeightSummaryLeg {
  legId: number;
  origin: string;
  destination: string;
  passengerWeightKg: number;
  baggageWeightKg: number;
  freightWeightKg: number;
  fuelWeightKg: number;
  crewWeightKg: number;
  emptyWeightKg: number;
  totalWeightKg: number;
  effectiveMtowKg: number;
  effectiveMlwKg: number;
  mtowUsedPct: number;
  mlwUsedPct: number;
  bindingConstraint: string;
}

export interface WeightSummaryProps {
  legs: WeightSummaryLeg[];
  className?: string;
}

/**
 * WeightSummary displays a per-leg weight breakdown for a flight.
 * Shows individual weight components and MTOW/MLW utilization.
 * This is the scheduling-specific version (placed in scheduling/ subdirectory).
 */
export default function WeightSummary({
  legs,
  className,
}: WeightSummaryProps) {
  if (legs.length === 0) {
    return (
      <div className="text-sm text-slate-500 dark:text-slate-400 italic">
        No weight data available
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="space-y-4">
        {legs.map((leg) => (
          <div
            key={leg.legId}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4"
          >
            {/* Leg header */}
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {leg.origin} {'\u2192'} {leg.destination}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-500">Leg #{leg.legId}</span>
            </div>

            {/* Weight components */}
            <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              <WeightComponent label="Passenger" value={leg.passengerWeightKg} />
              <WeightComponent label="Baggage" value={leg.baggageWeightKg} />
              <WeightComponent label="Freight" value={leg.freightWeightKg} />
              <WeightComponent label="Fuel" value={leg.fuelWeightKg} />
              <WeightComponent label="Crew" value={leg.crewWeightKg} />
              <WeightComponent label="Empty" value={leg.emptyWeightKg} />
            </div>

            {/* Total weight */}
            <div className="mb-3 border-t border-slate-100 dark:border-slate-700 pt-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  Total Weight
                </span>
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {leg.totalWeightKg.toFixed(0)} kg
                </span>
              </div>
            </div>

            {/* MTOW bar */}
            <div className="mb-2">
              <WeightBar
                currentWeight={leg.totalWeightKg}
                maxWeight={leg.effectiveMtowKg}
                label="MTOW"
              />
            </div>

            {/* MLW bar */}
            <div className="mb-2">
              <WeightBar
                currentWeight={leg.totalWeightKg}
                maxWeight={leg.effectiveMlwKg}
                label="MLW"
              />
            </div>

            {/* Binding constraint */}
            {leg.bindingConstraint !== "none" && (
              <div className="mt-2 rounded bg-amber-50 dark:bg-amber-900/30 dark:bg-amber-900/30 px-2 py-1 text-xs text-amber-700 dark:text-amber-400 dark:text-amber-400">
                ⚠ Binding: {leg.bindingConstraint.toUpperCase()} —{" "}
                {leg.mtowUsedPct.toFixed(1)}% used
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeightComponent({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between rounded bg-slate-50 dark:bg-slate-700 px-2 py-1">
      <span className="text-slate-500 dark:text-slate-500">{label}</span>
      <span className="font-medium text-slate-700 dark:text-slate-200">{value.toFixed(0)} kg</span>
    </div>
  );
}
