# Scheduling Module — Technical Audit & Refactoring Plan (v3.0)

**Date:** 2026-06-07 (re-audit after Phase 1); updated 2026-06-19 (Phase 2 — CVRP + weight/ordinals)
**Status:** Active — Phase 2 complete, Phase 3 (handler adoption, manifest query dedup) in backlog
**Scope:** `app/utils/scheduling/`, `app/utils/loadsheet/`, `app/components/schedule/`, `app/components/loadsheet/`, `app/routes/*schedule*`, `app/routes/*loadsheet*`, `app/utils/schedule-handlers.server.ts`

---

## 0. Changes Since v2.0 (Phase 2 — CVRP Implementation + Weight/Ordinals)

### Completed ✅ (2026-06-19)

| Item | Status | Impact |
|------|--------|--------|
| CVRP Clarke-Wright solver replaces Nearest-Neighbor | ✅ Done | `config-generator.ts` strategies reduced from 3 to 1; `nearest-neighbor.ts` preserved for manual route suggestion |
| `buildSchedule` Phase 2 uses CVRP | ✅ Done | Flight creation now produces minimum routes via `solveCvrp()` |
| Dead strategies removed | ✅ Done | `strategyNearestNeighbor`, `strategySingleRoute`, `strategyOriginGrouped` deleted (~330 lines) |
| Dead helpers removed | ✅ Done | `createFlightForCluster`, `createFlightLegs`, `routeToLegs`, `getMaxSeats`, `getPassengerCountMap`, `resolveAerodromeIds`, `getStopCodes` deleted (~120 lines) |
| Flight number generation extracted | ✅ Done | `app/utils/flight-number.server.ts` — shared by manual and auto-build paths |
| Per-aircraft flight ordinals | ✅ Done | `PARTITION BY f.aircraft_id` in loader SQL; `"FCZ #1"` badge format |
| Flight duration display | ✅ Done | `duration_minutes` computed + persisted; displayed below check-in time on `FlightCard` |
| Per-aircraft check-in time | ✅ Done | `check_in_time` persisted; `check-in-time.server.ts` utility created |
| Airframe hours management | ✅ Done | Pre-flight feasibility check + post-flight actuals update via `airframe-hours.server.ts` |
| Passenger counting fix | ✅ Done | `clusterBookings` now counts only `flight_leg_id IS NULL` passengers |
| `flight_leg_id` population after auto-build | ✅ Done | Per-passenger assignment parity between manual and auto-build |
| Pilot rating check relaxed | ✅ Done | Token-based matching (≥2 chars) — `"BN-2 Type Rating"` now matches `"BN-2 Islander"` |
| Weight balance NaN/BigInt sanitizer | ✅ Done | `safe()` helper in `buildSchedule` catches overflow values |
| Handler return SQL queries updated | ✅ Done | `NULL::` stubs replaced with real columns (`f.duration_minutes`, `f.check_in_time`, etc.) |
| DB columns added | ✅ Done | `flights.duration_minutes`, `flights.check_in_time`, `pilots.weight_kg` via `prisma db execute` |
| Test coverage expanded | ✅ Done | 11 CVRP unit tests + 5 multi-flight integration tests |
| `schedule-handlers.server.ts` — unused imports/vars removed | ✅ Done | `findManifestsByFlightId`, `bookingLegPassengerRepository`, `aircraftRepository`, 2× `fmtTime`, `flightLegs` assignment |
| Documentation rationalized | ✅ Done | `plans/scheduling-architectural-specification.md` deleted (superseded); statuses updated on remaining plans |
| `AdminAircraftRow` renamed in `admin.ts` | ✅ Done | No longer collides with `aircraft.ts` |
| `FlightTiming.tsx` deleted | ✅ Done | Deprecated stub removed |
| `findManifestsByFlightId()` created in repository | ✅ Created | Route loader uses it; handlers still inline |
| `findUnassignedByDate()` created in repository | ✅ Created | Route loader uses it |
| `countAssignedByFlightId()` created in repository | ✅ Created | Loadsheet loader uses it |
| `findByBookingLegId()` preserved in repository | ✅ Preserved | `schedule-handlers.server.ts` still imports it |

### Lines Saved

| File | Before | After | Δ |
|------|--------|-------|---|
| `operations.schedule._index.tsx` | 1,492 | 1,438 | **-54** |
| `schedule-handlers.server.ts` | 1,774 | 1,774 | **0** (methods exist but not called) |

---

## 1. God Objects — Current Rankings

| File | Lines | Change | Severity |
|------|-------|--------|----------|
| `app/utils/schedule-handlers.server.ts` | **1,774** | → | 🔴 Critical |
| `app/routes/operations.schedule._index.tsx` | **1,438** | ↓54 | 🔴 Critical |
| `app/utils/scheduling/flight-validation.ts` | 622 | → | 🟡 High |
| `app/routes/ops.flight.$flightId.loadsheet.tsx` | 595 | → | 🟡 High |
| `app/utils/scheduling/config-generator.ts` | 425 | → | 🟡 High |
| `app/utils/repositories/booking-leg-passenger.ts` | **395** | ↑101 | 🟡 High |
| `app/components/schedule/Loadsheet.tsx` | 396 | → | 🟡 High |
| `app/utils/scheduling/assign-pilots.ts` | 389 | → | 🟡 High |
| `app/utils/scheduling/weight-balance.ts` | 344 | → | 🟡 High |
| `app/components/schedule/FlightCard.tsx` | 336 | → | 🟡 High |
| `app/components/loadsheet/LoadsheetModal.tsx` | 333 | → | 🟡 High |

---

## 2. Remaining Duplications (Post Phase 1)

### 2.1 Manifest Queries in `schedule-handlers.server.ts` — **5 remaining** (was 7, route 2 moved to repository)

| Line | Handler | Action Needed |
|------|---------|--------------|
| 619 | `handleCreateFlight` | Call `findManifestsByFlightId` |
| 737 | `handleAssignBooking` (repair) | Call `findManifestsByFlightId` |
| 793 | `handleAssignBooking` (no-legs) | Call `findManifestsByFlightId` |
| 936 | `handleAssignBooking` (rebuild) | Call `findManifestsByFlightId` |
| 1197 | `handleCreateFlightFromBooking` | Call `findManifestsByFlightId` |

### 2.2 Flight Re-Queries — **4 identical** (all in handlers, unchanged)

Lines: 546, 1151, 1626, 1820. Share the identical pattern `NULL::int AS sort_order, NULL::timestamp AS check_in_time...`

### 2.3 Flight Leg Re-Queries — **3 identical** (all in handlers, unchanged)

Lines: 583, 902, 1179.

### 2.4 BigInt Conversion — **3 old inline patterns** (no change)

Lines: 576, 1652, 1846. The shared `bigint.ts` utility exists but is NOT imported in `schedule-handlers.server.ts`.

### 2.5 Passenger Name Pattern — **6 remaining in handlers**

All use `CONCAT(bp.first_name, ' ', bp.last_name)` inline instead of being covered by the repository's manifest query.

### 2.6 UNIFIED — Moved to Repository (Route Loader Only)

| Pattern | Was | Now | Remaining in Handlers |
|---------|-----|-----|---------------------|
| Manifest query (route loader) | 1 inline | Uses `findManifestsByFlightId` | 5 in handlers |
| Unassigned query (route loader) | 1 inline | Uses `findUnassignedByDate` | 0 |
| Stale-detection count | 1 inline | Uses `countAssignedByFlightId` | 0 |

---

## 3. Revised Refactoring Plan

### Phase 2: Migrate Handlers to Use Centralized Repository Methods (P0)

**Goal:** Replace the 5 remaining inline manifest queries, 4 flight re-queries, 3 leg re-queries, and 3 BigInt patterns in `schedule-handlers.server.ts`.

**New methods needed:**

| Repository | Method | Replaces |
|-----------|--------|---------|
| `flight.server.ts` | `findSummaryById(flightId): Promise<FlightSummaryRow>` | 4 flight re-queries |
| `flight-leg.server.ts` | `findLegsByFlightId(flightId): Promise<FlightLegRow[]>` | 3 leg re-queries |

**Update existing handlers to call:**
- `findManifestsByFlightId([flightId])` — 5 call sites
- `findSummaryById(flightId)` — 4 call sites
- `findLegsByFlightId(flightId)` — 3 call sites
- `bigintRowToNumbers(row)` from `app/utils/bigint.ts` — 3 call sites

**Estimated lines saved from `schedule-handlers.server.ts`:** ~350 lines.

### Phase 3: Decompose `schedule-handlers.server.ts` (P1)

After Phase 2, the file will be ~1,424 lines. Split into:

```
app/utils/schedule-handlers/
├── index.ts                    # Re-export barrel
├── auto-build.handler.ts       # handleAutoBuild
├── create-flight.handler.ts    # handleCreateFlight, handleCreateFlightFromBooking
├── assign-booking.handler.ts   # handleAssignBooking, handleUnassignBooking
├── assign-resources.handler.ts # handleAssignPilot, handleAssignAircraft
├── schedule-lifecycle.handler.ts # handleApprove, handleRevise, handlePublish, handleCancel
├── flight-operations.handler.ts # handleRemoveFlight, handleResetDraft, handleReorderFlights
├── transfer-booking.handler.ts # handleTransferBooking
└── shared-queries.ts           # Transaction-wrapped manifest re-queries
```

### Phase 4: Decompose `operations.schedule._index.tsx` (P2)

After Phase 3: split 1,438-line route into loader, actions, drag-handlers, render modules.

### Phase 5: Phase 2 Internal Improvements (P3)

| Item | Description |
|------|-------------|
| Remove BN2 local aliases | Replace `BN2_MTOW_KG` and `BN2_MTOW` with direct `DEFAULT_BN2_MTOW_KG` usage |
| Unify distance caches | Merge `distance-cache.ts` (DB) and `distance-csv.ts` (CSV) |
| Standardize weight casts | All manifest queries now use `::int AS body_weight_kg` (consistent after Phase 2 migration) |

---

## 4. Test Status

### Unit + Integration

| Type | Files | Tests | Status |
|------|-------|-------|--------|
| Passed | 12 | 147 | ✅ |
| Failed | 7 | 27 | ❌ Pre-existing (STY/PSY rename, assign/unassign test data) |

### E2E

| Type | Count | Status |
|------|-------|--------|
| Passed | 17 | ✅ |
| Skipped | 19 | ⏭ (no test data) |
| Failed | 15 | ❌ Auth issues + drag-test timing |

### Test Restructuring (P2)

The `tests/e2e/schedule-drag-validation.spec.ts` (1,875 lines) should be split into modular files per the v1.0 audit Section 4.2. Additionally, 11 shared helper functions should be extracted from it into `tests/e2e/helpers/`.

---

## 5. Priority Matrix (Updated)

| Phase | Effort | Risk | Impact | Priority |
|-------|--------|------|--------|----------|
| Phase 2: Migrate handlers to repository | 3h | Low | High | **P0** |
| Phase 3: Decompose handlers | 5h | Medium | High | **P1** |
| Phase 5: BN2 aliases + weight casts | 1h | Low | Low | **P1** |
| Test restructuring | 3h | Low | Medium | **P2** |
| Phase 4: Decompose route | 4h | Medium | Medium | **P2** |
| Phase 5: Unify distance caches | 2h | Low | Low | **P3** |

---

## 6. Immediate Action Items (Next 3 Hours)

1. **Add `findSummaryById()` to `flight.server.ts`** and replace 4 inline flight re-queries in `schedule-handlers.server.ts`
2. **Add `findLegsByFlightId()` to `flight-leg.server.ts`** (if not already present) and replace 3 inline leg re-queries
3. **Replace 5 manifest queries** in handlers with calls to `findManifestsByFlightId([flightId])`
4. **Replace 3 BigInt inline patterns** with `bigintRowToNumbers()` from `app/utils/bigint.ts`
5. **Remove the 2 unnecessary BN2 constant aliases**

---

## 7. Final File Count Summary

| Directory | Files | Lines |
|-----------|-------|-------|
| `app/utils/scheduling/` | 24 | 3,415 |
| `app/utils/loadsheet/` | 5 | 667 |
| `app/components/schedule/` | 23 | 2,844 |
| `app/components/loadsheet/` | 2 | 495 |
| `app/routes/*schedule*` | 6 | 2,034 |
| `app/routes/*loadsheet*` | 3 | 939 |
| `app/utils/schedule-handlers.server.ts` | 1 | 1,774 |
| `app/utils/repositories/booking-leg-passenger.ts` | 1 | 395 |
| `app/utils/bigint.ts` | 1 | 48 |
| **Total** | **66** | **~12,611** |
