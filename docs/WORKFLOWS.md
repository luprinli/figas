# FIGAS Workflows

> **Version**: 1.1
> **Last Updated**: 2026-05-21
> **Application**: FIGAS Flight Operations & Booking Management System

---

## Table of Contents

1. [Booking Creation](#1-booking-creation)
2. [Check-In Process](#2-check-in-process)
3. [Flight Scheduling Pipeline](#3-flight-scheduling-pipeline)
4. [Payment Processing](#4-payment-processing)
5. [Manifest Generation](#5-manifest-generation)
6. [Status Transitions](#6-status-transitions)
7. [Booking Journey (Operations Detail)](#7-booking-journey-operations-detail)

---

## 1. Booking Creation

### Overview

Booking creation is a 4-step wizard process that creates a booking record, its itinerary legs, passenger data, and the junction records linking passengers to legs. The process is managed by the [`BookingWizard`](app/components/BookingWizard.tsx) component and orchestrated via server actions in the route modules.

### Step-by-Step Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BOOKING CREATION WORKFLOW                            │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  STEP 1: Booking Details                                              │  │
│  │                                                                       │  │
│  │  Action: POST /operations/bookings/new                                │  │
│  │  Permission: booking:create                                           │  │
│  │                                                                       │  │
│  │  Input:                                                               │  │
│  │  ├── user_id (from session)                                           │  │
│  │  ├── organization_id (optional)                                       │  │
│  │  ├── is_organization_billing (boolean)                                │  │
│  │  └── notes (optional)                                                 │  │
│  │                                                                       │  │
│  │  Process:                                                             │  │
│  │  └── bookingRepository.createPending(userId, orgId, billing)          │  │
│  │       ├── Generates unique booking_reference (e.g., FIG-ABC123)       │  │
│  │       ├── Retries on reference collision                              │  │
│  │       └── Returns new booking with status = PENDING                   │  │
│  │                                                                       │  │
│  │  Output: booking ID (redirect to step 2)                              │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  STEP 2: Itinerary Legs                                             │  │
│  │                                                                       │  │
│  │  Action: POST /operations/bookings/:id/legs                          │  │
│  │  Permission: booking:edit                                            │  │
│  │                                                                       │  │
│  │  Input (repeat for each leg):                                        │  │
│  │  ├── origin_code (FK → aerodromes)                                   │  │
│  │  ├── destination_code (FK → aerodromes)                              │  │
│  │  ├── leg_date (date of travel)                                       │  │
│  │  ├── preferred_time / preferred_time_start / preferred_time_end      │  │
│  │  ├── leg_sequence (0, 1, 2...)                                       │  │
│  │  └── freight_description / freight_weight_kg (optional)              │  │
│  │                                                                       │  │
│  │  Process:                                                             │  │
│  │  └── bookingLegRepository.create({ booking_id, origin, dest, ... })   │  │
│  │       └── Creates booking_leg record for each itinerary segment       │  │
│  │                                                                       │  │
│  │  Output: redirect to step 3                                           │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  STEP 3: Passenger Data                                             │  │
│  │                                                                       │  │
│  │  Action: POST /operations/bookings/:id/passengers                    │  │
│  │  Permission: booking:manage-passengers                               │  │
│  │                                                                       │  │
│  │  Input (repeat for each passenger):                                  │  │
│  │  ├── first_name, last_name                                           │  │
│  │  ├── email, phone (optional)                                         │  │
│  │  ├── date_of_birth                                                   │  │
│  │  ├── clothed_weight_kg (default: 70)                                 │  │
│  │  ├── residency (e.g., "resident", "non-resident")                    │  │
│  │  └── special_requirements (optional)                                 │  │
│  │                                                                       │  │
│  │  Process:                                                             │  │
│  │  └── bookingPassengerRepository.create({ booking_id, name, ... })     │  │
│  │       └── Creates booking_passenger record for each traveler          │  │
│  │                                                                       │  │
│  │  Output: redirect to step 4                                           │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  STEP 4: Link Passengers to Legs (Junction Records)                 │  │
│  │                                                                       │  │
│  │  Action: POST /operations/bookings/:id/junction                      │  │
│  │  Permission: booking:manage-passengers                               │  │
│  │                                                                       │  │
│  │  Input (repeat for each passenger-leg combination):                  │  │
│  │  ├── booking_leg_id                                                  │  │
│  │  ├── booking_passenger_id                                            │  │
│  │  ├── clothed_weight_kg (per-leg override, optional)                  │  │
│  │  ├── baggage_weight_kg (per-leg, default: 0)                        │  │
│  │  ├── baggage_description (optional)                                  │  │
│  │  ├── freight_description (optional)                                  │  │
│  │  └── freight_weight_kg (per-leg, default: 0)                        │  │
│  │                                                                       │  │
│  │  Process:                                                             │  │
│  │  └── bookingLegPassengerRepository.create({ leg_id, passenger_id })   │  │
│  │       └── Creates junction record linking passenger to specific leg   │  │
│  │                                                                       │  │
│  │  Output: redirect to booking detail page                              │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Code Locations

| Step | Route | Repository |
|------|-------|------------|
| 1. Create booking | [`operations.bookings.new.tsx`](app/routes/operations.bookings.new.tsx) | [`bookingRepository.createPending()`](app/utils/repositories/booking.ts:61) |
| 2. Add legs | [`operations.bookings.$bookingId.tsx`](app/routes/operations.bookings.$bookingId.tsx) | [`bookingLegRepository.create()`](app/utils/repositories/booking-leg.ts:36) |
| 3. Add passengers | [`operations.bookings.$bookingId.tsx`](app/routes/operations.bookings.$bookingId.tsx) | [`bookingPassengerRepository.create()`](app/utils/repositories/booking-passenger.ts:19) |
| 4. Link junction | [`operations.bookings.$bookingId.tsx`](app/routes/operations.bookings.$bookingId.tsx) | [`bookingLegPassengerRepository.create()`](app/utils/repositories/booking-leg-passenger.ts:34) |

### Validation Rules

- **Maximum passengers per booking**: 9 ([`MAX_PASSENGERS_PER_BOOKING`](app/utils/constants.ts))
- **Maximum passenger weight**: 300 kg ([`MAX_PASSENGER_WEIGHT_KG`](app/utils/constants.ts))
- **Minimum passenger weight**: 20 kg ([`MIN_PASSENGER_WEIGHT_KG`](app/utils/constants.ts))
- **Maximum baggage weight**: 50 kg ([`MAX_BAGGAGE_WEIGHT_KG`](app/utils/constants.ts))
- **Reference collision**: `createPending()` retries with a new reference if collision occurs

---

## 2. Check-In Process

### Overview

Check-in is a per-leg, per-passenger operation. Each passenger-leg combination (represented by a [`booking_leg_passengers`](migrations/016_create_booking_leg_passengers.sql) record) has independent check-in and boarding status. This allows passengers on multi-leg itineraries to be checked in for some legs but not others.

### Check-In Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CHECK-IN WORKFLOW                                  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  STEP 1: Select Flight Leg                                          │  │
│  │                                                                       │  │
│  │  Route: GET /checkin/counter                                         │  │
│  │  Permission: checkin:process                                         │  │
│  │                                                                       │  │
│  │  Process:                                                             │  │
│  │  └── flightLegRepository.findByDate(today)                           │  │
│  │       └── Returns all flight legs scheduled for today                 │  │
│  │                                                                       │  │
│  │  Display: List of available flights with origin → destination         │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  STEP 2: Search Passengers                                          │  │
│  │                                                                       │  │
│  │  Action: POST /checkin/counter                                       │  │
│  │  Permission: checkin:process                                         │  │
│  │                                                                       │  │
│  │  Input: search query (booking reference, passenger name, flight)     │  │
│  │                                                                       │  │
│  │  Process:                                                             │  │
│  │  └── checkinRepository.searchBookings(query)                         │  │
│  │       └── Searches bookings, passengers, flights for matching records │  │
│  │                                                                       │  │
│  │  Display: Matching passengers with booking/flight details             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  STEP 3: Check In Passenger                                         │  │
│  │                                                                       │  │
│  │  Action: POST /checkin/counter                                       │  │
│  │  Permission: checkin:process                                         │  │
│  │                                                                       │  │
│  │  Input: booking_leg_passenger_id                                     │  │
│  │                                                                       │  │
│  │  Process:                                                             │  │
│  │  └── bookingLegPassengerRepository.checkIn(id, userId)               │  │
│  │       ├── Sets checked_in = true                                     │  │
│  │       ├── Sets checked_in_at = NOW()                                 │  │
│  │       └── Sets checked_in_by = userId                                │  │
│  │                                                                       │  │
│  │  Display: Updated check-in status with timestamp and agent            │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  STEP 4: Board Passenger (Optional)                                 │  │
│  │                                                                       │  │
│  │  Action: POST /checkin/counter                                       │  │
│  │  Permission: checkin:process                                         │  │
│  │                                                                       │  │
│  │  Input: booking_leg_passenger_id                                     │  │
│  │                                                                       │  │
│  │  Process:                                                             │  │
│  │  └── bookingLegPassengerRepository.board(id)                         │  │
│  │       ├── Sets boarded = true                                        │  │
│  │       └── Sets boarded_at = NOW()                                    │  │
│  │                                                                       │  │
│  │  Display: Updated boarding status                                     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  STEP 5: Collect Payment (If Pay-on-Departure)                      │  │
│  │                                                                       │  │
│  │  Permission: checkin:collect-payment                                 │  │
│  │                                                                       │  │
│  │  Process:                                                             │  │
│  │  ├── checkinRepository.getOutstandingBalance(bookingId)              │  │
│  │  └── checkinRepository.recordPayment(bookingId, amount, method)      │  │
│  │       └── Creates accounting journal entry for manual payment        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Check-In Data Model

The check-in status lives on the [`booking_leg_passengers`](migrations/016_create_booking_leg_passengers.sql) junction table:

```sql
-- Check-in columns on booking_leg_passengers
checked_in    BOOLEAN NOT NULL DEFAULT false,
checked_in_at TIMESTAMPTZ,
checked_in_by INTEGER REFERENCES users(id),
boarded       BOOLEAN NOT NULL DEFAULT false,
boarded_at    TIMESTAMPTZ,
```

### Key Repository Methods

| Method | Location | Description |
|--------|----------|-------------|
| [`checkinRepository.searchBookings(query)`](app/utils/repositories/checkin.ts:109) | `checkin.ts` | Search across bookings, passengers, flights |
| [`checkinRepository.getPassengerForCheckin(legId, passengerId)`](app/utils/repositories/checkin.ts:145) | `checkin.ts` | Get detailed passenger info for check-in screen |
| [`bookingLegPassengerRepository.checkIn(id, userId)`](app/utils/repositories/booking-leg-passenger.ts:160) | `booking-leg-passenger.ts` | Mark passenger as checked in for a specific leg |
| [`bookingLegPassengerRepository.board(id)`](app/utils/repositories/booking-leg-passenger.ts:169) | `booking-leg-passenger.ts` | Mark passenger as boarded for a specific leg |
| [`bookingLegPassengerRepository.getCheckedInCount(legId)`](app/utils/repositories/booking-leg-passenger.ts:186) | `booking-leg-passenger.ts` | Count checked-in passengers for a leg |
| [`bookingLegPassengerRepository.getBoardedCount(legId)`](app/utils/repositories/booking-leg-passenger.ts:194) | `booking-leg-passenger.ts` | Count boarded passengers for a leg |

---

## 3. Flight Scheduling Pipeline

> **ℹ️ Extraction Note:** Detailed scheduling-specific documentation has been extracted to [`docs/SCHEDULING.md`](SCHEDULING.md), which serves as the single source of truth for the scheduling system. This section provides a workflow-oriented overview; refer to [`docs/SCHEDULING.md`](SCHEDULING.md) for complete details on the status lifecycle, pipeline phases, dnd-kit architecture, validation invariants, database schema, and key interfaces.

### Overview

The scheduling pipeline is a 5-phase automated process that builds daily flight schedules from unassigned booking legs. It is orchestrated by [`buildSchedule(date)`](app/utils/scheduling/index.ts:30).

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
│  │                                                                       │  │
│  │  File: cluster-bookings.ts                                           │  │
│  │  Function: clusterBookings()                                         │  │
│  │                                                                       │  │
│  │  Process:                                                             │  │
│  │  ├── Groups unassigned booking legs by date|origin|destination key    │  │
│  │  ├── Counts passengers per cluster                                   │  │
│  │  └── Returns ClusterResult[]                                         │  │
│  │                                                                       │  │
│  │  Output: [{ date, origin, destination, legs[], passengerCount }]     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  PHASE 2: ROUTE CONSTRUCTION                                        │  │
│  │                                                                       │  │
│  │  File: nearest-neighbor.ts                                           │  │
│  │  Function: buildRoute(cluster, flight)                               │  │
│  │                                                                       │  │
│  │  Process:                                                             │  │
│  │  ├── Creates flight record for the cluster                           │  │
│  │  ├── Builds optimal sortie route using nearest-neighbor heuristic    │  │
│  │  ├── Route always starts and ends at Stanley (PSY)                   │  │
│  │  ├── Uses cached aerodrome_distances and aerodrome_headings tables   │  │
│  │  ├── Assumes ~140 knots cruise speed (BN-2 Islander)                │  │
│  │  ├── Creates flight_legs from route stops                            │  │
│  │  └── Assigns booking legs to the flight                              │  │
│  │                                                                       │  │
│  │  Output: RouteResult[] with stops, distances, flight times           │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  PHASE 3: AIRCRAFT ASSIGNMENT                                       │  │
│  │                                                                       │  │
│  │  File: assign-aircraft.ts                                            │  │
│  │  Function: assignAircraftToRoutes(routes, passengerCounts)           │  │
│  │                                                                       │  │
│  │  Process:                                                             │  │
│  │  ├── Evaluates all active aircraft against each route's requirements  │  │
│  │  ├── Checks passenger capacity (seat_count)                          │  │
│  │  ├── Checks payload capacity (max_payload_kg)                        │  │
│  │  ├── Checks fuel range (fuel_capacity_kg × fuel_flow_kg_per_hour)    │  │
│  │  ├── Checks runway compatibility (aerodrome mtow_limit_kg)           │  │
│  │  ├── Selects best-fit aircraft per route                             │  │
│  │  └── Updates flights.aircraft_id                                     │  │
│  │                                                                       │  │
│  │  Output: AircraftAssignmentResult[] with feasibility flags            │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  PHASE 4: WEIGHT & BALANCE                                          │  │
│  │                                                                       │  │
│  │  File: weight-balance.ts                                             │  │
│  │  Function: computeWeightBalanceForRoute(assignment, legs, distances) │  │
│  │                                                                       │  │
│  │  Process (per flight leg):                                           │  │
│  │  ├── Sum passenger weights from booking_leg_passengers               │  │
│  │  ├── Sum baggage weights per leg                                     │  │
│  │  ├── Sum freight weights per leg                                     │  │
│  │  ├── Calculate fuel weight based on leg distance + reserves          │  │
│  │  ├── Add standard crew weight allocation                             │  │
│  │  ├── Add aircraft empty weight                                       │  │
│  │  ├── Compute total weight and CG position                            │  │
│  │  ├── Validate against effective MTOW and MLW                         │  │
│  │  ├── Identify binding constraint (MTOW, MLW, CG, fuel)              │  │
│  │  └── Save weight_balance_snapshot record                             │  │
│  │                                                                       │  │
│  │  Output: WeightBalanceResult[] with all weight components             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  PHASE 5: PILOT ASSIGNMENT                                          │  │
│  │                                                                       │  │
│  │  File: assign-pilots.ts                                              │  │
│  │  Function: assignPilotsToRoutes(aircraftAssignments, date)           │  │
│  │                                                                       │  │
│  │  Process:                                                             │  │
│  │  ├── Checks pilot qualifications (license_type, rating)              │  │
│  │  ├── Checks duty time limits (max_duty_hours_per_day)                │  │
│  │  ├── Checks rest requirements                                        │  │
│  │  ├── Checks availability (not already assigned to another flight)    │  │
│  │  ├── Assigns PIC (Captain) and SIC (First Officer) roles             │  │
│  │  └── Saves pilot_assignment records                                  │  │
│  │                                                                       │  │
│  │  Output: PilotAssignmentResult[] with pilot IDs and roles             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  OUTPUT: ScheduleBuildResult                                        │  │
│  │                                                                       │  │
│  │  {                                                                   │  │
│  │    scheduleId,       // Newly created schedule record ID             │  │
│  │    scheduleDate,     // The date the schedule was built for          │  │
│  │    clusters,         // Phase 1 output                               │  │
│  │    routes,           // Phase 2 output                               │  │
│  │    aircraftAssignments, // Phase 3 output                            │  │
│  │    weightBalances,   // Phase 4 output                               │  │
│  │    pilotAssignments, // Phase 5 output                               │  │
│  │    errors,           // Fatal errors (schedule may be incomplete)    │  │
│  │    warnings          // Non-fatal warnings (infeasible assignments)  │  │
│  │  }                                                                   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Schedule Status Lifecycle

The schedule status lifecycle consists of 6 stages:

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

**Transition Rules:**

| From | To | Action | Handler |
|------|----|--------|---------|
| `draft` | `building` | `auto-build` | [`handleAutoBuild()`](../app/utils/schedule-handlers.server.ts:29) |
| `building` | `approved` | `approve` | [`handleApprove()`](../app/utils/schedule-handlers.server.ts:69) |
| `approved` | `published` | `publish` | [`handlePublish()`](../app/utils/schedule-handlers.server.ts:173) |
| `approved` | `draft` | `revise` | [`handleRevise()`](../app/utils/schedule-handlers.server.ts:128) |
| `published` | `draft` | `revise` | [`handleRevise()`](../app/utils/schedule-handlers.server.ts:128) |
| `building` | `cancelled` | `cancel` | [`handleCancel()`](../app/utils/schedule-handlers.server.ts:232) |
| `approved` | `cancelled` | `cancel` | [`handleCancel()`](../app/utils/schedule-handlers.server.ts:232) |
| `cancelled` | *(any)* | — | **Blocked** |
| `completed` | *(any)* | — | **Blocked** |

### Auto-Build Pipeline Flow

The auto-build pipeline is triggered when a schedule transitions from `draft` → `building`. The pipeline orchestrator [`buildSchedule()`](../app/utils/scheduling/index.ts:34) executes 5 phases:

1. **Cluster** — Groups unassigned booking legs by `(origin, destination)`
2. **Route Construction** — Builds optimal sortie routes using nearest-neighbor heuristic
3. **Aircraft Assignment** — Assigns best-fit aircraft based on capacity, range, and runway compatibility
4. **Weight & Balance** — Computes per-leg weight/balance and validates against MTOW/MLW
5. **Pilot Assignment** — Assigns pilots based on qualifications, duty time, and availability

### Drag-and-Drop Assignment Workflow

The scheduling UI supports drag-and-drop operations for flight management:

1. **Booking → Flight Assignment:** Drag an unassigned booking from the unassigned pool onto a flight card. The system assigns the booking to the flight and inserts the passenger into the appropriate flight leg.
2. **Booking → Draft Flight Creation:** Drag an unassigned booking onto the "draft flight" placeholder. The system creates a new flight and assigns the booking to it.
3. **Flight Reordering:** Drag flight cards within the schedule board to reorder them. Uses `SortableContext` with `verticalListSortingStrategy`.
4. **Passenger → Flight (Reassignment):** Drag a passenger row from one flight to another to reassign them.
5. **Passenger → Unassigned Pool:** Drag a passenger row back to the unassigned pool to unassign them.

**dnd-kit Architecture:** Single `DndContext` with `pointerWithin` collision detection, `SortableContext` for flight reordering, `DragOverlay` via `createPortal`, and optimistic state management with rollback via `pendingOpsRef`.

### Key Scheduling Files

| File | Purpose |
|------|---------|
| [`app/utils/scheduling/index.ts`](../app/utils/scheduling/index.ts) | Main orchestrator — `buildSchedule(date)` |
| [`app/utils/scheduling/types.ts`](../app/utils/scheduling/types.ts) | All scheduling type definitions |
| [`app/utils/scheduling/cluster-bookings.ts`](../app/utils/scheduling/cluster-bookings.ts) | Phase 1: Cluster unassigned legs |
| [`app/utils/scheduling/nearest-neighbor.ts`](../app/utils/scheduling/nearest-neighbor.ts) | Phase 2: Route optimization |
| [`app/utils/scheduling/assign-aircraft.ts`](../app/utils/scheduling/assign-aircraft.ts) | Phase 3: Aircraft assignment |
| [`app/utils/scheduling/weight-balance.ts`](../app/utils/scheduling/weight-balance.ts) | Phase 4: Weight & balance computation |
| [`app/utils/scheduling/assign-pilots.ts`](../app/utils/scheduling/assign-pilots.ts) | Phase 5: Pilot assignment |
| [`app/utils/schedule-handlers.server.ts`](../app/utils/schedule-handlers.server.ts) | Schedule action handlers (auto-build, approve, publish, cancel, revise) |
| [`app/routes/operations.schedule._index.tsx`](../app/routes/operations.schedule._index.tsx) | Scheduling UI route with dnd-kit integration |
| [`app/components/schedule/ScheduleBoard.tsx`](../app/components/schedule/ScheduleBoard.tsx) | Schedule board component with SortableContext |
| [`app/components/schedule/SortableDroppableFlightCard.tsx`](../app/components/schedule/SortableDroppableFlightCard.tsx) | Flight card with useDroppable + useSortable |
| [`app/components/schedule/DraggableBookingItem.tsx`](../app/components/schedule/DraggableBookingItem.tsx) | Draggable unassigned booking item |
| [`app/components/schedule/DraggablePassengerRow.tsx`](../app/components/schedule/DraggablePassengerRow.tsx) | Draggable passenger row within a flight |
| [`app/components/schedule/DraftFlightPlaceholder.tsx`](../app/components/schedule/DraftFlightPlaceholder.tsx) | Drop zone for creating new flights |

---

## 4. Payment Processing

### Overview

The system supports four payment methods with different flows. All payments create double-entry accounting journal entries for audit trail integrity.

### Payment Method Selection Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PAYMENT METHOD SELECTION                              │
│                                                                             │
│  User on booking detail page clicks "Make Payment"                         │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Step 1: Calculate Cost                                              │  │
│  │                                                                       │  │
│  │  └── paymentService.calculateBookingCost(bookingId)                  │  │
│  │       ├── Fetch legs and passengers                                  │  │
│  │       ├── For each leg: lookup base_fare from fare_routes table      │  │
│  │       ├── Multiply fare × passenger count                            │  │
│  │       ├── Add freight costs (£2/kg placeholder)                      │  │
│  │       └── Return total                                               │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Step 2: Select Payment Method                                      │  │
│  │                                                                       │  │
│  │  └── paymentService.getAvailableMethods()                            │  │
│  │       └── Returns active payment methods from payment_methods table  │  │
│  │                                                                       │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │  │
│  │  │  STRIPE      │  │  INVOICE     │  │ PAY ON       │  │ PAY ON   │  │
│  │  │  (Online     │  │  (Credit     │  │ DEPARTURE    │  │ ARRIVAL  │  │
│  │  │   Card)      │  │   Terms)     │  │              │  │          │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────┬─────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Stripe Payment Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          STRIPE PAYMENT FLOW                                │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  1. Initiate Stripe Payment                                         │  │
│  │                                                                       │  │
│  │  └── paymentService.initiateStripePayment({                          │  │
│  │         bookingId, amount, successUrl, cancelUrl, userId             │  │
│  │       })                                                              │  │
│  │       ├── Update booking: payment_status = PROCESSING                │  │
│  │       ├── Generate payment UUID                                      │  │
│  │       ├── Create Stripe Checkout Session (mode: payment, GBP)        │  │
│  │       ├── Store stripe_payments record with session ID               │  │
│  │       └── Return session URL for redirect                            │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  2. User Completes Payment on Stripe Checkout                       │  │
│  │                                                                       │  │
│  │  └── Stripe redirects to successUrl or cancelUrl                     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  3. Handle Success (Webhook or Success Page)                        │  │
│  │                                                                       │  │
│  │  └── paymentService.handleStripeSuccess({ sessionId, intentId })     │  │
│  │       ├── Update stripe_payments: status = succeeded                 │  │
│  │       ├── Create accounting journal entry:                           │  │
│  │       │   Dr. Accounts Receivable (1020)                             │  │
│  │       │   Cr. Passenger Fare Revenue (4010)                          │  │
│  │       └── Return success                                             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Invoice Payment Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          INVOICE PAYMENT FLOW                               │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  1. Generate Invoice                                                │  │
│  │                                                                       │  │
│  │  └── paymentService.recordInvoiceSelection({                         │  │
│  │         bookingId, organizationId, userId, lineItems                 │  │
│  │       })                                                              │  │
│  │       ├── Generate invoice number (sequential)                       │  │
│  │       ├── Calculate subtotal, tax (0% FI), total                     │  │
│  │       ├── Create invoice (status: DRAFT)                             │  │
│  │       ├── Create invoice_items for each line item                    │  │
│  │       └── Update booking: payment_status = INVOICED                  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  2. Issue Invoice (Send to Customer)                               │  │
│  │                                                                       │  │
│  │  └── invoiceService.issueInvoice(invoiceId, issuedBy)                │  │
│  │       ├── Update invoice: status = ISSUED                            │  │
│  │       └── Create accounting entry:                                   │  │
│  │           Dr. Accounts Receivable (1020)                             │  │
│  │           Cr. Passenger Fare Revenue (4010)                          │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  3. Record Payment Against Invoice                                  │  │
│  │                                                                       │  │
│  │  └── invoiceService.recordPaymentAgainstInvoice({                    │  │
│  │         invoiceId, amount, method, userId                            │  │
│  │       })                                                              │  │
│  │       ├── Update invoice: amount_paid_gbp += amount                  │  │
│  │       ├── If fully paid: status = PAID                               │  │
│  │       └── Create accounting entry for payment receipt                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Manual Payment Flow (Cash / Bank Transfer)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MANUAL PAYMENT FLOW                                 │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  1. Record Manual Payment                                           │  │
│  │                                                                       │  │
│  │  └── paymentService.recordManualPayment({                            │  │
│  │         bookingId, amount, methodCode, notes, userId                 │  │
│  │       })                                                              │  │
│  │       ├── Update booking: payment_status = PAID                      │  │
│  │       ├── Create accounting journal entry:                           │  │
│  │       │   Dr. Cash at Bank (1010)                                    │  │
│  │       │   Cr. Passenger Fare Revenue (4010)                          │  │
│  │       └── Return success                                             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Accounting Journal Entry Patterns

Every financial transaction creates a double-entry journal entry with balanced debit and credit lines:

| Transaction Type | Debit | Credit |
|-----------------|-------|--------|
| Stripe payment | Accounts Receivable (1020) | Passenger Fare Revenue (4010) |
| Manual payment (cash) | Cash at Bank (1010) | Passenger Fare Revenue (4010) |
| Invoice issued | Accounts Receivable (1020) | Passenger Fare Revenue (4010) |
| Invoice payment received | Cash at Bank (1010) | Accounts Receivable (1020) |
| Refund | Passenger Fare Revenue (4010) | Cash at Bank (1010) |
| Void invoice (reversing) | Passenger Fare Revenue (4010) | Accounts Receivable (1020) |

### Dual-Control Approval

Journal entries require approval via [`approveJournalEntry()`](app/utils/services/invoice.service.ts:715):

- **No self-approval**: A user cannot approve their own entries
- **Hierarchy check**: Approver must have equal or higher hierarchy level
- **Audit trail**: All approvals are logged

---

## 5. Manifest Generation

### Overview

The flight manifest provides a summary of passengers, baggage, freight, and weight information for a specific flight. It is accessible at the manifest route and includes pilot sign-off capability.

### Manifest Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MANIFEST GENERATION                                  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Route: GET /operations/flights/:flightId/manifest                   │  │
│  │  Permission: flights:manage-manifest                                 │  │
│  │                                                                       │  │
│  │  Loader fetches:                                                      │  │
│  │  ├── flightRepository.findById(flightId)                             │  │
│  │  ├── flightLegRepository.findByFlightId(flightId)                    │  │
│  │  ├── bookingLegRepository.findByFlightId(flightId)                   │  │
│  │  └── bookingLegPassengerRepository.findByLegId(legId) per leg        │  │
│  │                                                                       │  │
│  │  Display:                                                             │  │
│  │  ├── Flight details (number, aircraft, route)                        │  │
│  │  ├── Per-leg passenger manifest with check-in/boarding status        │  │
│  │  ├── Weight summary (passenger, baggage, freight, fuel, total)       │  │
│  │  ├── Weight balance percentage                                       │  │
│  │  └── Pilot sign-off section                                          │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Pilot Sign-Off Action                                              │  │
│  │                                                                       │  │
│  │  Action: POST /operations/flights/:flightId/manifest                 │  │
│  │  Permission: flights:manage-manifest                                 │  │
│  │                                                                       │  │
│  │  Input: pilot_signoff = true                                         │  │
│  │                                                                       │  │
│  │  Process:                                                             │  │
│  │  └── flightManifestRepository.update(manifestId, {                   │  │
│  │         pilot_signoff: true, pilot_id, signed_off_at: NOW()          │  │
│  │       })                                                              │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Manifest Data Sources

| Data | Source |
|------|--------|
| Flight info | [`flightRepository.findById()`](app/utils/repositories/flight.ts) |
| Flight legs | [`flightLegRepository.findByFlightId()`](app/utils/repositories/flight-leg.ts) |
| Bookings on flight | [`bookingRepository.findByFlightId()`](app/utils/repositories/booking.ts:533) |
| Passengers per leg | [`bookingLegPassengerRepository.findByLegId()`](app/utils/repositories/booking-leg-passenger.ts:62) |
| Weight balance | [`weightBalanceRepository.findByFlightLegId()`](app/utils/repositories/weight-balance.ts) |

---

## 6. Status Transitions

### Booking Status Pipeline

```
                        ┌──────────┐
                        │ PENDING  │
                        └────┬─────┘
                             │
                             ▼
                        ┌───────────┐
                        │ CONFIRMED │
                        └────┬──────┘
                             │
                             ▼
                        ┌──────────────┐
                        │ PILOT_REVIEW │
                        └──────┬───────┘
                               │
                               ▼
                        ┌──────────┐
                        │ APPROVED │
                        └────┬─────┘
                             │
                    ┌────────┴────────┐
                    ▼                 ▼
             ┌───────────┐    ┌───────────┐
             │ COMPLETED │    │ CANCELLED │
             └───────────┘    └───────────┘
```

| Status | Description | Allowed Transitions |
|--------|-------------|-------------------|
| `PENDING` | Initial state after booking creation | → `CONFIRMED`, → `CANCELLED` |
| `CONFIRMED` | Booking details verified | → `PILOT_REVIEW`, → `CANCELLED` |
| `PILOT_REVIEW` | Awaiting pilot review of flight assignment | → `APPROVED`, → `CANCELLED` |
| `APPROVED` | Booking approved for travel | → `COMPLETED`, → `CANCELLED` |
| `COMPLETED` | Travel completed | Terminal |
| `CANCELLED` | Booking cancelled | Terminal |

### Schedule Status Pipeline

The schedule status pipeline is enforced by a database CHECK constraint on the `schedules` table (see [`migrations/014_create_scheduling_tables.sql`](migrations/014_create_scheduling_tables.sql:18)). The pipeline consists of 8 stages:

```
                        ┌──────────┐
                        │ BUILDING │
                        └────┬─────┘
                             │
                             ▼
                        ┌──────────┐
                        │ APPROVED │
                        └────┬─────┘
                             │
                             ▼
                        ┌───────────┐
                        │ PUBLISHED │
                        └────┬──────┘
                             │
                             ▼
                        ┌────────────────┐
                        │ PILOT_ASSIGNED │
                        └───────┬────────┘
                                │
                                ▼
                        ┌─────────────────────┐
                        │ LOADSHEET_GENERATED │
                        └────────┬────────────┘
                                 │
                                 ▼
                        ┌─────────────┐
                        │ IN_PROGRESS │
                        └──────┬──────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
             ┌───────────┐       ┌───────────┐
             │ COMPLETED │       │ CANCELLED │
             └───────────┘       └───────────┘
```

| Status | Description | Allowed Transitions |
|--------|-------------|-------------------|
| `BUILDING` | Pipeline is running, schedule being constructed | → `APPROVED`, → `CANCELLED` |
| `APPROVED` | Schedule reviewed and approved by operations | → `PUBLISHED`, → `CANCELLED` |
| `PUBLISHED` | Visible to pilots and passengers | → `PILOT_ASSIGNED`, → `CANCELLED` |
| `PILOT_ASSIGNED` | Pilots have been assigned to all flights | → `LOADSHEET_GENERATED`, → `CANCELLED` |
| `LOADSHEET_GENERATED` | Loadsheets have been generated for all flights | → `IN_PROGRESS`, → `CANCELLED` |
| `IN_PROGRESS` | Schedule is currently in operation | → `COMPLETED`, → `CANCELLED` |
| `COMPLETED` | All flights completed | Terminal |
| `CANCELLED` | Schedule cancelled | Terminal |

### Payment Status Pipeline

```
                        ┌──────────┐
                        │ PENDING  │
                        └────┬─────┘
                             │
                             ▼
                        ┌────────────┐
                        │ PROCESSING │
                        └─────┬──────┘
                              │
                     ┌────────┴────────┐
                     ▼                 ▼
                ┌────────┐     ┌───────────┐
                │  PAID  │     │ CANCELLED │
                └───┬────┘     └───────────┘
                    │
                    ▼
              ┌────────────┐
              │ RECONCILED │
              └────────────┘
                    │
                    ▼
              ┌───────────┐
              │  REFUNDED │
              └───────────┘
```

| Status | Description | Allowed Transitions |
|--------|-------------|-------------------|
| `PENDING` | Awaiting payment | → `PROCESSING`, → `CANCELLED` |
| `PROCESSING` | Payment in progress (Stripe Checkout open) | → `PAID`, → `CANCELLED` |
| `PAID` | Payment completed successfully | → `RECONCILED`, → `REFUNDED` |
| `RECONCILED` | Payment matched in bank reconciliation | → `REFUNDED` |
| `CANCELLED` | Payment cancelled | Terminal |
| `REFUNDED` | Payment refunded | Terminal |

### Invoice Status Pipeline

```
                        ┌────────┐
                        │ DRAFT  │
                        └───┬────┘
                            │
                   ┌────────┴────────┐
                   ▼                 ▼
              ┌────────┐     ┌───────────┐
              │ ISSUED │     │ CANCELLED │
              └───┬────┘     └───────────┘
                  │
                  ▼
             ┌────────┐
             │  PAID  │
             └───┬────┘
                 │
          ┌──────┴──────┐
          ▼             ▼
    ┌────────────┐ ┌────────┐
    │ RECONCILED │ │  VOID  │
    └────────────┘ └────────┘
```

| Status | Description | Allowed Transitions |
|--------|-------------|-------------------|
| `DRAFT` | Invoice created but not sent | → `ISSUED`, → `CANCELLED` |
| `ISSUED` | Sent to customer, awaiting payment | → `PAID`, → `VOID` |
| `PAID` | Full payment received | → `RECONCILED` |
| `RECONCILED` | Payment matched in reconciliation | Terminal |
| `CANCELLED` | Cancelled before issuance | Terminal |
| `VOID` | Voided after issuance (creates reversing entry) | Terminal |

### Flight Status Pipeline

```
                        ┌───────────┐
                        │ SCHEDULED │
                        └─────┬─────┘
                              │
                              ▼
                        ┌────────────┐
                        │ IN PROGRESS│
                        └─────┬──────┘
                              │
                     ┌────────┴────────┐
                     ▼                 ▼
                ┌───────────┐   ┌───────────┐
                │ COMPLETED │   │ CANCELLED │
                └───────────┘   └───────────┘
```

### Check-In / Boarding Status (per booking_leg_passengers record)

```
                        ┌───────────┐
                        │ NOT CHECKED│
                        │    IN     │
                        └─────┬─────┘
                              │
                              ▼
                        ┌───────────┐
                        │ CHECKED IN│
                        └─────┬─────┘
                              │
                              ▼
                        ┌───────────┐
                        │  BOARDED  │
                        └───────────┘
```

These statuses are tracked via boolean flags on the [`booking_leg_passengers`](migrations/016_create_booking_leg_passengers.sql) junction table:

- `checked_in = false`, `boarded = false` → Not checked in
- `checked_in = true`, `boarded = false` → Checked in, not yet boarded
- `checked_in = true`, `boarded = true` → Boarded

---

## 7. Booking Journey (Operations Detail)

### Overview

The operations booking detail page at [`operations.bookings.$bookingId.tsx`](app/routes/operations.bookings.$bookingId.tsx) provides a comprehensive view of a booking with interactive sections for managing passengers, seats, freight, payment, itinerary, and post-booking changes. The page is organized into collapsible [`ExpandableSection`](app/components/ExpandableSection.tsx) panels, each powered by dedicated components.

### Page Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    OPERATIONS BOOKING DETAIL PAGE                            │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  HEADER                                                               │  │
│  │  └── Booking reference, status badge, action buttons                 │  │
│  │      (edit, cancel, status transitions)                               │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  E1: Booking Timeline (BookingTimeline)                              │  │
│  │  └── Visual status progression with timestamps                      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  E2: Passengers (PassengerManifest)                                  │  │
│  │  └── Boarding-pass-style cards with check-in/boarding status        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  E3: Seats                                                            │  │
│  │  └── Per-leg seat assignment table with passenger names             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  E4: Freight                                                          │  │
│  │  └── Per-leg freight summary with descriptions and weights          │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  E5: Payment                                                          │  │
│  │  ├── BookingCostSummary (async fare calculation)                     │  │
│  │  ├── PaymentConfirmation (status display)                            │  │
│  │  ├── PostBookingChanges (refunds/top-ups)                            │  │
│  │  └── Manage Payment link                                             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  E6: Itinerary Details (FlightLegTimeline)                           │  │
│  │  └── Vertical timeline with airport code badges and leg cards       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  E7: Flight Ticket (FlightTicket)                                    │  │
│  │  └── Printable ticket with barcode, passenger/leg details           │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  FOOTER                                                               │  │
│  │  ├── Cancel booking (with reason)                                    │  │
│  │  ├── Approve booking (PILOT_REVIEW → APPROVED)                       │  │
│  │  └── Manage payment link                                             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Details

#### E1: Booking Timeline ([`BookingTimeline`](app/components/BookingTimeline.tsx))

Displays the booking's status progression as a horizontal timeline with completed, current, and pending steps. Each step shows the status name and timestamp.

#### E2: Passenger Manifest ([`PassengerManifest`](app/components/booking/PassengerManifest.tsx))

Renders passengers as boarding-pass-style cards in a responsive grid. Each card shows:
- Passenger name, date of birth, residency
- Check-in status badge (not checked in / checked in / boarded) with color coding
- Seat assignment per leg
- Link to edit passenger details
- Loading skeleton, empty state, and error state handling

```typescript
interface PassengerManifestProps {
  passengers: BookingPassengerRow[];
  legPassengers: BookingLegPassengerWithDetails[];
  legs: BookingLegRow[];
  seatAssignments: SeatAssignment[];
  bookingId: number;
  canEdit: boolean;
}
```

#### E3: Seats

A per-leg seat assignment table showing which passengers are assigned to which seats. Uses the [`seatAssignments`](app/routes/operations.bookings.$bookingId.tsx:116) data structure from the loader:

```typescript
interface SeatAssignment {
  legId: number;
  flightId: number;
  seats: Array<{ seatNumber: string; passengerId: number | null }>;
}
```

#### E4: Freight

Per-leg freight summary table showing freight descriptions, weights, and associated passengers. Links to the full freight management page.

#### E5: Payment Section

The payment section is the most complex panel, composed of three sub-components:

##### [`BookingCostSummary`](app/components/booking/BookingCostSummary.tsx)

Asynchronously calculates and displays the fare breakdown. Uses [`calculateFareBreakdown()`](app/utils/services/fare-calculator.ts) to compute per-leg, per-passenger costs with residency-based pricing.

```typescript
interface BookingCostSummaryProps {
  bookingId: number;
  legs: BookingLegRow[];
  passengers: BookingPassengerRow[];
  legPassengers: BookingLegPassengerWithDetails[];
}
```

Features:
- Loading state with skeleton while fare calculation runs
- Cost breakdown table (leg, passenger count, fare type, subtotal)
- Total amount display
- Empty state when no legs or passengers
- Error state with retry mechanism

##### [`PaymentConfirmation`](app/components/booking/PaymentConfirmation.tsx)

Displays the current payment status with appropriate icon and messaging:

| Status | Icon | Display |
|--------|------|---------|
| `pending` | [`CashIcon`](app/components/icons/CashIcon.tsx) | "Awaiting payment" |
| `processing` | [`LoadingSpinner`](app/components/icons/LoadingSpinner.tsx) | "Processing payment" |
| `paid` | [`CreditCardIcon`](app/components/icons/CreditCardIcon.tsx) | "Payment received" with amount and method |
| `partially_paid` | [`CreditCardIcon`](app/components/icons/CreditCardIcon.tsx) | "Partially paid" with amount |
| `failed` | — | "Payment failed" |
| `refunded` | — | "Payment refunded" |
| `invoiced` | [`InvoiceIcon`](app/components/icons/InvoiceIcon.tsx) | "Invoiced" |

##### [`PostBookingChanges`](app/components/booking/PostBookingChanges.tsx)

Manages post-booking financial adjustments (refunds and top-ups). Only visible when user has `canManagePayment` permission and payment status is `paid` or `partially_paid`.

```typescript
interface PostBookingChangesProps {
  bookingId: number;
  bookingReference: string;
  paymentStatus: string;
  legs: BookingLegRow[];
  passengers: BookingPassengerRow[];
  legPassengers: BookingLegPassengerWithDetails[];
  storedTotal: number;
  canManagePayment: boolean;
}
```

Sub-components:
- **FareDifferenceCalculator** — Compares the stored total against the currently calculated fare. Shows the difference with refund (amber) or balanced (emerald) indicators. Includes collapsible breakdown details.
- **ChangeHistory** — Lists past refunds/top-ups (currently shows empty state with [`WingIcon`](app/components/icons/WingIcon.tsx)).
- **New Change Form** — Type toggle (refund/top-up), amount input, reason textarea. Submits via `useFetcher` with `intent: "post_booking_change"`.

#### E6: Itinerary Details ([`FlightLegTimeline`](app/components/booking/FlightLegTimeline.tsx))

A vertical timeline showing each booking leg as a card connected by a timeline connector. Each leg card displays:
- Origin and destination as [`AirportCodeBadge`](app/components/booking/AirportCodeBadge.tsx) components (luggage-tag style)
- Departure date and preferred time
- Flight assignment status (assigned flight number or "Not yet assigned")
- Seat assignments per passenger

```typescript
interface FlightLegTimelineProps {
  legs: BookingLegRow[];
  legPassengers: BookingLegPassengerWithDetails[];
  seatAssignments: SeatAssignment[];
}
```

The [`AirportCodeBadge`](app/components/booking/AirportCodeBadge.tsx) component renders airport codes in a luggage-tag style with three variants:
- `origin` — Blue styling
- `destination` — Green styling
- `default` — Neutral styling

Three sizes: `sm` (text-xs), `md` (text-sm, default), `lg` (text-base).

#### E7: Flight Ticket ([`FlightTicket`](app/components/booking/FlightTicket.tsx))

A printable flight ticket component styled for A4 portrait output via [`ticket-print.css`](app/styles/ticket-print.css). Features:
- **Print button** — Triggers `window.print()` via double `requestAnimationFrame` for reliable rendering
- **Ticket header** — Aircraft icon, booking reference, and "Flight Ticket" title
- **Passenger strip** — Primary passenger name, date of birth, residency
- **Ticket leg cards** — Each leg shows origin → destination, departure date, preferred time, check-in status badge
- **Barcode strip** — Visual barcode using [`BarcodeIcon`](app/components/icons/BarcodeIcon.tsx)
- **Payment summary** — Total amount, payment method, payment status
- **Footer** — Booking reference and generation date

```typescript
interface FlightTicketProps {
  bookingReference: string;
  passengers: BookingPassengerRow[];
  legs: BookingLegRow[];
  legPassengers: BookingLegPassengerWithDetails[];
  seatAssignments: SeatAssignment[];
  totalAmountGbp: number | null;
  paymentMethod: string | null;
  paymentStatus: string;
}
```

States: Loading (skeleton), empty (no passengers/legs), error (missing data), normal (rendered ticket).

### Fare Calculation Service ([`fare-calculator.ts`](app/utils/services/fare-calculator.ts))

The fare calculator provides a detailed per-leg, per-passenger cost breakdown:

```typescript
export interface FareCalculationResult {
  legs: Array<{
    legId: number;
    origin: string;
    destination: string;
    passengers: Array<{
      passengerId: number;
      name: string;
      residency: string;
      fareAmount: number;
    }>;
    legSubtotal: number;
  }>;
  totalAmount: number;
}

export async function calculateFareBreakdown(
  legs: BookingLegRow[],
  passengers: BookingPassengerRow[],
  legPassengers: BookingLegPassengerWithDetails[]
): Promise<FareCalculationResult>
```

Pricing logic:
- Looks up base fare from [`fareRouteRepository.getBaseFare()`](app/utils/repositories/fare-route.ts:43) for each origin→destination pair
- Applies residency multiplier: residents pay full fare, non-residents pay a premium (×1.5)
- Sums per-leg subtotals into total amount

### Key Data Flow

```
Loader (server)
  ├── bookingRepository.findById(bookingId)
  ├── bookingLegRepository.findByBookingId(bookingId)
  ├── bookingPassengerRepository.findByBookingId(bookingId)
  ├── bookingLegPassengerRepository.findByBookingId(bookingId)
  ├── seatRepository.findByBookingId(bookingId)  → seatAssignments
  └── permission checks → canEdit, canCancel, canManagePayment, etc.

Client Components
  ├── BookingTimeline       ← booking.status
  ├── PassengerManifest     ← passengers, legPassengers, seatAssignments
  ├── FlightLegTimeline     ← legs, legPassengers, seatAssignments
  ├── BookingCostSummary    ← bookingId, legs, passengers, legPassengers (async)
  ├── PaymentConfirmation   ← booking.payment_status, booking.payment_method
  ├── PostBookingChanges    ← bookingId, paymentStatus, legs, passengers (permission-gated)
  └── FlightTicket          ← bookingReference, passengers, legs, seatAssignments
```

### Permission Gates

| Feature | Permission Check | Condition |
|---------|-----------------|-----------|
| Edit booking | `permissions.canEdit` | `booking:edit` |
| Cancel booking | `permissions.canCancel` | `booking:cancel` |
| Manage payment | `permissions.canManagePayment` | `payment:process` |
| Post-booking changes | `canManagePayment && (paid \|\| partially_paid)` | Payment status gate |
| Approve booking | `permissions.canApprove` | `booking:approve` (PILOT_REVIEW only) |
| Status transitions | `permissions.canEdit` | Allowed transitions from [`BookingStatus`](app/utils/constants.ts) enum |