-- ============================================================================
-- FIGAS Airline Booking System – Scheduling & Operations Tables
-- Consolidated from migrations: 014, 019 (scheduling parts)
--
-- This file contains scheduling-related tables: schedules, flight_legs,
-- pilot_assignments, weight_balance_snapshots, and ALTER TABLE additions
-- to flights and aerodromes.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. schedules – Daily flight schedules
--    From migration 014, with audit columns from migration 019
-- ============================================================================
CREATE TABLE IF NOT EXISTS schedules (
  id SERIAL PRIMARY KEY,
  schedule_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('building', 'draft', 'approved', 'published', 'cancelled', 'pilot_assigned', 'loadsheet_generated', 'in_progress', 'completed')),
  created_by INTEGER NOT NULL REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  published_by INTEGER REFERENCES users(id),
  published_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  cancelled_by INTEGER REFERENCES users(id),
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancellation_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(schedule_date)
);

CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(schedule_date);
CREATE INDEX IF NOT EXISTS idx_schedules_status ON schedules(status);

-- ============================================================================
-- 2. flight_legs – Individual legs of a multi-stop flight
--    From migration 014
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
--    From migration 014, with schedule_id FK and audit columns from 019
-- ============================================================================
CREATE TABLE IF NOT EXISTS pilot_assignments (
  id SERIAL PRIMARY KEY,
  flight_id INTEGER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  pilot_id INTEGER NOT NULL REFERENCES pilots(id),
  role VARCHAR(20) NOT NULL CHECK (role IN ('captain', 'first_officer', 'relief')),
  status VARCHAR(20) NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'confirmed', 'declined', 'checked_in', 'completed', 'cancelled')),
  schedule_id INTEGER REFERENCES schedules(id) ON DELETE CASCADE,
  confirmed_at TIMESTAMP WITH TIME ZONE,
  declined_at TIMESTAMP WITH TIME ZONE,
  declined_reason TEXT,
  notes TEXT,
  assigned_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(flight_id, pilot_id)
);

CREATE INDEX IF NOT EXISTS idx_pilot_assignments_flight_id ON pilot_assignments(flight_id);
CREATE INDEX IF NOT EXISTS idx_pilot_assignments_pilot_id ON pilot_assignments(pilot_id);
CREATE INDEX IF NOT EXISTS idx_pilot_assignments_schedule_id ON pilot_assignments(schedule_id);

-- ============================================================================
-- 4. weight_balance_snapshots – Weight & balance calculations per flight leg
--    From migration 019 (complete version with all columns).
--    NOTE: The earlier version from migration 014 is superseded by this.
-- ============================================================================
CREATE TABLE IF NOT EXISTS weight_balance_snapshots (
  id SERIAL PRIMARY KEY,
  flight_leg_id INTEGER NOT NULL REFERENCES flight_legs(id) ON DELETE CASCADE,
  schedule_id INTEGER REFERENCES schedules(id) ON DELETE CASCADE,
  passenger_weight_kg DECIMAL(10,2) NOT NULL DEFAULT 0,
  baggage_weight_kg DECIMAL(10,2) NOT NULL DEFAULT 0,
  freight_weight_kg DECIMAL(10,2) NOT NULL DEFAULT 0,
  fuel_weight_kg DECIMAL(10,2) NOT NULL DEFAULT 0,
  crew_weight_kg DECIMAL(10,2) NOT NULL DEFAULT 0,
  empty_weight_kg DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_weight_kg DECIMAL(10,2) NOT NULL DEFAULT 0,
  required_fuel_kg DECIMAL(10,2),
  minimum_fuel_kg DECIMAL(10,2),
  fuel_state VARCHAR(20),
  fuel_rule_applied TEXT,
  total_moment_kgm DECIMAL(10,2),
  cg_position_pct DECIMAL(10,2),
  effective_mtow_kg DECIMAL(10,2),
  effective_mlw_kg DECIMAL(10,2),
  mtow_used_pct DECIMAL(10,2),
  mlw_used_pct DECIMAL(10,2),
  binding_constraint VARCHAR(20),
  binding_constraint_detail TEXT,
  computed_by VARCHAR(50) NOT NULL DEFAULT 'system',
  computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wbs_flight_leg_id ON weight_balance_snapshots(flight_leg_id);
CREATE INDEX IF NOT EXISTS idx_wbs_schedule_id ON weight_balance_snapshots(schedule_id);

COMMIT;
