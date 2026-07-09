# FIGAS Check-In Module — Production Implementation Plan

**Version:** 2.0.0
**Date:** 2026-06-05
**Based on:** `docs/checkin-ux-audit-report.md` (Appendix A Scorecard)
**Scope:** Check-in module ONLY — `app/routes/checkin.*`, `app/components/checkin/`, `app/utils/repositories/checkin.ts`, `app/utils/repositories/booking-leg-passenger.ts`
**Non-Scope:** Schedule, bookings, admin, finance, engineer, pilot, operations — not touched by this plan.

---

## 1. GOVERNING PRINCIPLES

### 1.1 Scope Isolation

Every file touched by this implementation is listed in Appendix B of the audit report. **No file outside this list may be modified.** If a change is needed in a non-check-in file, it must be escalated to a separate task with cross-team approval.

| In Scope | Out of Scope (Untouchable) |
|----------|---------------------------|
| `app/routes/checkin.tsx` | `app/routes/bookings.tsx` |
| `app/routes/checkin._index.tsx` | `app/routes/operations.*` |
| `app/routes/checkin.counter.tsx` | `app/routes/admin.*` |
| `app/routes/checkin.pos.tsx` | `app/routes/finance.*` |
| `app/routes/checkin.lookup.tsx` | `app/routes/pilot.*` |
| `app/routes/checkin.freight.tsx` | `app/components/Sidebar.tsx` |
| `app/components/checkin/CashKeypad.tsx` (NEW) | `app/utils/auth.server.ts` |
| `app/components/checkin/CardProcessor.tsx` (NEW) | `app/utils/permissions.server.ts` |
| `app/components/checkin/ConfirmCheckinDialog.tsx` (NEW) | `app/utils/constants.ts` |
| `app/components/checkin/PaymentBreakdown.tsx` (NEW) | `app/utils/scheduling/*` |
| `app/utils/repositories/checkin.ts` | `prisma/schema.prisma` |
| `app/utils/repositories/booking-leg-passenger.ts` | `vite.config.ts` |
| `prisma/schema.prisma` (freight_consignments only) | `package.json` |
| `app/utils/repositories/freight.ts` (NEW) | `app/components/schedule/*` |

### 1.2 Backward Compatibility Non-Negotiables

The following contracts form the public API of the check-in module. They **must survive this implementation unchanged:**

| # | Contract | Location | Consumer(s) |
|---|----------|----------|-------------|
| BC-1 | `checkIn(id: number, checkedInBy: number): Promise<void>` | `booking-leg-passenger.ts:133` | `checkin.counter.tsx`, `checkin.pos.tsx`, `schedule-handlers.server.ts` |
| BC-2 | `update(id, params): Promise<BookingLegPassengerRow>` | `booking-leg-passenger.ts:95` | `checkin.counter.tsx`, `checkin.pos.tsx` |
| BC-3 | `searchBookings(query: string): Promise<BookingSearchResult[]>` | `checkin.ts:131` | `checkin.lookup.tsx` |
| BC-4 | `findPending(): Promise<PendingReminderRow[]>` | `checkin.ts:79` | `checkin.tsx` (layout), `checkin._index.tsx` |
| BC-5 | `getPassengerForCheckin(bookingId, passengerId): Promise<PassengerCheckinDetail \| null>` | `checkin.ts:167` | `checkin.counter.tsx` (implicit) |
| BC-6 | URL: `/checkin?booking=${booking.id}` | `bookings.tsx:158`, `bookings.$bookingId.tsx:618` | External booking routes |
| BC-7 | URL: `/checkin/counter?flightId=${id}` | `checkin.counter.tsx:201` | `checkin.lookup.tsx`, `checkin._index.tsx` |
| BC-8 | URL: `/checkin/counter?bookingId=${id}&passengerId=${id}` | `checkin.lookup.tsx:38,177` | `checkin.lookup.tsx` |
| BC-9 | URL: `/checkin/pos?flightId=X&pax=Y` | `checkin.pos.tsx:55-56` | `checkin.counter.tsx` (potential) |
| BC-10 | URL: `/checkin/lookup` | `checkin.lookup.tsx` | `checkin.tsx` sidebar |
| BC-11 | URL: `/checkin/freight` | `checkin.freight.tsx` | `checkin.tsx` sidebar |
| BC-12 | Permission: `checkin:process`, `checkin:view`, `checkin:manage-reminders` | `constants.ts:104-107` | `checkin.tsx`, `auth.server.ts` |
| BC-13 | Permission: `booking:checkin` | `constants.ts:44` | `bookings.tsx`, `bookings.$bookingId.tsx` |
| BC-14 | Layout route: `checkin.tsx` with `<Outlet />` | `checkin.tsx:70-71` | All child routes |
| BC-15 | `FlightPassenger` interface (in-component type) | `checkin.counter.tsx:38-54` | `CheckinWorkflow` component |
| BC-16 | `LineItem`, `PaymentEntry`, `PaymentRecord` interfaces | `checkin.counter.tsx:21-63` | `CheckinWorkflow`, POS |

### 1.3 Rollout Strategy

All changes ship behind a **zero-configuration feature flag** (environment variable `FIGAS_CHECKIN_V2`). Setting `FIGAS_CHECKIN_V2=true` activates the new code paths. When not set (default), the application runs the existing implementation identically.

```typescript
// checkin.counter.tsx — feature gate pattern
import { isCheckinV2Enabled } from "../utils/checkin/feature-flag";

export default function CheckinCounter() {
  const data = useLoaderData<typeof loader>();
  if (isCheckinV2Enabled()) {
    return <CheckinCounterV2 data={data} />;
  }
  return <LegacyCheckinCounter data={data} />;
}
```

This pattern:
- Allows deployment to production immediately with zero risk
- Enables A/B testing between old and new implementations
- Permits per-user or percentage-based rollout
- Provides instant rollback: unset the env var

---

## 2. PHASED IMPLEMENTATION SCHEDULE

### Phase 0: Safety Net (1 day)

**Objective:** Establish testing infrastructure before touching any production code.

#### Task 0.1: Feature Flag System
- **File:** `app/utils/checkin/feature-flag.ts` (NEW)
- **Contract:**
  ```typescript
  export function isCheckinV2Enabled(): boolean;
  ```
- **Implementation:** Reads `process.env.FIGAS_CHECKIN_V2`, caches result per request
- **Backward compatibility:** Default to `false`, returns `false` when env var is absent
- **Verification:** Unit test for `true/false/missing` cases

#### Task 0.2: Integration Test Baseline
- **File:** `tests/integration/checkin/baseline.test.ts` (NEW)
- **Scope:** Record-and-replay tests of all 16 backward compatibility contracts (BC-1 through BC-16)
- **Test cases:**
  1. `checkIn()` updates `checked_in`, `checked_in_at`, `checked_in_by` correctly
  2. `searchBookings("ABC123")` returns expected `BookingSearchResult`
  3. `findPending()` returns unsent reminders only
  4. `GET /checkin/counter?flightId=1` returns 200 with correct loader data shape
  5. `POST /checkin/counter` with `intent=checkin-with-payment` completes successfully
  6. `GET /checkin/lookup?q=test` returns correct `BookingSearchResult[]`
  7. `getOutstandingBalance(bookingId)` returns correct balance
  8. `getPassengerForCheckin(bookingId, passengerId)` returns correct nested detail
  9. URL redirects: `/checkin?booking=X` → `/checkin/counter`
  10. Permission gating: unauthenticated user → 302 to `/login`
- **Verification:** All must pass against the existing codebase BEFORE any refactoring begins

#### Task 0.3: Unit Test Baseline for Critical Paths
- **File:** `tests/unit/checkin/counter.test.ts` (NEW)
- **Cover:**
  - `excessBaggage` calculation (0kg, exactly 20kg, 25kg)
  - `isBalanced` calculation (exact, overpaid, underpaid)
  - `weightsValid` boundary (19.9kg, 20.0kg, 20.1kg)
  - `FlightPassenger` weight fallback chain (`clothed_weight_kg → clothed_body_weight_kg → 70`)
- **Verification:** All pass against existing code

---

### Phase 1: Critical Bug Fixes & Data Integrity (2 days)

**Objective:** Resolve all P0 audit findings without changing UI appearance.

#### Task 1.1: Extract Shared Components (P0-1)
- **Files created:**
  - `app/components/checkin/CashKeypad.tsx`
  - `app/components/checkin/CardProcessor.tsx`
- **Files modified:**
  - `app/routes/checkin.counter.tsx` — remove inline component definitions, import from shared
  - `app/routes/checkin.pos.tsx` — remove inline component definitions, import from shared
- **Backward compatibility strategy:**
  - CashKeypad accepts `quickAmounts?: number[]` prop (default `[10, 20, 50]` for counter, `[10, 20, 50, 100]` for POS)
  - CardProcessor accepts `mockDelay?: number` prop (default 2000ms)
  - Both components export SAME public props as the inline versions; no behavior change
- **Verification:** Baseline tests (Task 0.2) continue to pass

#### Task 1.2: Transactional Check-In (P0-2)
- **Files modified:** `app/routes/checkin.counter.tsx`, `app/routes/checkin.pos.tsx`
- **Change:** Wrap action handlers in `db.$transaction(async (tx) => { ... })`
- **Contract preserved:** BC-1 (`checkIn()` still called with same args), BC-2 (`update()` still called with same shape)
- **Error handling:** Any exception inside the transaction rolls back ALL writes (weight update + payments + check-in flag)
- **Verification:** Integration test: inject failure after payment writes, verify no orphan payments

#### Task 1.3: Idempotency via Submission ID (P0-3)
- **Files modified:** `app/routes/checkin.counter.tsx`, `app/routes/checkin.pos.tsx`
- **Change:** 
  - Client generates UUID on mount → stored in hidden field `_submission_id`
  - Server checks submission ID against recent submissions (in-memory cache, 60s TTL)
  - Rejects duplicate submission IDs with HTTP 409
- **Contract preserved:** BC-6 through BC-9 unchanged (URL patterns)
- **Verification:** E2E test: double-click "Complete Sale" within 100ms, verify only one check-in recorded

#### Task 1.4: Concurrent Check-In Guard (P0-4, P0-5)
- **Files modified:** `app/routes/checkin.counter.tsx`, `app/routes/checkin.pos.tsx`
- **Change:** 
  - Add `SELECT ... FOR UPDATE` to passenger fetch inside transaction
  - Check `checked_in` flag AFTER acquiring lock, reject if already true
  - Fix weight fallback: `clothed_weight_kg → clothed_body_weight_kg → 70` (already correct in current `bodyWeightKg` mapping at `checkin.counter.tsx:145`)
- **Contract preserved:** BC-1 unchanged, BC-15 unchanged
- **Verification:** Integration test: two concurrent check-ins on same passenger, verify one succeeds and the other gets HTTP 409

#### Task 1.5: Freight Consignments Prisma Model (P0-6)
- **Files modified:** `prisma/schema.prisma`
- **Files created:** `app/utils/repositories/freight.ts` (optional — pattern for future)
- **Change:** Add `freight_consignments` model to schema (matching existing raw SQL columns)
- **Backward compatibility:**
  - Prisma model names match existing column names exactly via `@map("freight_consignments")`
  - Existing raw SQL queries in `checkin.freight.tsx` CONTINUE to work unchanged
  - New model is additive only — no code changes required in freight route
- **Verification:** `npx prisma validate` passes, `npx prisma generate` succeeds, existing freight E2E test passes

---

### Phase 2: Core UX Uplift — Counter (3 days)

**Objective:** Implement P1 recommendations in `checkin.counter.tsx`, gated by feature flag.

#### Task 2.1: Manifest Search (P1-5)
- **File modified:** `app/routes/checkin.counter.tsx` (inside v2 rendering path)
- **Change:**
  - Remove the dead `<select>` dropdown (has only "This Flight" option)
  - Add `<input type="text">` above passenger list
  - Client-side filter: `firstName`, `lastName`, `bookingReference`, `seatNumber`
  - `useMemo` for filtered list to avoid re-renders
- **Contract preserved:** BC-15 (FlightPassenger unchanged)
- **Verification:** E2E test: type 3 chars in search, verify passenger list filters

#### Task 2.2: Inline Validation (P1-2)
- **File modified:** `app/routes/checkin.counter.tsx` (inside v2 rendering path)
- **Change:**
  - Body weight input: `onBlur` validation, red border + "Must be at least 20 kg" message below
  - Baggage weight input: red border when negative, error text
  - Payment balancing: persistent banner showing remaining balance with amber/red color coding
  - Toast notification on payment addition/removal (use existing `Toast.tsx`)
- **Contract preserved:** BC-16 interfaces unchanged
- **Verification:** Unit tests for each validation state

#### Task 2.3: Till Data Relocation (P1-7)
- **File modified:** `app/routes/checkin.counter.tsx` (inside v2 rendering path)
- **Change:**
  - Remove till transaction list from POS column (when no passenger selected)
  - Add "Today's Till" card below the 3-column grid
  - Show timestamp on each till entry
  - POS column when inactive: shows only "Select a passenger to begin" prompt
- **Contract preserved:** No external integration
- **Verification:** E2E test: verify till card visibility below grid

#### Task 2.4: Confirmation Summary (P1-4)
- **File modified:** `app/routes/checkin.counter.tsx` (inside v2 rendering path)
- **Change:**
  - When `isBalanced === true`, show a "Check-In Summary" card above the "Complete Sale" button
  - Summary displays: passenger name, booking ref, weights, charges, payment breakdown
  - Submit button text changes from dual-purpose (error/CTA) to single-purpose "Complete Check-In — £X.XX"
- **Contract preserved:** BC-6 unchanged (URL pattern)
- **Verification:** E2E test: verify summary card appears when balanced

#### Task 2.5: Payment Split Visualization (P1-6)
- **File modified:** `app/routes/checkin.counter.tsx` (inside v2 rendering path)
- **Change:**
  - After payments list: add color-coded pill badges per payment method
  - Each badge shows: method name, amount, percentage of total
  - Cash=emerald, Card=blue, Invoice=purple, Deferred=amber
  - Only visible when `payments.length > 0 && totalPaid > 0`
- **Contract preserved:** BC-16 unchanged
- **Verification:** E2E test: add cash + card payments, verify badges show correct split

#### Task 2.6: Better Error Boundaries (P2-7)
- **File modified:** `app/routes/checkin.counter.tsx`
- **Change:**
  - Replace generic "Something went wrong" with status-specific messages:
    - 400: "Invalid check-in data. Verify weights and payments."
    - 404: "Flight not found. It may have been cancelled."
    - 409: "Already checked in by another agent. Refresh and retry."
  - Add "Return to Counter" link instead of generic "Try Again"
- **Verification:** E2E test: trigger each status code, verify correct message

---

### Phase 3: Core UX Uplift — POS Terminal (2 days)

**Objective:** Implement P1 recommendations in `checkin.pos.tsx`, gated by feature flag.

#### Task 3.1: Shared Component Integration (P0-1 continued)
- **File modified:** `app/routes/checkin.pos.tsx`
- **Change:** Replace inline `CashKeypad` and `CardProcessor` with imports from `app/components/checkin/`
- **Pass `quickAmounts={[10, 20, 50, 100]}`** for POS-specific quick amounts
- **Verification:** Existing POS E2E tests continue to pass

#### Task 3.2: Transactional POS Finalization
- **File modified:** `app/routes/checkin.pos.tsx`
- **Change:** Same `db.$transaction` wrapping as counter (Task 1.2)
- **Verification:** Integration test identical to counter

#### Task 3.3: POS Error Boundaries (P2-7)
- **File modified:** `app/routes/checkin.pos.tsx`
- **Change:** Same improved error messages as counter
- **Verification:** E2E test

---

### Phase 4: Polish & Refinement (2 days)

**Objective:** P2 items — micro-interactions, tooltips, print workflow.

#### Task 4.1: Micro-Interactions (P2-1)
- **Files modified:** `app/components/checkin/CashKeypad.tsx`, `app/routes/checkin.counter.tsx`
- **Changes:**
  - `active:scale-95` on all keypad buttons (already in CashKeypad)
  - `transition-colors duration-150` on passenger list items
  - `animate-pulse` on balance warning banner when remaining > 0
  - Auto-scroll passenger list to newly checked-in item (via `scrollIntoView`)
- **Verification:** Visual regression check (manual or snapshot test)

#### Task 4.2: Tooltips (P2-6)
- **Files modified:** `app/routes/checkin.counter.tsx`
- **Changes:**
  - `title` attribute on Void button: "Clear all payments and charges"
  - `title` attribute on remove-payment button: "Remove this payment"
  - Help text below weight override input: "Recorded in audit log. Required for manual scale entries."
- **Verification:** E2E test: hover over buttons, verify tooltip attribute exists

#### Task 4.3: Print Workflow Gate (P2-8)
- **File modified:** `app/routes/checkin.counter.tsx`
- **Change:** Only show "Print Tags" button when `isBalanced === true` (gate behind payment)
- **Contract preserved:** BC-16 unchanged
- **Verification:** E2E test: verify Print Tags button hidden before payment, visible after

#### Task 4.4: Responsive Keypad (P2-4)
- **File modified:** `app/components/checkin/CashKeypad.tsx`
- **Change:** 
  - Keypad grid: `min-w-[200px]` (up from `w-40`)
  - Keys: `h-10` (up from `h-9`) for touch targets
  - Quick-cash buttons: already share same sizing
- **Verification:** Visual inspection

#### Task 4.5: Gateway Cleanup
- After all P1+P2 tasks verified in v2 mode:
  - Remove feature flag
  - Delete legacy code paths
  - Remove `isCheckinV2Enabled()` function and its file
- **Verification:** All baseline tests (Task 0.2) still pass against v2 code

---

### Phase 5: Testing & Hardening (2 days)

#### Task 5.1: Integration Test Suite
- **Files created:** `tests/integration/checkin/`
  - `checkin-transaction.test.ts` — verify atomicity of check-in action
  - `checkin-concurrency.test.ts` — verify row-locking prevents double check-in
  - `checkin-payment-edge-cases.test.ts` — zero payment, overpayment, split payment
  - `checkin-weight-validation.test.ts` — boundary conditions (19.9, 20.0, 200.0, 0, -1)
  - `checkin-complete-workflow.test.ts` — end-to-end: lookup → select flight → select pax → weigh → pay → confirm
- **Coverage target:** >80% on check-in action handlers and repository methods

#### Task 5.2: E2E Test Expansion
- **File modified:** `tests/e2e/checkin.spec.ts`
- **New tests:**
  - Full counter workflow (auth → select flight → select passenger → enter weights → add payment → confirm)
  - Search and filter passenger manifest
  - Payment split visualization
  - Till summary card
  - Error boundary messages
  - Duplicate submission prevention
- **Verification:** `npx playwright test tests/e2e/checkin.spec.ts` passes

#### Task 5.3: Performance Baseline
- Measure SSR render time for `/checkin/counter?flightId=X` before and after
- Measure action handler latency before and after
- **Regression threshold:** Neither may increase by more than 10%

---

## 3. FILE MANIFEST — WHAT CHANGES, WHAT DOESN'T

### Files Created (8 total)

| File | Phase | Purpose |
|------|-------|---------|
| `app/components/checkin/CashKeypad.tsx` | 1.1 | Shared cash keypad component |
| `app/components/checkin/CardProcessor.tsx` | 1.1 | Shared card processor component |
| `app/components/checkin/PaymentBreakdown.tsx` | 2.5 | Payment split visualization |
| `app/components/checkin/ConfirmCheckinDialog.tsx` | 2.4 | Check-in summary card |
| `app/utils/checkin/feature-flag.ts` | 0.1 | Feature flag system |
| `app/utils/repositories/freight.ts` | 1.5 | Optional freight repository |
| `tests/integration/checkin/baseline.test.ts` | 0.2 | BC contract verification |
| `tests/unit/checkin/counter.test.ts` | 0.3 | Critical path unit tests |

### Files Modified (7 total)

| File | Phases | Type of Change |
|------|--------|---------------|
| `app/routes/checkin.counter.tsx` | 1.1–1.4, 2.1–2.6, 4.1–4.3, 5.1 | Internal refactor + V2 path |
| `app/routes/checkin.pos.tsx` | 1.1–1.4, 3.1–3.3 | Internal refactor + V2 path |
| `app/routes/checkin.tsx` | — | No changes (only if V2 layout needed) |
| `app/routes/checkin._index.tsx` | — | No changes |
| `app/routes/checkin.lookup.tsx` | — | No changes |
| `app/routes/checkin.freight.tsx` | — | No changes (raw SQL still works) |
| `prisma/schema.prisma` | 1.5 | Add `freight_consignments` model only |
| `tests/e2e/checkin.spec.ts` | 5.2 | Expand test coverage |

### Files NEVER Modified (19 touchpoints — read-only contract consumers)

| File | Why Untouched |
|------|--------------|
| `app/routes/bookings.tsx` | Consumes BC-6, BC-13. No internal changes needed. |
| `app/routes/bookings.$bookingId.tsx` | Consumes BC-6. No internal changes needed. |
| `app/components/Sidebar.tsx` | "Check-In" nav link unchanged. |
| `app/components/schedule/FlightCard.tsx` | `check_in_time` display unchanged. |
| `app/utils/auth.server.ts` | `redirectToRoleHome()` unchanged. |
| `app/utils/permissions.server.ts` | Permission checks unchanged. |
| `app/utils/constants.ts` | Permission constants unchanged. |
| `app/utils/scheduling/*` | Check-in events consumed via repository, not direct. |
| `app/routes/operations.*` | Read check-in status via DB, not API. |
| `app/routes/admin.*` | No check-in integration. |
| `app/routes/finance.*` | Reads `payments` table, no API dependency. |
| `app/routes/pilot.*` | No check-in integration. |
| `app/routes/engineer.*` | No check-in integration. |
| `vite.config.ts` | No changes needed for V2. |
| `package.json` | No new dependencies required. |
| All other route files | No check-in integration. |

---

## 4. BACKWARD COMPATIBILITY VERIFICATION MATRIX

Each task is verified against all 16 contracts (BC-1 through BC-16) using the baseline test suite from Task 0.2.

| Task | BC Tests Run | Pass Threshold | Rollback Trigger |
|------|-------------|---------------|-----------------|
| 0.1 Feature flag | All 16 | 16/16 | N/A (baseline) |
| 0.2 Baseline tests | All 16 | 16/16 | N/A (baseline) |
| 0.3 Unit tests | BC-15, BC-16 | 100% | N/A (baseline) |
| 1.1 Extract components | BC-1, BC-2, BC-7, BC-8, BC-9, BC-15 | 6/6 | Any failure |
| 1.2 Transactional | BC-1, BC-2, BC-15 | 3/3 | Any failure |
| 1.3 Idempotency | BC-6, BC-7, BC-8, BC-9 | 4/4 | Any failure |
| 1.4 Concurrency | BC-1, BC-7, BC-9, BC-15 | 4/4 | Any failure |
| 1.5 Freight schema | BC-11 | 1/1 | Any failure |
| 2.1 Manifest search | BC-15 | 1/1 | Any failure |
| 2.2 Inline validation | BC-16 | 1/1 | Any failure |
| 2.3 Till relocation | — (internal only) | — | N/A |
| 2.4 Confirmation | BC-6, BC-7 | 2/2 | Any failure |
| 2.5 Payment split | BC-16 | 1/1 | Any failure |
| 2.6 Error boundaries | BC-14 | 1/1 | Any failure |
| 3.1–3.3 POS tasks | BC-9, BC-12 | 2/2 | Any failure |
| 4.1–4.5 Polish | All 16 | 16/16 | Any failure |
| 5.1 Integration tests | All 16 | 16/16 | Any failure |
| 5.2 E2E expansion | All 16 | 16/16 | Any failure |
| 5.3 Performance | BC-7, BC-9 | <10% regression | >10% regression |
| 5.4 Gateway cleanup | All 16 | 16/16 | Any failure |

---

## 5. RISK REGISTER

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Transaction wrapper breaks existing Prisma queries | Low | High | Use `$executeRawUnsafe` inside `$transaction` — same SQL, just transactional |
| Feature flag incompatibility with Remix SSR | Low | Medium | Env var read happens in loader context (Node.js), not browser |
| Row-level locking (`FOR UPDATE`) not supported by PostgreSQL version | Very Low | High | `FOR UPDATE` is PostgreSQL standard since 8.1 (2005). Confirmed compatible with Neon/Postgres. |
| V2 UI breaks on narrow viewports (mobile) | Medium | Low | Test against 3 breakpoints: 360px, 768px, 1280px |
| CashKeypad/CardProcessor extraction changes component behavior | Low | High | Baseline tests verify exact behavioral parity before accepting extraction |
| Confirmation dialog adds friction, slows down power users | Medium | Medium | Power users can skip by keeping v1 (feature flag off) until v2 proven |
| Prisma `freight_consignments` model validation fails | Low | Low | Additive model — does NOT require existing table to match exactly; Prisma validates only the model definition |

---

## 6. ACCEPTANCE CRITERIA (PER PHASE)

### Phase 0 Acceptance
- [ ] Feature flag gates correctly (V2 off → v1 behavior)
- [ ] 10 baseline integration tests pass against existing codebase
- [ ] 5 unit tests pass against existing codebase
- [ ] `npm run build` succeeds
- [ ] `npx vitest run` passes

### Phase 1 Acceptance
- [ ] `app/components/checkin/CashKeypad.tsx` and `CardProcessor.tsx` exist
- [ ] `checkin.counter.tsx` and `checkin.pos.tsx` use shared components (no inline duplicates)
- [ ] Transaction wrapper present in both action handlers
- [ ] Submission ID field present in both forms
- [ ] `SELECT FOR UPDATE` present in passenger fetch query
- [ ] `freight_consignments` model in `prisma/schema.prisma`
- [ ] All 16 BC tests pass
- [ ] `npm run build` succeeds
- [ ] Existing E2E smoke tests pass

### Phase 2 Acceptance
- [ ] Text search replaces dead dropdown in passenger manifest
- [ ] Inline validation messages visible on body weight < 20kg
- [ ] Till transactions moved to dedicated card below 3-column grid
- [ ] Confirmation summary card visible when balanced
- [ ] Payment split badges visible (method/amount/percentage)
- [ ] Error boundaries show status-specific messages
- [ ] All 16 BC tests pass
- [ ] v2 rendering path activated only when `FIGAS_CHECKIN_V2=true`

### Phase 3 Acceptance
- [ ] POS uses shared CashKeypad and CardProcessor
- [ ] POS action handler wrapped in transaction
- [ ] POS error boundaries match counter error boundaries
- [ ] BC-9 contract verified

### Phase 4 Acceptance
- [ ] `active:scale-95` present on keypad buttons
- [ ] `title` attributes present on icon-only buttons
- [ ] Print Tags button hidden until payment balanced
- [ ] Keypad `min-w-[200px]`
- [ ] Feature flag removed, legacy code deleted
- [ ] All 16 BC tests pass against V2-only code

### Phase 5 Acceptance
- [ ] 5 integration test files exist and pass
- [ ] E2E test suite expanded to 10+ tests
- [ ] Server-render time <10% regression baseline
- [ ] Action handler latency <10% regression baseline
- [ ] `npm run build` succeeds
- [ ] `npx vitest run` — all tests pass
- [ ] `npx playwright test tests/e2e/checkin.spec.ts` — all pass

---

## 7. APPENDIX: Integration Point Reference Card

Quick reference for developers working on the implementation. Any change that touches one of these contracts requires re-running the corresponding baseline test.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CHECK-IN MODULE PUBLIC API                       │
├─────────────┬───────────────────────────────────────────────────────┤
│ REPOSITORIES │                                                       │
│  checkIn(id,                      → booking-leg-passenger.ts:133    │
│          checkedInBy): void                                          │
│  update(id, params)               → booking-leg-passenger.ts:95     │
│  searchBookings(query)            → checkin.ts:131                  │
│  findPending()                    → checkin.ts:79                   │
│  getPassengerForCheckin(bId,pId)  → checkin.ts:167                  │
│  getOutstandingBalance(bId)       → checkin.ts:225                  │
│  recordPayment(bId,amt,mtd,ref)   → checkin.ts:240                  │
├─────────────┼───────────────────────────────────────────────────────┤
│ URL PATTERNS │                                                       │
│  /checkin?booking={id}            → bookings.tsx:158                │
│  /checkin/counter?flightId={id}   → internal redirect               │
│  /checkin/counter?bookingId={id}  → checkin.lookup.tsx:38           │
│               &passengerId={id}                                      │
│  /checkin/pos?flightId={}&pax={}  → internal only                   │
│  /checkin/lookup                  → sidebar nav                     │
│  /checkin/freight                 → sidebar nav                     │
├─────────────┼───────────────────────────────────────────────────────┤
│ PERMISSIONS │                                                       │
│  checkin:process                  → constants.ts:105                │
│  checkin:view                     → constants.ts:104                │
│  checkin:manage-reminders         → constants.ts:106                │
│  booking:checkin                  → constants.ts:44                 │
├─────────────┼───────────────────────────────────────────────────────┤
│ INTERFACES  │                                                       │
│  FlightPassenger                  → checkin.counter.tsx:38-54       │
│  LineItem                         → checkin.counter.tsx:21-28       │
│  PaymentEntry                     → checkin.counter.tsx:30-36       │
│  PaymentRecord                    → checkin.counter.tsx:56-63       │
│  BookingSearchResult              → checkin.ts:23-36                │
│  PassengerCheckinDetail           → checkin.ts:38-61                │
│  BookingLegPassengerRow           → booking-leg-passenger.ts:4-21   │
└─────────────┴───────────────────────────────────────────────────────┘
```

---

*End of Implementation Plan — v2.0.0*
