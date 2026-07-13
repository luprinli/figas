-- Fix: Add 'building' to the schedules.status CHECK constraint
-- The Prisma enum includes 'building' but the DB constraint was missing it
-- This caused runtime errors during auto-build which transitions through 'building' state

ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_status_check;
ALTER TABLE schedules ADD CONSTRAINT schedules_status_check 
  CHECK (status IN ('building', 'draft', 'approved', 'published', 'cancelled', 'pilot_assigned', 'loadsheet_generated', 'in_progress', 'completed'));
