-- Add flight_leg_id column to booking_leg_passengers table
ALTER TABLE booking_leg_passengers
ADD COLUMN IF NOT EXISTS flight_leg_id INTEGER REFERENCES flight_legs(id) ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_booking_leg_passengers_flight_leg_id
ON booking_leg_passengers(flight_leg_id);
