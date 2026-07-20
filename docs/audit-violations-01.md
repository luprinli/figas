# Audit Violation Report 01

**Date:** 2026-07-18
**Source:** Execution of [`docs/codebase-audit-strategy.md`](./codebase-audit-strategy.md) Phases 1–6
**Scanner:** `npx tsx scripts/audit-patterns.ts` (0 errors, 8 warnings after remediation)

---

## Phase 1 — Transaction Isolation Boundary Scan

**Method:** AST classification of every awaited DB call inside all 17 transaction callbacks
(`withTransaction`, `db.transaction().execute`, `kdb.transaction().execute`) across `app/`.

### Violations found and FIXED (P0)

| # | Site | Call | Fix |
|---|------|------|-----|
| 1 | `app/utils/pricing/booking-mutations.server.ts:38` | `bookingPassengerRepository.create(...)` | pass `tx`; method now accepts `client?` |
| 2 | `booking-mutations.server.ts:56` | `computeBookingCost(...)` (writes `line_fare_amount`) | pass `tx`; fn now accepts `client?` |
| 3 | `booking-mutations.server.ts:57` | `updateBookingTotals(...)` | pass `tx`; fn now accepts `client?` |
| 4 | `booking-mutations.server.ts:89` | `bookingPassengerRepository.delete(...)` | pass `tx`; method now accepts `client?` |
| 5 | `booking-mutations.server.ts:91` | `computeBookingCost(...)` — also stale-read of tx-deleted junctions | pass `tx` |
| 6 | `booking-mutations.server.ts:92` | `updateBookingTotals(...)` | pass `tx` |
| 7 | `booking-mutations.server.ts:127` | `bookingLegRepository.create(...)` | pass `tx`; method now accepts `client?` |
| 8 | `booking-mutations.server.ts:148` | `computeBookingCost(...)` — couldn't see tx-inserted junctions | pass `tx` |
| 9 | `booking-mutations.server.ts:149` | `updateBookingTotals(...)` | pass `tx` |
| 10 | `booking-mutations.server.ts:181` | `bookingLegRepository.delete(...)` | pass `tx` |
| 11 | `booking-mutations.server.ts:183` | `findByBookingId(...)` resequencing read — would not see the now-in-tx delete | pass `tx`; method now accepts `client?` |
| 12 | `booking-mutations.server.ts:192-193` | `computeBookingCost` / `updateBookingTotals` | pass `tx` |
| 13 | `app/utils/schedule-handlers.server.ts:465` | `createAuditLogEntry(...)` in `handleCancel` — audit row persisted even if cancel rolled back | pass `tx`; fn now accepts `client?` |
| 14 | `app/utils/scheduling/index.ts:329` | `flightRepository.updateWeights(...)` — **silent 0-row no-op** (target row uncommitted in same tx) | pass `tx`; method now accepts `client?` |
| 15 | `app/utils/scheduling/index.ts:200` | `generateAutoBuildFlightNumber(date)` — fn accepts `tx?` but call site omitted it → duplicate flight numbers within one build | pass `tx` |

**Signature changes (all backward-compatible optional trailing params):**
`bookingPassengerRepository.create/delete`, `bookingLegRepository.create/delete/findByBookingId`,
`computeBookingCost`, `updateBookingTotals`, `createAuditLogEntry`, `flightRepository.updateWeights`
now accept `client?: Kysely<DB>` following the established `assignFlight`/`replaceFlightLegs` pattern.
All other call sites (route-level, outside transactions) are unaffected.

### Read-visibility notes inside `buildSchedule` (documented, NOT fixed — see Suggestions)

These reads run via the pooled connection and cannot see rows written earlier in the same
uncommitted transaction. They require plumbing `tx` through multi-module signatures and
dedicated tests before changing:

| Site | Call | Effect |
|------|------|--------|
| `scheduling/index.ts:140` | `getLegPassengerCountMap` | counts may include junction rows deleted in-tx |
| `scheduling/index.ts:325` | `assignAircraftToRoutes` | flight-overlap check can't see in-tx flights |
| `scheduling/index.ts:355, 413` | `flightLegRepository.findByFlightId` | validation/W&B read in-tx-invisible legs |
| `scheduling/index.ts:425` | `computeWeightBalanceForRoute` | `loadPassengerWeightsForFlight` sees no in-tx booking legs → passenger weights = 0 |
| `scheduling/index.ts:498` | `assignPilotsToRoutes` | duty/rest computed over stale pilot_assignments |

### Clean blocks

`invoice.service.ts:308/558`, `flight.ts:194`, `flight-leg.ts:163`, `migrate.ts:32`, and all 10
`schedule-handlers.server.ts` blocks other than :465 already pass `tx` correctly.

---

## Phase 2 — Date String Conversion Audit

**Method:** DATE columns derived from `prisma/schema.prisma` (`@db.Date`); scanner flags
`String(<row>.<DATE column>)` without `instanceof Date` guard, `.slice(0,10)`, or `toDateString()`.

### Infrastructure added

`app/types/shared.ts` — `DateString` brand type + `toDateString()` helper (strategy §1 Layer 2).

### Violations found and FIXED (P1)

| Site | Column(s) | Notes |
|------|-----------|-------|
| `app/utils/repositories/invoice.ts:42-43` | `issue_date`, `due_date` | doc-listed |
| `app/utils/repositories/bank-transaction.ts:33` | `transaction_date` | doc-listed |
| `app/utils/repositories/accounting-entry.ts:59-60` | `entry_date`, `posting_date` | doc-listed (+ sibling line) |
| `app/utils/repositories/admin.ts:180, 182` | `last_reading_date`, `next_check_date` | doc-listed (+ sibling line) |
| `app/utils/repositories/booking.ts:83` | `payment_due_date` (`@db.Date`) | found by scanner |
| `app/utils/repositories/schedule.ts:32` | `schedule_date` | **found by scanner — same class as the auto-build 0-flights bug** |
| `app/utils/repositories/export-log.ts:23-24` | `date_from`, `date_to` | found by scanner |
| `app/utils/services/passenger-search.service.ts:61, 92` | `date_of_birth` | SQL casts `::text` today (runtime-safe); normalized because `dedupKey` compares this value |

Already fixed pre-audit: `booking-leg.ts:32` (`leg_date`), `booking-passenger.ts:34` (`date_of_birth`, guarded).

**Exempted (safe):** `engineer.defects.tsx:153`, `engineer.maintenance.tsx:43/46` — `new Date(String(x))`
re-parses immediately for display; not a string-comparison hazard.

**P3 backlog (not fixed):** `String(row.created_at)` / timestamp columns across repositories produce
locale strings when pg returns `Date` for `timestamptz`. Display-only today; normalize during refactor windows.

---

## Phase 3 — Exact-Match Without Fallback Scan

4 sites matched `origin_code === ... && destination_code === ...`:

| Site | Verdict |
|------|---------|
| `schedule-handlers.server.ts:782` | OK — full fallback chain (`insertPassengerRoute` → matchingLeg2 → originLeg → NULL) |
| `schedule-handlers.server.ts:823` | OK — part of the same chain |
| `schedule-handlers.server.ts:1122` | OK — origin-only fallback at :1128 |
| `schedule-handlers.server.ts:1490` (`handleTransferBooking`) | **FIXED (P1)** — added origin-only fallback mirroring :1128; previously multi-stop transfers silently left `flight_leg_id` unset |

---

## Phase 4 — CSRF Token Basis Consistency Scan

**CLEAN.** All `generateCsrfToken()` calls use the Cookie-header basis:
`app/root.tsx:35` (`cookieHeader`), `app/utils/csrf-check.server.ts:42` (`cookieHeader`),
`app/utils/csrf.server.ts:53` (internal, parameterized). No `generateCsrfToken(session.id)` remains.
Note: `validateCsrfToken`'s parameter is still *named* `sessionId` — rename suggestion below.

---

## Phase 5 — Duplicate Function Names Scan

29 duplicate non-route-convention names found (P2 — fix next sprint). Highest risk first:

| Risk | Name | Locations |
|------|------|-----------|
| **High** | `requireRole`, `requireAnyRole` | `auth.server.ts:97/110` vs `permissions.server.ts:132/148` — two authorization implementations |
| High | `generateFlightNumber` | `scheduling/config-generator.ts:37` vs `flight-number.server.ts:16` |
| High | `getDistance` | `distance-lookup.ts:118`, `suggest-route.server.ts:107`, `weight-balance/calculator.client.ts:79` |
| Med | `parseDate` | `no-fly.service.ts:345` vs `dates.ts:177` |
| Med | `validateForm`, `getFieldValue`, `isValidDate/Time/Email`, `isPastDate`, `buildCommitted*Summary` | `operations.bookings.new.tsx` vs `operations.bookings.$bookingId.edit.tsx` (8 copied helpers) |
| Med | `todayISO`, `daysFromNow` | `dates.ts` vs `seed.ts` |
| Low | UI: `formatCurrency` (7×), `EmptyState` (4×), `LoadingSkeleton` (4×), `formatDisplayDate` (3×), `formatGbp`, `ErrorBanner`, `StatusDot`, `FuelMetric`, `CashKeypad`, `getInitialBaseMonth`, `extractTokens`, `WeightSummary`, plus route-pair page components | various components/routes |

Per-repository private `toRow`/`dec` mappers are idiomatic per-table code, not divergence risks.
The scanner reports exported duplicates as warnings on every full run.

---

## Phase 6 — Missing `data-testid` Scan

**46 of 51** interactive component files lack `data-testid` (P2 — fix next sprint).
Priority order (dnd-kit + mutation-triggering first):

1. `schedule/DraggableFreightItem.tsx`, `schedule/FlightCard.tsx`, `schedule/UnassignPoolPanel.tsx`, `schedule/AutoBuildPanel.tsx`, `schedule/OptimizationBar.tsx`, `schedule/ValidationBanner.tsx`, `seat-map/SeatMap.tsx`
2. `checkin/CardProcessor.tsx`, `checkin/CashKeypad.tsx`, `checkin/CheckinSidebar.tsx`, `loadsheet/LoadsheetModal.tsx`
3. `booking/*` (5 files), `Button.tsx`, `ConfirmDialog.tsx`, `DataTable.tsx`, pickers, and 20 more (full list via Phase 6 script in strategy doc).

---

## Remediation Summary

| Severity | Found | Fixed | Deferred |
|----------|-------|-------|----------|
| P0 transaction isolation | 15 (14 writes + 1 dup-flight-number read) | **15** | 0 |
| P1 date-string coercion | 13 lines across 8 files | **13** | 0 |
| P1 exact-match fallback | 1 | **1** | 0 |
| P2 duplicate functions | 29 names | 0 | 29 (next sprint) |
| P2 missing data-testid | 46 files | 0 | 46 (next sprint) |
| P3 timestamp `String()` | widespread | 0 | backlog |

### New guardrails in place

- `scripts/audit-patterns.ts` — AST scanner; `--changed` incremental mode; `--report=json`; exit 1 on errors
- `tests/invariants/{transaction-isolation,date-string-format,csrf-token-basis}.test.ts` — regression meta-tests (run by `vitest run`)
- `scripts/ci/patterns.json` — pattern registry (strategy §4.2)
- `app/types/shared.ts` — `DateString` + `toDateString()`
- `tests/global-setup.ts` — restored missing file referenced by `vitest.config.ts:15`; **the entire vitest suite was previously unable to start** (pre-existing breakage discovered during verification)

### Pre-existing failures also remediated (follow-up pass)

| Failure | Root cause | Fix |
|---------|-----------|-----|
| 13 `tsc` errors in `fuel-order.service.ts` | `fuel_orders` table (migration `037_pilot_efb.sql`) was never added to `prisma/schema.prisma`, so generated Kysely types lacked it | Added `fuel_orders` model matching the migration DDL; regenerated types (63 → 64 tables) |
| 1 `tsc` error in `weight-balance/calculator.client.ts:107` | `SeatAssignment` requires `bookingPassengerId`; mapper omitted it | Added `bookingPassengerId: p.id` (mirrors `seat-assignment.ts:65` fallback convention) |
| 4 failures in `tests/integration/scheduling/unassign-booking.test.ts` | Tests predate migration `038-per-passenger-overhaul.sql`, which made `booking_legs.flight_id` a **derived column** (DB trigger recalculates it from junction `flight_leg_id`). Tests set `flight_id` directly but linked passengers with `flight_leg_id = NULL`, so the trigger nulled the assignment and the handler correctly reported "already unassigned" | Test setup updated to the per-passenger model: each test creates a `flight_leg` and links junction rows with `flight_leg_id`; assertions unchanged |

Verification after remediation: `npm run typecheck` — 0 errors; `npm run lint` — clean;
`vitest run` — **685/685 tests pass (53 files)**; `npx tsx scripts/audit-patterns.ts` — 0 errors.

### Deviations from the strategy doc

- Registry lives at `scripts/ci/patterns.json`, not `.kilo/patterns.json` — the `.kilo/` directory is
  reserved for Kilo tool config and rejects arbitrary JSON.
- Read-visibility issues inside `buildSchedule` are documented, not fixed (multi-module `tx` plumbing).

## Suggestions (require explicit approval — config/scope beyond this task)

1. **Custom ESLint rules A–E** (`.eslintrc.cjs`) — config file; equivalent coverage currently provided by the scanner + invariant tests.
2. **`noUncheckedIndexedAccess`** (tsconfig) — expect a large error backlog; enable per-directory or in a dedicated hardening PR.
3. **Pre-commit hook** — wire `npx tsx scripts/audit-patterns.ts --changed` into lint-staged/husky (touches `package.json`).
4. **Weekly audit workflow** (`.github/workflows/weekly-audit.yml`) — CI file; template in strategy §4.3.
5. **Thread `tx` through `buildSchedule` phase helpers** (read-visibility table above) — needs scheduling integration tests first.
6. Rename `validateCsrfToken(token, sessionId)` → `(token, basis)` for clarity.
7. Consolidate `requireRole`/`requireAnyRole` into one module — two auth implementations is the riskiest P2.
