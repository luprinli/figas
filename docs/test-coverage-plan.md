# FIGAS Test Coverage Remediation Plan

**Created:** 2026-07-13 | **Status:** Active | **Target:** Full operational lifecycle coverage

---

## Executive Summary

Current test suite: 44 Vitest files (618 tests) + 18 Playwright E2E specs.  
Services/repos tested: 8 of 42 (19%).  
Critical domains with zero unit test coverage: Admin, Maintenance, Pilot EFB, Freight, Notifications.  
E2E gaps: No multi-role workflow tests, no engineer/fueler journeys, no finance reconciliation flow.

This plan addresses all gaps across three layers: Unit (Vitest), Integration (Vitest + DB), and E2E (Playwright).

---

## Phase 1: Unit Test Gap Fill — Services (Priority: Critical)

**Target:** 16 services → 12 tested (75%)

### 1.1 `checklist.service.ts` — Pilot Pre-Flight Checklist
- 20 built-in checklist items across 4 categories (Pre-Flight, Safety, Briefing, Operations, Startup)
- Pure DB operations: initialize, load, toggle, getCompletionPercentage, completeFlight
- **Tests (8):** initialize creates defaults, idempotent re-init, toggle mark/unmark, completion calc, completeFlight marks all, DB error returns empty, category grouping
- **Estimated effort:** 1h

### 1.2 `flight-plan.service.ts` — Flight Plan Builder
- Assembles flight plan from flights + flight_legs + aerodromes + weight_balance
- Computes distance/heading/fuel per leg, returns structured FlightPlanDetails
- **Tests (10):** empty plan for missing flight, single-leg plan, multi-leg plan with distances, fuel breakdown included, weather summary, NOTAMs, null handling for missing aerodromes, DB error paths
- **Estimated effort:** 1.5h

### 1.3 `fare-calculator.server.ts` — Fare Computation Engine
- Calculates per-leg fares from fare_routes, aggregates by passenger count, adds freight/baggage surcharges
- Pure logic with DB lookups via fareRouteRepository
- **Tests (12):** single-leg fare, multi-leg aggregation, null route → default fare, freight surcharge per kg, discount application (resident/tourist/child), zero passengers edge case, negative amounts rejected
- **Estimated effort:** 1.5h

### 1.4 `export.service.ts` — CSV/XML Export Engine
- Generates daily sales, tax reports, aged receivables, bank reconciliation exports
- 427-line service with complex SQL aggregation
- **Tests (15):** CSV daily sales generation, XML format, date range filtering, record count tracking, export log write, empty dataset handling, DB error propagation, format validation
- **Estimated effort:** 2h

### 1.5 `reminder.service.ts` — Payment Reminder Engine
- Schedules, processes, and sends payment reminders for overdue invoices
- Integrates with email service
- **Tests (10):** schedule single reminder, process pending reminders, send email on process, skip already-sent, handle booking not found, cancel reminders for booking, error handling, empty pending list
- **Estimated effort:** 1.5h

### 1.6 `efb-notification.service.ts` — Pilot Notification Service
- Sends notifications to pilots (assignment updates, schedule changes, fuel status)
- **Tests (8):** assignment notification, schedule change notification, fuel status notification, notification deduplication, DB error handling, batch notification, read status tracking
- **Estimated effort:** 1h

**Phase 1 Total:** 6 services, ~63 tests, ~8.5h effort

---

## Phase 2: Unit Test Gap Fill — Repositories (Priority: High)

**Target:** 26 repos → 8 tested (31%)

### 2.1 `pilot-assignment.ts` — Pilot Crew Assignment CRUD
- Core scheduling subdomain: assign, confirm, decline, list by flight/schedule
- **Tests (8):** create assignment, confirm, decline with reason, list by schedule, list by pilot, duplicate prevention, FK constraint handling, status transitions
- **Estimated effort:** 1h

### 2.2 `schedule.ts` — Schedule CRUD + Pipeline
- Status lifecycle: draft → building → approved → published → completed/cancelled
- **Tests (12):** create schedule, approve, publish, cancel, status transition validation, find by date, find by status, created_by FK, notes persistence, date uniqueness, delete with cascade check
- **Estimated effort:** 1.5h

### 2.3 `flight.ts` + `flight-leg.ts` — Flight & Leg Repositories
- Flight CRUD with aircraft/pilot/schedule FK chains, leg sequencing
- **Tests (10 flight + 8 leg):** create flight with legs, find by schedule, update status, assign aircraft, update weights, leg reordering, leg status updates, cascade delete
- **Estimated effort:** 2h combined

### 2.4 `checkin.ts` — Check-In Repository
- PER-leg passenger check-in, boarding, payment collection at counter
- **Tests (10):** find passengers for check-in, mark checked_in, mark boarded, uncheck-in, payment recording, weight validation lookups, freight receiving
- **Estimated effort:** 1.5h

### 2.5 `stripe-payment.ts` — Stripe Payment Tracking
- Session creation, payment intent tracking, webhook event processing
- **Tests (8):** create session record, update payment intent, webhook status transitions, idempotency key handling, refund tracking, error state storage
- **Estimated effort:** 1h

### 2.6 `aircraft.ts` + `aerodrome.ts` — Fleet & Airport Repos
- Admin CRUD operations for reference data
- **Tests (6 aircraft + 6 aerodrome):** create, update, soft-delete, find active, find by code, unique constraint handling, scheduling extensions (mtow/mlw/fuel)
- **Estimated effort:** 1.5h combined

**Phase 2 Total:** 8 repos, ~74 tests, ~9.5h effort

---

## Phase 3: Integration Test Expansion (Priority: High)

### 3.1 Admin PBAC Workflow Integration
- End-to-end PBAC: create user → assign role → verify permission → revoke role → verify denied
- File: `tests/integration/admin/pbac-lifecycle.test.ts` (~8 tests)
- **Estimated effort:** 1.5h

### 3.2 Finance Reconciliation Integration
- End-to-end: create payment → create bank transaction → auto-match → verify matched → flag discrepancy → import batch
- File: `tests/integration/finance/reconciliation-flow.test.ts` (~10 tests)
- Uses existing `withRollback()` isolation pattern
- **Estimated effort:** 2h

### 3.3 Check-In Counter Integration (DB-backed)
- Currently only pure-logic integration tests — add DB-backed tests using factories
- File: `tests/integration/checkin/counter-db.test.ts` (~8 tests)
- Tests: find passengers by booking ref, check-in, board, weight validation against aircraft limits, payment recording
- **Estimated effort:** 1.5h

### 3.4 Fuel Order Lifecycle Integration
- Issue fuel order → update status → confirm uplift → verify fueler audit trail
- File: `tests/integration/pilot/fuel-order-lifecycle.test.ts` (~6 tests)
- **Estimated effort:** 1h

### 3.5 Data Integrity Regression Suite
- Verify all 15 FK relationships are intact post-operations
- Verify booking_leg_passengers junction is never orphaned
- Verify weight_balance_snapshots match flight_legs 1:1
- File: `tests/integration/data-integrity/regression.test.ts` (~12 tests)
- **Estimated effort:** 2h

**Phase 3 Total:** 5 specs, ~44 tests, ~8h effort

---

## Phase 4: Playwright E2E — Multi-Role Workflow Tests (Priority: Critical)

### 4.1 Pilot EFB Complete Journey (`pilot-efb-workflow.spec.ts`)
**Role:** Pilot (login as `pilot1@figas.gov.fk`)

Test the full pilot operational lifecycle:
```
1. Pilot logs in → sees assigned flights on dashboard
2. Opens flight detail → Overview tab shows route, aircraft, schedule
3. Accepts flight assignment → status changes to "confirmed"
4. Opens Plan tab → verifies fuel breakdown, distances, waypoints
5. Opens Briefing tab → verifies W&B is within limits, manifest loads
6. Completes pre-flight checklist → 20 items checkable, progress bar updates
7. Issues fuel order → fuel request appears, status = "issued"
8. Opens Ops tab → enters actual ATD, verifies pax/baggage counts
9. Opens Log tab → submits post-flight log (block time, landings, fuel used)
10. Reports a defect → defect appears in maintenance queue
11. Verifies flight status → "completed" after all steps
```
**Tests:** 11 scenarios | **Estimated effort:** 3h

### 4.2 Fueler Role Workflow (`fueler-workflow.spec.ts`)
**Role:** Fueler (login as `engineer@figas.gov.fk` — engineer role has fuel:execute permission)

```
1. Fueler logs in → sees pending fuel orders
2. Views fuel order details → requested amount, aircraft, flight number
3. Records actual fuel uplift → enters amount, confirms
4. Verifies fuel order status → "completed"
5. Adds fueler notes → "Uplift complete, no issues"
6. Verifies fuel audit trail → order history shows pilot request + fueler confirmation
```
**Tests:** 6 scenarios | **Estimated effort:** 1.5h

### 4.3 Engineer Maintenance Workflow (`engineer-workflow.spec.ts`)
**Role:** Engineer (login as `engineer@figas.gov.fk`)

```
1. Engineer logs in → sees fleet dashboard
2. Views airframe hours → total hours, next check due, days remaining
3. Views defect queue → open and deferred defects listed
4. Rectifies a defect → enters rectification notes, marks resolved
5. Verifies defect status → "rectified"
6. Views maintenance tasks → scheduled inspections
```
**Tests:** 6 scenarios | **Estimated effort:** 1.5h

### 4.4 Admin CRUD Workflow (`admin-crud.spec.ts`)
**Role:** Admin (login as `admin@figas.gov.fk`)

```
1. Admin logs in → admin panel loads
2. Manages aerodromes → create, edit runway length, deactivate
3. Manages aircraft → add new registration, update seat count
4. Manages fare routes → create new route, set base fare, verify appears
5. Manages fuel rules → add rule for flight time/sectors
6. Manages users → create new user, assign role, verify permissions
7. Manages no-fly days → add one-off date, verify blocked in schedule
8. Manages system settings → update key, verify new value
```
**Tests:** 8 scenarios | **Estimated effort:** 2h

### 4.5 Finance Reconciliation E2E (`finance-reconciliation.spec.ts`)
**Role:** Finance (login as `finance@figas.gov.fk`)

```
1. Finance user logs in → sees finance dashboard
2. Views invoices list → issued, paid, overdue statuses visible
3. Views bank transactions → imported transactions with match status
4. Manually matches a transaction → selects payment, confirms match
5. Auto-matches transactions → system pairs by amount + reference
6. Views reconciliation report → matched/unmatched counts, totals
7. Flags a discrepancy → adds notes, status changes to "disputed"
8. Exports daily sales CSV → verifies download, record count
```
**Tests:** 8 scenarios | **Estimated effort:** 2h

### 4.6 Cross-Role Booking-to-Completion Journey (`end-to-end-journey.spec.ts`)
**Roles:** Passenger → Operations → Pilot → Checkin → Finance

This is the "golden path" test that validates the entire system:

```
1. PASSENGER: Creates booking (STY→MPA, 2 passengers, return)
2. OPS: Auto-builds schedule, assigns booking to flight
3. OPS: Publishes schedule → passengers receive flight assignment
4. PILOT: Accepts flight, completes pre-flight, issues fuel
5. FUELER: Records fuel uplift
6. CHECKIN: Checks in passengers, collects payment, assigns seats
7. PILOT: Submits post-flight log, reports minor defect
8. ENGINEER: Rectifies defect, updates airframe hours
9. FINANCE: Generates invoice, matches bank transaction
10. VERIFY: Referential integrity check across all junction tables
```
**Tests:** 10 scenarios | **Estimated effort:** 3h

**Phase 4 Total:** 6 specs, ~49 scenarios, ~13h effort

---

## Phase 5: Accessibility & Resilience (Priority: Medium)

### 5.1 Keyboard Navigation (`accessibility-keyboard.spec.ts`)
- Tab order through schedule board, booking form, check-in counter
- Focus indicators visible on all interactive elements
- Drag-and-drop alternatives via keyboard (existing in schedule)
- **Estimated effort:** 1h

### 5.2 Error Boundary & Resilience (`resilience.spec.ts`)
- 404 page for invalid routes
- 500 error page when DB is unreachable (simulated)
- Form validation errors display inline
- Session expiry redirects to login
- CSRF protection blocks unauthenticated POSTs
- **Estimated effort:** 1.5h

### 5.3 Multi-User Session Isolation (`session-isolation.spec.ts`)
- Two browser contexts → two different users → verify data isolation
- Pilot A cannot see Pilot B's flight assignments
- Passenger cannot access admin routes
- Finance cannot publish schedules
- **Estimated effort:** 1.5h

**Phase 5 Total:** 3 specs, ~15 scenarios, ~4h effort

---

## Phase 6: Page Object Model Expansion (Priority: Medium)

Create page objects for pages currently using raw locators:

| Page Object | Covers | Est. Effort |
|-------------|--------|-------------|
| `BookingPage` | Booking list, new booking form, booking detail | 1h |
| `CheckinPage` | Booking search, passenger list, check-in actions, payment modal | 1.5h |
| `FinancePage` | Invoices list, payments, reconciliation, bank transactions, exports | 1.5h |
| `AdminPage` | Aerodromes, aircraft, fare routes, fuel rules, users, settings, no-fly | 2h |
| `PilotEfbPage` | Flight detail with tabs, checklist, fuel orders, ops, log, defects | 2h |
| `EngineerPage` | Fleet dashboard, airframe hours, defects queue, maintenance tasks | 1.5h |

**Phase 6 Total:** 6 page objects, ~9.5h effort

---

## Phase 7: CI/CD & Quality Gates (Priority: Medium)

### 7.1 Coverage Threshold Enforcement
- Configure Vitest coverage thresholds in `vitest.config.ts`
- Services: minimum 60% (currently 38%)
- Repositories: minimum 30% (currently 8%)
- E2E: smoke test gate (health + auth must pass before full suite)

### 7.2 Flaky Test Detection
- Enable Playwright retries with `--repeat-each 3` in CI
- Tag known-flaky tests with `@flaky` annotation for investigation

### 7.3 Test Data Factory Parity
- Ensure all test factories in `tests/fixtures/factories.ts` match actual DB schema
- Add factories for: fuel_orders, defects, freight_consignments, flight_manifests, airframe_hours
- **Estimated effort:** 2h

---

## Summary: Effort & Timeline

| Phase | Description | Tests | Specs | Est. Hours |
|-------|-------------|-------|-------|------------|
| 1 | Unit: Services (6 files) | ~63 | 6 | 8.5h |
| 2 | Unit: Repositories (8 files) | ~74 | 8 | 9.5h |
| 3 | Integration: DB-backed flows | ~44 | 5 | 8h |
| 4 | E2E: Multi-role Playwright | ~49 | 6 | 13h |
| 5 | E2E: Accessibility & Resilience | ~15 | 3 | 4h |
| 6 | Page Object Model Expansion | — | 6 | 9.5h |
| 7 | CI/CD & Quality Gates | — | — | 2h |
| **Total** | | **~245** | **34** | **54.5h** |

### Milestone Targets

| Milestone | After Phase | Coverage (Svc+Repo) | E2E Scenarios |
|-----------|-------------|---------------------|---------------|
| M1: Core Unit Coverage | 1+2 | 16/42 (38%) | 18 existing |
| M2: Integration Layer | 1+2+3 | 16/42 (38%) | 18 existing |
| M3: Full E2E Workflows | 1+2+3+4 | 16/42 (38%) | 67 total |
| M4: Production-Ready | All phases | 16/42 (38%) + POMs + CI | 82 total |

### Execution Order Recommendation

1. **Phase 1** (services) first — highest value per hour, unlocks understanding of service contracts
2. **Phase 4** (E2E workflows) next — validates end-to-end operational lifecycle against real UI
3. **Phase 2** (repositories) — backfill data layer tests
4. **Phase 3** (integration) — connect unit and E2E layers
5. **Phase 6** (POMs) — reduce E2E maintenance cost
6. **Phases 5+7** — polish and gate enforcement
