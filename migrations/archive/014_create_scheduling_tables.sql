-- ============================================================================
-- FIGAS Airline Booking System – Scheduling Tables
-- Migration 014: Create scheduling-related tables and add scheduling columns
--               to the flights table
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. schedules – Daily flight schedules
-- ============================================================================
CREATE TABLE IF NOT EXISTS schedules (
  id SERIAL PRIMARY KEY,
  schedule_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'published', 'cancelled', 'pilot_assigned', 'loadsheet_generated', 'in_progress', 'completed')),
  created_by INTEGER NOT NULL REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(schedule_date)
);

CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(schedule_date);
CREATE INDEX IF NOT EXISTS idx_schedules_status ON schedules(status);

-- ============================================================================
-- 2. flight_legs – Individual legs of a multi-stop flight
-- ============================================================================
CREATE TABLE IF NOT EXISTS flight_legs (
  id SERIAL PRIMARY KEY,
  flight_id INTEGER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  leg_number INTEGER NOT NULL,
  origin_code VARCHAR(10) NOT NULL,
  destination_code VARCHAR(10) NOT NULL,
  distance_nm DECIMAL(10,2),
  heading DECIMAL(10,2),
  etd TIMESTAMP WITH TIME ZONE,
  eta TIMESTAMP WITH TIME ZONE,
  atd TIMESTAMP WITH TIME ZONE,
  ata TIMESTAMP WITH TIME ZONE,
  pax_on INTEGER DEFAULT 0,
  pax_off INTEGER DEFAULT 0,
  bags_on INTEGER DEFAULT 0,
  bags_off INTEGER DEFAULT 0,
  fuel_uplift_kg DECIMAL(10,2) DEFAULT 0,
  fuel_on_board_kg DECIMAL(10,2) DEFAULT 0,
  tow_kg DECIMAL(10,2) DEFAULT 0,
  lw_kg DECIMAL(10,2) DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(flight_id, leg_number)
);

CREATE INDEX IF NOT EXISTS idx_flight_legs_flight_id ON flight_legs(flight_id);

-- ============================================================================
-- 3. pilot_assignments – Pilot-to-flight assignments
-- ============================================================================
CREATE TABLE IF NOT EXISTS pilot_assignments (
  id SERIAL PRIMARY KEY,
  flight_id INTEGER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  pilot_id INTEGER NOT NULL REFERENCES pilots(id),
  role VARCHAR(20) NOT NULL CHECK (role IN ('captain', 'first_officer', 'relief')),
  status VARCHAR(20) NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'confirmed', 'declined', 'checked_in', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(flight_id, pilot_id)
);

CREATE INDEX IF NOT EXISTS idx_pilot_assignments_flight_id ON pilot_assignments(flight_id);
CREATE INDEX IF NOT EXISTS idx_pilot_assignments_pilot_id ON pilot_assignments(pilot_id);

-- ============================================================================
-- 4. booking_leg_passengers – Passenger-to-booking-leg assignments
-- ============================================================================
CREATE TABLE IF NOT EXISTS booking_leg_passengers (
  id SERIAL PRIMARY KEY,
  booking_leg_id INTEGER NOT NULL REFERENCES booking_legs(id) ON DELETE CASCADE,
  passenger_id INTEGER NOT NULL REFERENCES passengers(id),
  flight_leg_id INTEGER REFERENCES flight_legs(id) ON DELETE SET NULL,
  checked_in BOOLEAN DEFAULT FALSE,
  boarded BOOLEAN DEFAULT FALSE,
  seat VARCHAR(10),
  bags INTEGER DEFAULT 0,
  weight_kg DECIMAL(10,2),
  tag_number VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blp_booking_leg_id ON booking_leg_passengers(booking_leg_id);
CREATE INDEX IF NOT EXISTS idx_blp_passenger_id ON booking_leg_passengers(passenger_id);
CREATE INDEX IF NOT EXISTS idx_blp_flight_leg_id ON booking_leg_passengers(flight_leg_id);

-- ============================================================================
-- 5. Add scheduling columns to flights table
-- ============================================================================
ALTER TABLE flights ADD COLUMN IF NOT EXISTS schedule_id INTEGER REFERENCES schedules(id);
ALTER TABLE flights ADD COLUMN IF NOT EXISTS flight_number VARCHAR(20);
ALTER TABLE flights ADD COLUMN IF NOT EXISTS fuel_required_l DECIMAL(10,2) DEFAULT 0;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS fuel_on_board_l DECIMAL(10,2) DEFAULT 0;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS pax_weight_kg DECIMAL(10,2) DEFAULT 0;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS cargo_weight_kg DECIMAL(10,2) DEFAULT 0;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS zero_fuel_weight_kg DECIMAL(10,2) DEFAULT 0;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_flights_schedule_id ON flights(schedule_id);

COMMIT;
