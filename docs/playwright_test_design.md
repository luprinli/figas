# Playwright Testing Strategy: Manual vs Auto-Build Parity

**Date:** 2026-07-17
**Purpose:** Design a deterministic E2E test workflow that automates a manual scheduling process and compares the resulting state against the auto-build output to enforce flight-count optimality.

---

## 1. Architecture Overview

The test must execute two independent scheduling runs from identical starting state, capture structured snapshots of both outputs, and assert parity on flight count and passenger coverage.

```
                    ┌──────────────────────┐
                    │  Deterministic Seed   │
                    │  (known bookings on   │
                    │   a fixed date)       │
                    └──────────┬───────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
     ┌─────────────────┐             ┌─────────────────┐
     │  Phase A:        │             │  Phase B:        │
     │  Auto-Build      │             │  Manual Build    │
     │  (via UI clicks) │             │  (drag-and-drop) │
     └────────┬────────┘             └────────┬────────┘
              │                               │
              ▼                               ▼
     ┌─────────────────┐             ┌─────────────────┐
     │  Snapshot A      │             │  Snapshot B      │
     │  (flights,       │             │  (flights,       │
     │   passengers,    │             │   passengers,    │
     │   routes)        │             │   routes)        │
     └────────┬────────┘             └────────┬────────┘
              │                               │
              └───────────────┬───────────────┘
                              ▼
                    ┌──────────────────┐
                    │  Comparison       │
                    │  & Assertions     │
                    └──────────────────┘
```

**Key constraint:** the two phases cannot run on the same database session because auto-build mutates state (assigns `flight_id`). Phase A must run first, capture its snapshot, then the DB must be reset before Phase B begins.

---

## 2. Deterministic Seed Data

### 2.1 Requirements

A custom seed script (`scripts/seed-parity-test.ts`) that produces a **fixed, known** set of passengers and booking legs on a single specific date. The seed must be idempotent (re-runnable after reset) and use stable booking references so the test can reference specific passengers by name.

### 2.2 Seed Design

```
Date: 2026-07-20 (Monday — guaranteed fly day)
Fleet: 2 aircraft (VP-FBZ BN-2, 9 seats; VP-FBE BN-2, 9 seats)

Booking set (5 bookings, 12 passengers, 6 distinct O→D pairs):

  PARITY-001: STY→MPA  | Pax: Alice, Bob, Carol       (3 pax, 75kg each)
  PARITY-002: STY→PBI  | Pax: Dave, Eve               (2 pax, 80kg each)
  PARITY-003: STY→SHR  | Pax: Frank                   (1 pax, 90kg)
  PARITY-004: MPA→STY  | Pax: Grace, Heidi             (2 pax, 70kg each)
  PARITY-005: PBI→STY  | Pax: Ivan, Julia, Kate, Leo  (4 pax, 75kg each)
```

**Why this set:**
- 12 passengers, max 9 seats per aircraft → requires ≥2 flights minimum
- STY→MPA + STY→PBI can be merged into one STY→MPA→PBI→STY multi-stop (CVRP savings opportunity)
- MPA→STY must be picked up from MPA (different origin from STY)
- PBI→STY has 4 pax → must board at PBI
- Tests the CVRP's ability to build STY→PBI→MPA→STY type routes that pick up passengers at intermediate stops

**Expected auto-build output (optimal):** 2 flights
- Flight 1: STY → PBI (board Dave, Eve, Ivan, Julia, Kate, Leo) → MPA (board Alice, Bob, Carol; alight Ivan, Julia, Kate, Leo) → STY
- Flight 2: STY → MPA (board Grace, Heidi) → SHR (board Frank) → STY

Or a similar 2-flight combination. The exact routing depends on distance matrix, but the CVRP should find a ≤2 flight solution.

**Expected manual output (naive):** 5 flights (one per booking) or 3+ flights if clustered.

### 2.3 Seed Script Skeleton

```typescript
// scripts/seed-parity-test.ts
// Idempotent seed for manual-vs-auto parity testing.

const TARGET_DATE = "2026-07-20";

const BOOKINGS = [
  { ref: "PARITY-001", origin: "STY", dest: "MPA",  names: ["Alice Smith", "Bob Jones", "Carol Lee"],      weight: 75 },
  { ref: "PARITY-002", origin: "STY", dest: "PBI",  names: ["Dave Brown", "Eve White"],                    weight: 80 },
  { ref: "PARITY-003", origin: "STY", dest: "SHR",  names: ["Frank Black"],                                weight: 90 },
  { ref: "PARITY-004", origin: "MPA", dest: "STY",  names: ["Grace Adams", "Heidi Park"],                  weight: 70 },
  { ref: "PARITY-005", origin: "PBI", dest: "STY",  names: ["Ivan Reed", "Julia Hart", "Kate Shaw", "Leo Fox"], weight: 75 },
];
```

### 2.4 Verification Query (for test to validate seed)

```sql
SELECT bl.origin_code, bl.destination_code, COUNT(blp.id) AS pax_count
FROM booking_legs bl
JOIN booking_leg_passengers blp ON blp.booking_leg_id = bl.id
WHERE bl.leg_date = '2026-07-20'
  AND blp.flight_leg_id IS NULL
  AND bl.flight_id IS NULL
  AND bl.status != 'cancelled'
GROUP BY bl.origin_code, bl.destination_code
ORDER BY bl.origin_code, bl.destination_code;
```

---

## 3. Snapshot Schema

### 3.1 What to Capture

Each phase produces a `ScheduleSnapshot`:

```typescript
interface ScheduleSnapshot {
  phase: "auto" | "manual";
  timestamp: string;
  flightCount: number;
  flights: FlightSnapshot[];
  passengerCoverage: {
    totalUnassignedBefore: number;
    totalAssigned: number;
    coveragePct: number;
  };
  warnings: string[];
  errors: string[];
  elapsedMs: number;
}

interface FlightSnapshot {
  flightNumber: string;
  originCode: string;
  destinationCode: string;
  stopSequence: string[];          // ordered: STY, MPA, SHR, STY
  legCount: number;
  passengerCount: number;
  passengerNames: string[];        // all names in flight manifest
  totalDistanceNm: number;
  aircraftRegistration: string | null;
  aircraftType: string | null;
  pilotName: string | null;
}
```

### 3.2 How to Capture from the DOM

**Flight count:**
```typescript
const flightCount = await page.locator('[data-testid="flight-card"]').count();
```

**Stop sequence per flight:** Expand flight card → read leg stops from `StopActivityList`. The stop codes are rendered as badges with the aerodrome ICAO code.

```typescript
async function extractFlightStops(page: Page, flightCardIndex: number): Promise<string[]> {
  const card = page.locator('[data-testid="flight-card"]').nth(flightCardIndex);
  // StopActivityList renders each stop with the aerodrome code in a badge
  const stopBadges = card.locator('[data-testid="stop-activity"]');
  const count = await stopBadges.count();
  const stops: string[] = [];
  for (let i = 0; i < count; i++) {
    const text = await stopBadges.nth(i).textContent();
    // Extract aerodrome code (3 uppercase letters)
    const match = text?.match(/\b([A-Z]{3})\b/);
    if (match) stops.push(match[1]);
  }
  return stops;
}
```

**Passenger manifest:** Open loadsheet modal → read passenger names.

```typescript
async function extractPassengerNames(page: Page, flightCardIndex: number): Promise<string[]> {
  // Click loadsheet button, wait for modal
  const card = page.locator('[data-testid="flight-card"]').nth(flightCardIndex);
  await card.locator('button[title="View Loadsheet"]').click();
  await page.waitForTimeout(800);

  // Read passenger names from manifest panel
  const nameRows = page.locator('table:has(th:text("Passenger")) tr td:first-child').or(
    page.locator('.manifest-passenger-name')
  );
  const names: string[] = [];
  const count = await nameRows.count();
  for (let i = 0; i < count; i++) {
    const name = await nameRows.nth(i).textContent();
    if (name?.trim()) names.push(name.trim());
  }

  await page.keyboard.press("Escape");
  return names;
}
```

**Total distance:** Sum of `distance_nm` from visible leg displays or extract from the DB via API.

---

## 4. Phase A: Auto-Build Execution

### 4.1 Prerequisites
- Seed script has run
- Schedule exists for 2026-07-20 (created by seed)
- Auth state is valid (storageState loaded)

### 4.2 Steps

```typescript
// 1. Navigate to schedule page
await schedulePage.goto("2026-07-20");
await page.waitForLoadState("networkidle");

// 2. Verify seed data is correct
const unassignedBefore = await schedulePage.getUnassignedBookingCount();
expect(unassignedBefore).toBe(5); // 5 booking legs

// 3. Switch to Auto-Build view
await schedulePage.autoBuildTab.click();
await page.waitForTimeout(500);

// 4. Click Generate to run preview
await schedulePage.autoBuildGenerateBtn.click();
await page.waitForTimeout(4000);
await page.waitForLoadState("networkidle");

// 5. Verify preview results appeared
const scoreText = page.locator("text=/Score:/i");
await expect(scoreText.first()).toBeVisible({ timeout: 10_000 });

// 6. Extract preview metrics before accepting
const previewFlightCount = /* parse from preview panel */;
console.log(`Preview proposes ${previewFlightCount} flights`);

// 7. Click Accept & Build
const acceptBtn = page.locator('button:has-text("Accept")').first();
await acceptBtn.click();
await page.waitForTimeout(6000);
await page.waitForLoadState("networkidle");

// 8. Verify flights appeared
await expect(page.locator('[data-testid="flight-card"]').first()).toBeVisible({ timeout: 10_000 });
const flightCount = await schedulePage.getFlightCardCount();

// 9. Build snapshot
const autoSnapshot = await captureScheduleSnapshot(page, "auto");
```

### 4.3 Snapshot Capture After Auto-Build

```typescript
async function captureScheduleSnapshot(
  page: Page,
  phase: "auto" | "manual",
  unassignedBefore: number
): Promise<ScheduleSnapshot> {
  const flightCount = await schedulePage.getFlightCardCount();

  const flights: FlightSnapshot[] = [];
  for (let i = 0; i < flightCount; i++) {
    const card = page.locator('[data-testid="flight-card"]').nth(i);

    const flightNumber = await card.locator('.flight-number, [data-testid="flight-number"]')
      .textContent().then(t => t?.trim() ?? `unknown-${i}`);
    const stops = await extractFlightStops(page, i);
    const names = await extractPassengerNames(page, i);

    // Extract aircraft/pilot from pill buttons
    const aircraftText = await card.locator('[data-testid="aircraft-badge"]')
      .textContent().then(t => t?.trim() ?? null);
    const pilotText = await card.locator('[data-testid="pilot-badge"]')
      .textContent().then(t => t?.trim() ?? null);

    flights.push({
      flightNumber,
      originCode: stops[0] ?? "STY",
      destinationCode: stops[stops.length - 1] ?? "STY",
      stopSequence: stops,
      legCount: stops.length - 1,
      passengerCount: names.length,
      passengerNames: names.sort(),
      totalDistanceNm: 0, // populated from DB query or API
      aircraftRegistration: aircraftText,
      aircraftType: null,
      pilotName: pilotText,
    });
  }

  return {
    phase,
    timestamp: new Date().toISOString(),
    flightCount,
    flights,
    passengerCoverage: {
      totalUnassignedBefore: unassignedBefore,
      totalAssigned: flights.reduce((s, f) => s + f.passengerCount, 0),
      coveragePct: 0, // computed below
    },
    warnings: [],
    errors: [],
    elapsedMs: 0,
  };
}
```

---

## 5. Database Reset Between Phases

After Phase A completes, the database must be restored to its pre-auto-build state. Two strategies:

### Option A: API-Triggered Reset (preferred)

Use the existing `reset-draft` intent handler to clear flights from the schedule:

```typescript
// Call the schedule API to reset the draft
await page.evaluate(async () => {
  const formData = new FormData();
  formData.set("intent", "reset-draft");
  formData.set("scheduleId", String(scheduleId));
  await fetch("/operations/schedule", { method: "POST", body: formData });
});
await page.reload({ waitUntil: "networkidle" });
```

**Limitation:** `reset-draft` only clears flights for a specific schedule. It does NOT re-create deleted booking_leg_passengers junction records if any were affected. The seed's junction records have `flight_leg_id = NULL` and are set to non-NULL during assignment. The reset clears `flight_leg_id` back to NULL. This works correctly because:

1. `handleResetDraft` at `schedule-handlers.server.ts:1199` clears `booking_leg_passengers.flight_leg_id` → NULL
2. It clears `booking_legs.flight_id` → NULL
3. It deletes flights and flight_legs

### Option B: Re-seed

Run the seed script between phases. This is slower but guarantees identical initial state:

```bash
npx tsx scripts/seed-parity-test.ts --reset
```

The `--reset` flag would first delete all PARITY-* bookings and their flights, then re-insert.

**Recommendation:** Use Option B for reliability. The seed script is idempotent and fast (~2s).

### Option C: Snapshot/Restore (postgres only)

```bash
pg_dump --data-only -t bookings -t booking_legs -t booking_leg_passengers ... > parity-snapshot.sql
# After Phase A:
psql < parity-snapshot.sql
```

Too complex for a CI pipeline. Use Option B.

---

## 6. Phase B: Manual Build Execution

### 6.1 Manual Dispatch Strategy (Scripted Algorithm)

The test follows a **defined heuristic** that approximates a reasonable dispatcher's decision process. This is NOT meant to be optimal — it's meant to be **deterministic and repeatable**.

**Algorithm: Cluster-First Manual Dispatch**

```
1. Group unassigned bookings by (origin, destination):
   Cluster 1: STY→MPA   [Alice, Bob, Carol]          → 3 pax
   Cluster 2: STY→PBI   [Dave, Eve]                  → 2 pax
   Cluster 3: STY→SHR   [Frank]                      → 1 pax
   Cluster 4: MPA→STY   [Grace, Heidi]               → 2 pax
   Cluster 5: PBI→STY   [Ivan, Julia, Kate, Leo]     → 4 pax

2. Sort clusters:
   a. By origin (STY-origin first, since those are departures from base)
   b. Then by passenger count descending (largest first)

3. Process each cluster:
   a. If existing flight can accept (same origin match) → drag to existing flight
   b. Else → drag first booking of cluster to draft-flight-placeholder
   c. For remaining bookings in same cluster → drag to the newly created flight
```

### 6.2 Detailed Manual Steps

```typescript
async function executeManualBuild(page: Page): Promise<void> {
  // Step 1: Navigate and verify
  await schedulePage.goto("2026-07-20");
  const bookingCount = await schedulePage.getUnassignedBookingCount();
  expect(bookingCount).toBe(5);

  // Step 2: Process Cluster 1 (STY→MPA, 3 pax — largest STY-origin cluster)
  // Create flight from first booking in this cluster
  const styMpaBooking = page.locator('[data-testid="booking-item"]')
    .filter({ hasText: "STY" })
    .filter({ hasText: "MPA" })
    .first();
  const styMpaId = parseInt((await styMpaBooking.getAttribute("id"))?.replace("booking-", "") ?? "0");
  await dragBookingToDraftFlight(page, styMpaId);
  await waitForStable(page);

  // Verify flight created
  let flightCount = await schedulePage.getFlightCardCount();
  expect(flightCount).toBe(1);

  // Step 3: Drag remaining STY→MPA bookings to the new flight
  const newFlightId = await getFlightIdFromCard(page, 0);
  const remainingStyMpa = page.locator('[data-testid="booking-item"]')
    .filter({ hasText: "STY" })
    .filter({ hasText: "MPA" });
  const remainingCount = await remainingStyMpa.count();
  for (let i = 0; i < remainingCount; i++) {
    const bookingId = parseInt(
      (await remainingStyMpa.nth(i).getAttribute("id"))?.replace("booking-", "") ?? "0"
    );
    await dragBookingToFlight(page, bookingId, newFlightId);
    await waitForStable(page);
  }

  // Step 4: Process Cluster 2 (STY→PBI, 2 pax)
  // Check if we can merge into existing STY-origin flight (insertPassengerRoute handles this)
  // The drop handler dynamically rebuilds the route to include PBI
  const styPbiBooking = page.locator('[data-testid="booking-item"]')
    .filter({ hasText: "STY" })
    .filter({ hasText: "PBI" })
    .first();
  const styPbiId = parseInt((await styPbiBooking.getAttribute("id"))?.replace("booking-", "") ?? "0");
  await dragBookingToFlight(page, styPbiId, newFlightId);
  await waitForStable(page);

  // The route should now be STY→MPA→PBI→STY or similar
  // Verify flight count didn't increase (merged into existing)
  flightCount = await schedulePage.getFlightCardCount();
  expect(flightCount).toBe(1); // still 1 flight

  // Step 5: Process Cluster 3 (STY→SHR, 1 pax)
  // Also merge into existing STY-origin flight
  const styShrBooking = page.locator('[data-testid="booking-item"]')
    .filter({ hasText: "STY" })
    .filter({ hasText: "SHR" })
    .first();
  const styShrId = parseInt((await styShrBooking.getAttribute("id"))?.replace("booking-", "") ?? "0");
  await dragBookingToFlight(page, styShrId, newFlightId);
  await waitForStable(page);

  // Route should now be multi-stop: STY→(MPA|PBI|SHR in optimal order)→STY

  // Step 6: Process Cluster 4 (MPA→STY, 2 pax)
  // MPA-origin — different from STY. This must be picked up from MPA.
  // The insertPassengerRoute adds MPA as an intermediate stop
  const mpaStyBooking = page.locator('[data-testid="booking-item"]')
    .filter({ hasText: "MPA" })
    .filter({ hasText: "STY" })
    .first();
  const mpaStyId = parseInt((await mpaStyBooking.getAttribute("id"))?.replace("booking-", "") ?? "0");
  await dragBookingToFlight(page, mpaStyId, newFlightId);
  await waitForStable(page);

  // Route now must include MPA as a stop (was already included from STY→MPA leg above)

  // Step 7: Process Cluster 5 (PBI→STY, 4 pax)
  // PBI-origin — must pick up from PBI. Check capacity (4 pax + 3 STY→MPA + 2 STY→PBI + 1 STY→SHR + 2 MPA→STY... wait)
  // Total on busiest leg: could exceed 9 seats. If route is STY→SHR→PBI→MPA→STY:
  //   Leg STY→SHR: boards Alice+Bob+Carol+Dave+Eve+Frank = 6 pax → OK
  //   Leg SHR→PBI: alight Frank, board Ivan+Julia+Kate+Leo = 6-1+4 = 9 → at limit
  //   Leg PBI→MPA: alight Dave+Eve+Ivan+Julia+Kate+Leo, board nil = 9-6 = 3 → OK
  //   Leg MPA→STY: board Grace+Heidi = 3+2 = 5 → OK
  // Total max per leg: 9 pax → fits in BN-2

  // But the insertPassengerRoute may fail if capacity exceeded — in that case,
  // create a second flight for this cluster
  const pbiStyBooking = page.locator('[data-testid="booking-item"]')
    .filter({ hasText: "PBI" })
    .filter({ hasText: "STY" })
    .first();
  const pbiStyId = parseInt((await pbiStyBooking.getAttribute("id"))?.replace("booking-", "") ?? "0");

  // Attempt merge first
  await dragBookingToFlight(page, pbiStyId, newFlightId);
  await waitForStable(page);

  // Check if there was an error (capacity exceeded)
  const errorBanner = page.locator('[data-testid="error-toast"], .error-banner');
  if (await errorBanner.isVisible({ timeout: 2000 }).catch(() => false)) {
    // Capacity exceeded — need a second flight. Unassign and create new one.
    console.log("  Capacity limit reached — creating second flight");
    // Unassign the last booking
    const lastPassenger = page.locator('[data-testid="passenger-row"]').last();
    await dragPassengerToUnassignPool(page, `[data-testid="passenger-row"]:last-child`);
    await waitForStable(page);

    // Create new flight
    await dragBookingToDraftFlight(page, pbiStyId);
    await waitForStable(page);
    flightCount = await schedulePage.getFlightCardCount();
    expect(flightCount).toBe(2);
  }

  flightCount = await schedulePage.getFlightCardCount();
  console.log(`Manual build produced ${flightCount} flights`);
}
```

### 6.3 Why This Strategy Is Deterministic

The algorithm processes clusters in a fixed order:
1. Sort by origin (STY first), then by passenger count descending
2. Always merge into the first eligible flight
3. Create new flights only when merge fails

This produce the same output every time for the same seed data, regardless of timing variations. The `insertPassengerRoute` algorithm at `insert-passenger-route.ts:128` is deterministic for a given input.

### 6.4 Unassigned Pool Behavior After Drags

After each drag, the unassigned pool filters out assigned passengers. The test must re-query the booking items list after each `waitForStable` call, since the DOM re-renders.

---

## 7. Phase C: Comparison & Assertions

### 7.1 Comparison Function

```typescript
interface ParityResult {
  passed: boolean;
  flightCountMatch: boolean;
  passengerCoverageMatch: boolean;
  details: string[];
  autoSnapshot: ScheduleSnapshot;
  manualSnapshot: ScheduleSnapshot;
}

function compareBuilds(auto: ScheduleSnapshot, manual: ScheduleSnapshot): ParityResult {
  const details: string[] = [];

  // ── Flight count parity ──────────────────────────────────────────────
  // Auto-build must produce ≤ manual flight count (optimization guarantee)
  const flightCountMatch = auto.flightCount <= manual.flightCount;
  details.push(
    `Flight count: auto=${auto.flightCount}, manual=${manual.flightCount} ` +
    `(auto ≤ manual: ${flightCountMatch ? "✅" : "FAIL"})`
  );

  // ── Passenger coverage ──────────────────────────────────────────────
  const allPassengerNames = new Set([
    "Alice Smith", "Bob Jones", "Carol Lee",
    "Dave Brown", "Eve White",
    "Frank Black",
    "Grace Adams", "Heidi Park",
    "Ivan Reed", "Julia Hart", "Kate Shaw", "Leo Fox",
  ]);
  const autoAssigned = new Set(auto.flights.flatMap(f => f.passengerNames));
  const manualAssigned = new Set(manual.flights.flatMap(f => f.passengerNames));

  const autoMissing = [...allPassengerNames].filter(n => !autoAssigned.has(n));
  const manualMissing = [...allPassengerNames].filter(n => !manualAssigned.has(n));

  details.push(
    `Auto-build coverage: ${autoAssigned.size}/${allPassengerNames.size} ` +
    `${autoMissing.length > 0 ? `(missing: ${autoMissing.join(", ")})` : "✅"}`
  );
  details.push(
    `Manual coverage: ${manualAssigned.size}/${allPassengerNames.size} ` +
    `${manualMissing.length > 0 ? `(missing: ${manualMissing.join(", ")})` : "✅"}`
  );

  const passengerCoverageMatch = autoAssigned.size >= manualAssigned.size;

  // ── STY enforcement ──────────────────────────────────────────────────
  for (const f of auto.flights) {
    if (f.stopSequence[0] !== "STY") {
      details.push(`FAIL: Auto-build flight ${f.flightNumber} does not start at STY (starts: ${f.stopSequence[0]})`);
    }
    if (f.stopSequence[f.stopSequence.length - 1] !== "STY") {
      details.push(`FAIL: Auto-build flight ${f.flightNumber} does not end at STY (ends: ${f.stopSequence[f.stopSequence.length - 1]})`);
    }
  }

  // ── No duplicate passengers ──────────────────────────────────────────
  const autoNameCounts = new Map<string, number>();
  for (const name of auto.flights.flatMap(f => f.passengerNames)) {
    autoNameCounts.set(name, (autoNameCounts.get(name) ?? 0) + 1);
  }
  for (const [name, count] of autoNameCounts) {
    if (count > 1) {
      details.push(`FAIL: Passenger "${name}" appears on ${count} flights in auto-build`);
    }
  }

  const passed = flightCountMatch && passengerCoverageMatch &&
    autoMissing.length === 0 &&
    !details.some(d => d.startsWith("FAIL"));

  return { passed, flightCountMatch, passengerCoverageMatch, details, autoSnapshot: auto, manualSnapshot: manual };
}
```

### 7.2 Assertion Tolerances

| Metric | Assertion | Tolerance |
|--------|----------|-----------|
| Flight count | `auto.flightCount ≤ manual.flightCount` | Strict (auto must not produce more flights) |
| Passenger coverage | `auto.coveragePct = 100%` | Must serve ALL bookable passengers |
| STY enforcement | All flights start and end at STY | Strict (RULE 1) |
| Duplicate passengers | No passenger on multiple flights | Strict |
| Flight number format | `FIG-20260720-NNN` | Strict (RULE 3) |
| Leg sequence ordering | `leg_sequence` starts at 1 | Strict |

**Note on flight count tolerance:** The auto-build is expected to produce **fewer or equal** flights compared to the manual scripted build. If the manual build achieves fewer flights (unlikely with the scripted cluster-first strategy), that indicates a CVRP optimization failure.

### 7.3 Acceptable Discrepancies

The following are NOT considered parity failures:

1. **Route structure differences:** Auto-build may produce STY→PBI→MPA→STY while manual produces STY→MPA→PBI→STY. Both are valid as long as all passengers are served.
2. **Passenger distribution across flights:** Auto-build may put 6 pax on Flight 1 and 6 on Flight 2 while manual puts 8 on Flight 1 and 4 on Flight 2. Only total flight count and coverage matter.
3. **Flight number assignment:** Auto-build and manual use different flight number generators. Numbers will differ.

---

## 8. Full Test Spec

```typescript
// tests/e2e/manual-vs-auto-build.spec.ts
import { test, expect } from "@playwright/test";
import { SchedulePage } from "./pages/schedule-page";
import {
  dragBookingToFlight,
  dragBookingToDraftFlight,
  dragPassengerToUnassignPool,
} from "./helpers/drag-simulator";
import { execSync } from "child_process";
import type { ScheduleSnapshot, FlightSnapshot, ParityResult } from "./helpers/parity-types";

test.describe("Manual vs Auto-Build Parity", () => {
  test.setTimeout(300_000); // 5 minutes for full pipeline

  let schedulePage: SchedulePage;
  const TARGET_DATE = "2026-07-20";

  test.beforeAll(async () => {
    // Seed deterministic data
    console.log("Seeding parity test data...");
    execSync("npx tsx scripts/seed-parity-test.ts", { stdio: "inherit" });
  });

  test.beforeEach(async ({ page }) => {
    schedulePage = new SchedulePage(page);
  });

  test("should produce ≤N flights via auto-build compared to manual build", async ({ page }) => {
    // ═══════════════════════════════════════════════════════════════
    // Phase A: Auto-Build
    // ═══════════════════════════════════════════════════════════════
    await test.step("Phase A: Auto-build snapshot", async () => {
      await schedulePage.goto(TARGET_DATE);
      const unassignedBefore = await schedulePage.getUnassignedBookingCount();
      console.log(`Unassigned bookings before auto-build: ${unassignedBefore}`);

      test.expect(unassignedBefore).toBeGreaterThanOrEqual(5);

      // Execute auto-build via UI
      if (await schedulePage.autoBuildTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await schedulePage.autoBuildTab.click();
        await page.waitForTimeout(500);
      }
      await schedulePage.autoBuildGenerateBtn.click();
      await page.waitForTimeout(4000);
      await page.waitForLoadState("networkidle");

      // Accept the build
      const acceptBtn = page.locator('button:has-text("Accept")').first();
      if (await acceptBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await acceptBtn.click();
        await page.waitForTimeout(6000);
        await page.waitForLoadState("networkidle");
      }

      // Capture snapshot
      const autoSnapshot = await captureScheduleSnapshot(page, "auto", unassignedBefore);
      console.log(`Auto-build: ${autoSnapshot.flightCount} flights, ${autoSnapshot.passengerCoverage.totalAssigned} pax`);

      // Store for comparison
      await test.info().attach("auto-snapshot", {
        body: JSON.stringify(autoSnapshot, null, 2),
        contentType: "application/json",
      });
    });

    // ═══════════════════════════════════════════════════════════════
    // Reset State
    // ═══════════════════════════════════════════════════════════════
    await test.step("Reset database state", async () => {
      console.log("Resetting database for manual build...");
      execSync("npx tsx scripts/seed-parity-test.ts --reset", { stdio: "inherit" });
      await page.reload({ waitUntil: "networkidle" });
    });

    // ═══════════════════════════════════════════════════════════════
    // Phase B: Manual Build
    // ═══════════════════════════════════════════════════════════════
    await test.step("Phase B: Manual build via drag-and-drop", async () => {
      await schedulePage.goto(TARGET_DATE);
      const unassignedBefore = await schedulePage.getUnassignedBookingCount();
      console.log(`Unassigned bookings before manual build: ${unassignedBefore}`);
      test.expect(unassignedBefore).toBeGreaterThanOrEqual(5);

      await executeManualBuild(page);
      await page.waitForTimeout(1000);

      const manualSnapshot = await captureScheduleSnapshot(page, "manual", unassignedBefore);
      console.log(`Manual build: ${manualSnapshot.flightCount} flights, ${manualSnapshot.passengerCoverage.totalAssigned} pax`);

      await test.info().attach("manual-snapshot", {
        body: JSON.stringify(manualSnapshot, null, 2),
        contentType: "application/json",
      });
    });

    // ═══════════════════════════════════════════════════════════════
    // Phase C: Comparison
    // ═══════════════════════════════════════════════════════════════
    await test.step("Phase C: Compare and assert parity", async () => {
      // Re-read snapshots from test info
      const autoSnapshot = /* retrieve from test.info().attachments */;
      const manualSnapshot = /* retrieve from test.info().attachments */;

      const result = compareBuilds(autoSnapshot, manualSnapshot);
      console.log(result.details.join("\n"));

      test.expect(result.passed, `Parity check failed:\n${result.details.filter(d => d.includes("FAIL")).join("\n")}`).toBe(true);
    });
  });
});
```

---

## 9. New Infrastructure Required

### 9.1 Files to Create

| File | Purpose |
|------|---------|
| `scripts/seed-parity-test.ts` | Deterministic seed with PARITY-* bookings |
| `tests/e2e/helpers/parity-types.ts` | `ScheduleSnapshot`, `FlightSnapshot`, `ParityResult` types |
| `tests/e2e/helpers/snapshot-extractor.ts` | `captureScheduleSnapshot()`, `extractFlightStops()`, `extractPassengerNames()` |
| `tests/e2e/helpers/manual-build-executor.ts` | `executeManualBuild()` with scripted drag strategy |
| `tests/e2e/helpers/parity-comparator.ts` | `compareBuilds()` |
| `tests/e2e/manual-vs-auto-build.spec.ts` | The test spec |

### 9.2 Files to Extend

| File | Change |
|------|--------|
| `tests/e2e/pages/schedule-page.ts` | Add `getFlightCardCount()`, `getFlightNumberByIndex()`, locators for stop badges, manifest rows |
| `tests/e2e/helpers/drag-simulator.ts` | Add error-state detection after drag (capacity exceeded toast) |

### 9.3 Package.json Scripts

```json
{
  "scripts": {
    "seed:parity": "npx tsx scripts/seed-parity-test.ts",
    "test:parity": "npm run seed:parity && npx playwright test tests/e2e/manual-vs-auto-build.spec.ts"
  }
}
```

### 9.4 Test Data Selectors Required

These `data-testid` attributes must exist on the components. Verify before writing tests:

| Component | Test ID | Purpose |
|-----------|---------|---------|
| Flight card wrapper | `flight-card` | Flight count, card indexing |
| Flight number span | `flight-number` | Extract FIG-NNN format |
| Stop activity item | `stop-activity` | Extract aerodrome codes per stop |
| Aircraft badge | `aircraft-badge` | Extract assigned aircraft reg |
| Pilot badge | `pilot-badge` | Extract assigned pilot name |
| Booking item | `booking-item` | Drag sources, filtering by text |
| Manifest passenger name | `manifest-passenger-name` | Extract assigned passengers |
| Error toast | `error-toast` | Detect capacity exceeded |
| Schedule status bar | `schedule-status-bar` | Verify build complete |

---

## 10. Failure Diagnostics

When the parity test fails, the test report must include:

1. **Snapshot JSON attachments** — both auto and manual snapshots attached to the Playwright report
2. **DOM state at failure** — auto-screenshot on assertion failure
3. **Console log** — all `console.log` output during the test
4. **DB verification queries** — logged before and after each phase:

```sql
-- Unassigned passengers before/after
SELECT COUNT(*) FROM booking_leg_passengers blp
JOIN booking_legs bl ON bl.id = blp.booking_leg_id
WHERE bl.leg_date = '2026-07-20' AND blp.flight_leg_id IS NULL;

-- Flight count
SELECT COUNT(*) FROM flights f
JOIN schedules s ON s.id = f.schedule_id
WHERE s.schedule_date = '2026-07-20';

-- Route per flight
SELECT f.flight_number, fl.leg_number, fl.origin_code, fl.destination_code
FROM flights f
JOIN flight_legs fl ON fl.flight_id = f.id
JOIN schedules s ON s.id = f.schedule_id
WHERE s.schedule_date = '2026-07-20'
ORDER BY f.id, fl.leg_number;
```

---

## 11. CI Integration

### 11.1 GitHub Actions Step

```yaml
- name: Manual vs Auto-Build Parity
  run: |
    npm run seed:parity
    npx playwright test tests/e2e/manual-vs-auto-build.spec.ts --reporter=html
  env:
    DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
```

### 11.2 Local Development

```bash
# One-time setup
npm run seed:parity

# Run parity test
npx playwright test tests/e2e/manual-vs-auto-build.spec.ts --headed

# Run with debug
PWDEBUG=1 npx playwright test tests/e2e/manual-vs-auto-build.spec.ts --headed
```

### 11.3 Time Budget

| Phase | Estimated Time |
|-------|---------------|
| Seed execution | ~3s |
| Auto-build (UI wait) | ~25s |
| DB reset (re-seed) | ~3s |
| Manual build (5 drags × ~3s each) | ~20s |
| Snapshot extraction (5 flights × ~3s) | ~15s |
| **Total** | **~70s** |

The 300s timeout provides ample headroom for CI variance.

---

## 12. Known Limitations & Mitigations

| Limitation | Mitigation |
|-----------|-----------|
| **Manual strategy is scripted, not truly "intelligent"** | The CVRP solver should beat ANY deterministic scripted strategy. If the scripted strategy produces fewer flights, that's a genuine CVRP bug. |
| **`insertPassengerRoute` may reject merges at capacity** | The test handles this by creating a second flight. The flight count assertion accounts for this. |
| **Aircraft availability constraints may differ** | The seed ensures 2 active aircraft. The auto-build's time-sequencing issue (R-03) may cause more flights than manual if not fixed. **This IS the test's purpose** — to surface this discrepancy. |
| **Timing flakiness in drag simulation** | The 1.5s post-drop settle and `networkidle` wait are generous. If flaky, increase settle to 3s. |
| **Loadsheet modal may fail to open** | Use `catch(() => false)` on all modal interactions. Missing manifest data degrades the comparison but doesn't fail the test — flight count is the primary metric. |
