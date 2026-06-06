# FIGAS Application Modernization — Implementation Plan

**Date:** 2026-06-04
**Status:** Active
**Scope:** Full-stack technical and UX modernization roadmap derived from the comprehensive codebase audit

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Phase 0: Critical Fixes (Week 1–2)](#2-phase-0-critical-fixes-week-12)
3. [Phase 1: Design System & Component Consolidation (Week 2–4)](#3-phase-1-design-system--component-consolidation-week-24)
4. [Phase 2: Accessibility & UX Remediation (Week 4–6)](#4-phase-2-accessibility--ux-remediation-week-46)
5. [Phase 3: Data Integrity & Configuration Centralization (Week 6–8)](#5-phase-3-data-integrity--configuration-centralization-week-68)
6. [Phase 4: UI Modernization (Month 2–3)](#6-phase-4-ui-modernization-month-23)
7. [Phase 5: Workflow Optimization (Month 3–4)](#7-phase-5-workflow-optimization-month-34)
8. [Phase 6: Feature Roadmap (Month 4–12)](#8-phase-6-feature-roadmap-month-412)
9. [Risk Register](#9-risk-register)
10. [Testing Strategy](#10-testing-strategy)

---

## 1. Executive Summary

This plan derives from a dual-specialist UI/UX and QA audit of the FIGAS flight scheduling application (Remix v2, TypeScript, PostgreSQL, Tailwind v4). The audit identified 15 broken route references, 67 duplicated inline button patterns, 15+ duplicated business constants, 3 fuel burn rate inconsistencies, 5 WCAG violations across all dashboards, and zero real-time/offline/dark-mode capabilities.

**Total effort**: ~20 weeks across 6 phases. Phases 0–3 are critical and should be completed before any new feature work. Phases 4–6 are enhancements.

---

## 2. Phase 0: Critical Fixes (Week 1–2)

**Objective:** Eliminate broken navigation, palette inconsistencies, and critical data integrity issues.

### 2.1 Navigation Integrity

| # | Task | Files | Effort |
|---|------|-------|--------|
| N-01 | Create `pilot.flights._index.tsx` stub route | New file: `app/routes/pilot.flights.tsx` | 1h |
| N-02 | Create `pilot.schedule._index.tsx` stub route | New file: `app/routes/pilot.schedule.tsx` | 1h |
| N-03 | Update `pilot.tsx` and `Sidebar.tsx` nav items to use correct routes | `app/routes/pilot.tsx`, `app/components/Sidebar.tsx` | 30m |
| N-04 | Create `engineer.aircraft.tsx`, `engineer.airframe-hours.tsx`, `engineer.maintenance.tsx` stubs | 3 new files | 2h |
| N-05 | Update `engineer.tsx` nav items | `app/routes/engineer.tsx` | 15m |
| N-06 | Fix `/operations/flights` → `/ops/flight` namespace mismatch in all Link references | `operations._index.tsx`, `FlightCard.tsx` | 1h |
| N-07 | Create `operations.schedule.$scheduleId.tsx` detail page stub | New file | 1h |
| N-08 | Create `operations.bookings.$bookingId.passengers.tsx` and `...cancel.tsx` stubs | 2 new files | 1h |
| N-09 | Fix `/ops/schedule` breadcrumb → `/operations/schedule` | `ops.flight.$flightId.loadsheet.tsx:218` | 15m |

**Total effort:** ~8h

### 2.2 CSS Palette Unification

| # | Task | Files | Effort |
|---|------|-------|--------|
| C-01 | Replace all `gray-` → `slate-` classes (18 instances) | `app/components/ClientGroup.tsx`, `app/components/ui/ExpandableSection.tsx`, `app/routes/operations.schedule._index.tsx` | 1h |
| C-02 | Replace `text-slate-400` → `text-slate-500` for WCAG AA contrast (20+ instances) | All dashboard routes, empty states, stat labels | 1h |
| C-03 | Add semantic color tokens to `tailwind.css` theme block | `app/styles/tailwind.css` | 1h |

**Total effort:** ~3h

### 2.3 Data Integrity — Immediate Fixes

| # | Task | Files | Effort |
|---|------|-------|--------|
| D-01 | Fix BN-2 fuel burn rate comment (140 → 45 kg/h) | `app/utils/scheduling/fuel-data.server.ts:24` | 15m |
| D-02 | Resolve taxi time inconsistency (5 vs 10 min) — standardize to 10 min | `weight-balance.ts:28` | 15m |
| D-03 | Fix `SYSTEM_USER_ID = 0` — create real system user or handle webhook attribution differently | `app/routes/api.stripe-webhook.ts:14` | 2h |
| D-04 | Rename `assignedMockIds` → `optimisticAssignedIds` with search-and-replace (10 references) | `app/routes/operations.schedule._index.tsx` | 30m |

**Total effort:** ~3h

---

## 3. Phase 1: Design System & Component Consolidation (Week 2–4)

**Objective:** Establish a design token system and eliminate 67 duplicated button patterns.

### 3.1 Design Token System

| # | Task | Details | Effort |
|---|------|---------|--------|
| DS-01 | Define full token set in `tailwind.css` | Add `--color-success`, `--color-warning`, `--color-danger`, `--color-info`, aviation-specific tokens (`--color-fuel-ok`, `--color-cg-warn`, etc.), surface colors, shadow scale | 3h |
| DS-02 | Add `dark:` variant support using Tailwind `class` strategy | Add `darkMode: "class"` to config, add `dark:` variants to all semantic tokens | 4h |
| DS-03 | Create `SystemSettingsContext` for runtime theme values | New context provider, hook, loaded from `system_settings` DB table | 3h |

### 3.2 Button Component Adoption

| # | Task | Details | Effort |
|---|------|---------|--------|
| BT-01 | Add `color` prop to `Button.tsx` (`"primary" | "danger" | "success" | "warning"`) | Extend existing component with color-based class generation | 2h |
| BT-02 | Replace 67 inline button patterns with `<Button>` component across all routes | Route-by-route replacement: operations.schedule (14 instances), operations.bookings (8), finance routes (12), admin routes (10), pilot/engineer routes (5), bookings/checkin (10), others (8) | 8h |
| BT-03 | Audit for remaining `<button className="...">` patterns post-migration | Codebase-wide grep, ensure zero inline button patterns remain | 1h |

### 3.3 Rename Duplicate Components

| # | Task | Details | Effort |
|---|------|---------|--------|
| RC-01 | Rename `app/components/WeightSummary.tsx` → `PayloadSummary.tsx` | Distinguishes from schedule-specific `WeightSummary.tsx` | 1h |
| RC-02 | Rename `app/components/PaymentMethodSelector.tsx` → `GenericPaymentMethodSelector.tsx` | Distinguishes from `app/components/booking/PaymentMethodSelector.tsx` | 1h |
| RC-03 | Update all imports referencing renamed files | ~8 files | 1h |

**Total effort:** ~27h

---

## 4. Phase 2: Accessibility & UX Remediation (Week 4–6)

**Objective:** Achieve WCAG 2.1 AA compliance across all dashboards.

### 4.1 Error Boundaries

| # | Task | Files | Effort |
|---|------|-------|--------|
| EB-01 | Add `ErrorBoundary` exports to 8 dashboard index pages | `pilot._index.tsx`, `engineer._index.tsx`, `operations._index.tsx`, `finance._index.tsx`, `admin._index.tsx`, `checkin._index.tsx`, `checkin.counter.tsx`, `bookings._index.tsx` | 4h |
| EB-02 | Add `ErrorBoundary` to remaining 50+ route files without one | All route files under `app/routes/` | 8h |
| EB-03 | Update `GlobalErrorBoundary` to hide raw stack traces from users, show generic message | `app/components/GlobalErrorBoundary.tsx` | 1h |
| EB-04 | Wire `GlobalErrorBoundary` into `root.tsx` | `app/root.tsx` | 30m |

### 4.2 Loading States

| # | Task | Files | Effort |
|---|------|-------|--------|
| LS-01 | Add `useNavigation()` loading checks + `Skeleton` component to 7 dashboards | All dashboard index routes | 7h |
| LS-02 | Add loading states to schedule builder (currently blank during fetch) | `operations.schedule._index.tsx` | 2h |
| LS-03 | Add loading states to checkin counter form submissions | `checkin.counter.tsx` | 1h |

### 4.3 DataTable Keyboard Navigation (WCAG 2.1.1)

| # | Task | Details | Effort |
|---|------|---------|--------|
| KN-01 | Convert sortable `<th>` headers to `<button>` elements inside `<th>` | Update `app/components/DataTable.tsx` — 5 dashboards affected | 3h |
| KN-02 | Add `aria-sort` attribute to sorted column headers | Same component | 1h |
| KN-03 | Add `aria-label` to all DataTable action links | Pattern: `aria-label="View flight {flightNumber}"` | 2h |

### 4.4 Skip-to-Content & aria-label Program

| # | Task | Details | Effort |
|---|------|---------|--------|
| AR-01 | Add `<a href="#main" class="sr-only focus:not-sr-only">` skip link to `SidebarLayout.tsx` | Affects 5 role layouts (Pilot, Engineer, Operations, Finance, Admin) | 1h |
| AR-02 | Add `aria-label` to all `StatCard` components | `aria-label="{label}: {value}"` format | 1h |
| AR-03 | Add `aria-label` to all `FinanceKPICard` components | Same pattern | 30m |
| AR-04 | Add `aria-label` to quick-link cards on all dashboard index pages | 8 dashboards, ~25 links | 2h |
| AR-05 | Add `role="list"` / `role="listitem"` to schedule item `<div>` lists | `pilot._index.tsx`, `engineer._index.tsx` | 1h |
| AR-06 | Add `aria-live="polite"` regions to dynamic content areas | Operations dashboard (notifications, bookings), checkin counter | 2h |

### 4.5 Form Labeling Audit

| # | Task | Details | Effort |
|---|------|---------|--------|
| FL-01 | Add `<label>` to checkin counter leg selector `<select>` | `checkin.counter.tsx` | 30m |
| FL-02 | Add `<label>` to bookings search input | `bookings._index.tsx` — currently placeholder-only | 30m |
| FL-03 | Add `<label>` to bookings DateRangePicker | `bookings._index.tsx` | 30m |
| FL-04 | Add `role="alert"` to error messages in checkin counter | `checkin.counter.tsx` | 30m |

**Total effort:** ~38h

---

## 5. Phase 3: Data Integrity & Configuration Centralization (Week 6–8)

**Objective:** Eliminate 15+ duplicated business constants and establish a `system_settings` table.

### 5.1 system_settings Table & Config Service

| # | Task | Details | Effort |
|---|------|---------|--------|
| CF-01 | Create `system_settings` migration with key-value schema | New migration file; columns: key, value, type, description, updated_at | 2h |
| CF-02 | Create `config.server.ts` service with cached reads, TTL invalidation | New file: `app/utils/services/config.server.ts` | 3h |
| CF-03 | Seed default configuration values | `scripts/seed-config.ts` — populate all current hardcoded values | 2h |

### 5.2 Eliminate Duplicated Constants

| Constant | Source Files | Target | Effort |
|----------|-------------|--------|--------|
| `DEFAULT_FARE_PER_PASSENGER = 50` (4 files) | `payment.service.ts`, `invoice.service.ts`, `fare-calculator.server.ts`, `operations.bookings.$bookingId.tsx` | `config.server.ts` → `config.get("fare.default_per_passenger")` | 2h |
| `FREIGHT_RATE_PER_KG = 2` (2 files + magic) | `payment.service.ts`, `fare-calculator.server.ts`, `invoice.service.ts` | `config.server.ts` → `config.get("fare.freight_rate_per_kg")` | 1h |
| BN-2 constants (3 files) | `loadsheet-calculations.server.ts`, `create-loadsheet.server.ts`, `constants.ts` | Import from `constants.ts` (keep in code, de-duplicate) | 1h |
| Cruise speed 140 kt (5 files) | `weight-balance.ts`, `nearest-neighbor.ts`, `fuel-data.server.ts`, `fuel-planning.ts`, `loadsheet-calculations.server.ts` | Import from `constants.ts` `DEFAULT_CRUISE_SPEED_KTAS` | 1h |
| Tax rate = 0 (3 files) | `payment.service.ts`, `invoice.service.ts`, `invoice-lines.server.ts` | Import from `constants.ts` `DEFAULT_TAX_RATE` | 30m |
| Chart of accounts codes (2 files) | `payment.service.ts`, `invoice.service.ts` | Import from `constants.ts` `ACCOUNT_*` constants | 1h |
| 30-day due date (3 files) | `payment.service.ts`, `invoice.service.ts`, `booking.ts` | Use `DEFAULT_PAYMENT_TERM_DAYS` from `constants.ts` | 30m |
| `1970-01-01` epoch pattern (4 files) | 3 ops.flight files + `bookings.tsx` | Centralize `EPOCH_DATE` in `constants.ts` | 30m |

### 5.3 Environment Variables

| # | Task | Details | Effort |
|---|------|---------|--------|
| EV-01 | Add `APP_URL`, `CONTACT_EMAIL`, `CONTACT_PHONE`, `SYSTEM_EMAIL`, `STRIPE_API_VERSION` to `.env` and `.env.example` | Update both files, reference in docs/SETUP.md | 1h |
| EV-02 | Replace hardcoded `figas.gov.fk` / `figas.co` with `APP_URL` env var | `_auth.reset-password.tsx`, `ops.flight...loadsheet.print.tsx`, `schedule.$token.tsx` | 1h |
| EV-03 | Replace hardcoded contact info with env vars | `ops.flight...loadsheet.print.tsx`, `schedule.$token.tsx`, `reminder.service.ts` | 1h |
| EV-04 | Replace hardcoded Stripe API version with env var | `app/utils/stripe.server.ts` | 15m |

### 5.4 Pilot Regulatory Limits as Config

| # | Task | Details | Effort |
|---|------|---------|--------|
| PL-01 | Move pilot constraints to `system_settings` (rest, duty, flight hour limits) | `assign-pilots.ts` to read from `config.server.ts` | 2h |
| PL-02 | Move `pilotWeightKg: 80` to config | `create-loadsheet.server.ts`, `weight-balance.ts` | 30m |

**Total effort:** ~24h

---

## 6. Phase 4: UI Modernization (Month 2–3)

**Objective:** Apply aviation-standard design patterns, progressive disclosure, and dark mode.

### 6.1 Schedule Builder Decomposition

The 1,504-line `operations.schedule._index.tsx` is the single largest technical debt item. Decompose into:

| Component | Responsibility | Target Lines | Effort |
|-----------|----------------|-------------|--------|
| `ScheduleHeader` | Page title, status bar, date navigation, build result banner | <150 | 3h |
| `ScheduleToolbar` | Manual/Auto toggle, action buttons, date picker | <100 | 2h |
| `ScheduleCanvas` | Main drop zone with `DndContext`, `ScheduleBoard`, `UnassignPoolPanel` | <300 | 4h |
| `ScheduleModals` | Add Flight modal, ConfirmDialog, LoadsheetModal orchestration | <150 | 2h |
| `ScheduleActions` | All 14 fetcher action handlers extracted to custom hook | <200 | 3h |
| `operations.schedule._index.tsx` | Thin orchestrator composing above components | <200 | 1h |

### 6.2 Progressive Disclosure for FlightCard

Apply three-level progressive disclosure to reduce `FlightCard` (336 lines) visual footprint:

| Level | Content | Trigger | Effort |
|-------|---------|---------|--------|
| L1 (collapsed) | Flight number, route arrow, times, pilot/aircraft pills, passenger badge, status dot | Default view | 2h |
| L2 (expanded) | Stop-by-stop passenger manifest, weight breakdown per stop, CG data | Click to expand | 2h |
| L3 (modal) | Full loadsheet, fuel planning, crew assignment | "View Loadsheet" button | 1h |

### 6.3 Dashboard Card Standardization

Replace the current mix of `StatCard` (50 lines), `FinanceKPICard` (~80 lines), and inline `<div>` stats with a unified `DashboardCard`:

```typescript
interface DashboardCardProps {
  label: string;
  value: string | number;
  trend?: { direction: "up" | "down"; value: string };
  color: "blue" | "emerald" | "amber" | "red" | "purple";
  to?: string; // drill-down link
  icon?: React.ReactNode;
}
```

| # | Task | Effort |
|---|------|--------|
| DC-01 | Create unified `DashboardCard` component | 3h |
| DC-02 | Replace `StatCard` usage across all dashboards (4 dashboards, ~15 instances) | 2h |
| DC-03 | Replace `FinanceKPICard` usage (1 dashboard, 4 instances) | 1h |
| DC-04 | Replace inline stat `<div>` patterns (operations dashboard, 8 instances) | 1h |

### 6.4 Dark Mode

| # | Task | Details | Effort |
|---|------|---------|--------|
| DM-01 | Add `dark:` variants to all semantic tokens in `tailwind.css` | Color tokens, surface tokens, shadow tokens | 2h |
| DM-02 | Create `ThemeProvider` context with localStorage persistence | `app/components/ThemeProvider.tsx` | 2h |
| DM-03 | Add dark mode toggle to `ProfilePopup` | `app/components/ProfilePopup.tsx` | 1h |
| DM-04 | Add `prefers-color-scheme` auto-detection on first load | `ThemeProvider.tsx` | 1h |
| DM-05 | Audit and fix contrast issues in dark mode for all dashboard components | ~8 dashboards | 3h |
| DM-06 | Add `dark:` variants to data tables, forms, modals | `DataTable`, `Button`, `Card`, forms | 4h |

**Total effort:** ~43h

---

## 7. Phase 5: Workflow Optimization (Month 3–4)

**Objective:** Reduce clicks-to-completion for high-frequency tasks.

### 7.1 Schedule Builder Keyboard Shortcuts

| Shortcut | Action | Conflict Check | Effort |
|----------|--------|---------------|--------|
| `A` | Assign selected booking to selected flight | None in context | 1h |
| `U` | Unassign selected booking | None in context | 1h |
| `R` | Toggle reorder mode | None in context | 1h |
| `←` / `→` | Previous / Next date navigation | Must not fire when date picker focused | 1h |
| `T` | Jump to Today | None in context | 1h |
| `N` | New flight modal | None in context | 1h |

### 7.2 Check-In Counter Batch Operations

| # | Task | Effort |
|---|------|--------|
| CO-01 | Add "Check In All Passengers" button per leg | 2h |
| CO-02 | Add pre-filled baggage defaults (15kg standard, 20kg heavy) with one-click override | 2h |
| CO-03 | Add barcode/QR scanner input field for rapid passenger lookup | 3h |
| CO-04 | Add weight auto-distribution across passengers | 2h |

### 7.3 Dashboard Drill-Down

| # | Task | Effort |
|---|------|--------|
| DD-01 | Make KPI cards navigable to filtered views | 3h |
| DD-02 | Add click-to-scroll from "Needs Attention" count to the Needs Attention section | 1h |
| DD-03 | Add "View All" links from dashboard sections to dedicated list pages | 2h |

**Total effort:** ~23h

---

## 8. Phase 6: Feature Roadmap (Month 4–12)

### 8.1 Real-Time Schedule Collaboration (Sprint 1, 3 weeks)

| Component | Technology | Effort |
|-----------|-----------|--------|
| SSE endpoint for schedule changes | Remix `eventStream` resource route: `api.schedule-events.ts` | 4h |
| `useScheduleSubscription` hook | `EventSource` with reconnection, message queue batching | 4h |
| Optimistic conflict resolution | Version number per schedule, reject stale writes | 4h |
| Live cursor/selection indicators | Per-user selection state broadcast | 4h |
| Toast notifications for remote changes | "John assigned booking FIG-2026-0042 to Flight 1" | 2h |

### 8.2 PWA with Offline Support (Sprint 2, 2 weeks)

| Component | Technology | Effort |
|-----------|-----------|--------|
| `manifest.json` | PWA manifest with FIGAS branding, icons, standalone mode | 2h |
| Service worker registration | Workbox, precache static assets | 4h |
| Schedule data caching | Cache API for pilot schedule, stale-while-revalidate | 4h |
| Offline indicator UI | Banner when offline, cached data badge | 2h |
| Background sync | Deferred check-in submissions when offline | 4h |

### 8.3 Pilot Briefing Component (Sprint 3, 2 weeks)

| Section | Content | Effort |
|---------|---------|--------|
| Route summary | Flight number, date, departure/arrival, aerodromes with weather | 3h |
| Passenger manifest | Per-leg boarding/alighting, special requirements | 2h |
| Weight & balance summary | MTOW/MLW per leg, CG position, binding constraints | 2h |
| Fuel plan | Required fuel, reserves, Stanley refuel check | 2h |
| Weather (placeholder) | METAR/TAF data when integrated, manual notes otherwise | 1h |
| NOTAMs (placeholder) | Active NOTAMs for route aerodromes | 1h |
| Aircraft status | Hours-until-next-service, squawk list | 2h |
| Crew assignment | PIC, contact info | 1h |
| Print briefing | Same `window.print()` pattern as loadsheet | 2h |

### 8.4 Interactive Seat Map (Sprint 4, 2 weeks)

| Component | Details | Effort |
|-----------|---------|--------|
| BN-2 cabin layout SVG | 3 rows × 3 seats, aisle, cockpit, cargo hold, CG reference marks | 4h |
| Drag-to-assign passengers to seats | dnd-kit within cabin layout | 4h |
| Real-time CG impact display | Shows CG dot moving on envelope graph as seats change | 3h |
| Seat assignment persistence | Save to `booking_leg_passengers.seat_number` | 2h |
| Print seat map for loadsheet | Included in loadsheet print page | 2h |

### 8.5 METAR/TAF Weather Integration (Sprint 5, 3 weeks)

| Component | Details | Effort |
|-----------|---------|--------|
| Weather API client | `aviationweather.gov` or NOAA API, cached TTL 30 min | 4h |
| Weather display on route | Icon + ceiling/visibility/wind barbs per aerodrome on `RouteStrip` | 3h |
| Weather display on pilot dashboard | METAR decode, TAF forecast, wind aloft | 3h |
| Minimum weather flagging | Configurable minima per aerodrome, flag flights below minima | 2h |
| Weather briefing print | Included in pilot briefing component | 2h |

### 8.6 PDF Generation Pipeline (Sprint 6, 2 weeks)

| Component | Technology | Effort |
|-----------|-----------|--------|
| Server-side loadsheet PDF | `@react-pdf/renderer` or Puppeteer headless | 4h |
| Server-side invoice PDF | Same | 3h |
| Server-side flight ticket PDF | Same | 3h |
| Email attachment integration | Attach generated PDFs to notification emails | 2h |
| Bulk/batch PDF generation | Generate PDFs for all flights in a schedule | 2h |

### 8.7 CG Envelope Chart (Sprint 7, 1 week)

| Component | Details | Effort |
|-----------|---------|--------|
| CG envelope SVG chart | x-axis: CG arm (mm), y-axis: weight (kg), envelope polygon, plotted points per stop | 4h |
| Overlay on existing WeightSummary | Replace bar display with envelope chart | 3h |
| Interactive tooltips | Hover point → show stop details, weight breakdown | 2h |

**Total Phase 6 effort:** ~110h (~14 days)

---

## 9. Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| 67 button replacements cause visual regressions | Medium | High | Replace one route at a time; screenshot comparison per dashboard |
| Schedule builder decomposition introduces drag-and-drop bugs | High | Medium | Full E2E drag test suite (12 tests) must pass after each decomposition step |
| `system_settings` migration fails in production | High | Low | Test on staging with full seed data; include rollback migration |
| Dark mode causes contrast regressions in print stylesheets | Low | Medium | Print CSS is light-only; no `dark:` variants in print styles |
| SSE connections overwhelm server under load | Medium | Low | Connection pool limit, heartbeat-based cleanup, degrade gracefully to polling |
| Service worker caches stale schedule data | High | Medium | Versioned cache keys with schedule hash; force-refresh on publish |

---

## 10. Testing Strategy

### Per-Phase Requirements

| Phase | Unit Tests | Integration Tests | E2E Tests | Manual QA |
|-------|-----------|------------------|-----------|-----------|
| 0: Critical Fixes | 0 new | 0 new | Verify 78/78 still pass | Full click-through of all 15 fixed links |
| 1: Design System | Button color variants | — | Visual regression screenshots | Grid of all button states |
| 2: Accessibility | — | — | axe-playwright audit (goal: 0 violations) | Keyboard-only navigation of all dashboards |
| 3: Data Integrity | Config service unit tests | Config fallback integration | — | Verify all duplicated constants resolved |
| 4: UI Modernization | Component unit tests | — | Schedule builder drag E2E still passes | Dark mode toggle + 8 dashboard screenshots |
| 5: Workflow Optimization | — | — | Check-in counter E2E for batch ops | Click-count measurement before/after |
| 6: Features | Per-feature unit tests | Per-feature integration | PWA install test, offline test, SSE test | Per-feature UAT |

### Regression Gate

Before merging any phase:
1. `npx tsc --noEmit` — zero TypeScript errors
2. `npm run test:unit` — all unit tests pass
3. `npm run test:integration` — all integration tests pass
4. `npm run test:e2e` — all E2E tests pass
5. `npm run build` — Remix production build succeeds

---

## Appendix A: File Manifest

### Files to Create

| Phase | File | Purpose |
|-------|------|---------|
| 0 | `app/routes/pilot.flights.tsx` | Pilot flights listing stub |
| 0 | `app/routes/pilot.schedule.tsx` | Pilot schedule stub |
| 0 | `app/routes/engineer.aircraft.tsx` | Engineer aircraft fleet stub |
| 0 | `app/routes/engineer.airframe-hours.tsx` | Engineer airframe hours stub |
| 0 | `app/routes/engineer.maintenance.tsx` | Engineer maintenance log stub |
| 0 | `app/routes/operations.schedule.$scheduleId.tsx` | Schedule detail page stub |
| 0 | `app/routes/operations.bookings.$bookingId.passengers.tsx` | Booking passengers stub |
| 0 | `app/routes/operations.bookings.$bookingId.cancel.tsx` | Booking cancel stub |
| 3 | `app/utils/services/config.server.ts` | Runtime configuration service |
| 3 | `scripts/seed-config.ts` | Default config seeder |
| 4 | `app/components/schedule/ScheduleHeader.tsx` | Decomposed component |
| 4 | `app/components/schedule/ScheduleToolbar.tsx` | Decomposed component |
| 4 | `app/components/schedule/ScheduleCanvas.tsx` | Decomposed component |
| 4 | `app/components/schedule/ScheduleModals.tsx` | Decomposed component |
| 4 | `app/components/schedule/useScheduleActions.ts` | Decomposed hook |
| 4 | `app/components/DashboardCard.tsx` | Unified dashboard card |
| 4 | `app/components/ThemeProvider.tsx` | Dark mode provider |
| 6 | `app/routes/api.schedule-events.ts` | SSE endpoint |
| 6 | `app/components/pilot/PilotBriefing.tsx` | Pilot briefing |
| 6 | `app/components/seat-map/SeatMap.tsx` | Interactive seat map |
| 6 | `app/components/seat-map/CGEnvelopeChart.tsx` | CG envelope chart |
| 6 | `app/utils/services/weather.server.ts` | METAR/TAF API client |

### Files to Rename

| From | To |
|------|-----|
| `app/components/WeightSummary.tsx` | `app/components/PayloadSummary.tsx` |
| `app/components/PaymentMethodSelector.tsx` | `app/components/GenericPaymentMethodSelector.tsx` |

---

## Appendix B: Documentation Map

After documentation cleanup (executed 2026-06-04), the canonical documentation structure is:

```
docs/
├── README.md (symlink to ../README.md) or cross-reference
├── ARCHITECTURE.md          — System architecture (keep updated)
├── DATA_MODEL.md            — Complete data model (keep updated)
├── SCHEDULING.md            — Scheduling reference (cross-refs SKILL.md)
├── SETUP.md                 — Environment setup (updated with new env vars)
├── WORKFLOWS.md             — Business workflows (keep updated)
├── IMPLEMENTATION-PLAN.md   — This document
├── DATABASE-AUDIT-SUMMARY.md — Consolidated database audit findings
└── archive/                 — Historical/superseded documents
    ├── old-scheduling-*.md
    ├── old-schema-redesign-*.md
    ├── booking-architecture-plan.md
    ├── publishing-print-specification.md
    ├── loadsheet-technical-plan.md
    ├── scheduling-audit-report-2026-06-03.md
    ├── kanban-pattern-recommendations.md
    ├── schedule-backup-gap-analysis.md
    ├── prisma-orm-feasibility-analysis.md
    ├── migration-consolidation-plan.md
    ├── documentation-harmonization-plan.md
    └── database-audit-phase*.md
```

The authoritative technical contract for the scheduling system is `.agents/skills/flight-schedule/SKILL.md`. All other scheduling documentation should cross-reference it.
