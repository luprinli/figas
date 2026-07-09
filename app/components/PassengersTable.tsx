import type { ReactNode } from "react";
import { useState, useRef, useCallback } from "react";
import Button from "./Button";
import DOBPicker from "./DOBPicker";
import PassengerSearchCombobox from "./PassengerSearchCombobox";
import type { PassengerResult } from "./PassengerSearchCombobox";
import Delete from "./icons/Delete";

/* ── Types ─────────────────────────────────────────────── */

export interface PrefillData {
  existingId: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  clothed_weight_kg: number;
  residency: string;
}

export interface PassengersTableProps {
  passengerCount: number;
  committedPassengers: Set<number>;
  onAdd: (index: number) => void;
  onRemove: (index: number) => void;
  maxPassengers?: number;
  /** Slot for header actions (e.g. "+ Self" button) */
  headerActions?: ReactNode;
  /**
   * Pre-filled data for rows that were populated from search results.
   * Keyed by row index. When present, hidden inputs carry the existingId
   * and visible inputs get their defaultValue pre-set.
   */
  prefilledData?: Map<number, PrefillData>;
  /** Validation errors keyed by field name */
  errors?: Record<string, string>;
  /** Callback to clear an error when the user interacts with a field */
  onErrorClear?: (fieldName: string) => void;
}

/* ── Helpers ───────────────────────────────────────────── */

const inputClass =
  "block w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-2 py-1.5 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

const inputErrorClass =
  "block w-full rounded-lg border border-red-500 px-2 py-1.5 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500";

/* ── Component ─────────────────────────────────────────── */

export default function PassengersTable({
  passengerCount,
  committedPassengers,
  onAdd,
  onRemove,
  maxPassengers = Infinity,
  headerActions,
  prefilledData: externalPrefills,
  errors = {},
  onErrorClear,
}: PassengersTableProps) {
  const atMax = passengerCount >= maxPassengers;
  const formRef = useRef<HTMLFormElement | null>(null);

  /**
   * Internal prefill state — populated by inline combobox selections.
   * Merged with external prefills (from route-level "+ Self" or other triggers).
   * External prefills take precedence since they're set by the route.
   */
  const [internalPrefills, setInternalPrefills] = useState<Map<number, PrefillData>>(new Map());

  /**
   * DOB values keyed by row index — managed by DatePicker components.
   */
  const [dobValues, setDobValues] = useState<Map<number, string>>(new Map());

  /**
   * Merge external and internal prefills.
   * External (from route) takes priority.
   */
  function getPrefill(index: number): PrefillData | undefined {
    return externalPrefills?.get(index) ?? internalPrefills.get(index);
  }

  /**
   * Handle DOB change from DatePicker for a given row.
   */
  const handleDobChange = useCallback((index: number, date: string) => {
    setDobValues((prev) => {
      const next = new Map(prev);
      if (date) {
        next.set(index, date);
      } else {
        next.delete(index);
      }
      return next;
    });
    onErrorClear?.(`passenger_dob_${index}`);
  }, [onErrorClear]);

  /**
   * Get the current DOB value for a row — prefer DatePicker state, fall back to prefill.
   */
  function getDobValue(index: number): string {
    return dobValues.get(index) ?? getPrefill(index)?.date_of_birth ?? "";
  }

  /* ── Duplicate email check ──────────────────────────── */

  const isDuplicateEmail = useCallback(
    (email: string, currentRowIndex: number): boolean => {
      const form = formRef.current;
      if (!form) return false;
      const emails = form.elements.namedItem("passenger_email[]") as RadioNodeList | null;
      if (!emails) return false;
      for (let i = 0; i < emails.length; i++) {
        if (i === currentRowIndex) continue;
        if ((emails[i] as HTMLInputElement).value === email) return true;
      }
      return false;
    },
    []
  );

  /* ── Handle combobox selection ───────────────────────── */

  function handleComboboxSelect(rowIndex: number, p: PassengerResult) {
    setInternalPrefills((prev) => {
      const next = new Map(prev);
      next.set(rowIndex, {
        existingId: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        email: p.email,
        phone: p.phone ?? "",
        date_of_birth: p.date_of_birth,
        clothed_weight_kg: p.clothed_weight_kg,
        residency: p.residency,
      });
      return next;
    });
    // Sync DOB into DatePicker state
    if (p.date_of_birth) {
      setDobValues((prev) => {
        const next = new Map(prev);
        next.set(rowIndex, p.date_of_birth);
        return next;
      });
    }
  }

  /* ── Handle remove with index cleanup ────────────────── */

  function handleRemove(index: number) {
    // Clean up internal prefills for shifted indices
    setInternalPrefills((prev) => {
      const next = new Map<number, PrefillData>();
      for (const [key, val] of prev) {
        if (key === index) continue; // remove this row
        next.set(key > index ? key - 1 : key, val); // shift down
      }
      return next;
    });
    // Clean up dobValues for shifted indices
    setDobValues((prev) => {
      const next = new Map<number, string>();
      for (const [key, val] of prev) {
        if (key === index) continue; // remove this row
        next.set(key > index ? key - 1 : key, val); // shift down
      }
      return next;
    });
    onRemove(index);
  }

  /* ── Render action button ────────────────────────────── */

  function renderAction(index: number): ReactNode {
    const isLastRow = index === passengerCount - 1;
    const isCommitted = committedPassengers.has(index);

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
          onClick={() => handleRemove(index)}
          className="inline-flex items-center justify-center rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:bg-red-900/30 focus:outline-none focus:ring-2 focus:ring-red-500"
          aria-label={`Remove passenger ${index + 1}`}
        >
          <Delete />
        </button>
      );
    }

    return null;
  }

  /* ── Build rows ──────────────────────────────────────── */

  const rows: ReactNode[] = [];
  for (let idx = 0; idx < passengerCount; idx++) {
    const isCommitted = committedPassengers.has(idx);
    const prefill = getPrefill(idx);

    const firstNameError = errors[`passenger_first_name_${idx}`];
    const lastNameError = errors[`passenger_last_name_${idx}`];
    const emailError = errors[`passenger_email_${idx}`];
    const dobError = errors[`passenger_dob_${idx}`];
    const weightError = errors[`passenger_weight_${idx}`];

    rows.push(
      <tr
        key={idx}
        className={isCommitted ? "bg-sky-50/40" : undefined}
      >
        <td className="whitespace-nowrap px-3 py-2 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
          {idx + 1}
          {prefill && (
            <>
              <span className="ml-1 text-[10px] text-emerald-600 font-medium">
                (existing)
              </span>
              <input
                type="hidden"
                name="passenger_existing_id[]"
                value={prefill.existingId}
              />
            </>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-2">
          <PassengerSearchCombobox
            rowIndex={idx}
            isCommitted={false}
            defaultValue={prefill?.first_name ?? ""}
            onSelect={handleComboboxSelect}
            isDuplicateEmail={isDuplicateEmail}
          />
          {firstNameError && (
            <p className="text-red-500 text-xs mt-1">{firstNameError}</p>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-2">
          <input
            type="text"
            name="passenger_last_name[]"
            defaultValue={prefill?.last_name ?? ""}
            className={lastNameError ? inputErrorClass : inputClass}
            required
            onChange={() => onErrorClear?.(`passenger_last_name_${idx}`)}
            onBlur={() => onErrorClear?.(`passenger_last_name_${idx}`)}
          />
          {lastNameError && (
            <p className="text-red-500 text-xs mt-1">{lastNameError}</p>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-2">
          <input
            type="email"
            name="passenger_email[]"
            defaultValue={prefill?.email ?? ""}
            className={emailError ? inputErrorClass : inputClass}
            required
            onChange={() => onErrorClear?.(`passenger_email_${idx}`)}
            onBlur={() => onErrorClear?.(`passenger_email_${idx}`)}
          />
          {emailError && (
            <p className="text-red-500 text-xs mt-1">{emailError}</p>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-2">
          <input
            type="tel"
            name="passenger_phone[]"
            defaultValue={prefill?.phone ?? ""}
            className={inputClass}
          />
        </td>
        <td className="whitespace-nowrap px-3 py-2">
          <DOBPicker
            value={getDobValue(idx)}
            onChange={(date) => handleDobChange(idx, date)}
            error={dobError}
            onErrorClear={() => onErrorClear?.(`passenger_dob_${idx}`)}
          />
          <input
            type="hidden"
            name="passenger_dob[]"
            value={getDobValue(idx)}
          />
        </td>
        <td className="whitespace-nowrap px-3 py-2">
          <input
            type="number"
            name="passenger_weight[]"
            defaultValue={prefill ? String(prefill.clothed_weight_kg) : ""}
            min={0}
            step={0.1}
            className={weightError ? inputErrorClass : inputClass}
            onChange={() => onErrorClear?.(`passenger_weight_${idx}`)}
            onBlur={() => onErrorClear?.(`passenger_weight_${idx}`)}
          />
          {weightError && (
            <p className="text-red-500 text-xs mt-1">{weightError}</p>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-2">
          <input
            type="text"
            name="passenger_residency[]"
            defaultValue={prefill?.residency ?? ""}
            className={inputClass}
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="text"
            name="passenger_special[]"
            defaultValue=""
            className={inputClass}
            placeholder="e.g. wheelchair, medical…"
          />
        </td>
        <td className="whitespace-nowrap px-3 py-2">
          {renderAction(idx)}
        </td>
      </tr>
    );
  }

  /* ── Render table ────────────────────────────────────── */

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm dark:shadow-slate-900/20">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 px-6 py-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Passengers</h2>
        <div className="flex items-center gap-2">
          {headerActions}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-visible">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead className="bg-slate-50 dark:bg-slate-700">
            <tr>
              <th className="w-12 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500">
                #
              </th>
              <th className="min-w-[120px] px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500">
                First Name
              </th>
              <th className="min-w-[120px] px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500">
                Last Name
              </th>
              <th className="min-w-[160px] px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500">
                Email
              </th>
              <th className="min-w-[120px] px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500">
                Phone
              </th>
              <th className="w-32 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500">
                DOB
              </th>
              <th className="w-24 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500">
                Weight (kg)
              </th>
              <th className="w-28 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500">
                Residency
              </th>
              <th className="min-w-[140px] px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500">
                Special Req.
              </th>
              <th className="w-20 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {passengerCount === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400 italic"
                >
                  Click &ldquo;+ Self&rdquo; or type a name to search for existing passengers.
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
          Maximum of {maxPassengers} passengers reached.
        </div>
      )}
    </div>
  );
}
