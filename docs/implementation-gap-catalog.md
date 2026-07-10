# FIGAS Implementation Gap Catalog

> **Generated:** 2026-07-09
> **Source:** Cross‑reference of [`docs/WORKFLOWS.md`](WORKFLOWS.md) v1.1 against the current codebase.
> **Method:** Compared documented workflows, routes, and service calls against the actual code files.

---

## GAP 1.1 — Freight in booking leg creation

**Workflow §1 Step 2** lists `freight_description` and `freight_weight_kg` as optional inputs on the leg form.

**Reality:** The booking leg creation UI does NOT expose these fields. Freight is only recorded via the separate `/checkin/freight` route (check-in workflow). Migration 016 moved freight columns to `booking_leg_passengers` (per‑passenger), not `booking_legs`.

**Impact:** Operations cannot record freight at booking time; freight can only be declared at check‑in.

---

## GAP 1.2 — Weight‑limit validation enforcement

**Workflow §1** lists `MAX_PASSENGER_WEIGHT_KG` (300), `MIN_PASSENGER_WEIGHT_KG` (20), `MAX_BAGGAGE_WEIGHT_KG` (50).

**Reality:** These constants exist in [`constants.ts`](../app/utils/constants.ts) but their enforcement location in the booking wizard has not been verified.

**Impact:** Unclear whether weight limits are enforced at booking time or only later in the pipeline.

---

## GAP 2.1 — Pay‑on‑Departure / Pay‑on‑Arrival at counter

**Workflow §2 Step 5** describes collecting payment at the counter for pay‑on‑departure/arrival methods, creating accounting journal entries.

**Reality:** The POS terminal exists ([`checkin.counter.tsx:190`](../app/routes/checkin.counter.tsx)) and records payments. Manual payment flows go through [`payment.service.ts`](../app/utils/services/payment.service.ts) which creates accounting entries. The workflow references `checkinRepository` methods that may not exist as described.

**Impact:** The workflow is accurate in spirit; doc methods (`getOutstandingBalance`, `recordPayment`) should be verified against actual repository names.

---

## GAP 3.1 — `nearest‑neighbor.ts` deleted, docs still reference it

**Workflow §3 Phase 2** references [`nearest-neighbor.ts`](../app/utils/scheduling/nearest-neighbor.ts) and `buildRoute()`.

**Reality:** This file was **DELETED** in the CVRP refactor. The current implementation uses [`cvrp-solver.ts`](../app/utils/scheduling/cvrp-solver.ts) with `DEPOT = "STY"`. All line numbers and function references to nearest‑neighbor in the docs are stale. Also: §3 line 302 says `PSY` — should be `STY`.

**Impact:** Developers following the docs would look for files that no longer exist. The routing logic is fundamentally different (CVRP vs greedy heuristic).

---

## GAP 3.2 — Schedule 8‑stage lifecycle vs 6‑stage actual

**Workflow §6 (Schedule Status Pipeline)** shows 8 stages: `BUILDING → APPROVED → PUBLISHED → PILOT_ASSIGNED → LOADSHEET_GENERATED → IN_PROGRESS → COMPLETED | CANCELLED`.

**Reality:** The actual [`ScheduleStatus`](../app/utils/constants.ts:344‑351) enum defines only 6 values: `DRAFT`, `BUILDING`, `APPROVED`, `PUBLISHED`, `COMPLETED`, `CANCELLED`. The intermediate stages `PILOT_ASSIGNED`, `LOADSHEET_GENERATED`, and `IN_PROGRESS` **do not exist in code**.

**Impact:** The docs list stages the app cannot reach or transition through. Any code or test attempting to set these statuses would fail.

---

## GAP 4.1 — Freight cost £2/kg placeholder

**Workflow §4 Step 1** says *"Add freight costs (£2/kg placeholder)."*

**Reality:** [`payment.service.ts:71`](../app/utils/services/payment.service.ts) uses `FREIGHT_RATE_PER_KG`. It is still a hardcoded placeholder rate, not configurable per‑route or per‑aerodrome.

**Impact:** Freight pricing is not accurate for operations; all freight is billed at the same rate regardless of route distance.

---

## GAP 4.2 — Dual‑control approval for journal entries

**Workflow §4** describes `approveJournalEntry()` with no self‑approval and hierarchy checks.

**Reality:** The function exists at [`invoice.service.ts:715`](../app/utils/services/invoice.service.ts) but the actual enforcement of the stated rules (no self‑approval, hierarchy check) has not been verified.

**Impact:** Financial controls may be weaker than documented.

---

## GAP 5.1 — Manifest route path differs from docs

**Workflow §5** references route **`GET /operations/flights/:flightId/manifest`**.

**Reality:** No such route file exists. The current implementation uses:
- A [`LoadsheetModal`](../app/components/loadsheet/LoadsheetModal.tsx) component that fetches `/ops/flight/:id/loadsheet`
- A dedicated loadsheet page at `/ops/flight/:flightId/loadsheet`

The `/operations/flights/` directory does not exist as a route group.

**Impact:** Docs reference a route that returns a 404. Developers following the docs would dead‑end.

---

## GAP 5.2 — Pilot sign‑off on manifest

**Workflow §5 Step 2** describes a pilot sign‑off action setting `pilot_signoff = true`.

**Reality:** The pilot briefing route ([`pilot.briefing.$flightId.tsx`](../app/routes/pilot.briefing.$flightId.tsx)) has an "Accept Briefing" button that records acceptance. Whether the loadsheet/manifest has a separate sign‑off mechanism was not verified.

**Impact:** The pilot sign‑off flow may exist through the briefing route rather than the manifest.

---

## GAP 7.1 — Freight management page link

**Workflow §7 E4** describes freight as *"Links to the full freight management page."*

**Reality:** The booking detail page loads freight data from `booking_leg_passengers` and displays freight line items. Whether the link to the full freight management page is functional needs verification on a booking with freight data.

**Impact:** Unknown if the freight management navigation is wired.

---

## GAP 7.2 — Fare calculator residency multiplier (×1.5)

**Workflow §7 Fare Calculation Service** states *"non‑residents pay a premium (×1.5)."*

**Reality:** [`fare-calculator.ts`](../app/utils/services/fare-calculator.ts) uses `fareRouteRepository.getBaseFare()` directly with **no residency coefficient applied**. No ×1.5 multiplier logic exists in the fare calculation code.

**Impact:** All passengers are charged the same fare regardless of residency status. The documented residency‑based pricing policy is not implemented.
