-- ============================================================================
-- FIGAS Airline Booking System – Reference Data Tables
-- Consolidated from migrations: 003, 004
--
-- This file contains reference/lookup tables used for operational data.
-- Timestamps are included directly in CREATE TABLE (from migration 004).
-- ============================================================================

-- ============================================================================
-- 1. fuel_rules – Fuel calculation rules based on flight time and sectors
--    Created in 003, timestamps added in 004
-- ============================================================================
CREATE TABLE IF NOT EXISTS fuel_rules (
  id                    SERIAL PRIMARY KEY,
  flight_time_minutes   INTEGER NOT NULL,
  sectors               INTEGER NOT NULL,
  required_fuel_kg      NUMERIC(10,2) NOT NULL,
  minimum_fuel_kg       NUMERIC(10,2) NOT NULL,
  fuel_state            VARCHAR(20) NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(flight_time_minutes, sectors)
);

CREATE INDEX IF NOT EXISTS idx_fuel_rules_lookup ON fuel_rules (flight_time_minutes, sectors);

-- ============================================================================
-- 2. aerodrome_distances – Distance matrix between aerodromes (nautical miles)
--    Created in 003, timestamps added in 004
-- ============================================================================
CREATE TABLE IF NOT EXISTS aerodrome_distances (
  id              SERIAL PRIMARY KEY,
  origin_code     VARCHAR(10) NOT NULL REFERENCES aerodromes(code),
  destination_code VARCHAR(10) NOT NULL REFERENCES aerodromes(code),
  distance_nm     NUMERIC(10,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(origin_code, destination_code)
);

CREATE INDEX IF NOT EXISTS idx_aerodrome_distances_origin ON aerodrome_distances (origin_code);
CREATE INDEX IF NOT EXISTS idx_aerodrome_distances_dest ON aerodrome_distances (destination_code);

-- ============================================================================
-- 3. aerodrome_headings – Heading matrix between aerodromes (degrees)
--    Created in 003, timestamps added in 004
-- ============================================================================
CREATE TABLE IF NOT EXISTS aerodrome_headings (
  id                SERIAL PRIMARY KEY,
  origin_code       VARCHAR(10) NOT NULL REFERENCES aerodromes(code),
  destination_code  VARCHAR(10) NOT NULL REFERENCES aerodromes(code),
  heading_degrees   NUMERIC(6,2) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(origin_code, destination_code)
);

CREATE INDEX IF NOT EXISTS idx_aerodrome_headings_origin ON aerodrome_headings (origin_code);
CREATE INDEX IF NOT EXISTS idx_aerodrome_headings_dest ON aerodrome_headings (destination_code);

-- ============================================================================
-- 4. airframe_hours – Airframe maintenance tracking per aircraft
--    Created in 003 (already had timestamps)
-- ============================================================================
CREATE TABLE IF NOT EXISTS airframe_hours (
  id                        SERIAL PRIMARY KEY,
  aircraft_id               INTEGER NOT NULL REFERENCES aircraft(id),
  last_reading_date         DATE NOT NULL,
  total_hours               VARCHAR(20) NOT NULL,
  next_check_date           DATE NOT NULL,
  next_check_type           INTEGER NOT NULL,
  days_remaining            INTEGER NOT NULL,
  next_check_due_hours      VARCHAR(20) NOT NULL,
  hours_until_next_check    VARCHAR(20) NOT NULL,
  next_500_hour_check       VARCHAR(20) NOT NULL,
  hours_until_500_check     VARCHAR(20) NOT NULL,
  next_1000_hour_check      VARCHAR(20) NOT NULL,
  hours_until_1000_check    VARCHAR(20) NOT NULL,
  status                    VARCHAR(50) NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_airframe_hours_aircraft ON airframe_hours (aircraft_id);
CREATE INDEX IF NOT EXISTS idx_airframe_hours_status ON airframe_hours (status);
