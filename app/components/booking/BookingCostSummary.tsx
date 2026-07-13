import type { FareCalculationResult } from "../../utils/services/fare-calculator";
import Skeleton from "../Skeleton";
import PaymentIcon from "../icons/PaymentIcon";

interface BookingCostSummaryProps {
  totalAmountGbp: number | null;
  fareBreakdown?: FareCalculationResult | null;
}

interface SummaryRowProps {
  label: string;
  value: string;
}

function formatCurrency(amount: number): string {
  const num = Number(amount);
  return `£${Number.isNaN(num) ? "0.00" : num.toFixed(2)}`;
}

// ── SummaryRow sub-component ────────────────────────────────────────────────

function SummaryRow({ label, value }: SummaryRowProps) {
  return (
    <div className="flex justify-between items-center gap-4 py-1.5">
      <span className="text-xs text-slate-700 dark:text-slate-200">{label}</span>
      <span className="text-xs font-medium text-slate-900 dark:text-slate-100 tabular-nums">
        {value}
      </span>
    </div>
  );
}

// ── Leg group helpers ───────────────────────────────────────────────────────

interface LegGroupItem {
  id: string;
  label: string;
  amount: number;
}

interface LegGroup {
  legId: string;
  origin: string;
  destination: string;
  subtotal: number;
  items: LegGroupItem[];
}

function buildLegGroups(calculation: FareCalculationResult): LegGroup[] {
  const fareItems = calculation.lineItems.filter((item) => item.type === "fare");
  const groups: LegGroup[] = [];

  for (const item of fareItems) {
    const key = `${item.origin ?? ""}-${item.destination ?? ""}`;
    let group = groups.find((g) => g.legId === key);
    if (!group) {
      group = {
        legId: key,
        origin: item.origin ?? "",
        destination: item.destination ?? "",
        subtotal: 0,
        items: [],
      };
      groups.push(group);
    }
    group.subtotal += item.amount;
    group.items.push({
      id: `${key}-${group.items.length}`,
      label: item.label,
      amount: item.amount,
    });
  }

  return groups;
}

// ── Main component ──────────────────────────────────────────────────────────

export default function BookingCostSummary({
  totalAmountGbp,
  fareBreakdown,
}: BookingCostSummaryProps) {
  const calculation = fareBreakdown ?? null;

  // Loading state (when fareBreakdown is not yet provided)
  if (calculation === undefined) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/20 space-y-3">
        <Skeleton className="h-5 w-40 rounded" />
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-4 w-3/4 rounded" />
        <Skeleton className="h-4 w-1/2 rounded" />
      </div>
    );
  }

  // Error state
  if (!calculation) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/30 p-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-red-800">Unable to calculate cost breakdown.</p>
            {totalAmountGbp != null && (
              <p className="text-xs text-red-600 mt-1">
                Showing stored total: {formatCurrency(totalAmountGbp)}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (calculation.lineItems.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 p-6 text-center">
        <PaymentIcon className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-500 mb-2" />
        <p className="text-sm text-slate-500 dark:text-slate-500">No cost breakdown available.</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Add legs and passengers to see the fare calculation.
        </p>
      </div>
    );
  }

  // Normal state
  const freightItems = calculation.lineItems.filter((item) => item.type === "freight");
  const legGroups = buildLegGroups(calculation);

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/20">
      <div className="flex items-center gap-2 mb-3">
        <PaymentIcon className="w-5 h-5 text-slate-500 dark:text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Cost Breakdown</h3>
        <span className="text-[10px] text-slate-500 dark:text-slate-400 ml-auto">
          {calculation.passengerCount} passenger{calculation.passengerCount !== 1 ? "s" : ""} &middot;{" "}
          {calculation.legCount} leg{calculation.legCount !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Fare line items — collapsible leg groups */}
      {legGroups.length > 0 && (
        <div className="mb-2">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
            Fare
          </h4>
          <div className="space-y-1">
            {legGroups.map((group) => (
              <details key={group.legId} className="group">
                <summary className="flex justify-between items-center gap-4 py-1.5 cursor-pointer">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                    {group.origin} {'\u2192'} {group.destination}
                  </span>
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {formatCurrency(group.subtotal)}
                  </span>
                </summary>
                <div className="ml-4 space-y-1">
                  {group.items.map((item) => (
                    <SummaryRow key={item.id} label={item.label} value={formatCurrency(item.amount)} />
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      {/* Freight line items */}
      {freightItems.length > 0 && (
        <div className="mb-2">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
            Freight
          </h4>
          <div className="space-y-1">
            {freightItems.map((item, idx) => (
              <SummaryRow key={idx} label={item.label} value={formatCurrency(item.amount)} />
            ))}
          </div>
        </div>
      )}

      {/* Subtotal */}
      <div className="border-t border-slate-100 dark:border-slate-700 pt-2 mt-2 space-y-1">
        <SummaryRow label="Subtotal (fare)" value={formatCurrency(calculation.subtotal)} />
        {calculation.freightTotal > 0 && (
          <SummaryRow label="Freight total" value={formatCurrency(calculation.freightTotal)} />
        )}
      </div>

      {/* Total */}
      <div className="mt-2 flex justify-between items-center border-t border-slate-200 dark:border-slate-700 pt-2">
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Calculated Total</span>
        <span className="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums">
          {formatCurrency(calculation.total)}
        </span>
      </div>

      {/* Stored total comparison */}
      {totalAmountGbp != null && Math.abs(totalAmountGbp - calculation.total) > 0.01 && (
        <div className="mt-2 rounded bg-amber-50 dark:bg-amber-900/30 border border-amber-200 px-2 py-1">
          <p className="text-[10px] text-amber-700">
            Stored total: {formatCurrency(totalAmountGbp)} &middot; Recalculate to update.
          </p>
        </div>
      )}
    </div>
  );
}
