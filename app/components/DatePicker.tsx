import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  MONTH_NAMES,
  DAY_NAMES_SHORT,
  getCalendarGrid,
  formatDate,
  parseDate,
  todayISO,
} from "../utils/dates";

export interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  minDate?: string; // Optional minimum selectable date
  label?: string; // Optional label above the calendar
  disabledDates?: Set<string>; // Set of date strings (YYYY-MM-DD) that are unselectable (e.g., no-fly days)
}

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return "";
  const parsed = parseDate(dateStr);
  if (!parsed) return dateStr;
  return `${MONTH_NAMES[parsed.month].slice(0, 3)} ${parsed.day}, ${parsed.year}`;
}

function getInitialBaseMonth(value: string): { year: number; month: number } {
  const parsed = parseDate(value);
  if (parsed) return { year: parsed.year, month: parsed.month };
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

export default function DatePicker({
  value,
  onChange,
  minDate,
  label,
  disabledDates,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [baseMonth, setBaseMonth] = useState(() => getInitialBaseMonth(value));
  const panelRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});

  const today = todayISO();

  // Compute fixed position for the portal popup relative to the anchor button
  const updatePopupPosition = useCallback(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const popupWidth = 280;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - popupWidth - 8));
    setPopupStyle({
      position: "fixed" as const,
      top: rect.bottom + 8,
      left,
      minWidth: popupWidth,
      zIndex: 9999,
    });
  }, []);

  useEffect(() => {
    if (isOpen) {
      updatePopupPosition();
      window.addEventListener("scroll", updatePopupPosition, true);
      window.addEventListener("resize", updatePopupPosition);
    }
    return () => {
      window.removeEventListener("scroll", updatePopupPosition, true);
      window.removeEventListener("resize", updatePopupPosition);
    };
  }, [isOpen, updatePopupPosition]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current && panelRef.current.contains(target)) return;
      if (portalRef.current && portalRef.current.contains(target)) return;
      setIsOpen(false);
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

  // Navigation
  const shiftMonths = useCallback((delta: number) => {
    setBaseMonth((prev) => {
      const m = prev.month + delta;
      if (m < 0) return { year: prev.year - 1, month: 11 };
      if (m > 11) return { year: prev.year + 1, month: 0 };
      return { year: prev.year, month: m };
    });
  }, []);

  // Selection
  const handleDayClick = useCallback(
    (day: number) => {
      const clicked = formatDate(baseMonth.year, baseMonth.month, day);
      if (minDate && clicked < minDate) return;
      if (disabledDates?.has(clicked)) return;
      onChange(clicked);
      setIsOpen(false);
    },
    [baseMonth, onChange, minDate, disabledDates]
  );

  // Day classes
  const getDayClasses = useCallback(
    (day: number | null): string => {
      if (day === null) return "";

      const dateStr = formatDate(baseMonth.year, baseMonth.month, day);
      const isToday = dateStr === today;
      const isSelected = dateStr === value;
      const isPast = minDate ? dateStr < minDate : false;
      const isNoFly = disabledDates?.has(dateStr) ?? false;
      const isDisabled = isPast || isNoFly;

      let classes =
        "w-9 h-9 text-sm flex items-center justify-center transition-colors";

      if (isSelected) {
        classes += " bg-blue-600 text-white rounded-full";
      } else if (isDisabled) {
        classes += " text-slate-300 dark:text-slate-600 cursor-not-allowed";
        if (isNoFly) {
          classes += " line-through text-red-400";
        }
      } else {
        classes += " cursor-pointer hover:bg-blue-100 rounded-full";
      }

      if (isToday) {
        classes += " font-bold underline";
      }

      return classes;
    },
    [baseMonth, today, value, minDate, disabledDates]
  );

  // Summary bar text
  const summaryText = useMemo(() => {
    if (value) return formatDisplayDate(value);
    return label ? `Select ${label}` : "Select date";
  }, [value, label]);

  return (
    <div ref={panelRef} className="relative">
      {/* ── Summary bar (toggle) ─────────────────────────────────── */}
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        aria-label="Open date picker"
        className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 dark:hover:bg-slate-600 transition-colors text-slate-700 dark:text-slate-200 min-w-[220px] w-full"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4 text-slate-500 dark:text-slate-400 shrink-0"
        >
          <path
            fillRule="evenodd"
            d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1.5 3.5h11.5c.69 0 1.25.56 1.25 1.25v.5H3v-.5c0-.69.56-1.25 1.25-1.25zM3 8.25v7c0 .69.56 1.25 1.25 1.25h11.5c.69 0 1.25-.56 1.25-1.25v-7H3z"
            clipRule="evenodd"
          />
        </svg>
        <span className="flex-1 text-left">{summaryText}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-4 w-4 text-slate-500 dark:text-slate-400 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* ── Calendar panel (portaled to body to escape overflow clipping) ── */}
      {isOpen &&
        createPortal(
          <div ref={portalRef} style={popupStyle} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg dark:shadow-slate-900/50 p-4">
            {/* Month header */}
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                onClick={() => shiftMonths(-1)}
                aria-label="Previous month"
                className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
              >
                <span className="sr-only">Previous month</span>
                &larr;
              </button>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {MONTH_NAMES[baseMonth.month]} {baseMonth.year}
              </span>
              <button
                type="button"
                onClick={() => shiftMonths(1)}
                aria-label="Next month"
                className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>

            {/* Day-of-week header */}
            <div className="grid grid-cols-7 mb-1">
              {DAY_NAMES_SHORT.map((name) => (
                <div
                  key={name}
                  className="w-9 h-7 text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center justify-center"
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
                        (minDate ? formatDate(baseMonth.year, baseMonth.month, day) < minDate : false) ||
                        (disabledDates?.has(formatDate(baseMonth.year, baseMonth.month, day)) ?? false)
                      }
                    >
                      {day}
                    </button>
                  ) : (
                    <div className="w-9 h-9" />
                  )}
                </div>
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
