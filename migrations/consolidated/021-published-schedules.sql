-- Published schedules: daily flight schedules published to a public URL.
-- Supports versioning (initial vs amendment), disclaimer, and snapshot data.

CREATE TABLE published_schedules (
  id              SERIAL PRIMARY KEY,
  schedule_id     INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  public_token    VARCHAR(32) UNIQUE NOT NULL,
  version         INTEGER DEFAULT 1,
  published_at    TIMESTAMPTZ DEFAULT NOW(),
  published_by    INTEGER REFERENCES users(id),
  amendment_note  TEXT,
  disclaimer_text TEXT DEFAULT 'Flights may change at short notice. Check for updates before travel.',
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE published_schedule_flights (
  id                      SERIAL PRIMARY KEY,
  published_schedule_id   INTEGER NOT NULL REFERENCES published_schedules(id) ON DELETE CASCADE,
  flight_id               INTEGER REFERENCES flights(id),
  flight_number           VARCHAR(20) NOT NULL,
  origin_code             VARCHAR(4),
  destination_code        VARCHAR(4),
  departure_time          TIMESTAMPTZ,
  arrival_time            TIMESTAMPTZ,
  status                  VARCHAR(20),
  aircraft_type           VARCHAR(100),
  aircraft_registration   VARCHAR(20),
  pilot_name              VARCHAR(255),
  stop_count              INTEGER DEFAULT 0,
  notes                   TEXT
);

CREATE INDEX idx_pub_schedules_token ON published_schedules(public_token);
CREATE INDEX idx_pub_schedules_schedule ON published_schedules(schedule_id);
CREATE INDEX idx_pub_schedule_flights_pub ON published_schedule_flights(published_schedule_id);
