-- Migration 017: Create no_fly_rules table
-- This table stores rules that designate days on which flight bookings cannot be made.
-- Supports recurring patterns (e.g., every Wednesday in winter) and one-off dates (e.g., public holidays).
-- Rules can be toggled active/inactive without deletion.

-- ============================================================================
-- Step 1: Create the no_fly_rules table
-- ============================================================================
CREATE TABLE IF NOT EXISTS no_fly_rules (
  id                SERIAL PRIMARY KEY,
  label             VARCHAR(255) NOT NULL,
  description       TEXT,
  rule_type         VARCHAR(20) NOT NULL CHECK (rule_type IN ('recurring', 'one_off')),
  is_active         BOOLEAN NOT NULL DEFAULT true,

  -- Recurring fields (used when rule_type = 'recurring')
  day_of_week       INTEGER CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sunday, 1=Monday, ..., 6=Saturday
  season_start      DATE,  -- Optional: start of seasonal window (e.g., '2024-06-01' for winter)
  season_end        DATE,  -- Optional: end of seasonal window (e.g., '2024-08-31')

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
      (rule_type = 'recurring' AND day_of_week IS NOT NULL AND specific_date IS NULL)
      OR
      (rule_type = 'one_off' AND specific_date IS NOT NULL AND day_of_week IS NULL)
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
-- Step 2: Create indexes for common query patterns
-- ============================================================================

-- Filter active rules efficiently
CREATE INDEX IF NOT EXISTS idx_nfr_is_active ON no_fly_rules(is_active);

-- Look up one-off rules by date
CREATE INDEX IF NOT EXISTS idx_nfr_specific_date ON no_fly_rules(specific_date)
  WHERE rule_type = 'one_off' AND is_active = true;

-- Look up recurring rules by day of week
CREATE INDEX IF NOT EXISTS idx_nfr_day_of_week ON no_fly_rules(day_of_week)
  WHERE rule_type = 'recurring' AND is_active = true;

-- ============================================================================
-- Step 3: Create trigger to auto-update updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_nfr_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_nfr_updated_at ON no_fly_rules;
CREATE TRIGGER trg_nfr_updated_at
  BEFORE UPDATE ON no_fly_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_nfr_updated_at();
