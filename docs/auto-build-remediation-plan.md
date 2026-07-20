# Auto-Build Remediation Plan

**Goal:** Ensure auto-build flight count approximates manual scheduling output
for the same set of bookings — enforcing optimality. Auto-build should serve
all bookable passengers in the minimum number of flights.

**Date:** 2026-07-17
**Source:** Autogenerate audit report (Section 3–4 discrepancies).

---

## Problem Statement

Auto-build uses a CVRP Clarke-Wright solver to minimize flights (primary
objective) and total distance (secondary). Four issues prevent it from
achieving parity with what a skilled dispatcher would produce manually:

1. Oversized clusters are never split — passengers over capacity go unserved.
2. CVRP validation runs against the wrong aircraft — routes pass/fail on specs
   that differ from their actual assigned aircraft.
3. All flights receive identical departure times — the aircraft overlap check
   forces one-per-aircraft assignment, capping flight count at fleet size
   regardless of actual time feasibility.
4. The CVRP range constraint is hardcoded at 800 nm across the fleet — some
   aircraft may have shorter effective range, causing merge-rejection of
   otherwise-valid route combinations.

Collectively, these cause auto-build to either over-produce flights (by
rejecting valid merges) or under-produce (by leaving passengers unserved).

---

## Remediation Items

### R-01: Split oversized clusters before CVRP input

**Status:** Not implemented
**Severity:** P1 — directly causes unserved passengers and flight-count skew
**File:** `app/utils/scheduling/index.ts:136–147`

**Root cause:**
`splitOversizedCluster()` is defined in `cluster-bookings.ts:81–112` but
**never called** in `buildSchedule()`. A cluster with 10 passengers against
a fleet with max 9 seats becomes one CVRP demand of 10 pax. The solver cannot
merge it (capacity exceeded) and cannot split it. Those passengers become
`unservedDemands`.

**What a dispatcher would do:**
Book two flights (or two aircraft) for the 10 passengers — the auto-build
must do the same.

**Fix:**
```typescript
// In buildSchedule(), after clusterBookingsByDate() returns clusters,
// before converting to PassengerDemand[]:

const splitClusters: ClusterResult[] = [];
for (const cluster of clusters) {
  const subClusters = splitOversizedCluster(cluster, maxSeats, passengerCountMap);
  splitClusters.push(...subClusters);
}
// Use splitClusters instead of clusters for demand generation
```

**Expected outcome:**
Every passenger is represented in a demand ≤ aircraft capacity. CVRP can
merge or keep individual demands. No passengers silently dropped.

**Verification:**
- Unit test: `splitOversizedCluster` with 10 pax, maxSeats=9 → 2 clusters
- Integration test: Auto-build with 10+ pax on same route → ≥2 flights

---

### R-02: Validate CVRP routes against their assigned aircraft

**Status:** Not implemented
**Severity:** P1 — validation pass/fail uses wrong aircraft specs
**File:** `app/utils/scheduling/index.ts:180–213`

**Root cause:**
```typescript
// Line 180-192: Uses allAircraft[0] for ALL route validations
const bestAircraft = allAircraft.length > 0 ? allAircraft[0] : null;
const validationAircraft: ValidationAircraft = {
  type: bestAircraft?.type ?? "BN-2",
  seat_count: bestAircraft?.seat_count ?? 9,
  max_takeoff_weight_kg: bestAircraft?.max_takeoff_weight_kg ?? 2994,
  // ...
};
// Then validates ALL routes against this single aircraft
```

If the fleet has a BN-2 (9 seats, 2994 kg MTOW) and a smaller aircraft
(6 seats, 2500 kg MTOW), routes validated against the BN-2 will pass
constraints they'd fail against the smaller aircraft — or vice versa.

**What a dispatcher would do:**
Assign an aircraft, then verify the route is feasible for that specific
airframe.

**Fix:**
Move CVRP route validation to **after** Phase 3 (aircraft assignment),
validating each route against its assigned aircraft:

```typescript
// After Phase 3 (aircraft assignment), for each assignment:
for (const assignment of aircraftAssignments) {
  const validationAircraft: ValidationAircraft = {
    type: assignment.aircraft.type,
    registration: assignment.aircraft.registration,
    seat_count: assignment.aircraft.seat_count,
    max_takeoff_weight_kg: assignment.aircraft.max_takeoff_weight_kg,
    // ... map all fields from assignment.aircraft
  };
  const result = await validateFlight(passengers, legs, validationAircraft);
  if (result.status === "violation") {
    errors.push(`Flight ${assignment.route.flight.flight_number}: ${result.weight_warnings.join("; ")}`);
  }
}
```

**Alternative (simpler, more conservative):**
Use the **strictest** constraint from each aircraft dimension:
```typescript
const minSeats = Math.min(...allAircraft.map(a => a.seat_count));
const minMtow = Math.min(...allAircraft.map(a => a.max_takeoff_weight_kg));
const minMlw = Math.min(...allAircraft.map(a => a.max_landing_weight_kg));
const minRange = Math.min(...allAircraft.map(a => a.max_range_nm ?? 800));
```

This ensures a route that passes CVRP validation will be feasible for
ANY aircraft in the fleet. Slightly more conservative (may over-reject),
but guarantees correctness.

**Expected outcome:**
Routes are validated against the actual aircraft they'll fly. No
false-positive validations that later fail at Phase 3/4.

**Verification:**
- Integration test: Mixed fleet (9-seat + 6-seat), route with 7 pax →
  assigned to 9-seat → passes; route with 8 pax → 6-seat fails

---

### R-03: Apply departure-time sequencing to auto-built flights

**Status:** Not implemented
**Severity:** P1 — all flights share same time, aircraft overlap blocks
multi-flight assignments to the same airframe
**File:** `app/utils/scheduling/index.ts:237`

**Root cause:**
```typescript
// Line 237: Every flight gets the same departure/arrival
departure_time: `${date}T10:00:00Z`,
arrival_time: `${date}T12:00:00Z`,
```

`assignAircraft()` checks time overlap with existing assignments. Since
all flights share the same time window, a single aircraft can only serve
ONE auto-built flight — even if real-world sequencing would allow it to
fly two sorties in a day.

**What a dispatcher would do:**
Sequence flights through the day, reusing aircraft. The `handleReorderFlights`
handler already does this correctly:

```typescript
// schedule-handlers.server.ts:491-496
const baseTime = new Date();
baseTime.setHours(6, 0, 0, 0);
for (let i = 0; i < flightIds.length; i++) {
  const departureTime = new Date(baseTime.getTime() + i * 15 * 60 * 1000);
  // ...
}
```

**Fix:**
Apply the same 15-minute spacing during auto-build flight creation.
Determine each flight's duration from its leg distances and compute
realistic departure/arrival times:

```typescript
// After all flights are created, sequence them:
const baseTime = new Date(`${date}T06:00:00Z`);
let currentOffset = 0;

for (const cvrpRoute of feasibleRoutes) {
  const flightDurationMinutes = computeFlightDuration(legDistances);
  const departureTime = new Date(baseTime.getTime() + currentOffset * 60 * 1000);
  const arrivalTime = new Date(departureTime.getTime() + flightDurationMinutes * 60 * 1000);

  // Use these times in the flight INSERT
  currentOffset += flightDurationMinutes + 30; // 30 min turnaround
}
```

**Expected outcome:**
A single aircraft can serve multiple flights per day. Flight count is no
longer artificially capped at fleet size. Aircraft utilization matches
what a dispatcher would schedule.

**Verification:**
- Unit test: 3 flights with 1 aircraft → all 3 get non-overlapping times
- Integration test: Auto-build with 5 flights, 2 aircraft → each aircraft
  serves multiple flights, no overlap errors

---

### R-04: Use fleet-minimum range for CVRP constraint

**Status:** Not implemented
**Severity:** P2 — overestimates merge feasibility
**File:** `app/utils/scheduling/index.ts:168–169`

**Root cause:**
```typescript
const maxRange = allAircraft.reduce((max) => Math.max(max, 800), 800);
```

This is always 800 because the reduce accumulator starts at 800 and only
increases. If the aircraft table has no `max_range_nm` column, this
hardcoded value may exceed actual aircraft capability. CVRP merges routes
that fit within 800 nm, but the assigned aircraft may only have 500 nm
effective range (with reserves).

**Fix:**
After R-02 (per-aircraft validation), this becomes less critical since
routes are validated against their assigned aircraft. However, for
pre-merge optimization quality, use the fleet minimum:

```typescript
// Use the minimum usable range across the fleet
const fleetRanges = allAircraft
  .map(a => a.max_range_nm ?? 800)
  .filter(r => r > 0);
const maxRange = fleetRanges.length > 0
  ? Math.min(...fleetRanges)
  : 800;
```

This prevents the CVRP from creating merged routes that will later fail
validation, reducing wasted computation and improving solver quality.

**Expected outcome:**
CVRP merge decisions respect the actual fleet capability. No routes
created that immediately fail validation.

**Verification:**
- The CVRP solver already has a `maxRangeNm` check in `mergeRoutes()`.
  Verify it rejects merges exceeding the fleet minimum.

---

### R-05: Consolidate CVRP-to-flights conversion

**Status:** Not implemented
**Severity:** P2 — code duplication risk
**Files:** `config-generator.ts:103–241` and `index.ts:135–324`

**Root cause:**
`strategyCvrp()` (preview-build) and `buildSchedule()` (actual auto-build)
contain independent implementations of the CVRP→flight conversion logic.
Fixes applied to one path may be missed in the other, causing preview-build
to show different results than actual auto-build.

**Fix:**
Extract shared logic into `app/utils/scheduling/cvrp-to-flights.ts`:

```typescript
export interface CvrpToFlightsInput {
  routes: CvrpRoute[];
  clusters: ClusterResult[];
  date: string;
  scheduleId: number;
  allAircraft: AircraftRow[];
}

export async function cvrpToFlights(
  input: CvrpToFlightsInput,
  tx: Transaction
): Promise<{ flights: FlightRow[]; routes: RouteResult[]; errors: string[]; warnings: string[] }>
```

Both `buildSchedule()` and `strategyCvrp()` call this shared function.

**Expected outcome:**
Single source of truth for CVRP→flight conversion. Preview-build and
auto-build produce consistent output.

---

## Implementation Order

```
R-01 (Split clusters)    ← Unblocks correct flight count
    ↓
R-03 (Time sequencing)   ← Unblocks aircraft reuse
    ↓
R-02 (Per-aircraft validation) ← Ensures correctness of assigned routes
    ↓
R-04 (Fleet-minimum range)     ← Refines merge quality
    ↓
R-05 (Consolidation)           ← Code quality
```

R-01 and R-03 are the two items that most directly affect flight count
parity between manual and auto-build. R-02 ensures correctness of the
routes that are produced. R-04 and R-05 are refinement and maintainability.

---

## Acceptance Criteria

After all fixes:
1. **Same-day test:** Seed 30 passengers with varied origins/destinations
   for a single date. Run auto-build. Count flights → run a manual build
   independently. Auto-build flight count ≤ manual flight count.
2. **All passengers served:** Zero `unservedDemands` when total passengers
   ≤ fleet daily capacity (all aircraft × max sorties/day).
3. **Over-capacity test:** Seed passengers exceeding fleet daily capacity.
   Auto-build produces max feasible flights. Unserved count matches
   (total passengers − max servable). Warnings list unserved routes.
4. **Multi-aircraft reuse:** Single-aircraft fleet with 3 short routes →
   all 3 assigned to same aircraft with non-overlapping times.
5. **Preview parity:** Preview-build config matches auto-build output for
   the same input data.
