-- ============================================================================
-- FIGAS Airline Booking System – Initial Schema
-- Migration 001: Create all core tables
-- ============================================================================

-- Track applied migrations
CREATE TABLE IF NOT EXISTS _migrations (
  id          SERIAL PRIMARY KEY,
  filename    VARCHAR(255) NOT NULL UNIQUE,
  applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 1. users – User accounts
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id                      SERIAL PRIMARY KEY,
  name                    VARCHAR(255) NOT NULL,
  email                   VARCHAR(255) NOT NULL UNIQUE,
  password                VARCHAR(255) NOT NULL,
  role                    VARCHAR(50)  NOT NULL DEFAULT 'passenger',
  is_active               BOOLEAN      NOT NULL DEFAULT true,
  phone                   VARCHAR(50),
  date_of_birth           DATE,
  residency               VARCHAR(50),
  id_document_type        VARCHAR(50),
  id_document_number      VARCHAR(100),
  nationality             VARCHAR(100),
  emergency_contact_name  VARCHAR(255),
  emergency_contact_phone VARCHAR(50),
  clothed_body_weight_kg  NUMERIC(5,1),
  residency_status        VARCHAR(50),
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. aerodromes – Airports / airstrips
-- ============================================================================
CREATE TABLE IF NOT EXISTS aerodromes (
  id            SERIAL PRIMARY KEY,
  code          VARCHAR(10)  NOT NULL UNIQUE,
  name          VARCHAR(255) NOT NULL,
  city          VARCHAR(255),
  runway_length NUMERIC(6,1),
  runway_type   VARCHAR(50),
  latitude      NUMERIC(9,6),
  longitude     NUMERIC(9,6),
  timezone      VARCHAR(50)  NOT NULL DEFAULT 'Atlantic/Stanley',
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. aircraft – Aircraft fleet
-- ============================================================================
CREATE TABLE IF NOT EXISTS aircraft (
  id                    SERIAL PRIMARY KEY,
  registration          VARCHAR(20)   NOT NULL UNIQUE,
  type                  VARCHAR(100)  NOT NULL,
  manufacturer          VARCHAR(100),
  model                 VARCHAR(100),
  year                  INTEGER,
  seat_count            INTEGER       NOT NULL,
  empty_weight_kg       NUMERIC(7,1)  NOT NULL DEFAULT 0,
  max_takeoff_weight_kg NUMERIC(7,1),
  max_payload_kg        NUMERIC(7,1),
  fuel_capacity_kg      NUMERIC(7,1),
  max_freight_weight    NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active             BOOLEAN       NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. organizations – Organizations (corporate / group bookings)
-- (Defined before bookings because bookings references it)
-- ============================================================================
CREATE TABLE IF NOT EXISTS organizations (
  id                SERIAL PRIMARY KEY,
  name              VARCHAR(255)  NOT NULL,
  code              VARCHAR(50)   UNIQUE,
  contact_email     VARCHAR(255),
  contact_phone     VARCHAR(50),
  billing_address   TEXT,
  credit_limit_gbp  NUMERIC(10,2),
  is_active         BOOLEAN       NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 5. pilots – Pilot records
-- (Defined before flights because flights references it)
-- ============================================================================
CREATE TABLE IF NOT EXISTS pilots (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER       REFERENCES users(id),
  name            VARCHAR(255),
  email           VARCHAR(255),
  license_number  VARCHAR(100),
  license_type    VARCHAR(50),
  medical_expiry  DATE,
  rating          VARCHAR(100),
  is_active       BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 6. fare_routes – Fare pricing between aerodromes
-- ============================================================================
CREATE TABLE IF NOT EXISTS fare_routes (
  id                SERIAL PRIMARY KEY,
  origin_code       VARCHAR(10)   NOT NULL REFERENCES aerodromes(code),
  destination_code  VARCHAR(10)   NOT NULL REFERENCES aerodromes(code),
  base_fare         NUMERIC(10,2) NOT NULL,
  base_fare_gbp     NUMERIC(10,2),
  currency          VARCHAR(10)   NOT NULL DEFAULT 'GBP',
  is_active         BOOLEAN       NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 7. flights – Scheduled flights
-- ============================================================================
CREATE TABLE IF NOT EXISTS flights (
  id                          SERIAL PRIMARY KEY,
  flight_number               VARCHAR(20)  NOT NULL UNIQUE,
  origin_code                 VARCHAR(10),
  destination_code            VARCHAR(10),
  origin_aerodrome_id         INTEGER      REFERENCES aerodromes(id),
  destination_aerodrome_id    INTEGER      REFERENCES aerodromes(id),
  aircraft_id                 INTEGER      REFERENCES aircraft(id),
  pilot_id                    INTEGER      REFERENCES pilots(id),
  departure_time              TIMESTAMPTZ  NOT NULL,
  arrival_time                TIMESTAMPTZ  NOT NULL,
  status                      VARCHAR(50)  NOT NULL DEFAULT 'scheduled',
  available_seats             INTEGER      NOT NULL,
  base_fare                   NUMERIC(10,2) NOT NULL,
  intermediate_stops          JSONB,
  total_passenger_weight_kg   NUMERIC(8,1),
  total_baggage_weight_kg     NUMERIC(8,1),
  total_freight_weight_kg     NUMERIC(8,1),
  total_fuel_weight_kg        NUMERIC(8,1),
  fuel_weight                 NUMERIC(10,2) DEFAULT 0,
  freight_weight              NUMERIC(10,2) DEFAULT 0,
  passenger_weight            NUMERIC(10,2) DEFAULT 0,
  crew_weight                 NUMERIC(10,2) DEFAULT 0,
  baggage_weight              NUMERIC(10,2) DEFAULT 0,
  pilot_approved_at           TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 8. bookings – Booking records
-- ============================================================================
CREATE TABLE IF NOT EXISTS bookings (
  id                      SERIAL PRIMARY KEY,
  booking_reference       VARCHAR(20)   NOT NULL UNIQUE,
  user_id                 INTEGER       NOT NULL REFERENCES users(id),
  status                  VARCHAR(50)   NOT NULL DEFAULT 'pending',
  organization_id         INTEGER       REFERENCES organizations(id),
  is_organization_billing BOOLEAN       NOT NULL DEFAULT false,
  total_amount            NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount_gbp        NUMERIC(10,2),
  payment_status          VARCHAR(50)   NOT NULL DEFAULT 'pending',
  payment_method          VARCHAR(50),
  payment_date            TIMESTAMPTZ,
  notes                   TEXT,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 9. booking_legs – Individual legs of a booking
-- ============================================================================
CREATE TABLE IF NOT EXISTS booking_legs (
  id                    SERIAL PRIMARY KEY,
  booking_id            INTEGER       NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  flight_id             INTEGER       REFERENCES flights(id),
  origin_code           VARCHAR(10)   NOT NULL REFERENCES aerodromes(code),
  destination_code      VARCHAR(10)   NOT NULL REFERENCES aerodromes(code),
  leg_date              DATE          NOT NULL,
  departure_date        DATE,
  preferred_time        TIME,
  preferred_time_start  TIME,
  preferred_time_end    TIME,
  leg_sequence          INTEGER       NOT NULL DEFAULT 0,
  status                VARCHAR(50)   NOT NULL DEFAULT 'pending',
  freight_description   TEXT,
  freight_weight        NUMERIC(10,2) DEFAULT 0,
  freight_weight_kg     NUMERIC(8,1),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 10. passengers – Passengers on a booking
-- ============================================================================
CREATE TABLE IF NOT EXISTS passengers (
  id                      SERIAL PRIMARY KEY,
  booking_id              INTEGER       NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id                 INTEGER       REFERENCES users(id),
  first_name              VARCHAR(100)  NOT NULL,
  last_name               VARCHAR(100)  NOT NULL,
  email                   VARCHAR(255),
  phone                   VARCHAR(50),
  date_of_birth           DATE,
  nationality             VARCHAR(100),
  id_document_type        VARCHAR(50),
  id_document_number      VARCHAR(100),
  clothed_body_weight_kg  NUMERIC(5,1)  NOT NULL DEFAULT 70,
  baggage_weight_kg       NUMERIC(5,1),
  residency_status        VARCHAR(50),
  seat_row                INTEGER,
  seat_column             VARCHAR(5),
  checked_in              BOOLEAN       NOT NULL DEFAULT false,
  weight                  NUMERIC(10,2) DEFAULT 0,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 11. seat_assignments – Seat assignments per flight
-- ============================================================================
CREATE TABLE IF NOT EXISTS seat_assignments (
  id              SERIAL PRIMARY KEY,
  flight_id       INTEGER      NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  passenger_id    INTEGER      NOT NULL REFERENCES passengers(id),
  seat_number     VARCHAR(10)  NOT NULL,
  assigned_by     VARCHAR(50)  NOT NULL DEFAULT 'system',
  assigned_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  row_number      INTEGER,
  column_letter   VARCHAR(5),
  is_available    BOOLEAN      NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 12. checkin_reminders – Check-in reminder tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS checkin_reminders (
  id            SERIAL PRIMARY KEY,
  flight_id     INTEGER      NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  booking_id    INTEGER      NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  scheduled_at  TIMESTAMPTZ  NOT NULL,
  sent_at       TIMESTAMPTZ,
  status        VARCHAR(50)  NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 13. notifications – Notification log
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id                SERIAL PRIMARY KEY,
  booking_id        INTEGER       REFERENCES bookings(id),
  flight_id         INTEGER       REFERENCES flights(id),
  type              VARCHAR(100)  NOT NULL,
  notification_type VARCHAR(100),
  recipient_email   VARCHAR(255),
  recipient_phone   VARCHAR(50),
  recipient_type    VARCHAR(50),
  subject           VARCHAR(255),
  message           TEXT,
  status            VARCHAR(50)   NOT NULL DEFAULT 'pending',
  sent_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 14. flight_manifests – Flight manifest records
-- ============================================================================
CREATE TABLE IF NOT EXISTS flight_manifests (
  id                              SERIAL PRIMARY KEY,
  flight_id                       INTEGER       NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  total_passengers                INTEGER       NOT NULL DEFAULT 0,
  total_passenger_weight_kg       NUMERIC(8,1)  NOT NULL DEFAULT 0,
  total_baggage_weight_kg         NUMERIC(8,1)  NOT NULL DEFAULT 0,
  total_freight_weight_kg         NUMERIC(8,1)  NOT NULL DEFAULT 0,
  total_fuel_weight_kg            NUMERIC(8,1)  NOT NULL DEFAULT 0,
  total_weight_kg                 NUMERIC(8,1)  NOT NULL DEFAULT 0,
  total_weight                    NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_freight_weight            NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_baggage_weight            NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_fuel_weight               NUMERIC(10,2) NOT NULL DEFAULT 0,
  aircraft_max_takeoff_weight_kg  NUMERIC(7,1),
  weight_balance_percentage       NUMERIC(5,1),
  pilot_signoff                   BOOLEAN       NOT NULL DEFAULT false,
  pilot_id                        INTEGER       REFERENCES pilots(id),
  signed_off_at                   TIMESTAMPTZ,
  notes                           TEXT,
  created_at                      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 15. system_settings – Key-value settings store
-- ============================================================================
CREATE TABLE IF NOT EXISTS system_settings (
  id          SERIAL PRIMARY KEY,
  key         VARCHAR(255) NOT NULL UNIQUE,
  value       TEXT,
  description VARCHAR(255),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 16. payments – Payment records
-- ============================================================================
CREATE TABLE IF NOT EXISTS payments (
  id                    SERIAL PRIMARY KEY,
  booking_id            INTEGER       NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount                NUMERIC(10,2) NOT NULL,
  amount_gbp            NUMERIC(10,2),
  method                VARCHAR(50)   NOT NULL,
  payment_method        VARCHAR(50),
  status                VARCHAR(50)   NOT NULL DEFAULT 'pending',
  transaction_id        VARCHAR(255),
  transaction_reference VARCHAR(255),
  paid_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
