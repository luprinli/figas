import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  QUICK_SELECTS,
  MONTH_NAMES,
  DAY_NAMES_SHORT,
  getCalendarGrid,
  formatDate,
  parseDate,
  isDateInRange,
  isRangeStart,
  isRangeEnd,
  todayISO,
} from "../utils/dates";

interface DateRangePickerProps {
  dateFrom: string;
  dateTo: string;
  onDateChange: (range: { dateFrom: string; dateTo: string }) => void;
}

function getInitialBaseMonth(dateFrom: string): { year: number; month: number } {
  const parsed = parseDate(dateFrom);
  if (parsed) return { year: parsed.year, month: parsed.month };
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return "";
  const parsed = parseDate(dateStr);
  if (!parsed) return dateStr;
  return `${MONTH_NAMES[parsed.month].slice(0, 3)} ${parsed.day}, ${parsed.year}`;
}

export default function DateRangePicker({ dateFrom, dateTo, onDateChange }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [baseMonth, setBaseMonth] = useState(() => getInitialBaseMonth(dateFrom));
  const panelRef = useRef<HTMLDivElement>(null);

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

  // ── Derived months ──────────────────────────────────────────────
  const leftMonth = baseMonth;
  const rightMonth = useMemo(() => {
    const m = baseMonth.month + 1;
    return m > 11
      ? { year: baseMonth.year + 1, month: 0 }
      : { year: baseMonth.year, month: m };
  }, [baseMonth]);

  const leftGrid = useMemo(
    () => getCalendarGrid(leftMonth.year, leftMonth.month),
    [leftMonth]
  );
  const rightGrid = useMemo(
    () => getCalendarGrid(rightMonth.year, rightMonth.month),
    [rightMonth]
  );

  const today = todayISO();

  // ── Navigation ──────────────────────────────────────────────────
  const shiftMonths = useCallback((delta: number) => {
    setBaseMonth((prev) => {
      const m = prev.month + delta;
      if (m < 0) return { year: prev.year - 1, month: 11 };
      if (m > 11) return { year: prev.year + 1, month: 0 };
      return { year: prev.year, month: m };
    });
  }, []);

  // ── Selection ───────────────────────────────────────────────────
  const handleDayClick = useCallback(
    (day: number, month: { year: number; month: number }) => {
      const clicked = formatDate(month.year, month.month, day);
      if (!dateFrom || (dateFrom && dateTo)) {
        // Start new selection
        onDateChange({ dateFrom: clicked, dateTo: "" });
      } else {
        // Set end of range
        if (clicked < dateFrom) {
          onDateChange({ dateFrom: clicked, dateTo: dateFrom });
        } else {
          onDateChange({ dateFrom, dateTo: clicked });
        }
      }
    },
    [dateFrom, dateTo, onDateChange]
  );

  const handleDayHover = useCallback(
    (day: number | null, month: { year: number; month: number }) => {
      if (day === null) {
        setHoverDate(null);
        return;
      }
      if (dateFrom && !dateTo) {
        setHoverDate(formatDate(month.year, month.month, day));
      }
    },
    [dateFrom, dateTo]
  );

  // ── Range preview helpers ───────────────────────────────────────
  const effectiveTo = dateTo || hoverDate;

  const getDayClasses = useCallback(
    (day: number | null, month: { year: number; month: number }): string => {
      if (day === null) return "";

      const dateStr = formatDate(month.year, month.month, day);
      const isToday = dateStr === today;
      const inRange = isDateInRange(dateStr, dateFrom, effectiveTo ?? "");
      const isStart = isRangeStart(dateStr, dateFrom);
      const isEnd = isRangeEnd(dateStr, effectiveTo ?? "");
      const isSingle = isStart && isEnd && dateFrom === effectiveTo;

      let classes = "w-9 h-9 text-sm flex items-center justify-center cursor-pointer transition-colors";

      if (isSingle) {
        classes += " bg-blue-600 text-white rounded-full";
      } else if (isStart) {
        classes += " bg-blue-600 text-white rounded-l-full";
      } else if (isEnd) {
        classes += " bg-blue-600 text-white rounded-r-full";
      } else if (inRange) {
        classes += " bg-blue-50";
      } else {
        classes += " hover:bg-blue-100 rounded-full";
      }

      if (isToday) {
        classes += " font-bold underline";
      }

      return classes;
    },
    [today, dateFrom, effectiveTo]
  );

  // ── Quick selects ───────────────────────────────────────────────
  const isQuickActive = useCallback(
    (label: string) => {
      const qs = QUICK_SELECTS.find((q) => q.label === label);
      if (!qs) return false;
      const { dateFrom: qFrom, dateTo: qTo } = qs.getRange();
      return dateFrom === qFrom && dateTo === qTo;
    },
    [dateFrom, dateTo]
  );

  // ── Summary bar text ────────────────────────────────────────────
  const summaryText = useMemo(() => {
    if (dateFrom && dateTo) {
      return `${formatDisplayDate(dateFrom)} – ${formatDisplayDate(dateTo)}`;
    }
    if (dateFrom) {
      return `From ${formatDisplayDate(dateFrom)}`;
    }
    return "Select date range";
  }, [dateFrom, dateTo]);

  // ── Render a single calendar month ──────────────────────────────
  const renderMonth = (
    month: { year: number; month: number },
    grid: (number | null)[],
    showNav: boolean
  ) => (
    <div className="select-none">
      {/* Month header */}
      <div className="flex items-center justify-between mb-2">
        {showNav ? (
          <button
            type="button"
            onClick={() => shiftMonths(-1)}
            aria-label="Previous month"
            className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
            </svg>
          </button>
        ) : (
          <div className="w-7" />
        )}
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {MONTH_NAMES[month.month]} {month.year}
        </span>
        {showNav ? (
          <button
            type="button"
            onClick={() => shiftMonths(1)}
            aria-label="Next month"
            className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
          </button>
        ) : (
          <div className="w-7" />
        )}
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
                className={getDayClasses(day, month)}
                onClick={() => handleDayClick(day, month)}
                onMouseEnter={() => handleDayHover(day, month)}
                onMouseLeave={() => setHoverDate(null)}
              >
                {day}
              </button>
            ) : (
              <div className="w-9 h-9" />
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div ref={panelRef} className="relative">
      {/* ── Summary bar (toggle) ─────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 dark:hover:bg-slate-600 transition-colors text-slate-700 dark:text-slate-200 min-w-[220px]"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-slate-500 dark:text-slate-400 shrink-0">
          <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1.5 3.5h11.5c.69 0 1.25.56 1.25 1.25v.5H3v-.5c0-.69.56-1.25 1.25-1.25zM3 8.25v7c0 .69.56 1.25 1.25 1.25h11.5c.69 0 1.25-.56 1.25-1.25v-7H3z" clipRule="evenodd" />
        </svg>
        <span className="flex-1 text-left">{summaryText}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-4 w-4 text-slate-500 dark:text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {/* ── Calendar panel ───────────────────────────────────────── */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-2 z-50 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-700 shadow-lg dark:shadow-slate-900/50 dark:shadow-slate-900/50 p-4 w-full min-w-[320px] sm:min-w-[580px]">
          {/* Dual calendar months */}
          <div className="hidden sm:grid sm:grid-cols-2 sm:gap-6">
            <div>{renderMonth(leftMonth, leftGrid, true)}</div>
            <div>{renderMonth(rightMonth, rightGrid, false)}</div>
          </div>

          {/* Single calendar on small screens */}
          <div className="sm:hidden">
            {renderMonth(leftMonth, leftGrid, true)}
          </div>

          {/* Separator */}
          <div className="border-t border-slate-200 dark:border-slate-700 my-3" />

          {/* Quick-select shortcuts */}
          <div className="flex flex-wrap gap-1.5">
            {QUICK_SELECTS.map((qs) => {
              const active = isQuickActive(qs.label);
              return (
                <button
                  key={qs.label}
                  type="button"
                  onClick={() => {
                    onDateChange(qs.getRange());
                    // Update base month to match the selected range
                    const range = qs.getRange();
                    const parsed = parseDate(range.dateFrom || range.dateTo);
                    if (parsed) {
                      setBaseMonth({ year: parsed.year, month: parsed.month });
                    }
                  }}
                  className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                    active
                      ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700"
                      : "border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {qs.label}
                </button>
              );
            })}
          </div>

        </div>
      )}
    </div>
  );
}
