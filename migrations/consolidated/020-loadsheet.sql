-- Loadsheet module: tracks flight manifests, sector calculations, and passenger boarding.
-- Supports single-crew BN-2 Islander operations with COG-based seat assignment,
-- per-leg fuel cascade (only Stanley has fuel), and immutability after finalization.

CREATE TYPE loadsheet_status AS ENUM ('draft', 'review', 'active', 'finalized', 'archived');

CREATE TABLE loadsheets (
  id                SERIAL PRIMARY KEY,
  flight_id         INTEGER NOT NULL REFERENCES flights(id) ON DELETE RESTRICT UNIQUE,
  schedule_id       INTEGER REFERENCES schedules(id),
  pilot_id          INTEGER REFERENCES pilots(id),
  aircraft_id       INTEGER REFERENCES aircraft(id),
  status            loadsheet_status DEFAULT 'draft',
  empty_weight_kg   NUMERIC(6,1),
  pilot_weight_kg   NUMERIC(5,1) DEFAULT 80,
  cabin_baggage_kg  NUMERIC(5,1) DEFAULT 0,
  total_pax         INTEGER DEFAULT 0,
  checksum          VARCHAR(64),
  notes             TEXT,
  finalized_at      TIMESTAMPTZ,
  finalized_by      INTEGER REFERENCES users(id),
  archived_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE loadsheet_passengers (
  id                  SERIAL PRIMARY KEY,
  loadsheet_id        INTEGER NOT NULL REFERENCES loadsheets(id) ON DELETE CASCADE,
  booking_passenger_id INTEGER NOT NULL REFERENCES booking_passengers(id),
  booking_leg_id      INTEGER NOT NULL REFERENCES booking_legs(id),
  seat_row            INTEGER CHECK (seat_row BETWEEN 1 AND 5),
  seat_side           VARCHAR(1) CHECK (seat_side IN ('L','R','C')),
  clothed_weight_kg   NUMERIC(5,1),
  baggage_weight_kg   NUMERIC(5,1) DEFAULT 0,
  freight_weight_kg   NUMERIC(5,1) DEFAULT 0,
  boarded             BOOLEAN DEFAULT FALSE,
  boarded_at          TIMESTAMPTZ,
  UNIQUE(loadsheet_id, booking_passenger_id)
);

CREATE TABLE loadsheet_sectors (
  id                SERIAL PRIMARY KEY,
  loadsheet_id      INTEGER NOT NULL REFERENCES loadsheets(id) ON DELETE CASCADE,
  flight_leg_id     INTEGER NOT NULL REFERENCES flight_legs(id),
  leg_sequence      INTEGER NOT NULL,
  origin_code       VARCHAR(4),
  destination_code  VARCHAR(4),
  distance_nm       NUMERIC(5,1),
  planned_time_min  INTEGER,
  etd               TIME,
  eta               TIME,
  atd               TIME,
  ata               TIME,
  actual_time_min   INTEGER,
  fuel_on_board_kg  NUMERIC(5,1),
  fuel_burn_kg      NUMERIC(5,1),
  fuel_remaining_kg NUMERIC(5,1),
  takeoff_weight_kg NUMERIC(7,1),
  landing_weight_kg NUMERIC(7,1),
  cog_position_mm   NUMERIC(6,1),
  cog_status        VARCHAR(10),
  tow_status        VARCHAR(10),
  notes             TEXT,
  UNIQUE(loadsheet_id, flight_leg_id)
);

CREATE TABLE loadsheet_audit_log (
  id              SERIAL PRIMARY KEY,
  loadsheet_id    INTEGER NOT NULL REFERENCES loadsheets(id) ON DELETE CASCADE,
  action          VARCHAR(50) NOT NULL,
  field_name      VARCHAR(100),
  old_value       TEXT,
  new_value       TEXT,
  actor_id        INTEGER REFERENCES users(id),
  ip_address      INET,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_loadsheets_flight ON loadsheets(flight_id);
CREATE INDEX idx_loadsheets_status ON loadsheets(status);
CREATE INDEX idx_loadsheets_pilot ON loadsheets(pilot_id);
CREATE INDEX idx_ls_passengers_boarding ON loadsheet_passengers(loadsheet_id, boarded);
CREATE INDEX idx_ls_sectors_leg ON loadsheet_sectors(loadsheet_id, leg_sequence);
CREATE INDEX idx_audit_loadsheet ON loadsheet_audit_log(loadsheet_id, created_at);
