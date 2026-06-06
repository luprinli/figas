import type { FuelPlan } from "../../utils/scheduling/types";

export interface FuelSummaryLeg {
  legId: number;
  origin: string;
  destination: string;
  fuelPlan: FuelPlan;
}

export interface FuelSummaryProps {
  legs: FuelSummaryLeg[];
  className?: string;
}

/**
 * FuelSummary displays a per-leg fuel breakdown for a flight.
 * Shows fuel uplift, fuel on board, fuel burn, reserves, and endurance
 * from the scheduling pipeline's FuelPlan data.
 */
export default function FuelSummary({ legs, className }: FuelSummaryProps) {
  if (legs.length === 0) {
    return (
      <div className="text-sm text-slate-500 dark:text-slate-400 italic">
        No fuel data available
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="space-y-4">
        {legs.map((leg) => {
          const fp = leg.fuelPlan;
          return (
            <div
              key={leg.legId}
              className="rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-white dark:bg-slate-800 p-4"
            >
              {/* Leg header */}
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {leg.origin} → {leg.destination}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Leg #{leg.legId}</span>
              </div>

              {/* Fuel state badge */}
              <div className="mb-3 flex items-center gap-2">
                <span className="rounded bg-sky-100 dark:bg-sky-900/30 dark:bg-sky-900/30 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-400 dark:text-sky-400">
                  {fp.fuelState}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  {fp.fuelRuleApplied}
                </span>
              </div>

              {/* Fuel metrics grid */}
              <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                <FuelMetric
                  label="Fuel Uplift"
                  value={fp.fuelOnBoardKg}
                  unit="kg"
                />
                <FuelMetric
                  label="Fuel Required (Burn)"
                  value={fp.requiredFuelKg}
                  unit="kg"
                />
                <FuelMetric
                  label="Fuel on Board"
                  value={fp.fuelOnBoardKg}
                  unit="kg"
                />
                <FuelMetric
                  label="Fuel Burn"
                  value={fp.fuelBurnKg}
                  unit="kg"
                />
                <FuelMetric
                  label="Fuel Remaining"
                  value={fp.fuelRemainingKg}
                  unit="kg"
                />
                <FuelMetric
                  label="Minimum Reserve"
                  value={fp.minimumFuelKg}
                  unit="kg"
                />
              </div>

              {/* Endurance & flight time */}
              <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                <FuelMetric
                  label="Endurance"
                  value={fp.fuelEnduranceMinutes}
                  unit="min"
                />
                <FuelMetric
                  label="Flight Time"
                  value={fp.legFlightTimeMinutes}
                  unit="min"
                />
              </div>

              {/* Validation status */}
              <div className="space-y-1">
                <FuelStatusIndicator
                  label="Fuel OK (on board ≥ required)"
                  ok={fp.fuelOk}
                />
                <FuelStatusIndicator
                  label="Reserve OK (remaining ≥ minimum)"
                  ok={fp.reserveOk}
                />
                {fp.needsStanleyRevisit && (
                  <div className="rounded bg-amber-50 dark:bg-amber-900/30 dark:bg-amber-900/30 px-2 py-1 text-xs text-amber-700 dark:text-amber-400 dark:text-amber-400">
                    ⚠ Requires Stanley refuel revisit
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FuelMetric({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <div className="flex items-center justify-between rounded bg-slate-50 dark:bg-slate-700 px-2 py-1">
      <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">{label}</span>
      <span className="font-medium text-slate-700 dark:text-slate-200">
        {value.toFixed(0)} {unit}
      </span>
    </div>
  );
}

function FuelStatusIndicator({
  label,
  ok,
}: {
  label: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          ok ? "bg-green-50 dark:bg-green-900/30 dark:bg-green-900/300" : "bg-red-50 dark:bg-red-900/30 dark:bg-red-900/300"
        }`}
      />
      <span className={ok ? "text-green-700 dark:text-green-400 dark:text-green-400" : "text-red-700 dark:text-red-400 dark:text-red-400"}>{label}</span>
    </div>
  );
}
