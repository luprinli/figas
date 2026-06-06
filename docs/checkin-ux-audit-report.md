# FIGAS Check-In System — Comprehensive UX/UI Audit Report

**Date:** 2026-06-05
**Auditor:** Senior UI/UX Engineer (Clean Room Redesign Assessment)
**Scope:** Full check-in pipeline — from layout route through counter workflow to POS terminal, lookup, and freight sub-systems.

---

## TABLE OF CONTENTS

1. [Feature Inventory](#1-feature-inventory)
2. [Competitive Benchmarking & Research](#2-competitive-benchmarking--research)
3. [UX/UI Audit](#3-uxui-audit)
4. [Strategic Recommendations](#4-strategic-recommendations)

---

## 1. FEATURE INVENTORY

### 1.1 Route Structure (Remix v2 Flat-File Routing)

| Route | File | Lines | Role |
|-------|------|-------|------|
| `/checkin` (layout) | `checkin.tsx` | 83 | Dark sidebar nav, permission gate, pending count |
| `/checkin` (index) | `checkin._index.tsx` | 194 | KPI dashboard, today's flights table, recent check-ins |
| `/checkin/counter` | `checkin.counter.tsx` | 543 | **Primary workflow**: flight select → manifest → weights → POS → complete |
| `/checkin/pos` | `checkin.pos.tsx` | 572 | Standalone POS with agent/customer dual display |
| `/checkin/lookup` | `checkin.lookup.tsx` | 219 | Booking search by reference/flight#/name |
| `/checkin/freight` | `checkin.freight.tsx` | 194 | Freight consignment receiving with waybill generation |

### 1.2 Backend Capabilities

**Repositories:**
- `checkin.ts` (257 lines): Reminder CRUD, booking search (ILIKE across 5 columns), passenger detail fetch, balance query, payment recording
- `booking-leg-passenger.ts` (294 lines): Core `checkIn()` method, weight update, flight-leg assignment

**Database Tables Involved:**
- `checkin_reminders` — scheduled/pending/sent reminders (infrastructure exists, no send implementation)
- `booking_leg_passengers` — core check-in record (checked_in, checked_in_at, checked_in_by, weights)
- `payments` — POS payment recording (cash, card, invoice, deferred, weight_override)
- `freight_consignments` — waybills (raw SQL only, no Prisma model)
- `bookings` / `booking_passengers` — source truth for passenger data and status

**Action Handlers:**
- `checkin-with-payment` — single monolithic action: update weights → record payments → `checkIn()` → redirect
- `process-card` — simulated card auth (2s timeout, approve < £5000)
- `finalize` — standalone POS finalization (same logic as counter, uses `useFetcher`)

### 1.3 Business Rules (Enforced in Code)

| Rule | Location |
|------|----------|
| Origin gate: only STY (Stanley) passengers can be checked in at counter | `checkin.counter.tsx:337,403` |
| Remote stops handled by pilot (read-only view) | `checkin.counter.tsx:402-408` |
| Max free baggage: 20 kg | `checkin.counter.tsx:17`, `checkin.pos.tsx:16` |
| Excess rate: £5/kg | `checkin.counter.tsx:18`, `checkin.pos.tsx:17` |
| Body weight minimum: 20 kg | `checkin.counter.tsx:327` |
| Payment balancing enforced before sale completion | `checkin.counter.tsx:326,517` |
| Weight override recorded as zero-amount audit payment | `checkin.counter.tsx:182-188` |
| Payment methods: cash, card (simulated), invoice (PO required), deferred | Both counter + POS |

### 1.4 Frontend Feature Set

| Feature | Counter | POS | Lookup | Freight | Dashboard |
|---------|---------|-----|--------|---------|-----------|
| Date-picker flight filtering | ✅ | — | — | — | — |
| Flight progress bars | ✅ | — | — | — | ✅ |
| Passenger manifest (selectable) | ✅ | — | — | — | — |
| Body weight entry + quick presets (70/85) | ✅ | ✅ | — | — | — |
| Baggage weight entry + quick presets (0/15/20) | ✅ | ✅ | — | — | — |
| Excess baggage charge calculation | ✅ | ✅ | — | — | — |
| Cash keypad (0-9, quick buttons £10/20/50) | ✅ | ✅ | — | — | — |
| Simulated card processor | ✅ | ✅ | — | — | — |
| Invoice with PO reference | ✅ | ✅ | — | — | — |
| Deferred payment flagging | ✅ | ✅ | — | — | — |
| Weight override code input | ✅ | ✅ | — | — | — |
| Print baggage tags button | ✅ | — | — | — | — |
| Print boarding pass button | — | ✅ | — | — | — |
| Void transaction | ✅ | ✅ | — | — | — |
| Complete sale button | ✅ | ✅ | — | — | — |
| Till transaction display | ✅ | — | — | — | — |
| Customer-facing display panel | — | ✅ | — | — | — |
| Payload capacity gauge (color-coded) | — | ✅ | — | — | — |
| Dual search (reference lookup + free-text search) | — | — | ✅ | — | — |
| Freight consignment form + waybill generation | — | — | — | ✅ | — |
| KPI cards (flights, checked-in, pending, freight) | — | — | — | — | ✅ |
| Skeleton loading states | — | — | — | — | ✅ |
| Error boundaries (every route) | ✅ | ✅ | ✅ | ✅ | ✅ |

### 1.5 Test Coverage

- **Unit tests:** None
- **Integration tests:** None
- **E2E tests:** 2 smoke tests only (`checkin.spec.ts`)
  - "should display check-in page" — checks heading + no error + lookup link
  - "should show lookup functionality" — checks heading + search input + submit button
- **Coverage gap:** Zero tests for business logic, action handlers, payment processing, weight validation, or the full check-in workflow.

### 1.6 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Remix v2.15.3 (Netlify adapter) |
| UI | React 18.2, Tailwind CSS v4.0.6 |
| Database | Prisma 7.8.0 + PostgreSQL |
| Auth | Custom PBAC (role_permissions + user_roles) |
| Forms | Remix `<Form>` / `useFetcher` (no form library) |
| Testing | Vitest (unit/integration), Playwright (E2E) |
| Build | Vite 5.4 |
| Drag & Drop | @dnd-kit/core v6.3.1 (schedule only) |

### 1.7 Integration Touchpoints

- `bookings.tsx`: `isCheckinAvailable()` gate → "Check In" button
- `bookings.$bookingId.tsx`: "Check In" quick-action button
- `Sidebar.tsx`: COMMON_NAV_ITEMS includes "Check-In" link
- `FlightCard.tsx`: Displays `check_in_time` as a time picker
- `auth.server.ts`: Check-in users redirected to `/checkin/counter`

---

## 2. COMPETITIVE BENCHMARKING & RESEARCH

### 2.1 Reference Repository Analysis

#### 2.1.1 TRIVAGO-CLONE (Trivago Clone)
**Tech:** HTML/CSS/JS | **Relevance:** Hotel booking UX

**Key UX patterns observed:**
- Visual calendar date picker with check-in/check-out date pairs
- Progressive disclosure: search → results → hotel details → booking → payment
- Responsive design with mobile-first approach
- Login/account creation integrated into booking flow
- Email OTP verification for critical actions
- Payment page with clear order summary before final confirmation

**Adaptable patterns for FIGAS:**
- Date range selection for flight lookup (currently single date)
- Multi-step progressive disclosure (already partially implemented in counter)
- Visual confirmation summaries before committing payments

#### 2.1.2 CheckInn (Hotel Management System)
**Tech:** MERN (MongoDB, Express, React, Node) | **Relevance:** Admin/staff/receptionist role-based check-in flows

**Key UX patterns observed:**
- Strict RBAC with role-gated dashboards (admin, staff, customer)
- Role-specific views — receptionist sees check-in/check-out panels
- Database seeding for consistent test environments
- JWT auth with refresh tokens
- Pagination on all list endpoints

**Adaptable patterns for FIGAS:**
- Receptionist-panel model directly analogous to FIGAS check-in counter agent
- Role-specific dashboard views improve cognitive efficiency
- Seed data for deterministic testing (FIGAS lacks this for check-in)

#### 2.1.3 ShivGanga Hotel (Production Booking Site)
**Tech:** React/Vite + Node/Express + MongoDB | **Relevance:** Full production check-in with payments, admin panel, receptionist panel

**Key UX patterns observed:**
- Receptionist panel: track guest check-ins/check-outs, view available rooms, manage offline bookings, daily guest activity overview
- Admin panel: dashboard analytics (monthly revenue, rooms booked, occupancy, daily check-ins/check-outs)
- Partial payment support (pay deposit now, balance at check-in)
- Coupon/discount system with membership tier discounts
- Razorpay payment integration (real payment gateway)
- Email notifications with billing details
- PDF invoice generation
- Twilio SMS/OTP
- Node Cron for scheduled tasks (auto check-out reminders, etc.)

**Adaptable patterns for FIGAS:**
- **Receptionist panel** is the most directly transferable pattern — FIGAS counter agent should have a similar tailored view
- **Partial payment/deposit workflow** — FIGAS currently has deferred payment but could benefit from explicit deposit-tracking UI
- **Email/SMS notifications** — FIGAS has `checkin_reminders` table infrastructure but no notification sending implementation
- **PDF generation** — boarding pass/baggage tag PDFs could leverage this pattern
- **Scheduled tasks** — reminder sending could use cron-equivalent (Netlify scheduled functions)
- **Analytics dashboard** — admin-level view of check-in metrics across all flights

#### 2.1.4 The Wild Oasis (Hotel Admin App)
**Tech:** React + Supabase + React Query + React Hook Form + Styled Components + Recharts
**Relevance:** Premium hotel admin-side check-in/check-out workflow

**Key UX patterns observed:**
- **Compound Component Pattern** for reusable UI blocks
- **React Query** for data fetching with caching and real-time updates
- **React Hook Form** for form validation (replaces raw `<input>` elements)
- **Check-in flow:** BookingDataBox → optional breakfast add-on → confirm payment checkbox → Check In button
- **Gated confirmation:** "I confirm that [guest] has paid [amount]" must be checked before button enables
- **Status-based filtering:** "unconfirmed" / "checked in" / "checked out"
- **Dashboard:** guests checking in/out today, recent bookings stats, occupancy chart, sales chart
- **Dark mode** toggle
- **Settings:** application-wide config (breakfast price, min/max nights, max guests)

**Adaptable patterns for FIGAS:**
- **Confirmation gate pattern** — FIGAS should require explicit payment confirmation before check-in completes
- **React Hook Form** — replace raw input handling with proper validation library
- **React Query** — replace manual `useState` + `useFetcher` for data fetching/mutation state
- **Charts** — dashboard could benefit from Recharts for check-in trends, payload utilization, etc.
- **Application-wide settings** — excess baggage rate, max free baggage, weight limits should be configurable

#### 2.1.5 React-Hotel-Project (Wild Oasis Variant)
**Tech:** Same as 2.1.4 (React + Supabase + RQ + RHF + Styled Components)
**Relevance:** Confirms the same check-in UX patterns as the premier implementation.

### 2.2 Industry Best Practices — Frictionless Check-In Interfaces

Based on analysis of airline check-in systems (Amadeus, SITA, Navitaire), hotel PMS (Opera, Mews, Cloudbeds), and retail POS (Square, Toast, Lightspeed):

#### A. Workflow Design Principles
1. **Single-task focus** — Each screen should have one clear purpose. Counter mixes flight selection, manifest, weights, POS, and till display in one view.
2. **Progressive disclosure** — Show only what's needed at each step. FIGAS partially achieves this with mode switching but could go further.
3. **Error prevention over error recovery** — Validate at input time, not at submission time. FIGAS validates weights/balance at submission only.
4. **Undo capability** — Allow reversing operations. FIGAS has a void button but it only clears UI state, not committed database state.
5. **Keyboard-first for counter agents** — Professional agents should complete workflows without touching a mouse. FIGAS keypad is a good start but lacks full keyboard navigation.

#### B. Payment UX Standards
6. **Payment method persistence** — Remember agent's last used payment method.
7. **Split payment visualization** — Show how total is divided across methods. FIGAS shows individual payments but not a split visualization.
8. **Receipt preview before print** — Show what will print before committing. FIGAS prints directly.
9. **Offline resilience** — Counter should work when network is degraded. FIGAS relies entirely on server round-trips.

#### C. Data Display Standards
10. **Color-coded status at a glance** — Use consistent color semantics (green=done, amber=in-progress, red=blocked). FIGAS has some inconsistency (blue for scheduled vs slate for unassigned).
11. **Progress indicators with absolute numbers** — Always show "X of Y" not just percentages.
12. **Searchable/filterable passenger lists** — FIGAS passenger manifest has a filter dropdown with only "This Flight" option — should support text search.
13. **Recent activity feed** — Show last N actions for situational awareness. FIGAS shows till payments only, not recent check-ins.

#### D. Accessibility Standards
14. **Skip-to-content links** — FIGAS layout has this (`checkin.tsx:37`).
15. **Keyboard navigable forms** — All interactive elements should be reachable via Tab.
16. **Screen reader labels** — All inputs need proper `aria-label` or associated `<label>`.
17. **Focus management** — After completing a check-in, focus should return to the next unprocessed passenger.

---

## 3. UX/UI AUDIT

### 3.1 Intuitiveness & Cognitive Load

**Strengths:**
- The 3-column counter layout (manifest | weights | POS) is a logical information hierarchy
- Passenger selection immediately activates POS — good cause-effect feedback
- Checked-in passengers are visually distinct (green text, line-through, checkmark)
- Remote-STY passengers show a clear informational state (amber banner, read-only)
- Flight progress bars provide instant situational awareness
- Skeleton loading states prevent layout shift

**Weaknesses (Critical):**
1. **The POS column shows unrelated till data when no passenger is selected** (`checkin.counter.tsx:439-449`). This violates progressive disclosure — the agent sees today's transactions even when they didn't ask for them, creating unnecessary cognitive noise.
2. **The flight filter dropdown in the manifest has only one option** (`checkin.counter.tsx:376-378`) — "This Flight" with no alternative. This is dead UI that suggests functionality that doesn't exist.
3. **Payment method buttons are always visible even when balance is paid** — they're conditionally hidden at `checkin.counter.tsx:466` but the space remains, creating visual instability.
4. **No undo after completing a check-in** — the action is irreversible in the UI (requires database rollback). While `void` clears the *current session*, once submitted, there's no reversal path.
5. **Weight override code is a free-text field** (`checkin.counter.tsx:482`) with no validation, auto-complete, or preset reasons. At minimum, "Scale Malfunction" should be a quick-select option.
6. **The cash keypad Enter key and the dedicated Enter button are redundant** (`checkin.counter.tsx:275,279`) — both do the same thing. This doubles the cognitive hit for learning the interface.

**Weaknesses (Moderate):**
7. **Body weight defaults to 70kg** (`checkin.counter.tsx:309`) — but if the passenger already has a recorded weight (`p.bodyWeightKg`), the `selectPax` function (`line 339`) overrides it with 70. This is a data-loss bug disguised as a UI default.
8. **No visual indication of which passengers have already been weighed** — the manifest shows checked-in status but not "weighed, not yet paid."
9. **Baggage tags print before payment is complete** — the Print Tags button is available as soon as weights are entered, not after sale completion.
10. **The "Complete Sale" button text changes based on balance** (`checkin.counter.tsx:518`) — this dual-purpose button (showing error message when disabled vs. call-to-action when enabled) violates the principle of predictable controls.

### 3.2 Spatial Efficiency & Visual Hierarchy

**Strengths:**
- Responsive grid adapts from 1-col (mobile) to 3-col (desktop) in counter view
- Consistent card-based container pattern across all routes
- Sidebar collapse toggle saves horizontal space
- Tabular numeric data uses `tabular-nums` for alignment

**Weaknesses (Critical):**
1. **The POS column (col 3) is significantly taller than columns 1 and 2** — the manifest has `max-h-[400px]` while POS can grow unbounded. When payments accumulate, the POS column extends far below the fold, creating a lopsided layout.
2. **Payment method buttons are small outlined pills packed tight** (`checkin.counter.tsx:468`) — `flex flex-wrap gap-1.5` with 4 buttons on a mobile viewport = difficult tap targets.
3. **The cash keypad is fixed at `w-40`** (`checkin.counter.tsx:277`) — too small for comfortable tapping on touchscreens. Industry standard POS keypads are at least 200-240px wide.
4. **No visual distinction between required and optional fields** — weight override code and authorization code inputs have no visual priority differentiation from critical fields like body weight.
5. **The weight presets buttons are labeled with tiny text** (`text-[10px]` at lines 415-416, 422-424) — nearly unreadable.

**Weaknesses (Moderate):**
6. **POS terminal (standalone) has a dual-panel layout** (`checkin.pos.tsx:325`) — Agent Display (flex-1) + Customer Display (w-80). On narrow screens, customer display stacks below. This is correct behavior but the customer display should be collapsible/togglable for agents who don't need it.
7. **The session bar in POS** (`checkin.pos.tsx:329`) packs 6 data points into one row — flight#, agent, passenger, capacity kg, capacity %. On small screens, `flex-wrap` causes unpredictable line breaks.
8. **KPI cards on the dashboard use `DashboardCard` but with inconsistent link behavior** — "Freight Consignments" is a link to `/checkin/freight`, but other KPIs are not interactive.
9. **The freight form** has 10 visible fields in a single card — no progressive disclosure (dimensions fields should be collapsed behind an "Advanced" toggle since they're optional).

### 3.3 Adherence to Modern UI Design Principles

**Evaluated against Nielsen's 10 Usability Heuristics and Material Design 3 principles:**

| Heuristic | Score | Notes |
|-----------|-------|-------|
| Visibility of system status | ⚠️ 6/10 | Flight progress bars are good. No loading indicator during check-in submission (full page redirect). Card processing shows "Processing..." but with `animate-pulse` that may not meet accessibility standards. |
| Match between system and real world | ✅ 8/10 | Cash keypad mimics physical POS. Payment methods use familiar terminology. Good mapping of flight → manifest → payment. |
| User control and freedom | ❌ 4/10 | No undo after check-in commit. Void only clears UI session, not submitted state. No "back" navigation within the counter workflow. |
| Consistency and standards | ⚠️ 6/10 | Tailwind classes are consistent. But color semantics vary (blue for scheduled flights in counter vs blue for all in dashboard). Status badges use different color schemes in different routes. |
| Error prevention | ❌ 3/10 | No inline validation on weight fields. No confirmation dialog before check-in submission. No duplicate-passenger detection. |
| Recognition rather than recall | ⚠️ 6/10 | Passenger list shows names but not booking details at a glance. Agent must select passenger to see weights. Payment history shown as reference codes, not passenger names. |
| Flexibility and efficiency of use | ⚠️ 5/10 | Quick-preset buttons for weights are a good accelerator. But no keyboard shortcuts, no bulk operations, no saved templates. |
| Aesthetic and minimalist design | ⚠️ 5/10 | Clean Tailwind styling. But the counter view has dead UI elements, the POS column overloads information, and the freight form is visually dense. |
| Help users recognize/diagnose errors | ❌ 3/10 | Error boundaries exist at route level but don't explain what went wrong. Action errors return generic "Something went wrong." Balance errors show as disabled button text, not as a dedicated error message. |
| Help and documentation | ❌ 2/10 | No tooltips, no inline help text, no onboarding flow, no contextual help for weight override or authorization codes. |

**Additional Modern Design Principle Violations:**

11. **No micro-interactions or transitions** — Passenger selection, payment addition, and weight changes happen instantly with no animation. This makes state changes hard to track.
12. **No haptic/tactile feedback** — For touchscreen POS usage, button presses should trigger visual feedback (scale animation, ripple).
13. **No dark mode consistency** — Most components have dark mode variants, but some (manifest, keypad) have incomplete dark mode coverage (`bg-white` hardcoded in some places).
14. **No responsive typography** — All text uses fixed `text-sm`, `text-xs` etc. No fluid type scale.

### 3.4 Technical Feasibility & Backend-Frontend Synchronization

**Strengths:**
- Remix SSR model ensures data freshness on every navigation
- `useFetcher` for POS finalization avoids full page reload
- Repository pattern separates data access from route logic
- Booking statuses gate check-in availability (`isCheckinAvailable()`)

**Weaknesses (Critical):**
1. **No optimistic UI** — Every weight change and payment addition requires a full server round-trip for the final check-in. While the POS uses `useFetcher` for async submission, the counter uses a `<Form method="post">` with full redirect. This means after every check-in, the entire page re-renders.
2. **Massive code duplication** between counter and POS:
   - `CashKeypad` component is copy-pasted (`checkin.counter.tsx:265-285` vs `checkin.pos.tsx:170-201`)
   - `CardProcessor` component is copy-pasted (`checkin.counter.tsx:288-303` vs `checkin.pos.tsx:204-235`)
   - Payment logic (addCash, addCard, addInvoice, addDeferred) duplicated
   - Balance calculation duplicated
   - Weight override audit trail duplicated in both action handlers
3. **Race condition risk** — Two agents checking in passengers on the same flight simultaneously could process the same passenger (no row-level locking on `booking_leg_passengers`).
4. **Payment recording is decoupled from check-in** — Payments are written, then check-in is called. If check-in fails after payment writes, payments are orphaned (no transaction wrapper).
5. **Freight consignments table** is not in Prisma schema — used via raw SQL only (`$queryRawUnsafe`). This means no type safety, no migration tracking, and potential for schema drift.
6. **`checkinRepository.confirmCheckin()` is marked deprecated** (`checkin.ts:213`) but still exists and is potentially callable. Dead code in production path.

**Weaknesses (Moderate):**
7. **Single monolithic action** (`checkin-with-payment`) handles 5 database writes with no transaction — weight update, booking update, override payment, regular payments, check-in flag. Any failure mid-way leaves inconsistent state.
8. **No idempotency protection** — A double-click on "Complete Sale" would attempt duplicate payment recording and check-in.
9. **Till payments query** (`checkin.counter.tsx:124-130`) uses `CURRENT_DATE` with `LIMIT 20` — if more than 20 payments occur in a day, older transactions silently drop off the till display.
10. **No webhook or event system** — When a passenger is checked in, no downstream systems are notified (loadsheet recalculation, schedule board refresh, passenger manifest update on other views).

---

## 4. STRATEGIC RECOMMENDATIONS

Recommendations are prioritized P0 (blockers/regressions), P1 (core UX uplift), P2 (polish), and P3 (future enhancements).

### 4.1 P0 — Critical (Ship Before Clean Room Redesign)

#### P0-1: Extract Shared Check-In Components
**Problem:** `CashKeypad` and `CardProcessor` are duplicated in `checkin.counter.tsx` and `checkin.pos.tsx`.
**Action:** Create `app/components/checkin/CashKeypad.tsx` and `app/components/checkin/CardProcessor.tsx`. Share them via imports.
**Files:** `checkin.counter.tsx:265-303`, `checkin.pos.tsx:170-236`

#### P0-2: Wrap Action Handler in Database Transaction
**Problem:** `checkin-with-payment` and `finalize` actions perform 5 sequential writes without atomicity. A failure after payment writes but before `checkIn()` orphans payments.
**Action:** Use Prisma's `$transaction` or `withTransaction()` wrapper (pattern already exists in `app/utils/repositories/transaction.ts`).
**Files:** `checkin.counter.tsx:159-205`, `checkin.pos.tsx:107-168`

#### P0-3: Add Idempotency Protection
**Problem:** Double-click on "Complete Sale" creates duplicate payments.
**Action:** Add a `_submissionId` hidden field (UUID generated on mount) and check for existing submissions before processing. Alternatively, disable the submit button immediately on click (using `useNavigation().state` or a local `isSubmitting` state for the `useFetcher` path).
**Files:** `checkin.counter.tsx:508-520`, `checkin.pos.tsx:299-310`

#### P0-4: Fix Body Weight Default Override Bug
**Problem:** `selectPax()` at `checkin.counter.tsx:339` sets `bodyWeight` to `p.bodyWeightKg ?? 70`. But if `p.bodyWeightKg` is `null`, the passenger's `clothed_body_weight_kg` from `booking_passengers` (which was fetched at line 141-145) should be used instead.
**Action:** Change the fallback chain to: `blp.clothed_weight_kg → bp.clothed_body_weight_kg → 70`.
**File:** `checkin.counter.tsx:309` (initial state), `lines 336-344` (selectPax)

#### P0-5: Add Row-Level Locking for Concurrent Check-Ins
**Problem:** Two agents could check in the same passenger simultaneously.
**Action:** Add `FOR UPDATE` to the passenger fetch query, or use `checked_in = false` as a WHERE condition in the UPDATE statement with affected-rows check.
**File:** `checkin.counter.tsx:109-122`, `checkin.counter.tsx:200`

#### P0-6: Add Freight Consignments to Prisma Schema
**Problem:** `freight_consignments` table accessed via raw SQL with no type safety or migration tracking.
**Action:** Add `freight_consignments` model to `prisma/schema.prisma`, generate types, update repository to use Prisma client.
**File:** `checkin.freight.tsx:54`, `prisma/schema.prisma`

### 4.2 P1 — High Priority (Core UX Uplift)

#### P1-1: Multi-Step Check-In Wizard
**Problem:** The 3-column layout packs flight selection, manifest, weights, and POS into a single view, overwhelming new agents.
**Action:** Implement a stepper-based wizard:

```
[1. Select Flight] → [2. Select Passenger] → [3. Enter Weights] → [4. Payment] → [5. Confirm & Print]
```

Each step is a focused view with a clear header, back/next navigation, and a progress indicator. The current 3-column layout can remain as a "power user" mode accessible via toggle.

**Reference:** The Wild Oasis pattern (2.1.4) — BookingDataBox → add-ons → confirm payment → single action button. Extend to 5 steps for the FIGAS domain.

#### P1-2: Inline Validation & Real-Time Feedback
**Problem:** Validation errors appear only at submission time (disabled button text).
**Action:**
- Validate body weight (≥20kg) on blur — show red border + inline error message
- Validate baggage weight (≥0) on input
- Show remaining balance as a persistent banner (not just button text)
- Add toast notifications for payment additions (using existing `Toast.tsx` component)
- Animate payment addition/removal with CSS transitions

**Files:** `checkin.counter.tsx:412-429`, `checkin.counter.tsx:507-522`

#### P1-3: Keyboard-First Counter Navigation
**Problem:** Counter agents using physical keyboards must reach for the mouse frequently.
**Action:**
- Tab order: Flight Select → Passenger List (arrow keys to navigate) → Weight Inputs → Payment Method → Amount → Submit
- Add keyboard shortcuts:
  - `Ctrl+Enter` = Complete Sale
  - `F1`-`F4` = Quick weight presets
  - `Escape` = Cancel/Back
  - `1`-`4` = Payment method selection
- Focus management: After successful check-in, auto-focus the next unchecked passenger

#### P1-4: Confirmation Dialog Before Submission
**Problem:** No confirmation step before committing the check-in.
**Action:** Add a modal or inline confirmation panel showing:
- Passenger name + booking reference
- Weights summary (body + baggage + excess charge)
- Payment summary (method breakdown)
- "Confirm Check-In" / "Go Back" buttons

**Reference:** The Wild Oasis pattern — "I confirm that [guest] has paid [amount]" checkbox before enabling Check In button.

#### P1-5: Search/Filter Passenger Manifest
**Problem:** The manifest filter dropdown has only one option and no text search.
**Action:** Remove the dead dropdown. Add a text input above the passenger list for name/reference search with real-time filtering.
**File:** `checkin.counter.tsx:374-378`

#### P1-6: Split Payment Visualization
**Problem:** Payments are shown as a flat list. Agent can't see what % is cash vs card vs invoice.
**Action:** Add a small pie/donut chart or stacked bar showing payment breakdown. Even a simple text summary ("Cash: £50 (62%), Card: £30 (38%)") would improve clarity.

#### P1-7: Remove Till Data from POS Column
**Problem:** The till transaction history appears in the POS column when no passenger is selected.
**Action:** Move till data to a dedicated "Till Summary" card below the 3-column grid or to a collapsible sidebar panel. The POS column should show a clear "Select a passenger to begin" prompt without distracting data.
**File:** `checkin.counter.tsx:439-449`

#### P1-8: Integrate React Hook Form
**Problem:** All form inputs use raw `<input>` with `useState`. No validation library, no dirty tracking, no form reset on navigation.
**Action:** Adopt React Hook Form (already popular in benchmarked projects — The Wild Oasis, ShivGanga). Benefits:
- Schema-based validation (Zod or Yup)
- Dirty form detection (warn before navigating away)
- Efficient re-renders (uncontrolled inputs)
- Easy integration with Remix `useFetcher` / `<Form>`

### 4.3 P2 — Medium Priority (Polish & Refinement)

#### P2-1: Micro-Interactions & Motion
- Add `transition-all duration-150` to passenger selection highlight
- Pulse animation on "Complete Sale" button when balanced
- Slide-in animation for payment entries
- Scale feedback on quick-preset button press
- Auto-scroll passenger list to newly checked-in item

#### P2-2: Undo/Reversal Workflow
- Add "Undo Check-In" capability (within 30 seconds of submission) — updates `checked_in = false` and voids associated payments
- Show a toast with "Undo" action after each check-in

#### P2-3: Consistent Status Color System
- Define a shared color palette for statuses across all routes:
  - `checked_in` = emerald
  - `unchecked` = slate
  - `remote` = amber
  - `boarding` = blue
  - `cancelled` = red
- Apply consistently in dashboard KPIs, manifest, lookup results, and booking views

#### P2-4: Responsive POS Keypad
- Increase keypad width to `min-w-[200px]` for touch targets
- Add haptic feedback class (`active:scale-95`) to keypad buttons
- Enlarge quick-cash buttons to match keypad button size

#### P2-5: Collapsible Freight Dimensions
- Hide length/width/height fields behind an "Advanced / Dimensions" toggle
- Default to collapsed since dimensional weight is optional
- Save ~60px of vertical space on the freight form

#### P2-6: Tooltips & Contextual Help
- Add `title` attributes to all icon-only buttons (void, print, remove payment)
- Add help text below weight override field explaining its audit purpose
- Add tooltip on excess baggage warning explaining the £5/kg rate

#### P2-7: Empty States & Error Messaging
- Replace generic "Something went wrong" with actionable messages:
  - "Flight not found. It may have been cancelled. Return to flight selection."
  - "Payment could not be processed. Please check the terminal and try again."
- Add empty state illustrations for: no flights today, no unprocessed passengers, no search results

#### P2-8: Print Workflow Enhancement
- Move Print Tags button to after payment completion (or gate it behind `isBalanced`)
- Add a print confirmation dialog with "Print" / "Skip" options
- Add "Reprint" capability in the passenger manifest for already checked-in passengers

### 4.4 P3 — Future Enhancements (Roadmap)

#### P3-1: Offline-First Counter Mode
- Cache today's flight data in localStorage/IndexedDB
- Queue check-in operations when offline, sync when reconnected
- Show sync status indicator in the header

#### P3-2: Real-Time Multi-Agent Sync
- Use WebSockets or Supabase Realtime to broadcast check-in events
- Other agents see passengers disappear from manifest in real-time
- Prevent two agents from starting check-in on the same passenger

#### P3-3: Check-In Kiosk / Self-Service Mode
- Passenger-facing interface for self check-in
- QR code scan → weight input → payment → boarding pass print
- Counter agent oversight dashboard for kiosk sessions

#### P3-4: Email/SMS Check-In Reminders
- Implement the dormant `checkin_reminders` sending infrastructure
- Send email/SMS 24h and 2h before flight departure
- Use SendGrid/Twilio (already in the ShivGanga reference tech stack)

#### P3-5: Analytics Dashboard
- Check-in velocity (passengers/hour over time)
- Payment method distribution (cash vs card vs invoice)
- Excess baggage revenue tracking
- Peak/off-peak check-in time analysis
- Agent performance metrics

#### P3-6: Baggage Tag Barcode/QR Generation
- Generate IATA-standard baggage tag barcodes
- Scan-to-track baggage through loading/unloading
- Integrate with the loadsheet system

#### P3-7: Integration Testing Suite
- Write integration tests for the full check-in workflow
- Test concurrent check-in (two agents, same flight)
- Test payment edge cases (zero amount, overpayment, partial payment)
- Test weight boundary conditions (exactly 20kg, negative weights, extreme values)

---

## APPENDIX A: Current vs. Target Scorecard

| Dimension | Current Score | Target Score | Gap |
|-----------|---------------|--------------|-----|
| Workflow intuitiveness | 5/10 | 9/10 | P1-1, P1-4 |
| Error prevention | 3/10 | 8/10 | P0-2, P0-3, P0-5, P1-2 |
| Input efficiency | 5/10 | 9/10 | P1-3, P1-5 |
| Visual hierarchy | 6/10 | 9/10 | P1-7, P2-5, P2-7 |
| Accessibility (a11y) | 4/10 | 8/10 | P1-3, P2-6 |
| Code quality / DRY | 4/10 | 9/10 | P0-1, P1-8 |
| Data integrity | 4/10 | 9/10 | P0-2, P0-3, P0-4, P0-5, P0-6 |
| Test coverage | 1/10 | 7/10 | P3-7 |
| Offline resilience | 0/10 | 6/10 | P3-1 |
| Real-time sync | 0/10 | 7/10 | P3-2 |

---

## APPENDIX B: File Change Impact Map

| Recommendation | Files Modified | Files Created | Test Impact |
|----------------|---------------|---------------|-------------|
| P0-1: Extract components | `checkin.counter.tsx`, `checkin.pos.tsx` | `CashKeypad.tsx`, `CardProcessor.tsx` | Update imports in E2E tests |
| P0-2: Transaction wrapper | `checkin.counter.tsx`, `checkin.pos.tsx` | — | Add integration tests |
| P0-3: Idempotency | `checkin.counter.tsx`, `checkin.pos.tsx` | — | Add double-submit E2E test |
| P0-4: Weight bug fix | `checkin.counter.tsx` | — | Add unit test |
| P0-5: Row locking | `checkin.counter.tsx` | — | Add concurrency integration test |
| P0-6: Freight schema | `schema.prisma`, `checkin.freight.tsx` | Migration file | Verify freight E2E |
| P1-1: Wizard UI | `checkin.counter.tsx` | `CheckinWizard.tsx`, `CheckinStep*.tsx` | Rewrite counter E2E tests |
| P1-2: Inline validation | `checkin.counter.tsx` | — | Add validation unit tests |
| P1-3: Keyboard nav | `checkin.counter.tsx` | — | Add keyboard E2E tests |
| P1-4: Confirmation dialog | `checkin.counter.tsx` | `ConfirmCheckinModal.tsx` | Add modal E2E tests |
| P1-5: Manifest search | `checkin.counter.tsx` | — | Add search E2E test |
| P1-6: Split payment viz | `checkin.counter.tsx` | `PaymentBreakdown.tsx` | — |
| P1-7: Till relocation | `checkin.counter.tsx` | — | Update layout E2E |
| P1-8: React Hook Form | `checkin.counter.tsx`, `checkin.pos.tsx`, `checkin.freight.tsx` | — | Update all form tests |

---

*End of Report*
