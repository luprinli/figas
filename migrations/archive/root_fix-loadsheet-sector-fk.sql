-- Add ON DELETE CASCADE to loadsheet_sectors → flight_legs foreign key
-- so that deleting flight legs doesn't fail due to FK violation.
ALTER TABLE loadsheet_sectors
  DROP CONSTRAINT loadsheet_sectors_flight_leg_id_fkey,
  ADD CONSTRAINT loadsheet_sectors_flight_leg_id_fkey
    FOREIGN KEY (flight_leg_id) REFERENCES flight_legs(id) ON DELETE CASCADE;
