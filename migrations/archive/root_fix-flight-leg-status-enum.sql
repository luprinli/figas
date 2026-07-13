-- Create the flight_leg_status enum type that Prisma expects
-- The consolidated migration used VARCHAR(20) with CHECK constraint,
-- but Prisma schema defines it as an enum mapped to "flight_leg_status"
DO $$ BEGIN
  CREATE TYPE flight_leg_status AS ENUM ('scheduled', 'active', 'completed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Alter the flight_legs.status column to use the enum type
ALTER TABLE flight_legs
  ALTER COLUMN status TYPE flight_leg_status USING status::flight_leg_status,
  ALTER COLUMN status SET DEFAULT 'scheduled';
