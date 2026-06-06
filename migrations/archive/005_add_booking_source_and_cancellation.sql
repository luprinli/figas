-- Migration 005: Add booking_source, cancellation tracking, and special_requirements
-- Implements the booking plan's data model enhancements

-- ── bookings table enhancements ──────────────────────────────────────────────

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

CREATE INDEX IF NOT EXISTS idx_bookings_source ON bookings (booking_source);
CREATE INDEX IF NOT EXISTS idx_bookings_created_by ON bookings (created_by);

-- ── passengers table enhancements ────────────────────────────────────────────

ALTER TABLE passengers
  ADD COLUMN IF NOT EXISTS special_requirements TEXT;

-- ── booking_legs table enhancements ──────────────────────────────────────────

ALTER TABLE booking_legs
  ADD COLUMN IF NOT EXISTS departure_date DATE;

-- ── Update existing booking_legs.departure_date from leg_date ────────────────
UPDATE booking_legs
  SET departure_date = leg_date::DATE
  WHERE departure_date IS NULL;
