-- ============================================================================
-- FIGAS Airline Booking System – Schedule Enhancement Migration
-- Migration 019: Add schedule audit columns, weight_balance_snapshots table,
--                and schedule_id FK to pilot_assignments
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Add audit columns to schedules table
-- ============================================================================
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id);
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS published_by INTEGER REFERENCES users(id);
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS published_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE schedules ALTER COLUMN notes TYPE TEXT USING notes::TEXT;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS cancelled_by INTEGER REFERENCES users(id);
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- ============================================================================
-- 2. Create weight_balance_snapshots table
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

-- ============================================================================
-- 3. Add schedule_id FK to pilot_assignments
-- ============================================================================
ALTER TABLE pilot_assignments ADD COLUMN IF NOT EXISTS schedule_id INTEGER REFERENCES schedules(id) ON DELETE CASCADE;
ALTER TABLE pilot_assignments ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE pilot_assignments ADD COLUMN IF NOT EXISTS declined_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE pilot_assignments ADD COLUMN IF NOT EXISTS declined_reason TEXT;
ALTER TABLE pilot_assignments ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE pilot_assignments ADD COLUMN IF NOT EXISTS assigned_by INTEGER REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_pilot_assignments_schedule_id ON pilot_assignments(schedule_id);

-- ============================================================================
-- 4. Add scheduling columns to aerodromes table (for per-destination limits)
-- ============================================================================
ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS mtow_limit_kg DECIMAL(10,2);
ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS mlw_limit_kg DECIMAL(10,2);
ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS fuel_available BOOLEAN DEFAULT FALSE;
ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS operating_hours VARCHAR(50);
ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS pilot_briefing_required BOOLEAN DEFAULT FALSE;

COMMIT;
