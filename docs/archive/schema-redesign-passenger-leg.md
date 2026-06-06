# FIGAS Booking Data Model — Schema Redesign: Passenger ↔ Leg Association

## 1. Executive Summary

### Why the Current Model Is Wrong

The current FIGAS data model treats a [`Booking`](migrations/001_create_tables.sql:161) as the primary entity, with [`passengers`](migrations/001_create_tables.sql:204) belonging to a Booking and implicitly associated with **all** [`Flight Legs`](migrations/014_create_scheduling_tables.sql:49) under that Booking. This is fundamentally incorrect for the FIGAS domain for several reasons:

1. **A passenger may not travel on all legs of an itinerary.** A round-trip booking (e.g., Stanley → Pebble Island → Stanley) may have a passenger only on the outbound leg, while another passenger joins only for the return. The current model cannot represent this.

2. **Baggage is leg-specific, not passenger-global.** A passenger may check baggage on the outbound but travel light on the return. The current model stores [`baggage_weight_kg`](migrations/001_create_tables.sql:217) on the [`passengers`](migrations/001_create_tables.sql:204) table, making it impossible to vary baggage per leg.

3. **Body weight verification happens at check-in, per leg.** The current model updates [`clothed_body_weight_kg`](migrations/001_create_tables.sql:216) on the passenger record globally, losing the per-leg audit trail of what was verified at check-in.

4. **Weight & balance computation uses standard estimates.** The scheduling system in [`weight-balance.ts`](app/utils/scheduling/weight-balance.ts:24-25) uses hardcoded constants (`STANDARD_PASSENGER_WEIGHT_KG = 70`, `STANDARD_BAGGAGE_WEIGHT_KG = 15`) because it cannot reliably query per-leg, per-passenger actual weights.

5. **The passenger manifest query is incorrect.** The schedule builder's manifest query at [`operations.schedule._index.tsx:212-229`](app/routes/operations.schedule._index.tsx:212) joins [`passengers`](migrations/001_create_tables.sql:204) to [`booking_legs`](migrations/001_create_tables.sql:181) via the booking, implicitly assuming all passengers are on all legs — which produces wrong results for multi-leg itineraries.

### High-Level Overview of the Proposed Redesign

The redesign introduces a **junction table** [`booking_leg_passengers`](plans/schema-redesign-passenger-leg.md) that explicitly associates a passenger with a specific leg of a booking. This creates a proper many-to-many relationship between passengers and legs, where:

- A [`Booking`](plans/schema-redesign-passenger-leg.md) (itinerary-level) has many [`Booking Legs`](plans/schema-redesign-passenger-leg.md) and many [`Booking Passengers`](plans/schema-redesign-passenger-leg.md)
- A [`Booking Passenger`](plans/schema-redesign-passenger-leg.md) is associated with specific [`Booking Legs`](plans/schema-redesign-passenger-leg.md) via [`booking_leg_passengers`](plans/schema-redesign-passenger-leg.md)
- Per-leg, per-passenger data (clothed weight, baggage, freight, check-in status, seat) lives on the junction table
- Passenger personal data (name, DOB, email, body weight) stays on the passenger record

```
BOOKINGS ──1:N──> BOOKING_LEGS ──1:N──> BOOKING_LEG_PASSENGERS
  │                                        │
  │                                        │
  └──1:N──> BOOKING_PASSENGERS ────N:1────┘
```

---

## 2. Current Schema Analysis

### 2.1 Current Table Structure

#### [`bookings`](migrations/001_create_tables.sql:161) — Itinerary-level record

| Column | Type | Notes |
|--------|------|-------|
| `id` | `SERIAL PRIMARY KEY` | |
| `booking_reference` | `VARCHAR(20) UNIQUE` | PNR-style reference (e.g., "ABC12345") |
| `user_id` | `INTEGER NOT NULL` | FK to users |
| `status` | `VARCHAR(50)` | Pipeline status |
| `organization_id` | `INTEGER` | FK to organizations |
| `total_amount` / `total_amount_gbp` | `NUMERIC(10,2)` | Financial |
| `payment_status` | `VARCHAR(50)` | |
| `booking_source` | `VARCHAR(50)` | Added in migration 005 |
| `created_by` | `INTEGER` | Added in migration 005 |

#### [`passengers`](migrations/001_create_tables.sql:204) — Passengers on a booking

| Column | Type | Problem |
|--------|------|---------|
| `id` | `SERIAL PRIMARY KEY` | |
| `booking_id` | `INTEGER NOT NULL` | Ties passenger to booking, not to specific legs |
| `first_name`, `last_name`, `email`, `phone`, `date_of_birth` | Various | Personal data — correct placement |
| `clothed_body_weight_kg` | `NUMERIC(5,1) DEFAULT 70` | **Problem**: Updated at check-in, loses per-leg audit trail |
| `baggage_weight_kg` | `NUMERIC(5,1)` | **Problem**: Cannot vary per leg |
| `checked_in` | `BOOLEAN DEFAULT false` | **Problem**: Cannot check in per leg |
| `seat_row`, `seat_column` | Various | **Problem**: Seat is per-flight, not per-passenger-global |

#### [`booking_legs`](migrations/001_create_tables.sql:181) — Individual legs of a booking

| Column | Type | Notes |
|--------|------|-------|
| `id` | `SERIAL PRIMARY KEY` | |
| `booking_id` | `INTEGER NOT NULL` | FK to bookings |
| `flight_id` | `INTEGER` | FK to flights (nullable — assigned during scheduling) |
| `origin_code` | `VARCHAR(10)` | |
| `destination_code` | `VARCHAR(10)` | |
| `leg_date` | `DATE` | |
| `leg_sequence` | `INTEGER` | Order within itinerary |
| `freight_description` | `TEXT` | **Problem**: Freight is per-leg, but should be per-leg-per-passenger |
| `freight_weight_kg` | `NUMERIC(8,1)` | Same problem |

#### [`flight_legs`](migrations/014_create_scheduling_tables.sql:49) — Sequenced stops for a sortie flight

| Column | Type | Notes |
|--------|------|-------|
| `id` | `SERIAL PRIMARY KEY` | |
| `flight_id` | `INTEGER NOT NULL` | FK to flights |
| `leg_sequence` | `INTEGER` | Order within sortie |
| `origin_code`, `destination_code` | `VARCHAR(10)` | |
| `departure_time`, `arrival_time` | `TIMESTAMPTZ` | |

#### [`seat_assignments`](migrations/001_create_tables.sql:230) — Seat assignments per flight

| Column | Type | Notes |
|--------|------|-------|
| `id` | `SERIAL PRIMARY KEY` | |
| `flight_id` | `INTEGER NOT NULL` | FK to flights |
| `passenger_id` | `INTEGER NOT NULL` | FK to passengers |
| `seat_number` | `VARCHAR(10)` | |

### 2.2 Pain Points and Limitations

#### Pain Point 1: Implicit All-Passengers-On-All-Legs Assumption

The schedule builder's manifest query at [`operations.schedule._index.tsx:212-229`](app/routes/operations.schedule._index.tsx:212) does:

```sql
SELECT bl.flight_id, p.id AS passenger_id, ...
FROM booking_legs bl
JOIN bookings b ON b.id = bl.booking_id
JOIN passengers p ON p.booking_id = b.id   -- ← ALL passengers on ALL legs
WHERE bl.flight_id IS NOT NULL
```

This produces **cartesian explosion** for multi-leg bookings: if a booking has 2 legs and 3 passengers, each flight leg gets 3 passengers even if some passengers are only on one leg.

#### Pain Point 2: Baggage Cannot Vary Per Leg

The [`checkin.counter.tsx`](app/routes/checkin.counter.tsx:186-198) check-in action updates baggage on the passenger record globally:

```typescript
// checkinRepository.confirmCheckin at checkin.ts:186-198
UPDATE passengers
SET clothed_body_weight_kg = $1, baggage_weight_kg = $2
WHERE id = $3
```

If a passenger checks in for leg 1 with 15kg baggage, then checks in for leg 2 with 0kg baggage, the second update overwrites the first. The data is lost.

#### Pain Point 3: Weight & Balance Uses Standard Estimates

The scheduling system at [`weight-balance.ts:24-25`](app/utils/scheduling/weight-balance.ts:24-25) uses:

```typescript
const STANDARD_PASSENGER_WEIGHT_KG = 70;
const STANDARD_BAGGAGE_WEIGHT_KG = 15;
```

These are hardcoded estimates because the system cannot reliably query per-leg actual weights. The comment at line 56 says `const passengerCount = 1; // conservative estimate per booking leg` — this is a workaround for the broken data model.

#### Pain Point 4: Check-In Is Per-Booking, Not Per-Leg

The [`checkin.counter.tsx`](app/routes/checkin.counter.tsx:54-76) action checks in a passenger for the entire booking without specifying which leg. The UI shows a single weight and baggage field, but a passenger on a multi-leg itinerary should be able to check in separately for each leg.

#### Pain Point 5: Freight Is Per-Leg But Not Per-Passenger

The [`booking_legs`](migrations/001_create_tables.sql:181) table has `freight_description` and `freight_weight_kg` columns, but freight should be associable with a specific passenger on a specific leg. Currently, if two passengers on the same leg both have freight, it's unclear whose is whose.

#### Pain Point 6: Seat Assignments Are Fragile

The [`seat_assignments`](migrations/001_create_tables.sql:230) table links a passenger to a flight, but a passenger on a multi-leg sortie may have different seats on different legs. The current model doesn't capture this.

#### Pain Point 7: No Per-Leg Check-In Status

The [`passengers`](migrations/001_create_tables.sql:204) table has a single `checked_in` boolean. For a round-trip booking, a passenger may be checked in for the outbound but not yet for the return. The current model cannot represent this.

---

## 3. Proposed Schema Redesign

### 3.1 Complete DDL

```sql
-- ============================================================================
-- FIGAS Booking Data Model — Schema Redesign
-- Migration XXX: Introduce booking_leg_passengers junction table
-- ============================================================================

-- ============================================================================
-- 1. bookings (renamed semantically: itinerary-level record)
--    Minimal changes from current schema. Add booking_source if not present.
-- ============================================================================
-- The current bookings table is largely correct as an itinerary-level record.
-- No structural changes needed, but we add:
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS booking_source VARCHAR(50) NOT NULL DEFAULT 'customer_direct';

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS cancelled_by INTEGER REFERENCES users(id);

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- ============================================================================
-- 2. booking_passengers (renamed from passengers)
--    Passenger personal data only. No leg-specific data.
-- ============================================================================
-- Rename the existing passengers table to booking_passengers
ALTER TABLE IF EXISTS passengers RENAME TO booking_passengers;

-- Remove leg-specific columns that will move to booking_leg_passengers
ALTER TABLE booking_passengers
  DROP COLUMN IF EXISTS baggage_weight_kg CASCADE;

ALTER TABLE booking_passengers
  DROP COLUMN IF EXISTS checked_in CASCADE;

ALTER TABLE booking_passengers
  DROP COLUMN IF EXISTS seat_row CASCADE;

ALTER TABLE booking_passengers
  DROP COLUMN IF EXISTS seat_column CASCADE;

ALTER TABLE booking_passengers
  DROP COLUMN IF EXISTS weight CASCADE;

-- Rename clothed_body_weight_kg to body_weight_kg (it's the passenger's base weight)
ALTER TABLE booking_passengers
  RENAME COLUMN clothed_body_weight_kg TO body_weight_kg;

-- Add clothing_allowance_kg for computing clothed weight per leg
ALTER TABLE booking_passengers
  ADD COLUMN IF NOT EXISTS clothing_allowance_kg NUMERIC(3,1) NOT NULL DEFAULT 2.0;

-- Add special_requirements (moved from being implicit)
ALTER TABLE booking_passengers
  ADD COLUMN IF NOT EXISTS special_requirements TEXT;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_booking_passengers_booking_id
  ON booking_passengers(booking_id);

-- ============================================================================
-- 3. booking_legs (minor modifications)
--    Remove freight columns (move to booking_leg_passengers).
-- ============================================================================
ALTER TABLE booking_legs
  DROP COLUMN IF EXISTS freight_description CASCADE;

ALTER TABLE booking_legs
  DROP COLUMN IF EXISTS freight_weight CASCADE;

ALTER TABLE booking_legs
  DROP COLUMN IF EXISTS freight_weight_kg CASCADE;

-- Add departure_time and arrival_time for schedule tracking
ALTER TABLE booking_legs
  ADD COLUMN IF NOT EXISTS departure_time TIMESTAMPTZ;

ALTER TABLE booking_legs
  ADD COLUMN IF NOT EXISTS arrival_time TIMESTAMPTZ;

-- ============================================================================
-- 4. booking_leg_passengers (NEW — THE KEY TABLE)
--    Associates a passenger with a specific leg of a booking.
--    All per-leg, per-passenger data lives here.
-- ============================================================================
CREATE TABLE IF NOT EXISTS booking_leg_passengers (
  id                      SERIAL PRIMARY KEY,

  -- Foreign keys
  booking_leg_id          INTEGER       NOT NULL REFERENCES booking_legs(id) ON DELETE CASCADE,
  booking_passenger_id    INTEGER       NOT NULL REFERENCES booking_passengers(id) ON DELETE CASCADE,

  -- Per-leg passenger weight (clothed = body_weight + clothing_allowance, verified at check-in)
  clothed_weight_kg       NUMERIC(5,1),  -- NULL until check-in; defaults to body_weight_kg + clothing_allowance_kg

  -- Per-leg baggage
  baggage_weight_kg       NUMERIC(5,1)  NOT NULL DEFAULT 0,
  baggage_description     TEXT,

  -- Per-leg freight (passenger-specific)
  freight_description     TEXT,
  freight_weight_kg       NUMERIC(8,1)  NOT NULL DEFAULT 0,

  -- Per-leg seat assignment
  seat_number             VARCHAR(10),

  -- Per-leg check-in status
  checked_in              BOOLEAN       NOT NULL DEFAULT false,
  checked_in_at           TIMESTAMPTZ,
  checked_in_by           INTEGER       REFERENCES users(id),

  -- Per-leg boarding status
  boarded                 BOOLEAN       NOT NULL DEFAULT false,
  boarded_at              TIMESTAMPTZ,

  -- Metadata
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- A passenger can only appear once per leg
  UNIQUE (booking_leg_id, booking_passenger_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_blp_booking_leg_id
  ON booking_leg_passengers(booking_leg_id);

CREATE INDEX IF NOT EXISTS idx_blp_booking_passenger_id
  ON booking_leg_passengers(booking_passenger_id);

CREATE INDEX IF NOT EXISTS idx_blp_checked_in
  ON booking_leg_passengers(checked_in)
  WHERE checked_in = false;

CREATE INDEX IF NOT EXISTS idx_blp_boarded
  ON booking_leg_passengers(boarded)
  WHERE boarded = false;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trg_booking_leg_passengers_updated_at ON booking_leg_passengers;
CREATE TRIGGER trg_booking_leg_passengers_updated_at
  BEFORE UPDATE ON booking_leg_passengers
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 5. seat_assignments (deprecated — replaced by booking_leg_passengers.seat_number)
--    Keep for backward compatibility during migration, drop later.
-- ============================================================================
-- No immediate changes. Will be deprecated in favor of booking_leg_passengers.seat_number.

-- ============================================================================
-- 6. flight_manifests (deprecated — computed from booking_leg_passengers)
-- ============================================================================
-- No immediate changes. Will be replaced by real-time computation.

-- ============================================================================
-- 7. Helper function: Get default clothed weight for a passenger on a leg
-- ============================================================================
CREATE OR REPLACE FUNCTION get_default_clothed_weight(p_booking_passenger_id INTEGER)
RETURNS NUMERIC(5,1) AS $$
DECLARE
  v_body_weight_kg NUMERIC(5,1);
  v_allowance_kg NUMERIC(3,1);
BEGIN
  SELECT bp.body_weight_kg, bp.clothing_allowance_kg
  INTO v_body_weight_kg, v_allowance_kg
  FROM booking_passengers bp
  WHERE bp.id = p_booking_passenger_id;

  RETURN COALESCE(v_body_weight_kg, 70) + COALESCE(v_allowance_kg, 2.0);
END;
$$ LANGUAGE plpgsql;
```

### 3.2 Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| [`booking_passengers.body_weight_kg`](plans/schema-redesign-passenger-leg.md) stores the passenger's base body weight | This is passenger-level data, verified at check-in. It represents the passenger's actual body weight on the scale. |
| [`booking_leg_passengers.clothed_weight_kg`](plans/schema-redesign-passenger-leg.md) stores the leg-specific clothed weight | Defaults to `body_weight_kg + clothing_allowance_kg` at creation time. Can be overridden at check-in when the passenger is weighed with clothes on. This preserves the audit trail: the passenger's base weight stays unchanged, while the leg-specific clothed weight captures what was actually used for that flight. |
| [`booking_leg_passengers.baggage_weight_kg`](plans/schema-redesign-passenger-leg.md) is per-leg | A passenger can have 15kg on the outbound and 0kg on the return. The system can also propagate a default from the passenger's preference. |
| [`booking_leg_passengers.freight_*`](plans/schema-redesign-passenger-leg.md) is per-leg, per-passenger | Freight is now associable with a specific passenger on a specific leg, enabling accurate tracking and billing. |
| A passenger can exist on some legs but not others | The junction table only contains rows for legs the passenger actually travels on. This is the core fix. |
| [`booking_leg_passengers.checked_in`](plans/schema-redesign-passenger-leg.md) is per-leg | A passenger can be checked in for leg 1 but not leg 2. The check-in counter UI shows per-leg check-in status. |
| [`booking_leg_passengers.seat_number`](plans/schema-redesign-passenger-leg.md) is per-leg | A passenger may have different seats on different legs of a multi-leg sortie. |

### 3.3 Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        BOOKINGS                                 │
│  id (PK)                                                        │
│  booking_reference (UK)                                         │
│  user_id (FK → users)                                           │
│  status                                                         │
│  organization_id (FK → organizations)                           │
│  total_amount_gbp                                               │
│  payment_status                                                 │
│  booking_source                                                 │
│  created_by (FK → users)                                        │
│  created_at                                                     │
└──────────┬────────────────────────────────────┬─────────────────┘
           │ 1:N                                │ 1:N
           ▼                                    ▼
┌──────────────────────────┐    ┌──────────────────────────────────┐
│     BOOKING_LEGS         │    │    BOOKING_PASSENGERS            │
│  id (PK)                 │    │  id (PK)                        │
│  booking_id (FK)         │    │  booking_id (FK)                │
│  flight_id (FK → flights)│    │  user_id (FK → users)           │
│  origin_code             │    │  first_name                     │
│  destination_code        │    │  last_name                      │
│  leg_date                │    │  email                          │
│  leg_sequence            │    │  phone                          │
│  departure_time          │    │  date_of_birth                  │
│  arrival_time            │    │  body_weight_kg                 │
│  status                  │    │  clothing_allowance_kg          │
│  created_at              │    │  residency_status               │
└──────────┬───────────────┘    │  special_requirements           │
           │ 1:N                │  created_at                     │
           ▼                    └──────────┬───────────────────────┘
┌──────────────────────────────────────────┘
│
│ N:1
▼
┌─────────────────────────────────────────────────────────────────┐
│                    BOOKING_LEG_PASSENGERS                        │
│  id (PK)                                                        │
│  booking_leg_id (FK → booking_legs)                             │
│  booking_passenger_id (FK → booking_passengers)                 │
│  UNIQUE (booking_leg_id, booking_passenger_id)                  │
│                                                                 │
│  clothed_weight_kg          -- Per-leg, verified at check-in    │
│  baggage_weight_kg          -- Per-leg, can vary                 │
│  baggage_description        -- Per-leg                          │
│  freight_description        -- Per-leg, per-passenger            │
│  freight_weight_kg          -- Per-leg, per-passenger            │
│  seat_number                -- Per-leg                          │
│  checked_in                 -- Per-leg                          │
│  checked_in_at              -- Per-leg                          │
│  checked_in_by (FK → users) -- Per-leg                          │
│  boarded                    -- Per-leg                          │
│  boarded_at                 -- Per-leg                          │
│  created_at                                                     │
│  updated_at                                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Migration Strategy

### 4.1 Step-by-Step Migration

#### Phase 1: Create New Tables (Non-Destructive)

```sql
-- Step 1: Create the booking_leg_passengers table
-- (DDL shown in Section 3.1 above)

-- Step 2: Add new columns to booking_passengers (renamed from passengers)
ALTER TABLE IF EXISTS passengers RENAME TO booking_passengers;
ALTER TABLE booking_passengers RENAME COLUMN clothed_body_weight_kg TO body_weight_kg;
ALTER TABLE booking_passengers ADD COLUMN clothing_allowance_kg NUMERIC(3,1) NOT NULL DEFAULT 2.0;
ALTER TABLE booking_passengers ADD COLUMN special_requirements TEXT;
```

#### Phase 2: Data Migration

```sql
-- Step 3: Populate booking_leg_passengers from existing data
-- For each passenger on each booking, create a booking_leg_passengers row
-- for EVERY leg of that booking (preserving current behavior initially).
INSERT INTO booking_leg_passengers (
  booking_leg_id,
  booking_passenger_id,
  clothed_weight_kg,
  baggage_weight_kg,
  checked_in,
  seat_number
)
SELECT
  bl.id AS booking_leg_id,
  bp.id AS booking_passenger_id,
  bp.body_weight_kg AS clothed_weight_kg,        -- clothed = body weight (legacy)
  bp.baggage_weight_kg,                           -- same baggage on all legs (legacy)
  bp.checked_in,                                  -- same check-in on all legs (legacy)
  COALESCE(sa.seat_number, NULL) AS seat_number   -- seat from seat_assignments
FROM booking_passengers bp
JOIN booking_legs bl ON bl.booking_id = bp.booking_id
LEFT JOIN seat_assignments sa
  ON sa.passenger_id = bp.id
  AND sa.flight_id = bl.flight_id
WHERE bp.booking_id IS NOT NULL
  AND bl.id IS NOT NULL;

-- Step 4: Migrate freight data from booking_legs to booking_leg_passengers
-- Since freight was per-leg (not per-passenger), we distribute it evenly
-- among passengers on that leg, or assign to the first passenger.
UPDATE booking_leg_passengers blp
SET
  freight_description = bl.freight_description,
  freight_weight_kg = bl.freight_weight_kg / (
    SELECT COUNT(*) FROM booking_leg_passengers blp2
    WHERE blp2.booking_leg_id = blp.booking_leg_id
  )
FROM booking_legs bl
WHERE blp.booking_leg_id = bl.id
  AND (bl.freight_description IS NOT NULL OR bl.freight_weight_kg > 0);
```

#### Phase 3: Update Foreign Key References

```sql
-- Step 5: Update seat_assignments to reference booking_leg_passengers
-- (Optional: keep seat_assignments for backward compatibility during transition)
-- New code should use booking_leg_passengers.seat_number instead.

-- Step 6: Update checkin_reminders to reference booking_leg_passengers
-- Add a booking_leg_passenger_id column
ALTER TABLE checkin_reminders
  ADD COLUMN IF NOT EXISTS booking_leg_passenger_id INTEGER
  REFERENCES booking_leg_passengers(id);
```

#### Phase 4: Drop Deprecated Columns (After Verification)

```sql
-- Step 7: Only after all code has been updated and verified:
ALTER TABLE booking_passengers
  DROP COLUMN IF EXISTS baggage_weight_kg CASCADE,
  DROP COLUMN IF EXISTS checked_in CASCADE,
  DROP COLUMN IF EXISTS seat_row CASCADE,
  DROP COLUMN IF EXISTS seat_column CASCADE,
  DROP COLUMN IF EXISTS weight CASCADE;

ALTER TABLE booking_legs
  DROP COLUMN IF EXISTS freight_description CASCADE,
  DROP COLUMN IF EXISTS freight_weight CASCADE,
  DROP COLUMN IF EXISTS freight_weight_kg CASCADE;
```

### 4.2 Backward Compatibility Considerations

1. **Read views**: Create a view `passengers` that mimics the old schema for backward compatibility during the transition period:

```sql
CREATE OR REPLACE VIEW passengers AS
SELECT
  bp.id,
  bp.booking_id,
  bp.user_id,
  bp.first_name,
  bp.last_name,
  bp.email,
  bp.phone,
  bp.date_of_birth,
  bp.body_weight_kg AS clothed_body_weight_kg,
  bp.residency_status,
  bp.special_requirements,
  bp.created_at,
  bp.updated_at,
  -- Aggregate leg-specific data (for backward compat, use first leg)
  (SELECT blp.baggage_weight_kg
   FROM booking_leg_passengers blp
   JOIN booking_legs bl ON bl.id = blp.booking_leg_id
   WHERE blp.booking_passenger_id = bp.id
   ORDER BY bl.leg_sequence
   LIMIT 1) AS baggage_weight_kg,
  (SELECT blp.checked_in
   FROM booking_leg_passengers blp
   JOIN booking_legs bl ON bl.id = blp.booking_leg_id
   WHERE blp.booking_passenger_id = bp.id
   ORDER BY bl.leg_sequence
   LIMIT 1) AS checked_in
FROM booking_passengers bp;
```

2. **API compatibility**: The repository layer should be updated first to use the new tables, then the routes can be updated incrementally.

3. **Rollback plan**: Keep the old columns and tables during Phase 1-3. If issues arise, the application can fall back to the old schema by reverting the repository code. The data in `booking_leg_passengers` is additive — it doesn't destroy existing data.

### 4.3 Rollback Script

```sql
-- Rollback: Reverse the migration
DROP TABLE IF EXISTS booking_leg_passengers CASCADE;

ALTER TABLE IF EXISTS booking_passengers RENAME TO passengers;

ALTER TABLE passengers
  RENAME COLUMN body_weight_kg TO clothed_body_weight_kg;

ALTER TABLE passengers
  DROP COLUMN IF EXISTS clothing_allowance_kg,
  DROP COLUMN IF EXISTS special_requirements;

ALTER TABLE passengers
  ADD COLUMN baggage_weight_kg NUMERIC(5,1),
  ADD COLUMN checked_in BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN seat_row INTEGER,
  ADD COLUMN seat_column VARCHAR(5),
  ADD COLUMN weight NUMERIC(10,2) DEFAULT 0;

ALTER TABLE booking_legs
  ADD COLUMN freight_description TEXT,
  ADD COLUMN freight_weight NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN freight_weight_kg NUMERIC(8,1);
```

---

## 5. Query Patterns (Before vs After)

### 5.1 Find Passengers on a Flight

**Before (broken)** — All passengers on the booking are assumed to be on all legs:
```sql
SELECT p.*
FROM passengers p
JOIN bookings b ON b.id = p.booking_id
JOIN booking_legs bl ON bl.booking_id = b.id
WHERE bl.flight_id = $1;
-- WRONG: Returns passengers who are on other legs of the same booking
```

**After (correct)** — Only passengers explicitly associated with the leg:
```sql
SELECT bp.*
FROM booking_passengers bp
JOIN booking_leg_passengers blp ON blp.booking_passenger_id = bp.id
JOIN booking_legs bl ON bl.id = blp.booking_leg_id
WHERE bl.flight_id = $1;
-- CORRECT: Only passengers actually on this specific leg
```

### 5.2 Check In a Passenger for a Specific Leg

**Before (broken)** — Updates passenger globally, no leg context:
```sql
UPDATE passengers
SET clothed_body_weight_kg = $1,
    baggage_weight_kg = $2,
    checked_in = true
WHERE id = $3;
-- WRONG: Overwrites baggage for all legs
```

**After (correct)** — Updates per-leg, per-passenger:
```sql
UPDATE booking_leg_passengers blp
SET clothed_weight_kg = $1,
    baggage_weight_kg = $2,
    checked_in = true,
    checked_in_at = NOW(),
    checked_in_by = $3
FROM booking_legs bl
WHERE blp.booking_leg_id = bl.id
  AND blp.booking_passenger_id = $4
  AND bl.id = $5;  -- specific leg
-- CORRECT: Only updates this passenger on this specific leg
```

### 5.3 Compute Weight & Balance for a Flight Leg

**Before (broken)** — Uses hardcoded estimates:
```typescript
// weight-balance.ts:24-25
const STANDARD_PASSENGER_WEIGHT_KG = 70;
const STANDARD_BAGGAGE_WEIGHT_KG = 15;
```

**After (correct)** — Queries actual per-leg, per-passenger data:
```sql
SELECT
  COUNT(*) AS passenger_count,
  SUM(COALESCE(blp.clothed_weight_kg, bp.body_weight_kg + bp.clothing_allowance_kg, 70)) AS total_passenger_weight_kg,
  SUM(COALESCE(blp.baggage_weight_kg, 0)) AS total_baggage_weight_kg,
  SUM(COALESCE(blp.freight_weight_kg, 0)) AS total_freight_weight_kg
FROM booking_leg_passengers blp
JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
JOIN booking_legs bl ON bl.id = blp.booking_leg_id
WHERE bl.flight_id = $1
  AND blp.checked_in = true;
-- CORRECT: Uses actual verified weights for this specific flight leg
```

### 5.4 Find Unassigned Passengers

**Before (broken)** — Finds unassigned booking legs, not passengers:
```sql
SELECT bl.*
FROM booking_legs bl
JOIN bookings b ON b.id = bl.booking_id
WHERE bl.flight_id IS NULL
  AND b.status NOT IN ('cancelled', 'completed');
```

**After (correct)** — Finds passengers on unassigned legs with their per-leg data:
```sql
SELECT
  bp.first_name,
  bp.last_name,
  bl.origin_code,
  bl.destination_code,
  bl.leg_date,
  blp.baggage_weight_kg,
  blp.freight_weight_kg,
  COALESCE(blp.clothed_weight_kg, bp.body_weight_kg + bp.clothing_allowance_kg) AS effective_weight
FROM booking_leg_passengers blp
JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
JOIN booking_legs bl ON bl.id = blp.booking_leg_id
JOIN bookings b ON b.id = bl.booking_id
WHERE bl.flight_id IS NULL
  AND b.status NOT IN ('cancelled', 'completed')
ORDER BY bl.leg_date, bl.origin_code;
```

### 5.5 Generate Boarding Pass

**Before (broken)** — Single boarding pass for entire booking:
```sql
SELECT p.first_name, p.last_name, b.booking_reference,
       bl.origin_code, bl.destination_code, bl.leg_date,
       sa.seat_number
FROM passengers p
JOIN bookings b ON b.id = p.booking_id
JOIN booking_legs bl ON bl.booking_id = b.id AND bl.leg_sequence = 1
LEFT JOIN seat_assignments sa ON sa.passenger_id = p.id
WHERE p.id = $1;
```

**After (correct)** — Per-leg boarding passes:
```sql
SELECT
  bp.first_name,
  bp.last_name,
  b.booking_reference,
  bl.origin_code,
  bl.destination_code,
  bl.leg_date,
  bl.leg_sequence,
  blp.seat_number,
  blp.checked_in,
  blp.boarded,
  COALESCE(blp.baggage_weight_kg, 0) AS baggage_weight_kg
FROM booking_leg_passengers blp
JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
JOIN booking_legs bl ON bl.id = blp.booking_leg_id
JOIN bookings b ON b.id = bl.booking_id
WHERE bp.id = $1
ORDER BY bl.leg_sequence;
```

### 5.6 Passenger Manifest for a Flight

**Before (broken)** — Implicit all-passengers assumption:
```sql
-- From operations.schedule._index.tsx:212-229
SELECT bl.flight_id, p.id AS passenger_id, u.name AS passenger_name,
       bl.origin_code, bl.destination_code, bl.leg_sequence,
       p.clothed_body_weight_kg, p.baggage_weight_kg
FROM booking_legs bl
JOIN bookings b ON b.id = bl.booking_id
JOIN passengers p ON p.booking_id = b.id
JOIN users u ON u.id = b.user_id
WHERE bl.flight_id IS NOT NULL;
```

**After (correct)** — Explicit per-leg passenger association:
```sql
SELECT
  bl.flight_id,
  bp.id AS passenger_id,
  CONCAT(bp.first_name, ' ', bp.last_name) AS passenger_name,
  bl.origin_code,
  bl.destination_code,
  bl.leg_sequence,
  COALESCE(blp.clothed_weight_kg, bp.body_weight_kg + bp.clothing_allowance_kg) AS clothed_body_weight_kg,
  blp.baggage_weight_kg,
  blp.freight_weight_kg,
  blp.seat_number,
  blp.checked_in,
  blp.boarded
FROM booking_leg_passengers blp
JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
JOIN booking_legs bl ON bl.id = blp.booking_leg_id
WHERE bl.flight_id = $1
ORDER BY bl.leg_sequence, bp.last_name, bp.first_name;

### 5.7 Passenger's Itinerary View

**Before (broken)** — Shows all legs, but cannot indicate which legs the passenger is actually on:
```sql
SELECT bl.*
FROM booking_legs bl
JOIN bookings b ON b.id = bl.booking_id
JOIN passengers p ON p.booking_id = b.id
WHERE p.id = $1
ORDER BY bl.leg_sequence;
-- WRONG: Shows all legs of the booking, even ones the passenger isn't on
```

**After (correct)** — Shows only legs the passenger is explicitly on:
```sql
SELECT
  bl.*,
  blp.seat_number,
  blp.checked_in,
  blp.baggage_weight_kg,
  blp.freight_weight_kg,
  COALESCE(blp.clothed_weight_kg, bp.body_weight_kg + bp.clothing_allowance_kg) AS effective_weight
FROM booking_leg_passengers blp
JOIN booking_legs bl ON bl.id = blp.booking_leg_id
JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
WHERE blp.booking_passenger_id = $1
ORDER BY bl.leg_sequence;
-- CORRECT: Only shows legs this passenger is actually traveling on
```

### 5.8 Summary Table

| Operation | Before (broken) | After (correct) |
|-----------|----------------|-----------------|
| Find passengers on a flight | JOIN passengers → booking → booking_legs (all passengers on booking) | JOIN booking_leg_passengers → booking_passengers (only passengers on that leg) |
| Check in a passenger for a specific leg | UPDATE passengers SET baggage_weight_kg, checked_in (global, no leg context) | UPDATE booking_leg_passengers SET baggage_weight_kg, checked_in (per-leg, per-passenger) |
| Compute weight & balance for a flight leg | Hardcoded STANDARD_PASSENGER_WEIGHT_KG=70, STANDARD_BAGGAGE_WEIGHT_KG=15 | SUM of actual clothed_weight_kg and baggage_weight_kg from booking_leg_passengers |
| Find unassigned passengers | Finds unassigned booking_legs only (no passenger context) | Finds passengers on unassigned legs with per-leg weight/baggage data |
| Generate boarding pass | Single pass for first leg only, no per-leg differentiation | Per-leg boarding passes with leg-specific seat, baggage, check-in status |
| Passenger manifest for a flight | Implicit: all passengers on booking → all legs (cartesian explosion) | Explicit: only passengers associated with each specific leg |
| Passenger's itinerary view | Shows all legs of the booking | Shows only legs the passenger is actually traveling on |

---

## 6. Impact Analysis

### 6.1 Routes/Components Needing Changes

| File | Impact | Priority |
|------|--------|----------|
| [`app/routes/checkin.counter.tsx`](app/routes/checkin.counter.tsx) | **High**: Must show per-leg check-in UI. Currently checks in passenger globally. Needs to show leg selector and update `booking_leg_passengers` instead of `passengers`. | Critical |
| [`app/routes/operations.schedule._index.tsx`](app/routes/operations.schedule._index.tsx) | **High**: The manifest query at lines 212-229 must be rewritten to use `booking_leg_passengers`. The `UnassignedBookingRow` query at lines 375-397 must also be updated. | Critical |
| [`app/routes/operations.bookings.$bookingId.tsx`](app/routes/operations.bookings.$bookingId.tsx) | **High**: Loader fetches passengers and legs separately. Must now also fetch `booking_leg_passengers` to show per-leg passenger data. | High |
| [`app/routes/bookings.$bookingId.tsx`](app/routes/bookings.$bookingId.tsx) | **High**: Passenger-facing booking detail must show per-leg passenger associations. | High |
| [`app/routes/operations.bookings.new.tsx`](app/routes/operations.bookings.new.tsx) | **Medium**: Booking creation must create `booking_leg_passengers` rows when passengers are added. Currently creates passengers only. | High |
| [`app/routes/bookings.new.tsx`](app/routes/bookings.new.tsx) | **Medium**: Same as above for passenger-facing booking creation. | Medium |
| [`app/routes/checkin.lookup.tsx`](app/routes/checkin.lookup.tsx) | **Medium**: Search queries need updating to use new schema. | Medium |

### 6.2 Repository Methods Needing Rewriting

| Repository | Method | Change Required |
|------------|--------|-----------------|
| [`booking.ts`](app/utils/repositories/booking.ts) | `createPassengers()` | Must also create `booking_leg_passengers` rows for each passenger on each leg |
| [`booking.ts`](app/utils/repositories/booking.ts) | `getPassengers()` | Must join through `booking_leg_passengers` or return all passengers on the booking |
| [`booking.ts`](app/utils/repositories/booking.ts) | `findAll()`, `findByStatus()`, `search()` | The `firstLeg` join pattern is mostly OK, but passenger data queries need updating |
| [`booking-leg.ts`](app/utils/repositories/booking-leg.ts) | All methods | Add `booking_leg_passengers` join where needed |
| [`checkin.ts`](app/utils/repositories/checkin.ts) | `confirmCheckin()` | Must update `booking_leg_passengers` instead of `passengers`. Requires `booking_leg_id` parameter. |
| [`checkin.ts`](app/utils/repositories/checkin.ts) | `getPassengerForCheckin()` | Must join through `booking_leg_passengers` |
| [`checkin.ts`](app/utils/repositories/checkin.ts) | `searchBookings()` | Must include leg context in search results |

**New repository needed**: `booking-leg-passenger.ts`

```typescript
// app/utils/repositories/booking-leg-passenger.ts
export interface BookingLegPassengerRow {
  id: number;
  booking_leg_id: number;
  booking_passenger_id: number;
  clothed_weight_kg: number | null;
  baggage_weight_kg: number;
  baggage_description: string | null;
  freight_description: string | null;
  freight_weight_kg: number;
  seat_number: string | null;
  checked_in: boolean;
  checked_in_at: string | null;
  checked_in_by: number | null;
  boarded: boolean;
  boarded_at: string | null;
  created_at: string;
  updated_at: string;
}

export const bookingLegPassengerRepository = {
  async findByLegId(legId: number): Promise<BookingLegPassengerRow[]> { ... },
  async findByPassengerId(passengerId: number): Promise<BookingLegPassengerRow[]> { ... },
  async findByFlightId(flightId: number): Promise<BookingLegPassengerRow[]> { ... },
  async checkIn(id: number, clothedWeightKg: number, baggageWeightKg: number, checkedInBy: number): Promise<void> { ... },
  async board(id: number): Promise<void> { ... },
  async create(data: CreateBookingLegPassenger): Promise<BookingLegPassengerRow> { ... },
  async bulkCreate(legId: number, passengerIds: number[]): Promise<void> { ... },
};
```

### 6.3 Scheduling Logic Impact

| File | Impact | Details |
|------|--------|---------|
| [`cluster-bookings.ts`](app/utils/scheduling/cluster-bookings.ts) | **Medium** | The `passengerCount` estimate (line 31: `legs.length`) should be replaced with actual passenger count from `booking_leg_passengers`. |
| [`weight-balance.ts`](app/utils/scheduling/weight-balance.ts) | **High** | Must replace hardcoded `STANDARD_PASSENGER_WEIGHT_KG` and `STANDARD_BAGGAGE_WEIGHT_KG` with actual queries against `booking_leg_passengers`. The `computeWeightBalance` function needs access to per-leg passenger data. |
| [`flight-validation.ts`](app/utils/scheduling/flight-validation.ts) | **Medium** | The `ValidationPassenger` interface already has `clothed_body_weight_kg` and `baggage_weight_kg` — these should be populated from `booking_leg_passengers` instead of the old `passengers` table. |
| [`index.ts`](app/utils/scheduling/index.ts) | **Low** | The orchestrator doesn't directly query passenger data, but the phases it calls do. No structural changes needed. |

### 6.4 Check-In Counter Impact

The check-in counter at [`checkin.counter.tsx`](app/routes/checkin.counter.tsx) is the most impacted UI. Currently:

1. **Loader** (lines 12-48): Fetches booking, legs, and passengers. Must now also fetch `booking_leg_passengers` to show per-leg check-in status.
2. **Action** (lines 50-103): The `checkin` intent updates `passengers` globally. Must now accept a `legId` parameter and update `booking_leg_passengers`.
3. **UI** (lines 191-261): Shows a single weight/baggage form per passenger. Must now show a per-leg form for each passenger, with leg selector.

**Proposed check-in UI flow after redesign:**

```
┌─────────────────────────────────────────────────────┐
│  Booking: ABC12345  |  Passenger: John Doe          │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Leg 1: PSA → MPN  (22 May 2026)                    │
│  ┌─────────────────────────────────────────────┐    │
│  │  Weight: [72.0] kg  Baggage: [15.0] kg      │    │
│  │  [✓ Check In]  Status: Not checked in       │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  Leg 2: MPN → PSA  (25 May 2026)                    │
│  ┌─────────────────────────────────────────────┐    │
│  │  Weight: [72.0] kg  Baggage: [0.0] kg       │    │
│  │  [✓ Check In]  Status: Not checked in       │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 6.5 Weight & Balance Computation Impact

The weight-balance module at [`weight-balance.ts`](app/utils/scheduling/weight-balance.ts) currently uses hardcoded constants. After the redesign:

```typescript
// Before (weight-balance.ts:24-25)
const STANDARD_PASSENGER_WEIGHT_KG = 70;
const STANDARD_BAGGAGE_WEIGHT_KG = 15;

// After — query actual data
async function getLegPassengerWeights(flightLegId: number): Promise<{
  passengerCount: number;
  totalPassengerWeightKg: number;
  totalBaggageWeightKg: number;
  totalFreightWeightKg: number;
}> {
  const result = await db.query(`
    SELECT
      COUNT(*) AS passenger_count,
      SUM(COALESCE(blp.clothed_weight_kg, bp.body_weight_kg + bp.clothing_allowance_kg, 70)) AS total_passenger_weight_kg,
      SUM(COALESCE(blp.baggage_weight_kg, 0)) AS total_baggage_weight_kg,
      SUM(COALESCE(blp.freight_weight_kg, 0)) AS total_freight_weight_kg
    FROM booking_leg_passengers blp
    JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
    JOIN booking_legs bl ON bl.id = blp.booking_leg_id
    WHERE bl.flight_id = $1
  `, [flightLegId]);
  return result.rows[0];
}
```

### 6.6 Export Service Impact

Any export functionality (manifests, loadsheets, invoices) that queries passenger data must be updated to use the new schema. The [`flight_manifests`](migrations/001_create_tables.sql:281) table may become a computed/cached view rather than a stored table.

---

## 7. Best Practices for Hierarchical/Conditional Data

### 7.1 Patterns for Managing the Booking → Leg → Passenger Hierarchy

**Pattern 1: Create booking_leg_passengers at booking time**

When a booking is created with passengers and legs, immediately create `booking_leg_passengers` rows for every passenger-leg combination. This ensures the junction table is always populated.

```typescript
// In booking creation flow:
async function createBookingWithPassengers(data: CreateBookingInput) {
  const booking = await bookingRepository.createPending(data.userId, ...);

  // Create legs
  const legs = [];
  for (let i = 0; i < data.legs.length; i++) {
    const leg = await bookingLegRepository.create({ booking_id: booking.id, ... });
    legs.push(leg);
  }

  // Create passengers
  const passengers = [];
  for (const p of data.passengers) {
    const passenger = await bookingPassengerRepository.create({ booking_id: booking.id, ... });
    passengers.push(passenger);
  }

  // Create booking_leg_passengers for every passenger on every leg
  for (const leg of legs) {
    for (const passenger of passengers) {
      await bookingLegPassengerRepository.create({
        booking_leg_id: leg.id,
        booking_passenger_id: passenger.id,
        clothed_weight_kg: null, // will be set at check-in
        baggage_weight_kg: 0,    // default, can be updated per leg
      });
    }
  }
}
```

**Pattern 2: Selective passenger-leg association**

For itineraries where passengers are on different legs, create `booking_leg_passengers` only for the legs each passenger travels on:

```typescript
// For each passenger, specify which legs they're on
for (const passenger of passengers) {
  for (const legId of passenger.legIds) { // passenger specifies which legs
    await bookingLegPassengerRepository.create({
      booking_leg_id: legId,
      booking_passenger_id: passenger.id,
      ...
    });
  }
}
```

### 7.2 Handling Conditional Data (Baggage on Some Legs But Not Others)

**Strategy: Default propagation with per-leg override**

1. When creating `booking_leg_passengers`, propagate the passenger's default baggage weight (if any) to all legs.
2. Allow per-leg override at booking creation time or later via the booking detail UI.
3. At check-in, the counter staff sees the current value and can override it.

```typescript
// Default propagation
const defaultBaggage = passenger.default_baggage_weight_kg ?? 0;
for (const leg of legs) {
  await bookingLegPassengerRepository.create({
    booking_leg_id: leg.id,
    booking_passenger_id: passenger.id,
    baggage_weight_kg: leg.overrideBaggage ?? defaultBaggage,
    ...
  });
}
```

### 7.3 Default Propagation Strategies

| Field | Source | Default | Override Point |
|-------|--------|---------|----------------|
| `clothed_weight_kg` | `body_weight_kg + clothing_allowance_kg` | Computed at creation | Check-in counter |
| `baggage_weight_kg` | Passenger preference or 0 | 0 | Booking creation, booking detail, check-in |
| `freight_weight_kg` | Per-leg, per-passenger input | 0 | Booking creation, booking detail |
| `seat_number` | System assignment or manual | NULL | Seat selection UI, check-in |

### 7.4 Validation Rules at Each Level

**Booking level:**
- Must have at least one leg
- Must have at least one passenger
- Each passenger must be on at least one leg
- Status transitions must follow the defined pipeline

**Booking Leg level:**
- Origin and destination must be different aerodromes
- Leg date must not be in the past (for new bookings)
- Leg sequence must be unique within the booking
- Flight ID, when assigned, must reference an existing flight

**Booking Leg Passenger level:**
- `clothed_weight_kg` must be > 0 when checked in
- `baggage_weight_kg` must be >= 0
- `freight_weight_kg` must be >= 0
- A passenger cannot be checked in for a leg that has no flight assigned
- A passenger cannot be boarded without being checked in
- `seat_number` must be unique per flight leg (no double-booking seats)

### 7.5 Audit Trail Recommendations

1. **Use `checked_in_by` and `checked_in_at`** on `booking_leg_passengers` to track who checked in the passenger and when.

2. **Use `boarded_by` and `boarded_at`** (add if needed) to track boarding.

3. **Consider a `booking_leg_passenger_audit` table** for tracking changes to weight, baggage, and freight over time:

```sql
CREATE TABLE IF NOT EXISTS booking_leg_passenger_audit (
  id                      SERIAL PRIMARY KEY,
  booking_leg_passenger_id INTEGER NOT NULL REFERENCES booking_leg_passengers(id),
  changed_by              INTEGER REFERENCES users(id),
  changed_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  field_name              VARCHAR(50) NOT NULL,
  old_value               TEXT,
  new_value               TEXT
);
```

4. **Log check-in weight changes** specifically — when a passenger is weighed at check-in, log the old and new `clothed_weight_kg` values.

### 7.6 Concurrency/Locking Considerations for Check-In

Check-in is a high-concurrency operation (multiple counter staff may check in passengers for the same flight). Use row-level locking:

```sql
-- Pessimistic locking for check-in
BEGIN;
SELECT id, clothed_weight_kg, baggage_weight_kg, checked_in
FROM booking_leg_passengers
WHERE id = $1
FOR UPDATE;  -- Lock this row

-- Verify not already checked in
-- Update with verified values
UPDATE booking_leg_passengers
SET clothed_weight_kg = $2,
    baggage_weight_kg = $3,
    checked_in = true,
    checked_in_at = NOW(),
    checked_in_by = $4
WHERE id = $1
  AND checked_in = false;  -- Optimistic check

COMMIT;
```

Alternatively, use optimistic locking with a `version` column:

```sql
ALTER TABLE booking_leg_passengers
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Update with version check
UPDATE booking_leg_passengers
SET clothed_weight_kg = $1,
    baggage_weight_kg = $2,
    checked_in = true,
    checked_in_at = NOW(),
    checked_in_by = $3,
    version = version + 1
WHERE id = $4
  AND version = $5;  -- Optimistic lock check
-- Returns 0 rows if another transaction updated first
```

---

## 8. Appendix: Complete Entity Relationship Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              BOOKINGS                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ id (PK) │ booking_reference (UK) │ user_id (FK) │ status │ source   │   │
│  │ created_by (FK) │ organization_id (FK) │ total_amount_gbp            │   │
│  │ payment_status │ created_at │ updated_at                              │   │
│  └──────────────────────────┬───────────────────────────────────────────┘   │
│                             │                                                │
│                             │ 1:N                                            │
│                             ▼                                                │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         BOOKING_LEGS                                 │   │
│  │  ┌──────────────────────────────────────────────────────────────┐    │   │
│  │  │ id (PK) │ booking_id (FK) │ flight_id (FK → flights)        │    │   │
│  │  │ origin_code (FK → aerodromes)                                │    │   │
│  │  │ destination_code (FK → aerodromes)                           │    │   │
│  │  │ leg_date │ leg_sequence │ status                             │    │   │
│  │  │ departure_time │ arrival_time                                │    │   │
│  │  │ created_at │ updated_at                                      │    │   │
│  │  └──────────────────────────┬───────────────────────────────────┘    │   │
│  └─────────────────────────────┼────────────────────────────────────────┘   │
│                                │ 1:N                                        │
│                                ▼                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                   BOOKING_LEG_PASSENGERS  (JUNCTION TABLE)           │   │
│  │  ┌──────────────────────────────────────────────────────────────┐    │   │
│  │  │ id (PK)                                                     │    │   │
│  │  │ booking_leg_id (FK → booking_legs)                          │    │   │
│  │  │ booking_passenger_id (FK → booking_passengers)              │    │   │
│  │  │ UNIQUE (booking_leg_id, booking_passenger_id)               │    │   │
│  │  │                                                             │    │   │
│  │  │ ┌── Per-leg passenger data ──────────────────────────┐     │    │   │
│  │  │ │ clothed_weight_kg  (verified at check-in)          │     │    │   │
│  │  │ │ baggage_weight_kg  (can vary per leg)              │     │    │   │
│  │  │ │ baggage_description                                │     │    │   │
│  │  │ │ freight_description  (per-passenger, per-leg)      │     │    │   │
│  │  │ │ freight_weight_kg                                  │     │    │   │
│  │  │ │ seat_number                                        │     │    │   │
│  │  │ │ checked_in │ checked_in_at │ checked_in_by (FK)    │     │    │   │
│  │  │ │ boarded │ boarded_at                               │     │    │   │
│  │  │ └────────────────────────────────────────────────────┘     │    │   │
│  │  │                                                             │    │   │
│  │  │ created_at │ updated_at │ version (for optimistic locking)  │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                             │                                                │
│                             │ N:1                                            │
│                             ▼                                                │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      BOOKING_PASSENGERS                              │   │
│  │  ┌──────────────────────────────────────────────────────────────┐    │   │
│  │  │ id (PK) │ booking_id (FK) │ user_id (FK → users)            │    │   │
│  │  │ first_name │ last_name │ email │ phone                      │    │   │
│  │  │ date_of_birth │ nationality │ residency_status               │    │   │
│  │  │ id_document_type │ id_document_number                        │    │   │
│  │  │ body_weight_kg  (passenger-level, verified at check-in)     │    │   │
│  │  │ clothing_allowance_kg  (default 2.0kg)                      │    │   │
│  │  │ special_requirements                                         │    │   │
│  │  │ created_at │ updated_at                                      │    │   │
│  │  └──────────────────────────────────────────────────────────────┘    │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Supporting Tables (unchanged):                                     │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │  flights     │  │ flight_legs  │  │ aerodromes   │              │   │
│  │  │  aircraft    │  │ schedules    │  │ users        │              │   │
│  │  │  pilots      │  │ seat_assignments (deprecated)  │              │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Key Relationships Summary

| Relationship | Type | Via |
|-------------|------|-----|
| Booking → Booking Legs | 1:N | `booking_legs.booking_id` |
| Booking → Booking Passengers | 1:N | `booking_passengers.booking_id` |
| Booking Leg → Booking Leg Passengers | 1:N | `booking_leg_passengers.booking_leg_id` |
| Booking Passenger → Booking Leg Passengers | 1:N | `booking_leg_passengers.booking_passenger_id` |
| Booking Leg → Flight | N:1 | `booking_legs.flight_id` |
| Flight → Flight Legs | 1:N | `flight_legs.flight_id` |
| Booking Leg Passenger → Check-In User | N:1 | `booking_leg_passengers.checked_in_by` |

### Data Flow Summary

```
Booking Creation
  │
  ├── Create booking record (itinerary-level)
  ├── Create booking_legs (legs of the itinerary)
  ├── Create booking_passengers (passenger personal data)
  └── Create booking_leg_passengers (associate passengers with legs)
        │
        ├── clothed_weight_kg = NULL (to be set at check-in)
        ├── baggage_weight_kg = 0 (default, can be overridden)
        └── checked_in = false

Scheduling
  │
  ├── Cluster booking_legs by date/origin/destination
  ├── Create flights and flight_legs
  ├── Assign booking_legs.flight_id
  └── Compute weight & balance from booking_leg_passengers

Check-In
  │
  ├── Select passenger + specific leg
  ├── Weigh passenger → update clothed_weight_kg
  ├── Verify baggage → update baggage_weight_kg
  ├── Assign seat → update seat_number
  └── Set checked_in = true, checked_in_at = NOW()

Boarding
  │
  └── Set boarded = true, boarded_at = NOW()
```