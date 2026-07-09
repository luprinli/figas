import { useState, useRef, useEffect, useCallback } from "react";
import { useFetcher } from "@remix-run/react";

/* ── Types ─────────────────────────────────────────────── */

export interface PassengerResult {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  date_of_birth: string;
  clothed_weight_kg: number;
  residency: string;
}

export interface PassengerSearchComboboxProps {
  rowIndex: number;
  isCommitted: boolean;
  defaultValue?: string;
  /** Called when the user selects a passenger from results */
  onSelect: (rowIndex: number, passenger: PassengerResult) => void;
  /** Called to check if a given email is already in the table (duplicate prevention) */
  isDuplicateEmail?: (email: string, currentRowIndex: number) => boolean;
}

/* ── Helpers ───────────────────────────────────────────── */

const inputClass =
  "block w-full rounded-lg border border-slate-300 dark:border-slate-600 px-2 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm dark:shadow-slate-900/20 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

/* ── Component ─────────────────────────────────────────── */

export default function PassengerSearchCombobox({
  rowIndex,
  isCommitted,
  defaultValue = "",
  onSelect,
  isDuplicateEmail,
}: PassengerSearchComboboxProps) {
  const searchFetcher = useFetcher<{ passengers: PassengerResult[] }>();
  const [query, setQuery] = useState(defaultValue);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const activeSearchRowRef = useRef<number | null>(null);

  const results = searchFetcher.data?.passengers ?? [];
  const isSearching = searchFetcher.state === "submitting";

  /* ── Debounced search ────────────────────────────────── */

  const triggerSearch = useCallback(
    (value: string) => {
      if (value.trim().length < 2) {
        setIsOpen(false);
        return;
      }

      if (debounceRef.current) clearTimeout(debounceRef.current);

      debounceRef.current = setTimeout(() => {
        activeSearchRowRef.current = rowIndex;
        const formData = new FormData();
        formData.set("intent", "search_passengers");
        formData.set("query", value.trim());
        searchFetcher.submit(formData, { method: "post" });
      }, 300);
    },
    [rowIndex, searchFetcher]
  );

  /* ── Handle fetcher response ─────────────────────────── */

  useEffect(() => {
    if (!searchFetcher.data || activeSearchRowRef.current !== rowIndex) return;
    setIsOpen(searchFetcher.data.passengers.length > 0);
    setActiveIndex(-1);
  }, [searchFetcher.data, rowIndex]);

  /* ── Close on outside click ──────────────────────────── */

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  /* ── Cleanup debounce on unmount ─────────────────────── */

  useEffect(() => {
    const timer = debounceRef.current;
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  /* ── Handlers ────────────────────────────────────────── */

  function handleInputChange(value: string) {
    setQuery(value);
    if (value.trim().length >= 2) {
      triggerSearch(value);
    } else {
      setIsOpen(false);
    }
  }

  function handleFocus() {
    if (query.trim().length >= 2 && results.length > 0) {
      setIsOpen(true);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < results.length) {
          selectResult(results[activeIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  }

  function selectResult(p: PassengerResult) {
    // Check for duplicate email
    if (isDuplicateEmail?.(p.email, rowIndex)) {
      return; // Don't select — duplicate
    }

    setQuery(`${p.first_name} ${p.last_name}`);
    setIsOpen(false);
    setActiveIndex(-1);
    onSelect(rowIndex, p);
  }

  /* ── Render ──────────────────────────────────────────── */

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        name="passenger_first_name[]"
        defaultValue={defaultValue}
        value={undefined} // Let defaultValue control the uncontrolled input
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        className={inputClass}
        disabled={isCommitted}
        required
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={`passenger-results-${rowIndex}`}
        aria-activedescendant={
          isOpen && activeIndex >= 0
            ? `passenger-result-${rowIndex}-${activeIndex}`
            : undefined
        }
        placeholder="Type to search…"
      />

      {isOpen && (
        <div
          id={`passenger-results-${rowIndex}`}
          role="listbox"
          className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg dark:shadow-slate-900/50 max-h-60 overflow-y-auto"
        >
          {isSearching ? (
            <div className="px-3 py-4 text-sm text-slate-500 dark:text-slate-400 text-center">
              Searching…
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-4 text-sm text-slate-500 dark:text-slate-400 text-center">
              No matching passengers found. Continue typing or enter details manually.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {results.map((p, idx) => (
                <li key={p.id}>
                  <button
                    type="button"
                    id={`passenger-result-${rowIndex}-${idx}`}
                    role="option"
                    aria-selected={idx === activeIndex}
                    onClick={() => selectResult(p)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
                      idx === activeIndex ? "bg-sky-50" : "hover:bg-sky-50"
                    }`}
                  >
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {p.first_name} {p.last_name}
                    </span>
                    <span className="text-slate-500 ml-2">{p.email}</span>
                    {p.phone && (
                      <span className="text-slate-500 ml-2">{p.phone}</span>
                    )}
                    <span className="text-slate-500 ml-2 text-xs">
                      {p.date_of_birth}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
