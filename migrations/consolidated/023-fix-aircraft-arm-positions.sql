-- ============================================================================
-- FIGAS Airline Booking System – Fix G-18: Arm positions are hardcoded
--
-- Adds per-component arm position columns to the aircraft table so that
-- weight & balance calculations read from the database instead of using
-- hardcoded constants.
-- ============================================================================

BEGIN;

ALTER TABLE aircraft ADD COLUMN IF NOT EXISTS empty_arm_m     NUMERIC(5,2);
ALTER TABLE aircraft ADD COLUMN IF NOT EXISTS crew_arm_m      NUMERIC(5,2);
ALTER TABLE aircraft ADD COLUMN IF NOT EXISTS passenger_arm_m NUMERIC(5,2);
ALTER TABLE aircraft ADD COLUMN IF NOT EXISTS baggage_arm_m   NUMERIC(5,2);
ALTER TABLE aircraft ADD COLUMN IF NOT EXISTS freight_arm_m   NUMERIC(5,2);
ALTER TABLE aircraft ADD COLUMN IF NOT EXISTS fuel_arm_m      NUMERIC(5,2);

COMMIT;
