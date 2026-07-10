import { useState, useCallback } from "react";

/* ── parseIndexedFormData ─────────────────────────────── */

/**
 * Parses array-indexed form fields into an array of typed objects.
 *
 * Each field name is passed to `formData.getAll()`, producing a `string[]`.
 * The arrays are zipped by index: `result[i] = { [field1]: all[0][i], [field2]: all[1][i], ... }`.
 *
 * @param formData - The FormData instance from `request.formData()`
 * @param fields   - Array of field names (keys of T) to extract
 * @param options  - Optional: `{ filterEmpty?: boolean }` — if true, rows where all values are empty strings are excluded
 * @returns Array of T objects, one per row
 *
 * @example
 * const legs = parseIndexedFormData<{
 *   leg_origin: string;
 *   leg_destination: string;
 * }>(formData, ["leg_origin", "leg_destination"]);
 * // legs[0].leg_origin === "SCEL"
 */
export function parseIndexedFormData<T extends Record<string, string>>(
  formData: FormData,
  fields: (keyof T)[],
  options?: { filterEmpty?: boolean }
): T[] {
  const columns = fields.map((field) => {
    const name = field as string;
    // Try the plain field name first, then with [] suffix (forms that use
    // name="field[]" need the suffix to match formData.getAll).
    const values = formData.getAll(name) as string[];
    return values.length > 0 ? values : (formData.getAll(name + "[]") as string[]);
  });

  const rowCount = Math.max(...columns.map((col) => col.length), 0);

  const result: T[] = [];

  for (let i = 0; i < rowCount; i++) {
    const row = {} as Record<string, string>;
    let allEmpty = true;

    for (let j = 0; j < fields.length; j++) {
      const value = columns[j][i] ?? "";
      row[fields[j] as string] = value;
      if (value !== "") allEmpty = false;
    }

    if (options?.filterEmpty && allEmpty) continue;

    result.push(row as T);
  }

  return result;
}

/* ── useDynamicFields ─────────────────────────────────── */

interface DynamicFieldsState {
  count: number;
  committed: Set<number>;
  add: () => void;
  remove: (index: number) => void;
  commit: (index: number) => void;
  isCommitted: (index: number) => boolean;
}

/**
 * Manages a dynamic list of rows using only count + committed-set state.
 *
 * - `count`: how many rows to render (React controls only this number)
 * - `committed`: which row indices are "locked" (inputs disabled)
 * - `add()`: appends a new blank row
 * - `remove(index)`: removes a row (decrements count, removes from committed, shifts indices)
 * - `commit(index)`: marks a row as committed; auto-spawns a new row if it's the last
 *
 * @param initialCount - Starting row count (default: 1)
 * @param maxCount     - Optional maximum rows (default: Infinity)
 */
export function useDynamicFields(
  initialCount: number = 1,
  maxCount: number = Infinity
): DynamicFieldsState {
  const [count, setCount] = useState(initialCount);
  const [committed, setCommitted] = useState<Set<number>>(new Set());

  const add = useCallback(() => {
    setCount((c) => Math.min(c + 1, maxCount));
  }, [maxCount]);

  const remove = useCallback((index: number) => {
    setCommitted((prev) => {
      const next = new Set(prev);
      next.delete(index);
      // Shift committed indices after the removed row
      const shifted = new Set<number>();
      for (const k of next) {
        shifted.add(k > index ? k - 1 : k);
      }
      return shifted;
    });
    setCount((c) => Math.max(c - 1, 0));
  }, []);

  const commit = useCallback(
    (index: number) => {
      setCommitted((prev) => new Set(prev).add(index));
      // Auto-spawn a new blank row below this one
      setCount((c) => Math.min(c + 1, maxCount));
    },
    [maxCount]
  );

  const isCommitted = useCallback(
    (index: number) => committed.has(index),
    [committed]
  );

  return { count, committed, add, remove, commit, isCommitted };
}
