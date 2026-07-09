# Scheduling & Loadsheet Audit — Implementation Plan

**Date:** 2026-06-20  
**Source:** Comprehensive audit of Clarke-Wright solver, flight validation, loadsheet calculations, seat assignment, and aircraft assignment.  
**Total Issues:** 13 (6 high, 7 medium)

---

## Issue Matrix

| # | Severity | File | Lines | Description |
|---|----------|------|-------|-------------|
| H1 | **High** | `flight-validation.ts` | 407–411 vs 511–516 | Deplaning order reversed — passengers subtracted one leg too late, inflating TOW and `maxCumulativePassengerCount` on all intermediate legs |
| H2 | **High** | `loadsheet-calculations.server.ts` | 144–146, 150 | `paxWeight` + `baggageTotal` computed once, reused constant for all sectors — W&B incorrect for multi-leg flights |
| H3 | **High** | `seat-assignment.ts` | 100, 111 | Baggage weight double-counted in CG: included in seat arm moment AND aft hold arm moment |
| H4 | **High** | `loadsheet-calculations.server.ts` | 151, 188 | MLW never validated — `landingWeightKg` computed per sector but never compared against `max_landing_weight_kg` |
| H5 | **High** | `cvrp-solver.ts` | 164, 184 | Seat capacity uses `routeI.passengerCount + routeJ.passengerCount` (route-total), not per-leg max-on-board |
| H6 | **High** | `cvrp-solver.ts` | 129–133 | Savings formula purely distance-based — zero weight/fuel accounting; over-capacity merges possible |
| M1 | **Medium** | `assign-aircraft.ts` | 38 | `passengerCount` parameter is route-total, not per-leg max — may reject feasible aircraft |
| M2 | **Medium** | `create-loadsheet.server.ts` | 29, 42 | `DISTINCT ON (bp.id)` without tiebreaker — non-deterministic passenger row for multi-leg bookings |
| M3 | **Medium** | `create-loadsheet.server.ts` | 67–68 | Route matching is set-based (`flightCodes.has`), not order-based — wrong-direction passengers pass filter |
| M4 | **Medium** | `suggest-route.server.ts` | 188 | `passengers.length` used for aircraft seat check — total unique, not per-leg max |
| M5 | **Medium** | `cvrp-solver.ts` | 122–125 | Only one merge direction evaluated (i.end → j.start), missing j.end → i.start |
| M6 | **Medium** | `cvrp-solver.ts` | 217–231 | `mergeStops` only deduplicates consecutive same-stops — non-consecutive duplicates possible |
| M7 | **Medium** | `cvrp-types.ts` | 49–54 | `CvrpConfig` has no weight/fuel/payload fields — solver cannot optimize for weight constraints |

---

## Fix H1: Deplaning Order Bug in `flight-validation.ts`

### Current State
```
for each leg:
  1. [ln 397-405] Filter boarding/deplaning passengers for this stop
  2. [ln 407-415] BOARD passengers → increment cumulativePassenger{Count,Weight}
  3. [ln 417-506] Compute takeoff weight, MTOW/MLW checks, record perStop[i]
  4. [ln 508-509] Subtract fuel burnt
  5. [ln 511-516] DEPLANE passengers → decrement cumulativePassenger{Count,Weight}
```

**Bug:** A passenger boarding at Stop N and deplaning at Stop N+1 is included in the takeoff weight for leg N→N+1 (correct), but also included for leg N+1→N+2 (incorrect — they should have been removed before leg N+1's takeoff calculation).

### Corrected Order
```
for each leg:
  1. [ln 397-405] Filter boarding/deplaning passengers for this stop
  2. [ln 511-516] DEPLANE passengers → decrement cumulativePassenger{Count,Weight}     ← MOVED HERE
  3. [ln 407-415] BOARD passengers → increment cumulativePassenger{Count,Weight}
  4. [ln 417-506] Compute takeoff weight, MTOW/MLW checks, record perStop[i]
  5. [ln 508-509] Subtract fuel burnt
  (deplane block removed from here)
```

### Specific Edits

**Edit 1:** Move deplaning block from lines 511–516 to after line 405 (before boarding block).

**Before:**
```typescript
        // Passengers deplaning at this stop (destination is this stop)
        const deplaningPassengers = passengers.filter(
            (p) => p.destination_code.toUpperCase() === stopCode
        );

        // Add boarding passengers to cumulative count
        for (const p of boardingPassengers) {
            cumulativePassengerCount++;
            cumulativePassengerWeight +=
                p.clothed_weight_kg + p.baggage_weight_kg;
        }
```

**After:**
```typescript
        // Passengers deplaning at this stop (destination is this stop)
        const deplaningPassengers = passengers.filter(
            (p) => p.destination_code.toUpperCase() === stopCode
        );

        // Remove deplaning passengers BEFORE boarding for this stop
        for (const p of deplaningPassengers) {
            cumulativePassengerCount--;
            cumulativePassengerWeight -=
                p.clothed_weight_kg + p.baggage_weight_kg;
        }

        // Add boarding passengers to cumulative count
        for (const p of boardingPassengers) {
            cumulativePassengerCount++;
            cumulativePassengerWeight +=
                p.clothed_weight_kg + p.baggage_weight_kg;
        }
```

**Edit 2:** Delete the deplaning block at lines 511–516 (now redundant).

### Impact
- Corrects TOW/MLW per leg for all multi-leg flights
- Corrects `maxCumulativePassengerCount` (used by seat check)
- No data-type changes; pure code reordering

---

## Fix H2: Per-Sector Pax/Baggage Weight in `loadsheet-calculations.server.ts`

### Current State
`PassengerWeightData` interface (lines 15-21) has no `origin_code`/`destination_code` fields.

```typescript
interface PassengerWeightData {
  id: number;
  bookingLegId: number;
  clothedWeightKg: number;
  baggageWeightKg: number;
  freightWeightKg: number;
}
```

Lines 144–146 compute totals once and reuse for all sectors:
```typescript
const paxWeight = passengers.reduce((s, p) => s + p.clothedWeightKg, 0);
const baggageTotal = passengers.reduce((s, p) => s + p.baggageWeightKg + p.freightWeightKg, 0);
```

### Required Changes

**Step 1:** Add `origin_code` and `destination_code` to `PassengerWeightData`:
```typescript
interface PassengerWeightData {
  id: number;
  bookingLegId: number;
  origin_code: string;
  destination_code: string;
  clothedWeightKg: number;
  baggageWeightKg: number;
  freightWeightKg: number;
}
```

**Step 2:** Update caller in `create-loadsheet.server.ts` (lines 71–77) to include origin/destination:
```typescript
const passengers = routeMatchedRows.map((r) => ({
    id: Number(r.id),
    bookingLegId: Number(r.booking_leg_id),
    origin_code: r.origin_code,
    destination_code: r.destination_code,
    clothedWeightKg: Number(r.clothed_weight_kg) || 70,
    baggageWeightKg: Number(r.baggage_weight_kg) || 0,
    freightWeightKg: Number(r.freight_weight_kg) || 0,
}));
```

**Step 3:** Replace constant totals in `loadsheet-calculations.server.ts` (lines 144–146) with per-sector computation inside the loop:

**Remove:**
```typescript
const paxWeight = passengers.reduce((s, p) => s + p.clothedWeightKg, 0);
const baggageTotal = passengers.reduce((s, p) => s + p.baggageWeightKg + p.freightWeightKg, 0);
```

**Add** tracking variables before the sector loop (after `let fuelOnBoard = startingFuelKg`):
```typescript
// Track passengers on board per sector
const onBoardPassengerIds = new Set<number>();
let sectorPaxWeight = 0;
let sectorBaggageTotal = 0;
```

**Add** inside the sector loop, before the TOW computation (before line 149):
```typescript
// Board passengers whose origin matches this sector's origin
for (const p of passengers) {
    if (p.origin_code === lc.originCode && !onBoardPassengerIds.has(p.id)) {
        onBoardPassengerIds.add(p.id);
        sectorPaxWeight += p.clothedWeightKg;
        sectorBaggageTotal += p.baggageWeightKg + p.freightWeightKg;
    }
}

// Deplane passengers whose destination matches this sector's destination
for (const p of passengers) {
    if (p.destination_code === lc.destinationCode && onBoardPassengerIds.has(p.id)) {
        onBoardPassengerIds.delete(p.id);
        sectorPaxWeight -= p.clothedWeightKg;
        sectorBaggageTotal -= p.baggageWeightKg + p.freightWeightKg;
    }
}
```

**Step 4:** Update TOW formula (line 150) to use per-sector values:
```typescript
const tow = emptyWt + pilotWeightKg + sectorPaxWeight + sectorBaggageTotal + fuelOnBoard;
```

Note: Deplaning should happen AFTER the current sector's weight computation (passengers deplane at destination, so they're on board for the full sector flight). Boarding happens at the origin, so they should be counted for the sector departing from that origin.

**Correct order per sector:**
1. Board passengers at origin → add to on-board set and weight totals
2. Compute TOW/LW for this sector (passengers on board for entire leg)
3. After computations, deplane passengers at destination → remove from set and weight totals
4. Cascade fuel for next sector

Wait — re-examining: deplaning at destination B means passengers are on board for leg A→B but not for B→C. So deplaning should happen AFTER the current leg's weight computations but BEFORE the next leg begins. However, the current loop structure processes one sector per iteration, so deplaning for the CURRENT sector's destination should happen at the END of the iteration, before moving to the next.

Correction — the board/deplane logic should be:
- Board at origin: at the START of the sector iteration (these passengers fly this sector)
- Deplane at destination: at the END of the sector iteration (these passengers do NOT fly the next sector)

### Impact
- Correct sector-by-sector TOW on multi-leg flights
- Upstream callers must provide `origin_code`/`destination_code` per passenger
- File touched: `loadsheet-calculations.server.ts`, `create-loadsheet.server.ts`

---

## Fix H3: Baggage Double-Count in `seat-assignment.ts`

### Current State
Line 100: Passenger seat moment includes baggage.
```typescript
const w = a.clothedWeightKg + a.baggageWeightKg;  // baggage counted HERE
// ... w * seatArm added to totalMoment
totalWeight += w;
```

Line 111: Baggage added AGAIN at aft hold arm.
```typescript
totalMoment += baggageTotalKg * AFT_HOLD_ARM_MM;  // baggage counted HERE again
totalWeight += baggageTotalKg;
```

Where `baggageTotalKg` = sum of all passengers' `baggageWeightKg + freightWeightKg` (from `loadsheet-calculations.server.ts:146`).

### Fix

**Option A (Recommended):** Remove `baggageWeightKg` from seat arm calculation, keep only `clothedWeightKg` at seat position. Baggage entirely at aft hold.

Line 100 change:
```typescript
const w = a.clothedWeightKg;  // baggage moved to aft hold only
```

And rename `baggageTotalKg` parameter in `computeCG` to `aftHoldWeightKg` for clarity. In `loadsheet-calculations.server.ts:163-165`, compute `aftHoldWeightKg` = `baggageTotal + freightTotal` (baggage still consolidated from all on-board passengers per sector).

**Line 163-165 change:**
```typescript
const aftHoldWeightKg = sectorBaggageTotal; // baggage + freight
const { cogMm, status: cogStatusRaw } = computeCG(
    seatAssignments, aftHoldWeightKg, fuelOnBoard, emptyWt, pilotWeightKg
);
```

**Option B (Alternative):** Exclude baggage from `baggageTotalKg` in caller, keeping only freight in aft hold. But this doesn't match FIGAS operations (passenger bags go in aft hold, not at seat).

**Recommendation: Option A.** Matches real FIGAS BN-2 loading: passengers sit in cabin seats, bags in aft hold compartment. CG should reflect this physical separation.

### Impact
- CG shifts forward (correctly — baggage mass moves from seat position to aft hold)
- May change CG status from "ok" to "warning" on some loads — this is correct behavior
- File touched: `seat-assignment.ts` (line 100), `loadsheet-calculations.server.ts` (lines 163-165)

---

## Fix H4: MLW Validation Missing in `loadsheet-calculations.server.ts`

### Current State
`SectorCalcResult` has `towStatus` and `towReason` (lines 51–52) but no `mlwStatus` or `mlwReason`. MLW is computed as `landingWeightKg` (line 50) but never validated.

### Fix

**Step 1:** Add MLW fields to `SectorCalcResult` (lines 51–55):
```typescript
export interface SectorCalcResult {
  // ... existing fields ...
  towStatus: "ok" | "warning" | "violation";
  towReason: string | null;
  mlwStatus: "ok" | "warning" | "violation";    // NEW
  mlwReason: string | null;                      // NEW
  cogMm: number;
  cogStatus: "ok" | "warning" | "violation";
  cogReason: string | null;
}
```

**Step 2:** Add MLW validation inside sector loop, after TOW validation (after line 161):
```typescript
let mlwStatus: "ok" | "warning" | "violation" = "ok";
let mlwReason: string | null = null;
const mlw = aircraft.max_landing_weight_kg;
if (mlw > 0 && lw > mlw) {
    mlwStatus = "violation";
    mlwReason = `MLW ${mlw}kg exceeded by ${Math.round(lw - mlw)}kg`;
} else if (mlw > 0 && lw > mlw * 0.95) {
    mlwStatus = "warning";
    mlwReason = `Within 5% of MLW (${mlw}kg)`;
}
```

**Step 3:** Include `mlwStatus` and `mlwReason` in the sector result pushed to `sectors[]`.

### Impact
- Catches MLW violations that are currently silently ignored
- MLW is not derated (unlike `flight-validation.ts` which applies aerodrome-specific MLW limits) — adding aerodrome-specific MLW is a future enhancement
- File touched: `loadsheet-calculations.server.ts`

---

## Fix H5: Per-Leg Seat Capacity in CVRP Solver (`cvrp-solver.ts`)

### Current State
Line 163–164: Capacity uses route-total passenger count.
```typescript
if (routeI.passengerCount + routeJ.passengerCount > config.maxSeats) continue;
```

### Fix

**Step 1:** Implement `computeMaxOnBoard(route: CvrpRoute): number` function:
```typescript
function computeMaxOnBoard(route: CvrpRoute): number {
    const stopCount = route.stops.length;
    const perStop = new Array(stopCount).fill(0);
    for (const assignment of route.assignments) {
        for (let s = assignment.boardAtStopIndex; s < assignment.alightAtStopIndex; s++) {
            perStop[s] += assignment.passengerCount; // NOTE: assignment.passengerCount is per-demand
        }
    }
    return Math.max(...perStop);
}
```

Wait — `DemandAssignment` has `demandIndex` and `passengerCount`? Let me check the types.

`cvrp-types.ts:18-25`:
```typescript
export interface DemandAssignment {
    demandIndex: number;         // index into demands[]
    boardAtStopIndex: number;    // stop index where pax board
    alightAtStopIndex: number;   // stop index where pax alight
}
```

`DemandAssignment` does NOT have its own `passengerCount` — the count is on the `PassengerDemand`. So we need to look up the demand's passengerCount.

**Corrected implementation:**
```typescript
function computeMaxOnBoard(route: CvrpRoute, demands: PassengerDemand[]): number {
    const stopCount = route.stops.length;
    const perStop = new Array(stopCount - 1).fill(0); // n stops → n-1 legs
    for (const assignment of route.assignments) {
        const demand = demands[assignment.demandIndex];
        // Add demand's passengerCount to each leg between board and alight
        for (let s = assignment.boardAtStopIndex; s < assignment.alightAtStopIndex; s++) {
            perStop[s] += demand.passengerCount;
        }
    }
    return Math.max(...perStop, 0);
}
```

**Step 2:** Replace capacity check at line 164:
```typescript
// Before merge: compute per-leg max for potential merged route
const mergedAssignments = mergeAssignments(
    routeI.assignments,
    routeJ.assignments,
    routeI.stops.length - 1
);
const maxOnBoard = computeMaxOnBoard({ ...routeI, assignments: mergedAssignments }, config.demands);
if (maxOnBoard > config.maxSeats) continue;
```

Note: This moves the capacity check AFTER `mergeAssignments` is computed, since we need the actual assignment stop indices to compute per-leg occupancy. This is slightly more expensive but necessary for correctness.

### Impact
- Prevents false rejections of valid multi-leg merges
- Prevents false acceptances of merges that exceed per-leg capacity
- Requires `config.demands` to be available (add to `CvrpConfig`)
- File touched: `cvrp-solver.ts`

---

## Fix H6: Weight/Fuel Awareness in CVRP Savings Formula

### Current State
Savings formula (lines 129–133) is purely nautical-mile-based.

### Fix

This is a **design-level** change. The savings formula should incorporate aircraft weight constraints. Two approaches:

**Approach A (Lightweight):** Add a penalty for high-takeoff-weight legs.
```typescript
// Estimate combined weight impact
const paxOnMergedLeg = estimatePaxOnConnectingLeg(routeI, routeJ, config.demands);
const weightPenalty = paxOnMergedLeg * AVG_PAX_WEIGHT_KG; // ~86 kg clothed + baggage
const savings = dDepotLast + dDepotFirst - dBetween - weightPenalty * WEIGHT_TO_DISTANCE_FACTOR;
```

**Approach B (Full):** Integrate `flight-validation.ts` per-leg computation into the solver, calling `validateFlight` for each candidate merge. This is expensive (async DB calls per merge) but thorough.

**Recommendation:** Defer to a separate optimization pass. The current solver only uses distance; adding weight awareness requires significant refactoring. The post-hoc `cvrp-validator.ts` already catches weight-infeasible routes. For now, document the gap.

### Impact
- Deferred — documented gap
- No file changes for now

---

## Fix M1: Per-Leg Seat Check in `assign-aircraft.ts`

### Current State
```typescript
export async function assignAircraft(
    route: RouteResult,
    passengerCount: number    // ← route-total
): Promise<AircraftAssignmentResult> {
    // ...
    if (aircraft.seat_count < passengerCount) continue;
```

### Fix

**Step 1:** Change function signature to accept per-leg max:
```typescript
export async function assignAircraft(
    route: RouteResult,
    passengerCount: number,
    maxOnBoardCount?: number   // NEW: per-leg maximum, defaults to passengerCount
): Promise<AircraftAssignmentResult> {
    const effectivePaxCount = maxOnBoardCount ?? passengerCount;
    // ...
    if (aircraft.seat_count < effectivePaxCount) continue;
```

All uses of `passengerCount` in this function (lines 38, 49, 104, 105, 126) switch to `effectivePaxCount`.

**Step 2:** Update callers:

| Caller | File:Line | Change |
|--------|-----------|--------|
| Scheduling pipeline | `index.ts:214` | Pass `computeMaxOnBoard(cvrpRoute, demands)` as third arg |
| Config generator | `config-generator.ts:195` | Compute per-leg max from route stop assignments |

### Impact
- Correct aircraft selection for multi-leg flights
- Backward compatible (new param optional, defaults to total)
- File touched: `assign-aircraft.ts`, callers in `index.ts`, `config-generator.ts`

---

## Fix M2: Deterministic Passenger Selection in `create-loadsheet.server.ts`

### Current State
Lines 29, 42: `DISTINCT ON (bp.id) ORDER BY bp.id` — when a passenger has multiple `booking_leg_passengers` rows (multi-leg booking), the selected row is non-deterministic (no tiebreaker in ORDER BY).

### Fix

Add deterministic tiebreaker:
```sql
SELECT DISTINCT ON (bp.id)
    bp.id,
    blp.booking_leg_id,
    bl.origin_code,
    bl.destination_code,
    COALESCE(blp.clothed_weight_kg, 70)::numeric AS clothed_weight_kg,
    COALESCE(blp.baggage_weight_kg, 0)::numeric AS baggage_weight_kg,
    COALESCE(blp.freight_weight_kg, 0)::numeric AS freight_weight_kg
FROM booking_leg_passengers blp
JOIN flight_legs fl ON fl.id = blp.flight_leg_id
JOIN booking_legs bl ON bl.id = blp.booking_leg_id
JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
WHERE fl.flight_id = $1
ORDER BY bp.id, blp.id ASC   -- ADDED: stable tiebreaker
```

### Impact
- Deterministic passenger row selection
- Restores deterministic query behavior for repeatable results
- File touched: `create-loadsheet.server.ts` (line 42)

---

## Fix M3: Route-Order Matching in `create-loadsheet.server.ts`

### Current State
Lines 67–68: Set-membership check accepts wrong-direction passengers.
```typescript
}).filter((r) =>
    flightCodes.has(r.origin_code) && flightCodes.has(r.destination_code)
);
```

### Fix

Build a stop-sequence map and validate boarding stop appears before alighting stop:
```typescript
// Build stop order map from flight legs
const stopOrderMap = new Map<string, number>();
let order = 0;
for (const l of legs) {
    if (l.origin_code && !stopOrderMap.has(l.origin_code)) {
        stopOrderMap.set(l.origin_code, order++);
    }
    if (l.destination_code && !stopOrderMap.has(l.destination_code)) {
        stopOrderMap.set(l.destination_code, order++);
    }
}

// Filter: origin must appear before destination in stop sequence
const routeMatchedRows = (passengerRows as Array<...>).filter((r) => {
    const originIdx = stopOrderMap.get(r.origin_code);
    const destIdx = stopOrderMap.get(r.destination_code);
    return originIdx != null && destIdx != null && originIdx < destIdx;
});
```

### Impact
- Filters out wrong-direction passengers
- Removes dead code `flightCodes.add(flight.flight_number)` (line 49)
- File touched: `create-loadsheet.server.ts`

---

## Fix M4: Per-Leg Seat Check in `suggest-route.server.ts`

### Current State
Line 188: `const passengerCount = passengers.length;`

### Fix

The suggest-route endpoint receives passengers as JSON. For multi-leg routes, passengers may have different origin/destination pairs. Compute max per-leg:

```typescript
// Build stop order from route stops
const stopOrderMap = new Map<string, number>();
routeStops.forEach((code, idx) => stopOrderMap.set(code, idx));

// Compute per-leg passenger counts
const legCounts = new Array(routeStops.length - 1).fill(0);
for (const p of passengers) {
    const boardIdx = stopOrderMap.get(p.origin_code);
    const alightIdx = stopOrderMap.get(p.destination_code);
    if (boardIdx != null && alightIdx != null && boardIdx < alightIdx) {
        for (let i = boardIdx; i < alightIdx; i++) {
            legCounts[i]++;
        }
    }
}
const maxOnBoard = Math.max(...legCounts, 0);
```

Then use `maxOnBoard` for aircraft seat check instead of `passengers.length`.

### Impact
- More accurate aircraft recommendations
- File touched: `suggest-route.server.ts`

---

## Fixes M5–M7: CVRP Solver Improvements (Lower Priority)

### M5: Bidirectional Merge Evaluation
**File:** `cvrp-solver.ts:122-125`

Add reverse-direction pair evaluation:
```typescript
// Also try connecting routeJ.end → routeI.start
const firstI = routeI.stops[1];
const lastJ = routeJ.stops[routeJ.stops.length - 2];
if (firstI && lastJ) {
    const dDepotLastJ = dist(config.distanceMatrix, lastJ, DEPOT);
    const dDepotFirstI = dist(config.distanceMatrix, DEPOT, firstI);
    const dBetweenRev = dist(config.distanceMatrix, lastJ, firstI);
    const savingsRev = dDepotLastJ + dDepotFirstI - dBetweenRev;
    pairs.push({ i: pairJ, j: pairI, savings: savingsRev });
}
```

### M6: Full Stop Deduplication in Merge
**File:** `cvrp-solver.ts:217-231`

Replace `mergeStops` with full dedup that removes any duplicate stop regardless of position:
```typescript
function mergeStops(stopsI: string[], stopsJ: string[]): string[] {
    const result = [...stopsI];
    for (const stop of stopsJ) {
        if (result[result.length - 1] !== stop) {
            result.push(stop);
        }
    }
    // Remove non-consecutive duplicates (keep first occurrence)
    const seen = new Set<string>();
    return result.filter(s => {
        if (seen.has(s) && s !== result[0]) return false;
        seen.add(s);
        return true;
    });
}
```

### M7: Add Weight Fields to CvrpConfig
**File:** `cvrp-types.ts:49-54`

```typescript
export interface CvrpConfig {
    maxSeats: number;
    maxRangeNm: number;
    maxTakeoffWeightKg: number;     // NEW
    avgPassengerWeightKg: number;    // NEW (~86 kg clothed + baggage)
    fuelBurnRateKgPerNm: number;     // NEW (~0.17 for BN-2)
    emptyWeightKg: number;           // NEW
    distanceMatrix: Map<string, number>;
    depotCode?: string;
}
```

These enable weight-aware merge decisions in the solver. Full implementation deferred.

---

## Implementation Order

| Priority | Issue | File | Risk | Effort |
|----------|-------|------|------|--------|
| 1 | H1: Deplaning order | `flight-validation.ts` | Low | Small |
| 2 | H2: Per-sector pax weight | `loadsheet-calculations.server.ts` + `create-loadsheet.server.ts` | Medium | Medium |
| 3 | H3: Baggage double-count | `seat-assignment.ts` + `loadsheet-calculations.server.ts` | Medium | Small |
| 4 | H4: MLW validation | `loadsheet-calculations.server.ts` | Low | Small |
| 5 | H5: Per-leg seat capacity (CVRP) | `cvrp-solver.ts` + `cvrp-types.ts` | Medium | Medium |
| 6 | M2: Deterministic query | `create-loadsheet.server.ts` | Low | Small |
| 7 | M3: Route-order matching | `create-loadsheet.server.ts` | Low | Small |
| 8 | M1: Per-leg seat (assign) | `assign-aircraft.ts` + callers | Medium | Medium |
| 9 | M4: Per-leg seat (suggest) | `suggest-route.server.ts` | Low | Medium |
| 10 | H6: CVRP weight awareness | `cvrp-solver.ts` | High | Large (deferred) |
| 11 | M5-M7: CVRP improvements | `cvrp-solver.ts`, `cvrp-types.ts` | Low | Small |

---

## Regression Prevention

After each fix:
1. Run `npm run lint` and `npm run typecheck`
2. Run `npm run test:related` (or equivalent for affected modules)
3. Verify no new TypeScript errors in edited files
4. Verify existing test expectations (seat capacity, W&B calculations) are still met
