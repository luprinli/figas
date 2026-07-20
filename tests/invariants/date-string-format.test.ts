import { describe, it, expect } from "vitest";
import { toDateString } from "~/types/shared";
import { runAudit } from "../../scripts/audit-patterns";

/**
 * Invariant: repository mappers produce ISO YYYY-MM-DD strings for DATE
 * columns (docs/codebase-audit-strategy.md §3.3, pattern "date-string-coercion").
 *
 * Regression indicator: `String(pgDate)` produces "Wed Jul 22 2026 ..." which
 * breaks every equality comparison against "2026-07-22" (the root cause of
 * auto-build producing 0 flights on 2026-07-18).
 */
describe("invariant: date string format", () => {
  it("toDateString normalizes Date instances to ISO date strings", () => {
    const result = toDateString(new Date("2026-07-22T00:00:00Z"));
    expect(result).toBe("2026-07-22");
    expect(result).not.toContain("GMT");
    expect(result).not.toContain("Jul");
  });

  it("toDateString strips time suffixes from datetime strings", () => {
    expect(toDateString("2026-07-22T14:30:00.000Z")).toBe("2026-07-22");
    expect(toDateString("2026-07-22")).toBe("2026-07-22");
  });

  it("toDateString handles null/undefined like the repository default", () => {
    expect(toDateString(null)).toBe("");
    expect(toDateString(undefined)).toBe("");
  });

  it("no unguarded String(<row>.<DATE column>) coercions exist in app/", () => {
    const { errors } = runAudit();
    const violations = errors.filter((v) => v.rule === "date-string-coercion");
    expect(
      violations,
      violations.map((v) => `${v.file}:${v.line} — ${v.message}`).join("\n"),
    ).toHaveLength(0);
  });
});
