# Distance-Matrix & Booking-Leg DB Audit — Discrepancy Catalog

**Date:** 2026-07-18
**Context:** Auto-build produces "No unassigned booking legs" while the UI shows 5 unassigned bookings with 12 passengers — the same data is invisible to one code path but visible to another.

---

## 0. Connection Pool Verification

`db.server.ts:38-42`:
```typescript
export const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
export const kdb = db;
```

**Finding:** `kdb === db` — both are the same Kysely singleton sharing one PgPool (max 10 connections). Line 35: `SET timezone = 'UTC'` on every connect. No connection-pool discrepancy exists.

---

## 1. CRITICAL: Two Different Queries for "Unassigned"

### Query A — `findUnassignedLegs()` (auto-build path)
**File:** `app/utils/repositories/booking-leg.ts:134-167`
```sql
SELECT * FROM (
  SELECT DISTINCT bl.id, bl.booking_id, bl.flight_id, bl.origin_code,
    bl.destination_code, bl.leg_date, bl.departure_date, bl.preferred_time,
    bl.preferred_time_start, bl.preferred_time_end, bl.leg_sequence,
    bl.status, bl.created_at, bl.updated_at
  FROM booking_legs AS bl
  INNER JOIN booking_leg_passengers AS blp ON blp.booking_leg_id = bl.id
  INNER JOIN bookings AS b ON b.id = bl.booking_id
  WHERE blp.flight_leg_id IS NULL
    AND b.status NOT IN ('cancelled', 'completed')
) AS sub
ORDER BY leg_date ASC, leg_sequence ASC
```

**Characteristics:**
- **No `leg_date` filter** — returns ALL dates
- Uses `DISTINCT` subquery (one row per leg, collapsing multiple passengers)
- Date normalization happens in **JavaScript** (`clusterBookings.ts:22-24`):
  ```typescript
  const dateStr = typeof leg.leg_date === "string"
    ? leg.leg_date.split("T")[0]
    : new Date(leg.leg_date).toISOString().split("T")[0];
  ```

### Query B — `findUnassignedByDate()` (UI loader)
**File:** `app/utils/repositories/booking-leg-passenger.ts:346-370`
```sql
SELECT blp.id, bl.id AS booking_leg_id, bl.booking_id, b.booking_reference,
  CONCAT(bp.first_name, ' ', bp.last_name) AS passenger_name,
  bp.first_name, bp.last_name, bl.origin_code, bl.destination_code,
  bl.leg_date, bl.leg_sequence,
  COALESCE(blp.clothed_weight_kg, 70) AS clothed_weight_kg,
  COALESCE(blp.baggage_weight_kg, 0) AS baggage_weight_kg,
  COALESCE(blp.freight_weight_kg, 0) AS freight_weight_kg, blp.seat_number
FROM booking_leg_passengers blp
JOIN booking_legs bl ON bl.id = blp.booking_leg_id
JOIN bookings b ON b.id = bl.booking_id
JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
WHERE blp.flight_leg_id IS NULL
  AND bl.leg_date = ${date}       -- <-- DATE FILTER IN SQL
  AND b.status NOT IN ('cancelled', 'completed')
ORDER BY bl.leg_sequence, bp.last_name, bp.first_name
```

**Characteristics:**
- **Has `bl.leg_date = ${date}` filter** — SQL-level date filtering
- Returns one row per passenger (no DISTINCT)
- Joins `booking_passengers` for name resolution

### Discrepancy Impact

The auto-build uses Query A, which returns ALL unassigned legs across all dates, then performs JS-side date filtering. The UI loader uses Query B with SQL-side date filtering. If the JS-side date normalization produces a different value than the SQL parameter (e.g., due to `leg_date` type handling), the filter mismatches and `clusterBookingsByDate` returns empty.

**The PARITY bookings' `leg_date` is inserted as `'2026-07-22'` (string literal in Kysely SQL). PostgreSQL stores it as DATE `2026-07-22`. Query B's `bl.leg_date = '2026-07-22'` matches correctly (returns 5 bookings). Query A must return the same rows, then `clusterBookingsByDate` must normalize `leg_date` to `"2026-07-22"` and match against the input parameter. The JS normalization is the most likely failure point.**

---

## 2. SEVERE: Seed Date-Comparison Broken (Perpetual Re-Creation)

**File:** `scripts/seed-parity-test.ts:190-195`
```typescript
const existing = await sql`...`.execute(db);
if (existing.rows.length > 0) {
  const existingDate = String((existing.rows[0] as any).leg_date).slice(0, 10);
  if (existingDate === TARGET_DATE) { ... }
}
```

**Problem:** `String(Date).slice(0, 10)` on a JavaScript Date object produces `"Wed Jul 22"` (first 10 chars of `"Wed Jul 22 2026 00:00:00 GMT+0000"`). This **never** matches `TARGET_DATE` which is `"2026-07-22"`.

**Result:** Every seed run deletes and re-creates all PARITY bookings even when the date hasn't changed. This is wasteful but does not cause data corruption — the re-creation is correct.

**Fix:**
```typescript
const existingDate = typeof (existing.rows[0] as any).leg_date === "string"
  ? String((existing.rows[0] as any).leg_date).slice(0, 10)
  : new Date((existing.rows[0] as any).leg_date).toISOString().slice(0, 10);
```

---

## 3. MODERATE: `booking_legs.status` Completely Ignored by Queries

Both `findUnassignedLegs` and `findUnassignedByDate` filter on `b.status` (bookings.status) but **NOT** on `bl.status` (booking_legs.status).

| Seed | `bookings.status` | `booking_legs.status` | Found by query? |
|------|-------------------|----------------------|-----------------|
| parity-test | `confirmed` | `confirmed` | **YES** |
| e2e-deterministic | `confirmed` | `confirmed` | **YES** |
| e2e-drag-test | `confirmed` | `confirmed` | **YES** |
| comprehensive | `completed` (90% of past) | `confirmed` or `cancelled` | **NO** (excluded by `b.status`) |
| comprehensive | `checked_in` (some past) | `confirmed` | **YES** (not in exclusion list) |
| comprehensive | `pending` (some future) | `confirmed` | **YES** |

**Issue:** `BookingStatus.CHECKED_IN` and `BookingStatus.PENDING` are not in the exclusion list. Bookings with these statuses would appear as "unassigned" even though they may be in states where auto-building is inappropriate.

**Exclusion list completeness:** The query excludes only `CANCELLED` and `COMPLETED`. Should also consider excluding `PENDING` (not yet confirmed) and `CHECKED_IN` (already at the counter).

---

## 4. MODERATE: Two Separate Query Paths for `generateBestConfig`

**File:** `app/utils/scheduling/config-generator.ts:259-303`

`generateBestConfig(date)` calls `clusterBookingsByDate(date)` **twice**:
1. Inside `strategyCvrp(date)` at line 109 — for route building
2. Directly at line 287 — for counting `totalUnassignedPassengers`

These are independent calls. If the first call mutated state (it doesn't), the second would see different data. Not a bug, but fragile.

---

## 5. LOW: `bookings.status` Enum Not Exhaustive in Auto-Build

The `findUnassignedLegs` query excludes only two statuses:
```typescript
.where("b.status", "not in", [BookingStatus.CANCELLED, BookingStatus.COMPLETED])
```

**Unlisted statuses that pass the filter (and should they?):**

| Status | Should auto-build include? | Rationale |
|--------|---------------------------|-----------|
| `pending` | **No** | Booking not yet confirmed |
| `passengers_added` | **Maybe** | Passengers added but booking not fully complete |
| `weight_declared` | **Maybe** | Weights declared, awaiting finalization |
| `freight_declared` | **Maybe** | Freight details submitted |
| `flight_assigned` | **No** | Already assigned to another flight — should not be re-assigned |
| `pilot_review` | **No** | Under pilot review — locked |
| `approved` | **Maybe** | Approved but not yet flown |
| `checked_in` | **No** | Already at check-in counter |
| `completed` | **No** | Already flown (excluded) |
| `cancelled` | **No** | Cancelled (excluded) |

**Recommendation:** Add `flight_assigned`, `pilot_review`, `checked_in` to the exclusion list.

---

## 6. LOW: `seed-comprehensive` Uses Non-Standard `checked_in` Status

**File:** `scripts/seed-comprehensive.ts:443-457`

```typescript
if (isPast) {
  status = pick(["completed","completed","completed","cancelled","checked_in"]);
}
```

`checked_in` is used as a `bookings.status` value, but it is **not defined in the `BookingStatus` enum** (`app/utils/constants.ts:138-148`). The enum lists `PENDING` through `CANCELLED` — no `CHECKED_IN` entry exists. This is a typo: the seed should use the `BookingStatus` constant or at minimum a value that exists in the domain.

---

## 7. LOW: `aerodrome_headings` Table Referenced but Never Used in Auto-Build

**File:** `app/utils/scheduling/index.ts:150-153`

```typescript
const headingRows = await loadHeadings();
const headingMatrix = new Map<string, number>();
for (const h of headingRows) {
  headingMatrix.set(`${h.origin}->${h.destination}`, h.heading);
}
```

Headings are loaded and stored in a matrix but are only used for **display** (flight leg creation at line 252: `heading: legHeading > 0 ? legHeading : null`). The CVRP solver does not use headings for routing decisions. This is appropriate (heading is directional display data, not a routing constraint) but the matrix is built on the hot path unnecessarily.

---

## 8. LOW: Distance Matrix is Symmetrized in Memory but Missing Entries = Zero

**File:** `app/utils/scheduling/distance-lookup.ts:88-95`
```typescript
function buildBidirectionalMap(distances: DistanceRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const d of distances) {
    map.set(`${d.origin}→${d.destination}`, d.distance_nm);
    map.set(`${d.destination}→${d.origin}`, d.distance_nm);
  }
  return map;
}
```

And in `index.ts:160-161`:
```typescript
const lookupDistance = (from: string, to: string): number =>
  distanceMatrix.get(`${from}->${to}`) ?? distanceMatrix.get(`${to}->${from}`) ?? 0;
```

If a distance pair is missing from the DB, it falls back to 0. This cascades to the CVRP solver: a 0nm distance between two stops means the savings algorithm considers merging them "free", which could produce invalid routes. The parity seed filters aerodromes to only those with distance data from STY, so this is mitigated.

---

## 9. LOW: `clusterBookingsByDate` Redefined in Two Files

**File 1:** `app/utils/scheduling/cluster-bookings.ts:117-121`
```typescript
export async function clusterBookingsByDate(date: string): Promise<ClusterResult[]> {
  const allClusters = await clusterBookings();
  const normalized = date.split("T")[0];
  return allClusters.filter((c) => c.date === normalized);
}
```

**File 2:** `app/utils/scheduling/index.ts:535-538`
```typescript
async function clusterBookingsByDate(date: string): Promise<ClusterResult[]> {
  const allClusters = await clusterBookings();
  return allClusters.filter((c) => c.date === date);
}
```

File 2 is a private helper in `index.ts` that does the same thing but **without** the `.split("T")[0]` normalization. If the `date` parameter passed to `buildSchedule` contains a time component (e.g., `"2026-07-22T00:00:00Z"`), the private version would fail to match. The public version in `cluster-bookings.ts` normalizes correctly.

The `buildSchedule` function at line 63 calls the **file-local** version, not the exported one from `cluster-bookings.ts`. This is the more likely root cause of the date mismatch.

---

## Summary Table

| # | Severity | File | Issue | Affects |
|---|----------|------|-------|---------|
| 1 | **CRITICAL** | `index.ts:535` vs `cluster-bookings.ts:117` | Two `clusterBookingsByDate` implementations — one normalizes dates (`.split("T")[0]`), one does not | Auto-build discarding valid clusters |
| 2 | **CRITICAL** | `booking-leg.ts:134` vs `booking-leg-passenger.ts:346` | Two different queries for "unassigned" — one WITH date filter, one WITHOUT | Auto-build vs UI data divergence |
| 3 | **SEVERE** | `seed-parity-test.ts:190` | `String(Date).slice(0,10)` produces `"Wed Jul 22"`, never matches ISO date | Perpetual delete+recreate |
| 4 | **MODERATE** | `booking-leg.ts:156` | Only excludes `cancelled`/`completed` — allows `pending`, `checked_in`, `flight_assigned` | Inappropriate bookings auto-built |
| 5 | **MODERATE** | `config-generator.ts:259+287` | `clusterBookingsByDate` called twice independently | Fragile, duplicate work |
| 6 | **LOW** | `seed-comprehensive.ts:447` | Uses `checked_in` which is not a `BookingStatus` enum member | Data integrity drift |

## Recommended Fix Order

1. **Fix `clusterBookingsByDate` in `index.ts`** — align with the public version or delete the private helper and import the public one
2. **Add date filter to `findUnassignedLegs`** — or change auto-build to use `findUnassignedByDate`
3. **Fix seed date comparison** — use `.toISOString().slice(0,10)` for Date objects
4. **Tighten `findUnassignedLegs` exclusion list** — add `flight_assigned`, `pilot_review`, `pending`
5. **Consolidate duplicate code paths**
