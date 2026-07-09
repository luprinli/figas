import WeightIcon from "./icons/WeightIcon";

interface PassengerWeight {
  name: string;
  bodyWeightKg: number;
  baggageWeightKg: number | null;
}

interface WeightSummaryProps {
  passengers: PassengerWeight[];
  freightWeightKg?: number;
  maxPayloadKg?: number;
}

export default function WeightSummary({
  passengers,
  freightWeightKg = 0,
  maxPayloadKg = 1160,
}: WeightSummaryProps) {
  const totalBodyWeight = passengers.reduce((sum, p) => sum + p.bodyWeightKg, 0);
  const totalBaggageWeight = passengers.reduce(
    (sum, p) => sum + (p.baggageWeightKg ?? 0),
    0
  );
  const totalPassengerWeight = totalBodyWeight + totalBaggageWeight;
  const totalWeight = totalPassengerWeight + freightWeightKg;
  const remainingPayload = maxPayloadKg - totalWeight;
  const pctUsed = Math.min(100, Math.round((totalWeight / maxPayloadKg) * 100));

  const barColor =
    pctUsed > 90 ? "bg-red-500" : pctUsed > 75 ? "bg-amber-500" : "bg-green-500";

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/20">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
        <WeightIcon className="w-5 h-5 text-sky-600" />
        Weight Summary
      </h3>

      {/* Weight bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="text-slate-600 dark:text-slate-300 dark:text-slate-500">
            {totalWeight.toFixed(1)} kg / {maxPayloadKg} kg
          </span>
          <span className={`font-medium ${pctUsed > 90 ? "text-red-600" : "text-slate-600 dark:text-slate-300 dark:text-slate-500"}`}>
            {pctUsed}%
          </span>
        </div>
        <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2.5">
          <div
            className={`h-2.5 rounded-full transition-all ${barColor}`}
            style={{ width: `${pctUsed}%` }}
          />
        </div>
      </div>

      {/* Breakdown */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-slate-600 dark:text-slate-300 dark:text-slate-500">
          <span>Passenger body weight</span>
          <span className="font-medium text-slate-900 dark:text-slate-100">{totalBodyWeight.toFixed(1)} kg</span>
        </div>
        {totalBaggageWeight > 0 && (
          <div className="flex justify-between text-slate-600 dark:text-slate-300 dark:text-slate-500">
            <span>Baggage</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">{totalBaggageWeight.toFixed(1)} kg</span>
          </div>
        )}
        {freightWeightKg > 0 && (
          <div className="flex justify-between text-slate-600 dark:text-slate-300 dark:text-slate-500">
            <span>Freight</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">{freightWeightKg.toFixed(1)} kg</span>
          </div>
        )}
        <div className="border-t border-slate-200 dark:border-slate-700 pt-2 flex justify-between font-semibold text-slate-900 dark:text-slate-100">
          <span>Total</span>
          <span>{totalWeight.toFixed(1)} kg</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">Remaining payload</span>
          <span className={`font-medium ${remainingPayload < 0 ? "text-red-600" : "text-green-600"}`}>
            {remainingPayload.toFixed(1)} kg
          </span>
        </div>
      </div>

      {/* Passenger list */}
      {passengers.length > 0 && (
        <div className="mt-4 border-t border-slate-100 dark:border-slate-700 pt-3">
          <h4 className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
            Passengers
          </h4>
          <ul className="space-y-1">
            {passengers.map((p, i) => (
              <li key={i} className="flex justify-between text-sm text-slate-600 dark:text-slate-300 dark:text-slate-500">
                <span>{p.name}</span>
                <span>
                  {p.bodyWeightKg} kg{p.baggageWeightKg ? ` + ${p.baggageWeightKg} kg` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
