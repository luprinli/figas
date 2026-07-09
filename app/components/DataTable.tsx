import { useState, useCallback, useRef, useEffect } from "react";
import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
  sortable?: boolean;
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string | number;
  onRowClick?: (item: T) => void;
  emptyState?: ReactNode;
  className?: string;
  rowClassName?: (item: T) => string | undefined;
  /** Enable multi-column sorting */
  sortable?: boolean;
  /** Initial sort column */
  initialSortColumn?: string;
  /** Initial sort direction */
  initialSortDirection?: "asc" | "desc";
  /** External sort handler */
  onSort?: (column: string, direction: "asc" | "desc") => void;
  /** Current filter values keyed by column key */
  filters?: Record<string, string>;
  /** Filter change handler */
  onFilterChange?: (column: string, value: string) => void;
  /** Row-level actions renderer */
  actions?: (item: T) => ReactNode;
  /** Show filter inputs in header */
  showFilters?: boolean;
}

interface SortState {
  column: string;
  direction: "asc" | "desc";
}

/**
 * A generic data table component with support for sorting, column filtering,
 * and row-level actions.
 */
export default function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyState,
  className,
  rowClassName,
  sortable: enableSorting,
  initialSortColumn,
  initialSortDirection = "asc",
  onSort,
  filters = {},
  onFilterChange,
  actions,
  showFilters,
}: DataTableProps<T>) {
  const [sorts, setSorts] = useState<SortState[]>(() =>
    initialSortColumn ? [{ column: initialSortColumn, direction: initialSortDirection }] : []
  );

  // Debounce timers for filter inputs
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const handleSort = useCallback(
    (columnKey: string) => {
      if (!enableSorting) return;

      setSorts((prev) => {
        const existing = prev.find((s) => s.column === columnKey);
        let newSorts: SortState[];

        if (!existing) {
          // Add new sort (primary)
          newSorts = [{ column: columnKey, direction: "asc" }, ...prev];
        } else if (existing.direction === "asc") {
          // Toggle to desc
          newSorts = prev.map((s) =>
            s.column === columnKey ? { ...s, direction: "desc" as const } : s
          );
        } else {
          // Remove sort
          newSorts = prev.filter((s) => s.column !== columnKey);
        }

        // Notify external handler with primary sort
        if (onSort && newSorts.length > 0) {
          onSort(newSorts[0].column, newSorts[0].direction);
        } else if (onSort) {
          onSort("", "asc");
        }

        return newSorts;
      });
    },
    [enableSorting, onSort]
  );

  const getSortIndicator = (columnKey: string): string | null => {
    const sort = sorts.find((s) => s.column === columnKey);
    if (!sort) return null;
    return sort.direction === "asc" ? "\u25B2" : "\u25BC";
  };

  const isSortActive = (columnKey: string): boolean => {
    return sorts.some((s) => s.column === columnKey);
  };

  const handleFilterChange = useCallback(
    (column: string, value: string) => {
      // Clear existing debounce timer
      if (debounceTimers.current[column]) {
        clearTimeout(debounceTimers.current[column]);
      }

      // Set new debounce timer
      debounceTimers.current[column] = setTimeout(() => {
        onFilterChange?.(column, value);
      }, 300);
    },
    [onFilterChange]
  );

  // Cleanup debounce timers on unmount
  useEffect(() => {
    const timers = debounceTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const hasActions = !!actions;
  const isEmpty = data.length === 0;

  return (
    <div className={["overflow-x-auto", className].filter(Boolean).join(" ")}>
      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={[
                  "px-4 py-3.5 text-left text-sm/5 font-semibold text-slate-900 dark:text-slate-100",
                  isSortActive(column.key) ? "text-blue-600" : "",
                  column.className,
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-sort={
                  isSortActive(column.key)
                    ? sorts.find((s) => s.column === column.key)?.direction === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
              >
                {column.sortable || enableSorting ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 select-none cursor-pointer hover:text-blue-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                    onClick={() => handleSort(column.key)}
                    tabIndex={0}
                    aria-label={`Sort by ${column.header}`}
                  >
                    {column.header}
                    <span
                      className={[
                        "inline-block text-xs",
                        isSortActive(column.key)
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-slate-300 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {getSortIndicator(column.key) ?? "\u25B4\u25BE"}
                    </span>
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    {column.header}
                  </span>
          )}
              </th>
            ))}
            {hasActions && (
              <th
                scope="col"
                className="px-4 py-3.5 text-right text-sm/5 font-semibold text-slate-900 dark:text-slate-100"
              >
                Actions
              </th>
            )}
          </tr>
          {/* Filter row */}
          {showFilters && (
            <tr>
              {columns.map((column) => (
                <th key={`filter-${column.key}`} className="px-4 py-2">
                  <input
                    type="text"
                    placeholder={`Filter ${column.header.toLowerCase()}...`}
                    defaultValue={filters[column.key] ?? ""}
                    onChange={(e) => handleFilterChange(column.key, e.target.value)}
                    className="w-full text-xs px-2 py-1 border border-slate-300 dark:border-slate-600 dark:border-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </th>
              ))}
              {hasActions && <th className="px-4 py-2" />}
            </tr>
          )}
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {isEmpty && emptyState ? (
            <tr>
              <td colSpan={columns.length + (hasActions ? 1 : 0)} className="px-4 py-12 text-center">
                {emptyState}
              </td>
            </tr>
          ) : (
            data.map((item) => (
            <tr
              key={keyExtractor(item)}
              onClick={onRowClick ? () => onRowClick(item) : undefined}
              className={[
                "transition",
                onRowClick
                    ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 dark:hover:bg-slate-700/50"
                  : undefined,
                rowClassName?.(item),
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={[
                    "whitespace-nowrap px-4 py-3 text-sm/5 text-slate-700 dark:text-slate-200",
                    column.className,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {column.render
                    ? column.render(item)
                    : (item as Record<string, unknown>)[column.key] as ReactNode}
                </td>
              ))}
              {hasActions && (
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm/5">
                  {actions(item)}
                </td>
              )}
            </tr>
          )))}
        </tbody>
      </table>
    </div>
  );
}
