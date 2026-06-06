-- ============================================================================
-- FIGAS Airline Booking System – Add missing timestamps to reference tables
-- Migration 004: Add created_at / updated_at to fuel_rules, aerodrome_distances,
--                and aerodrome_headings (airframe_hours already has them)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. fuel_rules – Add timestamp columns
-- ---------------------------------------------------------------------------
ALTER TABLE fuel_rules
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ---------------------------------------------------------------------------
-- 2. aerodrome_distances – Add timestamp columns
-- ---------------------------------------------------------------------------
ALTER TABLE aerodrome_distances
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ---------------------------------------------------------------------------
-- 3. aerodrome_headings – Add timestamp columns
-- ---------------------------------------------------------------------------
ALTER TABLE aerodrome_headings
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
