import { describe, it, expect } from "vitest";
import { runAudit } from "../../scripts/audit-patterns";

/**
 * Invariant: every generateCsrfToken() call uses the Cookie header basis,
 * never session.id (docs/codebase-audit-strategy.md §3.3, pattern
 * "csrf-token-basis").
 *
 * Remix's createCookieSessionStorage yields an empty `session.id`, so a token
 * generated from `session.id` never matches one validated against the Cookie
 * header — the token-architecture inconsistency fixed on 2026-07-18.
 */
describe("invariant: CSRF token basis", () => {
  it("no generateCsrfToken(session.id) calls exist in app/", () => {
    const { errors } = runAudit();
    const violations = errors.filter((v) => v.rule === "csrf-token-basis");
    expect(
      violations,
      violations.map((v) => `${v.file}:${v.line} — ${v.message}`).join("\n"),
    ).toHaveLength(0);
  });
});
