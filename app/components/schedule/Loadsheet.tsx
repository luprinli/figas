import type { WeightBalanceResult } from "../../utils/scheduling/types";
import WeightBar from "../WeightBar";
import { FuelStatusIndicator } from "./FuelStatusIndicator";
import { formatDateFromISO } from "../../utils/dates";

// ── Public types ──────────────────────────────────────────────────────────────

export interface LoadsheetLeg {
  legId: number;
  origin: string;
  destination: string;
  legNumber: number;
  weightBalance: WeightBalanceResult;
}

export interface LoadsheetProps {
  /** Flight number */
  flightNumber: string;
  /** Schedule date (ISO string) */
  scheduleDate: string;
  /** Aircraft registration */
  aircraftRegistration: string;
  /** Aircraft type */
  aircraftType: string;
  /** Per-leg weight & balance results */
  legs: LoadsheetLeg[];
  /** Optional CSS class */
  className?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatNumber(value: number, decimals = 0): string {
  return value.toFixed(decimals);
}

function validationStatusText(wb: WeightBalanceResult): {
  label: string;
  ok: boolean;
} {
  if (wb.bindingConstraint.constraint === "none") {
    return { label: "Within limits", ok: true };
  }
  return {
    label: `Exceeded — ${wb.bindingConstraint.constraint.toUpperCase()} (${wb.bindingConstraint.detail})`,
    ok: false,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">
      {title}
    </h4>
  );
}

function WeightRow({
  label,
  value,
  unit = "kg",
  highlight,
}: {
  label: string;
  value: number;
  unit?: string;
  highlight?: "ok" | "warn" | "error";
}) {
  const colorClass =
    highlight === "error"
      ? "text-red-700 dark:text-red-400 dark:text-red-400"
      : highlight === "warn"
        ? "text-amber-700 dark:text-amber-400 dark:text-amber-400"
        : "text-slate-900 dark:text-slate-100";

  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-slate-600 dark:text-slate-300 dark:text-slate-500">{label}</span>
      <span className={`font-medium ${colorClass}`}>
        {formatNumber(value)} {unit}
      </span>
    </div>
  );
}

function Divider() {
  return <div className="my-2 border-t border-slate-100 dark:border-slate-700" />;
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${
        ok ? "bg-green-50 dark:bg-green-900/30 dark:bg-green-900/300" : "bg-red-50 dark:bg-red-900/30 dark:bg-red-900/300"
      }`}
    />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * Loadsheet displays a complete weight and balance loadsheet for a flight.
 *
 * It shows:
 * - Flight information (flight number, date, route)
 * - Aircraft information (registration, type)
 * - Weight breakdown (empty weight, crew, passengers, baggage, fuel, cargo)
 * - Center of gravity calculation
 * - Takeoff and landing weight with limits
 * - Runway derating information
 * - Fuel summary
 * - Validation status (within limits / exceeded)
 *
 * Uses the same styling patterns as FuelSummary, WeightBar, and WeightSummary.
 */
export default function Loadsheet({
  flightNumber,
  scheduleDate,
  aircraftRegistration,
  aircraftType,
  legs,
  className,
}: LoadsheetProps) {
  if (legs.length === 0) {
    return (
      <div className="text-sm text-slate-500 dark:text-slate-400 italic">
        No weight and balance data available
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="space-y-6">
        {legs.map((leg) => {
          const wb = leg.weightBalance;
          const fp = wb.fuelPlan;
          const validation = validationStatusText(wb);

          return (
            <div
              key={leg.legId}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm dark:shadow-slate-900/20"
            >
              {/* ── Header: Flight & Leg Info ─────────────────────────────── */}
              <div className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {flightNumber}
                    </span>
                    <span className="ml-2 text-sm text-slate-500 dark:text-slate-500">
                      Leg {leg.legNumber}
                    </span>
                  </div>
                  <span className="text-sm text-slate-500 dark:text-slate-500">
                    {formatDateFromISO(scheduleDate)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {leg.origin} {'\u2192'} {leg.destination}
                  </span>
                  <span className="rounded bg-sky-100 dark:bg-sky-900/30 dark:bg-sky-900/30 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-400 dark:text-sky-400">
                    {aircraftRegistration}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-500">{aircraftType}</span>
                </div>
              </div>

              <div className="p-4">
                {/* ── Weight Breakdown ────────────────────────────────────── */}
                <SectionHeader title="Weight Breakdown" />
                <div className="mb-4">
                  <WeightRow label="Empty weight" value={wb.emptyWeightKg} />
                  <WeightRow label="Crew" value={wb.crewWeightKg} />
                  <WeightRow label="Passengers" value={wb.passengerWeightKg} />
                  <WeightRow label="Baggage" value={wb.baggageWeightKg} />
                  <WeightRow label="Freight / Cargo" value={wb.freightWeightKg} />
                  <WeightRow label="Fuel" value={wb.fuelWeightKg} />
                  <Divider />
                  <WeightRow
                    label="Total (ramp weight)"
                    value={wb.totalWeightKg}
                    highlight={
                      wb.mtowUsedPct >= 100
                        ? "error"
                        : wb.mtowUsedPct >= 90
                          ? "warn"
                          : "ok"
                    }
                  />
                </div>

                {/* ── Weight Bars ─────────────────────────────────────────── */}
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <WeightBar
                    currentWeight={wb.totalWeightKg}
                    maxWeight={wb.effectiveMtowKg}
                    label="Takeoff Weight vs MTOW"
                  />
                  <WeightBar
                    currentWeight={wb.totalWeightKg - fp.fuelBurnKg}
                    maxWeight={wb.effectiveMlwKg}
                    label="Landing Weight vs MLW"
                  />
                </div>

                {/* ── Takeoff & Landing ───────────────────────────────────── */}
                <SectionHeader title="Takeoff & Landing" />
                <div className="mb-4">
                  <WeightRow
                    label="Takeoff weight"
                    value={wb.totalWeightKg}
                  />
                  <WeightRow
                    label="Effective MTOW"
                    value={wb.effectiveMtowKg}
                  />
                  <WeightRow
                    label="MTOW utilisation"
                    value={wb.mtowUsedPct}
                    unit="%"
                    highlight={
                      wb.mtowUsedPct >= 100
                        ? "error"
                        : wb.mtowUsedPct >= 90
                          ? "warn"
                          : "ok"
                    }
                  />
                  <Divider />
                  <WeightRow
                    label="Landing weight"
                    value={wb.totalWeightKg - fp.fuelBurnKg}
                  />
                  <WeightRow
                    label="Effective MLW"
                    value={wb.effectiveMlwKg}
                  />
                  <WeightRow
                    label="MLW utilisation"
                    value={wb.mlwUsedPct}
                    unit="%"
                    highlight={
                      wb.mlwUsedPct >= 100
                        ? "error"
                        : wb.mlwUsedPct >= 90
                          ? "warn"
                          : "ok"
                    }
                  />
                </div>

                {/* ── Centre of Gravity ───────────────────────────────────── */}
                <SectionHeader title="Centre of Gravity" />
                <div className="mb-4">
                  <WeightRow
                    label="Total moment"
                    value={wb.totalMomentKgm}
                    unit="kg·m"
                  />
                  <WeightRow
                    label="CG position"
                    value={wb.cgPositionPct}
                    unit="%"
                  />
                </div>

                {/* ── Fuel Summary ────────────────────────────────────────── */}
                <SectionHeader title="Fuel Summary" />
                <div className="mb-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded bg-sky-100 dark:bg-sky-900/30 dark:bg-sky-900/30 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-400 dark:text-sky-400">
                      {fp.fuelState}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-500">
                      {fp.fuelRuleApplied}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                    <FuelMetric
                      label="Fuel on Board"
                      value={fp.fuelOnBoardKg}
                    />
                    <FuelMetric
                      label="Fuel Required"
                      value={fp.requiredFuelKg}
                    />
                    <FuelMetric
                      label="Fuel Burn"
                      value={fp.fuelBurnKg}
                    />
                    <FuelMetric
                      label="Fuel Remaining"
                      value={fp.fuelRemainingKg}
                    />
                    <FuelMetric
                      label="Minimum Reserve"
                      value={fp.minimumFuelKg}
                    />
                    <FuelMetric
                      label="Endurance"
                      value={fp.fuelEnduranceMinutes}
                      unit="min"
                    />
                  </div>
                  <div className="mt-2 space-y-1">
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

                {/* ── Binding Constraint ──────────────────────────────────── */}
                <SectionHeader title="Binding Constraint" />
                <div className="mb-4">
                  <div className="flex items-center gap-2 rounded bg-slate-50 dark:bg-slate-700 px-3 py-2 text-sm">
                    <StatusDot ok={validation.ok} />
                    <span
                      className={
                        validation.ok ? "text-green-700 dark:text-green-400 dark:text-green-400" : "text-red-700 dark:text-red-400 dark:text-red-400"
                      }
                    >
                      {validation.label}
                    </span>
                  </div>
                  {wb.bindingConstraint.constraint !== "none" && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                      {wb.bindingConstraint.detail}
                    </p>
                  )}
                </div>

                {/* ── Validation Status ───────────────────────────────────── */}
                <div
                  className={`rounded-md border px-3 py-2 ${
                    validation.ok
                      ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/30 dark:bg-green-900/30"
                      : "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 dark:bg-red-900/30"
                  }`}
                  role="status"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <StatusDot ok={validation.ok} />
                    <span
                      className={`font-medium ${
                        validation.ok ? "text-green-800 dark:text-green-400 dark:text-green-400" : "text-red-800 dark:text-red-400 dark:text-red-400"
                      }`}
                    >
                      {validation.ok
                        ? "✓ Loadsheet valid — all weights within limits"
                        : "�— Loadsheet invalid — weight limit exceeded"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Internal sub-components ───────────────────────────────────────────────────

function FuelMetric({
  label,
  value,
  unit = "kg",
}: {
  label: string;
  value: number;
  unit?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded bg-slate-50 dark:bg-slate-700 px-2 py-1">
      <span className="text-slate-500 dark:text-slate-500">{label}</span>
      <span className="font-medium text-slate-700 dark:text-slate-200">
        {formatNumber(value)} {unit}
      </span>
    </div>
  );
}
