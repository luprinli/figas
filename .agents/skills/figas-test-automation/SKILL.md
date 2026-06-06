---
name: figas-test-automation
description: Comprehensive testing patterns for the FIGAS flight scheduling Remix application
author: Adapted from fugazi/test-automation-skills-agents conventions for FIGAS Remix II
---

# FIGAS Test Automation Skill

## Overview

This skill defines testing patterns for the FIGAS (Falkland Islands Government Air Service) flight scheduling application. The project is a **Remix v2 + TypeScript + Prisma + PostgreSQL** application with Playwright v1.60 for E2E testing.

**Tech Stack:** Remix v2 · TypeScript (strict) · Prisma ORM (PostgreSQL) · Playwright v1.60 · Vitest · dnd-kit · Tailwind CSS v4

---

## 0. Startup & Seeding (Critical — Do NOT Skip)

### 0.1 Initial Setup Order

When setting up a fresh clone or resetting the database, run these steps **in this exact order**:

```bash
# 1. Install dependencies
npm install

# 2. Run database migrations (applies consolidated SQL migrations)
npm run migrate

# 3. Seed ALL reference data + historical bookings from CSV files
npm run seed:full

# 4. Seed PBAC (Permission-Based Access Control) — roles, permissions
npm run seed:pbac

# 5. Assign users to PBAC roles
npm run seed:pbac:assign

# Or run all of the above with a single command:
npm run setup
```

> **WARNING:** `npm run seed:full` calls `clearAllTables()` which **wipes all data** including PBAC tables. You MUST re-run `seed:pbac` and `seed:pbac:assign` after `seed:full`. The `npm run setup` script handles this automatically.

### 0.2 Seed Scripts Reference

| Script | File | What it seeds | Notes |
|--------|------|---------------|-------|
| `seed:full` | [`scripts/seed-full.ts`](scripts/seed-full.ts) | 31 aerodromes, 5 aircraft, 6 pilots (with user accounts), 405 fare routes, 76 fuel rules, 666 distances, 665 headings, 5 airframe hours, 2 organizations, 38 bookings (from FlightList.csv), 74 passengers, 46 booking legs, 37 payments, 14 system settings | Uses `pg.Pool` directly (not Prisma). Reads CSV files from [`data/`](data/). Calls `clearAllTables()` first — **destructive**. |
| `seed:pbac` | [`prisma/seed-pbac.ts`](prisma/seed-pbac.ts) | 58 permissions, 7 roles, 115 role-permission assignments | Uses Prisma. Requires `--env-file .env` flag. |
| `seed:pbac:assign` | [`scripts/assign-user-roles.ts`](scripts/assign-user-roles.ts) | 34 users assigned to roles | Assigns all system users + pilots + FlightList users to appropriate roles. |
| `seed:users` | [`scripts/seed-users.ts`](scripts/seed-users.ts) | System users (admin, ops, finance, agent, engineer, pilot) | Included in `seed:full` — do not run separately unless you need only users. |
| `seed` | [`app/utils/seed.ts`](app/utils/seed.ts) | Test schedules + unassigned bookings for today/tomorrow | Lightweight seed for e2e testing. Requires reference data to exist first. |

### 0.3 Data Files

The comprehensive seed script [`scripts/seed-full.ts`](scripts/seed-full.ts) reads from these CSV files in [`data/`](data/):

| File | Contents |
|------|----------|
| [`data/aerodromes.csv`](data/aerodromes.csv) | 30 Falkland Islands aerodromes (codes, names, coordinates, timezone) |
| [`data/aircraft.csv`](data/aircraft.csv) | 5 aircraft (BN-2 Islanders with registration, weights, fuel specs) |
| [`data/pilots.csv`](data/pilots.csv) | 6 pilots with names, license info, contact details |
| [`data/FlightList.csv`](data/FlightList.csv) | Historical booking data — 66 passenger rows in 37 booking groups |
| [`data/MATRIX FARES.txt`](data/MATRIX FARES.txt) | Fare matrix used to generate 405 fare routes |
| [`data/fuel.csv`](data/fuel.csv) | 76 fuel rules (fuel burn rates per route) |
| [`data/distance.csv`](data/distance.csv) | 666 aerodrome-to-aerodrome distances (nautical miles) |
| [`data/heading.csv`](data/heading.csv) | 665 aerodrome-to-aerodrome headings (degrees) |
| [`data/airframe_hours.csv`](data/airframe_hours.csv) | 5 airframe hour records |

### 0.4 Schema Pitfalls (Known Mismatches Between Backup Seed & Current Schema)

The backup seed script at `C:\Users\Leeqoqo\Documents\Code\FIGAS VI\FIGAS-remix-II-backup-2026-05-25\app\utils\seed.ts` was written for an older schema. When copying it to [`scripts/seed-full.ts`](scripts/seed-full.ts), these fixes were required:

| Table | Old Column (Backup) | Current Column | Fix Applied |
|-------|---------------------|----------------|-------------|
| `booking_passengers` | `clothed_weight_kg` | `clothed_body_weight_kg` | Renamed column |
| `booking_passengers` | `baggage_weight_kg` | *(does not exist)* | Removed from INSERT |
| `booking_passengers` | `residency` | `residency_status` | Renamed column |
| `payments` | *(missing)* | `amount_gbp` | Added to INSERT |
| `payments` | *(missing)* | `payment_method` | Added to INSERT (same value as `method`) |
| `bookings` | *(missing)* | `total_amount_gbp` | Added to INSERT |
| `bookings` | *(missing)* | `booking_source` | Added to INSERT (default `'customer_direct'`) |
| `bookings` | *(missing)* | `is_organization_billing` | Added to INSERT (default `false`) |
| `aerodromes` | `PSY` (Stanley Airport) | `STY` (Stanley) | Added `STY` alias — fare matrix and FlightList.csv use `STY` |

### 0.5 PBAC Architecture

The Permission-Based Access Control system uses these tables:

```
roles (id, slug, name, hierarchy_level, description)
permissions (id, slug, name, description, module)
role_permissions (role_id, permission_id)
user_roles (user_id, role_id)
```

**Key roles:**
- `super_admin` — hierarchy_level 100 (full access)
- `ops_manager` — hierarchy_level 80 (operations dashboard, scheduling)
- `finance_manager` — hierarchy_level 70 (financial data)
- `pilot` — hierarchy_level 50 (flight manifests, check-in)
- `agent` — hierarchy_level 40 (booking management)
- `engineer` — hierarchy_level 30 (aircraft maintenance)
- `customer` — hierarchy_level 10 (own bookings only)

**Critical:** The [`redirectToRoleHome()`](app/utils/auth.server.ts:125) function in [`app/utils/auth.server.ts`](app/utils/auth.server.ts) checks user permissions to determine the redirect destination after login. If PBAC tables are empty, this function cannot determine the correct route, causing the app to fail to display the proper dashboard.

### 0.6 Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `column "approved_at" does not exist` on `flight_manifests` | Query uses `approved_at` but `flight_manifests` has `signed_off_at` | Change to `signed_off_at IS NULL` in [`operations._index.tsx`](app/routes/operations._index.tsx:96) and [`operations.tsx`](app/routes/operations.tsx:23) |
| `column "clothed_weight_kg" does not exist` on `booking_passengers` | Seed script uses old column name | Use `clothed_body_weight_kg` instead |
| `column "baggage_weight_kg" does not exist` on `booking_passengers` | Column was removed from schema | Remove from INSERT statement |
| `insert or update on table "fare_routes" violates foreign key constraint` | `STY` aerodrome missing | Add `STY` alias for Stanley (see [`scripts/seed-full.ts`](scripts/seed-full.ts:~289)) |
| `DATABASE_URL environment variable is required` | `seed-pbac.ts` doesn't load `.env` | Run with `--env-file .env` flag |
| Login redirects to wrong page or shows "No bookings found" | PBAC tables empty | Run `seed:pbac` + `seed:pbac:assign` |
| Side navigation missing | User permissions not loaded | Ensure PBAC roles are assigned to user |

### 0.7 Database Verification

After seeding, verify the database state:

```bash
# Quick count check
npx tsx scripts/check-db-state.ts
```

Expected counts after full seed:
- aerodromes: 31
- aircraft: 5
- pilots: 6
- fare_routes: 405
- fuel_rules: 76
- aerodrome_distances: 666
- aerodrome_headings: 665
- airframe_hours: 5
- organizations: 2
- users: 34
- bookings: 38
- booking_passengers: 74
- booking_legs: 46
- payments: 37
- roles: 7
- permissions: 58
- user_roles: 34
- role_permissions: 115

### 0.8 Login Credentials (After Full Seed)

| Email | Password | Role |
|-------|----------|------|
| admin@figas.gov.fk | figas2024! | Super Admin |
| ops@figas.gov.fk | figas2024! | Operations Manager |
| finance@figas.gov.fk | figas2024! | Finance Manager |
| agent@figas.gov.fk | figas2024! | Agent |
| engineer@figas.gov.fk | figas2024! | Engineer |
| pilot@figas.gov.fk | figas2024! | Pilot |

---

### Test Pyramid

```
        /\
       /  \          E2E (Playwright)
      /    \         - Browser tests, full workflows
     /------\
    /        \       Integration (Vitest + Prisma)
   /          \      - DB-dependent, transaction rollback
  /------------\
 /              \    Unit (Vitest)
/----------------\   - Pure functions, no DB, no browser
```

---

## 1. Test Architecture

### Directory Structure

```
tests/
├── unit/                          # Pure function tests (no DB, no browser)
│   ├── scheduling/
│   │   ├── flight-validation.test.ts
│   │   ├── insert-passenger-route.test.ts
│   │   ├── nearest-neighbor.test.ts
│   │   ├── cluster-bookings.test.ts
│   │   └── fuel-planning.test.ts
│   └── utils/
│       ├── dates.test.ts
│       └── form-data.test.ts
├── integration/                   # Tests with DB (via Prisma transaction rollback)
│   ├── scheduling/
│   │   ├── schedule-status-flow.test.ts
│   │   ├── assign-booking.test.ts
│   │   ├── unassign-booking.test.ts
│   │   ├── create-flight-from-booking.test.ts
│   │   ├── auto-build.test.ts
│   │   ├── reorder-flights.test.ts
│   │   ├── permissions.test.ts
│   │   └── error-cases.test.ts
│   └── repositories/
│       ├── schedule.test.ts
│       ├── flight.test.ts
│       └── flight-leg.test.ts
├── e2e/                           # Playwright browser tests
│   ├── scheduling.spec.ts         # (expand existing)
│   ├── bookings.spec.ts
│   ├── checkin.spec.ts
│   ├── finance.spec.ts
│   ├── admin.spec.ts
│   ├── auth.spec.ts
│   └── accessibility.spec.ts
└── fixtures/
    ├── factories.ts               # Test data factories
    ├── seed-data.ts               # Shared seed data
    └── helpers.ts                 # Common test utilities
```

### Test Runner Configuration

Install Vitest and add these scripts to [`package.json`](package.json):

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:accessibility": "playwright test tests/e2e/accessibility.spec.ts",
    "test:all": "vitest run && playwright test"
  }
}
```

**Required packages:**
- `vitest` - unit/integration test runner
- `@playwright/test` - already installed at `^1.60.0`
- `@testing-library/react` - optional, for future component testing
- `axe-playwright` - for accessibility assertions in Playwright

### Vitest Configuration

Create [`vitest.config.ts`](vitest.config.ts) at the project root:

```typescript
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    setupFiles: [],
    testTimeout: 10_000,
  },
});
```

---

## 2. Unit Test Patterns

### 2.1 When to Write Unit Tests

Test pure functions from [`app/utils/scheduling/`](app/utils/scheduling/) that have:
- No database calls
- No browser/UI dependencies
- No async side effects (or easily mockable async)
- Deterministic input to output behavior

### 2.2 Pattern: Testing `validateFlight()`

Source: [`app/utils/scheduling/flight-validation.ts`](app/utils/scheduling/flight-validation.ts)

The `validateFlight()` function is a pure (async) function that validates a flight given passengers, legs, aircraft, and aerodrome data. It returns a [`FlightValidationResult`](app/utils/scheduling/flight-validation.ts:117) with status, per-stop MTOW/MLW checks, fuel requirements, and violation suggestions.

```typescript
// tests/unit/scheduling/flight-validation.test.ts
import { describe, it, expect } from "vitest";
import {
  validateFlight,
  type ValidationPassenger,
  type ValidationLeg,
  type ValidationAircraft,
} from "~/utils/scheduling/flight-validation";

const mockAircraft: ValidationAircraft = {
  type: "BN-2 Islander",
  registration: "VP-FBE",
  seat_count: 8,
  max_takeoff_weight_kg: 2994,
  max_landing_weight_kg: 2844,
  empty_weight_kg: 1620,
  fuel_capacity_kg: 340,
  fuel_burn_rate_kg_per_hour: 68,
  cruise_speed_kt: 140,
  max_range_nm: 700,
};

describe("validateFlight()", () => {
  it("returns ok for a valid single-leg flight", async () => {
    const passengers: ValidationPassenger[] = [
      {
        id: 1, name: "Alice Smith",
        origin_code: "PSY", destination_code: "MPA",
        clothed_weight_kg: 70, baggage_weight_kg: 15,
      },
      {
        id: 2, name: "Bob Jones",
        origin_code: "PSY", destination_code: "MPA",
        clothed_weight_kg: 85, baggage_weight_kg: 20,
      },
    ];

    const legs: ValidationLeg[] = [
      { leg_sequence: 1, origin_code: "PSY", destination_code: "MPA", distance_nm: 135 },
    ];

    const result = await validateFlight(passengers, legs, mockAircraft);

    expect(result.status).toBe("ok");
    expect(result.passenger_count).toBe(2);
    expect(result.seat_count_exceeded).toBe(false);
    expect(result.range_exceeded).toBe(false);
    expect(result.per_stop).toHaveLength(1);
    expect(result.per_stop[0].mtow_status).toBe("ok");
    expect(result.per_stop[0].mlw_status).toBe("ok");
  });

  it("returns violation when seat count is exceeded", async () => {
    const passengers: ValidationPassenger[] = Array.from(
      { length: 10 },
      (_, i) => ({
        id: i + 1,
        name: `Passenger ${i + 1}`,
        origin_code: "PSY",
        destination_code: "MPA",
        clothed_weight_kg: 70,
        baggage_weight_kg: 15,
      })
    );

    const legs: ValidationLeg[] = [
      { leg_sequence: 1, origin_code: "PSY", destination_code: "MPA", distance_nm: 135 },
    ];

    const result = await validateFlight(passengers, legs, mockAircraft);

    expect(result.status).toBe("violation");
    expect(result.seat_count_exceeded).toBe(true);
    expect(result.suggestions.some((s) => s.type === "remove_passenger")).toBe(true);
  });

  it("returns violation when MTOW is exceeded", async () => {
    const passengers: ValidationPassenger[] = Array.from(
      { length: 8 },
      (_, i) => ({
        id: i + 1,
        name: `Heavy Pax ${i + 1}`,
        origin_code: "PSY",
        destination_code: "MPA",
        clothed_weight_kg: 120,
        baggage_weight_kg: 30,
      })
    );

    const legs: ValidationLeg[] = [
      { leg_sequence: 1, origin_code: "PSY", destination_code: "MPA", distance_nm: 135 },
    ];

    const result = await validateFlight(passengers, legs, mockAircraft);

    expect(result.status).toBe("violation");
    expect(result.per_stop[0].mtow_status).toBe("violation");
    expect(result.suggestions.some((s) => s.type === "remove_passenger")).toBe(true);
  });

  it("detects range exceeded", async () => {
    const passengers: ValidationPassenger[] = [
      {
        id: 1, name: "Alice",
        origin_code: "PSY", destination_code: "MPA",
        clothed_weight_kg: 70, baggage_weight_kg: 15,
      },
    ];

    const legs: ValidationLeg[] = [
      { leg_sequence: 1, origin_code: "PSY", destination_code: "MPA", distance_nm: 800 },
    ];

    const result = await validateFlight(passengers, legs, mockAircraft);

    expect(result.range_exceeded).toBe(true);
    expect(result.status).toBe("violation");
  });

  it("applies runway derating for short strips", async () => {
    const passengers: ValidationPassenger[] = [
      {
        id: 1, name: "Alice",
        origin_code: "PSY", destination_code: "SHR",
        clothed_weight_kg: 70, baggage_weight_kg: 15,
      },
    ];

    const legs: ValidationLeg[] = [
      { leg_sequence: 1, origin_code: "PSY", destination_code: "SHR", distance_nm: 80 },
    ];

    const result = await validateFlight(passengers, legs, mockAircraft, {
      aerodromes: [
        {
          code: "SHR",
          mtow_limit_kg: null,
          mlw_limit_kg: null,
          runway_length: 350,
        },
      ],
    });

    expect(result.per_stop[0].runway_derated).toBe(true);
    expect(result.per_stop[0].mtow_kg).toBeLessThan(mockAircraft.max_takeoff_weight_kg);
  });
});
```

### 2.3 Pattern: Testing `insertPassengerRoute()`

Source: [`app/utils/scheduling/insert-passenger-route.ts`](app/utils/scheduling/insert-passenger-route.ts)

```typescript
// tests/unit/scheduling/insert-passenger-route.test.ts
import { describe, it, expect } from "vitest";
import { insertPassengerRoute, type RouteLeg } from "~/utils/scheduling/insert-passenger-route";

describe("insertPassengerRoute()", () => {
  const existingLegs: RouteLeg[] = [
    { leg_sequence: 1, origin_code: "PSY", destination_code: "MPA" },
    { leg_sequence: 2, origin_code: "MPA", destination_code: "PSY" },
  ];

  it("returns already_on_route when both stops exist consecutively", async () => {
    const result = await insertPassengerRoute(existingLegs, "PSY", "MPA");
    expect(result.inserted).toBe(false);
    expect(result.reason).toBe("already_on_route");
  });

  it("inserts destination when origin exists but destination does not", async () => {
    const result = await insertPassengerRoute(existingLegs, "MPA", "SHR");
    expect(result.inserted).toBe(true);
    expect(result.reason).toBe("destination_exists");
    expect(result.legs.length).toBeGreaterThanOrEqual(2);
  });

  it("inserts origin when destination exists but origin does not", async () => {
    const result = await insertPassengerRoute(existingLegs, "SHR", "PSY");
    expect(result.inserted).toBe(true);
    expect(result.reason).toBe("origin_exists");
  });

  it("inserts both stops when neither exists", async () => {
    const result = await insertPassengerRoute(existingLegs, "SHR", "PPS");
    expect(result.inserted).toBe(true);
    expect(result.reason).toBe("both_inserted");
  });

  it("returns invalid when origin equals destination", async () => {
    const result = await insertPassengerRoute(existingLegs, "PSY", "PSY");
    expect(result.inserted).toBe(false);
    expect(result.reason).toBe("invalid");
  });
});
```

### 2.4 Pattern: Testing `computeFuelPlan()`

Source: [`app/utils/scheduling/fuel-planning.ts`](app/utils/scheduling/fuel-planning.ts)

```typescript
// tests/unit/scheduling/fuel-planning.test.ts
import { describe, it, expect } from "vitest";
import { computeFlightTime } from "~/utils/scheduling/fuel-planning";

describe("computeFlightTime()", () => {
  it("computes flight time for a known distance", () => {
    const time = computeFlightTime(135, 140, 5);
    expect(time).toBeGreaterThan(0);
    expect(time).toBe(63);
  });

  it("returns 0 for zero distance", () => {
    expect(computeFlightTime(0, 140)).toBe(0);
  });

  it("returns 0 for zero cruise speed", () => {
    expect(computeFlightTime(100, 0)).toBe(0);
  });
});
```

### 2.5 Pattern: Testing `clusterBookings()`

Source: [`app/utils/scheduling/cluster-bookings.ts`](app/utils/scheduling/cluster-bookings.ts)

This function queries the database, so in unit tests you should mock the repository layer:

```typescript
// tests/unit/scheduling/cluster-bookings.test.ts
import { describe, it, expect, vi } from "vitest";
import { clusterBookings } from "~/utils/scheduling/cluster-bookings";

vi.mock("~/utils/repositories/booking-leg", () => ({
  bookingLegRepository: {
    findUnassignedLegs: vi.fn(),
  },
}));

vi.mock("~/utils/repositories/booking-leg-passenger", () => ({
  bookingLegPassengerRepository: {
    findByLegId: vi.fn(),
  },
}));

import { bookingLegRepository } from "~/utils/repositories/booking-leg";
import { bookingLegPassengerRepository } from "~/utils/repositories/booking-leg-passenger";

describe("clusterBookings()", () => {
  it("groups legs by date, origin, and destination", async () => {
    vi.mocked(bookingLegRepository.findUnassignedLegs).mockResolvedValue([
      { id: 1, booking_id: 1, origin_code: "PSY", destination_code: "MPA", leg_date: "2026-06-15", leg_sequence: 1, status: "pending", flight_id: null },
      { id: 2, booking_id: 2, origin_code: "PSY", destination_code: "MPA", leg_date: "2026-06-15", leg_sequence: 1, status: "pending", flight_id: null },
      { id: 3, booking_id: 3, origin_code: "PSY", destination_code: "SHR", leg_date: "2026-06-15", leg_sequence: 1, status: "pending", flight_id: null },
    ]);

    vi.mocked(bookingLegPassengerRepository.findByLegId).mockResolvedValue([{ id: 1 }]);

    const clusters = await clusterBookings();

    expect(clusters).toHaveLength(2);
    expect(clusters[0].origin).toBe("PSY");
    expect(clusters[0].destination).toBe("MPA");
    expect(clusters[0].legs).toHaveLength(2);
    expect(clusters[1].destination).toBe("SHR");
  });
});
```

---

## 3. Integration Test Patterns

### 3.1 When to Write Integration Tests

Test Remix loaders and actions from [`app/routes/operations.schedule._index.tsx`](app/routes/operations.schedule._index.tsx) and handlers from [`app/utils/schedule-handlers.server.ts`](app/utils/schedule-handlers.server.ts) that:
- Query or mutate the database via Prisma
- Enforce permissions via [`requirePermission()`](app/utils/permissions.server.ts:46) or [`hasPermission()`](app/utils/permissions.server.ts:135)
- Implement business logic with side effects (status transitions, audit fields)
- Use the `intent` field pattern for action multiplexing

### 3.2 Prisma Transaction Rollback Pattern

Use Prisma's `$transaction` with a rollback strategy to keep tests isolated without cleanup:

```typescript
// tests/integration/helpers.ts
import { db } from "~/utils/db.server";

export async function withRollback<T>(fn: (tx: typeof db) => Promise<T>): Promise<T> {
  await db.$executeRawUnsafe("SAVEPOINT test_savepoint");
  try {
    const result = await fn(db);
    return result;
  } finally {
    await db.$executeRawUnsafe("ROLLBACK TO SAVEPOINT test_savepoint");
  }
}
```

### 3.3 Pattern: Testing Schedule Status Flow

Source: [`app/utils/schedule-handlers.server.ts`](app/utils/schedule-handlers.server.ts)

```typescript
// tests/integration/scheduling/schedule-status-flow.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { db } from "~/utils/db.server";
import { scheduleRepository } from "~/utils/repositories/schedule";
import {
  handleApprove,
  handleRevise,
  handlePublish,
  handleCancel,
} from "~/utils/schedule-handlers.server";
import { withRollback } from "../helpers";

describe("Schedule Status Flow", () => {
  let testUserId: number;

  beforeAll(async () => {
    testUserId = 1;
  });

  it("creates a schedule in draft status", async () => {
    await withRollback(async (tx) => {
      const schedule = await scheduleRepository.create({
        schedule_date: "2026-07-01",
        created_by: testUserId,
      });
      expect(schedule.status).toBe("draft");
    });
  });

  it("fails to approve a schedule with no flights", async () => {
    await withRollback(async (tx) => {
      const schedule = await scheduleRepository.create({
        schedule_date: "2026-07-02",
        created_by: testUserId,
      });
      const result = await handleApprove(schedule.id, testUserId);
      expect(result.error).toBeDefined();
      expect(result.status).toBe(400);
    });
  });

  it("approves a schedule with flights and bookings", async () => {
    await withRollback(async (tx) => {
      const schedule = await scheduleRepository.create({
        schedule_date: "2026-07-03",
        created_by: testUserId,
      });
      const flight = await tx.flights.create({
        data: {
          flight_number: `TST${Date.now()}`,
          schedule_id: schedule.id,
          origin_aerodrome_id: 1,
          destination_aerodrome_id: 2,
          departure_time: new Date(),
          arrival_time: new Date(),
          status: "scheduled",
        },
      });
      await tx.booking_legs.create({
        data: {
          booking_id: 1,
          flight_id: flight.id,
          origin_code: "PSY",
          destination_code: "MPA",
          leg_date: new Date("2026-07-03"),
          leg_sequence: 1,
        },
      });
      await scheduleRepository.updateStatus(schedule.id, "building" as any);
      const result = await handleApprove(schedule.id, testUserId);
      expect(result.success).toBe(true);
      const updated = await scheduleRepository.findById(schedule.id);
      expect(updated?.status).toBe("approved");
      expect(updated?.approved_by).toBe(testUserId);
      expect(updated?.approved_at).toBeTruthy();
    });
  });

  it("publishes an approved schedule", async () => {
    await withRollback(async (tx) => {
      const schedule = await scheduleRepository.create({
        schedule_date: "2026-07-04",
        created_by: testUserId,
      });
      const flight = await tx.flights.create({
        data: {
          flight_number: `TST${Date.now()}`,
          schedule_id: schedule.id,
          origin_aerodrome_id: 1,
          destination_aerodrome_id: 2,
          departure_time: new Date(),
          arrival_time: new Date(),
          status: "scheduled",
        },
      });
      await tx.pilot_assignments.create({
        data: {
          flight_id: flight.id,
          pilot_id: 1,
          role: "captain",
          schedule_id: schedule.id,
          assigned_by: testUserId,
        },
      });
      await scheduleRepository.updateStatus(schedule.id, "approved" as any);
      const result = await handlePublish(schedule.id, testUserId);
      expect(result.success).toBe(true);
      const updated = await scheduleRepository.findById(schedule.id);
      expect(updated?.status).toBe("published");
    });
  });

  it("revises a published schedule back to draft", async () => {
    await withRollback(async (tx) => {
      const schedule = await scheduleRepository.create({
        schedule_date: "2026-07-05",
        created_by: testUserId,
      });
      await scheduleRepository.updateStatus(schedule.id, "published" as any, {
        published_by: testUserId,
      });
      const result = await handleRevise(schedule.id);
      expect(result.success).toBe(true);
      const updated = await scheduleRepository.findById(schedule.id);
      expect(updated?.status).toBe("draft");
      expect(updated?.approved_by).toBeNull();
      expect(updated?.published_by).toBeNull();
    });
  });

  it("cancels a building schedule", async () => {
    await withRollback(async (tx) => {
      const schedule = await scheduleRepository.create({
        schedule_date: "2026-07-06",
        created_by: testUserId,
      });
      const result = await handleCancel(schedule.id, testUserId, "Test cancellation");
      expect(result.success).toBe(true);
      const updated = await scheduleRepository.findById(schedule.id);
      expect(updated?.status).toBe("cancelled");
      expect(updated?.cancellation_reason).toBe("Test cancellation");
    });
  });

  it("fails to cancel an already cancelled schedule", async () => {
    await withRollback(async (tx) => {
      const schedule = await scheduleRepository.create({
        schedule_date: "2026-07-07",
        created_by: testUserId,
      });
      await scheduleRepository.updateStatus(schedule.id, "cancelled" as any, {
        cancelled_by: testUserId,
        cancellation_reason: "First cancel",
      });
      const result = await handleCancel(schedule.id, testUserId, "Second cancel");
      expect(result.error).toBeDefined();
      expect(result.status).toBe(400);
    });
  });

  it("fails to publish a non-approved schedule", async () => {
    await withRollback(async (tx) => {
      const schedule = await scheduleRepository.create({
        schedule_date: "2026-07-08",
        created_by: testUserId,
      });
      const result = await handlePublish(schedule.id, testUserId);
      expect(result.error).toBeDefined();
      expect(result.status).toBe(400);
    });
  });

  it("fails to revise a non-published schedule", async () => {
    await withRollback(async (tx) => {
      const schedule = await scheduleRepository.create({
        schedule_date: "2026-07-09",
        created_by: testUserId,
      });
      const result = await handleRevise(schedule.id);
      expect(result.error).toBeDefined();
      expect(result.status).toBe(400);
    });
  });
});
```

### 3.4 Pattern: Testing `handleAssignBooking()`

Source: [`app/utils/schedule-handlers.server.ts:268`](app/utils/schedule-handlers.server.ts:268)

```typescript
// tests/integration/scheduling/assign-booking.test.ts
import { describe, it, expect } from "vitest";
import { handleAssignBooking } from "~/utils/schedule-handlers.server";
import { withRollback } from "../helpers";

describe("handleAssignBooking()", () => {
  it("assigns a booking leg to a flight", async () => {
    await withRollback(async (tx) => {
      const schedule = await tx.schedules.create({
        data: {
          schedule_date: new Date("2026-07-15"),
          created_by: 1,
          status: "draft",
        },
      });
      const flight = await tx.flights.create({
        data: {
          flight_number: `TST${Date.now()}`,
          schedule_id: schedule.id,
          origin_aerodrome_id: 1,
          destination_aerodrome_id: 2,
          departure_time: new Date(),
          arrival_time: new Date(),
          status: "scheduled",
        },
      });
      const bookingLeg = await tx.booking_legs.create({
        data: {
          booking_id: 1,
          origin_code: "PSY",
          destination_code: "MPA",
          leg_date: new Date("2026-07-15"),
          leg_sequence: 1,
        },
      });
      const result = await handleAssignBooking(bookingLeg.id, flight.id);
      expect(result.success).toBe(true);
      const updated = await tx.booking_legs.findUnique({
        where: { id: bookingLeg.id },
      });
      expect(updated?.flight_id).toBe(flight.id);
    });
  });

  it("returns error for non-existent booking leg", async () => {
    const result = await handleAssignBooking(99999, 1);
    expect(result.error).toBeDefined();
    expect(result.status).toBe(404);
  });
});
```

### 3.5 Pattern: Testing Permission Enforcement

Source: [`app/utils/permissions.server.ts`](app/utils/permissions.server.ts) and [`app/routes/operations.schedule._index.tsx:265`](app/routes/operations.schedule._index.tsx:265)

```typescript
// tests/integration/scheduling/permissions.test.ts
import { describe, it, expect } from "vitest";
import { hasPermission, requirePermission } from "~/utils/permissions.server";
import { Permission } from "~/utils/constants";

describe("Schedule Action Permissions", () => {
  const opsUserId = 1;
  const adminUserId = 2;

  it("ops user has schedule:create permission", async () => {
    const permitted = await hasPermission(opsUserId, Permission.SCHEDULE_CREATE);
    expect(permitted).toBe(true);
  });

  it("ops user does NOT have schedule:approve permission", async () => {
    const permitted = await hasPermission(opsUserId, Permission.SCHEDULE_APPROVE);
    expect(permitted).toBe(false);
  });

  it("admin user has schedule:approve permission", async () => {
    const permitted = await hasPermission(adminUserId, Permission.SCHEDULE_APPROVE);
    expect(permitted).toBe(true);
  });

  it("requirePermission throws redirect for unauthorized user", async () => {
    const request = new Request("http://localhost:5173/operations/schedule");
    await expect(
      requirePermission(request, Permission.SCHEDULE_APPROVE)
    ).rejects.toThrow();
  });
});
```

---

## 4. E2E Test Patterns

### 4.1 When to Write E2E Tests

Test complete user workflows through the browser using Playwright. The existing auth setup at [`tests/e2e/global-setup.ts`](tests/e2e/global-setup.ts) logs in as `ops@figas.gov.fk` and saves the session state.

### 4.2 Page Object Model Pattern

```typescript
// tests/e2e/pages/schedule-page.ts
import { type Page, type Locator, expect } from "@playwright/test";

export class SchedulePage {
  readonly page: Page;
  readonly datePickerButton: Locator;
  readonly unassignedHeading: Locator;
  readonly draggableItems: Locator;
  readonly scheduleBoard: Locator;

  constructor(page: Page) {
    this.page = page;
    this.datePickerButton = page.locator("button:has(svg)").first();
    this.unassignedHeading = page.getByRole("heading", { name: "Unassign Pool" });
    this.draggableItems = page.locator('[draggable="true"]');
    this.scheduleBoard = page.locator('[data-testid="schedule-board"]');
  }

  async goto(date?: string) {
    const url = date
      ? `/operations/schedule?date=${date}`
      : "/operations/schedule";
    await this.page.goto(url);
    await this.page.waitForLoadState("networkidle");
  }

  async getUnassignedBookingCount(): Promise<number> {
    return this.draggableItems.count();
  }

  async selectDate(day: string) {
    await this.datePickerButton.click();
    await this.page.waitForTimeout(500);
    const dayButton = this.page.locator(`button:not([aria-label]) >> text=/^${day}$/`).first();
    if (await dayButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await dayButton.click();
    }
    await this.page.waitForLoadState("networkidle");
  }

  async expectNoErrors() {
    const errorText = this.page.locator("text=Internal Server Error");
    await expect(errorText).toHaveCount(0);
  }

  async expectEmptyState() {
    const body = this.page.locator("body");
    await expect(body).toContainText(/no schedule|No schedule|No flights|no flights/i);
  }
}
```

### 4.3 Pattern: Testing Schedule Page

Source: [`tests/e2e/scheduling.spec.ts`](tests/e2e/scheduling.spec.ts) (expand existing)

```typescript
// tests/e2e/scheduling.spec.ts
import { test, expect } from "@playwright/test";
import { SchedulePage } from "./pages/schedule-page";

test.describe("Schedule Builder", () => {
  let schedulePage: SchedulePage;

  test.beforeEach(async ({ page }) => {
    schedulePage = new SchedulePage(page);
    await schedulePage.goto();
  });

  test("should display the DatePicker component", async () => {
    await expect(schedulePage.datePickerButton.first()).toBeVisible({ timeout: 10_000 });
  });

  test("should display unassigned bookings for today", async () => {
    await expect(schedulePage.unassignedHeading).toBeVisible({ timeout: 10_000 });
    await schedulePage.expectNoErrors();
  });

  test("should update bookings when date is changed", async ({ page }) => {
    const initialCount = await schedulePage.getUnassignedBookingCount();
    await schedulePage.selectDate("15");
    const newCount = await schedulePage.getUnassignedBookingCount();
    console.log(`Bookings: ${initialCount} -> ${newCount}`);
    await schedulePage.expectNoErrors();
  });

  test("should show empty state for future date with no schedule", async ({ page }) => {
    await schedulePage.goto("2030-12-25");
    await schedulePage.expectEmptyState();
  });

  test("should navigate between dates and maintain URL state", async ({ page }) => {
    const testDate = "2026-06-15";
    await schedulePage.goto(testDate);
    expect(page.url()).toContain(`date=${testDate}`);
    await schedulePage.expectNoErrors();
  });

  test("should display flight cards when schedule exists", async ({ page }) => {
    await schedulePage.goto("2026-06-01");
    await schedulePage.expectNoErrors();
    const flightCards = page.locator('[data-testid="flight-card"]');
    const count = await flightCards.count();
    console.log(`Flight cards found: ${count}`);
    if (count > 0) {
      await expect(flightCards.first()).toBeVisible();
    }
  });

  test("should auto-build flights from unassigned bookings", async ({ page }) => {
    const autoBuildBtn = page.getByRole("button", { name: /auto.?build/i });
    if (await autoBuildBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await autoBuildBtn.click();
      await page.waitForLoadState("networkidle");
      await schedulePage.expectNoErrors();
    }
  });

  test("should approve a schedule", async ({ page }) => {
    const approveBtn = page.getByRole("button", { name: /approve/i });
    if (await approveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await approveBtn.click();
      await page.waitForLoadState("networkidle");
      await schedulePage.expectNoErrors();
    }
  });
});
```

### 4.4 Pattern: Simulating Drag-and-Drop

Since Playwright's native drag-and-drop is limited with `@dnd-kit`, use pointer event simulation:

```typescript
// tests/e2e/helpers/drag-simulator.ts
import { type Page } from "@playwright/test";

export async function simulateDragDrop(
  page: Page,
  dragSelector: string,
  dropSelector: string
) {
  const dragEl = page.locator(dragSelector).first();
  const dropEl = page.locator(dropSelector).first();
  const dragBox = await dragEl.boundingBox();
  const dropBox = await dropEl.boundingBox();

  if (!dragBox || !dropBox) {
    throw new Error("Could not find bounding boxes for drag or drop elements");
  }

  await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
  await page.mouse.down();

  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      dragBox.x + dragBox.width / 2 + (dropBox.x - dragBox.x) * (i / steps),
      dragBox.y + dragBox.height / 2 + (dropBox.y - dragBox.y) * (i / steps),
    );
    await page.waitForTimeout(30);
  }

  await page.mouse.up();
  await page.waitForLoadState("networkidle");
}

export async function dragBookingToFlight(
  page: Page,
  bookingLegId: number,
  flightId: number
) {
  await simulateDragDrop(
    page,
    `[data-testid="booking-item-${bookingLegId}"]`,
    `[data-testid="flight-drop-zone-${flightId}"]`,
  );
}

export async function dragBookingToDraftFlight(
  page: Page,
  bookingLegId: number
) {
  await simulateDragDrop(
    page,
    `[data-testid="booking-item-${bookingLegId}"]`,
    '[data-testid="draft-flight-placeholder"]',
  );
}
```

Usage in E2E tests:

```typescript
// tests/e2e/scheduling.spec.ts (additional tests)
import { dragBookingToFlight, dragBookingToDraftFlight } from "./helpers/drag-simulator";

test.describe("Schedule Builder - Drag and Drop", () => {
  test("should assign a booking to a flight via drag-and-drop", async ({ page }) => {
    const schedulePage = new SchedulePage(page);
    await schedulePage.goto("2026-06-01");

    const initialCount = await schedulePage.getUnassignedBookingCount();
    expect(initialCount).toBeGreaterThan(0);

    const firstBookingId = await page.locator('[data-testid^="booking-item-"]')
      .first().getAttribute("data-testid")
      .then((id) => Number(id?.replace("booking-item-", "")));

    const firstFlightId = await page.locator('[data-testid^="flight-drop-zone-"]')
      .first().getAttribute("data-testid")
      .then((id) => Number(id?.replace("flight-drop-zone-", "")));

    if (firstBookingId && firstFlightId) {
      await dragBookingToFlight(page, firstBookingId, firstFlightId);
      await schedulePage.expectNoErrors();
    }
  });

  test("should create a new flight by dragging to draft placeholder", async ({ page }) => {
    const schedulePage = new SchedulePage(page);
    await schedulePage.goto("2026-06-01");

    const firstBookingId = await page.locator('[data-testid^="booking-item-"]')
      .first().getAttribute("data-testid")
      .then((id) => Number(id?.replace("booking-item-", "")));

    if (firstBookingId) {
      await dragBookingToDraftFlight(page, firstBookingId);
      await schedulePage.expectNoErrors();
    }
  });
});

---

## 5. Accessibility Test Patterns

### 5.1 When to Write Accessibility Tests

Test that the scheduling UI meets WCAG 2.1 AA standards. Use `axe-playwright` to run automated accessibility scans within Playwright tests.

### 5.2 Required Packages

```bash
npm install -D axe-playwright @axe-core/playwright
```

### 5.3 Pattern: Accessibility Scan on Schedule Page

```typescript
// tests/e2e/accessibility.spec.ts
import { test, expect } from "@playwright/test";
import { injectAxe, checkA11y } from "axe-playwright";
import { SchedulePage } from "./pages/schedule-page";

test.describe("Schedule Page Accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await injectAxe(page);
  });

  test("schedule page has no critical accessibility violations", async ({ page }) => {
    const schedulePage = new SchedulePage(page);
    await schedulePage.goto("2026-06-01");
    await page.waitForLoadState("networkidle");

    const results = await checkA11y(page, null, {
      detailedReport: true,
      axeOptions: {
        runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
    });

    expect(results.violations.filter((v) => v.impact === "critical")).toHaveLength(0);
  });

  test("drag-and-drop interactions are keyboard accessible", async ({ page }) => {
    const schedulePage = new SchedulePage(page);
    await schedulePage.goto("2026-06-01");
    await page.waitForLoadState("networkidle");

    const firstDraggable = page.locator('[draggable="true"]').first();
    await firstDraggable.focus();
    await expect(firstDraggable).toBeFocused();

    await expect(firstDraggable).toHaveAttribute("role", /button|listitem/);
    await expect(firstDraggable).toHaveAttribute("aria-grabbed", /true|false/);
  });

  test("date picker is keyboard navigable", async ({ page }) => {
    const schedulePage = new SchedulePage(page);
    await schedulePage.goto();
    await page.waitForLoadState("networkidle");

    await schedulePage.datePickerButton.focus();
    await expect(schedulePage.datePickerButton).toBeFocused();

    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);

    const calendar = page.locator('[role="dialog"], [role="grid"]').first();
    await expect(calendar).toBeVisible({ timeout: 3000 });
  });
});
```

### 5.4 Pattern: Color Contrast and Focus Indicators

```typescript
// tests/e2e/accessibility.spec.ts (continued)
test.describe("Visual Accessibility", () => {
  test("focus indicators are visible on all interactive elements", async ({ page }) => {
    const schedulePage = new SchedulePage(page);
    await schedulePage.goto("2026-06-01");
    await page.waitForLoadState("networkidle");

    const interactiveElements = page.locator(
      'button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const count = await interactiveElements.count();

    for (let i = 0; i < Math.min(count, 20); i++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(100);

      const focused = page.locator("*:focus");
      if (await focused.isVisible().catch(() => false)) {
        const outline = await focused.evaluate((el) => {
          const style = window.getComputedStyle(el);
          return {
            outlineStyle: style.outlineStyle,
            outlineWidth: style.outlineWidth,
            boxShadow: style.boxShadow,
          };
        });
        const hasVisibleFocus =
          (outline.outlineStyle !== "none" && parseInt(outline.outlineWidth) > 0) ||
          (outline.boxShadow && outline.boxShadow !== "none");
        expect(hasVisibleFocus).toBe(true);
      }
    }
  });
});
```

---

## 6. Test Data Fixtures and Factories

### 6.1 Factory Functions

Create reusable factory functions in [`tests/fixtures/factories.ts`](tests/fixtures/factories.ts) to reduce boilerplate in tests:

```typescript
// tests/fixtures/factories.ts
import { db } from "~/utils/db.server";
import type { ScheduleRow } from "~/utils/repositories/schedule";
import type { BookingLegRow } from "~/utils/repositories/booking-leg";

// -- Schedule -------------------------------------------------

export async function createTestSchedule(overrides: Partial<ScheduleRow> = {}) {
  return db.schedules.create({
    data: {
      schedule_date: overrides.schedule_date ?? new Date("2026-07-01"),
      created_by: overrides.created_by ?? 1,
      status: overrides.status ?? "draft",
      ...overrides,
    },
  });
}

// -- Flight ---------------------------------------------------

export async function createTestFlight(
  scheduleId: number,
  overrides: Partial<{
    flight_number: string;
    origin_aerodrome_id: number;
    destination_aerodrome_id: number;
    departure_time: Date;
    arrival_time: Date;
    status: string;
  }> = {}
) {
  return db.flights.create({
    data: {
      flight_number: overrides.flight_number ?? `TST${Date.now()}`,
      schedule_id: scheduleId,
      origin_aerodrome_id: overrides.origin_aerodrome_id ?? 1,
      destination_aerodrome_id: overrides.destination_aerodrome_id ?? 2,
      departure_time: overrides.departure_time ?? new Date(),
      arrival_time: overrides.arrival_time ?? new Date(),
      status: overrides.status ?? "scheduled",
    },
  });
}

// -- Flight Leg -----------------------------------------------

export async function createTestFlightLeg(
  flightId: number,
  overrides: Partial<{
    leg_sequence: number;
    origin_code: string;
    destination_code: string;
    distance_nm: number;
  }> = {}
) {
  return db.flight_legs.create({
    data: {
      flight_id: flightId,
      leg_sequence: overrides.leg_sequence ?? 1,
      origin_code: overrides.origin_code ?? "PSY",
      destination_code: overrides.destination_code ?? "MPA",
      distance_nm: overrides.distance_nm ?? 135,
    },
  });
}

// -- Booking Leg ----------------------------------------------

export async function createTestBookingLeg(
  overrides: Partial<BookingLegRow> & { booking_id: number } = {} as any
) {
  return db.booking_legs.create({
    data: {
      booking_id: overrides.booking_id,
      origin_code: overrides.origin_code ?? "PSY",
      destination_code: overrides.destination_code ?? "MPA",
      leg_date: overrides.leg_date ?? new Date("2026-07-01"),
      leg_sequence: overrides.leg_sequence ?? 1,
      status: overrides.status ?? "pending",
      flight_id: overrides.flight_id ?? null,
    },
  });
}

// -- Pilot Assignment -----------------------------------------

export async function createTestPilotAssignment(
  flightId: number,
  scheduleId: number,
  overrides: Partial<{
    pilot_id: number;
    role: string;
    assigned_by: number;
  }> = {}
) {
  return db.pilot_assignments.create({
    data: {
      flight_id: flightId,
      pilot_id: overrides.pilot_id ?? 1,
      role: overrides.role ?? "captain",
      schedule_id: scheduleId,
      assigned_by: overrides.assigned_by ?? 1,
    },
  });
}

// -- Weight Balance Snapshot ----------------------------------

export async function createTestWeightBalance(
  flightId: number,
  overrides: Partial<{
    total_passenger_weight_kg: number;
    total_baggage_weight_kg: number;
    fuel_weight_kg: number;
    empty_weight_kg: number;
    calculated_takeoff_weight_kg: number;
    calculated_landing_weight_kg: number;
    status: string;
  }> = {}
) {
  return db.weight_balance_snapshots.create({
    data: {
      flight_id: flightId,
      total_passenger_weight_kg: overrides.total_passenger_weight_kg ?? 560,
      total_baggage_weight_kg: overrides.total_baggage_weight_kg ?? 120,
      fuel_weight_kg: overrides.fuel_weight_kg ?? 200,
      empty_weight_kg: overrides.empty_weight_kg ?? 1620,
      calculated_takeoff_weight_kg: overrides.calculated_takeoff_weight_kg ?? 2500,
      calculated_landing_weight_kg: overrides.calculated_landing_weight_kg ?? 2400,
      status: overrides.status ?? "within_limits",
    },
  });
}
```

### 6.2 Usage in Integration Tests

```typescript
// tests/integration/scheduling/auto-build.test.ts
import { describe, it, expect } from "vitest";
import { handleAutoBuild } from "~/utils/schedule-handlers.server";
import { withRollback } from "../helpers";
import {
  createTestSchedule,
  createTestBookingLeg,
} from "../../fixtures/factories";

describe("handleAutoBuild()", () => {
  it("creates flights from unassigned bookings", async () => {
    await withRollback(async (tx) => {
      const schedule = await createTestSchedule({
        schedule_date: new Date("2026-07-15"),
        status: "draft",
      });

      await createTestBookingLeg({
        booking_id: 1,
        origin_code: "PSY",
        destination_code: "MPA",
        leg_date: new Date("2026-07-15"),
        flight_id: null,
      });
      await createTestBookingLeg({
        booking_id: 2,
        origin_code: "PSY",
        destination_code: "MPA",
        leg_date: new Date("2026-07-15"),
        flight_id: null,
      });

      const result = await handleAutoBuild("2026-07-15", 1);
      expect(result.success).toBe(true);
    });
  });
});
```

---

## 7. 49 Test Case Mapping

The following table maps all 49 test cases from the [implementation plan](plans/scheduling-implementation-plan.md) to specific test files. Use this as a checklist during implementation.

### 7.1 Schedule Status Flow (12 tests)

File: [`tests/integration/scheduling/schedule-status-flow.test.ts`](tests/integration/scheduling/schedule-status-flow.test.ts)

| # | Test Case | Type | Verification |
|---|-----------|------|-------------|
| 1 | Create a schedule in draft status | Integration | `schedule.status === "draft"` |
| 2 | Approve schedule with no flights fails with 400 | Integration | `result.error` defined, `result.status === 400` |
| 3 | Create flights with bookings, then approve succeeds | Integration | `result.success === true`, status becomes `approved` |
| 4 | Publish an approved schedule succeeds | Integration | `result.success === true`, status becomes `published` |
| 5 | Revise a published schedule reverts to draft | Integration | `result.success === true`, status becomes `draft` |
| 6 | Approve the revised schedule succeeds | Integration | `result.success === true` |
| 7 | Cancel the approved schedule succeeds | Integration | `result.success === true`, status becomes `cancelled` |
| 8 | Cancel a cancelled schedule fails with 400 | Integration | `result.error` defined, `result.status === 400` |
| 9 | Approve a cancelled schedule fails with 400 | Integration | `result.error` defined, `result.status === 400` |
| 10 | Cancel a building schedule succeeds | Integration | `result.success === true` |
| 11 | Publish a non-approved schedule fails with 400 | Integration | `result.error` defined, `result.status === 400` |
| 12 | Revise a non-published schedule fails with 400 | Integration | `result.error` defined, `result.status === 400` |

### 7.2 Drag-and-Drop Assignment (6 tests)

File: [`tests/e2e/scheduling.spec.ts`](tests/e2e/scheduling.spec.ts) (DnD section)

| # | Test Case | Type | Verification |
|---|-----------|------|-------------|
| 13 | Drag unassigned booking onto existing flight | E2E | Booking appears in flight manifest |
| 14 | Drag unassigned booking onto Draft Flight placeholder | E2E | New flight created with booking |
| 15 | Reorder flights by dragging | E2E | `sort_order` updated in DB |
| 16 | Drag booking to flight on no-fly day fails | Integration | Error toast displayed |
| 17 | Network error during assignment rolls back | Integration | Booking returns to unassigned pool |
| 18 | Drag already-assigned booking moves it | Integration | Booking unassigned from old flight, assigned to new |

### 7.3 Auto-Build (8 tests)

File: [`tests/integration/scheduling/auto-build.test.ts`](tests/integration/scheduling/auto-build.test.ts)

| # | Test Case | Type | Verification |
|---|-----------|------|-------------|
| 19 | Auto-build with no bookings creates 0 flights | Integration | Schedule exists with 0 flights |
| 20 | Auto-build with 10+ bookings creates flights | Integration | Flights created, clustered by route |
| 21 | Auto-build on no-fly day fails | Integration | Error returned |
| 22 | Auto-build with insufficient aircraft warns | Integration | Validation warnings, flights still created |
| 23 | Auto-build with available pilots assigns them | Integration | Pilots assigned to flights |
| 24 | Auto-build with no pilots creates flights without | Integration | Flights created, warning logged |
| 25 | Weight balance snapshots created per flight | Integration | `weight_balance_snapshots` records exist |
| 26 | Flight legs created with correct stop sequences | Integration | `flight_legs` records match route |

### 7.4 Unassignment (5 tests)

File: [`tests/integration/scheduling/unassign-booking.test.ts`](tests/integration/scheduling/unassign-booking.test.ts)

| # | Test Case | Type | Verification |
|---|-----------|------|-------------|
| 27 | Unassign booking from multi-booking flight | Integration | Booking removed, flight remains |
| 28 | Unassign last booking deletes flight | Integration | Flight deleted (empty cleanup) |
| 29 | Unassign on no-fly day fails | Integration | Error returned |
| 30 | Unassign from approved schedule fails | Integration | Error returned |
| 31 | Unassign unassigned booking fails with 400 | Integration | `result.status === 400` |

### 7.5 Permissions (8 tests)

File: [`tests/integration/scheduling/permissions.test.ts`](tests/integration/scheduling/permissions.test.ts)

| # | Test Case | Type | Verification |
|---|-----------|------|-------------|
| 32 | Auto-build without permission returns 403 | Integration | `result.status === 403` |
| 33 | Approve without permission returns 403 | Integration | `result.status === 403` |
| 34 | Publish without permission returns 403 | Integration | `result.status === 403` |
| 35 | Cancel without permission returns 403 | Integration | `result.status === 403` |
| 36 | Create flight without permission returns 403 | Integration | `result.status === 403` |
| 37 | Assign booking without permission returns 403 | Integration | `result.status === 403` |
| 38 | Unassign booking without permission returns 403 | Integration | `result.status === 403` |
| 39 | Assign pilot without permission returns 403 | Integration | `result.status === 403` |

### 7.6 Error and Edge Cases (10 tests)

File: [`tests/integration/scheduling/error-cases.test.ts`](tests/integration/scheduling/error-cases.test.ts)

| # | Test Case | Type | Verification |
|---|-----------|------|-------------|
| 40 | Unknown intent returns 400 | Integration | `result.status === 400` |
| 41 | Missing required parameters returns 400 | Integration | `result.status === 400` |
| 42 | Assign to non-existent flight returns 404 | Integration | `result.status === 404` |
| 43 | Assign non-existent booking leg returns 404 | Integration | `result.status === 404` |
| 44 | Create flight on non-existent schedule returns 404 | Integration | `result.status === 404` |
| 45 | Race condition: simultaneous assignment fails second | Integration | Second call returns conflict error |
| 46 | Network error rolls back optimistic update | Integration | State reverts, toast shown |
| 47 | Loader failure shows error boundary | E2E | Error boundary renders friendly message |
| 48 | Past date auto-build works | Integration | Historical schedules build successfully |
| 49 | Far future date auto-build returns 0 bookings | Integration | Schedule created, 0 flights |

---

## 8. .windsurfrules Integration

### 8.1 Registering This Skill

Add the following entry to the skills section of [`.windsurfrules`](.windsurfrules) to make this skill available to AI agents:

```yaml
- name: figas-test-automation
  description: Comprehensive testing patterns for the FIGAS flight scheduling Remix application
  path: .agents/skills/figas-test-automation/SKILL.md
  globs:
    - "tests/**/*.test.ts"
    - "tests/**/*.spec.ts"
    - "tests/e2e/**/*.ts"
    - "vitest.config.*"
    - "playwright.config.*"
```

### 8.2 Skill Precedence

This skill should be loaded when the agent is working with test files. The existing skills in `.windsurfrules` cover:

| Skill | When to Load |
|-------|-------------|
| `remix-route-patterns` | When creating/modifying route files in `app/routes/` |
| `prisma-repository-pattern` | When working with Prisma schema or repository files |
| `pbac-auth-audit` | When implementing permission checks or audit logging |
| `figas-test-automation` | **When writing or modifying test files** |

### 8.3 Cross-Skill Dependencies

When writing tests, you may need to reference patterns from other skills:

- **Route patterns** (for loader/action mocking): See [`remix-route-patterns`](../../.agents/skills/remix-route-patterns/SKILL.md)
- **Repository patterns** (for mocking Prisma calls): See [`prisma-repository-pattern`](../../.agents/skills/prisma-repository-pattern/SKILL.md)
- **Permission patterns** (for auth test setup): See [`pbac-auth-audit`](../../.agents/skills/pbac-auth-audit/SKILL.md)

### 8.4 Test File Naming Convention

Follow these conventions for test files to ensure the skill globs match:

| Test Type | Pattern | Example |
|-----------|---------|---------|
| Unit | `tests/unit/**/*.test.ts` | `tests/unit/scheduling/flight-validation.test.ts` |
| Integration | `tests/integration/**/*.test.ts` | `tests/integration/scheduling/assign-booking.test.ts` |
| E2E | `tests/e2e/**/*.spec.ts` | `tests/e2e/scheduling.spec.ts` |
| Accessibility | `tests/e2e/accessibility.spec.ts` | `tests/e2e/accessibility.spec.ts` |
| Fixtures | `tests/fixtures/**/*.ts` | `tests/fixtures/factories.ts` |

---

## Appendix: Quick Reference

### Common Assertions

```typescript
// Unit test assertions
expect(result.status).toBe("ok");
expect(result.error).toBeDefined();
expect(result.suggestions).toHaveLength(1);

// Integration test assertions
expect(result.success).toBe(true);
expect(result.status).toBe(400);
expect(updated?.status).toBe("approved");
expect(updated?.approved_by).toBe(testUserId);

// E2E test assertions
await expect(locator).toBeVisible({ timeout: 10_000 });
await expect(locator).toHaveCount(0);
await expect(page).toHaveURL(/date=2026-06-15/);
```

### Mocking Patterns

```typescript
// Mock a repository (Vitest)
vi.mock("~/utils/repositories/booking-leg", () => ({
  bookingLegRepository: {
    findUnassignedLegs: vi.fn(),
  },
}));

// Mock a permission check
vi.mock("~/utils/permissions.server", () => ({
  hasPermission: vi.fn().mockResolvedValue(true),
  requirePermission: vi.fn().mockResolvedValue({ id: "1", role: "ops" }),
}));
```

### Test Data Quick Reference

| Aerodrome Code | Name | Notes |
|---------------|------|-------|
| PSY | Stanley | Main hub, paved runway |
| MPA | Mount Pleasant | Military/civilian, paved |
| SHR | Shallow Bay | Short strip (< 400m) |
| PPS | Port Stephens | Short strip |
| SAU | Saunders Island | Short strip |

| Aircraft Type | Seats | Max Range | Notes |
|--------------|-------|-----------|-------|
| BN-2 Islander | 8 | 700 nm | Most common |
| DHC-6 Twin Otter | 19 | 800 nm | Larger capacity |