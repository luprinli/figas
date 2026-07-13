import { useState, useRef, type ReactNode } from "react";
import Button from "./Button";
import DatePicker from "./DatePicker";
import Delete from "./icons/Delete";
import { todayISO } from "../utils/dates";

/* ── Types ─────────────────────────────────────────────── */

interface Aerodrome {
  id: number;
  code: string;
  name: string;
}

export interface LegInitialValue {
  origin: string;
  destination: string;
  date: string;
  preferredTime: string;
}

export interface LegsTableProps {
  legCount: number;
  committedLegs: Set<number>;
  aerodromes: Aerodrome[];
  onAdd: (index: number) => void;
  onRemove: (index: number) => void;
  maxLegs?: number;
  errors?: Record<string, string>;
  onErrorClear?: (fieldName: string) => void;
  /** Optional initial values for pre-populating rows (e.g. edit mode) */
  initialValues?: LegInitialValue[];
  /** Set of date strings (YYYY-MM-DD) that are unselectable (e.g., no-fly days) */
  disabledDates?: Set<string>;
}

/* ── Helpers ───────────────────────────────────────────── */

const selectClass =
  "block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2 py-1.5 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

const selectErrorClass =
  "block w-full rounded-lg border border-red-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2 py-1.5 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500";

/* ── Component ─────────────────────────────────────────── */

export default function LegsTable({
  legCount,
  aerodromes,
  committedLegs,
  onAdd,
  onRemove,
  maxLegs = Infinity,
  errors = {},
  onErrorClear,
  initialValues,
  disabledDates,
}: LegsTableProps) {
  const atMax = legCount >= maxLegs;
  const [legDates, setLegDates] = useState<string[]>(() => {
    if (initialValues && initialValues.length > 0) {
      return initialValues.map((v) => v.date);
    }
    return Array(legCount).fill("");
  });

  // Stable, unique IDs per leg row so React preserves DOM/component state
  // when rows are added or removed.
  const nextId = useRef(0);
  const legIds = useRef<number[]>([]);
  if (legIds.current.length !== legCount) {
    const ids = legIds.current;
    while (ids.length < legCount) ids.push(nextId.current++);
    while (ids.length > legCount) ids.pop();
  }

  // Keep legDates array in sync with legCount via setState
  if (legDates.length !== legCount) {
    setLegDates((prev) => {
      const next = [...prev];
      while (next.length < legCount) next.push("");
      while (next.length > legCount) next.pop();
      return next;
    });
  }

  function renderAction(index: number): ReactNode {
    const isLastRow = index === legCount - 1;
    const isCommitted = committedLegs.has(index);

    if (isLastRow && !isCommitted) {
      return (
        <Button
          type="button"
          variant="contained"
          onClick={() => onAdd(index)}
          className="!bg-emerald-600 hover:!bg-emerald-700 !px-3 !py-1 !text-xs"
        >
          Add
        </Button>
      );
    }

    if (isCommitted) {
      return (
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="inline-flex items-center justify-center rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:bg-red-900/30 focus:outline-none focus:ring-2 focus:ring-red-500"
          aria-label={`Remove leg ${index + 1}`}
        >
          <Delete />
        </button>
      );
    }

    return null;
  }

  const rows: ReactNode[] = [];
  for (let idx = 0; idx < legCount; idx++) {
    const isCommitted = committedLegs.has(idx);
    const stableKey = legIds.current[idx];

    const originError = errors[`leg_origin_${idx}`];
    const destinationError = errors[`leg_destination_${idx}`];
    const dateError = errors[`leg_date_${idx}`];
    const timeError = errors[`leg_preferred_time_${idx}`];

    rows.push(
      <tr
        key={stableKey}
        className={isCommitted ? "bg-sky-50/40" : undefined}
      >
        <td className="whitespace-nowrap px-3 py-2 text-sm text-slate-500 dark:text-slate-500">
          {idx + 1}
        </td>
        <td className="whitespace-nowrap px-3 py-2">
          <select
            name="leg_origin[]"
            defaultValue={initialValues?.[idx]?.origin ?? ""}
            className={originError ? selectErrorClass : selectClass}
            required
            onChange={() => onErrorClear?.(`leg_origin_${idx}`)}
            onBlur={() => onErrorClear?.(`leg_origin_${idx}`)}
            aria-label={`Leg ${idx + 1} origin`}
          >
            <option value="">—</option>
            {aerodromes.map((a) => (
              <option key={a.id} value={a.code}>
                {a.code} &mdash; {a.name}
              </option>
            ))}
          </select>
          {originError && (
            <p className="text-red-500 text-xs mt-1">{originError}</p>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-2">
          <select
            name="leg_destination[]"
            defaultValue={initialValues?.[idx]?.destination ?? ""}
            className={destinationError ? selectErrorClass : selectClass}
            required
            onChange={() => onErrorClear?.(`leg_destination_${idx}`)}
            onBlur={() => onErrorClear?.(`leg_destination_${idx}`)}
            aria-label={`Leg ${idx + 1} destination`}
          >
            <option value="">—</option>
            {aerodromes.map((a) => (
              <option key={a.id} value={a.code}>
                {a.code} &mdash; {a.name}
              </option>
            ))}
          </select>
          {destinationError && (
            <p className="text-red-500 text-xs mt-1">{destinationError}</p>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-2">
          <div className="min-w-[200px]">
            <DatePicker
              key={`leg-date-${stableKey}`}
              value={legDates[idx] ?? ""}
              minDate={todayISO()}
              disabledDates={disabledDates}
              onChange={(date) => {
                const updated = [...legDates];
                updated[idx] = date;
                setLegDates(updated);
                onErrorClear?.(`leg_date_${idx}`);
              }}
            />
            {/* Hidden input to submit the date value with the form */}
            <input
              type="hidden"
              name="leg_date[]"
              value={legDates[idx] ?? ""}
              required
            />
            {dateError && (
              <p className="text-red-500 text-xs mt-1">{dateError}</p>
            )}
          </div>
        </td>
        <td className="whitespace-nowrap px-3 py-2">
          <input
            type="time"
            name="leg_preferred_time[]"
            defaultValue={initialValues?.[idx]?.preferredTime ?? ""}
            className={`block w-full rounded-lg border px-2 py-1.5 text-sm shadow-sm dark:shadow-slate-900/20 focus:outline-none focus:ring-1 ${
              timeError
                ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-sky-500 focus:ring-sky-500"
            }`}
            onChange={() => onErrorClear?.(`leg_preferred_time_${idx}`)}
            onBlur={() => onErrorClear?.(`leg_preferred_time_${idx}`)}
            aria-label={`Leg ${idx + 1} preferred time`}
          />
          {timeError && (
            <p className="text-red-500 text-xs mt-1">{timeError}</p>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-2">
          {renderAction(idx)}
        </td>
      </tr>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm dark:shadow-slate-900/20">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 px-6 py-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Flight Legs</h2>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead className="bg-slate-50 dark:bg-slate-700">
            <tr>
              <th className="w-12 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-500">
                #
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-500">
                Origin
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-500">
                Destination
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-500">
                Date
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-500">
                Preferred Time
              </th>
              <th className="w-20 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-500">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {legCount === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400 italic"
                >
                  No legs added yet. Click &ldquo;Add Leg&rdquo; to begin.
                </td>
              </tr>
            ) : (
              rows
            )}
          </tbody>
        </table>
      </div>

      {/* Max limit warning */}
      {atMax && (
        <div className="border-t border-slate-100 dark:border-slate-700 px-6 py-3 text-xs text-amber-600">
          Maximum of {maxLegs} legs reached.
        </div>
      )}
    </div>
  );
}
