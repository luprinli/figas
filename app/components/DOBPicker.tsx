import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  MONTH_NAMES,
  DAY_NAMES_SHORT,
  getCalendarGrid,
  formatDate,
  parseDate,
  todayISO,
} from "../utils/dates";

export interface DOBPickerProps {
  value: string; // YYYY-MM-DD format
  onChange: (date: string) => void;
  error?: string; // External error message
  onErrorClear?: () => void;
}

/* ── Helpers ─────────────────────────────────────────── */

/** Parse DD/MM/YYYY string into { year, month (0-indexed), day } or null */
function parseDMY(value: string): { year: number; month: number; day: number } | null {
  const cleaned = value.replace(/\D/g, "");
  if (cleaned.length !== 8) return null;
  const day = parseInt(cleaned.slice(0, 2), 10);
  const month = parseInt(cleaned.slice(2, 4), 10) - 1;
  const year = parseInt(cleaned.slice(4, 8), 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  return { year, month, day };
}

/** Format a date object to DD/MM/YYYY display string */
function formatDMY(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${d}/${m}/${year}`;
}

/** Convert YYYY-MM-DD to DD/MM/YYYY for display */
function isoToDisplay(iso: string): string {
  const parsed = parseDate(iso);
  if (!parsed) return "";
  return formatDMY(parsed.year, parsed.month, parsed.day);
}

/** Validate a DD/MM/YYYY string, returning an error message or null */
function validateDisplayDate(value: string): string | null {
  const cleaned = value.replace(/\D/g, "");
  if (cleaned.length === 0) return null; // empty is allowed
  if (cleaned.length < 8) return "Incomplete date";

  const parsed = parseDMY(value);
  if (!parsed) return "Invalid date";

  const { year, month, day } = parsed;

  // Check it's a real calendar date
  const date = new Date(year, month, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return "Invalid date";
  }

  // Must not be in the future
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date > today) return "Date cannot be in the future";

  // Must be a reasonable DOB (not before 1900)
  if (year < 1900) return "Date is too far in the past";

  return null;
}

/** Apply auto-formatting: insert `/` separators as user types */
function autoFormat(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 8);
  const parts: string[] = [];
  if (digits.length > 0) parts.push(digits.slice(0, 2));
  if (digits.length > 2) parts.push(digits.slice(2, 4));
  if (digits.length > 4) parts.push(digits.slice(4, 8));
  return parts.join("/");
}

/* ── Component ───────────────────────────────────────── */

export default function DOBPicker({
  value,
  onChange,
  error: externalError,
  onErrorClear,
}: DOBPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [displayValue, setDisplayValue] = useState(() => isoToDisplay(value));
  const [internalError, setInternalError] = useState<string | null>(null);
  const [baseMonth, setBaseMonth] = useState(() => {
    const parsed = parseDate(value);
    if (parsed) return { year: parsed.year, month: parsed.month };
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const today = todayISO();

  // Sync display value when external value changes
  useEffect(() => {
    setDisplayValue(isoToDisplay(value));
  }, [value]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Calendar grid
  const grid = useMemo(
    () => getCalendarGrid(baseMonth.year, baseMonth.month),
    [baseMonth]
  );

  // Month/year options
  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = currentYear; y >= 1900; y--) {
      years.push(y);
    }
    return years;
  }, [currentYear]);

  // Handle input change with auto-formatting
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const formatted = autoFormat(raw);
      setDisplayValue(formatted);
      setInternalError(null);
      onErrorClear?.();

      // If fully entered, validate and emit
      if (formatted.length === 10) {
        const error = validateDisplayDate(formatted);
        if (error) {
          setInternalError(error);
        } else {
          const parsed = parseDMY(formatted)!;
          const iso = formatDate(parsed.year, parsed.month, parsed.day);
          onChange(iso);
        }
      } else if (formatted.length < 10) {
        // Only clear if the previous value was set
        if (value) {
          onChange("");
        }
      }
    },
    [onChange, onErrorClear, value]
  );

  // Handle blur — validate the date
  const handleBlur = useCallback(() => {
    if (displayValue.length === 0) {
      setInternalError(null);
      return;
    }

    const error = validateDisplayDate(displayValue);
    if (error) {
      setInternalError(error);
      // Revert to the last valid value
      setDisplayValue(isoToDisplay(value));
    } else {
      setInternalError(null);
    }
  }, [displayValue, value]);

  // Handle day selection from calendar
  const handleDayClick = useCallback(
    (day: number) => {
      const clicked = formatDate(baseMonth.year, baseMonth.month, day);
      if (clicked > today) return; // future dates disabled
      onChange(clicked);
      setDisplayValue(
        formatDMY(baseMonth.year, baseMonth.month, day)
      );
      setInternalError(null);
      onErrorClear?.();
      setIsOpen(false);
    },
    [baseMonth, onChange, onErrorClear, today]
  );

  // Handle month/year select changes
  const handleMonthChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setBaseMonth((prev) => ({
        ...prev,
        month: parseInt(e.target.value, 10),
      }));
    },
    []
  );

  const handleYearChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setBaseMonth((prev) => ({
        ...prev,
        year: parseInt(e.target.value, 10),
      }));
    },
    []
  );

  // Day classes
  const getDayClasses = useCallback(
    (day: number | null): string => {
      if (day === null) return "";

      const dateStr = formatDate(baseMonth.year, baseMonth.month, day);
      const isToday = dateStr === today;
      const isSelected = dateStr === value;
      const isDisabled = dateStr > today;

      let classes =
        "w-8 h-8 rounded-full text-sm flex items-center justify-center transition-colors";

      if (isSelected) {
        classes += " bg-blue-600 text-white";
      } else if (isDisabled) {
        classes += " text-slate-300 dark:text-slate-500 cursor-not-allowed";
      } else {
        classes += " cursor-pointer hover:bg-blue-100";
      }

      if (isToday) {
        classes += " font-bold underline";
      }

      return classes;
    },
    [baseMonth, today, value]
  );

  // Toggle calendar open/close
  const toggleCalendar = useCallback(() => {
    setIsOpen((o) => !o);
  }, []);

  // Open calendar and focus input
  const handleFocus = useCallback(() => {
    setIsOpen(true);
  }, []);

  const displayError = internalError ?? externalError;

  return (
    <div ref={panelRef} className="relative">
      {/* ── Input with calendar icon ──────────────────────── */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="DD/MM/YYYY"
          aria-label="Date of birth"
          aria-invalid={!!displayError}
          aria-describedby={displayError ? "dob-error" : undefined}
          className={
            "block w-full rounded-lg border px-2 py-1.5 text-sm shadow-sm dark:shadow-slate-900/20 focus:outline-none focus:ring-1 pr-8 " +
            (displayError
              ? "border-red-500 focus:border-red-500 focus:ring-red-500"
              : "border-slate-300 focus:border-sky-500 focus:ring-sky-500")
          }
        />
        <button
          type="button"
          onClick={toggleCalendar}
          aria-label="Open calendar"
          className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
          >
            <path
              fillRule="evenodd"
              d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1.5 3.5h11.5c.69 0 1.25.56 1.25 1.25v.5H3v-.5c0-.69.56-1.25 1.25-1.25zM3 8.25v7c0 .69.56 1.25 1.25 1.25h11.5c.69 0 1.25-.56 1.25-1.25v-7H3z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {/* Error message */}
      {displayError && (
        <p id="dob-error" className="text-red-500 text-xs mt-1">
          {displayError}
        </p>
      )}

      {/* ── Calendar popup ────────────────────────────────── */}
      {isOpen && (
        <div
          className="absolute z-50 mt-1 bg-white dark:bg-slate-800 rounded-lg shadow-lg dark:shadow-slate-900/50 ring-1 ring-slate-200 dark:ring-slate-700 p-3 w-full min-w-[260px]"
          role="dialog"
          aria-label="Select date of birth"
        >
          {/* Month / Year selectors */}
          <div className="flex items-center gap-2 mb-3">
            <select
              value={baseMonth.month}
              onChange={handleMonthChange}
              aria-label="Select month"
              className="flex-1 rounded-md border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={name} value={idx}>
                  {name}
                </option>
              ))}
            </select>
            <select
              value={baseMonth.year}
              onChange={handleYearChange}
              aria-label="Select year"
              className="flex-1 rounded-md border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* Day-of-week header */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_NAMES_SHORT.map((name) => (
              <div
                key={name}
                className="w-8 h-7 text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center justify-center"
              >
                {name}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7">
            {grid.map((day, idx) => (
              <div key={idx} className="flex items-center justify-center">
                {day !== null ? (
                  <button
                    type="button"
                    className={getDayClasses(day)}
                    onClick={() => handleDayClick(day)}
                    disabled={
                      formatDate(baseMonth.year, baseMonth.month, day) > today
                    }
                    aria-label={`Select ${formatDMY(
                      baseMonth.year,
                      baseMonth.month,
                      day
                    )}`}
                    aria-current={
                      formatDate(baseMonth.year, baseMonth.month, day) === value
                        ? "true"
                        : undefined
                    }
                  >
                    {day}
                  </button>
                ) : (
                  <div className="w-8 h-8" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
