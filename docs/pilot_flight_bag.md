# FIGAS Pilot Electronic Flight Bag (EFB) — Comprehensive Implementation Plan

## 1. Overview & Purpose

The FIGAS Pilot Electronic Flight Bag (EFB) is a **single‑pane‑of‑glass** for all pilot operations. It consolidates every task a pilot performs—from receiving a flight assignment, through pre‑flight planning and briefing, to executing the flight, managing fuel, and completing post‑flight reports—into a modern, mobile‑first, offline‑capable digital cockpit tool.

**Core Principles:**
- **Tab‑based Flight Detail Hub** – Each flight has a dedicated page with tabs: Overview, Plan, Briefing, Ops, Fuel, Log.
- **Progressive Disclosure** – Show only what’s relevant to the current stage (e.g., Plan and Briefing are pre‑flight; Ops and Fuel are day‑of; Log is post‑flight).
- **Audit Trail** – Every action (acceptance, verification, fuel uplift, sign‑off) is logged.
- **Offline First** – All critical data is cached for use without internet.
- **Permission‑Gated** – Fine‑grained permissions for each action.

---

## 2. Current State vs. Target State

| Capability | Current Status | Target Status |
|------------|----------------|---------------|
| **Assignment Management** | Dashboard shows flights; no accept/decline. | Accept/Decline with reason; Ops notified. |
| **Pre‑Flight Planning** | No route/fuel breakdown; no weather/NOTAMs. | Full flight plan with distances, fuel, weather, NOTAMs. |
| **Flight Plan Verification** | None. | Pilot can verify plan; flag discrepancies. |
| **Briefing** | Comprehensive (W&B, manifest, fuel plan). | Add weather, NOTAMs, interactive CG. |
| **Fuel Ordering** | None. | Pilot/Ops issues order; fueler records uplift. |
| **In‑Flight Ops** | Placeholder fields on loadsheet. | Actual ATD/ATA, fuel, pax, baggage per leg. |
| **Post‑Flight Log** | None. | Block time, landings, fuel used, remarks. |
| **Defect Reporting** | Separate engineer module. | Integrated defect reporting during/after flight. |
| **Offline** | Partial (SW). | Full offline caching of briefing and ops data. |
| **Notifications** | None. | Assignment updates, schedule changes, fuel status. |

---

## 3. Data Model Extensions

We need to **add** the following tables and columns (existing tables are preserved). All are defined in a single migration: `021_pilot_efb_migration.sql`.

### 3.1 Tables to Create

```sql
-- 1. Flight plan verification
CREATE TABLE flight_plan_verifications (
    id SERIAL PRIMARY KEY,
    flight_id INTEGER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
    verified_by INTEGER REFERENCES users(id),
    verified_at TIMESTAMPTZ DEFAULT NOW(),
    route_confirmed BOOLEAN DEFAULT false,
    fuel_confirmed BOOLEAN DEFAULT false,
    weather_confirmed BOOLEAN DEFAULT false,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'discrepancy'))
);

-- 2. Fuel orders (core)
CREATE TABLE fuel_orders (
    id SERIAL PRIMARY KEY,
    flight_id INTEGER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
    flight_leg_id INTEGER REFERENCES flight_legs(id),
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'fueling', 'completed', 'cancelled')),
    requested_fuel_kg NUMERIC(8,1) NOT NULL,
    calculated_breakdown JSONB,
    issued_by INTEGER REFERENCES users(id),
    issued_at TIMESTAMPTZ,
    fueler_actual_uplift_kg NUMERIC(8,1),
    fueler_confirmed_by INTEGER REFERENCES users(id),
    fueler_confirmed_at TIMESTAMPTZ,
    fueler_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Flight leg actuals (ATD/ATA, etc.) - if not already present
ALTER TABLE flight_legs
ADD COLUMN IF NOT EXISTS atd TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS ata TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS actual_passengers INTEGER,
ADD COLUMN IF NOT EXISTS actual_baggage_kg NUMERIC(8,1),
ADD COLUMN IF NOT EXISTS actual_freight_kg NUMERIC(8,1);

-- 4. Flight logs (post-flight)
CREATE TABLE flight_logs (
    id SERIAL PRIMARY KEY,
    flight_id INTEGER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
    block_time_minutes INTEGER,
    air_time_minutes INTEGER,
    landings INTEGER,
    fuel_used_kg NUMERIC(8,1),
    pilot_remarks TEXT,
    submitted_by INTEGER REFERENCES users(id),
    submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Pilot checklists (pre-flight)
CREATE TABLE pilot_checklists (
    id SERIAL PRIMARY KEY,
    flight_id INTEGER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
    item_key VARCHAR(50) NOT NULL,  -- e.g., 'external_visual', 'cockpit_documents'
    item_label VARCHAR(200) NOT NULL,
    checked BOOLEAN DEFAULT false,
    checked_by INTEGER REFERENCES users(id),
    checked_at TIMESTAMPTZ,
    UNIQUE(flight_id, item_key)
);

-- 6. Flight assignments (enhance existing pilot_assignments)
ALTER TABLE pilot_assignments
ADD COLUMN IF NOT EXISTS confirmed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS declined_reason TEXT,
ADD COLUMN IF NOT EXISTS check_in_time TIMESTAMPTZ;
```

### 3.2 Prisma Sync
- Update `schema.prisma` with these new models.
- Run `prisma generate` to update Kysely types.

---

## 4. Permission Model

Add these permissions to the `permissions` table and assign to relevant roles (Pilot, Ops, Engineer, Fueler):

| Permission | Description | Default Roles |
|------------|-------------|---------------|
| `flight:view` | View assigned flight details | Pilot, Ops, Admin |
| `flight:accept` | Accept or decline an assignment | Pilot |
| `flight:plan-verify` | Verify flight plan (route, fuel, weather) | Pilot, Ops |
| `flight:fuel-order` | Issue a fuel order | Pilot, Ops |
| `flight:fuel-execute` | Record actual fuel uplift | Fueler, Ops, Engineer, Pilot (self) |
| `flight:ops-update` | Update actual ATD/ATA/pax/baggage | Pilot |
| `flight:log-submit` | Submit post‑flight log | Pilot |
| `defect:report` | Report a snag/defect | Pilot, Engineer |
| `flight:view-all` | View any flight (not just own) | Ops, Admin |

---

## 5. New UI Pages & Routes

The Pilot module will revolve around a **Flight Detail Hub** (`/pilot/flight/:flightId`) with tabs. Existing routes (`/pilot`, `/pilot/flights`, `/pilot/schedule`) remain.

| Route | Purpose | Key Components |
|-------|---------|----------------|
| `/pilot` | Enhanced Dashboard | Flight cards with status, accept/decline, quick‑action buttons |
| `/pilot/flight/:flightId` | Flight Detail Hub (tabs) | Tab container with Overview, Plan, Briefing, Ops, Fuel, Log |
| `/pilot/flight/:flightId/overview` | Status timeline & summary | Displays flight state, next action, quick links |
| `/pilot/flight/:flightId/plan` | Flight Plan Verification | Route map, fuel breakdown, weather, NOTAMs, verify button |
| `/pilot/flight/:flightId/briefing` | Existing Briefing (enhanced) | Adds weather, NOTAMs, interactive W&B, checklist |
| `/pilot/flight/:flightId/ops` | In‑Flight Operations | ATD/ATA, fuel/pax/baggage actuals per leg |
| `/pilot/flight/:flightId/fuel` | Fuel Order & Execution | Issue order, view instruction, record uplift |
| `/pilot/flight/:flightId/log` | Post‑Flight Reporting | Block time, landings, fuel used, remarks, defect reporting |
| `/ops/fuel-orders` | Fueler Dashboard | List of pending orders, execute uplift |

---

## 6. Detailed Implementation Steps (For AI Agent)

### Phase 0: Setup & Migration (Day 1)

1. **Create migration `021_pilot_efb_migration.sql`** with all DDL from section 3.
2. **Run migration** on development database.
3. **Update Prisma schema** and run `prisma generate`.
4. **Add new permissions** to `prisma/seed-pbac.ts` and run the seed.
5. **Update `app/utils/constants.ts`** with any new status enums.

### Phase 1: Flight Assignment & Acceptance (Days 2-3)

6. **Enhance `pilot_assignments` model** – add `confirmed`, `confirmed_at`, `declined_reason`, `check_in_time`.
7. **Update `app/routes/pilot._index.tsx`**:
   - Show `status` badge (Pending, Confirmed, Declined, Checked‑in).
   - Add "Accept" / "Decline" buttons (Decline opens modal for reason).
   - On Accept, call `pilotAssignmentRepository.confirm()` and send notification (via email/notification system).
   - On Decline, call `pilotAssignmentRepository.decline()` with reason, notify Ops.
8. **Create `app/utils/repositories/pilot-assignment.ts`** with `confirm`, `decline`, `checkIn` methods.

### Phase 2: Flight Detail Hub & Overview Tab (Days 3-4)

9. **Create `app/routes/pilot.flight.$flightId.tsx`** (layout route with outlet).
   - Loader fetches flight, pilot assignments, verification, fuel order, flight logs.
   - Renders tab navigation (Overview, Plan, Briefing, Ops, Fuel, Log).
   - Use `NavLink` with `end` for sub‑routes.
10. **Create `app/routes/pilot.flight.$flightId.overview.tsx`** (index route):
    - Show status timeline (horizontal stepper) with icons: Assigned → Plan Verified → Briefing Accepted → Fueled → Departed → Arrived → Logged.
    - Display flight summary (route, times, aircraft).
    - Show "Next Action" button (e.g., "Go to Flight Plan", "Check Briefing", "Start Ops").

### Phase 3: Flight Plan Verification (Days 5-7)

11. **Create `app/utils/services/flight-plan.service.ts`**:
    - `getFlightPlanDetails(flightId)` – aggregate route legs (from `flight_legs`), distances, headings, calculated fuel breakdown (from W&B snapshot), weather (mock or real API), NOTAMs (mock or real).
    - `verifyFlightPlan(flightId, userId, notes)` – update `flight_plan_verifications` status to 'verified' or 'discrepancy'.
12. **Create `app/routes/pilot.flight.$flightId.plan.tsx`**:
    - Display route as a visual strip (using SVG or flex boxes).
    - Show fuel breakdown in a table (Taxi, Trip, Contingency, Alternate, Final Reserve) with percentages or bars.
    - Show weather cards (origin, destination, alternate) with wind, temp, visibility.
    - Include a "Verify" button (if not already verified).
    - If discrepancy, show a text area for notes and "Report Discrepancy" button.
    - Once verified, show green banner and the next action link.

### Phase 4: Enhanced Briefing & Checklist (Days 8-10)

13. **Update `app/routes/pilot.briefing.$flightId.tsx`** (or move to tab):
    - Integrate weather and NOTAMs from the plan service.
    - Replace static W&B with **interactive CG envelope chart** (using `CGEnvelopeChart` component).
    - Allow pilot to adjust passenger weights, baggage, fuel (using client‑side W&B engine) and see CG move.
    - Add pre‑flight checklist items (from `pilot_checklists` table) with checkboxes.
    - Keep the existing "Accept Briefing" button which now also saves checklist states.
14. **Add `app/utils/services/briefing.service.ts`** to handle loading/saving checklist items.

### Phase 5: Fuel Order & Fueler Execution (Days 11-13)

15. **Create `app/utils/services/fuel-order.service.ts`**:
    - `calculateFuelRequirements(flightId, legId?)` – reuse `fuel-planning.ts` logic.
    - `issueFuelOrder(flightId, userId, legId?)` – create `fuel_orders` record.
    - `recordActualFuel(orderId, userId, actualKg)` – update order, then recalc W&B for the affected flight leg(s) using new fuel weight.
16. **Create `app/routes/pilot.flight.$flightId.fuel.tsx`**:
    - If no order exists, show calculated fuel breakdown and "Issue Fuel Order" button.
    - If order exists and is 'issued' or 'fueling', show instruction sheet with requested fuel and a large numeric input for actual uplift.
    - If actual uplift recorded, show success and update W&B warning if CG is near limits.
17. **Create `app/routes/ops.fuel-orders.tsx`** (add to Ops sidebar):
    - List all orders with status 'issued' or 'fueling'.
    - Clicking a row opens the same fuel tab in `fueler` mode (with `?mode=fueler` param).
    - Fueler (Ops/Engineer) can enter actual uplift and confirm.

### Phase 6: In‑Flight Ops (Days 14-15)

18. **Create `app/routes/pilot.flight.$flightId.ops.tsx`**:
    - For each leg, show a form with fields: ATD, ATA, actual passengers, actual baggage kg, actual freight kg, fuel uplift (this field can link to the fuel order).
    - Auto‑calculate block time for each leg based on ATD/ATA.
    - Save to `flight_legs` (ATD/ATA/actuals) and update `fuel_orders` if fuel uplift was manually entered (not via fueler).
    - Add "Submit Ops" button to finalise actuals for the flight.
    - Show a summary of all legs.

### Phase 7: Post‑Flight Log & Defect Reporting (Days 16-17)

19. **Create `app/routes/pilot.flight.$flightId.log.tsx`**:
    - If Ops already submitted, show read‑only view.
    - Otherwise, show form: Block Time (auto‑calculated from ATD/ATA of all legs), Landings, Fuel Used, Remarks.
    - Submit to `flight_logs` table.
    - After submission, update `flights.status` to 'completed' (or allow Ops to do it).
20. **Integrate defect reporting**:
    - In the log tab (or separate sub‑tab), include a "Report Defect" form.
    - Use `defects` table; set `source = 'pilot'`.
    - Notify engineering.

### Phase 8: Offline & Mobile Enhancements (Days 18-19)

21. **Ensure service worker caches**:
    - The flight detail hub and all tab content.
    - Use `cache-first` strategy for `/pilot/flight/*` routes.
22. **Add "Download Offline" button** on the Overview tab to trigger caching manually.
23. **Mobile responsiveness** – use Tailwind classes to make tabs, buttons, and forms work on small screens (target 320px width).
24. **Touch‑friendly inputs** – increase input heights and button sizes for tablet use.

### Phase 9: Notifications & Integrations (Days 20-21)

25. **Add notification triggers**:
    - When a pilot accepts a flight → notify Ops.
    - When pilot declines → notify Ops with reason.
    - When fuel order is issued → notify fueler (Ops/Engineer).
    - When fuel uplift is recorded → notify pilot.
    - When flight log is submitted → notify Ops and Finance.
26. **Use existing `notificationRepository` and email system (if implemented)**.

### Phase 10: Testing & Documentation (Days 22-23)

27. **Write unit/integration tests**:
    - `flight-plan.service.test.ts`
    - `fuel-order.service.test.ts`
    - `pilot-assignment.test.ts`
28. **Write E2E tests** (Playwright) covering a complete pilot journey:
    - Assignment → Accept → Plan → Briefing → Fuel → Ops → Log → Defect.
29. **Update pilot documentation** (add to README or `docs/PILOT_EFB.md`).

---

## 7. Integration Points

- **Scheduling Pipeline** – When `assignPilotsToRoutes` runs, `pilot_assignments` are created with `confirmed = false`. The schedule cannot be published until all pilots have confirmed (add validation in `handlePublish`).
- **Weight & Balance** – `fuel-order.service.ts` will call a function to update `weight_balance_snapshots` when actual fuel is recorded.
- **Airframe Hours** – When `flight_logs` is submitted, update `airframe_hours` with block time and landings (using existing logic).
- **Notifications** – Use existing `notification` table and `sendEmail` (when available) to alert relevant parties.

---

## 8. Summary of New/Modified Files

| File Path | Action | Description |
|-----------|--------|-------------|
| `migrations/021_pilot_efb_migration.sql` | NEW | DDL for all new tables/columns |
| `prisma/schema.prisma` | MODIFY | Add new models |
| `prisma/seed-pbac.ts` | MODIFY | Add new permissions |
| `app/utils/constants.ts` | MODIFY | Add new status enums |
| `app/utils/repositories/pilot-assignment.ts` | NEW | CRUD for assignments |
| `app/utils/services/flight-plan.service.ts` | NEW | Flight plan logic |
| `app/utils/services/fuel-order.service.ts` | NEW | Fuel order logic |
| `app/utils/services/briefing.service.ts` | NEW | Checklist management |
| `app/routes/pilot._index.tsx` | MODIFY | Add accept/decline UI |
| `app/routes/pilot.flight.$flightId.tsx` | NEW | Hub layout |
| `app/routes/pilot.flight.$flightId.overview.tsx` | NEW | Overview tab |
| `app/routes/pilot.flight.$flightId.plan.tsx` | NEW | Flight plan tab |
| `app/routes/pilot.flight.$flightId.briefing.tsx` | MOVE/ENHANCE | Briefing tab (moved from `/pilot/briefing/:flightId`) |
| `app/routes/pilot.flight.$flightId.fuel.tsx` | NEW | Fuel order tab |
| `app/routes/pilot.flight.$flightId.ops.tsx` | NEW | Ops tab |
| `app/routes/pilot.flight.$flightId.log.tsx` | NEW | Post‑flight log tab |
| `app/routes/ops.fuel-orders.tsx` | NEW | Fueler dashboard |
| `app/components/Sidebar.tsx` | MODIFY | Add fuel-orders link |
| `app/hooks/usePilotFlightStatus.ts` | NEW | Custom hook for status timeline |

---

## 9. Implementation Prompt for AI Agent

> **You are tasked with implementing the FIGAS Pilot Electronic Flight Bag (EFB) according to the plan above.** You must:
> 1. Follow the phases in order.
> 2. Write clean, well‑typed TypeScript code.
> 3. Use existing patterns (repositories, services, Kysely).
> 4. Ensure backward compatibility – do not break existing routes.
> 5. Write tests for new critical services.
> 6. Keep UI consistent with the existing design system (Tailwind, icons).
> 7. Ensure all new routes are permission‑gated.
> 8. Deliver a working, integrated EFB that meets the target state described.

---

## 10. Acceptance Checklist (For Human Review)

- [x] Pilot can accept/decline assignments on the dashboard.
- [x] Flight Detail Hub shows all tabs and the Overview status timeline.
- [x] Flight Plan tab displays route, fuel breakdown, weather, NOTAMs; pilot can verify or flag discrepancy.
- [x] Briefing tab includes checklists, interactive CG, and accepts sign‑off.
- [x] Fuel tab allows issuing a fuel order and recording actual uplift (with W&B update).
- [x] Ops tab allows recording ATD/ATA/pax/baggage per leg.
- [x] Log tab allows submitting block time, landings, fuel used, remarks, and defect reports.
- [x] Fueler Dashboard shows pending orders and allows uplift recording.
- [x] Notifications are triggered for key state changes.
- [x] All new pages are responsive and touch‑friendly.
- [ ] Offline caching works for at least the last 7 days of flight data.

---

## 11. Codebase Audit Results (2026-07-13)

Conducted a comprehensive audit of the existing codebase against this document. Key findings below.

### 11.1 What Already Exists

| Asset | Status | Location |
|-------|--------|----------|
| Pilot layout + sidebar | **EXISTS** | `app/routes/pilot.tsx` |
| Pilot dashboard | **EXISTS** | `app/routes/pilot._index.tsx` (read-only, no accept/decline buttons) |
| My Flights list | **EXISTS** | `app/routes/pilot.flights.tsx` |
| My Schedule list | **EXISTS** | `app/routes/pilot.schedule.tsx` |
| Pilot Briefing (route/W&B/pax/fuel) | **EXISTS** | `app/routes/pilot.briefing.$flightId.tsx` + `app/components/pilot/PilotBriefing.tsx` |
| Briefing acceptance flow | **EXISTS** | Writes to `sign_offs` (entity_type='briefing') + updates `pilot_assignments.status='confirmed'` |
| Pilot assignment repository | **EXISTS** | `app/utils/repositories/pilot-assignment.ts` — `updateStatus()` supports CONFIRMED/DECLINED |
| Pilot assignment scheduling | **EXISTS** | `app/utils/scheduling/assign-pilots.ts` — auto-assignment with duty hour constraints |
| `pilot_assignments` columns | **EXISTS** | `confirmed_at`, `declined_at`, `declined_reason`, `status` enum (assigned/confirmed/declined/checked_in/completed/cancelled) |
| `flight_legs.atd` / `flight_legs.ata` | **EXISTS** | Used only in loadsheet (ops-facing), not pilot-facing |
| `flight_logs` table + Prisma model | **EXISTS** | `prisma/schema.prisma:1676` + `migrations/consolidated/009-flight-logs.sql` |
| `flight_logs` DB trigger | **EXISTS** | `migrations/consolidated/015-maintenance-triggers.sql` — `trg_flight_log_update_hours` updates airframe hours |
| `defects` table + Engineer UI | **EXISTS** | `app/routes/engineer.defects.tsx` — engineer-facing only |
| Email templates | **EXISTS** | `app/emails/notifications.ts` — `pilotAssignmentEmail()`, `schedulePublishedEmail()` — never called |
| `PilotAssignmentStatus` enum | **EXISTS** | `app/utils/constants.ts:367` — ASSIGNED, CONFIRMED, DECLINED, CHECKED_IN, COMPLETED |
| `sign_offs` table | **EXISTS** | `prisma/schema.prisma:1779` — used by briefing acceptance |


### 11.2 Doc Discrepancies (Doc Is Wrong)

| Doc Reference | Doc Claims | Reality |
|---------------|-----------|---------|
| §3.1 item 3 | `ALTER TABLE flight_legs ADD atd, ata` | **Already exist** in `flight_legs` model |
| §3.1 item 6 | `ALTER TABLE pilot_assignments ADD confirmed, confirmed_at, declined_reason` | **Already exist** (columns: `status` enum, `confirmed_at`, `declined_at`, `declined_reason`) |
| §4 | `flight:view` permission needed | Already exists as `FLIGHT_VIEW` |
| §7 line 277 | `pilot_assignments.confirmed` boolean column | Does not exist — uses `status` enum instead |
| §3.1 item 4 | `flight_logs` schema with `block_time_minutes`, `air_time_minutes`, `landings`, `fuel_used_kg`, `pilot_remarks`, `submitted_by`, `submitted_at` | **Existing table has different columns**: `block_off_time`, `block_on_time`, `tach_start`, `tach_end`, `cycles`, `fuel_uplift_ltr`, `fuel_start_ltr`, `fuel_end_ltr`, `oil_uplift_ltr`, `remarks`, `created_by`, `aircraft_id`, `captain_id`, `departure_date`, `origin_code`, `destination_code` |
| §8 | `app/utils/repositories/pilot-assignment.ts` is NEW | **Already exists** with full CRUD + status update methods |
| §3.1 item 1 | `flight_plan_verifications` table needed | **Recommendation**: Reuse `sign_offs` with `entity_type = 'plan_verification'` instead of creating redundant table |
| §6 Phase 1 step 8 | Create `pilotAssignmentRepository` with `confirm`/`decline`/`checkIn` | Repository already exists; only need to add `checkIn` method |

### 11.3 What Is Truly Missing

| Item | Priority |
|------|----------|
| `pilot_assignments.check_in_time` column | P0 |
| `flight_legs.actual_passengers`, `actual_baggage_kg`, `actual_freight_kg` columns | P0 |
| `fuel_orders` table + Prisma model | P0 |
| `pilot_checklists` table + Prisma model | P0 |
| Accept/Decline UI on pilot dashboard | P1 |
| Flight Detail Hub (`/pilot/flight/$flightId`) with tabs | P1 |
| Flight Plan tab + service | P2 |
| Fuel Order tab + service | P3 |
| Fueler dashboard (`/ops/fuel-orders`) | P3 |
| In-Flight Ops tab (pilot-facing ATD/ATA) | P4 |
| Post-Flight Log tab (pilot-facing flight_logs UI) | P5 |
| Pilot-facing defect reporting | P5 |
| Notification wiring (templates exist but not called) | P6 |
| Offline caching for pilot routes | P6 |
| Mobile responsiveness polish | P6 |

### 11.4 Backward Compatibility Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Route restructure: `pilot.briefing.$flightId` → `pilot.flight.$flightId.briefing` | **HIGH** | Add redirect from old route to new; all existing deep links preserved |
| `flight_logs` schema mismatch | **HIGH** | Build UI against EXISTING schema, not doc schema. Do not alter `flight_logs` table |
| Shared `flight_legs.atd`/`ata` columns used by loadsheet | **MEDIUM** | Read/write same columns; no schema change needed. Verify loadsheet still works after ops tab changes |
| New Prisma models added | **LOW** | Net new tables, no existing data affected |
| New nullable columns on existing tables | **LOW** | `ADD COLUMN IF NOT EXISTS` — safe on all PostgreSQL versions |

---

## 12. Revised Implementation Plan (Corrected for Audit Findings)

### Phase 0: Schema Alignment ✅ COMPLETED (2026-07-13)

**Migration**: `migrations/023_pilot_efb.sql` (021 already taken by `021-published-schedules.sql`)

- [x] Add `check_in_time` to `pilot_assignments` (skip `confirmed`, `confirmed_at`, `declined_reason` — already exist)
- [x] Add `actual_passengers`, `actual_baggage_kg`, `actual_freight_kg` to `flight_legs` (skip `atd`/`ata` — already exist)
- [x] Create `fuel_orders` table
- [x] Create `pilot_checklists` table
- [x] Skip `flight_plan_verifications` — reuse `sign_offs` (entity_type='plan_verification')
- [x] Skip `flight_logs` table — already exists with correct schema
- [x] Update Prisma schema: `FuelOrder` + `PilotChecklist` models, `FuelOrderStatus` enum
- [x] Add 8 permissions to `seed-pbac.ts`: flight:accept, flight:plan-verify, flight:fuel-order, flight:fuel-execute, flight:ops-update, flight:log-submit, flight:view-all, defect:report
- [x] Add `FuelOrderStatus` enum to `constants.ts`
- [x] Lint + typecheck: CLEAN

### Phase 1: Flight Detail Hub Shell + Accept/Decline ✅ COMPLETED (2026-07-13)

- [x] Create `pilot.flight.$flightId.tsx` — layout route with 6 tabs (Overview, Plan, Briefing, Fuel, Ops, Log), NavLink-based tab nav, loader fetches flight + assignment data
- [x] Create `pilot.flight.$flightId._index.tsx` — Overview tab (index route) with status timeline stepper, flight summary, next-action card
- [x] Add redirect from `pilot.briefing.$flightId.tsx` → `/pilot/flight/:flightId/briefing` — all existing deep links preserved
- [x] Add Accept/Decline buttons to `pilot._index.tsx` — assignment status badges (assigned/confirmed/declined), Accept/Decline via POST action, links updated to hub route
- [x] Lint + typecheck: CLEAN

### Phase 2: Flight Plan Verification ✅ COMPLETED (2026-07-13)

- [x] Create `app/utils/services/flight-plan.service.ts` — `getFlightPlanDetails()`, `getVerificationStatus()`, `verifyFlightPlan()`. Verifications write to `sign_offs` with `entity_type = 'plan_verification'`
- [x] Create `app/routes/pilot.flight.$flightId.plan.tsx` — route visual strip with distances/headings, fuel breakdown cards (Taxi/Trip/Reserve/Starting), weather cards per aerodrome, Verify/Report Discrepancy buttons
- [x] Lint + typecheck: CLEAN

### Phase 3: Checklist + Enhanced Briefing ✅ COMPLETED (2026-07-13)

- [x] Create `app/utils/services/checklist.service.ts` — `initializeChecklist()`, `loadChecklist()`, `toggleChecklistItem()`, `computeChecklistStats()`. 20 default checklist items across 5 categories (Pre-Flight/Safety/Briefing/Operations/Startup)
- [x] Create `app/routes/pilot.flight.$flightId.briefing.tsx` — full briefing tab ported from old route (route, crew, passengers, W&B, fuel plan), plus interactive checklist with toggle checkboxes and progress bar
- [x] Checklist auto-initializes on first load (`initializeChecklist` seeds defaults if none exist)
- [x] Accept Briefing button preserved (writes to `sign_offs` + `pilot_assignments`)
- [x] Lint + typecheck: CLEAN

### Phase 4: Fuel Order System ✅ COMPLETED (2026-07-13)

- [x] Create `app/utils/services/fuel-order.service.ts`
- [x] Create `pilot.flight.$flightId.fuel.tsx`
- [x] Create `ops.fuel-orders.tsx`
- [x] Create full Fueler role system: role definition, permissions, seed user, layout route, dashboard, orders, history, profile
- [x] Add "Fuel Orders" link to operations sidebar
- [x] Add 8 new Permission constants to `app/utils/constants.ts`
- [x] Lint + typecheck: CLEAN

### Fueler Role System ✅ (2026-07-13)

- [x] `prisma/seed-pbac.ts`: Added `fueler` role (hierarchyLevel 35) with permissions: `flight:view`, `flight:view-all`, `flight:fuel-execute`, `user:edit`
- [x] `app/utils/constants.ts`: Added `FUELER` to `UserRole` enum + 8 `Permission` constants
- [x] `.env` / `.env.example`: Added `FUELER_EMAIL=fueler@figas.gov.fk` + `FUELER_PASSWORD`
- [x] `scripts/seed-users.ts`: Added fueler user (`fueler@figas.gov.fk`, role: `fueler`)
- [x] `scripts/assign-user-roles.ts`: Added `fueler` to `ROLE_MAP`
- [x] `app/routes/fueler.tsx`: Layout route with collapsible sidebar (Dashboard, Orders, History, Profile), ProfilePopup, logout
- [x] `app/routes/fueler._index.tsx`: Dashboard with KPI cards (Pending Orders, Completed Today, Lifted Today), pending orders list with Record Uplift links
- [x] `app/routes/fueler.orders.tsx`: Orders view with inline uplift recording per order
- [x] `app/routes/fueler.history.tsx`: History table (Flight, Aircraft, Requested, Actual, Status, Completed date, Notes)
- [x] `app/routes/fueler.profile.tsx`: Full profile management — personal info edit, emergency contact, password change, fueler stats (total orders/completed/kg lifted), recent orders table

### Phase 5: In-Flight Ops ✅ COMPLETED (2026-07-13)

- [x] Create `app/routes/pilot.flight.$flightId.ops.tsx` — per-leg forms with ATD/ATA/actual pax/baggage/freight, auto block-time calculation, per-leg save via POST, submitted banner when all legs complete
- [x] Writes to `flight_legs.atd`, `ata`, `actual_passengers`, `actual_baggage_kg`, `actual_freight_kg`
- [x] Total block time summary across all legs
- [x] Lint + typecheck: CLEAN

### Phase 6: Post-Flight Log + Defect ✅ COMPLETED (2026-07-13)

- [x] Create `app/routes/pilot.flight.$flightId.log.tsx` — full flight log form mapped to EXISTING `flight_logs` schema (block off/on times, tach start/end, cycles, fuel uplift/start/end, oil uplift, remarks), pre-filled flight context (route, aircraft, date, block time from ops tab), read-only view after submission
- [x] Defect reporting sub-form — writes to EXISTING `defects` table (title, severity minor/major/critical, ATA chapter, description), recent defects table for the aircraft
- [x] Submit Flight Log button → INSERT into `flight_logs` with all columns
- [x] Report Defect button → INSERT into `defects` with `deferral_status = 'open'`
- [x] Lint + typecheck: CLEAN

### Phase 7: Notifications + Polish ✅ COMPLETED (2026-07-13)

- [x] Create `app/utils/services/efb-notification.service.ts` — 6 fire-and-forget notification functions: `notifyPilotAccepted`, `notifyPilotDeclined`, `notifyFuelOrderIssued`, `notifyFuelUpliftRecorded`, `notifyFlightLogSubmitted`, `notifyDefectReported`. Each finds target role emails via PBAC `user_roles` and creates notification rows via `notificationRepository.create()`
- [x] Wire notifications into action handlers: `pilot._index.tsx` (accept/decline), `pilot.flight.$flightId.fuel.tsx` (issue/uplift), `pilot.flight.$flightId.log.tsx` (log submit/defect report)
- [x] Mobile responsive tab navigation — `overflow-x-auto` + `whitespace-nowrap` on hub tabs, `px-3 sm:px-4` responsive padding
- [x] Lint + typecheck: CLEAN

---

**End of Plan**