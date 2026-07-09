# FIGAS Master Implementation Plan

**Created:** 2026-06-19  
**Consolidates:** All pending tasks from 7 plan files (deleting originals after merge)  
**Total Pending Items:** ~125 tasks organized into 8 domains

---

## Quick Reference — Priority Index

| Priority | Domain | Tasks | Effort |
|----------|--------|-------|--------|
| 🔴 P0 | Scheduling Audit Phase 2 | 5 handler migrations | ~3h |
| 🔴 P0 | Immediate Actions | 8 critical fixes | ~20h |
| 🟡 P1 | Check-in Gap Analysis | 4 P0 + 5 P1 gaps | ~8h |
| 🟡 P1 | CSS Tokenization Phases 1-2 | 17 component updates | ~8h |
| 🟢 P2 | Shelfware Integration | 7 un-wired components | ~14h |
| 🟢 P2 | Accessibility | 12 remaining a11y tasks | ~20h |
| 🔵 P3 | Maintenance System | 15 tasks (full build) | ~40h |
| 🔵 P3 | Check-in Implementation | 25 tasks (full build) | ~12 days |
| ⚪ Backlog | Scheduling Audit Phases 3-5 | God object decomposition | ~14h |
| ⚪ Backlog | Implementation Plan Phases 4-6 | UI modernization, workflow, features | ~110h |

---

## 1. Scheduling Audit — Immediate Actions

Source: `docs/scheduling-audit.md` v3.0

### Phase 2: Migrate Handlers to Repository (🟡 P1, ~3h)

| ID | Task | File | Lines | Effort |
|----|------|------|-------|--------|
| **SA-01** | Add `findSummaryById()` to `flight.server.ts` → replace 4 flight re-queries | `schedule-handlers.server.ts` | 546, 1151, 1626, 1820 | 1h |
| **SA-02** | Add `findLegsByFlightId()` to `flight-leg.server.ts` → replace 3 leg re-queries | `schedule-handlers.server.ts` | 583, 902, 1179 | 1h |
| **SA-03** | Replace 5 inline manifest queries with `findManifestsByFlightId()` | `schedule-handlers.server.ts` | 619, 737, 793, 936, 1197 | 2h |
| **SA-04** | Replace 3 inline `convertBigInts` patterns with `bigintRowToNumbers()` | `schedule-handlers.server.ts` | 576, 1652, 1846 | 30m |
| **SA-10** | Remove 2 unnecessary `BN2_MTOW_KG` / `BN2_MTOW` local aliases | various | — | 30m |

### Phases 3–5: Decomposition (⚪ Backlog)

| ID | Task | Effort |
|----|------|--------|
| **SA-11** | Split `schedule-handlers.server.ts` (1,424 lines) into 9 handler modules + shared queries | ~5h |
| **SA-12** | Split `operations.schedule._index.tsx` (1,438 lines) into loader, actions, drag-handlers, render | ~4h |
| **SA-05** | Unify distance caches (`distance-cache.ts` DB + `distance-csv.ts` CSV) | 2h |
| **SA-06** | Standardize weight casts across all manifest queries | 30m |
| **SA-07** | Split 1,875-line drag validation spec into modular test files | 2h |
| **SA-08** | Extract 11 shared helpers from drag spec into `tests/e2e/helpers/` | 1h |

### Deferred

| ID | Task | Notes |
|----|------|-------|
| **RE-01** | `validateWeightConstraints()` helper for per-assignment weight revalidation | Deferred — not blocking. Re-runs `validateFlight()` on prop change as fallback. |

---

## 2. Immediate Actions (from Implementation Completion Report)

Source: `docs/IMPLEMENTATION-COMPLETION-REPORT.md`

### Priority 0 (🔴 ~5h)

| ID | Task | Effort |
|----|------|--------|
| **IA-01** | Wire `GlobalErrorBoundary` in `root.tsx` — 60/70 routes have no error protection | 30m |
| **IA-02** | Wire `DashboardCard` into `operations._index.tsx` — replace 8 inline stat cards | 2h |
| **IA-03** | Import centralized constants in `payment.service.ts`, `fare-calculator.server.ts`, `invoice.service.ts` | 2h |

### Priority 1 (🟡 ~13h)

| ID | Task | Effort |
|----|------|--------|
| **IA-04** | Wire `useScheduleShortcuts` into `operations.schedule._index.tsx` (7 keyboard shortcuts) | 2h |
| **IA-05** | Create `pilot.briefing.$flightId.tsx` route using `PilotBriefing` component | 3h |
| **IA-06** | Add `ErrorBoundary` to remaining 60 route files | 6h |
| **IA-07** | Connect SSE endpoint `api.schedule-events.ts` to `useScheduleSubscription` in schedule route | 2h |

### Priority 2 (🟢 ~10h)

| ID | Task | Effort |
|----|------|--------|
| **IA-08** | Add loading states (`Skeleton`) to admin CRUD pages | 4h |
| **IA-09** | Create `system_settings` migration, `config.server.ts` service, seed config | 8h |
| **IA-10** | Update `APP_URL` env var usage for reset-password link | 1h |
| **IA-11** | Wire `SeatMap` into `ops.flight.$flightId.passengers.tsx` | 2h |
| **IA-12** | Wire `CGEnvelopeChart` into `WeightSummary` or `FlightCard` expanded view | 1h |
| **IA-13** | Wire `WeatherClient` into `PilotBriefing` and pilot dashboard | 1h |
| **IA-14** | Wire `generateLoadsheetPdf` / `generateBriefingPdf` into route handlers | 2h |

### Deferred (Not Started — ⚪)

| ID | Task | Reason |
|----|------|--------|
| DF-01 | Replace 67 inline button patterns with `<Button>` component | 8h, visual regression risk |
| DF-02 | Rename duplicate components (`WeightSummary` → `PayloadSummary`, `PaymentMethodSelector` → `GenericPaymentMethodSelector`) | Low priority |
| DF-03 | Loading states on 7 dashboards (`useNavigation()` + `Skeleton`) | Per-route work |
| DF-04 | Schedule Builder decomposition into L1/L2/L3 progressive disclosure | High risk to dnd-kit |
| DF-05 | Check-in counter batch operations | Route-level refactoring |
| DF-06 | Dashboard drill-down navigation (KPI cards → filtered views) | Filter param work |

---

## 3. Maintenance System (Full Build — 🔵 ~40h)

Source: `docs/MAINTENANCE-SYSTEM-PLAN.md` — zero implementation

### Phase 1: Foundation Schema (Week 1–2, 12h)

| ID | Task | Deliverable | Effort |
|----|------|------------|--------|
| **MS-01** | Create `flight_logs` table + PostgreSQL auto-update triggers | Migration SQL + Prisma schema | 4h |
| **MS-02** | Create `maintenance_tasks` table | Migration | 2h |
| **MS-03** | Create `defects` table with MEL integration fields | Migration | 2h |
| **MS-04** | Create `lifed_components` table with LLP tracking | Migration | 2h |
| **MS-05** | Create `sign_offs` table | Migration | 1h |
| **MS-06** | Reference data: `ata_chapters`, component catalog | Seed script | 1h |

### Phase 2: Backend Wiring (Week 3–4, 5h)

| ID | Task | Effort |
|----|------|--------|
| **MS-07** | Auto-update triggers linking flight logs → component hours | 3h |
| **MS-08** | `maintenance-alerts.server.ts` — color-coded due/overdue alert service | 2h |

### Phase 3: UI (Week 5–6, 21h)

| ID | Task | Effort |
|----|------|--------|
| **MS-09** | Enhanced fleet dashboard (multi-tier inspection bars per aircraft) | 4h |
| **MS-10** | Electronic Tech Log (ETL) UI (`engineer.flight-log.tsx`) | 6h |
| **MS-11** | Maintenance Task Board (`engineer.defects.tsx` — kanban) | 4h |
| **MS-12** | Defect Tracker with MEL integration + deferral workflow | 4h |
| **MS-13** | Component Time-Track widget (LLP gauges + detail table) | 3h |

### Phase 4: API & Permissions (Week 7–8, 6h)

| ID | Task | Effort |
|----|------|--------|
| **MS-14** | 5 new permissions (`maintenance:log-flight`, `:create-task`, `:sign-off`, `:defer-defect`, `:manage-components`) | 2h |
| **MS-15** | 8 API endpoints (flight-log POST, tasks CRUD, defects CRUD, components, sign-off) | 4h |

---

## 4. Check-In Module (Full Implementation — 🔵 ~12 days)

Source: `docs/checkin-implementation-plan.md` — zero implementation, feature-flagged

### Phase 0: Safety Net (1 day)

| ID | Task |
|----|------|
| **CI-01** | Feature flag system (`app/utils/checkin/feature-flag.ts`) |
| **CI-02** | Integration test baseline (10 backward-compatibility contract tests) |
| **CI-03** | Unit test baseline for critical paths (weight calc, balance) |

### Phase 1: Critical Bug Fixes & Data Integrity (2 days)

| ID | Task |
|----|------|
| **CI-04** | Extract shared `CashKeypad` and `CardProcessor` components from inline code |
| **CI-05** | Transactional check-in (`db.$transaction` wrapping) |
| **CI-06** | Idempotency via submission UUID (prevent double-check-in) |
| **CI-07** | Concurrent check-in guard (`SELECT ... FOR UPDATE`) |
| **CI-08** | `freight_consignments` Prisma model |

### Phase 2: Counter UX Uplift (3 days)

| ID | Task |
|----|------|
| **CI-09** | Manifest search (replace dead dropdown with text search) |
| **CI-10** | Inline validation (body weight, baggage weight, payment balance) |
| **CI-11** | Till data relocation (remove from POS column, add card below grid) |
| **CI-12** | Confirmation summary card (appears when balanced) |
| **CI-13** | Payment split visualization (color-coded pill badges) |
| **CI-14** | Better error boundaries (status-specific messages) |

### Phase 3: POS Terminal UX Uplift (2 days)

| ID | Task |
|----|------|
| **CI-15** | POS shared component integration (`quickAmounts={[10,20,50,100]}`) |
| **CI-16** | Transactional POS finalization |
| **CI-17** | POS error boundaries matching counter |

### Phase 4: Polish & Refinement (2 days)

| ID | Task |
|----|------|
| **CI-18** | Micro-interactions (`active:scale-95`, `animate-pulse`, auto-scroll) |
| **CI-19** | Tooltips on Void/remove-payment/weight-override buttons |
| **CI-20** | Print workflow gate (hide "Print Tags" until balanced) |
| **CI-21** | Responsive keypad sizing (`min-w-[200px]`, `h-10`) |
| **CI-22** | Gateway cleanup: remove feature flag, delete legacy code |

### Phase 5: Testing & Hardening (2 days)

| ID | Task |
|----|------|
| **CI-23** | 5 integration test files (transaction, concurrency, payment, weight, workflow) |
| **CI-24** | E2E test expansion (10+ tests: counter workflow, search, payment split, till, errors, duplicate prevention) |
| **CI-25** | Performance baseline (<10% regression) |

### Check-in Gap Analysis — P0 (🔴)

Source: `docs/checkin-gap-analysis.md`

| ID | Gap | Location | Priority |
|----|-----|----------|----------|
| **CG-01** | No logout button in checkin sidebar | `checkin.tsx` | P0 |
| **CG-02** | No `ProfilePopup` user menu | `checkin.tsx` | P0 |
| **CG-03** | Sidebar collapse button undersized (24×24 → 44×44px) | `checkin.tsx:41` | P0 |
| **CG-04** | Nav links undersized (`py-2` → `min-h-[44px]`) | `checkin.tsx:52` | P0 |
| **CG-05** | No operational footer stats in sidebar | `checkin.tsx` | P1 |
| **CG-06** | No `NotificationBell` in checkin header | `checkin.tsx` | P1 |
| **CG-07** | Inline status badges (not using shared `StatusBadge`) | `checkin.counter.tsx` | P1 |
| **CG-08** | No breadcrumb on counter route | `checkin.counter.tsx` | P1 |
| **CG-09** | Payment method buttons undersized | `checkin.counter.tsx:461` | P1 |
| **CG-10** | Freight dimensions not behind `ExpandableSection` | `checkin.freight.tsx` | P2 |
| **CG-11** | No `CountdownBar` for departure time | `checkin.counter.tsx` | P2 |
| **CG-12** | Form inputs undersized for touch | `checkin.lookup.tsx` | P2 |
| **CG-13** | No session refresh indicator | `checkin.tsx` | P2 |
| **CG-14** | Missing breadcrumb navigation | `checkin.counter.tsx` | P2 |

---

## 5. Accessibility (🟡 ~18h remaining)

Source: `docs/IMPLEMENTATION-PLAN.md` Phase 2

### Not Started

| ID | Task | Effort |
|----|------|--------|
| **AX-01** | Add `ErrorBoundary` to remaining 60 route files | 6h |
| **AX-02** | Update `GlobalErrorBoundary` to hide raw stack traces | 1h |
| **AX-03** | Wire `GlobalErrorBoundary` into `root.tsx` | 30m |
| **AX-04** | Add `useNavigation()` loading checks + `Skeleton` to 7 dashboards | 7h |
| **AX-05** | Add loading states to schedule builder | 2h |
| **AX-06** | Add loading states to checkin counter form submissions | 1h |
| **AX-07** | Add `aria-sort` attribute to sorted column headers | 1h |
| **AX-08** | Add `aria-label` to all DataTable action links | 2h |
| **AX-09** | Add `aria-label` to all `FinanceKPICard` components | 30m |
| **AX-10** | Add `aria-label` to quick-link cards on all dashboard index pages | 2h |
| **AX-11** | Add `role="list"`/`role="listitem"` to schedule item `<div>` lists | 1h |
| **AX-12** | Add `aria-live="polite"` regions to dynamic content areas | 2h |
| **AX-13** | Form labeling audit (4 tasks: unlabeled inputs, missing `for`/`id`, `aria-describedby` for hints, error `aria-errormessage`) | 2h |

---

## 6. CSS & Icon System (🟡 ~42h)

Source: `docs/css-icon-audit-report.md`

### Phase 1: Design Token Hardening (🔴 P0, 2h)

| ID | Task |
|----|------|
| **CS-01** | Add 8 missing hover variants (`--color-success-hover`, etc.) |
| **CS-02** | Add sidebar tokens (`--color-sidebar-bg`, etc.) |
| **CS-03** | Add dark mode surface tokens |
| **CS-04** | Remove duplicate fuel/cg tokens |
| **CS-05** | Define dark mode surface CSS custom properties |

### Phase 2: Core Component Tokenization (🔴 P0, 6h)

Replace hardcoded Tailwind classes in 12 core components with `@theme` tokens: `Button`, `Badge`, `Toast`, `Card`, `Sidebar`, `SidebarLayout`, `Pagination`, `DataTable`, `DatePicker`, `TimePicker`, `DashboardCard`, `DataGrid`/`PageHeader`/`PageLayout`. Create `cn()` utility.

### Phase 3: Schedule Component Tokenization (🟡 P1, 10h)

Update 14 schedule components: `FlightCard`, `ScheduleBoard`, `RouteStrip`, `FuelSummary`, `WeightSummary`, `ValidationBanner`, `OptimizationBar`, `TimelineView`, `FlightCrew`, `Loadsheet`, `StopActivityList`, `AutoBuildPanel`, `DraftFlightPlaceholder`, `DraggableBookingItem`.

### Phase 4: Shadow Token Replacement (🟡 P1, 3h)

Bulk replace ~175 files: `shadow-sm` → `shadow-card`, `shadow-lg` → `shadow-modal`, `shadow-md` → `shadow-dropdown`.

### Phase 5: Print CSS Tokenization (🟢 P2, 3h)

Convert 78 hardcoded hex values in `ticket-print.css` to CSS custom properties.

### Phase 6: Icon Migration to lucide-react (🟡 P1, 8h)

| ID | Task |
|----|------|
| **CS-06** | Install `lucide-react` |
| **CS-07** | Create icon mapping layer (`app/components/icons/mappings.ts`) |
| **CS-08** | Create `IconWrapper.tsx` for consistent sizing |
| **CS-09** | Retain 3 custom-only SVGs (`FlightPathArc`, `RunwayIcon`, `WingIcon`) |
| **CS-10** | Replace all 97 inline SVGs with icon components |
| **CS-11** | Remove 7 dead icon files |
| **CS-12** | Create `app/components/icons/index.ts` barrel file |
| **CS-13** | Remove `LoadingSpinner.tsx` → lucide `Loader2` + `animate-spin` |
| **CS-14** | Migrate 12 custom icon components to lucide equivalents |

### Phase 7: Dark Mode Bug Fixes (🟡 P1, 2h)

Fix 19 bugs in 6 files (duplicate classes, invalid opacity values, contradictory overrides).

### Phase 8: Iconography Enhancements (🟢 P2, 4h)

Add missing icons to: `Sidebar`, `BookingWizard`, `ScheduleStatusBar`, `FlightCard` ordinal, `EmptyState`, `AlertStrip`, `PageHeader`, notification section.

### Phase 9: Validation & Testing (🟢 P2, 4h)

Visual regression screenshots, dark mode verification, print view verification, bundle analysis, ESLint token enforcement rule.

---

## 7. Documentation References Preserved

The following files are retained as standalone references (not incorporated into this plan):

| File | Reason |
|------|--------|
| `docs/scheduling-audit.md` | v3.0 active audit tracker — updated in parallel with this plan |
| `docs/checkin-ux-audit-report.md` | Completed UX audit with Appendix A scorecard — historical reference |
| `docs/DATABASE-AUDIT-SUMMARY.md` | Completed three-phase DB audit — historical reference |
| `docs/seed-data-plan.md` | v3.0 seed data specification — reference for data generation |

---

## 8. Effort Summary by Priority

| Priority | Domain | Hours |
|----------|--------|-------|
| 🔴 P0 | Immediate Actions (IA-01 to IA-03) + CSS Phase 1–2 | 10h |
| 🟡 P1 | Scheduling Phase 2 + Accessibility + CSS Phase 3–4,6–7 | 38h |
| 🟢 P2 | Shelfware Integration + CSS Phase 5,8–9 | 25h |
| 🔵 P3 | Maintenance System + Check-in Implementation | ~100h |
| ⚪ Backlog | Decomposition, Deferred Items, UI Modernization | ~130h |
| **Total** | | **~303h** |
