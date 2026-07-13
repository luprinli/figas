-- Create the flight_leg_status enum type that Prisma expects
-- The consolidated migration used VARCHAR(20) with CHECK constraint,
-- but Prisma schema defines it as an enum mapped to "flight_leg_status"
DO $$ BEGIN
  CREATE TYPE flight_leg_status AS ENUM ('scheduled', 'active', 'completed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Drop the old default, alter column type, then set new default
ALTER TABLE flight_legs ALTER COLUMN status DROP DEFAULT;
ALTER TABLE flight_legs ALTER COLUMN status TYPE flight_leg_status USING status::flight_leg_status;
ALTER TABLE flight_legs ALTER COLUMN status SET DEFAULT 'scheduled';
