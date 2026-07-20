import { describe, it, expect } from "vitest";
import { runAudit } from "../../scripts/audit-patterns";

/**
 * Invariant: all repository writes inside transaction callbacks pass the tx
 * client (docs/codebase-audit-strategy.md §3.3, pattern "transaction-isolation").
 *
 * Meta-test against source code, not runtime behavior: the AST scanner walks
 * every `withTransaction(...)` / `db.transaction().execute(...)` callback in
 * app/ and asserts that repository write methods, known write helpers, and
 * sql`INSERT/UPDATE/DELETE` templates receive the transaction client.
 *
 * Regression indicator: FK violations or silently lost writes when a
 * transaction rolls back but out-of-transaction writes persist (the root
 * cause of the 3 successive FK violations fixed on 2026-07-18).
 */
describe("invariant: transaction isolation", () => {
  it("all repository writes inside transactions pass the tx client", () => {
    const { errors } = runAudit();
    const violations = errors.filter((v) => v.rule === "transaction-isolation");
    expect(
      violations,
      violations.map((v) => `${v.file}:${v.line} — ${v.message}`).join("\n"),
    ).toHaveLength(0);
  });
});
