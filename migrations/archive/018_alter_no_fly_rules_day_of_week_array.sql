-- Migration 018: Change day_of_week from INTEGER to INTEGER[]
-- Supports multiple days per recurring rule instead of one rule per day.

-- ============================================================================
-- Step 0: Drop the column-level CHECK constraint from migration 017
-- (day_of_week BETWEEN 0 AND 6) which would fail after type change to INTEGER[]
-- ============================================================================
ALTER TABLE no_fly_rules DROP CONSTRAINT IF EXISTS no_fly_rules_day_of_week_check;

-- ============================================================================
-- Step 1: Drop old table-level constraint and index
-- ============================================================================
ALTER TABLE no_fly_rules DROP CONSTRAINT IF EXISTS chk_recurring_has_dow;
DROP INDEX IF EXISTS idx_nfr_day_of_week;

-- ============================================================================
-- Step 2: Alter the column type from INTEGER to INTEGER[]
-- ============================================================================
ALTER TABLE no_fly_rules
  ALTER COLUMN day_of_week TYPE INTEGER[]
  USING CASE
    WHEN day_of_week IS NOT NULL THEN ARRAY[day_of_week]
    ELSE '{}'::INTEGER[]
  END;

-- ============================================================================
-- Step 3: Add new constraint for array-based day_of_week
-- ============================================================================
ALTER TABLE no_fly_rules ADD CONSTRAINT chk_recurring_has_dow
  CHECK (
    (rule_type = 'recurring' AND array_length(day_of_week, 1) > 0 AND specific_date IS NULL)
    OR
    (rule_type = 'one_off' AND (day_of_week IS NULL OR array_length(day_of_week, 1) IS NULL) AND specific_date IS NOT NULL)
  );

-- ============================================================================
-- Step 4: Add GIN index for array lookups
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_nfr_day_of_week ON no_fly_rules USING GIN (day_of_week)
  WHERE rule_type = 'recurring' AND is_active = true;
