-- Fix: Add composite unique constraint on booking_leg_passengers
-- Prevents duplicate passenger assignments to the same flight leg
ALTER TABLE booking_leg_passengers
ADD CONSTRAINT uq_booking_leg_passengers_booking_leg_flight_leg
UNIQUE (booking_leg_id, flight_leg_id);
