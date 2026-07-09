import { useState, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import DataTable from "./DataTable";
import type { Column } from "./DataTable";

export interface DataGridProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string | number;
  /** Enable sort (default true). Pass false for static tables. */
  enableSort?: boolean;
  /** Enable column filters (default true). Pass false for static tables. */
  enableFilters?: boolean;
  /** Initial sort column */
  initialSortColumn?: string;
  /** Initial sort direction */
  initialSortDirection?: "asc" | "desc";
  /** External sort handler — when provided, DataGrid defers to server-side sort */
  onSort?: (column: string, direction: "asc" | "desc") => void;
  /** Current filter values (for server-side filtering) */
  filters?: Record<string, string>;
  /** Filter change handler (for server-side filtering) */
  onFilterChange?: (column: string, value: string) => void;
  /** Row highlight class */
  rowClassName?: (item: T) => string | undefined;
  /** Row-level actions */
  actions?: (item: T) => ReactNode;
  /** Empty state */
  emptyState?: ReactNode;
  /** Row click handler */
  onRowClick?: (item: T) => void;
  /** Container class */
  className?: string;
}

/**
 * A composable data grid component that wraps DataTable with automatic client-side
 * sorting and column filtering. Reduces boilerplate across all tabular views.
 */
export default function DataGrid<T>({
  columns,
  data,
  keyExtractor,
  enableSort = true,
  enableFilters = true,
  initialSortColumn,
  initialSortDirection = "asc",
  onSort: externalSort,
  filters: externalFilters,
  onFilterChange: externalFilterChange,
  rowClassName,
  actions,
  emptyState,
  onRowClick,
  className,
}: DataGridProps<T>) {
  // ── Internal sort state (client-side mode) ──────────────────────────
  const [internalSortColumn, setInternalSortColumn] = useState<string>(
    initialSortColumn ?? columns.find((c) => c.sortable)?.key ?? ""
  );
  const [internalSortDir, setInternalSortDir] = useState<"asc" | "desc">(initialSortDirection);

  const handleSort = useCallback(
    (col: string, dir: "asc" | "desc") => {
      if (externalSort) {
        externalSort(col, dir);
      } else {
        setInternalSortColumn(col);
        setInternalSortDir(dir);
      }
    },
    [externalSort]
  );

  // ── Internal filter state (client-side mode) ────────────────────────
  const [internalFilters, setInternalFilters] = useState<Record<string, string>>({});

  const activeFilters = externalFilters ?? internalFilters;

  const handleFilterChange = useCallback(
    (col: string, val: string) => {
      if (externalFilterChange) {
        externalFilterChange(col, val);
      } else {
        setInternalFilters((prev) => {
          const next = { ...prev };
          if (val) next[col] = val;
          else delete next[col];
          return next;
        });
      }
    },
    [externalFilterChange]
  );

  // ── Client-side sort + filter ───────────────────────────────────────
  const isServerMode = !!(externalSort || externalFilterChange);

  const processedData = useMemo(() => {
    if (isServerMode) return data;

    let items = [...data];

    // Filter
    const filterKeys = Object.keys(activeFilters);
    if (filterKeys.length > 0) {
      items = items.filter((item) =>
        filterKeys.every((key) => {
          const fv = activeFilters[key].toLowerCase();
          const itemVal = String((item as Record<string, unknown>)[key] ?? "").toLowerCase();
          return itemVal.includes(fv);
        })
      );
    }

    // Sort
    if (enableSort && internalSortColumn) {
      items.sort((a, b) => {
        const aVal = String((a as Record<string, unknown>)[internalSortColumn] ?? "");
        const bVal = String((b as Record<string, unknown>)[internalSortColumn] ?? "");
        const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
        return internalSortDir === "asc" ? cmp : -cmp;
      });
    }

    return items;
  }, [data, internalSortColumn, internalSortDir, activeFilters, isServerMode, enableSort]);

  return (
    <DataTable
      columns={columns}
      data={processedData}
      keyExtractor={keyExtractor}
      sortable={enableSort}
      initialSortColumn={initialSortColumn}
      initialSortDirection={initialSortDirection}
      onSort={handleSort}
      showFilters={enableFilters}
      filters={activeFilters}
      onFilterChange={handleFilterChange}
      rowClassName={rowClassName}
      actions={actions}
      emptyState={emptyState}
      onRowClick={onRowClick}
      className={className}
    />
  );
}
