-- Create aircraft_assignments table to track aircraft-to-flight assignments
-- Mirrors the pilot_assignments table structure for architectural consistency.
-- flights.aircraft_id remains as a fast-access cache; this table is the source of truth.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'aircraft_assignment_status') THEN
    CREATE TYPE aircraft_assignment_status AS ENUM (
      'assigned',
      'confirmed',
      'standby',
      'maintenance_hold',
      'completed',
      'cancelled'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS aircraft_assignments (
  id              SERIAL PRIMARY KEY,
  flight_id       INTEGER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  aircraft_id     INTEGER NOT NULL REFERENCES aircraft(id),
  schedule_id     INTEGER REFERENCES schedules(id) ON DELETE CASCADE,
  status          aircraft_assignment_status DEFAULT 'assigned',
  confirmed_at    TIMESTAMPTZ,
  notes           TEXT,
  assigned_by     INTEGER REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(flight_id, aircraft_id)
);

CREATE INDEX IF NOT EXISTS idx_aircraft_assignments_flight ON aircraft_assignments(flight_id);
CREATE INDEX IF NOT EXISTS idx_aircraft_assignments_aircraft ON aircraft_assignments(aircraft_id);
CREATE INDEX IF NOT EXISTS idx_aircraft_assignments_schedule ON aircraft_assignments(schedule_id);
