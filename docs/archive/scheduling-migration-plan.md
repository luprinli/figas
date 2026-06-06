# Migration Plan

> Part of the Dynamic Scheduling & Flight Assignment plan.
> See main plan at [`scheduling-flight-assignment-plan.md`](scheduling-flight-assignment-plan.md)

## 8.1 Migration 005: Scheduling Tables

**Strategy:** Extend the existing `flights` table as the sortie entity, add `flight_legs` for sequenced stops, add `schedules` for daily grouping. No separate `sorties` or `sortie_legs` tables.

```sql
-- ============================================================================
-- Migration 005: Scheduling & Flight Assignment
-- Depends on: 001-004 (existing schema)
-- ============================================================================

-- 1. Schedules table (daily schedule grouping with pipeline status)
CREATE TABLE IF NOT EXISTS schedules (
  id            SERIAL PRIMARY KEY,
  schedule_date DATE NOT NULL UNIQUE,
  status        VARCHAR(50) NOT NULL DEFAULT 'BUILDING'
    CHECK (status IN ('BUILDING','APPROVED','PUBLISHED','PILOT_ASSIGNED',
                      'LOADSHEET_GENERATED','IN_PROGRESS','COMPLETED','CANCELLED')),
  created_by    INTEGER NOT NULL REFERENCES users(id),
  approved_by   INTEGER REFERENCES users(id),
  approved_at   TIMESTAMPTZ,
  published_at  TIMESTAMPTZ,
  notes         TEXT,
  version       INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_schedules_date ON schedules(schedule_date);
CREATE INDEX idx_schedules_status ON schedules(status);

-- 2. Extend flights table with sortie-level columns
ALTER TABLE flights ADD COLUMN IF NOT EXISTS call_sign VARCHAR(20);
ALTER TABLE flights ADD COLUMN IF NOT EXISTS schedule_id INTEGER REFERENCES schedules(id);
ALTER TABLE flights ADD COLUMN IF NOT EXISTS check_in_time TIMESTAMPTZ;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS estimated_return_time TIMESTAMPTZ;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
ALTER TABLE flights ADD COLUMN IF NOT EXISTS departure_aerodrome_id INTEGER REFERENCES aerodromes(id);

CREATE INDEX IF NOT EXISTS idx_flights_schedule ON flights(schedule_id);

-- 3. Flight legs table (sequenced stops within a sortie)
CREATE TABLE IF NOT EXISTS flight_legs (
  id                  SERIAL PRIMARY KEY,
  flight_id           INTEGER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  sequence_number     INTEGER NOT NULL,
  from_aerodrome_id   INTEGER NOT NULL REFERENCES aerodromes(id),
  to_aerodrome_id     INTEGER NOT NULL REFERENCES aerodromes(id),
  scheduled_departure TIMESTAMPTZ,
  scheduled_arrival   TIMESTAMPTZ,
  estimated_fuel_burn_kg NUMERIC(8,2),
  distance_nm         NUMERIC(8,2),
  status              VARCHAR(50) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(flight_id, sequence_number)
);

CREATE INDEX idx_flight_legs_flight ON flight_legs(flight_id);
CREATE INDEX idx_flight_legs_from ON flight_legs(from_aerodrome_id);
CREATE INDEX idx_flight_legs_to ON flight_legs(to_aerodrome_id);

-- 4. Weight balance snapshots table (per-leg computed values)
-- NOTE: Aircraft structural limits, aerodrome limits, and CG data are looked up dynamically.
-- Only the effective (binding) constraints are stored, avoiding data duplication.
-- Fuel is computed per leg using fuel.csv direct lookup (Required Fuel, Minimum Fuel, Fuel State).
CREATE TABLE IF NOT EXISTS weight_balance_snapshots (
  id                      SERIAL PRIMARY KEY,
  flight_leg_id           INTEGER NOT NULL REFERENCES flight_legs(id) ON DELETE CASCADE UNIQUE,
  flight_id               INTEGER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,

  -- Fuel planning fields (computed per leg from fuel.csv direct lookup)
  fuel_required_kg        NUMERIC(8,2) NOT NULL DEFAULT 0,
    -- Fuel needed for this leg per fuel.csv Required Fuel column
  fuel_minimum_kg         NUMERIC(8,2) NOT NULL DEFAULT 0,
    -- Minimum fuel that must be on board before departure (fuel.csv Minimum Fuel column)
  fuel_state              VARCHAR(10),
    -- Fuel state string from fuel.csv (e.g., "35/35", "40/40") — what the refueler loads at Stanley
  fuel_endurance_minutes  INTEGER NOT NULL DEFAULT 0,
    -- How long the fuel on board will last at planned burn rate
  leg_flight_time_minutes INTEGER NOT NULL DEFAULT 0,
    -- Scheduled flight time for this leg (distance / cruise_speed + taxi)
  sectors_so_far          INTEGER NOT NULL DEFAULT 0,
    -- Number of sectors completed including this leg (used for fuel.csv lookup)

  -- Fuel state tracking
  fuel_on_board_kg        NUMERIC(8,2) NOT NULL DEFAULT 0,
    -- Fuel on board at departure for this leg (the Fuel State value loaded at Stanley)
  fuel_burn_kg            NUMERIC(8,2) NOT NULL DEFAULT 0,
    -- Estimated fuel burn for this leg (= fuel.csv Required Fuel)
  fuel_remaining_kg       NUMERIC(8,2) NOT NULL DEFAULT 0,
    -- Fuel remaining after completing this leg

  -- Weight components
  zero_fuel_weight_kg     NUMERIC(8,2) NOT NULL DEFAULT 0,
    -- Aircraft empty weight + passengers + baggage + freight + pilot weight
  ramp_weight_kg          NUMERIC(8,2) NOT NULL DEFAULT 0,
  taxi_fuel_kg            NUMERIC(6,2) NOT NULL DEFAULT 5,
  takeoff_weight_kg       NUMERIC(8,2) NOT NULL DEFAULT 0,
  landing_weight_kg       NUMERIC(8,2) NOT NULL DEFAULT 0,

  -- CG (Center of Gravity) — simplified calculation
  total_moment_kgm        NUMERIC(10,2) NOT NULL DEFAULT 0,
    -- Sum of (weight x arm) for all components
  cg_position_pct         NUMERIC(5,1),
    -- CG position as percentage of MAC: total_moment / total_weight
  cg_ok                   BOOLEAN NOT NULL DEFAULT TRUE,
    -- TRUE if cg_forward_limit <= cg_position <= cg_aft_limit

  -- Effective (binding) constraints — MIN of aircraft and aerodrome limits
  effective_mtow_limit_kg NUMERIC(8,2) NOT NULL,
  effective_mlw_limit_kg  NUMERIC(8,2) NOT NULL,

  -- Checks against effective limits
  mtow_ok                 BOOLEAN NOT NULL DEFAULT TRUE,
  mlw_ok                  BOOLEAN NOT NULL DEFAULT TRUE,
  mtow_utilization_pct    NUMERIC(5,1),
  mlw_utilization_pct     NUMERIC(5,1),

  fuel_ok                 BOOLEAN NOT NULL DEFAULT TRUE,
    -- TRUE if fuel_on_board_kg >= fuel_required_kg AND fuel_remaining_kg >= fuel_minimum_kg
  fuel_warning            TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_weight_snapshots_leg ON weight_balance_snapshots(flight_leg_id);
CREATE INDEX idx_weight_snapshots_flight ON weight_balance_snapshots(flight_id);

-- 5. Pilot assignments table
CREATE TABLE IF NOT EXISTS pilot_assignments (
  id          SERIAL PRIMARY KEY,
  flight_id   INTEGER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  pilot_id    INTEGER NOT NULL REFERENCES pilots(id),
  role        TEXT NOT NULL CHECK (role IN ('CAPTAIN', 'FIRST_OFFICER')),
  duty_start  TIMESTAMPTZ,
  duty_end    TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by INTEGER REFERENCES users(id),
  UNIQUE(flight_id, pilot_id, role)
);

CREATE INDEX idx_pilot_assignments_flight ON pilot_assignments(flight_id);
CREATE INDEX idx_pilot_assignments_pilot ON pilot_assignments(pilot_id);

-- 6. Add scheduling columns to aircraft
ALTER TABLE aircraft ADD COLUMN IF NOT EXISTS fuel_burn_rate_kg_per_nm NUMERIC(6,2);
ALTER TABLE aircraft ADD COLUMN IF NOT EXISTS max_landing_weight_kg NUMERIC(7,1);
ALTER TABLE aircraft ADD COLUMN IF NOT EXISTS max_zero_fuel_weight_kg NUMERIC(7,1);
ALTER TABLE aircraft ADD COLUMN IF NOT EXISTS taxi_fuel_kg NUMERIC(6,2) NOT NULL DEFAULT 5;

-- CG (Center of Gravity) columns — admin-configurable via admin.aircraft.tsx
ALTER TABLE aircraft ADD COLUMN IF NOT EXISTS cg_arm_m NUMERIC(5,2);
  -- Center of Gravity arm in meters (moment arm for weight & balance)
ALTER TABLE aircraft ADD COLUMN IF NOT EXISTS cg_forward_limit_pct NUMERIC(4,1);
  -- Forward CG limit as percentage of MAC (Mean Aerodynamic Chord)
ALTER TABLE aircraft ADD COLUMN IF NOT EXISTS cg_aft_limit_pct NUMERIC(4,1);
  -- Aft CG limit as percentage of MAC (Mean Aerodynamic Chord)

-- 7. Add scheduling columns to pilots
ALTER TABLE pilots ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(5,1);
  -- Pilot body weight in kg (used in weight & balance zero_fuel_weight calculation)
ALTER TABLE pilots ADD COLUMN IF NOT EXISTS duty_time_limit_minutes INTEGER NOT NULL DEFAULT 480;
ALTER TABLE pilots ADD COLUMN IF NOT EXISTS max_flight_hours_per_day NUMERIC(4,1) NOT NULL DEFAULT 8.0;
ALTER TABLE pilots ADD COLUMN IF NOT EXISTS qualifications JSONB;

-- 8. Add weight limit columns to aerodromes
ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS mtow_limit_kg NUMERIC(7,1);
ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS mlw_limit_kg NUMERIC(7,1);
```

## 8.2 Migration 006: Fix Pre-Existing Bugs

```sql
-- ============================================================================
-- Migration 006: Fix pre-existing bugs found during scheduling implementation
-- ============================================================================

-- No schema changes needed for the manifest route bug.
-- The fix is in application code (see Section 9).
-- This migration is reserved for any schema fixes discovered during P2 implementation.
```

## 8.3 Down Migration (Rollback)

```sql
-- ============================================================================
-- Migration 005_down: Rollback scheduling tables
-- Drops in reverse dependency order
-- ============================================================================

DROP TABLE IF EXISTS weight_balance_snapshots CASCADE;
DROP TABLE IF EXISTS flight_legs CASCADE;
DROP TABLE IF EXISTS pilot_assignments CASCADE;

ALTER TABLE flights DROP COLUMN IF EXISTS call_sign;
ALTER TABLE flights DROP COLUMN IF EXISTS schedule_id;
ALTER TABLE flights DROP COLUMN IF EXISTS check_in_time;
ALTER TABLE flights DROP COLUMN IF EXISTS estimated_return_time;
ALTER TABLE flights DROP COLUMN IF EXISTS created_by;
ALTER TABLE flights DROP COLUMN IF EXISTS departure_aerodrome_id;

ALTER TABLE aircraft DROP COLUMN IF EXISTS fuel_burn_rate_kg_per_nm;
ALTER TABLE aircraft DROP COLUMN IF EXISTS max_landing_weight_kg;
ALTER TABLE aircraft DROP COLUMN IF EXISTS max_zero_fuel_weight_kg;
ALTER TABLE aircraft DROP COLUMN IF EXISTS taxi_fuel_kg;
ALTER TABLE aircraft DROP COLUMN IF EXISTS cg_arm_m;
ALTER TABLE aircraft DROP COLUMN IF EXISTS cg_forward_limit_pct;
ALTER TABLE aircraft DROP COLUMN IF EXISTS cg_aft_limit_pct;

ALTER TABLE pilots DROP COLUMN IF EXISTS weight_kg;
ALTER TABLE pilots DROP COLUMN IF EXISTS duty_time_limit_minutes;
ALTER TABLE pilots DROP COLUMN IF EXISTS max_flight_hours_per_day;
ALTER TABLE pilots DROP COLUMN IF EXISTS qualifications;

ALTER TABLE aerodromes DROP COLUMN IF EXISTS mtow_limit_kg;
ALTER TABLE aerodromes DROP COLUMN IF EXISTS mlw_limit_kg;

DROP TABLE IF EXISTS schedules CASCADE;
```

## 8.4 Implementation Order

| Step | Description | Dependencies |
|------|-------------|--------------|
| 1 | Run Migration 005 SQL | Existing schema (001-004) |
| 2 | Create `scheduleRepository.ts` | Migration 005 |
| 3 | Create `flightLegRepository.ts` | Migration 005 |
| 4 | Create `weightBalanceRepository.ts` | Migration 005 |
| 5 | Create `pilotAssignmentRepository.ts` | Migration 005 |
| 6 | Implement scheduling algorithm (`app/utils/scheduling/`) | Repositories 2-5 |
| 7 | Build UI components (SortieBoard, TimelineView, FlightCard, etc.) | None (standalone) |
| 8 | Build Schedule Builder page (`/operations/schedule`) | Components + Algorithm |
| 9 | Build Schedule List page (`/operations/schedule/list`) | Components |
| 10 | Build Schedule Detail page (`/operations/schedule/:id`) | Components |
| 11 | Implement publish workflow (update flights status) | Repositories + Algorithm |
| 12 | Implement pilot assignment workflow | Repositories |
| 13 | Implement loadsheet generation | Repositories + Manifest |
| 14 | Add schedule nav to operations sidebar | Existing layout |
| 15 | Update flight detail page with schedule context | Existing route |
| 16 | Fix manifest route `booking_passengers` bug | Existing route |
| 17 | End-to-end testing | All of the above |

## 8.5 Algorithm Implementation Files

```
app/utils/scheduling/
├── index.ts                  # Main orchestrator — calls each phase
├── types.ts                  # Shared types (FlightCandidate, WeightSnapshot, FuelPlan, etc.)
├── cluster-bookings.ts       # Phase 1: Group bookings by proximity
├── nearest-neighbor.ts       # Phase 2: Construct initial flight route
├── assign-aircraft.ts        # Phase 3: Bin-packing aircraft assignment
├── fuel-planning.ts          # Phase 4: Compute fuel per leg using fuel.csv rules lookup
├── weight-balance.ts         # Phase 4: Compute weight & balance for each leg (uses fuel-planning output)
├── assign-pilots.ts          # Phase 5: Assign pilots with duty-time tracking
└── __tests__/
    ├── cluster-bookings.test.ts
    ├── nearest-neighbor.test.ts
    ├── assign-aircraft.test.ts
    ├── fuel-planning.test.ts
    ├── weight-balance.test.ts
    └── fuel-endurance.test.ts
```

## 8.6 Repository Files

```
app/utils/repositories/
├── schedule.ts               # CRUD for schedules table
├── flight-leg.ts             # CRUD for flight_legs table
├── weight-balance.ts         # CRUD for weight_balance_snapshots table
└── pilot-assignment.ts       # CRUD for pilot_assignments table
```

## 8.7 Seed Data

The existing seed script at [`app/utils/seed.ts`](../app/utils/seed.ts) should be extended to:

1. Populate `aerodromes.mtow_limit_kg` and `aerodromes.mlw_limit_kg` from the aerodrome data
2. Populate `aircraft.fuel_burn_rate_kg_per_nm`, `aircraft.max_landing_weight_kg`, `aircraft.max_zero_fuel_weight_kg`, `aircraft.taxi_fuel_kg`
3. Populate `pilots.duty_time_limit_minutes`, `pilots.max_flight_hours_per_day`, `pilots.qualifications`

No seed data is needed for `schedules`, `flight_legs`, `weight_balance_snapshots`, or `pilot_assignments` — these are populated by the scheduling algorithm and workflow.

## Appendix A: Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Extend `flights` table rather than create separate `sorties` table | A sortie IS a flight; minimizes schema changes; existing code continues to work |
| `flight_legs` as a separate table rather than JSONB | Enables FK references, queryable, indexable, supports weight snapshots per leg |
| Nearest-neighbor rather than 2-opt or OR-Tools | Small problem size (≤20 bookings/day); simpler to implement and maintain |
| Weight snapshots stored rather than computed on-the-fly | Historical record for audit; avoids re-computation when flight details change |
| No `flight_passenger_assignments` or `flight_freight_assignments` | Redundant — data available through existing joins |
| Schedule status as linear pipeline with cancellation/reversion | Reflects real-world operations workflow; clear progression with validation |
| `@dnd-kit` for drag-and-drop with Remix form submission on drop | Smooth UX while keeping server as source of truth; form submits on `onDragEnd` only |
| Pilot weight included in zero_fuel_weight | Pilot choice can affect weight limit feasibility on marginal flights |
| CG calculation simplified (moment/weight) | Provides basic CG check without full complexity; CG data admin-configurable |

## Appendix B: Fuel Rules Reference — Simplified fuel.csv Direct Lookup

### Key Insight

The fuel rules in [`data/fuel.csv`](../data/fuel.csv) define three values per (flight time, sectors) pair:

| Column | Meaning | How Used |
|--------|---------|----------|
| **Required Fuel** | The calculated fuel needed for the leg (the burn) | Used as `fuel_burn_kg` and `fuel_required_kg` |
| **Minimum Fuel** | What the fuel is rounded up to — the fuel that must be on board before departure | Used as `fuel_minimum_kg` — the reserve that must remain after the leg |
| **Fuel State** | The actual fuel load the refueler will use (e.g., `35/35`, `40/40`) | Used as `fuel_state` — what gets loaded at Stanley |

**The algorithm:**
1. Compute `flight_time_minutes` from distance and cruise speed
2. Determine `sectors_so_far` (number of legs completed + current leg)
3. Look up the fuel.csv row: find the row where `FT (mins)` >= computed flight time AND `Sectors` >= sectors_so_far (ceiling match)
4. Use `Required Fuel` as the calculated burn for the leg
5. Use `Minimum Fuel` as the fuel that must be on board before departure
6. Use `Fuel State` (e.g., `35/35`) as the actual fuel load the refueler will use — this is what gets loaded at Stanley
7. **This eliminates the need for separate fuel burn rate calculations — the CSV IS the fuel calculation**

### Complete Fuel Rules Table

The full [`data/fuel.csv`](../data/fuel.csv) dataset:

| FT mins | Sectors | Required Fuel kg | Minimum Fuel kg | Fuel State |
|---------|---------|-----------------|-----------------|------------|
| 60 | 2 | 170 | 190 | 35/35 |
| 60 | 3 | 175 | 190 | 35/35 |
| 60 | 4 | 180 | 190 | 35/35 |
| 60 | 5 | 185 | 190 | 35/35 |
| 70 | 2 | 184 | 190 | 35/35 |
| 70 | 3 | 189 | 190 | 35/35 |
| 70 | 4 | 194 | 216 | 40/40 |
| 70 | 5 | 199 | 216 | 40/40 |
| 70 | 6 | 205 | 216 | 40/40 |
| 70 | 7 | 210 | 216 | 40/40 |
| 80 | 2 | 198 | 216 | 40/40 |
| 80 | 3 | 203 | 216 | 40/40 |
| 80 | 4 | 208 | 216 | 40/40 |
| 80 | 5 | 213 | 216 | 40/40 |
| 80 | 6 | 219 | 244 | 45/45 |
| 80 | 7 | 224 | 244 | 45/45 |
| 90 | 2 | 211 | 216 | 40/40 |
| 90 | 3 | 217 | 244 | 45/45 |
| 90 | 4 | 222 | 244 | 45/45 |
| 90 | 5 | 227 | 244 | 45/45 |
| 90 | 6 | 232 | 244 | 45/45 |
| 90 | 7 | 238 | 244 | 45/45 |
| 100 | 2 | 225 | 244 | 45/45 |
| 100 | 3 | 231 | 244 | 45/45 |
| 100 | 4 | 236 | 244 | 45/45 |
| 100 | 5 | 241 | 244 | 45/45 |
| 100 | 6 | 246 | 274 | 50/50 |
| 100 | 7 | 252 | 274 | 50/50 |
| 110 | 2 | 239 | 244 | 45/45 |
| 110 | 3 | 245 | 274 | 50/50 |
| 110 | 4 | 250 | 274 | 50/50 |
| 110 | 5 | 255 | 274 | 50/50 |
| 110 | 6 | 260 | 274 | 50/50 |
| 110 | 7 | 266 | 274 | 50/50 |
| 120 | 2 | 253 | 274 | 50/50 |
| 120 | 3 | 258 | 274 | 50/50 |
| 120 | 4 | 264 | 274 | 50/50 |
| 120 | 5 | 269 | 274 | 50/50 |
| 120 | 6 | 274 | 274 | 50/50 |
| 120 | 7 | 279 | 300 | 55/55 |
| 130 | 2 | 267 | 274 | 50/50 |
| 130 | 3 | 272 | 274 | 50/50 |
| 130 | 4 | 278 | 300 | 55/55 |
| 130 | 5 | 283 | 300 | 55/55 |
| 130 | 6 | 288 | 300 | 55/55 |
| 130 | 7 | 293 | 300 | 55/55 |
| 140 | 2 | 281 | 300 | 55/55 |
| 140 | 3 | 286 | 300 | 55/55 |
| 140 | 4 | 292 | 300 | 55/55 |
| 140 | 5 | 297 | 300 | 55/55 |
| 140 | 6 | 302 | 326 | 60/60 |
| 140 | 7 | 307 | 326 | 60/60 |
| 150 | 2 | 295 | 300 | 55/55 |
| 150 | 3 | 300 | 300 | 55/55 |
| 150 | 4 | 305 | 326 | 60/60 |
| 150 | 5 | 311 | 326 | 60/60 |
| 150 | 6 | 316 | 326 | 60/60 |
| 150 | 7 | 321 | 326 | 60/60 |
| 160 | 2 | 309 | 326 | 60/60 |
| 160 | 3 | 314 | 326 | 60/60 |
| 160 | 4 | 319 | 326 | 60/60 |
| 160 | 5 | 325 | 326 | 60/60 |
| 160 | 6 | 330 | 352 | 65/65 |
| 160 | 7 | 335 | 352 | 65/65 |
| 170 | 2 | 323 | 326 | 60/60 |
| 170 | 3 | 328 | 352 | 65/65 |
| 170 | 4 | 333 | 352 | 65/65 |
| 170 | 5 | 339 | 352 | 65/65 |
| 170 | 6 | 344 | 352 | 65/65 |
| 170 | 7 | 349 | 352 | 65/65 |
| 180 | 2 | 337 | 352 | 65/65 |
| 180 | 3 | 342 | 352 | 65/65 |
| 180 | 4 | 347 | 352 | 65/65 |
| 180 | 5 | 352 | 352 | 65/65 |
| 180 | 6 | 358 | 352 | 65/65 |
| 180 | 7 | 363 | 352 | 65/65 |

### Simplified Lookup Algorithm

```
FUNCTION fuel_csv_lookup(flight_time_minutes, sectors_so_far, fuel_rules[]):
  // fuel_rules is the data from fuel.csv sorted by (flight_time, sectors)
  // Find the row where FT mins >= computed flight time AND Sectors >= sectors_so_far
  // using ceiling match (conservative — round up)

  // Step 1: Filter candidates where sectors >= sectors_so_far
  candidates = fuel_rules.filter(r => r.sectors >= sectors_so_far)

  IF candidates is empty:
    // No sector match; use the maximum sector entry
    candidates = fuel_rules.filter(r =>
      r.sectors == max(fuel_rules.sectors)
    )

  // Step 2: Find the row with flight_time >= our flight_time (ceiling match)
  best = candidates.filter(r => r.flight_time_minutes >= flight_time_minutes)
                   .sort_by_asc(r.flight_time_minutes)
                   .first()

  IF best is null:
    // Flight time exceeds all entries; use the maximum entry
    best = candidates.sort_by_desc(r.flight_time_minutes).first()

  RETURN {
    required_fuel_kg: best.required_fuel,    // fuel.csv Required Fuel column
    minimum_fuel_kg: best.minimum_fuel,       // fuel.csv Minimum Fuel column
    fuel_state: best.fuel_state               // fuel.csv Fuel State column (e.g., "35/35")
  }
```

### Per-Leg Fuel Computation

For each leg of each flight:

1. **Compute flight time:** `flight_time_minutes = (distance_nm / cruise_speed_kts) * 60 + taxi_time`
2. **Determine sectors so far:** `sectors_so_far = leg_sequence` (1-based)
3. **Look up fuel rules:** `fuel_rule = fuel_csv_lookup(flight_time, sectors, fuel_rules)`
4. **Determine fuel on board:**
   - First leg from Stanley: `fuel_on_board = minimum_fuel` (the Fuel State value)
   - Revisit Stanley: `fuel_on_board = minimum_fuel` (reload per fuel.csv)
   - Intermediate leg: `fuel_on_board = previous_leg.fuel_remaining`
5. **Fuel burn:** `fuel_burn = required_fuel`
6. **Fuel remaining:** `fuel_remaining = fuel_on_board - fuel_burn`
7. **Fuel check:** `fuel_ok = fuel_on_board >= required_fuel`
8. **Reserve check:** `reserve_ok = fuel_remaining >= minimum_fuel`

### Key Differences from Previous Approach

| Aspect | Old (Incorrect) | New (Correct) |
|--------|----------------|---------------|
| Fuel at Stanley departure | Full tanks (500 kg) | Minimum Fuel from fuel.csv (e.g., 190 kg for 35/35) |
| Fuel at Stanley revisit | Reset to full (500 kg) | Load Minimum Fuel for next segment per fuel.csv |
| Fuel for intermediate legs | Full - burn | Carry forward remaining fuel |
| Fuel check | fuel_remaining >= reserve | fuel_on_board >= required_fuel AND fuel_remaining >= minimum_fuel |
| Fuel endurance | Based on full tank | Based on computed fuel on board |
| Fuel weight in MTOW calc | Fixed (500 kg) | Variable (depends on leg requirements per fuel.csv) |
| Burn rate calculation | Separate fuel_burn_rate_kg_per_nm | Not needed — fuel.csv Required Fuel IS the burn |
| Fuel State tracking | Not tracked | Stored as `fuel_state` (e.g., "35/35") for refueler reference |

## Appendix C: Aerodrome Weight Limits

**Critical correction:** The aerodromes do NOT all have the same MTOW/MLW. Per-aerodrome limits vary significantly and must be respected as the binding constraint in weight/balance calculations.

From [`data/aerodromes.csv`](../data/aerodromes.csv), the actual per-aerodrome limits are:

| Code | Name | MTOW (kg) | MLW (kg) | Runway 1 (m) | Runway 2 (m) | Binding Constraint? |
|------|------|-----------|----------|-------------|-------------|---------------------|
| STY | Stanley Airport | **2,994** | **2,994** | 970 | 337 | Aircraft-limited (BN-2: 2,994) |
| MPA | Mount Pleasant | **2,994** | **2,994** | 2,580 | 1,525 | Aircraft-limited |
| FXB | Fox Bay CLAY | **2,994** | **2,994** | 680 | 400 | Aircraft-limited |
| ALB | Albemarle | **2,860** | **2,830** | 580 | 340 | **Aerodrome-limited** |
| BVI | Beaver Island | **2,580** | **2,550** | 285 | 325 | **Aerodrome-limited** |
| BKI | Bleaker Island | **2,860** | **2,830** | 428 | 292 | **Aerodrome-limited** |
| CCI | Carcass Island | **2,930** | **2,900** | 600 | 540 | **Aerodrome-limited** |
| CHR | Chartres | **2,930** | **2,900** | 525 | 275 | **Aerodrome-limited** |
| FBE | Fox Bay East | **2,860** | **2,830** | 475 | 225 | **Aerodrome-limited** |
| GEI | George Island | **2,790** | **2,760** | 368 | 300 | **Aerodrome-limited** |
| PGR | Goose Green | **2,790** | **2,760** | 500 | — | **Aerodrome-limited** |
| HLC | Hill Cove | **2,790** | **2,760** | 575 | 350 | **Aerodrome-limited** |
| LYI | Lively Island | **2,790** | **2,760** | 600 | 290 | **Aerodrome-limited** |
| NWI | New Island | **2,580** | **2,550** | 368 | — | **Aerodrome-limited** |
| NHA | North Arm | **2,930** | **2,900** | 700 | 396 | **Aerodrome-limited** |
| PBI | Pebble Island | **2,930** | **2,900** | 579 | 264 | **Aerodrome-limited** |
| PHD | Port Edgar | **2,790** | **2,760** | 510 | — | **Aerodrome-limited** |
| PHP | Port Howard | **2,930** | **2,900** | 500 | — | **Aerodrome-limited** |
| PSC | Port San Carlos | **2,830** | **2,860** | 600 | — | **Aerodrome-limited** |
| PST | Port Stephens | **2,790** | **2,760** | 568 | 348 | **Aerodrome-limited** |
| RYC | Roy Cove | **2,860** | **2,830** | 600 | — | **Aerodrome-limited** |
| SDI | Saunders Island | **2,930** | **2,900** | 548 | 300 | **Aerodrome-limited** |
| SLI | Sea Lion Island | **2,860** | **2,830** | 550 | 350 | **Aerodrome-limited** |
| SHB | Shallow Harbour | **2,790** | **2,760** | 460 | 328 | **Aerodrome-limited** |
| SPI | Speedwell Island | **2,790** | **2,760** | 500 | 256 | **Aerodrome-limited** |
| SPP | Spring Point | **2,860** | **2,830** | 545 | 505 | **Aerodrome-limited** |
| WDI | Weddell Island | **2,930** | **2,900** | 425 | 325 | **Aerodrome-limited** |
| WPI | West Point Island | **2,580** | **2,550** | 278 | — | **Aerodrome-limited** |
| DGS | Douglas Station | **2,790** | **2,760** | — | — | **Aerodrome-limited** |
| DWN | Darwin | **2,930** | **2,900** | — | — | **Aerodrome-limited** |

### Key Observations

1. **Most restrictive aerodromes** (lowest MTOW/MLW):
   - **Beaver Island (BVI):** MTOW 2,580 kg, MLW 2,550 kg — 414 kg below aircraft limit
   - **New Island (NWI):** MTOW 2,580 kg, MLW 2,550 kg — 414 kg below aircraft limit
   - **West Point Island (WPI):** MTOW 2,580 kg, MLW 2,550 kg — 414 kg below aircraft limit

2. **Moderately restrictive** (MTOW 2,790-2,860 kg):
   - George Island, Goose Green, Hill Cove, Lively Island, Port Edgar, Port Stephens, Shallow Harbour, Speedwell Island, Douglas Station: MTOW 2,790 kg, MLW 2,760 kg
   - Albemarle, Bleaker Island, Fox Bay East, Roy Cove, Sea Lion Island, Spring Point: MTOW 2,860 kg, MLW 2,830 kg

3. **Aircraft-limited** (MTOW 2,994 kg):
   - Only Stanley (STY), Mount Pleasant (MPA), and Fox Bay CLAY (FXB) match the BN-2 Islander's structural limit of 2,994 kg.

4. **Runway length as additional constraint:**
   - Short runways (e.g., West Point Island at 278 m, Beaver Island at 285 m) may further reduce effective MTOW below the published aerodrome limit, especially on hot days or with tailwind components.
   - The algorithm should consider runway length as a derating factor when computing effective MTOW.

### How Constraints Propagate Through the Algorithm

```
FOR EACH leg IN flight.legs:
  dest = aerodromes[leg.to_aerodrome_id]

  -- Effective limits (binding constraint)
  effective_mtow = MIN(aircraft.max_takeoff_weight_kg, dest.mtow_limit_kg)
  effective_mlw  = MIN(aircraft.max_landing_weight_kg, dest.mlw_limit_kg)

  -- Optional: runway derating for short strips
  IF dest.runway_length_m < 400:
    effective_mtow = effective_mtow * 0.95  -- 5% derating for short runways
    effective_mlw  = effective_mlw * 0.95

  -- Check constraints
  mtow_ok = takeoff_weight <= effective_mtow
  mlw_ok  = landing_weight <= effective_mlw

  -- Utilization percentage (for UI display)
  mtow_util_pct = (takeoff_weight / effective_mtow) * 100
  mlw_util_pct  = (landing_weight / effective_mlw) * 100
```

### Impact on Scheduling

- A flight visiting Beaver Island (BVI), New Island (NWI), or West Point Island (WPI) must operate at significantly reduced payload — up to 414 kg less than the aircraft structural limit.
- The algorithm's `compute_weight_balance()` function must look up the destination aerodrome's limits for **each leg**, not just use a single aircraft-level MTOW/MLW.
- The `assign_aircraft_to_flights()` bin-packing must account for per-leg weight constraints, not just total flight payload.
- The Revisit Stanley logic should consider that a leg to a restrictive aerodrome may force a lighter fuel load, potentially requiring a fuel stop at a less restrictive aerodrome en route.
