-- ============================================================================
-- FIGAS Airline Booking System – Remove NOT NULL constraint from aircraft_id
-- 
-- The database column aircraft_id on the flights table has a NOT NULL
-- constraint, but the Prisma schema defines it as Int? (nullable) and the
-- consolidated migration SQL has it as nullable (INTEGER REFERENCES aircraft(id)
-- without NOT NULL). This mismatch causes "Null constraint violation" errors
-- when creating flights without an aircraft assigned (e.g., via
-- handleCreateFlightFromBooking in the scheduling workflow).
--
-- The scheduling workflow allows creating draft flights without assigning an
-- aircraft, so the column should be nullable to match the Prisma schema and
-- the original migration intent.
-- ============================================================================

BEGIN;

ALTER TABLE flights ALTER COLUMN aircraft_id DROP NOT NULL;

COMMIT;
