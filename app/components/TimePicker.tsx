import { useState, useRef, useEffect, useCallback } from "react";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];
const QUICK_TIMES = ["06:00", "07:00", "08:00", "08:30", "09:00", "10:00", "11:00", "12:00"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}

export default function TimePicker({ value, onChange, label = "Check-in" }: TimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const [hour, minute] = value ? value.split(":").map(Number) : [8, 0];

  const displayTime = value ? value : "--:--";

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

  const selectHour = useCallback(
    (h: number) => {
      onChange(`${pad(h)}:${pad(minute)}`);
    },
    [onChange, minute]
  );

  const selectMinute = useCallback(
    (m: number) => {
      onChange(`${pad(hour)}:${pad(m)}`);
    },
    [onChange, hour]
  );

  const selectQuick = useCallback(
    (time: string) => {
      onChange(time);
      setIsOpen(false);
    },
    [onChange]
  );

  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && hourRef.current) {
      const el = hourRef.current.querySelector(`[data-hour="${hour}"]`) as HTMLElement | null;
      if (el) el.scrollIntoView({ block: "center" });
    }
  }, [isOpen, hour]);

  useEffect(() => {
    if (isOpen && minuteRef.current) {
      const el = minuteRef.current.querySelector(`[data-minute="${minute}"]`) as HTMLElement | null;
      if (el) el.scrollIntoView({ block: "center" });
    }
  }, [isOpen, minute]);

  return (
    <div ref={panelRef} className="relative">
      {/* ── Summary bar (toggle) ─────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-slate-700 dark:text-slate-200"
      >
        <svg
          className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12,6 12,12 16,14" />
        </svg>
        <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500">
          {label}
        </span>
        <span className="font-mono font-bold text-cyan-700 text-xs">
          {displayTime}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-3.5 w-3.5 text-slate-500 dark:text-slate-400 transition-transform shrink-0 ${isOpen ? "rotate-180" : ""}`}
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* ── Dropdown panel ───────────────────────────────────────── */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-2 z-50 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg dark:shadow-slate-900/50 p-4 w-full min-w-[280px]">
          {/* Hour/minute selectors */}
          <div className="flex items-stretch gap-4 mb-3">
            {/* Hour column */}
            <div className="flex-1">
              <div className="mb-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">
                Hour
              </div>
              <div
                ref={hourRef}
                className="h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700"
              >
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    data-hour={h}
                    onClick={() => selectHour(h)}
                    className={`w-full py-1.5 text-sm font-mono text-center transition-colors ${
                      h === hour
                        ? "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-300 font-semibold"
                        : "text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 dark:bg-slate-800"
                    }`}
                  >
                    {pad(h)}
                  </button>
                ))}
              </div>
            </div>

            {/* Separator */}
            <div className="flex items-center pt-5">
              <span className="text-lg font-bold text-slate-300 dark:text-slate-500">:</span>
            </div>

            {/* Minute column */}
            <div className="flex-1">
              <div className="mb-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">
                Min
              </div>
              <div
                ref={minuteRef}
                className="h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700"
              >
                {MINUTES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    data-minute={m}
                    onClick={() => selectMinute(m)}
                    className={`w-full py-1.5 text-sm font-mono text-center transition-colors ${
                      m === minute
                        ? "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-300 font-semibold"
                        : "text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 dark:bg-slate-800"
                    }`}
                  >
                    {pad(m)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Quick presets */}
          <div>
            <div className="mb-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Quick
            </div>
            <div className="grid grid-cols-4 gap-1">
              {QUICK_TIMES.map((time) => {
                const isSelected = time === value;
                return (
                  <button
                    key={time}
                    type="button"
                    onClick={() => selectQuick(time)}
                    className={`px-2 py-1 text-xs font-mono rounded-md border transition-colors ${
                      isSelected
                        ? "border-cyan-400 bg-cyan-50 text-cyan-800 font-semibold"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                    }`}
                  >
                    {time}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
