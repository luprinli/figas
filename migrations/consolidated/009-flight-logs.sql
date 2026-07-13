-- 011-flight-logs.sql
-- Records actual flown data (block times, tach, fuel, cycles) per flight.
-- Separate from the operational flights table used for scheduling.

CREATE TABLE IF NOT EXISTS flight_logs (
    id              SERIAL PRIMARY KEY,
    flight_id       INTEGER REFERENCES flights(id) ON DELETE SET NULL,
    aircraft_id     INTEGER NOT NULL REFERENCES aircraft(id),
    captain_id      INTEGER REFERENCES pilots(id),
    departure_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    block_off_time  TIME,
    block_on_time   TIME,
    tach_start      NUMERIC(7,1),
    tach_end        NUMERIC(7,1),
    cycles          INTEGER NOT NULL DEFAULT 1,
    fuel_uplift_ltr INTEGER,
    fuel_start_ltr  INTEGER,
    fuel_end_ltr    INTEGER,
    oil_uplift_ltr  NUMERIC(3,1),
    origin_code     VARCHAR(10),
    destination_code VARCHAR(10),
    remarks         TEXT,
    created_by      INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flight_logs_aircraft ON flight_logs(aircraft_id, departure_date);
CREATE INDEX IF NOT EXISTS idx_flight_logs_date ON flight_logs(departure_date);
