# FIGAS Flight Scheduling — Architectural Specification

> **Status:** Superseded — kept for historical reference.
> **Superseded by:** [`docs/SCHEDULING.md`](../docs/SCHEDULING.md) (scheduling reference) and [`.agents/skills/flight-schedule/SKILL.md`](../.agents/skills/flight-schedule/SKILL.md) (authoritative technical contract).
> **Date:** Original ~2026-05; superseded 2026-06-04.
>
> **Purpose:** This document describes the FIGAS flight scheduling function in sufficient detail that an AI agent with no prior knowledge of this codebase can reconstruct the entire parallel scheduling functionality solely from this specification, without referencing any source code.
>
> **Scope:** The scheduling function at `app/routes/operations.schedule._index.tsx` and all its supporting utilities, components, and repositories.
>
> **Constraint:** No code snippets are used. All behavior, rules, constraints, and data flows are described in prose.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Conceptual Data Model](#2-conceptual-data-model)
3. [Loader Function — Server-Side Data Fetching](#3-loader-function)
4. [Action Handler — Server-Side Mutations](#4-action-handler)
5. [Route Builder Algorithm — Dynamic Route Insertion](#5-route-builder-algorithm)
6. [Flight Validation Algorithm — Client-Side Constraint Checking](#6-flight-validation-algorithm)
7. [Client-Side State Management](#7-client-side-state-management)
8. [Drag-and-Drop System](#8-drag-and-drop-system)
9. [Display Components](#9-display-components)
10. [Operational Rules and Constraints](#10-operational-rules-and-constraints)
11. [Error Handling and Edge Cases](#11-error-handling-and-edge-cases)
12. [Data Flow Diagrams](#12-data-flow-diagrams)
13. [Integration Points](#13-integration-points)

---

## 1. System Overview

### 1.1 What the Scheduling Function Does

The FIGAS flight scheduling function is a single-page application (SPA-like, but server-rendered via Remix) that allows an operations officer to:

- View the daily flight schedule for a selected date
- Create, reorder, and cancel flights
- Assign passenger bookings to flights (either to existing flights or by creating new flights)
- Unassign passengers from flights
- Auto-build an optimal route from unassigned bookings using a CVRP-SD algorithm
- Approve, revise, publish, or cancel a schedule
- See real-time validation feedback (weight, fuel, range, seat constraints) as they build the schedule
- Drag and drop bookings between flights, or from an unassigned pool into flights

### 1.2 Architecture Pattern

The function follows a **three-layer architecture**:

1. **Server Layer** — Remix `loader` and `action` functions that run on the server. The loader fetches all data needed to render the page. The action handles all mutations (create, update, delete) and returns JSON responses.
2. **Client State Layer** — React state (`useState`, `useEffect`) that holds the current schedule data, optimistic updates, and pending operation tracking. The client state is initialized from the loader data and updated optimistically before server confirmation.
3. **Display Layer** — React components that render the schedule board, flight cards, stop manifests, drag sources, and drop targets.

### 1.3 Key Design Decisions

- **Optimistic updates with rollback:** When the user drags a booking onto a flight, the UI updates immediately. If the server action fails, the UI rolls back to the previous state.
- **Validation as feedback, not gate:** The flight validation function never blocks an assignment. It computes warnings and violations but the assignment proceeds regardless. This is Rule 7 (see Section 10).
- **Per-passenger assignment:** Passengers are assigned individually (not as booking groups) via the `booking_leg_passengers` junction table. Each passenger record links to a specific flight leg.
- **PSY as hub:** All flights must start and end at Port Stanley (PSY). This is enforced by the route builder and the validation logic.
- **Dynamic route insertion:** When a booking is assigned to a flight, the system may insert new legs into the flight's route at optimal positions, rather than simply appending to the end.

### 1.4 Technology Stack

- **Framework:** Remix v2 (React Router v7 compatible)
- **Language:** TypeScript
- **Database:** PostgreSQL with raw SQL queries via a `sql` tagged template literal
- **Drag-and-Drop:** @dnd-kit/core and @dnd-kit/sortable
- **Styling:** Tailwind CSS
- **Date Handling:** native `Date` with `Intl.DateTimeFormat` for formatting
- **Form Handling:** Remix `<Form>` with `useFetcher` for non-navigation mutations

---

## 2. Conceptual Data Model

### 2.1 Core Entities

#### Schedule
- A schedule exists for a single calendar date.
- A schedule has a status: `draft`, `approved`, `published`, `cancelled`.
- A schedule can be revised (creating a new draft version from a published schedule).
- A schedule has `created_by` and `updated_by` user references.

#### Flight
- A flight belongs to exactly one schedule.
- A flight has a flight number (e.g., "FIGAS 101"), origin/destination codes (always PSY/PSY), timing fields (departure, arrival), and a status (`draft`, `approved`, `published`, `cancelled`).
- A flight is assigned an aircraft and optionally one or two pilots.
- A flight has a `sort_order` integer that determines its display order in the schedule.

#### Flight Leg
- A flight leg represents a single hop from one aerodrome to another.
- A flight leg belongs to exactly one flight.
- A flight leg has `origin_code`, `destination_code`, `distance_nm`, `heading`, `leg_number` (sequential order), and timing fields (`etd`, `eta`, `atd`, `ata`).
- A flight leg has operational columns: `pax_on`, `pax_off`, `bags_on`, `bags_off`, `fuel_uplift_kg`, `fuel_on_board_kg`, `tow_kg`, `lw_kg`.
- A flight leg has a status (`scheduled`, `active`, `completed`, `cancelled`).

#### Booking Leg
- A booking leg represents one leg of a passenger booking (a journey from origin to destination).
- A booking leg has `origin_code`, `destination_code`, and a `flight_id` (nullable — null means unscheduled).
- A booking leg has a status (`pending`, `scheduled`, `checked_in`, `boarded`, `completed`, `cancelled`).
- A booking leg belongs to a booking, which has passenger details, fare information, and payment status.

#### Booking Leg Passenger (Junction Table)
- Links a passenger to a specific flight leg on a specific sortie.
- Has `flight_leg_id` (nullable — null means the passenger is not yet assigned to a specific leg).
- Contains per-leg passenger data: `checked_in`, `boarded`, `seat`, `bags`, `weight_kg`, `tag_number`.
- This is the key table for scheduling: assigning a passenger to a flight means setting `flight_leg_id` on this record.

#### Aircraft
- An aircraft has a registration, type (always BN-2 Islander for scheduling purposes), empty weight, MTOW (max takeoff weight), MLW (max landing weight), max range in nautical miles, max passenger seats, and fuel capacity.

#### Aerodrome
- An aerodrome has an ICAO code, name, runway length in meters, and elevation.
- Aerodromes with runway length < 400m have derated MTOW/MLW limits.

#### Pilot
- A pilot has a name, license type, and availability.

### 2.2 Key Relationships

```
Schedule 1--N Flight 1--N FlightLeg
Flight N--1 Aircraft
Flight N--N Pilot (via pilot_assignments)
BookingLeg N--1 Flight (nullable)
BookingLeg 1--N BookingLegPassenger N--1 FlightLeg
```

### 2.3 Supporting Tables

- `aerodrome_distances` — Pre-computed distances between aerodrome pairs (nm)
- `aerodrome_headings` — Pre-computed headings between aerodrome pairs (degrees)
- `fuel_rules` — Fuel consumption rates and rules per aircraft type

---

## 3. Loader Function

### 3.1 Purpose

The loader fetches all data required to render the scheduling page for a given date. It runs on every GET request to the route.

### 3.2 Input

- **URL Parameter:** `date` — read via `url.searchParams.get("date")` (optional, falls back to `todayISO()` from `app/utils/dates.ts` if absent)
- **Authentication:** Session-based, requires `ops` or `admin` role

### 3.3 Data Fetched

The loader performs the following queries in sequence:

1. **Schedule by date:** Fetches the schedule record for the requested date. If no schedule exists, returns `null` for the schedule.

2. **Flights with enhanced data:** Fetches all flights for the schedule, ordered by `sort_order`. For each flight, also fetches:
   - Aircraft details (registration, `type` column, empty weight, MTOW, MLW, max range, max seats, fuel capacity)
   - Pilot assignments (pilot names)
   - Flight legs, ordered by `leg_number`
   - Passenger manifests (see below)
   - **Note:** The flights query uses NULL casts for columns that do not exist on the `flights` table (`sort_order`, `duration_minutes`, `check_in_time`, `max_takeoff_weight_kg`, `max_landing_weight_kg`, `basic_empty_weight_kg`, `payload_kg`, `fuel_kg`, `crew_weight_kg`).

3. **Passenger manifests:** For each flight, fetches all `booking_leg_passengers` records joined with `booking_legs`, `bookings`, and `booking_passengers` (not a `passengers` table). The join traverses `booking_leg_passengers → booking_passengers` to obtain passenger names and clothed weights. Groups passengers by stop (origin/destination of each leg) into:
   - `arriving_passengers` — passengers whose booking leg destination matches this stop
   - `departing_passengers` — passengers whose booking leg origin matches this stop

4. **Aircraft list:** All available aircraft for the aircraft assignment dropdown.

5. **Aerodrome names:** All aerodrome codes with their full names, for display.

6. **Unassigned bookings:** All booking legs where `flight_id IS NULL`, joined with `bookings` (using `user_id`), `users`, and `booking_passengers` (using `clothed_weight_kg`). These are the bookings waiting to be assigned to flights. `booking_legs` uses `origin_code`/`destination_code` as varchar columns directly (not foreign keys to the `aerodromes` table).

### 3.4 Data Transformation

After fetching raw data, the loader transforms flights into `FlightCardFlight` objects:

1. **Filter legs:** Remove zero-length legs (origin === destination). These are placeholders that should not be displayed.

2. **Order stop codes:** Derive an ordered list of unique stop codes from the filtered legs. Consecutive duplicate codes are collapsed (e.g., PSY-MPN-MPN-PSY becomes PSY-MPN-PSY).

3. **Build stop manifests:** For each unique stop code in order, compute:
   - `arriving_passengers` — passengers whose booking leg destination matches this stop code
   - `departing_passengers` — passengers whose booking leg origin matches this stop code
   - Passengers are included as lightweight objects with `id`, `full_name`, `weight_kg`, `booking_ref`, `origin_code`, `destination_code`, and `booking_leg_passenger_id`.

4. **Attach aircraft performance data:** If the flight has an aircraft assigned, include `empty_weight_kg`, `mtow_kg`, `mlw_kg`, `max_range_nm`, `max_seats`, `fuel_capacity_l` from the aircraft record.

### 3.5 Return Value

The loader returns a JSON object with:
- `schedule` — The schedule record (or null)
- `flights` — Array of `FlightCardFlight` objects
- `aircraft` — Array of all aircraft
- `aerodromes` — Array of `{ code, name }` for all aerodromes
- `unassignedBookings` — Array of unassigned booking records

### 3.6 Error Handling

If the schedule fetch fails, the loader returns an empty state (no schedule, no flights). Other fetch failures propagate as 500 errors.

---

## 4. Action Handler

### 4.1 Purpose

The action handler processes all mutations from the scheduling page. It receives a form data payload with an `intent` field that determines which operation to perform.

### 4.2 Common Pattern

All action handlers follow this pattern:
1. Parse and validate the `intent` from form data
2. Extract intent-specific parameters from form data
3. Perform the operation (often within a database transaction)
4. Return a JSON response with `ok: true` (or `ok: false` with an error message)

### 4.3 Intents

#### 4.3.1 `auto-build`

**Purpose:** Automatically construct an optimal set of flights from all unassigned bookings using the CVRP-SD algorithm.

**Input:** No additional parameters.

**Process:**
1. Fetch all unassigned booking legs with passenger details.
2. Group passengers by their origin-destination pair to create demand clusters.
3. Run the CVRP-SD algorithm to produce a set of routes.
4. For each route in the result:
   a. Generate a flight number.
   b. Create a flight record with the route's stops and timing.
   c. Create flight leg records for each leg in the route.
   d. Assign each passenger in the route to the appropriate flight leg.
   e. Update the booking leg's `flight_id`.
5. Return the newly created flights.

**Error handling:** If the CVRP algorithm fails or produces no routes, return an error. If any step in the transaction fails, roll back the entire auto-build.

#### 4.3.2 `approve`

**Purpose:** Change the schedule status from `draft` to `approved`.

**Input:** `scheduleId` (number).

**Process:**
1. Verify the schedule exists and is in `draft` status.
2. Update the schedule status to `approved`.
3. Update all flights in the schedule to `approved` status.
4. Update all booking legs linked to those flights to `scheduled` status.

#### 4.3.3 `revise`

**Purpose:** Create a new draft version of a published schedule, allowing edits.

**Input:** `scheduleId` (number).

**Process:**
1. Verify the schedule exists and is in `published` status.
2. Create a new schedule record with status `draft` for the same date.
3. Copy all flights (with new IDs) and flight legs from the old schedule to the new one.
4. Re-link booking legs to the new flights.
5. Return the new schedule ID.

#### 4.3.4 `publish`

**Purpose:** Change the schedule status from `approved` to `published`.

**Input:** `scheduleId` (number).

**Process:**
1. Verify the schedule exists and is in `approved` status.
2. Update the schedule status to `published`.
3. Update all flights to `published` status.

#### 4.3.5 `cancel`

**Purpose:** Cancel a schedule and all its flights.

**Input:** `scheduleId` (number).

**Process:**
1. Verify the schedule exists and is in `draft` or `approved` status.
2. Update the schedule status to `cancelled`.
3. Update all flights to `cancelled` status.
4. Unlink all booking legs from flights (set `flight_id` to null) and set their status back to `pending`.

#### 4.3.6 `reorder-flights`

**Purpose:** Change the display order of flights in the schedule.

**Input:** `flightIds` (comma-separated string of flight IDs in the new order).

**Process:**
1. Parse the comma-separated flight IDs.
2. Update each flight's `sort_order` to match its position in the array.
3. All updates happen in a single transaction.

#### 4.3.7 `add-flight`

**Purpose:** Create a new empty draft flight (PSY-PSY with no intermediate stops).

**Input:** `scheduleId` (number).

**Process:**
1. Generate a flight number.
2. Create a flight record with origin=PSY, destination=PSY, status=`draft`.
3. Create a single flight leg: PSY-PSY with leg_number=1.
4. Return the new flight ID.

#### 4.3.8 `create-flight-from-booking`

**Purpose:** Create a new flight specifically to accommodate a single unassigned booking, with the route built around that booking's origin and destination.

**Input:** `bookingLegId` (number), `scheduleId` (number, optional — if not provided, creates a new schedule).

**Process:**
1. Fetch the booking leg and its passengers.
2. If no schedule exists for the date, create one in `draft` status.
3. Generate a flight number.
4. Call the route builder (`insertPassengerRoute`) with an empty leg set and the booking's origin/destination to determine the optimal stop sequence.
5. Create the flight and its legs.
6. Assign the booking's passengers to the appropriate flight leg.
7. Update the booking leg's `flight_id`.
8. Return the new flight ID.

#### 4.3.9 `assign-booking` (Most Complex)

**Purpose:** Assign a booking to an existing flight, potentially inserting new legs into the flight's route.

**Input:** `bookingLegId` (number), `flightId` (number), `originCode` (string), `destinationCode` (string).

**Process:**

**Phase 1 — Data Fetching:**
1. Fetch the target flight and its aircraft.
2. Fetch the flight's existing legs.
3. Fetch the booking leg passenger record.
4. Fetch the booking leg details.
5. Fetch all existing passengers already assigned to this flight (for validation).

**Phase 2 — Validation:**
1. Build validation inputs from the fetched data.
2. Run `validateFlight()` with the new passenger included.
3. Collect any warnings or violations from the validation result.
4. **Important:** Validation never blocks the assignment. Warnings are stored and displayed to the user but the assignment proceeds.

**Phase 3 — Route Determination:**
1. Check if a flight leg already exists where `origin_code === originCode AND destination_code === destinationCode`.
2. If such a leg exists:
   - The passenger can be assigned directly to this existing leg.
   - No route modification is needed.
3. If no such leg exists:
   - Call `insertPassengerRoute()` with the current legs, the booking's origin, and the booking's destination.
   - This returns a new stop sequence and leg set that incorporates the booking.

**Phase 4 — Database Transaction (Direct Assignment):**
If the leg already exists:
1. Begin a transaction.
2. Assign the booking leg passenger to the existing flight leg (set `flight_leg_id`).
3. Update the booking leg's `flight_id`.
4. Re-run validation with the updated data.
5. Update the flight's `arrival_time` based on the last leg's timing.
6. Commit.

**Phase 5 — Database Transaction (Route Insertion):**
If new legs are needed:
1. Begin a transaction.
2. Call `replaceFlightLegs()` to atomically delete all existing legs for the flight and insert the new legs (with distance/heading lookups).
3. Remap existing passengers to the new legs:
   - For each existing passenger, find a leg in the new set where `origin_code` matches the passenger's booking leg origin.
   - Assign the passenger to the first matching leg.
4. Assign the new passenger to the appropriate leg.
5. Re-run validation with the updated data.
6. Update the flight's `arrival_time`.
7. Commit.

**Phase 6 — Response:**
Return the updated flight data including:
- New flight legs
- Updated stop manifests
- Validation warnings (if any)
- Any error messages

#### 4.3.10 `unassign-booking`

**Purpose:** Remove a passenger from a flight.

**Input:** `bookingLegPassengerId` (number), `flightId` (number).

**Process:**
1. Begin a transaction.
2. Delete the booking leg passenger record (set `flight_leg_id` to null).
3. Update the booking leg's `flight_id` to null.
4. Check if the flight still has any passengers assigned:
   - If no passengers remain, delete the flight and its legs.
   - If passengers remain, re-run validation and update the flight's arrival time.
5. Commit.

#### 4.3.11 `reset-draft`

**Purpose:** Reset a draft schedule to its initial state (remove all flights).

**Input:** `scheduleId` (number).

**Process:**
1. Verify the schedule exists and is in `draft` status.
2. Delete all flight legs for all flights in the schedule.
3. Delete all flights.
4. Unlink all booking legs from the deleted flights.
5. Return success.

### 4.4 Response Format

All action responses follow this structure:
```json
{
  "ok": true,
  "flight": { ... },
  "warnings": [ ... ],
  "error": "..."
}
```

---

## 5. Route Builder Algorithm

### 5.1 Overview

The route builder has two distinct algorithms:

1. **CVRP-SD (Capacitated Vehicle Routing Problem with Split Deliveries):** Used by `auto-build` to construct an optimal set of routes from all unassigned bookings.
2. **Dynamic Route Insertion:** Used by `assign-booking` and `create-flight-from-booking` to insert a single booking's origin/destination into an existing (or empty) route.

### 5.2 CVRP-SD Algorithm

#### 5.2.1 Purpose

Given a set of unassigned passenger demands (origin-destination pairs with passenger counts), construct one or more routes that:
- Start and end at PSY
- Satisfy all passenger demands (pick up at origin, drop off at destination)
- Respect aircraft capacity (max passengers on board at any time)
- Respect aircraft range (total route distance less than or equal to max range)
- Minimize total distance

#### 5.2.2 Input

- `demands`: Array of `{ origin, destination, passengerCount }` objects
- `aircraft`: Aircraft with `max_seats`, `max_range_nm`
- `distances`: Pre-computed distance matrix

#### 5.2.3 Algorithm Steps

1. **Build demand map:** Create a map of `origin to destination to passengerCount` for quick lookup.

2. **Initialize route:** Start at PSY with 0 passengers on board.

3. **Nearest-neighbor with split delivery:**
   - At each stop, determine which passengers can be picked up (those whose origin is the current stop) and which can be dropped off (those whose destination is the current stop).
   - Pick up all waiting passengers whose origin is the current stop, up to aircraft capacity.
   - Drop off all passengers whose destination is the current stop.
   - From the current stop, find the nearest unvisited stop that has either:
     - Passengers waiting to be picked up (origin equals that stop), or
     - Passengers on board whose destination is that stop.
   - If multiple candidates exist, prefer the one that minimizes total route distance.

4. **Split delivery handling:**
   - If a stop has more passengers waiting than available capacity, only pick up as many as fit. The remaining passengers are left for a subsequent route.
   - Track satisfied demand separately from total demand.

5. **Fuel constraint checking:**
   - After each leg, check if the aircraft has enough fuel to reach the next stop and return to PSY.
   - If not, insert a fuel stop at PSY (return to base, refuel, continue).

6. **Route completion:**
   - When all demand is satisfied or no further stops are reachable, return to PSY.
   - If unsatisfied demand remains, start a new route (new flight).

7. **Return value:** Array of `RouteResult` objects, each containing:
   - `stops`: Ordered array of stop codes
   - `legs`: Array of `{ origin, destination }` objects
   - `passengers`: Array of passenger assignments per leg

#### 5.2.4 Edge Cases

- **No demands:** Return empty array.
- **Single demand:** Create a direct PSY-origin-destination-PSY route.
- **All demands to/from same stop:** Create a single route with multiple visits to that stop.
- **Demand exceeds capacity:** Split across multiple routes.

### 5.3 Dynamic Route Insertion Algorithm

#### 5.3.1 Purpose

Given an existing flight's leg sequence and a booking's origin/destination, determine the optimal new leg sequence that incorporates the booking with minimal disruption to the existing route.

#### 5.3.2 Input

- `currentLegs`: Array of `{ origin_code, destination_code }` for the existing flight
- `originCode`: The booking's origin aerodrome
- `destinationCode`: The booking's destination aerodrome

#### 5.3.3 Algorithm Steps

1. **Early exit — matching leg exists:**
   - Check if any existing leg has `origin_code === originCode AND destination_code === destinationCode`.
   - If found, return null (no route modification needed — the passenger can be assigned directly to this leg).

2. **Derive stop sequence:**
   - Convert the legs array into an ordered list of stop codes.
   - For each leg, add `origin_code` to the sequence. Add `destination_code` only if it differs from the previous stop.
   - Example: `[PSY-MPN, MPN-PSY]` becomes `[PSY, MPN, PSY]`.

3. **Determine origin/destination presence:**
   - Check if `originCode` exists in the stop sequence.
   - Check if `destinationCode` exists in the stop sequence.

4. **Case-based insertion:**

   **Case A — Both origin and destination are missing from the route:**
   - Find the optimal insertion position for the origin using `findOptimalInsertionPosition`.
   - Insert the origin at that position.
   - Find the optimal insertion position for the destination (after the origin's new position).
   - Insert the destination at that position.
   - This creates a new leg: origin to destination.

   **Case B — Origin is present, destination is missing:**
   - Find the position of the origin in the sequence.
   - Find the optimal insertion position for the destination (after the origin's position).
   - Insert the destination at that position.
   - This creates a new leg: origin to destination, splitting an existing leg if needed.

   **Case C — Destination is present, origin is missing:**
   - Find the position of the destination in the sequence.
   - Find the optimal insertion position for the origin (before the destination's position).
   - Insert the origin at that position.
   - This creates a new leg: origin to destination.

   **Case D — Both origin and destination are present:**
   - Verify that origin appears before destination in the sequence.
   - If they are in the correct order, no new legs are needed — the passenger can travel on existing legs.
   - If they are in the wrong order (destination before origin), this is an error condition.

5. **Post-processing:**
   - Ensure the first stop is PSY and the last stop is PSY.
   - Remove consecutive duplicate stops (e.g., PSY-PSY becomes just PSY).
   - Rebuild the legs array from the stop sequence: for each consecutive pair of stops, create a leg.

6. **Return value:** `{ stops: string[], legs: Array<{ origin_code, destination_code }> }` or null if no modification needed.

#### 5.3.4 Optimal Insertion Position

The `findOptimalInsertionPosition` function determines where to insert a new stop by minimizing the cost function:

```
cost = distance(prevStop, newStop) + distance(newStop, nextStop) - distance(prevStop, nextStop)
```

This is the standard "cheapest insertion" heuristic for the traveling salesman problem. It finds the position where inserting the new stop adds the least additional distance.

#### 5.3.5 Edge Cases

- **Empty route (no legs):** Create a route PSY to origin to destination to PSY.
- **Single leg (PSY-PSY):** Insert origin after first PSY, insert destination before last PSY.
- **Origin equals destination:** This is a zero-length booking (passenger travels from and to the same stop). This should not occur in practice but if it does, no route modification is needed.
- **Origin or destination equals PSY:** Handled naturally by the case logic. If origin is PSY, it is already in the sequence (Case B). If destination is PSY, it is already in the sequence (Case C).

---

## 6. Flight Validation Algorithm

### 6.1 Purpose

The flight validation function is a **pure client-side function** with no side effects. It takes a flight's current state (passengers, legs, aircraft) and computes whether the flight would violate any operational constraints. It returns warnings and violations but **never blocks an assignment**.

### 6.2 Input

- `passengers`: Array of `{ id, origin_code, destination_code, weight_kg, name }` for all passengers assigned to the flight
- `legs`: Array of `{ origin_code, destination_code, distance_nm }` for all flight legs
- `aircraft`: `{ empty_weight_kg, mtow_kg, mlw_kg, max_range_nm, max_seats, fuel_capacity_l }`
- `options` (optional):
  - `pilotWeightKg` (default: 85)
  - `freightWeightKg` (default: 0)
  - `aerodromes`: Array of `{ code, runway_length_m, mtow_kg, mlw_kg }` for aerodrome-specific limits
  - `startingFuelKg` (default: computed from fuel capacity)
  - `extraFuelKg` (default: 0)
  - `aircraftEmptyWeight` (optional, overrides aircraft.empty_weight_kg)

### 6.3 Validation Steps

The validation runs sequentially through these checks:

#### 6.3.1 Total Distance vs. Max Range

- Compute the sum of all leg distances.
- Compare against the aircraft's `max_range_nm`.
- If total distance exceeds max range, this is a **violation** (the aircraft cannot complete the route without refueling).

#### 6.3.2 Flight Time

- Estimate flight time per leg: `distance / cruiseSpeed` (cruise speed is approximately 140 kt for the BN-2 Islander).
- Sum all leg times for total flight time.
- This is informational only — no violation threshold.

#### 6.3.3 Per-Leg Fuel Burn

- For each leg, look up the fuel consumption from the fuel matrix using the pre-computed fuel data table.
- If the fuel matrix returns 0 (unknown pair), fall back to estimation: `distance * fuelBurnRate` (fuel burn rate is approximately 45 kg/h at cruise).
- Track cumulative fuel consumption across all legs.

#### 6.3.4 Per-Stop Passenger Counts

- For each stop in the route, compute:
  - **Passengers on board:** Start at 0 at PSY. At each stop, add departing passengers and remove arriving passengers.
  - **Departing passengers:** Passengers whose `origin_code` matches this stop.
  - **Arriving passengers:** Passengers whose `destination_code` matches this stop.
- Use a Set to track which passengers have been counted to avoid double-counting (a passenger should only be counted once per stop even if they appear in multiple data structures).

#### 6.3.5 Per-Stop Weight Calculation

For each stop, compute:

```
totalWeight = aircraftEmptyWeight + pilotWeight + sum(passengerWeights) + baggageWeight + freightWeight + fuelOnBoard
```

Where:
- `aircraftEmptyWeight` is the aircraft's empty weight (from the aircraft record or override)
- `pilotWeight` is the pilot weight option (default 85 kg)
- `passengerWeights` are the sum of all passengers on board at this stop
- `baggageWeight` is estimated as `passengerCount * 15` kg (standard baggage allowance)
- `freightWeight` is the freight weight option (default 0)
- `fuelOnBoard` is the remaining fuel after burning fuel for all legs up to this stop

#### 6.3.6 Effective MTOW Check

At each stop where the aircraft takes off (all stops except the last), compute the effective MTOW:

```
effectiveMtow = min(structuralMtow, aerodromeLimitMtow, runwayDeratedMtow)
```

Where:
- `structuralMtow` is the aircraft's published MTOW
- `aerodromeLimitMtow` is the aerodrome's MTOW limit (if provided in aerodrome options)
- `runwayDeratedMtow` is computed only if the runway length is less than 400 meters:
  - Apply a derating factor based on runway length (shorter runway equals lower MTOW)
  - The derating formula is: `deratedMtow = structuralMtow * (runwayLength / 400) * deratingFactor`
  - The exact derating factor is determined by operational rules

Compare `totalWeight` against `effectiveMtow`:
- If totalWeight exceeds effectiveMtow: **violation** (aircraft is overweight for takeoff)
- If totalWeight exceeds effectiveMtow * 0.8: **warning** (approaching limit)

#### 6.3.7 Effective MLW Check

At each stop where the aircraft lands (all stops except the first), compute the effective MLW:

```
effectiveMlw = min(structuralMlw, aerodromeLimitMlw, runwayDeratedMlw)
```

Where:
- `structuralMlw` is the aircraft's published MLW
- `aerodromeLimitMlw` is the aerodrome's MLW limit (if provided)
- `runwayDeratedMlw` is computed similarly to MTOW derating for runways less than 400m

Compare `totalWeight` against `effectiveMlw`:
- If totalWeight exceeds effectiveMlw: **violation**
- If totalWeight exceeds effectiveMlw * 0.8: **warning**

#### 6.3.8 Fuel Availability Check

- At each stop, check if fuel is available for uplift.
- **Only PSY has fuel available.** All other stops have no fuel.
- If the aircraft needs fuel at a non-PSY stop to continue the route, this is a **violation**.
- The validation tracks cumulative fuel and determines if a fuel stop at PSY is needed.

#### 6.3.9 Seat Count Check

- At each stop, compare the number of passengers on board against the aircraft's `max_seats`.
- If passengers exceed max_seats: **violation**.
- If passengers exceed max_seats * 0.8: **warning**.

### 6.4 Return Value

The validation returns a `FlightValidationResult` object with:
- `status`: One of `ok`, `warning`, `violation`
- `total_distance_nm`: Sum of all leg distances
- `max_range_nm`: Aircraft's maximum range
- `flight_time_minutes`: Estimated total flight time
- `per_stop`: Array of per-stop validation results, each containing:
  - `stop`: Aerodrome code
  - `leg`: The leg arriving at this stop (origin, destination, distance)
  - `passengers_on_board`: Number of passengers at this stop
  - `max_seats`: Aircraft seat capacity
  - `total_weight_kg`: Computed total weight at this stop
  - `effective_mtow_kg`: Effective MTOW at this stop
  - `effective_mlw_kg`: Effective MLW at this stop
  - `fuel_on_board_kg`: Remaining fuel at this stop
  - `fuel_burn_kg`: Fuel burned on the leg to this stop
  - `fuel_available`: Whether fuel can be obtained at this stop
  - `status`: Per-stop status (ok, warning, violation)
  - `issues`: Array of human-readable issue descriptions
- `binding_constraint`: The primary limiting factor (`mtow`, `mlw`, `fuel`, `range`, `seats`, or null)
- `suggestions`: Array of suggestions for resolving violations, each with a `type` (reduce_passengers, reduce_freight, add_fuel_stop, change_aircraft) and `description`

### 6.5 Status Determination

The overall status is determined as:
- `violation` if any per-stop check has a violation
- `warning` if any per-stop check has a warning (but no violations)
- `ok` if all checks pass

### 6.6 Binding Constraint

The `binding_constraint` field identifies the primary constraint that limits the flight:
- `mtow` — Takeoff weight is the limiting factor
- `mlw` — Landing weight is the limiting factor
- `fuel` — Fuel capacity/availability is the limiting factor
- `range` — Total distance exceeds aircraft range
- `seats` — Passenger count exceeds aircraft capacity
- `null` — No constraint is binding

---

## 7. Client-Side State Management

### 7.1 State Variables

The `ScheduleBuilder` component manages the following state:

| State Variable | Type | Purpose |
|---|---|---|
| `flights` | `FlightCardFlight[]` | The current list of flights for the schedule, initialized from loader data and updatedoptimistically on mutations |
| `unassignedBookings` | `UnassignedBookingRow[]` | Bookings not yet assigned to any flight |
| `optimisticFlightLegs` | `FlightCardFlight[]` or null | Optimistic copy of flights used during drag-and-drop to avoid visual flicker |
| `flightWarnings` | `Map<number, string[]>` | Per-flight validation warnings returned from the server after assignment |
| `pendingOpsRef` | `Map<string, PendingOp>` | Tracks in-flight operations for rollback on failure. Each entry has a `rollback` function and optional `cleanup` function. |

### 7.2 Initialization

On component mount, state is initialized from the loader data via `useEffect` hooks:

1. `flights` is set from `window.__loaderData` or the Remix `useLoaderData` return value.
2. `unassignedBookings` is set from the loader's `unassignedBookings`.
3. `optimisticFlightLegs` is initialized to null.
4. `flightWarnings` is initialized to an empty Map.

### 7.3 Date State via URL Search Params

The selected date is not stored as local React state. Instead, it is derived from the URL search params via `useSearchParams` from Remix:

- The `selectedDate` state is read from `searchParams.get("date")`.
- When the user changes the date (via the DatePicker component), `setSearchParams({ date: newDate })` is called, which triggers a full URL navigation and causes the Remix loader to re-run with the new date parameter.
- This means date changes are server-backed: every date change re-fetches all schedule data from the loader, ensuring the displayed data is always fresh.
- The default date (when no `?date=` param is present) is provided by `todayISO()` from `app/utils/dates.ts`.

### 7.4 Optimistic Update Pattern

When the user performs a drag-and-drop assignment, the following sequence occurs:

1. **Immediate UI update:** State is updated optimistically (e.g., the booking is removed from `unassignedBookings` and added to the flight's stop manifests).
2. **Fetcher submission:** A `useFetcher` submits the action to the server.
3. **Rollback registration:** A rollback function is stored in `pendingOpsRef`. If the fetcher returns an error, the rollback is executed to restore the previous state.
4. **Cleanup on success:** If the fetcher succeeds, the rollback is removed from `pendingOpsRef` and any cleanup functions run.

### 7.5 Rollback Mechanism

The `pendingOpsRef` is a `useRef` holding a `Map<string, PendingOp>`. Each `PendingOp` has:
- `rollback`: A function that reverts the optimistic state change
- `cleanup` (optional): A function that runs after successful server confirmation

When a fetcher completes:
- On success (`data.ok === true`): Remove the pending op and run cleanup.
- On failure (`data.ok === false` or network error): Execute the rollback function to restore state, then remove the pending op.

### 7.6 State Synchronization

After any successful server action, the component re-fetches the loader data to synchronize state with the server. This is done via a `useFetcher` that re-requests the route's loader data. The `useEffect` hooks that initialize state from loader data then update the local state.

However, to avoid visual flicker, the optimistic state is preserved until the new loader data arrives. The `optimisticFlightLegs` state holds the optimistic version during this transition.

---

## 8. Drag-and-Drop System

### 8.1 Overview

The scheduling page uses @dnd-kit/core and @dnd-kit/sortable to enable drag-and-drop interactions. The system supports:

- Dragging unassigned bookings onto flights (assignment)
- Dragging unassigned bookings onto a draft flight placeholder (create flight from booking)
- Dragging passengers out of flights (unassignment)
- Reordering flights within the schedule

### 8.2 DndContext Configuration

A single `DndContext` wraps the entire schedule board. It is configured with:

- **PointerSensor:** Activation constraint of 8 pixels distance (prevents accidental drags on click). Uses the `onActivation` event to set a flag.
- **KeyboardSensor:** For accessibility.
- **Collision detection:** Uses `closestCenter` algorithm to determine the closest drop target.
- **onDragStart:** Records the drag source type (booking, passenger, or flight) and source data.
- **onDragEnd:** The main handler that determines the drop action.

### 8.3 Drag Sources

#### DraggableBookingItem
- Represents an unassigned booking in the unassigned pool.
- Uses `useDraggable` from @dnd-kit/core.
- Drag data: `{ type: "booking", bookingLegId, bookingId, originCode, destinationCode, passengerName }`.
- Visual: A card showing passenger name, origin, destination, and weight.

#### DraggablePassengerRow
- Represents a passenger assigned to a flight, shown in the stop manifest.
- Uses `useDraggable` from @dnd-kit/core.
- Drag data: `{ type: "passenger", bookingLegPassengerId, flightId, originCode, destinationCode }`.
- Visual: A row showing passenger name and weight, with a drag handle icon.
- When being dragged for unassignment, shows a spinning indicator.

#### SortableDroppableFlightCard
- Represents a flight card that is both a sortable item (for reordering) and a droppable target (for receiving bookings).
- Uses `useSortable` from @dnd-kit/sortable.
- Also uses `useDroppable` from @dnd-kit/core for receiving drops.
- Drag data (when being dragged for reorder): `{ type: "flight", flightId }`.
- Accepts drops of type "booking" and "passenger".

### 8.4 Drop Targets

#### Flight Card (SortableDroppableFlightCard)
- Accepts: bookings (to assign) and passengers (to unassign -- reverse drag).
- On receiving a booking drop: triggers the assign-booking action.
- On receiving a passenger drop from another flight: triggers unassign-booking on the source flight.

#### Draft Flight Placeholder
- A special droppable area at the bottom of the flight list.
- Accepts: bookings only.
- On receiving a booking drop: triggers the create-flight-from-booking action.

#### Unassign Pool Panel
- The unassigned bookings panel also acts as a drop target for passengers.
- Uses `useDroppable` with a separate overlay element pattern to work around a @dnd-kit limitation where the droppable area is not detected when the drag overlay overlaps the source.
- Accepts: passengers only.
- On receiving a passenger drop: triggers the unassign-booking action.

### 8.5 Drag-and-Drop Flow for Booking Assignment

1. User starts dragging a `DraggableBookingItem`.
2. `onDragStart` records the source booking data.
3. User drags over a `SortableDroppableFlightCard`.
4. The flight card highlights to indicate it is a valid drop target.
5. User drops the booking on the flight card.
6. `onDragEnd` fires:
   a. Determine the active item (the booking) and the over item (the flight).
   b. Extract the booking's `bookingLegId`, `originCode`, `destinationCode`.
   c. Extract the flight's `flightId`.
   d. **Optimistic update:** Immediately update state:
      - Remove the booking from `unassignedBookings`.
      - Add the passenger to the flight's stop manifests (at the appropriate origin stop's departing list and destination stop's arriving list).
      - Add a flight leg if needed (optimistically).
      - Store a rollback function in `pendingOpsRef`.
   e. Submit the `assign-booking` intent via fetcher.
   f. On success: Clean up the pending op. Re-fetch loader data.
   g. On failure: Execute the rollback to restore the booking to `unassignedBookings` and remove it from the flight.

### 8.6 Drag-and-Drop Flow for Passenger Unassignment

1. User starts dragging a `DraggablePassengerRow`.
2. `onDragStart` records the source passenger data.
3. User drags over the `UnassignPoolPanel`.
4. The panel highlights to indicate it is a valid drop target.
5. User drops the passenger on the panel.
6. `onDragEnd` fires:
   a. Determine the active item (the passenger) and the over item (the unassign pool).
   b. Extract the passenger's `bookingLegPassengerId` and `flightId`.
   c. **Optimistic update:** Immediately update state:
      - Remove the passenger from the flight's stop manifests.
      - If the flight has no more passengers, optionally mark it as empty.
      - Store a rollback function in `pendingOpsRef`.
   d. Submit the `unassign-booking` intent via fetcher.
   e. On success: Add the booking back to `unassignedBookings`. Clean up the pending op.
   f. On failure: Execute the rollback to restore the passenger to the flight.

### 8.7 Drag-and-Drop Flow for Flight Reordering

1. User starts dragging a `SortableDroppableFlightCard`.
2. `onDragStart` records the source flight ID.
3. User drags over another flight card.
4. The sortable context reorders the flights visually.
5. User drops.
6. `onDragEnd` fires:
   a. Determine the new order of flight IDs.
   b. Submit the `reorder-flights` intent via fetcher with the new order.
   c. On success: Re-fetch loader data.
   d. On failure: Revert to the previous order (stored before the drag started).

### 8.8 Drag Overlay

A drag overlay component renders a semi-transparent copy of the dragged item that follows the cursor. This provides visual feedback during the drag. The overlay renders:
- For bookings: A card showing passenger name, origin, destination.
- For passengers: A row showing passenger name and weight.
- For flights: A compact flight card.

---

## 9. Display Components

### 9.1 ScheduleBuilder (Main Component)

The top-level component that orchestrates the entire scheduling page. It renders:

1. **Toolbar:** Contains the DatePicker component (with `label="Schedule Date"`), Manual Build / Auto-Build toggle buttons, schedule status badge, and action buttons (approve, publish, revise, cancel, reset draft). The DatePicker renders as a button showing the formatted date (e.g., "Jun 1, 2026") and opens a calendar popup on click. It uses `useSearchParams` from Remix to set `?date=YYYY-MM-DD` in the URL.
2. **Schedule Board:** A two-column layout:
   - Left column (larger): The flight list with drag-and-drop context.
   - Right column (smaller): Schedule summary statistics (total flights, total passengers, total weight, etc.).
3. **Unassign Pool Panel:** A sidebar or bottom panel showing unassigned bookings.
4. **Draft Flight Placeholder:** A droppable area at the bottom of the flight list for creating new flights from bookings.

### 9.2 FlightCard

Displays a single flight with:

1. **Header:** Flight number, aircraft assignment dropdown, status badge, action buttons (delete, etc.).
2. **Route Strip:** A visual dot-and-line representation of the flight's route (see RouteStrip below).
3. **Timing:** ETD/ETA or ATD/ATA based on flight status.
4. **Crew:** Pilot names (if assigned).
5. **Stop Activity List:** Per-stop passenger manifests (see StopActivityList below).
6. **Weight Bar:** A visual bar showing MTOW/MLW utilization.
7. **Validation Results:** If validation warnings exist, they are displayed as colored indicators.

The FlightCard also computes validation on the client side using `useMemo`. It:
1. Deduplicates passengers by ID across all stop manifests.
2. Builds `ValidationPassenger` and `ValidationLeg` arrays.
3. Calls `validateFlight()` with the flight's data.
4. Passes the validation result to child components for display.

### 9.3 RouteStrip

A visual dot-and-line route display showing the flight's stops in order.

**States:**
- **Loading:** Shows a skeleton placeholder.
- **Empty (No route data):** Shows "No route data" message.
- **Single leg:** Shows two dots (PSY and PSY) connected by a line.
- **Multi-leg:** Shows dots for each stop connected by lines, with aerodrome codes and timing.
- **Compact mode:** A smaller version used in drag overlays and summary views.

**Visual details:**
- Each stop is represented by a colored dot:
  - PSY: Blue dot (hub).
  - Intermediate stops: Gray dots.
  - Last stop: Matches the first stop (always PSY).
- Lines between dots are colored based on the leg status.
- Each stop shows the aerodrome code and, if available, the ETD/ETA.
- Duplicate stops (e.g., visiting the same aerodrome twice) are handled by showing an occurrence index and a small "x N" badge.

### 9.4 StopActivityList

Renders per-stop passenger manifests for a flight.

**Input:** Stop manifests (array of stops with arriving/departing passengers), flight legs, validation results.

**Layout:** A vertical list of stops in route order. Each stop shows:

1. **Stop header:** Aerodrome code, ETD/ETA or ATD/ATA (based on flight status).
2. **Arriving passengers section:** List of passengers whose destination is this stop. Each passenger row shows name, weight, and booking reference.
3. **Departing passengers section:** List of passengers whose origin is this stop. Each passenger row shows name, weight, and booking reference.
4. **Weight utilization:** MTOW and MLW utilization percentages with color coding:
   - Green (less than or equal to 80%): Within safe limits.
   - Amber (greater than 80% and less than 100%): Approaching limits.
   - Red (greater than or equal to 100%): Exceeding limits.

**Passenger rows** are wrapped in `DraggablePassengerRow` components, allowing them to be dragged out of the flight for unassignment.

### 9.5 UnassignPoolPanel

Displays all unassigned bookings in a scrollable list.

**Layout:**
- Header: "Unassign Pool" with a count badge showing the number of unassigned bookings.
- Description text: "Drag bookings onto a flight card to assign them."
- List of `DraggableBookingItem` components.
- Each item shows: passenger name, origin, destination, weight, and booking reference.
- When the list exceeds `visibleCount` (5) items, a "Show all N bookings" button is shown to expand the list.
- Empty state: "No unassigned bookings" message when the list is empty.

**Drop target behavior:** The panel also acts as a drop target for passenger unassignment. It uses a separate overlay element to work around a @dnd-kit limitation where the droppable area is not detected when the drag overlay overlaps the source.

### 9.6 ScheduleStatusBar

Displays the current schedule status with appropriate styling:
- `draft`: Gray/yellow badge.
- `approved`: Blue badge.
- `published`: Green badge.
- `cancelled`: Red badge.

Also shows the schedule date and provides action buttons based on the current status:
- Draft: Approve, Reset Draft.
- Approved: Publish, Cancel.
- Published: Revise.
- Cancelled: No actions (read-only).

### 9.7 Empty States

The schedule board shows different empty states:
1. **No schedule exists:** "No schedule for this date. Create one?" with a create button.
2. **Schedule exists but no flights:** "No flights scheduled. Add a flight or auto-build from unassigned bookings."
3. **No unassigned bookings:** "All bookings assigned."

---

## 10. Operational Rules and Constraints

### 10.1 Rule 1: PSY Hub Constraint

All flights must start and end at Port Stanley (PSY). The route builder enforces this by ensuring the first and last stops in any route are PSY. The validation function checks this and flags violations.

### 10.2 Rule 2: Fuel Availability

Only PSY has fuel available for uplift. All other aerodromes in the Falklands have no fuel. If a flight needs additional fuel to complete its route, it must return to PSY to refuel. The validation function checks cumulative fuel and flags a violation if the aircraft would run out of fuel before reaching a fuel source.

### 10.3 Rule 3: MTOW and MLW Limits

Aircraft have both structural and aerodrome-specific MTOW/MLW limits. The effective limit is the minimum of:
- The aircraft's structural MTOW/MLW
- The aerodrome's published MTOW/MLW limit (if available)
- A runway-derated limit for strips shorter than 400 meters

### 10.4 Rule 4: Runway Derating

For aerodromes with runway length less than 400 meters, MTOW and MLW are derated. The derating factor reduces the allowable weight proportionally to the runway length. The exact formula is determined by operational safety rules.

### 10.5 Rule 5: Aircraft Range

The total distance of all legs in a flight must not exceed the aircraft's maximum range. The validation function checks this and flags a violation if exceeded.

### 10.6 Rule 6: Seat Capacity

The number of passengers on board at any stop must not exceed the aircraft's seat capacity. The validation function checks this per stop.

### 10.7 Rule 7: Validation is Advisory

Validation warnings and violations are for display only. They never block an assignment. The operations officer can choose to ignore warnings and proceed. This is a deliberate design decision to give the officer maximum flexibility in building the schedule.

### 10.8 Rule 8: Draft-Only Mutations

Flights can only be modified (assigned, unassigned, reordered, added, deleted) when the schedule is in `draft` status. Once a schedule is `approved` or `published`, the only allowed operations are status changes (approve, publish, revise, cancel).

### 10.9 Rule 9: Flight Number Generation

Flight numbers are generated automatically in the format "FIGAS XXX" where XXX is a sequential number. The system checks for existing flight numbers to avoid duplicates.

### 10.10 Rule 10: Passenger Deduplication

When computing validation, passengers are deduplicated by their unique ID. A passenger should only be counted once per stop, even if they appear in multiple data structures (e.g., both arriving and departing lists for the same stop).

### 10.11 Rule 11: Zero-Length Leg Filtering

Flight legs where origin equals destination (e.g., PSY-PSY) are filtered out before display. These are placeholder legs used internally and should not be shown to the user.

### 10.12 Rule 12: Consecutive Duplicate Stop Collapsing

When deriving the stop sequence from legs, consecutive duplicate stops are collapsed. For example, the leg sequence PSY-MPN, MPN-MPN, MPN-PSY becomes the stop sequence PSY, MPN, PSY (the duplicate MPN is removed).

---

## 11. Error Handling and Edge Cases

### 11.1 Network Errors

If a fetcher submission fails due to a network error:
- The rollback function in `pendingOpsRef` is executed immediately.
- The UI reverts to the previous state.
- A toast notification is displayed: "Failed to save changes. Your changes have been reverted."

### 11.2 Server Validation Errors

If the server returns `ok: false` with an error message:
- The rollback function is executed.
- The error message is displayed to the user.
- Common errors include:
  - "Schedule not found" -- The schedule was deleted by another user.
  - "Flight not found" -- The flight was deleted by another user.
  - "Booking already assigned" -- The booking was assigned by another user (race condition).
  - "Schedule is not in draft status" -- Another user approved/published the schedule.

### 11.3 Race Conditions

Since multiple operations officers could potentially modify the same schedule:
- The system uses database transactions to ensure atomicity.
- If a concurrent modification causes a conflict, the transaction fails and the error is returned to the user.
- The optimistic update pattern means the UI may show stale data briefly, but it is corrected when the loader data is re-fetched.

### 11.4 Empty Flight After Unassignment

When the last passenger is unassigned from a flight:
- The flight and its legs are deleted from the database.
- The flight is removed from the client-side `flights` state.
- The booking is returned to `unassignedBookings`.

### 11.5 Route Insertion Failure

If `insertPassengerRoute` returns null (no route modification needed because a matching leg exists), the system proceeds with direct assignment. If it returns an error (e.g., invalid origin/destination), the assignment is rejected with an error message.

### 11.6 Invalid Drag Operations

- **Dragging a booking onto itself:** Ignored (no-op).
- **Dragging a passenger to the same flight:** Ignored (no-op).
- **Dragging a flight onto itself during reorder:** Ignored (no-op).
- **Dropping a booking outside any droppable area:** The drag is cancelled and the booking returns to its original position.

### 11.7 Date Handling

- All dates are in the Atlantic/Stanley timezone (UTC-3).
- The selected date is managed via URL search params (`?date=YYYY-MM-DD`), not local React state.
- The DatePicker component (from `app/components/DatePicker.tsx`) is used for date selection. It renders as a button showing the formatted date (e.g., "Jun 1, 2026") and opens a calendar popup on click. It uses `useSearchParams` from Remix to set `?date=` in the URL.
- When the user selects a new date, `setSearchParams({ date })` triggers a full re-navigation, causing the Remix loader to re-run with the new date parameter.
- The default date (when no `?date=` param is present) is provided by `todayISO()` from `app/utils/dates.ts`, which returns today in the Atlantic/Stanley timezone.
- If a date has no schedule, the page shows an empty state with an option to create one.

### 11.8 Concurrent Schedule Operations

- If a user tries to approve a schedule that is already approved, the action returns an error.
- If a user tries to revise a schedule that is not published, the action returns an error.
- If a user tries to cancel a schedule that is already cancelled, the action returns an error.

---

## 12. Data Flow Diagrams

### 12.1 Page Load Flow

```
User navigates to /operations/schedule?date=YYYY-MM-DD
  |
  v
Loader runs on server
  |
  +-- Fetch schedule by date
  +-- Fetch flights (with aircraft, pilots, legs)
  +-- Fetch passenger manifests per flight
  +-- Fetch all aircraft
  +-- Fetch all aerodromes
  +-- Fetch unassigned bookings
  |
  v
Loader transforms data into FlightCardFlight objects
  (filter zero-length legs, collapse duplicate stops,
   build stop manifests, attach aircraft performance data)
  |
  v
Loader returns JSON to client
  |
  v
ScheduleBuilder component initializes state from loader data
  |
  v
Components render: FlightCards, RouteStrips, StopActivityLists,
UnassignPoolPanel, ScheduleStatusBar
```

### 12.2 Booking Assignment Flow

```
User drags booking from UnassignPoolPanel onto FlightCard
  |
  v
onDragEnd fires
  |
  +-- Determine active (booking) and over (flight)
  +-- Extract bookingLegId, originCode, destinationCode, flightId
  |
  v
Optimistic update (immediate):
  - Remove booking from unassignedBookings
  - Add passenger to flight's stop manifests
  - Store rollback function in pendingOpsRef
  |
  v
Fetcher submits assign-booking intent to server
  |
  v
Server action handler:
  |
  +-- Phase 1: Fetch flight, legs, booking, passengers
  +-- Phase 2: Run validateFlight() (collect warnings, don't block)
  +-- Phase 3: Check if matching leg exists
  |     |
  |     +-- Yes: Direct assignment (set flight_leg_id)
  |     +-- No: Call insertPassengerRoute() for new leg sequence
  |
  +-- Phase 4/5: Database transaction
  |     - Assign passenger to leg
  |     - Update booking leg flight_id
  |     - If route changed: replaceFlightLegs(), remap passengers
  |     - Re-run validation
  |     - Update flight arrival_time
  |
  +-- Return response { ok, flight, warnings }
  |
  v
Fetcher.onComplete:
  |
  +-- Success: Clean up pendingOp, re-fetch loader data
  +-- Failure: Execute rollback, show error toast
```

### 12.3 Auto-Build Flow

```
User clicks "Auto Build" button
  |
  v
Fetcher submits auto-build intent
  |
  v
Server action handler:
  |
  +-- Fetch all unassigned booking legs with passengers
  +-- Group passengers by origin-destination pair
  +-- Run CVRP-SD algorithm:
  |     - Build demand map
  |     - Initialize route at PSY
  |     - Nearest-neighbor with split delivery
  |     - Check fuel constraints
  |     - Return to PSY when done
  |     - Repeat for unsatisfied demand
  |
  +-- For each route:
  |     - Generate flight number
  |     - Create flight record
  |     - Create flight leg records
  |     - Assign passengers to legs
  |     - Update booking leg flight_ids
  |
  +-- Return response { ok, flights }
  |
  v
Client re-fetches loader data to get updated state
```

### 12.4 Validation Data Flow

```
FlightCard component renders
  |
  v
useMemo computes validation:
  |
  +-- Deduplicate passengers by ID across all stop manifests
  +-- Build ValidationPassenger array
  +-- Build ValidationLeg array from flight legs
  +-- Call validateFlight(passengers, legs, aircraft, options)
  |
  v
validateFlight runs checks:
  |
  +-- Total distance vs max range
  +-- Per-leg fuel burn (matrix lookup with fallback)
  +-- Per-stop passenger counts (with deduplication)
  +-- Per-stop weight calculation
  +-- Effective MTOW check (structural, aerodrome, runway derated)
  +-- Effective MLW check (structural, aerodrome, runway derated)
  +-- Fuel availability check (only PSY)
  +-- Seat count check
  |
  v
Returns FlightValidationResult { status, per_stop, binding_constraint, suggestions }
  |
  v
Validation result passed to:
  - StopActivityList (per-stop weight utilization colors)
  - FlightCard header (overall status indicator)
  - WeightBar component (visual MTOW/MLW bar)
```

---

## 13. Integration Points

### 13.1 Database Repositories

The scheduling function integrates with the database through these repositories:

#### flightLegRepository
- `findById(id)` -- Fetch a single flight leg.
- `findByFlightId(flightId)` -- Fetch all legs for a flight, ordered by leg_number.
- `findByScheduleId(scheduleId)` -- Fetch all legs for all flights in a schedule.
- `create(data)` -- Create a new flight leg.
- `updateTimes(id, etd, eta)` -- Update timing fields.
- `updateOperational(id, data)` -- Update operational columns (pax_on, pax_off, fuel, weights).
- `updateStatus(id, status)` -- Update leg status.
- `replaceFlightLegs(flightId, legs, client)` -- **Critical operation:** Atomically deletes all existing legs for a flight and inserts new ones. Each new leg is created with:
  - Distance looked up from `aerodrome_distances` table
  - Heading looked up from `aerodrome_headings` table
  - Sequential leg_number
  - Status set to `scheduled`

#### bookingLegRepository
- `findById(id)` -- Fetch a single booking leg.
- `findByBookingId(bookingId)` -- Fetch all legs for a booking.
- `create(data)` -- Create a new booking leg.
- `assignFlight(id, flightId, client)` -- Set the flight_id on a booking leg (within a transaction).
- `updateStatus(id, status, client)` -- Update booking leg status.
- `findByBookingIds(ids)` -- Batch fetch booking legs by booking IDs.
- `findUnassignedLegs()` -- Find all booking legs with null flight_id.

#### bookingLegPassengerRepository
- `findById(id)` -- Fetch a single booking leg passenger record.
- `findByLegId(legId)` -- Fetch all passengers for a flight leg.
- `findByPassengerId(passengerId)` -- Fetch all legs for a passenger.
- `findByBookingId(bookingId)` -- Fetch all passengers for a booking.
- `create(params)` -- Create a new booking leg passenger record.
- `update(id, params)` -- Update passenger data (checked_in, boarded, seat, etc.).
- `delete(id)` -- Delete a booking leg passenger record (used for unassignment).
- `assignToFlightLeg(id, flightLegId, client)` -- Set the flight_leg_id on a passenger record (within a transaction).
- `findByFlightLegId(flightLegId)` -- Fetch all passengers assigned to a specific flight leg.
- `checkIn(id, userId)` -- Mark passenger as checked in.
- `board(id)` -- Mark passenger as boarded.
- `getCheckedInCount(legId)` -- Count checked-in passengers for a leg.
- `getBoardedCount(legId)` -- Count boarded passengers for a leg.

### 13.2 Fuel Data Module

The fuel data module provides two key functions:

- `getDistance(origin, destination)` -- Returns the distance in nautical miles between two aerodromes. Looks up a hardcoded distance matrix. Returns 0 if the pair is unknown.
- `getFuelKg(origin, destination)` -- Returns the fuel consumption in kilograms for a leg between two aerodromes. Looks up a hardcoded fuel matrix. Returns 0 if the pair is unknown (falling back to estimation in the validation function).

The distance and fuel matrices cover all Falklands aerodromes. The BN-2 Islander has a fuel burn rate of approximately 45 kg/h at a cruise speed of 140 kt.

### 13.3 Aircraft Assignment

The scheduling function integrates with the aircraft assignment utility to determine which aircraft is suitable for a given route. This utility considers:
- Aircraft availability (not already assigned to another flight at the same time)
- Aircraft range (must be sufficient for the route)
- Aircraft capacity (must be sufficient for the passenger count)

### 13.4 Pilot Assignment

The scheduling function integrates with the pilot assignment utility to determine which pilots are available for a given flight. This utility considers:
- Pilot availability (not already assigned to another flight at the same time)
- Pilot license type (must be qualified for the aircraft type)

### 13.5 Booking Clustering

The auto-build function integrates with the booking clustering utility to group passengers by origin-destination pairs before running the CVRP-SD algorithm. This utility:
- Groups unassigned booking legs by origin and destination
- Counts passengers per origin-destination pair
- Returns an array of demand clusters for the CVRP algorithm

### 13.6 No-Fly Rules

The scheduling function integrates with the no-fly rules service to check if any flights would violate no-fly rules (e.g., certain aerodromes cannot be flown to on certain days). This check runs during auto-build and assignment to warn the user of potential conflicts.

### 13.7 Flight Number Generation

The `generateFlightNumber` function creates unique flight numbers in the format "FIGAS XXX". It:
1. Queries the database for the highest existing flight number.
2. Increments by 1.
3. Formats with leading zeros if needed.
4. Returns the new flight number string.

---

## Appendix A: Glossary

| Term | Definition |
|---|---|
| PSY | Port Stanley Airport (the hub airport for FIGAS) |
| MTOW | Maximum Takeoff Weight |
| MLW | Maximum Landing Weight |
| CVRP-SD | Capacitated Vehicle Routing Problem with Split Deliveries |
| ETD/ETA | Estimated Time of Departure/Arrival |
| ATD/ATA | Actual Time of Departure/Arrival |
| Flight Leg | A single hop from one aerodrome to another |
| Booking Leg | A passenger's journey from origin to destination (may span multiple flight legs) |
| Stop Manifest | The list of passengers arriving at or departing from a specific stop |
| Sortie | A single flight (used interchangeably with "flight" in this context) |
| BN-2 Islander | The aircraft type operated by FIGAS |
| nm | Nautical miles |
| kt | Knots (nautical miles per hour) |

## Appendix B: State Transition Diagrams

### Schedule Status Transitions

```
draft --approve--> approved --publish--> published
  ^                                    |
  |                                    |
  +----------- revise -----------------+

draft --cancel--> cancelled
approved --cancel--> cancelled
```

### Flight Status Transitions

```
draft --approve--> approved --publish--> published
                                                   |
                                                   v
                                              active --complete--> completed
                                              active --cancel--> cancelled
draft --cancel--> cancelled
```

### Booking Leg Status Transitions

```
pending --assign--> scheduled --check-in--> checked_in --board--> boarded --complete--> completed
                                                                                             |
pending --cancel--> cancelled                                                    |
scheduled --cancel--> cancelled                                                  |
checked_in --cancel--> cancelled                                                 |
boarded --cancel--> cancelled                                                    |
                                                                                              v
                                                                                         (invoice generated)
```

---

## Appendix C: Pending Development Tasks

The following tasks remain to be implemented or fully integrated for the scheduling function:

### C.1 Auto-Build Algorithm Integration

The `auto-build` intent handler exists in the action function, but the CVRP-SD algorithm utilities (`cluster-bookings.ts`, `nearest-neighbor.ts`, `suggest-route.ts`, `assign-aircraft.ts`, `assign-pilots.ts`, `fuel-planning.ts`, `weight-balance.ts`, `flight-validation.ts`, `scheduling/index.ts`) need to be fully integrated and tested end-to-end. The auto-build flow (Section 4.3.1) describes the intended behavior, but the algorithm modules are not yet wired into the action handler.

### C.2 Flight Validation Client-Side Integration

The `validateFlight()` function exists in `app/utils/scheduling/flight-validation.ts` but needs to be wired into the `FlightCard` component's `useMemo` to display real-time validation warnings. Currently the validation logic (Section 6) is described but not yet connected to the UI.

### C.3 Drag-and-Drop Assignment Action

The `assign-booking` and `unassign-booking` intent handlers in the action function (Sections 4.3.9 and 4.3.10) need to be fully implemented with:
- Database transactions for atomicity
- Route insertion logic via `insertPassengerRoute()`
- Passenger remapping when legs are replaced
- Proper error handling and rollback

### C.4 Optimistic Update Rollback

The `pendingOpsRef` rollback mechanism (Section 7.4) needs to be fully wired for all drag-and-drop operations. Currently the optimistic update pattern is designed but the rollback functions are not yet implemented for every operation type.

### C.5 Schedule Status Flow

The `approve`, `publish`, `revise`, `cancel` intent handlers (Sections 4.3.2–4.3.5) need to be tested end-to-end with proper status transition validation. The state transition diagrams in Appendix B define the allowed transitions, but the enforcement logic needs verification.

### C.6 Flight Reordering

The `reorder-flights` intent handler (Section 4.3.6) and the sortable drag-and-drop reordering (Section 8.7) need to be fully tested, including edge cases where flights are reordered while other operations are in-flight.

### C.7 Create Flight from Booking

The `create-flight-from-booking` intent handler (Section 4.3.8) needs to be implemented with route builder integration. The handler should call `insertPassengerRoute()` to determine the optimal stop sequence for the new flight.

### C.8 Empty Flight Cleanup

When the last passenger is unassigned from a flight (Section 11.4), the flight and its legs should be deleted automatically. This cleanup logic needs to be implemented in the `unassign-booking` handler.

### C.9 Permission-Based Action Visibility

Action buttons (approve, publish, revise, cancel) should be conditionally shown based on user permissions, not hardcoded to `true`. The `ScheduleStatusBar` component (Section 9.6) should check the current user's role before rendering action buttons.

### C.10 No-Fly Rules Integration

The scheduling function should check no-fly rules (Section 13.6) during auto-build and assignment to warn of conflicts. The no-fly rules service (`app/utils/services/no-fly.service.ts`) exists but is not yet integrated into the scheduling action handlers.

### C.11 Weight Balance Snapshots

The `weight_balance_snapshots` table (created in migration `019_add_schedule_audit_and_weight_balance.sql`) should be populated during flight operations. When a flight is approved or published, a weight balance snapshot should be recorded for each leg.

### C.12 Pilot Assignment UI

The pilot assignment panel should allow assigning and unassigning pilots to flights directly from the schedule page. Currently the data model supports pilot assignments (Section 2.2) but there is no UI for managing them on the schedule board.

### C.13 Schedule Audit Trail

The `created_by` and `updated_by` columns on the schedule table should be populated with the current user on all mutations. The action handlers (Section 4) should include the authenticated user's ID when creating or updating schedules.

### C.14 Error Toast Notifications

A toast notification system should be added to display server errors and rollback confirmations. Currently errors are handled silently (Section 11.1 describes the intended behavior) but no toast component is wired into the scheduling page.

### C.15 Database Migration 019

The migration file `migrations/019_add_schedule_audit_and_weight_balance.sql` needs to be applied to the production database. This migration adds:
- `created_by` and `updated_by` columns to the `schedules` table
- The `weight_balance_snapshots` table for recording per-leg weight data at approval time
