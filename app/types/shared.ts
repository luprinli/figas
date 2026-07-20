/**
 * Shared branded types and converters used by repository row mappers.
 *
 * Background (docs/codebase-audit-strategy.md §1 Layer 2):
 * `String(value)` on a `Date` returned by the pg driver for DATE columns
 * produces "Wed Jul 22 2026 00:00:00 GMT..." instead of "2026-07-22",
 * silently breaking every downstream date comparison. All repository
 * `toRow` mappers must convert DATE columns via `toDateString()`.
 */

declare const DateStringBrand: unique symbol;

/**
 * An ISO `YYYY-MM-DD` date string produced by `toDateString()`.
 * Assignable to `string`, so existing interfaces keep working; use it in
 * new signatures to require normalized dates at compile time.
 */
export type DateString = string & { [DateStringBrand]: true };

/**
 * Convert a DB value (Date instance or string) to an ISO `YYYY-MM-DD` string.
 *
 * - `Date`   → `toISOString().slice(0, 10)`
 * - `string` → first 10 characters (strips any `T...` time suffix)
 * - `null`/`undefined` → empty string (mirrors the `?? ""` repository default)
 */
export function toDateString(value: unknown): DateString {
  const s =
    value instanceof Date
      ? value.toISOString().slice(0, 10)
      : String(value ?? "").slice(0, 10);
  return s as DateString;
}
