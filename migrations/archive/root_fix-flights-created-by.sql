-- ============================================================================
-- FIGAS Airline Booking System – Add missing created_by column to flights
-- 
-- The Prisma schema defines created_by Int? on the flights model, but the
-- actual database table does not have this column. This migration adds it.
-- ============================================================================

BEGIN;

ALTER TABLE flights ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);

COMMIT;
