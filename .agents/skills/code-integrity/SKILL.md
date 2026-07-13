---
name: code-integrity
description: >-
  Automated enforcement of FIGAS business rule invariants from docs/business-rules.md.
  Detects logic deviation, architectural drift, and regression-prone patterns
  before they reach production. Covers content-based constraints (grep-enforceable),
  test coverage requirements (test-existence checks), and architectural patterns
  (code review guardrails). Run scripts/ci/verify-invariants.js to validate
  all invariants locally or in CI.
author: FIGAS Engineering
---

# Code Integrity Skill

## Overview

This skill defines **automated enforcement mechanisms** for the 18 business rules
documented in [`docs/business-rules.md`](../../docs/business-rules.md).
Every invariant is classified by enforcement mechanism:

| Mechanism | Description | Examples |
|---|---|---|
| **Content constraint** | Grep/AST-based pattern that must NOT exist in specific files | SQL clause must be absent, variable name must be specific |
| **Test coverage** | A test file must exist and contain specific search patterns | `booking-leg-passenger` test must reference `flight_leg_id` |
| **Architectural guardrail** | Review-time rule enforced by documentation, not automation | Column type must match Prisma schema |

---

## Invariant Registry

### Content-Based Constraints (CI-Enforceable)

These invariants are checked by `scripts/ci/verify-invariants.js` using
file-content analysis. A violation means the **pattern exists where it should not**.

#### CI-1: Unassigned Pool Query Must Not Check `bl.flight_id IS NULL`

| Field | Value |
|---|---|
| **Business rule** | RULE 15, RULE 18 |
| **File** | `app/utils/repositories/booking-leg-passenger.ts` |
| **Constraint** | The `findUnassignedByDate` function's WHERE clause must contain `blp.flight_leg_id IS NULL` but must NOT contain `bl.flight_id IS NULL` |
| **Why** | `bl.flight_id` is set by sibling propagation for RULE 16 manifest queries. If the unassigned pool also checks it, passengers on sibling legs disappear from the pool despite never being individually assigned. |
| **Enforcement** | File must contain `blp.flight_leg_id IS NULL`. Must NOT contain `bl.flight_id IS NULL` anywhere in the file. |
| **Regression indicator** | If `bl.flight_id IS NULL` reappears → group booking passengers vanish from unassigned pool after any passenger is assigned |

#### CI-2: Manifest Queries Must Not Filter by `flight_leg_id IS NOT NULL`

| Field | Value |
|---|---|
| **Business rule** | RULE 16 |
| **File** | `app/utils/schedule-handlers.server.ts`, `app/routes/operations.schedule._index.tsx` |
| **Constraint** | No manifest query (identified by `WHERE bl.flight_id = $flightId` or similar) may also contain `blp.flight_leg_id IS NOT NULL` on the same query |
| **Why** | Manifest queries use `booking_legs.flight_id` to aggregate all passengers. Filtering by `flight_leg_id` would exclude passengers assigned via sibling propagation (who have `flight_leg_id = NULL`). |
| **Enforcement** | Content check: no file in the manifest query scope may contain both patterns on adjacent lines (within 5 lines of each other) |
| **Regression indicator** | Passengers appear in fetcher response but disappear on page refresh |

#### CI-3: Optimistic State Must Use Per-Passenger Key

| Field | Value |
|---|---|
| **Business rule** | RULE 17 |
| **File** | `app/routes/operations.schedule._index/route.tsx` |
| **Constraint** | No call to `setOptimisticAssignedIds` may use `booking.booking_leg_id` as the hide-key. All occurrences must use either `booking.id` or `bookingLegPassengerId`. |
| **Why** | Using `booking_leg_id` as the hide-key causes all passengers on the same booking leg to disappear from the unassigned pool when any one is dragged. |
| **Enforcement** | Content check: `setOptimisticAssignedIds` calls must NOT contain `.booking_leg_id` — must use `.id` or `bookingLegPassengerId` |
| **Regression indicator** | Dragging one passenger hides all passengers sharing the same booking leg |

#### CI-4: Schema Column Name Contracts

| Field | Value |
|---|---|
| **Business rule** | RULE 10 |
| **Files** | `scripts/`, `prisma/`, `app/` |
| **Constraint** | Seed scripts and raw SQL must use `clothed_weight_kg` for `booking_leg_passengers` (not `clothed_body_weight_kg`) and `clothed_body_weight_kg` for `booking_passengers` (not `clothed_weight_kg`). Files referencing `booking_passengers` must not reference `created_by` (use `user_id`). |
| **Why** | Column name mismatches cause silent Prisma/PG failures (error code P2010, `ColumnNotFound`). |
| **Enforcement** | Content check: detect table-specific column name violations |
| **Regression indicator** | Seed scripts fail with `PrismaClientKnownRequestError` P2010 |

#### CI-5: `pendingAssignAfterCreateRef` Must Include `bookingLegPassengerId`

| Field | Value |
|---|---|
| **Business rule** | RULE 17 |
| **File** | `app/routes/operations.schedule._index/route.tsx` |
| **Constraint** | The type of `pendingAssignAfterCreateRef` must include `bookingLegPassengerId?: number`, and the push must set it, and the replay loop must read it. |
| **Why** | Without `bookingLegPassengerId`, the buffered assign-booking request assigns all passengers on the booking leg when the create-flight response arrives. |
| **Enforcement** | Content check: the `pendingAssignAfterCreateRef` type annotation must contain `bookingLegPassengerId`; the push call must include `bookingLegPassengerId:`; the replay loop must include `b.bookingLegPassengerId` |
| **Regression indicator** | When two passengers from the same booking are quickly dragged, the second passenger's drag assigns all passengers |

### Test Coverage Constraints (CI-Enforceable)

These invariants require a specific test file to exist and contain test cases
referencing the invariant. Checked by the test coverage verification loop.

#### CI-6: Per-Passenger Assignment Isolation Tests

| Field | Value |
|---|---|
| **Business rule** | RULE 15 |
| **Test file** | `tests/integration/scheduling/unassigned-by-date.test.ts` |
| **Required patterns** | `flight_leg_id`, `blp.flight_leg_id`, `sibling` |
| **What it verifies** | (a) Passenger with `flight_leg_id` set is excluded from unassigned pool. (b) Passenger with `flight_id` set but `flight_leg_id = NULL` remains in pool. |
| **Enforcement** | Test file must exist and contain all search patterns |

#### CI-7: Schema Column Name Tests

| Field | Value |
|---|---|
| **Business rule** | RULE 10 |
| **Test file** | `tests/unit/sanity.test.ts` |
| **Required patterns** | `clothed_weight_kg`, `clothed_body_weight_kg`, `booking_passengers` |
| **What it verifies** | Application imports resolve without Prisma column-not-found errors |
| **Enforcement** | Test file must exist and contain at least 2 of the 3 search patterns |

### Architectural Guardrails (Review-Enforced)

These invariants cannot be automatically detected by grep. They must be verified
manually during code review.

#### AG-1: Two-Column Separation (RULE 18)

- `booking_legs.flight_id` must never be used to determine if a *passenger* is assigned
- `booking_leg_passengers.flight_leg_id` must never be used to determine if a *booking leg* is assigned to a flight
- Any new query or mutation touching either column must reference RULE 18 in comments

#### AG-2: No Self-Loop Bookings (RULE 9)

- Any seed script or booking form that generates `origin_code` and `destination_code` must enforce `origin !== destination`
- New aerodrome-to-aerodrome distance/route logic must handle the `origin === destination` case gracefully

#### AG-3: Payment Balancing Tolerance (RULE 8)

- Check-in payment validation must use `Math.abs(totalDue - totalPaid) < 0.01` (not strict equality)
- Decimal precision must be preserved throughout payment calculations

#### AG-4: No-Fly Day Enforcement (RULE 4)

- All date inputs in no-fly-compatible zones must call `isNoFlyDay()` before proceeding
- Timezone handling must use `AT TIME ZONE 'Atlantic/Stanley'` not UTC offsets

---

## CI Verification Script

Run `scripts/ci/verify-invariants.js` to validate all invariants. The script
exits with code 0 if all invariants pass, code 1 if any fail.

```bash
# Local verification
node scripts/ci/verify-invariants.js

# In CI (GitHub Actions)
node scripts/ci/verify-invariants.js
```

### Script Architecture

The script defines invariants as objects with:
- `id`, `name` — identifier
- `type` — `"content"`, `"test-coverage"`, or `"both"`
- For content type: `file`, `mustContain`, `mustNotContain` patterns
- For test-coverage type: `testFile`, `searchPatterns`

### Adding a New Invariant

1. Identify the business rule in `docs/business-rules.md`
2. Classify as content constraint, test coverage, or architectural guardrail
3. Add to `verify-invariants.js` INVARIANTS array if content or test-coverage
4. Add to SKILL.md if architectural guardrail
5. Document the regression indicator (what happens if the invariant is broken)
6. Run `node scripts/ci/verify-invariants.js` to validate

---

## Development Workflow

### Before Committing Schedule-Related Changes

```bash
# 1. Run invariant check
node scripts/ci/verify-invariants.js

# 2. Run type check
npm run typecheck

# 3. Run lint
npm run lint

# 4. Run full test suite
npm run test

# 5. If any content-based invariant failed, fix the violating code
#    (see the Regression Indicator column in the Invariant Registry)
```

### When Adding a New Query

1. Reference the relevant business rule in a comment
2. Check the invariant registry for applicable constraints
3. If the query touches `booking_leg_passengers`, verify RULE 15 (do not add `bl.flight_id IS NULL` to unassigned queries)
4. If the query touches `booking_legs`, verify RULE 16 (do not add `blp.flight_leg_id IS NOT NULL` to manifest queries)
5. Add a test case to the appropriate test file

### When Refactoring

1. Run `verify-invariants.js` before and after refactoring
2. If a content constraint previously passed but now fails, the refactoring introduced a regression
3. If an invariant's test file changes location, update the `testFile` path in the script

---

## Invariant Enforcement Summary

| Invariant | Rule | Type | CI Automated |
|---|---|---|---|
| CI-1: No `bl.flight_id IS NULL` in unassigned query | RULE 15 | Content | Yes |
| CI-2: No `flight_leg_id IS NOT NULL` in manifest query | RULE 16 | Content | Yes |
| CI-3: Optimistic state uses per-passenger key | RULE 17 | Content | Yes |
| CI-4: Schema column name contracts | RULE 10 | Content | Yes |
| CI-5: Buffer includes `bookingLegPassengerId` | RULE 17 | Content | Yes |
| CI-6: Per-passenger isolation test coverage | RULE 15 | Test | Yes |
| CI-7: Schema column name test coverage | RULE 10 | Test | Yes |
| AG-1: Two-column separation | RULE 18 | Review | No |
| AG-2: No self-loop bookings | RULE 9 | Review | No |
| AG-3: Payment balancing tolerance | RULE 8 | Review | No |
| AG-4: No-fly day enforcement | RULE 4 | Review | No |
