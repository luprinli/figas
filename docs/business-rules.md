# FIGAS Business Rules — Authoritative Reference

**Version:** 1.2.0
**Date:** 2026-06-07
**Location:** `docs/business-rules.md` — this file is the single source of truth for all FIGAS business logic rules. All future development, refactoring, and testing MUST reference these rules.

---

## RULE 1: Booking Origins vs Flight Path Constraints

**Principle:** Bookings and flight paths are SEPARATE concerns with independent rules.

### Booking Origins (Data Layer)

| Aspect | Rule |
|--------|------|
| Origin source | The aerodrome where the passenger is located when they book |
| Distribution | Realistic: ~75% STY (Stanley), ~25% other aerodromes (spread across settlements) |
| Constraint | NONE — bookings can originate from any active aerodrome |
| Destination | Any active aerodrome (STY is most common destination) |
| **Enforced by** | Seed script (`scripts/seed-comprehensive.ts`), booking creation forms |

### Flight Path Constraints (Scheduling Layer)

| Aspect | Rule |
|--------|------|
| Start point | EVERY flight path MUST originate from STY (Stanley Airport, code "STY") or PSY (Port Stanley) |
| End point | EVERY flight path MUST terminate at STY or PSY |
| First leg origin | Always "STY" — regardless of the booking's origin_code |
| Last leg destination | Always "STY" |
| **Enforced by** | `createFlightLegs()` in `app/utils/scheduling/index.ts:286` |

### Why These Are Separate

A passenger in Carcass Island (CCI) may book a flight to Stanley (STY). The booking has origin=CCI, destination=STY. When the auto-build pipeline creates a flight, it builds a route starting from STY: STY→CCI→STY. The booking leg with origin=CCI is assigned to this flight. The FIRST flight leg is STY→CCI (not CCI→STY), and the booking passenger boards at CCI and arrives at STY. This is physically correct — the aircraft flies from Stanley to Carcass Island to pick up the passenger, then returns.

**Anti-pattern (bug):** Migrating all booking origins to STY. This destroys data fidelity and makes all bookings look like they originate from Stanley.

---

## RULE 2: Stop Activity Logic

Defined in `app/utils/scheduling/build-stop-activities.ts` and enforced by the stop activity builder.

| Stop Position | Arriving Passengers | Departing Passengers | Arrival Time | Departure Time |
|--------------|-------------------|---------------------|-------------|---------------|
| First (origin) | EMPTY — no one arrives at origin | Passengers whose origin matches this stop | NULL | From first leg |
| Intermediate | Passengers whose destination matches | Passengers whose origin matches | From inbound leg | From outbound leg |
| Last (destination) | Passengers whose destination matches | EMPTY — no one departs from destination | From last leg | NULL |

**Duplicated STY:** When a route is STY→A→STY (STY appears as both first and last stop), TWO StopActivity entries are created:
1. First STY: departure-only (Rule 1)
2. Last STY: arrival-only (Rule 3)

**Enforced by:** `buildStopActivities()` in `app/utils/scheduling/build-stop-activities.ts:92-109`

---

## RULE 3: Flight Number Format

All flights must use the format: `FIG-YYYYMMDD-NNN`

| Part | Example | Description |
|------|---------|-------------|
| FIG- | FIG- | Fixed prefix |
| YYYY | 2026 | Four-digit year |
| MM | 06 | Two-digit month |
| DD | 09 | Two-digit day |
| - | - | Separator |
| NNN | 001 | Three-digit sequential number (001-999), per-day |

**Enforced by:**
- `handleCreateFlightFromBooking()` in `app/utils/schedule-handlers.server.ts:1047`
- Auto-build pipeline in `app/utils/scheduling/index.ts` (via `createFlightForCluster`)

---

## RULE 4: No-Fly Days

No flights and no bookings can be created on no-fly days. No booking data should exist for any no-fly day — this preempts the need to migrate bookings to adjacent fly days at build time.

| No-Fly Type | Examples |
|------------|----------|
| Recurring | Sundays (day_of_week = 0) |
| One-off holidays | Good Friday, Easter Monday, Liberation Day, Christmas, Boxing Day, New Year's Eve |

**Enforced by:**
- `isNoFlyDay()` check in build pipeline (prevents schedule creation)
- `isNoFlyDay()` check in booking assignment handlers (prevents assignment)
- `isNoFlyDay()` check in booking creation flow (prevents new bookings on no-fly dates)

**Specific dates MUST be stored with timezone handling:** `$1::date + '12:00'::time AT TIME ZONE 'Atlantic/Stanley'` to avoid UTC offset date shifts.

**Remediation:** If bookings are found on no-fly days (legacy data or seed errors), they must be migrated to the next available fly-day via `scripts/fix-nofly-and-schema.ts`.

---

## RULE 5: Per-Passenger Assignment

When a single passenger is dragged to a flight (not the entire booking), only that passenger is assigned. The manifest query filters by `flight_leg_id IS NOT NULL` to show only individually-assigned passengers.

**Enforced by:**
- `handleAssignBooking()` in `app/utils/schedule-handlers.server.ts:670` — filters passengers by `bookingLegPassengerId`
- Manifest queries in `app/routes/operations.schedule._index.tsx:167` and `app/utils/schedule-handlers.server.ts` — filter by `blp.flight_leg_id IS NOT NULL`

---

## RULE 6: Weight-Balance Safety

All weight-balance computations MUST guard against division by zero, NaN, and Infinity before saving to Decimal columns.

| Guard | Location |
|-------|----------|
| `Number.isFinite()` check before division | `computeWeightBalance()` in `weight-balance.ts:124,160` |
| `Math.min(100, ...)` cap on percentage | `weight-balance.ts:161-162` |
| `clampDecimal()` helper caps to [0, 99999999.99] | `weight-balance.ts:343-346` |
| `?? 1` fallback on MTOW (prevents null→0→Infinity) | `weight-balance.ts:132` |
| Aerodrome limits fallback to aircraft limits (not Infinity) | `weight-balance.ts:138-140` |

---

## RULE 7: Transaction Atomicity

All check-in and flight creation operations MUST be wrapped in database transactions.

| Operation | Transaction | Location |
|-----------|------------|----------|
| Check-in with payment | `db.$transaction()` | `checkin.counter.tsx:180`, `checkin.pos.tsx:122` |
| Schedule auto-build | `db.$transaction()` | `scheduling/index.ts:36` |
| Booking assignment | `withTransaction()` | `schedule-handlers.server.ts:766` |

---

## RULE 8: Check-In Payment Balancing

Check-in cannot be completed until payments balance within £0.01 tolerance. Body weight has no minimum threshold — infants, babies, and toddlers are valid passengers with their actual body weight.

**Enforced by:**
- `isBalanced` computed as `Math.abs(totalDue - totalPaid) < 0.01`
- Idempotency via `_submission_id` hidden field to prevent double submissions

---

## RULE 9: No Self-Loop Bookings

A booking cannot have the same aerodrome as both origin and destination. A passenger cannot book a flight from STY to STY or MPA to MPA — this is nonsensical and creates invalid flight paths.

**Enforced by:**
- Seed script (`scripts/seed-comprehensive.ts:271-272`) — `do { dest = pick(...); } while (dest === origin)`
- Booking creation validation — destination must differ from origin
- Fix script (`scripts/fix-selfloops.ts`) — remediates legacy self-loop data

---

## RULE 10: Schema Column Name Contracts

Column names in seed scripts, raw SQL queries, and application code MUST match the actual database schema exactly. Mismatched column names cause silent runtime failures.

### Critical Column Mappings

| Table | Actual Column | Common Mistake | Notes |
|-------|-------------|----------------|-------|
| `booking_passengers` | `clothed_body_weight_kg` | `clothed_weight_kg` | Renamed in migration. All seed scripts must use `clothed_body_weight_kg`. |
| `booking_passengers` | `user_id` | `created_by` | The `created_by` column does NOT exist on this table. User links use `user_id`. |
| `booking_leg_passengers` | `clothed_weight_kg` | `clothed_body_weight_kg` | Different from parent table — the junction table uses the short name. |
| `booking_leg_passengers` | `baggage_weight_kg` | — | Exists on the junction table. The parent `booking_passengers` table does NOT have baggage weight. |

**Enforced by:** Manual review during seed script development. Test failures caused by column mismatches result in `PrismaClientKnownRequestError` with code `P2010` and message `ColumnNotFound`.

**Verification query:**
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'booking_passengers' ORDER BY ordinal_position;
```

---

## RULE 11: dnd-kit DOM Selector Contracts for E2E Tests

The scheduling UI uses `@dnd-kit` for drag-and-drop, NOT the HTML5 Drag and Drop API. Components use pointer-based dragging via `PointerSensor` and do NOT set the HTML `draggable` attribute.

### Authoritative Selectors for E2E Tests

| Element | Correct Selector | DO NOT Use | Component |
|---------|-----------------|-----------|-----------|
| Unassigned booking items | `[data-testid="booking-item"]` | `[draggable="true"]` | `DraggableBookingItem.tsx` |
| Individual booking by ID | `[id="booking-{bookingLegPassengerId}"]` | — | `DraggableBookingItem.tsx` |
| Flight cards | `[data-testid="flight-card"]` | — | `SortableDroppableFlightCard.tsx` |
| Flight card by ID | `[id="flight-{flightId}"]` | — | `SortableDroppableFlightCard.tsx` |
| Draft flight placeholder | `[data-testid="draft-flight-placeholder"]` | `[id="draft-flight-placeholder"]` | `DraftFlightPlaceholder.tsx` |
| Passenger rows in flight card | `[data-testid="passenger-row"]` | — | `DraggablePassengerRow.tsx` |
| Schedule board container | `[data-testid="schedule-board"]` | — | `ScheduleBoard.tsx` |
| Unassign pool | `[data-testid="unassign-pool"]` | — | Route `operations.schedule._index.tsx` |

**Bug identified (2026-06-07):** `tests/e2e/pages/schedule-page.ts:18` used `page.locator('[draggable="true"]')` for `getUnassignedBookingCount()`, which always returned 0. Fixed to use `[data-testid="booking-item"]`.

**Enforced by:** All E2E tests must use the selectors documented above. New test selectors must be reviewed against the component source code to verify attribute existence.

---

## RULE 12: Schedule Board Rendering Lifecycle

The `[data-testid="schedule-board"]` DOM element is conditionally rendered based on flight state:

| State | Rendered Element | DOM Visibility |
|-------|-----------------|----------------|
| `flights.length === 0` && no schedule | "No schedule exists" banner → `DraftFlightPlaceholder` | No `schedule-board` |
| `flights.length === 0` && schedule exists | `DraftFlightPlaceholder` only | No `schedule-board` |
| `flights.length > 0` | `ScheduleBoard` with `SortableDroppableFlightCard` children | `schedule-board` VISIBLE |
| Build error | Error section with message | No `schedule-board` |

**E2E test requirement:** Tests that interact with `schedule-board` MUST first verify it exists (or create a flight to trigger its rendering). The `DraftFlightPlaceholder` is the primary drop target for creating the first flight.

**Source:** `app/routes/operations.schedule._index.tsx:1341-1360`

---

## RULE 13: Pilot and Aircraft Assignment UI Contracts

Pilot and aircraft assignment is performed via pill-shaped buttons in `FlightCard.tsx`. The buttons are distinguished by SVG icon `viewBox` dimensions:

| Button | SVG `viewBox` | Unassigned Text | Assigned Text | Dropdown Options |
|--------|--------------|----------------|---------------|-----------------|
| Pilot | `0 0 16 16` (person icon) | "Pilot" or "TBC" | Pilot's full name | Name-only buttons (e.g., "John Smith") |
| Aircraft | `0 0 24 24` (plane icon) | "Aircraft" or "TBC" | "BN-2 Islander VP-FBE" | Registration buttons (e.g., "VP-FBE BN-2 Islander · 9s") |

**Per-stop weight validation** (MTOW/MLW status on `StopActivityList`) only activates after BOTH pilot and aircraft are assigned AND `max_takeoff_weight_kg` is non-null. Before assignment, the card displays "Awaiting pilot & aircraft" message.

**E2E test approach:** Click the "Pilot" pill button → wait for name dropdown → click first available pilot → wait for `networkidle`. Repeat for "Aircraft".

**Source:** `app/components/schedule/FlightCard.tsx:222-291`

---

## RULE 14: E2E Test Data Lifecycle

E2E tests mutate shared database state. Each drag-and-drop operation permanently changes the database (assigns `flight_id` on `booking_legs`, creates flights and flight_legs). Tests MUST account for this:

| Concern | Mitigation |
|---------|------------|
| Tests consume data | Subsequent tests will find 0 unassigned bookings. Tests MUST skip gracefully when data is exhausted. |
| Cross-test pollution | `beforeEach` with `page.goto()` refreshes the page but does NOT reset the database. |
| Fresh start required | Run `scripts/reset-test-data.ts` then `scripts/seed-e2e-drag-test.ts` between full test suite runs. |
| Parallel test isolation | Set `fullyParallel: false` and `workers: 1` in `playwright.config.ts` to prevent concurrent data mutation. |

**Verification query** to check remaining unassigned bookings:
```sql
SELECT leg_date, COUNT(*) FROM booking_legs
WHERE flight_id IS NULL
AND booking_id IN (SELECT id FROM bookings WHERE booking_reference LIKE 'DRAG-%')
GROUP BY leg_date;
```

---

## RULE 15: Per-Passenger Assignment Isolation

**Principle:** When a single passenger from a group booking is assigned to a flight, other passengers on the same booking leg MUST remain visible in the unassigned pool and available for independent assignment to different flights.

### Unassigned Pool Contract

```sql
-- CORRECT (per-passenger check):
WHERE blp.flight_leg_id IS NULL AND bl.leg_date = $1
-- WRONG (per-booking-leg check):
WHERE bl.flight_id IS NULL AND bl.leg_date = $1
```

### Flight Creation Isolation

When `handleCreateFlightFromBooking` receives `bookingLegPassengerId`:
1. **Only the targeted passenger** gets `flight_leg_id` set to the flight's first leg
2. **Other passengers** retain `flight_leg_id = NULL` and remain in unassigned pool
3. **`booking_legs.flight_id`** is still set for backward compatibility

**Enforced at:** `schedule-handlers.server.ts:1179` — `if (blpRow.booking_passenger_id !== bookingLegPassengerId) continue`

---

## RULE 16: Manifest Query Persistence

**Principle:** Manifest queries MUST include ALL flight passengers regardless of `flight_leg_id` value.

```sql
-- CORRECT: WHERE bl.flight_id = $1
-- WRONG:   WHERE bl.flight_id = $1 AND blp.flight_leg_id IS NOT NULL
```

**All manifest queries affected** (loader + 5 handler re-queries). Before fix, passengers with NULL `flight_leg_id` appeared in fetcher response but disappeared on page refresh.

---

## LOCATION INDEX

| Rule | Primary Enforcement File | Line(s) |
|------|------------------------|---------|
| R1-R14 | (see above) | — |
| R15: Per-Passenger Assignment Isolation | `schedule-handlers.server.ts` | 1179 |
| R16: Manifest Query Persistence | `schedule-handlers.server.ts`, `operations.schedule._index.tsx` | 167, 739, 795, 941 |
| R15: Auto-Build Booking Consumption | `schedule-handlers.server.ts` | 31 |
