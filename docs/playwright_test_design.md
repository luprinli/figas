# FIGAS End-to-End Playwright Test Suite

**Last Updated:** 2026-07-13
**Status:** Active — 15 E2E spec files, 42 Vitest test files, CI-integrated

---

## 1. Architecture Overview

### 1.1 Existing Infrastructure (What Already Works)

The project has a mature test suite with the following layers:

| Layer | Framework | File Count | Location |
|-------|-----------|------------|----------|
| E2E (browser) | Playwright 1.60 | 15 specs + 2 page objects + 1 helper | `tests/e2e/` |
| Integration | Vitest | 11 specs | `tests/integration/` |
| Unit | Vitest | 26 specs | `tests/unit/` |
| Smoke (import) | Vitest | 5 specs | `tests/smoke/` |
| Fixtures | Vitest | 3 files | `tests/fixtures/` |

**Key files already implemented:**

| File | Purpose |
|------|---------|
| `playwright.config.ts` | Single-browser (chromium), sequential execution, auto-starts Remix dev server |
| `tests/e2e/global-setup.ts` | Logs in as `ops@figas.gov.fk`, saves `auth-state.json` |
| `tests/e2e/global-teardown.ts` | Cleans up auth state and removes test-created data |
| `tests/e2e/pages/BasePage.ts` | Abstract page object with `waitForLoad()`, `getToast()`, `goTo()` |
| `tests/e2e/pages/LoginPage.ts` | Login form interactions for auth flows |
| `tests/e2e/pages/SchedulePage.ts` | Schedule board with date picker, auto-build, approve |
| `tests/e2e/helpers/drag-simulator.ts` | 6 drag-and-drop simulation functions for dnd-kit |
| `tests/fixtures/factories.ts` | DB test factories (schedules, flights, bookings, passengers, W&B) |
| `tests/fixtures/helpers.ts` | `withRollback()`, date utilities |
| `tests/fixtures/seed-data.ts` | Mock aerodromes, aircraft, user IDs |

### 1.2 Recent Enhancements

| Date | Change | Motivation |
|------|--------|------------|
| 2026-07-13 | Added `global-teardown.ts` | Ensures test data cleanup between runs |
| 2026-07-13 | Added `BasePage.ts` base class | Eliminates repeated `waitForLoadState` patterns |
| 2026-07-13 | Added `LoginPage.ts` page object | Reusable auth for multi-role workflow tests |
| 2026-07-13 | Added `health.spec.ts` | System connectivity smoke tests |
| 2026-07-13 | Added `cleanup.spec.ts` | Verifies test isolation and referential integrity |

---

## 2. Backward Compatibility

### 2.1 Do Not Modify Existing Tests

The following existing test files are **proven and should not be rewritten**:

- `tests/e2e/scheduling.spec.ts` — 20+ drag-and-drop scenarios with keyboard accessibility
- `tests/e2e/schedule-workflow.spec.ts` — Full schedule lifecycle (build → approve → publish → loadsheet)
- `tests/e2e/schedule-drag-passenger.spec.ts` — 7 passenger drag-and-drop tests
- `tests/e2e/schedule-drag-validation.spec.ts` — 5 validation tests (weight limits, cross-date, path correctness)
- `tests/e2e/workflows.spec.ts` — 7 domain workflows
- `tests/e2e/workflows/*.spec.ts` — Booking, check-in, scheduling sub-workflows
- All `tests/unit/`, `tests/integration/`, `tests/smoke/` files

### 2.2 Extending Existing Tests

New tests should follow these patterns established by the existing codebase:

1. **Use `Page` directly** (not the page object) for simple assertions
2. **Use `SchedulePage`** for schedule board interactions
3. **Use `helpers/drag-simulator.ts`** for all drag-and-drop operations
4. **Use `--fullyParallel: false`** — tests run sequentially to avoid database conflicts
5. **Use `storageState`** for authentication — no per-test login needed

---

## 3. Test Environment

### 3.1 Running Locally

```bash
# Run all E2E tests
npm run test:e2e

# Run E2E with Playwright UI (visual debugging)
npm run test:e2e:ui

# Run specific test file
npx playwright test scheduling.spec.ts

# Run all tests (Vitest + Playwright)
npm run test:all

# Run only Vitest tests
npm run test
```

### 3.2 CI/CD (GitHub Actions)

**File:** `.github/workflows/e2e.yml`

- Triggers on PRs to `main` that change `app/**`, `tests/e2e/**`, or `playwright.config.ts`
- Daily cron: weekdays at 6 AM UTC
- Runs `npm run migrate && seed:full && seed:pbac && seed:pbac:assign` against PostgreSQL 16
- Uploads Playwright HTML report on failure (7-day retention)
- 20-minute timeout per workflow run

### 3.3 Environment Variables

Configured via `.env` (not `.env.test`):

```
DATABASE_URL=postgresql://postgres:figas2024!@localhost:5432/figas
SESSION_SECRET=dev-session-secret
CSRF_SECRET=dev-csrf-secret
```

For CI:
```
DATABASE_URL=postgresql://figas_test:figas_test@localhost:5432/figas_test
SESSION_SECRET=ci-test-secret-do-not-use-in-prod
CSRF_SECRET=ci-test-csrf-secret
```

---

## 4. Page Object Models

### 4.1 Pattern

All page objects extend `BasePage` which provides:
- `waitForLoad()` — `networkidle` + optional selector
- `getToast()` — toast message text
- `goTo(path)` — navigation + wait

### 4.2 Existing Page Objects

| Class | File | Covers |
|-------|------|--------|
| `BasePage` | `pages/BasePage.ts` | Shared wait/navigation utilities |
| `LoginPage` | `pages/LoginPage.ts` | Email/password login form |
| `SchedulePage` | `pages/SchedulePage.ts` | Schedule board, date picker, auto-build, approval |

### 4.3 Drag-and-Drop Helpers

**File:** `tests/e2e/helpers/drag-simulator.ts`

| Function | Purpose |
|----------|---------|
| `simulateDragDrop(page, dragSelector, dropSelector)` | Generic drag-and-drop |
| `dragBookingToFlight(page, bookingLegId, flightId)` | Booking → Flight card |
| `dragBookingToDraftFlight(page, bookingLegId)` | Booking → Draft placeholder |
| `dragFlightToReorder(page, flightId, targetFlightId)` | Reorder flight cards |
| `dragPassengerToUnassignPool(page, passengerRowSelector)` | Passenger → Unassign |
| `dragBookingBetweenFlights(page, bookingLegId, targetFlightId)` | Reassign between flights |

---

## 5. Test Data Strategy

### 5.1 Global Setup

`global-setup.ts` logs in once and saves `auth-state.json`. All test files use `use: { storageState: "tests/e2e/auth-state.json" }` from the config.

### 5.2 Global Teardown

`global-teardown.ts` removes test-created records matching the `E2E-` prefix and cleans up `auth-state.json`.

### 5.3 Test Isolation

- Each test spec uses unique booking references (`E2E-` prefix)
- Database factories (`tests/fixtures/factories.ts`) use `withRollback()` to never commit test data
- `cleanup.spec.ts` verifies no test data remains and referential integrity is intact

---

## 6. Test Suite Inventory

### 6.1 System Health (`health.spec.ts`)
- Application reachability
- All critical routes return 2xx/3xx
- Database connectivity
- Core UI components render

### 6.2 Authentication (`auth.spec.ts`, `global-setup.ts`)
- Login page renders
- Invalid credentials show error
- Unauthenticated users are redirected
- Session cookie persists via `storageState`

### 6.3 Domain Coverage

| Domain | E2E Test Files |
|--------|---------------|
| Scheduling | `scheduling.spec.ts`, `schedule-workflow.spec.ts`, `schedule-drag-passenger.spec.ts`, `schedule-drag-validation.spec.ts`, `auto-build-automation.spec.ts`, `workflows/scheduling.spec.ts` |
| Bookings | `bookings.spec.ts`, `workflows/bookings.spec.ts`, `workflows.spec.ts` |
| Check-in | `checkin.spec.ts`, `workflows/checkin.spec.ts` |
| Finance | `finance.spec.ts` |
| Admin | `admin.spec.ts` |
| Loadsheet | `flight-loadsheet-consistency.spec.ts` |
| Accessibility | `accessibility.spec.ts` |
| Health | `health.spec.ts` |
| Cleanup | `cleanup.spec.ts` |

---

## 7. Running in CI

```yaml
# .github/workflows/e2e.yml (existing)
- name: Setup database
  run: |
    npx tsx app/utils/migrate.ts
    npm run seed:full
    npm run seed:pbac
    npm run seed:pbac:assign
- name: Run E2E tests
  run: npm run test:e2e
```

---

## 8. Known Limitations

1. **Single browser only** (chromium) — Firefox and WebKit not tested due to `fullyParallel: false` and DB constraints
2. **No Stripe integration tests** — Payment gateway calls use mock/test keys
3. **No offline mode tests** — `context.setOffline()` not tested with current setup
4. **No mobile viewport tests** — All tests use Desktop Chrome viewport
5. **Schedule page is the only page object** — Booking, Check-in, Finance, and Admin pages use raw `page.locator()` calls
