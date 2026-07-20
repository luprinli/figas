# Comprehensive Codebase Audit Strategy

**Date:** 2026-07-18
**Context:** Based on 5 critical bugs discovered in this session — a Date-to-string coercion defect, a multi-stop weight-balance mismatch, 3 successive transaction-isolation FK violations, a CSRF token-architecture inconsistency, and a duplicate-function divergence. All five share a common root: **systematic pattern drift** between what the code intends and what it executes.

---

## 1. Detection Methodology

### 1.1 Automated Detection Layers

#### Layer 1: ESLint Custom Rules (CI Gate)

Five custom ESLint rules targeting the exact bug patterns discovered. Each rule runs in CI and blocks merge if violated.

**Rule A: `no-unsafe-date-string`**
Detects `String(value)` where `value` is a Date-like object (DATE/timestamp column). Flags the pattern and enforces `.toISOString().slice(0,10)` or an explicit `formatDate()` helper.

```typescript
// ❌ flagged
const d = String(row.leg_date);

// ❌ flagged (same pattern — String(Date) produces "Wed Jul 22 2026...")
const d = String(result.rows[0].some_date);

// ✅ allowed
const d = r.leg_date instanceof Date
  ? r.leg_date.toISOString().slice(0, 10)
  : String(r.leg_date).slice(0, 10);
```

**AST signal:** `CallExpression` with `callee.name === "String"` and argument typed as `unknown` or `any` in a repository `toRow` function or query result mapper.

**Rule B: `require-transaction-client`**
Within any `db.transaction().execute(async (tx) => { ... })` callback, flags repository method calls that lack a `tx` parameter in their invocation when the method has a write side effect (INSERT/UPDATE/DELETE).

```typescript
// ❌ flagged — writes outside transaction
await someRepo.create({ flight_id: flight.id });

// ✅ allowed
await someRepo.create({ flight_id: flight.id }, tx);
// ✅ allowed
await sql`INSERT INTO ...`.execute(tx);
```

**AST signal:** `AwaitExpression` whose `callee.object` matches `*Repository` or repository import pattern, and whose arguments exclude the `tx` parameter, AND the call is nested inside a `db.transaction()` callback.

**Rule C: `no-duplicate-function-with-divergent-logic`**
Detects two functions with the same name but different implementations in the same package (or importable in the same scope). This catches the `clusterBookingsByDate` pattern where one version had date normalization and the other didn't.

```typescript
// ❌ flagged — two clusterBookingsByDate with different logic
// app/utils/scheduling/index.ts:535
async function clusterBookingsByDate(date: string) {
  return allClusters.filter((c) => c.date === date);  // no normalization
}
// app/utils/scheduling/cluster-bookings.ts:117
export async function clusterBookingsByDate(date: string) {
  const normalized = date.split("T")[0];
  return allClusters.filter((c) => c.date === normalized);  // has normalization
}
```

**AST signal:** Two `FunctionDeclaration` or `ExportNamedDeclaration` nodes with the same identifier name in different files within the same directory or import chain.

**Rule D: `no-missing-data-testid`**
Flags InteractiveComponent files (dnd-kit draggables, droppables, buttons that trigger mutations) that lack a `data-testid` attribute. Requires at minimum `data-testid` on the root interactive element.

```tsx
// ❌ flagged
<button onClick={handleSubmit}>Generate</button>

// ✅ allowed
<button data-testid="generate-btn" onClick={handleSubmit}>Generate</button>
```

**Rule E: `enforce-exact-match-with-fallback`**
Detects filtering logic where an exact match on two fields (`origin_code === x && destination_code === y`) is used to select items from a parent collection without a fallback for subset/span matching. Flags patterns where a passenger or booking is matched to a route leg by exact origin+dest pair.

```typescript
// ❌ flagged — no fallback for multi-leg bookings
const matchingLeg = legs.find(
  (l) => l.origin_code === booking.origin_code && l.destination_code === booking.destination_code
);

// ✅ allowed — has fallback
const matchingLeg = legs.find(
  (l) => l.origin_code === booking.origin_code && l.destination_code === booking.destination_code
);
if (!matchingLeg) {
  // fallback: origin-only matching, route-index matching, or explicit error
}
```

#### Layer 2: TypeScript Compiler Flags (Build Gate)

Enable strict compiler checks that catch type-level drift before runtime:

```json
{
  "compilerOptions": {
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictFunctionTypes": true,
    "noUncheckedIndexedAccess": true
  }
}
```

**Specific addition:** Add a `Brand<"DateString">` type wrapper for date strings returned from repository `toRow` mappers. Repository interfaces use `DateString` instead of plain `string`:

```typescript
// types/shared.ts
declare const DateStringBrand: unique symbol;
export type DateString = string & { [DateStringBrand]: true };

// repository toRow — enforces ISO format
function toDateString(value: unknown): DateString {
  const s = value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value ?? "").slice(0, 10);
  return s as DateString;
}

// downstream — TypeScript rejects plain string assignment
function clusterBookingsByDate(date: DateString): ClusterResult[] { ... }
// compile error if caller passes `string` instead of `DateString`
```

#### Layer 3: Custom AST Walker (Pre-Commit Hook)

A standalone Node.js script (`scripts/audit-patterns.ts`) that walks the AST of staged files and checks for:

1. **Repository `.execute()` without transaction:** Any `kdb.insertInto(...).execute()` or `kdb.updateTable(...).execute()` call without a preceding `tx` parameter
2. **Direct `response.json()` with `any` cast:** Flagged to enforce typed response deserialization
3. **`as unknown as X` with mismatched `X`:** Verify the cast target matches the source shape

This runs as a pre-commit hook (via `lint-staged` or `husky`) and fails the commit with a descriptive error.

#### Layer 4: Existing Tool Integration

| Tool | Current State | Enhancement |
|------|--------------|-------------|
| ESLint | Running via `npm run lint` | Add 5 custom rules from Layer 1 |
| TypeScript | `npm run typecheck` | Enable `noUncheckedIndexedAccess`, add `DateString` brand |
| Vitest | Running via `npm run test:related` | Add invariant regression tests for each bug pattern fixed |
| Playwright | Running via `npx playwright test` | Add `data-testid` selector rule (Rule D) to enforce selector hygiene |

### 1.2 Manual Review Protocol

Automated tools cannot detect all pattern drift. The following manual reviews run on a schedule:

**Quarterly Architecture Review (2-hour session)**
1. Export all `toRow` / `fromRow` mapper functions and review for consistent type handling
2. Audit all `db.transaction()` boundaries for repository method calls missing `tx`
3. Extract all `loader` functions and verify `csrfToken` generation is consistent (uses Cookie header, not `session.id`)
4. Run `generateCsrfToken` across all loaders and confirm identical input basis

**Per-Feature Code Review Checklist (PR gate)**
When a PR touches scheduling, booking, or check-in code, the reviewer checks:
- [ ] All repository INSERT/UPDATE/DELETE calls inside transactions pass `tx`
- [ ] All date string conversions use `toDateString()` or `.toISOString().slice(0,10)`
- [ ] All route/leg matching logic has a fallback for multi-stop (not just exact origin+dest)
- [ ] All new interactive elements have `data-testid` attributes
- [ ] CSRF token generation uses `request.headers.get("Cookie")` basis, not `session.id`

---

## 2. Audit Scope

### 2.1 Phase 1: Transaction Isolation Boundary Scan (Target: 4 hours)

Scan every `db.transaction().execute(async (tx) => { ... })` block in the codebase. For each, identify all repository method calls and classify them:

| Call Type | Action |
|-----------|--------|
| `someRepo.read()` without `tx` | ✅ Read-only — safe |
| `someRepo.write()` without `tx` | ❌ **Fix required** — must pass `tx` |
| `someRepo.write()` with `tx` | ✅ Safe |
| `sql`... `.execute(tx)` | ✅ Safe |
| `sql`... `.execute()` | ❌ **Fix required** — must use `.execute(tx)` |

**Scope:** All files under `app/` containing `db.transaction()` or importing repository modules.

**Output:** A CSV or Markdown table of all violations with file, line, repository method, and transaction context.

**Script:** Already identifiable via grep:
```bash
rg "\.transaction\(\)" app/ -l | while read f; do
  rg "Repository\.(create|update|delete|insert|assign|save)" "$f" -n
done
```

### 2.2 Phase 2: Date String Conversion Audit (Target: 2 hours)

Scan every `toRow` function and every `String(r.some_date)` pattern across all repositories.

**Scope:** All files matching `app/utils/repositories/*.ts`.

**Script:**
```bash
rg "String\(r\.\w+date" app/utils/repositories/ -n
rg "leg_date.*String|departure_date.*String" app/utils/repositories/ -n
```

Already identified violations (from current session):
- `booking-leg.ts:32` — **FIXED**
- `invoice.ts:42-43` — not yet fixed
- `bank-transaction.ts:33` — not yet fixed
- `accounting-entry.ts:59` — not yet fixed
- `admin.ts:180` — not yet fixed

### 2.3 Phase 3: Exact-Match Without Fallback Scan (Target: 3 hours)

Scan for patterns where `origin_code` and `destination_code` are matched with exact equality without a fallback.

**Scope:** All files under `app/utils/scheduling/` and `app/components/schedule/`.

**Script:**
```bash
rg "origin_code ===.*destination_code ===" app/utils/scheduling/ -n
rg "\.origin_code\s*===\s*\w+\.origin_code\s*&&\s*\w+\.destination_code\s*===\s*\w+\.destination_code" app/ -n
```

### 2.4 Phase 4: CSRF Token Basis Consistency Scan (Target: 1 hour)

Scan every call to `generateCsrfToken()` and verify the argument is `request.headers.get("Cookie")` or `cookieHeader`, not `session.id`.

**Scope:** All `app/routes/` and `app/root.tsx`.

**Script:**
```bash
rg "generateCsrfToken\(" app/ -n -A1
```

### 2.5 Phase 5: Duplicate Function Names Scan (Target: 1 hour)

Scan for functions with identical names but different implementations within the same package.

**Scope:** All `app/` directories.

**Script:**
```bash
# Extract all exported function names, find duplicates across files
rg "^export (async )?function (\w+)" app/ -or '$2' | sort | uniq -d
```

### 2.6 Phase 6: Missing `data-testid` Scan (Target: 2 hours)

Scan all component files for interactive elements (buttons, draggable divs, drop targets) that lack `data-testid`.

**Scope:** All `app/components/` and e2e-accessible pages.

**Script:** Custom AST walker (Layer 3) or manual grep:
```bash
rg "useDraggable|useDroppable|useSortable|onClick|onSubmit" app/components/ -l | while read f; do
  if ! rg "data-testid" "$f" -q; then echo "MISSING: $f"; fi
done
```

---

## 3. Proactive Remediation Plan

### 3.1 Severity Classification

| Severity | Criteria | Fix SLA | Examples from this session |
|----------|----------|---------|---------------------------|
| **P0 — Critical** | FK violations, data corruption, security bypass | Fix immediately, block all merges until resolved | Transaction isolation FK violations, CSRF token mismatch |
| **P1 — High** | Silent data divergence, weight/balance miscalculation, regression in core feature | Fix within current sprint | Date string coercion (auto-build producing 0 flights), weight-balance exact-match |
| **P2 — Medium** | Duplicate code divergence, selector fragility, missing testids | Fix within next sprint | `clusterBookingsByDate` duplicate, missing `data-testid` attributes |
| **P3 — Low** | Non-critical date display issues, enum inconsistency | Backlog, fix during refactor windows | `seed-comprehensive.ts` using non-standard `checked_in` status |

### 3.2 Fix Workflow

```
┌─────────────────┐
│ Phase 1-6 Scan   │ → produces Violation Report
└────────┬────────┘
         ▼
┌─────────────────┐
│ Prioritize        │ → P0/P1 go to sprint; P2/P3 to backlog
└────────┬────────┘
         ▼
┌─────────────────┐
│ Fix + Test        │ → one PR per violation category
└────────┬────────┘
         ▼
┌─────────────────┐
│ Regression Gate   │ → run npm run test:related for affected module
│                   │ → run specific invariant test
│                   │ → run parity E2E test if scheduling-related
└────────┬────────┘
         ▼
┌─────────────────┐
│ ESLint Rule       │ → add a custom rule to prevent regression
│ (if applicable)  │    into the .eslintrc.cjs config
└────────┬────────┘
         ▼
┌─────────────────┐
│ Merge             │
└─────────────────┘
```

### 3.3 Invariant Regression Tests

For each bug pattern fixed, add a deterministic unit test that would catch the regression:

```typescript
// tests/invariants/transaction-isolation.test.ts
test("all repository writes inside transactions pass tx client", async () => {
  // Query: find all db.transaction() blocks and verify internal writes use tx
  // Runs as a meta-test against source code, not runtime behavior
});

// tests/invariants/date-string-format.test.ts
test("toRow produces ISO date strings for date columns", () => {
  const row = { leg_date: new Date("2026-07-22T00:00:00Z") };
  const result = toRow(row);
  expect(result.leg_date).toBe("2026-07-22");
  expect(result.leg_date).not.toContain("GMT");
  expect(result.leg_date).not.toContain("Jul");
});

// tests/invariants/csrf-token-basis.test.ts
test("all generateCsrfToken calls use Cookie header, not session.id", async () => {
  // Meta-test: scan source for generateCsrfToken(session.id) pattern
  const sourceFiles = await glob("app/**/*.{ts,tsx}");
  const violations = sourceFiles.filter((f) => {
    const content = readFileSync(f, "utf-8");
    return /generateCsrfToken\(session\.id\)/.test(content);
  });
  expect(violations).toHaveLength(0);
});
```

### 3.4 CI/CD Integration

The following gates run on every PR:

```
PR Opened
    │
    ▼
┌───────────────────────────────────────────────────┐
│ 1. npm run lint           (ESLint + custom rules)  │
│ 2. npm run typecheck      (TypeScript strict)       │
│ 3. npm run test:related   (Vitest module tests)     │
│ 4. npx tsx scripts/audit-patterns.ts               │
│    (AST walker — new)                               │
└───────────────────────┬───────────────────────────┘
                        ▼
            All pass? ── Yes ──► Merge allowed
                        │
                        No
                        ▼
                  Block merge with report
```

The `scripts/audit-patterns.ts` AST walker runs in under 5 seconds (incremental — only staged files) and catches patterns that ESLint rules haven't been written for yet.

---

## 4. Scalability

### 4.1 Incremental Scan Mode

The AST walker (`scripts/audit-patterns.ts`) accepts `--changed` flag to scan only files modified in the current branch vs `main`:

```bash
# Full scan (pre-release)
npx tsx scripts/audit-patterns.ts

# Incremental scan (per-commit)
npx tsx scripts/audit-patterns.ts --changed
```

This keeps the pre-commit hook under 5 seconds regardless of codebase size.

### 4.2 Pattern Registry

New bug patterns discovered during development are registered in a centralized JSON catalog:

```json
// .kilo/patterns.json
{
  "patterns": [
    {
      "id": "date-string-coercion",
      "description": "String(Date) produces non-ISO format, breaking date comparisons",
      "scanCommand": "rg \"String\\(r\\.\\w+date\" app/utils/repositories/ -n",
      "eslintRule": "no-unsafe-date-string",
      "invariantTest": "tests/invariants/date-string-format.test.ts",
      "discovered": "2026-07-18",
      "severity": "P1"
    },
    {
      "id": "transaction-isolation",
      "description": "Repository write methods called inside db.transaction() without passing tx",
      "scanCommand": "rg \"Repository\\.(create|update|delete|assign)\" app/ -n",
      "eslintRule": "require-transaction-client",
      "invariantTest": "tests/invariants/transaction-isolation.test.ts",
      "discovered": "2026-07-18",
      "severity": "P0"
    }
  ]
}
```

New patterns are added by developers when they discover a novel class of bug. The registry feeds into:
- The AST walker's scan targets
- The ESLint rule generation queue
- The invariant test suite

### 4.3 Periodic Full Re-Scans

A scheduled CI job (weekly, off-peak) runs a full scan of the entire codebase and compares results against the pattern registry. New violations are filed as automated issues:

```yaml
# .github/workflows/weekly-audit.yml
on:
  schedule:
    - cron: "0 3 * * 0"  # Sunday 3 AM UTC
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx tsx scripts/audit-patterns.ts --report=json > audit-report.json
      - uses: actions/upload-artifact@v4
        with:
          name: audit-report
          path: audit-report.json
      - name: Create issues for new violations
        run: npx tsx scripts/create-audit-issues.ts audit-report.json
```

### 4.4 ESLint Rule Evolution Pipeline

When a bug pattern is manually discovered but no custom ESLint rule exists yet, the workflow is:

1. **Capture:** Document the pattern in `.kilo/patterns.json`
2. **Test:** Write an invariant regression test
3. **Automate:** Write a custom ESLint rule, add to `.eslintrc.cjs`
4. **Remove manual check:** Update the PR checklist to remove the now-automated item

This ensures the manual review checklist shrinks over time as automation grows, preventing review fatigue.

### 4.5 Ownership

Each pattern in the registry has an `owner` field pointing to the team or individual responsible for keeping the detection current:

```json
{
  "id": "transaction-isolation",
  "owner": "backend",
  "lastScanned": "2026-07-18",
  "violationCount": 0
}
```

Monthly, each owner reviews their patterns for relevance and adjusts scan criteria.

---

## 5. Implementation Timeline

| Week | Activity | Output |
|------|----------|--------|
| 1 | Run Phase 1-6 scans, produce Violation Report | `docs/audit-violations-01.md` |
| 1 | Write 5 custom ESLint rules (A-E) | `.eslintrc.cjs` extensions |
| 1 | Add `DateString` brand type + `toDateString()` helper | `app/types/shared.ts` |
| 2 | Fix all P0 violations (transaction isolation) | PRs per affected file |
| 2 | Write invariant regression tests | `tests/invariants/*.test.ts` |
| 3 | Fix P1 violations (date strings, weight-balance fallback) | PRs per affected file |
| 3 | Build `scripts/audit-patterns.ts` AST walker | CLI script |
| 4 | Integrate into CI/CD (PR gates + weekly scan) | Workflow YAML files |
| 4 | Create pattern registry `.kilo/patterns.json` | Registry file |
| 5+ | Iterate: capture new patterns, automate, remove manual checks | Ongoing |

---

## Appendix: Bug-to-Pattern Mapping

| Bug Discovered (this session) | Generic Pattern Class | Detection Method | Prevention |
|-------------------------------|----------------------|-----------------|------------|
| `String(r.leg_date)` → non-ISO string | Unsafe Date-to-String coercion | ESLint Rule A + Phase 2 scan | `DateString` brand type + `toDateString()` helper |
| `flightLegRepository.create()` without `tx` | Transaction isolation violation | ESLint Rule B + Phase 1 scan | Repository methods accept `client?: Kysely<DB>` |
| Two `clusterBookingsByDate` with divergent logic | Duplicate function divergence | ESLint Rule C + Phase 5 scan | Import from single source; delete private dupes |
| `origin === leg.origin && dest === leg.dest` no fallback | Exact-match without subset/span fallback | ESLint Rule E + Phase 3 scan | Route stop index algorithm + fallback branch |
| `generateCsrfToken(session.id)` vs `generateCsrfToken(cookieHeader)` | Token basis mismatch | Phase 4 scan | Single basis: `request.headers.get("Cookie")` |
| Missing `data-testid` on interactive components | Selector fragility | ESLint Rule D + Phase 6 scan | Enforce `data-testid` on draggable/droppable/clickable elements |
