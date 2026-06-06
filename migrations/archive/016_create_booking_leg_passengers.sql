-- ============================================================================
-- FIGAS Airline Booking System – Migration 016
-- Create booking_leg_passengers junction table
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Rename passengers → booking_passengers
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS passengers RENAME TO booking_passengers;

-- Rename the sequence to match
ALTER SEQUENCE IF EXISTS passengers_id_seq RENAME TO booking_passengers_id_seq;

-- ----------------------------------------------------------------------------
-- 2. Create booking_leg_passengers junction table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS booking_leg_passengers (
  id                    SERIAL PRIMARY KEY,
  booking_leg_id        INTEGER       NOT NULL REFERENCES booking_legs(id) ON DELETE CASCADE,
  booking_passenger_id  INTEGER       NOT NULL REFERENCES booking_passengers(id) ON DELETE CASCADE,
  clothed_weight_kg     NUMERIC(5,1),
  baggage_weight_kg     NUMERIC(5,1),
  baggage_description   TEXT,
  freight_description   TEXT,
  freight_weight_kg     NUMERIC(8,1),
  seat_number           VARCHAR(10),
  checked_in            BOOLEAN       NOT NULL DEFAULT false,
  checked_in_at         TIMESTAMPTZ,
  checked_in_by         INTEGER       REFERENCES users(id),
  boarded               BOOLEAN       NOT NULL DEFAULT false,
  boarded_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- A passenger can only be linked to a specific leg once
  CONSTRAINT uq_booking_leg_passenger UNIQUE (booking_leg_id, booking_passenger_id)
);

-- ----------------------------------------------------------------------------
-- 3. Migrate existing passenger data into booking_leg_passengers
--    For each passenger, link them to all booking_legs of their booking.
-- ----------------------------------------------------------------------------
INSERT INTO booking_leg_passengers (
  booking_leg_id,
  booking_passenger_id,
  clothed_weight_kg,
  baggage_weight_kg,
  checked_in,
  created_at,
  updated_at
)
SELECT
  bl.id,
  bp.id,
  bp.clothed_body_weight_kg,
  bp.baggage_weight_kg,
  bp.checked_in,
  bp.created_at,
  bp.updated_at
FROM booking_passengers bp
JOIN booking_legs bl ON bl.booking_id = bp.booking_id
ON CONFLICT (booking_leg_id, booking_passenger_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. Drop columns that have moved to the junction table from booking_passengers
-- ----------------------------------------------------------------------------
ALTER TABLE booking_passengers
  DROP COLUMN IF EXISTS baggage_weight_kg,
  DROP COLUMN IF EXISTS checked_in,
  DROP COLUMN IF EXISTS seat_row,
  DROP COLUMN IF EXISTS seat_column,
  DROP COLUMN IF EXISTS weight;

-- ----------------------------------------------------------------------------
-- 5. Add indexes for performance
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_booking_leg_passengers_leg_id
  ON booking_leg_passengers (booking_leg_id);

CREATE INDEX IF NOT EXISTS idx_booking_leg_passengers_passenger_id
  ON booking_leg_passengers (booking_passenger_id);

CREATE INDEX IF NOT EXISTS idx_booking_leg_passengers_checked_in
  ON booking_leg_passengers (checked_in)
  WHERE checked_in = false;

CREATE INDEX IF NOT EXISTS idx_booking_passengers_booking_id
  ON booking_passengers (booking_id);
