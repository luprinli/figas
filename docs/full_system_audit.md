# FIGAS FULL SYSTEM AUDIT — Comprehensive Prompt

## 1. Context & System Overview

You are auditing the **FIGAS Flight Operations & Booking Management System**—a production-grade (but non-live) web application built on the following stack:
- **Framework:** Remix v2 (React Router v6) with Server-Side Rendering (SSR).
- **Language:** TypeScript (strict mode).
- **Database:** PostgreSQL 16, accessed via Kysely (type-safe SQL query builder) with a `pg` connection pool.
- **Schema Management:** Prisma CLI (used to generate Kysely types via `prisma generate`).
- **Styling:** Tailwind CSS v4 (utility-first) with a custom CSS token system and `lucide-react` icons.
- **Payments:** Stripe (Checkout Sessions, Webhooks).
- **Drag & Drop:** `@dnd-kit` for the flight schedule board.
- **Testing:** Vitest (unit/integration) + Playwright (E2E) + smoke tests.
- **Deployment:** Render (persistent Node web service via `render.yaml`, which is already stable and good).
- **Key Modules:**
  - Authentication & PBAC (Permission-Based Access Control)
  - Booking Management (self-service, agent, operations, booking mutability RULE 20)
  - Flight Scheduling Pipeline (5-phase auto-builder + per-passenger drag-and-drop board)
  - Check-in & POS Terminal (per-leg, batch, payment collection)
  - Finance & Accounting (double-entry, invoicing, reconciliation, per-passenger or per-booking payment RULE 21)
  - Pilot Briefing & Loadsheet (interactive W&B, offline-capable)
  - Engineer & Maintenance (fleet tracking, airframe hours, components)
  - Admin (CRUD for aerodromes, aircraft, fares, fuel rules)

**Audit Purpose:** Identify all risks, technical debt, feature gaps, and UX frictions. This audit will inform the final push toward a commercially licensable, operationally robust product.

**Last Updated:** 2026-07-17 — Added per-passenger scheduling, booking mutability, payment mode support.

---

## 2. Audit Scope

### Include (Full Coverage)
- **All Routes:** `app/routes/**/*.tsx` (including nested layouts, api routes, and `$` catch-all routes).
- **All Components:** `app/components/**/*.tsx` (including scheduling, booking, checkin, pilot, engineer, loadsheet, and ui primitives).
- **Utilities & Repositories:** `app/utils/**/*.ts` (repositories, scheduling engine, services, `db.server.ts`, `permissions.server.ts`, `stripe.server.ts`).
- **Database Migrations:** `migrations/**/*.sql` (both consolidated and archive/fix scripts). Verify the final `consolidated/` schema is cohesive.
- **Tests:** `tests/**/*.ts` (assess coverage, not just pass/fail—are meaningful edge cases covered?).
- **Configuration:** `package.json`, `vite.config.ts`, `tsconfig.json`, `.env.example`, `render.yaml`.
- **Documentation:** `README.md`, `docs/*.md`, `plans/MASTER-PLAN.md`.

### Explicitly Exclude
- Node modules (`node_modules/`).
- Build artifacts (`build/`).
- Third-party scripts in `public/`.

---

## 3. Audit Dimensions & Checklists

### A. Business Logic & Data Integrity
Evaluate whether the system enforces its core domain rules correctly.

| Checklist Item | Description | Critical Files |
| :--- | :--- | :--- |
| **3.1.1** | **Scheduling Pipeline (5 Phases):** Does `buildSchedule` correctly cluster legs, route via nearest-neighbor, assign aircraft, compute W&B, and assign pilots? Validate against the invariants listed in `docs/SCHEDULING.md` (G-01 through G-22). | `app/utils/scheduling/index.ts`, `cluster-bookings.ts`, `nearest-neighbor.ts`, `assign-aircraft.ts`, `weight-balance.ts`, `assign-pilots.ts` |
| **3.1.2** | **Weight & Balance:** Is the CG envelope calculation correct? Are `mtow_used_pct` and `mlw_used_pct` computed accurately? Does the system correctly handle the "single-crew" requirement (pilot disembarks passengers)? | `app/utils/scheduling/weight-balance.ts`, `app/components/seat-map/CGEnvelopeChart.tsx` |
| **3.1.3** | **Double-Entry Accounting:** Are all financial transactions (payments, invoices, refunds) creating balanced journal entries (debits = credits)? Is the chart of accounts consistent? | `app/utils/services/invoice.service.ts`, `app/utils/repositories/accounting-entry.ts` |
| **3.1.4** | **Booking Status Pipeline:** Does a booking correctly transition from `PENDING` → `CONFIRMED` → `FLIGHT_ASSIGNED` → `CHECKED_IN` → `COMPLETED`? Are `cancelled` terminal states enforced? | `app/utils/constants.ts`, `app/routes/operations.bookings.$bookingId.tsx` (action handlers) |
| **3.1.5** | **No-Fly Day Enforcement:** Is the no-fly rule applied consistently in auto-build, assign-booking, and unassign-booking flows? | `app/utils/services/no-fly.service.ts`, `app/utils/schedule-handlers.server.ts` |
| **3.1.6** | **Data Validation:** Are constraints (max passengers 9, max weight 300kg, etc.) enforced at the repository layer (not just UI)? | `app/utils/repositories/booking-passenger.ts`, `app/utils/constants.ts` |

### B. UI/UX & Accessibility (WCAG 2.1 AA)
Evaluate the user interface for consistency, responsiveness, and accessibility.

| Checklist Item | Description | Critical Files |
| :--- | :--- | :--- |
| **3.2.1** | **Component Library Consistency:** Is the `Button` component used everywhere, or are there custom inline buttons? Is `DataTable` (which wraps `DataGrid`) used for all tabular data? | Search for `<button>` vs `Button` component, and `<table>` vs `DataTable`. |
| **3.2.2** | **Responsiveness:** Do all critical pages (Schedule Board, Check-in Counter, Booking Detail) render and function on a 320px wide viewport? | Use your judgement; check for `overflow-x` and flex wrapping. |
| **3.2.3** | **ARIA & Semantic HTML:** Are landmarks (`<main>`, `<nav>`, `<aside>`) used? Are interactive elements keyboard accessible (focus styles visible)? | `app/routes/*.tsx`, especially `SidebarLayout` and `checkin.counter`. |
| **3.2.4** | **Loading & Error States:** Is `useNavigation` used to show loading indicators? Are there comprehensive `ErrorBoundary` components for all routes? | `app/root.tsx`, `app/routes/*.tsx` (check for `export function ErrorBoundary`). |
| **3.2.5** | **Mobile Touch Targets:** Are clickable elements (buttons, links) at least 44x44px? (Check `checkin.counter.tsx` for the undersized buttons noted in `MASTER-PLAN.md`). | `app/routes/checkin.counter.tsx`, `app/components/DataTable.tsx`. |
| **3.2.6** | **Color Contrast:** Do status badges (`StatusBadge`, `PaymentStatusBadge`) meet contrast ratios? | `app/components/StatusBadge.tsx` (verify colors). |

### C. Code Architecture & Maintainability
Evaluate the codebase for "health" and developer experience.

| Checklist Item | Description | Critical Files |
| :--- | :--- | :--- |
| **3.3.1** | **Route Size & Complexity:** Are any route files excessively large (>500 lines)? (I see `checkin.counter.tsx` is quite large). Identify candidates for decomposition (loader/action extraction). | `app/routes/checkin.counter.tsx`, `app/routes/operations.schedule._index/route.tsx` (1,438 lines!). |
| **3.3.2** | **Repository Pattern:** Are all database queries inside `app/utils/repositories/`? Are there any inline SQL queries in route files? | Search `sql` or `kdb` directly inside route files. |
| **3.3.3** | **Type Safety:** Are there any `any` or `@ts-ignore` usages? Are `unknown` types properly cast with validation? | Search for `as any`, `@ts-ignore`, `unknown`. |
| **3.3.4** | **Duplicate Logic:** Is there duplicated logic (e.g., distance cache, fuel calculation) that should be shared? | Check `app/utils/scheduling/` for duplicate helper modules (addresses G-12 to G-15 from `SCHEDULING.md`). |
| **3.3.5** | **Global Constants & Enums:** Are all magic strings (statuses, permissions) centralized in `app/utils/constants.ts`? | Check for hardcoded strings like `"processing"` or `"PAID"`. |
| **3.3.6** | **Test Coverage:** Does the test suite actually cover critical paths (auto-build, payment, check-in concurrency)? Are there integration tests for database constraints? | `tests/integration/`, `tests/unit/`. Identify missing tests (e.g., no tests for `payment.service.ts`?). |

### D. Security & Permissions (PBAC)
Evaluate the authorization model and vulnerability surface.

| Checklist Item | Description | Critical Files |
| :--- | :--- | :--- |
| **3.4.1** | **Loader/Action Guards:** Does EVERY route loader and action call `requirePermission` or `requireAuth`? Are there any "public" routes that shouldn't be? | Check `app/routes/_auth.login.tsx`, `app/routes/schedule.$token.tsx` (should be public). Validate operations routes. |
| **3.4.2** | **Segregation of Duties (SoD):** Is the SoD validation in `permissions.server.ts` actually invoked? Are there users with conflicting roles? | `app/utils/permissions.server.ts` (search for `validateSoD` calls). |
| **3.4.3** | **CSRF Protection:** Is CSRF token validation enabled on all write actions? | `app/utils/csrf.server.ts` and check if it's used in `session.server.ts`. |
| **3.4.4** | **Stripe Webhook:** Is the webhook endpoint properly signed and idempotent? | `app/routes/api.stripe-webhook.ts`. |
| **3.4.5** | **Sensitive Data Exposure:** Are passwords hashed (bcrypt), and are API responses hiding sensitive fields (e.g., `password` in `profile.tsx` loader)? | `app/utils/password.server.ts`, `app/routes/profile.tsx`. |
| **3.4.6** | **Session Security:** Is the cookie `HttpOnly`, `Secure`, `SameSite` set correctly? | `app/session.server.ts`. |

### E. Performance & CI/CD
Evaluate runtime performance and developer operations.

| Checklist Item | Description | Critical Files |
| :--- | :--- | :--- |
| **3.5.1** | **N+1 Queries:** Are there any loops making separate database calls (e.g., in the scheduling pipeline or manifest generation)? | `app/utils/scheduling/cluster-bookings.ts`, `app/routes/ops.flight.$flightId.loadsheet.tsx`. |
| **3.5.2** | **Bundle Size:** Are there large dependencies that could be lazy-loaded? | Check `package.json` for large deps and `vite.config.ts`. |
| **3.5.3** | **CI/CD Pipeline:** Do the GitHub Actions (`.github/workflows/`) run lint, typecheck, and tests effectively? Is the targeted-testing script (`detect-changed-suites.js`) reliable? | `.github/workflows/ci.yml`, `scripts/ci/detect-changed-suites.js`. |
| **3.5.4** | **Migration Strategy:** Are the consolidated migrations safe to run on a production DB (idempotent, no destructive drops)? | `migrations/consolidated/`. Validate for `IF NOT EXISTS`. |
| **3.5.5** | **Caching:** Is there a caching strategy for distance lookups and fare matrices? (They are loaded from CSV/DB repeatedly). | `app/utils/scheduling/distance-lookup.ts`, `app/utils/repositories/fare-route.ts`. |

### F. Feature Completeness (vs. Master Plan & Industry Standards)
Validate the system against the `MASTER-PLAN.md` backlog and industry expectations.

| Checklist Item | Description |
| :--- | :--- |
| **3.6.1** | **Scheduling Audit (SA tasks):** Are SA-01 to SA-10 (handler migrations, de-duplication, etc.) actually done? | Verify `schedule-handlers.server.ts` for remaining inline queries. |
| **3.6.2** | **Maintenance System:** The `MASTER-PLAN.md` states it is "zero implementation" (Phase 1-3). Is that still true? Verify `engineer` routes. Are they mostly read-only? | `app/routes/engineer.*.tsx`. |
| **3.6.3** | **Email/Alerting:** The implementation plan from the previous chat (Phase 0) outlines `email.server.ts` and templates. Is there any placeholder email code currently, or is it completely missing? | Search for `sendEmail`, `nodemailer`, or `SMTP`. |
| **3.6.4** | **Passenger Identity (Hybrid Search):** The previous prompt added a migration. Is the feature fully integrated in the UI (combobox), or just the DB layer? | Check for `PassengerSearchCombobox` usage in `PassengersTable`. |
| **3.6.5** | **Public Schedule:** Does `schedule.$token.tsx` correctly handle expired/revoked tokens? Is the UX friendly? | `app/routes/schedule.$token.tsx`. |
| **3.6.6** | **Onboarding Tours:** Driver.js was recommended and `TourTrigger` was added to some pages. Is it implemented everywhere, or only check-in/schedule? | Search for `TourTrigger` usage across `app/routes/`. |

---

## 4. Severity Classification
When identifying issues, classify them as follows:

| Severity | Definition |
| :--- | :--- |
| **P0 (Critical)** | System data loss (e.g., booking wizard loses data on refresh), security breach (e.g., missing auth on a route), or core business logic failing (e.g., scheduling pipeline produces invalid flights). **Must fix before launch.** |
| **P1 (High)** | Severe UX friction (e.g., no passenger search), significant performance degradation (e.g., N+1 queries causing 10s load times), or major accessibility violation (e.g., no keyboard navigation). |
| **P2 (Medium)** | UI inconsistencies, missing minor features (e.g., missing tooltips), or superficial tech debt (e.g., duplicate helper functions). |
| **P3 (Low)** | Cosmetic issues (spacing, typography), suggestions for future enhancement (e.g., analytics), or rarely used edge cases. |

---

## 5. Output Deliverable

Produce a single, exhaustive Markdown document (`FULL_SYSTEM_AUDIT_REPORT.md`) with the following sections:

### 5.1 Executive Summary
- High-level assessment (e.g., "The system is operationally sound but has critical gaps in draft saving and maintenance tracking.").
- Total counts: P0 (N), P1 (N), P2 (N), P3 (N).
- Star rating (1-5) for: Architecture, UI/UX, Security, Data Integrity, Feature Completeness.

### 5.2 Detailed Findings (Categorized)
Use the dimensions from Section 3 (A through F). For each finding, provide:
- **ID:** e.g., `[A-01]`
- **Title:** e.g., "Scheduling Pipeline Lacks Transaction Wrapping"
- **Severity:** (P0/P1/P2/P3)
- **Location:** Specific file + line range.
- **Description:** What is happening.
- **Impact:** What happens if it breaks.
- **Recommendation:** Concrete fix (e.g., "Wrap `buildSchedule` in `kdb.transaction()`").

### 5.3 Feature Completeness Matrix
A table covering the main modules (Bookings, Scheduling, Check-in, Finance, Pilot, Engineer, Admin) with status: ✅ Complete, ⚠️ Partial, ❌ Missing.

### 5.4 Consolidated Implementation Plan
A prioritized action plan (sorted by P0 → P3) with effort estimates (Small/Medium/Large) and dependencies, suitable for handoff to a development team.

### 5.5 Appendices
- **A:** List of all routes and their authorization status.
- **B:** Test coverage gaps (untested critical paths).
- **C:** Environment variable requirements (check `.env.example` for completeness).

---

## 6. Agent Instructions (How to Execute)

1.  **Read the Docs First:** Start by reading `README.md`, `ARCHITECTURE.md`, `WORKFLOWS.md`, and `SCHEDULING.md`. This establishes the intended behavior against which you will audit the code.
2.  **Follow the Files:** Trace the flow of a single "Booking Creation" from UI → Route Action → Service → Repository → DB. Repeat for Scheduling (auto-build) and Check-in (POS terminal). This ensures you understand the chain.
3.  **Grep for Patterns:** Use the codebase search extensively:
    - `grep -r "requirePermission"` to check auth coverage.
    - `grep -r "transaction"` to check for DB transaction usage.
    - `grep -r ".any"` to find type safety breaches.
4.  **Validate the Master Plan:** Cross-reference the `MASTER-PLAN.md` backlog. Did IA-04 (useScheduleShortcuts) actually get wired? Did IA-05 (PilotBriefing route) get created?
5.  **Be Pragmatic:** Do not suggest a full rewrite. Suggest surgical fixes.
6.  **Be Specific:** Instead of saying "Improve error handling," say "Add `try/catch` with specific error messages in `payment.service.ts:45` for Stripe API failures."

---

## 7. Final Note for the Agent
This audit will be used to secure the system's stability before potential commercial licensing. Therefore, **pay special attention to:**
- **Multitenancy/Segregation:** Ensure Ops can't see passenger booking details they shouldn't, and vice versa.
- **Idempotency:** Specifically in Stripe webhooks and scheduling pipeline. Can you run `buildSchedule` twice without creating duplicates?
- **Data Audit:** Ensure all write actions (status changes, payments, cancellations) write to `audit_log`.

*Deliverables: The single Markdown report.*