# BOOKING MODULE UI/UX AUDIT & ENHANCEMENT PROMPT

## 1. Context & Goal
You are tasked with a comprehensive UI/UX audit of the entire **Booking Lifecycle** within the FIGAS Flight Operations System. This module is the core of the business, handling everything from passenger self-service bookings to complex multi-leg, multi-passenger itineraries managed by operations staff.

**Goal:** Identify usability friction, accessibility violations, data presentation issues, and missing features. Your output must be a prioritized, actionable plan that enhances the user experience for all personas (Passengers, Agents, Operations) without breaking existing functionality.

**Reference Materials:**
- **Route Files:** `app/routes/bookings.*.tsx`, `app/routes/agent.bookings.*.tsx`, `app/routes/operations.bookings.*.tsx`
- **Components:** `app/components/BookingWizard.tsx`, `app/components/PassengersTable.tsx`, `app/components/LegsTable.tsx`, `app/components/BookingCard.tsx`, `app/components/BookingTimeline.tsx`
- **Documents:** `WORKFLOWS.md` (Section 1: Booking Creation), `ARCHITECTURE.md` (Section 4: Component Architecture), and the UI snippets provided in the chat context.
- **Domain Contract:** `.agents/skills/booking/SKILL.md` — Authoritative invariants, validation rules, and data flow for the booking system.

---

## 0. Backward Compatibility & Non-Regression Mandate

### 0.1 Prime Directive
Every finding and recommendation MUST preserve 100% backward compatibility with the existing booking system. No change may alter existing API contracts, database schemas, route signatures, or component prop interfaces in a breaking way.

### 0.2 Invariant Protection (from booking SKILL.md)
These invariants are non-negotiable. No audit recommendation may violate them:

| # | Invariant | Contract |
|---|-----------|----------|
| I1 | Booking Reference Uniqueness | Generated ONLY via `bookingRepository.createPending()` with 10x retry on P2002 |
| I2 | Minimum One Leg, One Passenger | Wizard must not advance without at least one committed leg and passenger row |
| I3 | Junction Completeness | Every passenger�—leg must exist in `booking_leg_passengers`. 2 legs + 3 pax = 6 rows |
| I4 | Fare Calculation Consistency | `computeBookingCost()` in `booking-costing.server.ts` is the single source of truth |
| I5 | Leg Sequence Order | `leg_sequence` starts at 1, increments by 1, no gaps |
| I6 | Payment Method Values | Only: `stripe`, `invoice`, `pay_on_departure`, `pay_on_arrival`, `null` |
| I7 | Status Lifecycle | `pending→confirmed→paid/completed`, `pending→cancelled`, `confirmed→cancelled` |
| I8 | Discount Type Values | Only: `none`, `child`, `student`, `senior`, `veteran`, `staff` |

### 0.3 Non-Regression Gate Checks
Before any change is committed, run these checks:

1. **Lint:** `npm run lint` — must pass with zero new warnings/errors
2. **Type check:** `npm run typecheck` — must pass with zero new errors
3. **Related tests:** `npm run test:related` — all booking-related tests must pass
4. **Existing route signatures:** No loader/action signatures may change. `json()` return shapes may only be extended (additive), never reduced.
5. **Component prop interfaces:** Props may only be extended with optional fields. Required fields must remain required.
6. **Payment flow:** Stripe session creation, invoice generation, and offline payment selection must continue to work with the same `intent` values.
7. **Permission gates:** All `requirePermission()` and `hasPermission()` calls must be preserved. No permission check may be weakened or removed.
8. **Search/filter contracts:** `bookingRepository.search()` ILIKE query behavior must not change. Filter parameter names in URL search params must remain stable.
9. **Mobile responsive breakpoints:** Existing `hidden md:block` / `block md:hidden` patterns must be preserved.

### 0.4 Compatibility Verification Checklist
For each file modified:
- [ ] Existing imports unchanged (additions only)
- [ ] Loader return type extends previous shape (additive)
- [ ] Action intents preserved (new intents added, none removed)
- [ ] Component prop interfaces backward-compatible
- [ ] CSS class changes only additive (no removal of existing classes that affect layout)
- [ ] ErrorBoundary components preserved on every route file
- [ ] Skeleton/loading states preserved for every data-dependent section
- [ ] `useSearchParams` synchronization logic unchanged
- [ ] Form field `name` attributes unchanged (new fields additive)
- [ ] No change to `leg_sequence` generation logic
- [ ] No change to booking reference generation logic
- [ ] Fare calculation calls go through `computeBookingCost()` only

### 0.5 Scope Boundaries
- **Do NOT modify:** `package.json`, `tsconfig.json`, `.eslintrc.cjs`, `vite.config.ts`, CI/CD files, `prisma/schema.prisma`, database migrations
- **Do NOT rename:** Route files, exported component names, exported function names
- **Do NOT remove:** Error handling blocks, fallback logic, safety checks, permission checks
- **Do NOT change:** API response shapes (extend only), form field names, URL search param keys

---

## 2. Scope & Personas
Audit the following flows from the perspective of these user roles:

| Persona | Primary Flows |
| :--- | :--- |
| **Passenger** (Self-Service) | List My Bookings (`bookings._index`), View Detail (`bookings.$bookingId`), Create Simple Booking (`bookings.new`), Make Payment (`bookings.$bookingId.payment`). |
| **Agent** (Travel Agency/Corporate) | List Client Bookings (`agent.bookings._index`), View/Edit Client Detail (`agent.bookings.$bookingId`). |
| **Operations Staff** | Full CRUD (`operations.bookings.*`), 4-Step Wizard, Passenger Management, Freight Management, Status Transitions, Cancellations. |

---

## 3. UX Heuristics to Evaluate (Nielsen's 10 + Aviation Specifics)

1.  **Visibility of System Status:** Are users always informed of what's happening (loading, saving, processing payment, status transitions)?
2.  **Match Between System & Real World:** Does the terminology (e.g., "Legs", "Junction", "Freight Consignment") match the FIGAS domain language? Are dates/times displayed clearly (DD/MM/YYYY)?
3.  **User Control & Freedom:** Is it easy to backtrack in the Booking Wizard? Can users easily remove passengers/legs before saving?
4.  **Consistency & Standards:** Is the `DataTable` used uniformly? Are buttons consistently styled (`Button` component vs custom inline buttons)?
5.  **Error Prevention:** Are there confirmation modals for destructive actions (Cancel booking, Remove passenger)? Is validation proactive (e.g., checking max passenger weight, no-fly days)?
6.  **Recognition over Recall:** Does the `PassengerSearchCombobox` (to be implemented) help users find repeat passengers, or are they forced to re-type names every time?
7.  **Flexibility & Efficiency:** Are there batch operations for operations staff (e.g., bulk check-in, bulk status update)?
8.  **Aesthetic & Minimalist Design:** Are the detail pages cluttered? Does the `ExpandableSection` pattern effectively reduce cognitive load?
9.  **Help Users Recover from Errors:** Are error messages specific (e.g., "Flight #123 is full" vs "An error occurred")?
10. **Help & Documentation:** Is there in-context help (tooltips, onboarding tours like the `TourTrigger` added to `checkin.counter`)?

---

## 4. Specific Areas for Deep Inspection

### A. Booking List Pages (`bookings._index.tsx`, `operations.bookings._index.tsx`, `agent.bookings._index.tsx`)
- **Filtering/Searching:** Is the search robust (partial name, booking reference, flight number)? Are date filters intuitive?
- **Mobile Responsiveness:** The `_index` has a mobile card view (`block md:hidden`). Does this work well on small screens?
- **Status Indicators:** Are `StatusBadge` and `PaymentStatusBadge` easy to scan? Is there a visual indication of urgency (e.g., bookings awaiting action highlighted)?
- **Pagination:** Is `Pagination` placed logically? Does it persist filters across pages?

### B. The 4-Step Booking Wizard (`BookingWizard.tsx` & related actions)
- **Step Progression:** Are the steps logical (Details → Legs → Passengers → Junction)? Is there a clear progress indicator?
- **Data Entry:**
  - *Step 1 (Details):* Is the organization billing toggle clear? Is the "Booking Source" field necessary for the user?
  - *Step 2 (Legs):* Is the `LegsTable` dynamic and easy to add/remove rows? Is route validation (duplicate origins/destinations) handled?
  - *Step 3 (Passengers):* Is it clear that passenger fields (Name, DOB, Weight) are required? Is `DOBPicker` implemented? (I saw a placeholder).
  - *Step 4 (Junction):* This is the most complex step. Is it visually clear which passengers are assigned to which legs? Is there drag-and-drop or a checkbox matrix? *Currently, it's likely just a loop.* Suggest how to make this more visual.
- **Backtracking/Editing:** Does the user lose data if they go back to a previous step?
- **Saving vs. Submit:** In `bookings.new.tsx`, it redirects immediately. Is there an intermediate "Draft" state? If the user doesn't finish all 4 steps, is the booking lost? (Critical gap!).

### C. Booking Detail Page (`bookings.$bookingId.tsx` & `operations.bookings.$bookingId.tsx`)
- **Information Architecture:** Analyze the use of `ExpandableSection` (Passengers, Seats, Freight, Itinerary, Payment).
  - Are the most important details (Status, Countdown bar, Hero section) prioritized at the top?
  - Is the "Status Progression Indicator" a stepper? Does it handle "cancelled" states gracefully?
- **Actions (Buttons):** Are they contextually placed? (e.g., "Make Payment" should be prominent if `payment_status` is pending). Are they disabled correctly if the booking is past or cancelled?
- **Data Density:** Is there too much information on the Operations detail page? Could there be tabs (Basic Info, Manifest, Payments, History)?
- **Post-Booking Changes:** `PostBookingChanges` (refunds/top-ups) exists. Is it discoverable? Does it have sufficient context (showing the current vs. calculated fare)?

### D. Payment Flow (`bookings.$bookingId.payment.tsx`, `payment-success`, `payment-cancel`)
- **Cost Transparency:** Before paying, is the `totalCost` breakdown displayed clearly? (Passengers �— Fare + Freight + Excess Baggage?).
- **Method Selection:** Is `PaymentMethodSelector` clear? Does it show the differences between "Pay on Departure" vs "Invoice" clearly?
- **Bank Transfer Instructions:** When invoice is generated, are the bank details prominent? Is the "Payment Reference" (`FIG-{bookingId}`) clearly highlighted to ensure proper reconciliation?
- **Error States:** Are `payment-cancel` and `payment-success` pages informative? Do they offer clear next steps?

### E. Freight Management (within Bookings)
- In `operations.bookings.$bookingId.tsx`, the Freight section is hidden behind an expander. Is there a dedicated "Freight" tab or page missing? `checkin.freight.tsx` exists, but is it integrated correctly with the booking detail page?
- Is the freight weight contributing to the total cost displayed visually?

### F. Accessibility (a11y)
- **Forms:** Check all `<input>` and `<label>` associations. (I noticed in `bookings.new.tsx`, the `DatePicker` uses a hidden input; ensure the label is properly connected).
- **ARIA:** Does the status stepper use appropriate `aria-current="step"`? Are `DataTable` headers marked `aria-sort`?
- **Keyboard Navigation:** Can users complete the entire booking wizard without a mouse?
- **Focus Management:** When modals open or errors appear, is focus correctly shifted?

### G. Responsiveness
- Test the Booking Detail page on a 320px wide screen. Does the layout stack properly?
- Is the `DataGrid` (table) scrollable horizontally on mobile?

---

## 5. Deliverables

Produce a structured report with the following sections:

### 5.1 Executive Summary
- An overall rating (A-F) for the Booking UX.
- The top 3 most critical blockers (e.g., "Draft booking loss on page refresh", "No passenger search duplication", "Mobile layout broken on payment page").
- **Must include a Non-Regression Summary:** Verify that all invariants (I1-I8 from Section 0.2) remain satisfied with proposed changes.

### 5.2 Detailed Findings (Organized by Flow/Page)
For each finding, provide:
- **Issue Title:** e.g., "Lack of Draft Auto-Save"
- **Location:** Specific file and line (e.g., `app/routes/operations.bookings.new.tsx:45`).
- **Persona Affected:** Passenger, Agent, or Ops.
- **Severity:** P0 (Critical/Blocking), P1 (High), P2 (Medium), P3 (Low).
- **User Story:** "As a user, I want to save my progress so I don't lose data..."
- **Recommendation:** Specific code change or design pattern.
- **Invariant Impact:** Which invariants from Section 0.2 are affected (if any). Must be "None" for all recommendations.
- **Backward Compatibility:** How the fix preserves existing contracts (if applicable).

### 5.3 Feature Completeness Gaps
Compared to `WORKFLOWS.md` and `MASTER-PLAN.md`, identify features that are:
- **Missing UI** (e.g., The `PassengerSearchCombobox` is referenced but not fully hooked up to search registered users).
- **Partial Implementation** (e.g., `BookingCostSummary` is placed, but is it calculating and displaying real-time changes?).
- **Unconnected** (e.g., `PostBookingChanges` UI exists, but is the backend action fully hooked up?).

Each gap must include a **BC Risk Assessment:** "Low" (additive only), "Medium" (extends existing interface), or "High" (requires schema/API change — needs explicit approval).

### 5.4 Prioritized Implementation Plan
Create a task list (similar to the MASTER-PLAN format) specific to the Booking module.

| ID | Task | Severity | Effort (Hours) | Dependencies | BC Risk |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **BK-01** | Implement "Draft" auto-save for booking wizard to prevent data loss. | P0 | 8 | - | Low |
| **BK-02** | Fully integrate `PassengerSearchCombobox` into passenger form rows to reduce data duplication. | P1 | 6 | Data Model Migration (from the previous prompt) | Low |
| **BK-03** | Add "Bulk Check-in" and "Bulk Status Update" options in Operations booking list. | P1 | 4 | - | Low |
| ... | ... | ... | ... | ... | ... |

### 5.5 Compatibility Regression Test Plan
For each implemented task, specify the exact test commands and assertions to verify no regressions:
```bash
npm run lint          # Zero new errors
npm run typecheck     # Zero new errors
npm run test:related  # All booking tests pass
```
Manual verification checklist:
- [ ] Customer can create a simple booking via `/bookings/new`
- [ ] Operations staff can create multi-leg multi-passenger booking via wizard
- [ ] Agent portfolio loads correctly with client grouping
- [ ] Payment methods all display and function (Stripe redirect, invoice generation, pay-on-departure)
- [ ] Booking status transitions via both customer and operations detail pages
- [ ] Search by reference/passenger name works across all list views
- [ ] Date range filtering works on operations and customer list pages
- [ ] Mobile card view renders on 320px width without overflow
- [ ] All ErrorBoundary components render correctly on forced error

### 5.6 Recommendations for Future Iterations
- Suggest analytics tracking (e.g., drop-off points in the wizard).
- Suggest A/B testing for the "Junction" step (matrix vs. drag-and-drop).
- Version the audit report: include `audit_version: 1.0.0` and `last_updated` timestamp for traceability.

---

## 6. Instructions for the Agent

1.  **Review all attached code snippets** and the full context of `app/routes/` as described in `PROJECT_STRUCTURE.md`.
2.  **Prioritize pragmatic fixes.** Suggest code reuse (e.g., if a `Button` is custom in one file and standard in another, recommend standardizing).
3.  **Cross-reference with existing plans.** `MASTER-PLAN.md` already mentions "Shelfware Integration" (IA-11, IA-12). Don't duplicate those, but validate if they are addressed.
4.  **Be specific.** Avoid generic statements like "Improve mobile design." Instead, say: "In `bookings.$bookingId.tsx`, the passenger table overflows horizontally on mobile. Wrap it in `overflow-x-auto` and adjust padding."
5.  **Balance "Nice to have" vs "Must have".** The user wants to prioritize clean implementations, so ensure P0 tasks are truly critical.
6.  **Non-Regression Enforcement:** After every file edit, verify:
    - No imports were removed (only added)
    - No exported function signatures changed
    - No form field `name` attributes modified
    - No URL search param keys changed
    - No existing CSS classes removed that affect layout
    - ErrorBoundary still present on every route file
7.  **Invariant Verification:** Before proposing any change, check against all 8 invariants in Section 0.2. A change that violates any invariant is automatically invalid and must be reworked.
8.  **Run quality gates after ALL changes:** `npm run lint && npm run typecheck`. Never skip this step. If lint or typecheck fails, fix the errors before proceeding.

---

**Final Note:** This audit is non-live, so we prioritize conceptual correctness and architectural cleanliness. Do not suggest temporary hacks. Suggest robust solutions (e.g., using `localStorage` for wizard draft saves, rather than complex server state if not ready). All recommendations must be backward-compatible: additive interfaces only, no removal of existing functionality.

**Deliverable:** A single markdown document titled `BOOKING_UX_AUDIT_REPORT.md` containing the sections outlined above, plus a compatibility regression test plan per Section 5.5.