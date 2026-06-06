-- ============================================================================
-- FIGAS Airline Booking System – No-Fly Rules
-- Consolidated from migrations: 017, 018
--
-- This file contains the no_fly_rules table with INTEGER[] day_of_week
-- (from migration 018's ALTER) and all associated constraints and indexes.
-- ============================================================================

-- ============================================================================
-- 1. no_fly_rules – Rules designating days on which flight bookings cannot be made
--    Created in 017, day_of_week altered to INTEGER[] in 018.
--    The consolidated schema uses INTEGER[] directly.
-- ============================================================================
CREATE TABLE IF NOT EXISTS no_fly_rules (
  id                SERIAL PRIMARY KEY,
  label             VARCHAR(255) NOT NULL,
  description       TEXT,
  rule_type         VARCHAR(20) NOT NULL CHECK (rule_type IN ('recurring', 'one_off')),
  is_active         BOOLEAN NOT NULL DEFAULT true,

  -- Recurring fields (used when rule_type = 'recurring')
  day_of_week       INTEGER[],  -- Array of days: 0=Sunday, 1=Monday, ..., 6=Saturday
  season_start      DATE,  -- Optional: start of seasonal window
  season_end        DATE,  -- Optional: end of seasonal window

  -- One-off fields (used when rule_type = 'one_off')
  specific_date     DATE,  -- The specific date this rule applies to

  -- Override resolution
  priority          INTEGER NOT NULL DEFAULT 0,  -- Higher priority wins within same type
  override_reason   TEXT,  -- Why this rule overrides others

  -- Metadata
  created_by        INTEGER NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure recurring rules have day_of_week and one-off rules have specific_date
  CONSTRAINT chk_recurring_has_dow
    CHECK (
      (rule_type = 'recurring' AND array_length(day_of_week, 1) > 0 AND specific_date IS NULL)
      OR
      (rule_type = 'one_off' AND (day_of_week IS NULL OR array_length(day_of_week, 1) IS NULL) AND specific_date IS NOT NULL)
    ),
  -- Ensure season dates are consistent
  CONSTRAINT chk_season_dates
    CHECK (
      (rule_type = 'recurring' AND season_start IS NULL AND season_end IS NULL)
      OR
      (rule_type = 'recurring' AND season_start IS NOT NULL AND season_end IS NOT NULL)
      OR
      (rule_type = 'one_off' AND season_start IS NULL AND season_end IS NULL)
    ),
  -- Ensure season_start <= season_end
  CONSTRAINT chk_season_range
    CHECK (
      season_start IS NULL
      OR season_end IS NULL
      OR season_start <= season_end
    )
);

-- ============================================================================
-- 2. Indexes for common query patterns
-- ============================================================================

-- Filter active rules efficiently
CREATE INDEX IF NOT EXISTS idx_nfr_is_active ON no_fly_rules(is_active);

-- Look up one-off rules by date
CREATE INDEX IF NOT EXISTS idx_nfr_specific_date ON no_fly_rules(specific_date)
  WHERE rule_type = 'one_off' AND is_active = true;

-- Look up recurring rules by day of week (GIN index for array lookups)
CREATE INDEX IF NOT EXISTS idx_nfr_day_of_week ON no_fly_rules USING GIN (day_of_week)
  WHERE rule_type = 'recurring' AND is_active = true;
