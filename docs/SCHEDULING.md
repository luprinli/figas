# Flight Scheduling Reference

> **Purpose:** This document is a scheduling-specific reference extracted from [`docs/ARCHITECTURE.md`](ARCHITECTURE.md), [`docs/DATA_MODEL.md`](DATA_MODEL.md), and [`docs/WORKFLOWS.md`](WORKFLOWS.md).
>
> **Authoritative Source:** For technical contracts (interfaces, validation invariants, database query contracts, edge cases, and test coverage requirements), refer to [`.agents/skills/flight-schedule/SKILL.md`](../.agents/skills/flight-schedule/SKILL.md). That file is the single source of truth that must not be violated by any implementation change.
>
> **Audience:** Developers working on the scheduling pipeline, route builder, aircraft assignment, weight & balance, pilot assignment, or schedule status lifecycle.

---

## Table of Contents

1. [Schedule Status Lifecycle](#1-schedule-status-lifecycle)
2. [Scheduling Pipeline (5 Phases)](#2-scheduling-pipeline-5-phases)
3. [Drag-and-Drop (dnd-kit) Architecture](#3-drag-and-drop-dnd-kit-architecture)
4. [Validation Invariants (G-01 through G-22)](#4-validation-invariants-g-01-through-g-22)
5. [Database Schema](#5-database-schema)
6. [Key Interfaces](#6-key-interfaces)
7. [Cross-References](#7-cross-references)

---

## 1. Schedule Status Lifecycle

The schedule status lifecycle is enforced by a database CHECK constraint on the `schedules` table and by action handlers in [`app/utils/schedule-handlers.server.ts`](../app/utils/schedule-handlers.server.ts).

### Status Diagram

```
                    ┌──────────┐
                    │  DRAFT   │
                    └────┬─────┘
                         │ auto-build
                    ┌────▼─────┐
              ┌─────│ BUILDING │◄──── revise ──────┐
              │     └────┬─────┘                    │
              │          │ approve                  │
              │     ┌────▼─────┐                    │
              │     │ APPROVED │──── revise ────────┤
              │     └────┬─────┘                    │
              │          │ publish                  │
              │     ┌────▼──────┐                   │
              │     │ PUBLISHED │──── revise ───────┤
              │     └────┬──────┘                   │
              │          │ (time passes)            │
              │     ┌────▼──────┐                   │
              │     │ COMPLETED │                   │
              │     └───────────┘                   │
              │                                     │
              └──── cancel ─────────────────────────┘
                         │
                    ┌────▼──────┐
                    │ CANCELLED │
                    └───────────┘
```

### Transition Rules

| From | To | Action | Handler | Line |
|------|----|--------|---------|------|
| `draft` | `building` | `auto-build` | [`handleAutoBuild()`](../app/utils/schedule-handlers.server.ts:29) | 29 |
| `building` | `approved` | `approve` | [`handleApprove()`](../app/utils/schedule-handlers.server.ts:69) | 69 |
| `approved` | `published` | `publish` | [`handlePublish()`](../app/utils/schedule-handlers.server.ts:173) | 173 |
| `approved` | `draft` | `revise` | [`handleRevise()`](../app/utils/schedule-handlers.server.ts:128) | 128 |
| `published` | `draft` | `revise` | [`handleRevise()`](../app/utils/schedule-handlers.server.ts:128) | 128 |
| `building` | `cancelled` | `cancel` | [`handleCancel()`](../app/utils/schedule-handlers.server.ts:232) | 232 |
| `approved` | `cancelled` | `cancel` | [`handleCancel()`](../app/utils/schedule-handlers.server.ts:232) | 232 |
| `cancelled` | *(any)* | — | **Blocked** | 232 |
| `completed` | *(any)* | — | **Blocked** | — |

### Permission Gates (PBAC)

All schedule actions require specific PBAC permissions, checked via [`hasPermission()`](../app/utils/permissions.server.ts):

| Action | Required Permission | Check Location |
|--------|-------------------|----------------|
| Auto-build | `schedule:create` | Line 227 |
| Approve | `schedule:approve` | Line 235 |
| Revise | `schedule:edit` | Line 244 |
| Publish | `schedule:publish` | Line 253 |
| Cancel | `schedule:edit` | Line 262 |
| Reorder flights | `schedule:edit` | Line 272 |
| Create flight | `flight:create` | Line 284 |
| Assign booking | `booking:assign-flight` | Line 299 |
| Create flight from booking | `flight:create` | Line 309 |
| Unassign booking | `booking:assign-flight` | Line 321 |
| Assign pilot | `flight:assign-pilot` | Line 330 |
| Suggest route | `schedule:create` | Line 341 |

---

## 2. Scheduling Pipeline (5 Phases)

The scheduling pipeline is orchestrated by [`buildSchedule()`](../app/utils/scheduling/index.ts:34) in [`app/utils/scheduling/index.ts`](../app/utils/scheduling/index.ts).

### Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     SCHEDULING PIPELINE (5 Phases)                          │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  INPUT: Unassigned booking legs for a given date                     │  │
│  │  Source: booking_legs WHERE flight_id IS NULL AND leg_date = :date   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  PHASE 1: CLUSTER                                                   │  │
│  │  File: cluster-bookings.ts  Function: clusterBookings()              │  │
│  │  Groups unassigned booking legs by date|origin|destination key       │  │
│  │  Output: ClusterResult[]                                             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  PHASE 2: ROUTE CONSTRUCTION                                        │  │
│  │  File: nearest-neighbor.ts  Function: buildRoute()                   │  │
│  │  Builds optimal sortie route using nearest-neighbor heuristic        │  │
│  │  Route always starts and ends at Port Stanley (PSY)                  │  │
│  │  Output: RouteResult[]                                               │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  PHASE 3: AIRCRAFT ASSIGNMENT                                       │  │
│  │  File: assign-aircraft.ts  Function: assignAircraftToRoutes()        │  │
│  │  Evaluates all active aircraft against each route's requirements     │  │
│  │  Output: AircraftAssignmentResult[]                                  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  PHASE 4: WEIGHT & BALANCE                                          │  │
│  │  File: weight-balance.ts  Function: computeWeightBalanceForRoute()   │  │
│  │  Computes detailed weight and balance for each flight leg            │  │
│  │  Output: WeightBalanceResult[]                                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  PHASE 5: PILOT ASSIGNMENT                                          │  │
│  │  File: assign-pilots.ts  Function: assignPilotsToRoutes()            │  │
│  │  Assigns pilots based on qualifications, duty time, rest, avail.    │  │
│  │  Output: PilotAssignmentResult[]                                     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  OUTPUT: ScheduleBuildResult                                        │  │
│  │  { scheduleId, scheduleDate, clusters, routes, aircraftAssignments, │  │
│  │    weightBalances, pilotAssignments, errors, warnings }             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase Details

#### Phase 1: Clustering ([`cluster-bookings.ts`](../app/utils/scheduling/cluster-bookings.ts))

Groups unassigned booking legs by a composite key of `date|origin|destination`. Each cluster represents a set of passengers who need to travel between the same two aerodromes on the same day. The clusterer counts passengers per cluster via [`bookingLegPassengerRepository.findByLegId()`](../app/utils/repositories/booking-leg-passenger.ts:62).

#### Phase 2: Route Construction ([`nearest-neighbor.ts`](../app/utils/scheduling/nearest-neighbor.ts))

Builds an optimal sortie route using the nearest-neighbor heuristic. The route always starts and ends at Port Stanley (PSY). For each cluster, the algorithm:
1. Determines the set of aerodromes to visit
2. Starting from PSY, repeatedly visits the nearest unvisited aerodrome
3. Returns to PSY after all stops are completed
4. Uses cached `aerodrome_distances` and `aerodrome_headings` tables for navigation data
5. Assumes ~140 knots cruise speed (BN-2 Islander performance)

#### Phase 3: Aircraft Assignment ([`assign-aircraft.ts`](../app/utils/scheduling/assign-aircraft.ts))

Evaluates all active aircraft against each route's requirements:
- **Passenger capacity** — seat count must accommodate all passengers
- **Payload capacity** — total passenger + baggage + freight weight must not exceed max payload
- **Fuel range** — aircraft must have sufficient range for the total route distance with reserves
- **Runway compatibility** — aircraft must be able to operate from all aerodromes on the route

Selects the best-fit aircraft per route. Marks assignments as infeasible with a reason if no aircraft meets requirements.

#### Phase 4: Weight & Balance ([`weight-balance.ts`](../app/utils/scheduling/weight-balance.ts))

Computes detailed weight and balance for each flight leg:
- **Passenger weight** — sum of passenger clothed weights (from `booking_leg_passengers` junction records)
- **Baggage weight** — sum of baggage weights per leg
- **Freight weight** — sum of freight weights per leg
- **Fuel weight** — calculated based on leg distance, aircraft fuel consumption, and reserves
- **Crew weight** — standard crew weight allocation (PIC + SIC)
- **Empty weight** — aircraft empty weight from `aircraft` table
- **CG position** — center of gravity position as percentage of mean aerodynamic chord
- **Binding constraints** — identifies the limiting factor (MTOW, MLW, CG envelope, fuel capacity)

#### Phase 5: Pilot Assignment ([`assign-pilots.ts`](../app/utils/scheduling/assign-pilots.ts))

Assigns pilots to each flight based on:
- **Qualifications** — pilot must hold valid ratings for the aircraft type
- **Duty time** — must not exceed maximum duty period limits
- **Rest requirements** — must have had adequate rest before duty
- **Availability** — pilot must not already be assigned to another flight at the same time
- **Role suitability** — PIC (Captain) vs SIC (First Officer) role assignment

### Pilot Assignment Constraints

| Constraint | Value | Enforced At |
|-----------|-------|-------------|
| Minimum rest between duties | 12 hours | Line 43 |
| Maximum duty hours per day | 12 hours | Line 81 |
| Maximum flight hours per day | 8 hours | Line 81 |
| Valid medical certificate | Required | Line 91 |
| Type rating match | Required | Line 207 |
| Pilot selection | Lowest duty hours | Line 128 |

---

## 3. Drag-and-Drop (dnd-kit) Architecture

### Architecture Overview

The scheduling UI uses a **single DndContext** architecture:

1. **Single outer `DndContext`** (in [`operations.schedule._index.tsx`](../app/routes/operations.schedule._index.tsx:1067)) — handles all drag operations: booking → flight assignment, booking → draft-flight creation, and flight reordering. Uses `pointerWithin` collision detection.
2. **`SortableContext`** (in [`ScheduleBoard.tsx`](../app/components/schedule/ScheduleBoard.tsx:35)) — nested inside the single `DndContext`, provides sortable context for flight reordering within the schedule board. Uses `verticalListSortingStrategy`.

This single-context approach allows all drag operations to coexist without interference, with the `data.type` discriminator routing drops to the correct handler.

### ID Naming Conventions

All draggable/droppable IDs use a **prefix-numeric** format:

| Prefix | Format | Used By | File |
|--------|--------|---------|------|
| `flight-{id}` | `flight-42` | [`useDroppable`](../app/components/schedule/SortableDroppableFlightCard.tsx:22) — flight card as drop target | [`SortableDroppableFlightCard.tsx`](../app/components/schedule/SortableDroppableFlightCard.tsx:23) |
| `booking-{id}` | `booking-17` | [`useDraggable`](../app/components/schedule/DraggableBookingItem.tsx:13) — unassigned booking item | [`DraggableBookingItem.tsx`](../app/components/schedule/DraggableBookingItem.tsx:14) |
| `passenger-{id}` | `passenger-5` | [`useDraggable`](../app/components/schedule/DraggablePassengerRow.tsx:15) — passenger row within a flight | [`DraggablePassengerRow.tsx`](../app/components/schedule/DraggablePassengerRow.tsx:16) |
| `draft-flight-placeholder` | (literal) | [`useDroppable`](../app/components/schedule/DraftFlightPlaceholder.tsx:10) — drop zone for creating new flights | [`DraftFlightPlaceholder.tsx`](../app/components/schedule/DraftFlightPlaceholder.tsx:11) |

### Hook Configuration

| Hook | Component | Configuration | File |
|------|-----------|--------------|------|
| `useDraggable` | `DraggableBookingItem` | `id: booking-{id}`, `data: { type: 'booking', bookingId }` | [`DraggableBookingItem.tsx:13`](../app/components/schedule/DraggableBookingItem.tsx:13) |
| `useDraggable` | `DraggablePassengerRow` | `id: passenger-{id}`, `data: { type: 'passenger', bookingLegId, flightLegId }` | [`DraggablePassengerRow.tsx:15`](../app/components/schedule/DraggablePassengerRow.tsx:15) |
| `useDroppable` | `SortableDroppableFlightCard` | `id: flight-{id}`, `data: { type: 'flight', flightId }` | [`SortableDroppableFlightCard.tsx:22`](../app/components/schedule/SortableDroppableFlightCard.tsx:22) |
| `useDroppable` | `DraftFlightPlaceholder` | `id: draft-flight-placeholder`, `data: { type: 'draft-flight' }` | [`DraftFlightPlaceholder.tsx:10`](../app/components/schedule/DraftFlightPlaceholder.tsx:10) |
| `useSortable` | `SortableDroppableFlightCard` | `id: flight-{id}` (same as droppable) | [`SortableDroppableFlightCard.tsx:22`](../app/components/schedule/SortableDroppableFlightCard.tsx:22) |

### Sensor Setup

Configured in [`operations.schedule._index.tsx`](../app/routes/operations.schedule._index.tsx:1067):

```typescript
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  }),
);
```

- **PointerSensor** with `distance: 8` — prevents accidental drag triggers on click
- **KeyboardSensor** — provides keyboard accessibility for sortable reordering

### DragOverlay

Rendered via `createPortal` to the document body in [`ScheduleBoard.tsx`](../app/components/schedule/ScheduleBoard.tsx:35):

```typescript
{createPortal(
  <DragOverlay dropAnimation={dropAnimationConfig}>
    {activeBookingId && <BookingDragOverlay />}
    {activeFlightId && <FlightDragOverlay />}
  </DragOverlay>,
  document.body,
)}
```

### Optimistic State Management

Uses a **pending-ops stack** pattern for optimistic updates with rollback:

1. **Before** the fetch call, push the current state snapshot onto `pendingOpsRef`
2. **Optimistically** update the UI state immediately
3. **On success**, clear the pending ops stack
4. **On error**, pop the last snapshot from `pendingOpsRef` and restore it

Defined in [`operations.schedule._index.tsx`](../app/routes/operations.schedule._index.tsx:477):

```typescript
const pendingOpsRef = useRef<Array<() => void>>([]);
```

### Drop Handling

The `handleDragEnd` callback (in [`operations.schedule._index.tsx`](../app/routes/operations.schedule._index.tsx:477)) uses a `data.type` discriminator to route drops:

| `active.data.type` | `over.data.type` | Action |
|-------------------|------------------|--------|
| `booking` | `flight` | Assign booking to flight |
| `booking` | `draft-flight` | Create flight from booking |
| `flight` | `flight` | Reorder flights (sortable) |
| `passenger` | `flight` | Unassign passenger to different flight |
| `passenger` | `unassigned-pool` | Unassign passenger back to pool |

---

## 4. Validation Invariants (G-01 through G-22)

The following invariants **must never be removed or relaxed**. They are the core safety properties of the scheduling system.

### Invariant 1: No-Fly Day Enforcement

Auto-build, assign-booking, and unassign-booking **must** fail on no-fly days.

**Enforced at:**
- [`handleAutoBuild()`](../app/utils/schedule-handlers.server.ts:29) — checks `isNoFlyDay(date)` before proceeding
- [`handleAssignBooking()`](../app/utils/schedule-handlers.server.ts:337) — checks no-fly status
- [`handleUnassignBooking()`](../app/utils/schedule-handlers.server.ts:471) — checks no-fly status

**Test:** [`auto-build.test.ts`](../tests/integration/scheduling/auto-build.test.ts:101) — "auto-build on no-fly day fails"

### Invariant 2: Approve Requires Flights with Bookings

A schedule can only transition from `building` → `approved` if **all flights** have at least one booking leg assigned.

**Enforced at:** [`handleApprove()`](../app/utils/schedule-handlers.server.ts:69)

**Test:** [`schedule-status-flow.test.ts`](../tests/integration/scheduling/schedule-status-flow.test.ts:56) — "fails to approve a schedule with no flights"

### Invariant 3: Publish Requires Captain Assignment

A schedule can only transition from `approved` → `published` if **all flights** have a captain (pilot) assigned.

**Enforced at:** [`handlePublish()`](../app/utils/schedule-handlers.server.ts:173)

**Test:** [`schedule-status-flow.test.ts`](../tests/integration/scheduling/schedule-status-flow.test.ts:114) — "publishes an approved schedule succeeds"

### Invariant 4: Pilot Constraints

Pilot assignment must enforce:
- Minimum 12 hours rest between duties
- Maximum 12 hours duty per day
- Maximum 8 hours flight time per day
- Valid medical certificate
- Correct type rating for aircraft

**Enforced at:** [`assignPilots()`](../app/utils/scheduling/assign-pilots.ts:43)

### Invariant 5: Weight & Balance Validation

Each flight must have valid weight & balance after aircraft assignment:
- Seat count must not be exceeded
- MTOW must not be exceeded
- MLW must not be exceeded at any stop
- Aircraft range must cover all legs
- Runway length must be adequate (with derating for short strips)

**Enforced at:** [`buildSchedule()`](../app/utils/scheduling/index.ts:34) (Phase 4)

**Test:** [`flight-validation.test.ts`](../tests/unit/scheduling/flight-validation.test.ts:23)

### Invariant 6: Empty Flight Cleanup

When the last booking leg is unassigned from a flight, the flight **must** be deleted (including its legs, manifests, and pilot assignments).

**Enforced at:** [`handleUnassignBooking()`](../app/utils/schedule-handlers.server.ts:471)

**Test:** [`unassign-booking.test.ts`](../tests/integration/scheduling/unassign-booking.test.ts:92) — "unassigns last booking deletes flight"

### Invariant 7: Route Insertion Integrity

When a booking is assigned to a flight, the booking's origin/destination must match a leg in the flight's route. Flights cannot contain legs that don't correspond to any assigned booking.

### Invariant 8: Schedule Status Guard

Schedule mutations (assign, unassign, reorder) **must** be blocked when the schedule status is `approved`, `published`, `completed`, or `cancelled`.

### Invariant 9: Audit Trail

Every schedule status transition **must** record the user who performed the action and a timestamp. The `created_by` field must never be 0.

### Invariant 10: PSY Hub Constraint

All flights must start and end at Port Stanley (PSY). The route builder enforces this by ensuring the first and last stops in any route are PSY. The validation function checks this and flags violations.

### Gap Analysis Summary (G-01 through G-22)

All 22 items from the audit report have been resolved across 4 phases:

| ID | Gap | Phase | Resolution |
|----|-----|-------|------------|
| G-01 | `ScheduleStatus` enum mismatch — `'building'` missing from CHECK constraint | Phase 1 | Fixed CHECK constraint in [`004-scheduling.sql`](../migrations/consolidated/004-scheduling.sql) |
| G-02 | Missing loadsheet UI — no visual loadsheet for flights | Phase 4 | Created [`Loadsheet.tsx`](../app/components/schedule/Loadsheet.tsx) component |
| G-03 | Unassign from approved schedule — no status guard | Phase 1 | Added schedule status check to [`handleUnassignBooking()`](../app/utils/schedule-handlers.server.ts:814) |
| G-04 | Unassign of already-unassigned booking — no pre-condition check | Phase 1 | Added pre-condition check to [`handleUnassignBooking()`](../app/utils/schedule-handlers.server.ts:810) |
| G-05 | `createdBy: 0` default in scheduling functions | Phase 1 | Fixed handlers to require `userId` |
| G-06 | Missing transaction wrapping in `buildSchedule` | Phase 1 | Wrapped in [`db.$transaction()`](../app/utils/scheduling/index.ts:34) |
| G-07 | Pilot duty time stubs — placeholder values | Phase 2 | Replaced with actual flight time calculations in [`assign-pilots.ts`](../app/utils/scheduling/assign-pilots.ts:43) |
| G-08 | Two-crew assumption — system assumed two pilots per flight | Phase 2 | Changed to single-crew (CAPTAIN only) in [`assign-pilots.ts`](../app/utils/scheduling/assign-pilots.ts) |
| G-09 | Aircraft availability — no time-overlap check | Phase 2 | Added time-overlap check in [`assign-aircraft.ts`](../app/utils/scheduling/assign-aircraft.ts) |
| G-10 | N+1 query in `cluster-bookings` — per-leg loop | Phase 2 | Replaced with single batched SQL query |
| G-11 | N+1 query in `booking-leg.server` — inefficient GROUP BY | Phase 2 | Fixed GROUP BY, added `ARRAY_AGG(DISTINCT)` |
| G-12 | Duplicate distance cache — logic duplicated across files | Phase 3 | Created shared [`distance-cache.ts`](../app/utils/scheduling/distance-cache.ts) module |
| G-13 | Duplicate nearest-neighbor logic | Phase 3 | Created shared [`route-builder.ts`](../app/utils/scheduling/route-builder.ts) module |
| G-14 | Duplicate runway derating | Phase 3 | Created shared [`runway-derating.ts`](../app/utils/scheduling/runway-derating.ts) module |
| G-15 | Duplicate fuel calculation | Phase 3 | Created shared [`fuel-lookup.ts`](../app/utils/scheduling/fuel-lookup.ts) module |
| G-16 | Missing composite unique constraint on `booking_leg_passengers` | Phase 2 | Added `@@unique([booking_leg_id, flight_leg_id])` to Prisma schema |
| G-17 | `findByScheduleId()` column name mismatch | Phase 1 | Changed to use Prisma relation filter in [`flight-leg.ts`](../app/utils/repositories/flight-leg.ts:38) |
| G-18 | Hardcoded arm positions — weight & balance used constants | Phase 4 | Added arm columns to aircraft model; replaced with DB lookups |
| OE #3 | Dynamic imports — `import()` in hot paths | Phase 3 | Replaced with static imports |
| OE #4 | Overlapping flight repositories — `.server.ts` variants | Phase 3 | Consolidated repositories |

---

## 5. Database Schema

### [`schedules`](../migrations/consolidated/004-scheduling.sql:14)

Daily schedule grouping with pipeline status tracking.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `schedule_date` | `DATE` | Schedule date |
| `status` | `VARCHAR(50)` | Status: `draft`, `building`, `approved`, `published`, `completed`, `cancelled` (enforced by CHECK constraint) |
| `notes` | `TEXT` | Schedule notes |
| `created_by` | `INTEGER FK → users` | Creator |
| `approved_by` | `INTEGER FK → users` | Approver |
| `approved_at` | `TIMESTAMPTZ` | Approval timestamp |
| `published_by` | `INTEGER FK → users` | Publisher |
| `published_at` | `TIMESTAMPTZ` | Publication timestamp |
| `cancelled_by` | `INTEGER FK → users` | Canceller |
| `cancelled_at` | `TIMESTAMPTZ` | Cancellation timestamp |
| `cancellation_reason` | `TEXT` | Reason for cancellation |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

### [`flights`](../migrations/consolidated/004-scheduling.sql:30)

Individual sortie flights within a schedule.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `schedule_id` | `INTEGER FK → schedules` | Parent schedule |
| `flight_number` | `VARCHAR(20)` | Flight number (e.g., "FIGAS 101") |
| `aircraft_id` | `INTEGER FK → aircraft` | Assigned aircraft |
| `status` | `VARCHAR(50)` | Status: `draft`, `approved`, `published`, `cancelled` |
| `created_by` | `INTEGER FK → users` | Creator |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

### [`flight_legs`](../migrations/consolidated/004-scheduling.sql:49)

Sequenced stops for a sortie flight.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `flight_id` | `INTEGER FK → flights` | Parent flight |
| `leg_sequence` | `INTEGER` | Order within flight (1, 2, 3...) |
| `origin_code` | `VARCHAR(10) FK → aerodromes(code)` | Departure aerodrome |
| `destination_code` | `VARCHAR(10) FK → aerodromes(code)` | Arrival aerodrome |
| `departure_time` | `TIMESTAMPTZ` | Actual/scheduled departure |
| `arrival_time` | `TIMESTAMPTZ` | Actual/scheduled arrival |
| `distance_nm` | `NUMERIC(7,1)` | Leg distance in nautical miles |
| `heading` | `NUMERIC(5,1)` | Leg heading in degrees |
| `status` | `VARCHAR(50)` | Status: `scheduled`, `in_progress`, `completed`, `cancelled` |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

### [`booking_leg_passengers`](../migrations/consolidated/004-scheduling.sql:104)

Junction table linking passengers to specific flight legs within a booking leg.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `booking_leg_id` | `INTEGER FK → booking_legs` | Parent booking leg |
| `flight_leg_id` | `INTEGER FK → flight_legs` | Assigned flight leg |
| `passenger_name` | `VARCHAR(200)` | Passenger name |
| `clothed_weight_kg` | `NUMERIC(5,1)` | Passenger clothed weight |
| `baggage_weight_kg` | `NUMERIC(5,1)` | Passenger baggage weight |
| `seat_number` | `VARCHAR(10)` | Seat assignment |
| `notes` | `TEXT` | Special notes |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

**Unique constraint:** `(booking_leg_id, flight_leg_id)` — a passenger cannot be assigned to the same flight leg twice.

### [`weight_balance_snapshots`](../migrations/consolidated/004-scheduling.sql:81)

Per-leg weight and balance calculations computed during the scheduling pipeline.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `flight_leg_id` | `INTEGER FK → flight_legs` | Flight leg |
| `schedule_id` | `INTEGER FK → schedules` | Parent schedule |
| `passenger_weight_kg` | `NUMERIC(8,1)` | Sum of passenger weights |
| `baggage_weight_kg` | `NUMERIC(8,1)` | Sum of baggage weights |
| `freight_weight_kg` | `NUMERIC(8,1)` | Sum of freight weights |
| `fuel_weight_kg` | `NUMERIC(8,1)` | Calculated fuel weight |
| `crew_weight_kg` | `NUMERIC(8,1)` | Standard crew allocation |
| `empty_weight_kg` | `NUMERIC(8,1)` | Aircraft empty weight |
| `total_weight_kg` | `NUMERIC(8,1)` | Total weight (all components) |
| `total_moment_kgm` | `NUMERIC(10,2)` | Total moment for CG calculation |
| `cg_position_pct` | `NUMERIC(5,2)` | CG position as % of MAC |
| `effective_mtow_kg` | `NUMERIC(7,1)` | Effective MTOW (min of aircraft + aerodrome) |
| `effective_mlw_kg` | `NUMERIC(7,1)` | Effective MLW (min of aircraft + aerodrome) |
| `mtow_used_pct` | `NUMERIC(5,1)` | MTOW utilization percentage |
| `mlw_used_pct` | `NUMERIC(5,1)` | MLW utilization percentage |
| `binding_constraint` | `VARCHAR(100)` | Limiting factor (MTOW, MLW, CG, fuel) |
| `binding_constraint_detail` | `TEXT` | Detailed constraint explanation |
| `computed_by` | `VARCHAR(100)` | Computation source |
| `computed_at` | `TIMESTAMPTZ` | Computation timestamp |
| `notes` | `TEXT` | Additional notes |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

### [`pilot_assignments`](../migrations/consolidated/004-scheduling.sql:135)

Pilot-to-flight assignments with status tracking.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `schedule_id` | `INTEGER FK → schedules` | Parent schedule |
| `flight_id` | `INTEGER FK → flights` | Assigned flight |
| `pilot_id` | `INTEGER FK → pilots` | Assigned pilot |
| `role` | `VARCHAR(50)` | Role: `captain`, `first_officer`, `relief` |
| `status` | `VARCHAR(50)` | Status: `assigned`, `confirmed`, `declined`, `checked_in`, `completed` |
| `confirmed_at` | `TIMESTAMPTZ` | Confirmation timestamp |
| `declined_at` | `TIMESTAMPTZ` | Decline timestamp |
| `declined_reason` | `TEXT` | Reason for declining |
| `notes` | `TEXT` | Assignment notes |
| `assigned_by` | `INTEGER FK → users` | Assigning user |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

---

## 6. Key Interfaces

All scheduling type definitions are in [`app/utils/scheduling/types.ts`](../app/utils/scheduling/types.ts).

### ClusterResult (Phase 1)

```typescript
export interface ClusterResult {
  date: string;
  origin: string;
  destination: string;
  legs: BookingLegRow[];
  passengerCount: number;
}
```

### RouteResult (Phase 2)

```typescript
export interface RouteResult {
  flight: FlightRow;
  stops: RouteStop[];
  totalDistanceNm: number;
  estimatedFlightTimeHours: number;
}

export interface RouteStop {
  aerodromeCode: string;
  legSequence: number;
  distanceNm: number;
  heading: number;
}
```

### AircraftAssignmentResult (Phase 3)

```typescript
export interface AircraftAssignmentResult {
  aircraft: AircraftRow;
  route: RouteResult;
  availablePayloadKg: number;
  feasible: boolean;
  infeasibilityReason?: string;
}
```

### WeightBalanceResult (Phase 4)

```typescript
export interface WeightBalanceResult {
  flightLegId: number;
  passengerWeightKg: number;
  baggageWeightKg: number;
  freightWeightKg: number;
  fuelWeightKg: number;
  crewWeightKg: number;
  emptyWeightKg: number;
  totalWeightKg: number;
  fuelPlan: FuelPlan;
  totalMomentKgm: number;
  cgPositionPct: number;
  effectiveMtowKg: number;
  effectiveMlwKg: number;
  mtowUsedPct: number;
  mlwUsedPct: number;
  bindingConstraint: BindingConstraintInfo;
}

### PilotAssignmentResult (Phase 5)

```typescript
export interface PilotAssignmentResult {
  flightId: number;
  pilotId: number;
  role: "captain" | "relief";
}

export interface PilotAvailability {
  pilotId: number;
  name: string;
  available: boolean;
  currentDutyHours: number;
  maxDutyHoursPerDay: number;
  currentFlightHours: number;
  maxFlightHoursPerDay: number;
  medicalValid: boolean;
}
```

### ScheduleBuildResult (Overall)

```typescript
export interface ScheduleBuildResult {
  scheduleId: number;
  scheduleDate: string;
  clusters: ClusterResult[];
  routes: RouteResult[];
  aircraftAssignments: AircraftAssignmentResult[];
  weightBalances: WeightBalanceResult[];
  pilotAssignments: PilotAssignmentResult[];
  errors: string[];
  warnings: string[];
}
```

### FuelPlan

```typescript
export interface FuelPlan {
  requiredFuelKg: number;
  minimumFuelKg: number;
  fuelState: string;
  fuelRuleApplied: string;
  fuelOnBoardKg: number;
  fuelBurnKg: number;
  fuelRemainingKg: number;
  fuelEnduranceMinutes: number;
  legFlightTimeMinutes: number;
  sectorsSoFar: number;
  fuelOk: boolean;
  reserveOk: boolean;
  needsStanleyRevisit: boolean;
}
```

### AerodromeScheduling & AircraftScheduling

```typescript
export interface AerodromeScheduling extends AerodromeRow {
  mtow_limit_kg: number | null;
  mlw_limit_kg: number | null;
  fuel_available: boolean;
  operating_hours: string | null;
  pilot_briefing_required: boolean;
}

export interface AircraftScheduling extends AircraftRow {
  max_ramp_weight_kg: number | null;
  max_landing_weight_kg: number | null;
  cg_arm_m: number | null;
  fuel_flow_kg_per_hour: number | null;
  cruise_speed_ktas: number | null;
}
```

---

## 7. Cross-References

| Topic | Primary Document | Section |
|-------|-----------------|---------|
| Schedule status lifecycle | [`docs/WORKFLOWS.md`](WORKFLOWS.md) | Schedule Status Transitions |
| Scheduling pipeline (5 phases) | [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) | Section 6: Scheduling Pipeline |
| Database schema (scheduling tables) | [`docs/DATA_MODEL.md`](DATA_MODEL.md) | Section 3: Scheduling Tables |
| Drag-and-drop UI patterns | `.agents/skills/flight-schedule/SKILL.md` | Drag-and-Drop Implementation Patterns |
| Validation invariants | `.agents/skills/flight-schedule/SKILL.md` | Validation Invariants |
| Interface & type contracts | `.agents/skills/flight-schedule/SKILL.md` | Interface & Type Contracts |
| PBAC permissions | [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) | Section 7: Auth & Authorization |
| Database audit (consolidated) | [`docs/DATABASE-AUDIT-SUMMARY.md`](DATABASE-AUDIT-SUMMARY.md) | Full document |
| Implementation roadmap | [`plans/MASTER-PLAN.md`](../plans/MASTER-PLAN.md) | Full document |
| Historical scheduling plans | [`docs/archive/`](archive/) | `scheduling-implementation-plan.md`, `scheduling-workflow-pipeline.md`, etc. |
| Historical audit reports | [`docs/archive/`](archive/) | Directory |
| Consolidated scheduling migration | [`migrations/consolidated/004-scheduling.sql`](../migrations/consolidated/004-scheduling.sql) | Full file |
| Schedule action handlers | [`app/utils/schedule-handlers.server.ts`](../app/utils/schedule-handlers.server.ts) | Full file |
| Scheduling types | [`app/utils/scheduling/types.ts`](../app/utils/scheduling/types.ts) | Full file |