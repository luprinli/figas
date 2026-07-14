-- Fix: Add composite unique constraint on booking_leg_passengers
-- Prevents duplicate passenger-to-leg links (same passenger linked to same leg twice)
ALTER TABLE booking_leg_passengers DROP CONSTRAINT IF EXISTS uq_booking_leg_passengers_booking_leg_flight_leg;
ALTER TABLE booking_leg_passengers DROP CONSTRAINT IF EXISTS uq_booking_leg_passengers_booking_leg_passenger;
ALTER TABLE booking_leg_passengers DROP CONSTRAINT IF EXISTS uq_blp_leg_passenger;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_blp_leg_passenger' AND conrelid = 'booking_leg_passengers'::regclass) THEN
    ALTER TABLE booking_leg_passengers ADD CONSTRAINT uq_blp_leg_passenger UNIQUE (booking_leg_id, booking_passenger_id);
  END IF;
END $$;
