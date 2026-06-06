-- ============================================================================
-- FIGAS Airline Booking System – Core Schema
-- Consolidated from migrations: 001, 002, 005, 013, 016, 019 (aerodromes)
--
-- This file contains all core business tables in dependency order.
-- All columns that were added via ALTER TABLE in later migrations are
-- included directly in the CREATE TABLE statements.
-- ============================================================================

-- ============================================================================
-- 0. Migration tracking table
-- ============================================================================
CREATE TABLE IF NOT EXISTS _migrations (
  id          SERIAL PRIMARY KEY,
  filename    VARCHAR(255) NOT NULL UNIQUE,
  applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 1. users – User accounts
--    Columns consolidated from: 001 (base), 002 (city, nationality,
--    emergency_contact, id_document)
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id                      SERIAL PRIMARY KEY,
  name                    VARCHAR(255) NOT NULL,
  email                   VARCHAR(255) NOT NULL UNIQUE,
  password                VARCHAR(255) NOT NULL,
  role                    VARCHAR(50)  NOT NULL DEFAULT 'passenger',
  is_active               BOOLEAN      NOT NULL DEFAULT true,
  phone                   VARCHAR(50),
  city                    VARCHAR(255),
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

CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users (is_active);

-- ============================================================================
-- 2. aerodromes – Airports / airstrips
--    Columns consolidated from: 001 (base), 002 (city, manufacturer, model),
--    019 (mtow_limit_kg, mlw_limit_kg, fuel_available, operating_hours,
--        pilot_briefing_required)
-- ============================================================================
CREATE TABLE IF NOT EXISTS aerodromes (
  id                        SERIAL PRIMARY KEY,
  code                      VARCHAR(10)  NOT NULL UNIQUE,
  name                      VARCHAR(255) NOT NULL,
  city                      VARCHAR(255),
  manufacturer              VARCHAR(100),
  model                     VARCHAR(100),
  runway_length             NUMERIC(6,1),
  runway_type               VARCHAR(50),
  latitude                  NUMERIC(9,6),
  longitude                 NUMERIC(9,6),
  timezone                  VARCHAR(50)  NOT NULL DEFAULT 'Atlantic/Stanley',
  is_active                 BOOLEAN      NOT NULL DEFAULT true,
  mtow_limit_kg             DECIMAL(10,2),
  mlw_limit_kg              DECIMAL(10,2),
  fuel_available            BOOLEAN      DEFAULT FALSE,
  operating_hours           VARCHAR(50),
  pilot_briefing_required   BOOLEAN      DEFAULT FALSE,
  created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aerodromes_code ON aerodromes (code);

-- ============================================================================
-- 3. aircraft – Aircraft fleet
--    Columns consolidated from: 001 (base), 002 (manufacturer, model, year,
--    max_freight_weight)
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
  -- Weight & Balance arm positions (metres from datum)
  empty_arm_m           NUMERIC(5,2),
  crew_arm_m            NUMERIC(5,2),
  passenger_arm_m       NUMERIC(5,2),
  baggage_arm_m         NUMERIC(5,2),
  freight_arm_m         NUMERIC(5,2),
  fuel_arm_m            NUMERIC(5,2),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aircraft_registration ON aircraft (registration);

-- ============================================================================
-- 4. organizations – Organizations (corporate / group bookings)
--    Columns consolidated from: 001 (base), 002 (code), 013 (payment_terms,
--    default_payment_method_id, tax_id, invoice_email, credit_remaining_gbp)
-- ============================================================================
CREATE TABLE IF NOT EXISTS organizations (
  id                        SERIAL PRIMARY KEY,
  name                      VARCHAR(255)  NOT NULL,
  code                      VARCHAR(50)   UNIQUE,
  contact_email             VARCHAR(255),
  contact_phone             VARCHAR(50),
  billing_address           TEXT,
  credit_limit_gbp          NUMERIC(10,2),
  is_active                 BOOLEAN       NOT NULL DEFAULT true,
  payment_terms             VARCHAR(30)   DEFAULT 'net_30'
                            CHECK (payment_terms IN ('due_on_receipt','net_7','net_15','net_30','pay_on_departure','pay_on_arrival')),
  default_payment_method_id UUID,
  tax_id                    VARCHAR(50),
  invoice_email             VARCHAR(255),
  credit_remaining_gbp      DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_code ON organizations (code);

-- ============================================================================
-- 5. pilots – Pilot records
--    Columns consolidated from: 001 (base), 002 (user_id, license_number,
--    medical_expiry, rating)
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

CREATE INDEX IF NOT EXISTS idx_pilots_user_id ON pilots (user_id);

-- ============================================================================
-- 6. fare_routes – Fare pricing between aerodromes
--    Columns consolidated from: 001 (base), 002 (base_fare, is_active)
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

CREATE INDEX IF NOT EXISTS idx_fare_routes_active ON fare_routes (is_active);

-- ============================================================================
-- 7. flights – Scheduled flights
--    Columns consolidated from: 001 (base), 002 (origin_code, destination_code,
--    available_seats, base_fare, fuel_weight, freight_weight, passenger_weight,
--    crew_weight, baggage_weight), 014 (schedule_id, flight_number,
--    fuel_required_l, fuel_on_board_l, pax_weight_kg, cargo_weight_kg,
--    zero_fuel_weight_kg, sort_order)
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
  schedule_id                 INTEGER,
  fuel_required_l             DECIMAL(10,2) DEFAULT 0,
  fuel_on_board_l             DECIMAL(10,2) DEFAULT 0,
  pax_weight_kg               DECIMAL(10,2) DEFAULT 0,
  cargo_weight_kg             DECIMAL(10,2) DEFAULT 0,
  zero_fuel_weight_kg         DECIMAL(10,2) DEFAULT 0,
  sort_order                  INTEGER       DEFAULT 0,
  created_by                  INTEGER       REFERENCES users(id),
  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flights_flight_number ON flights (flight_number);
CREATE INDEX IF NOT EXISTS idx_flights_status ON flights (status);
CREATE INDEX IF NOT EXISTS idx_flights_origin_code ON flights (origin_code);
CREATE INDEX IF NOT EXISTS idx_flights_destination_code ON flights (destination_code);
CREATE INDEX IF NOT EXISTS idx_flights_schedule_id ON flights (schedule_id);

-- ============================================================================
-- 8. bookings – Booking records
--    Columns consolidated from: 001 (base), 002 (total_amount, payment_date,
--    notes), 005 (booking_source, created_by, cancelled_at, cancelled_by,
--    cancellation_reason), 013 (payment_due_date, payment_terms,
--    stripe_session_id, invoice_id)
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
  booking_source          VARCHAR(50)   NOT NULL DEFAULT 'customer_direct',
  created_by              INTEGER       REFERENCES users(id),
  cancelled_at            TIMESTAMPTZ,
  cancelled_by            INTEGER       REFERENCES users(id),
  cancellation_reason     TEXT,
  payment_due_date        DATE,
  payment_terms           VARCHAR(30)
                          CHECK (payment_terms IN ('due_on_receipt','net_7','net_15','net_30','pay_on_departure','pay_on_arrival')),
  stripe_session_id       VARCHAR(255),
  invoice_id              UUID,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_reference ON bookings (booking_reference);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings (status);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings (user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_source ON bookings (booking_source);
CREATE INDEX IF NOT EXISTS idx_bookings_created_by ON bookings (created_by);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_due_date ON bookings (payment_due_date);
CREATE INDEX IF NOT EXISTS idx_bookings_stripe_session_id ON bookings (stripe_session_id);

-- ============================================================================
-- 9. booking_legs – Individual legs of a booking
--    Columns consolidated from: 001 (base), 002 (departure_date, preferred_time,
--    freight_weight), 005 (departure_date added again — kept once here)
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

CREATE INDEX IF NOT EXISTS idx_booking_legs_booking ON booking_legs (booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_legs_flight ON booking_legs (flight_id);

-- ============================================================================
-- 10. booking_passengers – Passengers on a booking
--     Renamed from "passengers" in migration 016.
--     Columns consolidated from: 001 (base), 002 (nationality, id_document_type,
--     id_document_number, seat_row, seat_column, checked_in, weight, gender,
--     passport_number), 003 (salutation), 005 (special_requirements)
--     Columns removed in 016: baggage_weight_kg, checked_in, seat_row,
--     seat_column, weight (moved to booking_leg_passengers)
-- ============================================================================
CREATE TABLE IF NOT EXISTS booking_passengers (
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
  salutation              VARCHAR(20),
  clothed_body_weight_kg  NUMERIC(5,1)  NOT NULL DEFAULT 70,
  residency_status        VARCHAR(50),
  special_requirements    TEXT,
  gender                  VARCHAR(50),
  passport_number         VARCHAR(100),
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_passengers_booking_id ON booking_passengers (booking_id);
CREATE INDEX IF NOT EXISTS idx_passengers_booking ON booking_passengers (booking_id);
CREATE INDEX IF NOT EXISTS idx_passengers_user ON booking_passengers (user_id);

-- ============================================================================
-- 11. booking_leg_passengers – Junction table (v2 from migration 016)
--     Links passengers to specific booking legs with per-leg data.
--     NOTE: The v1 version from migration 014 is superseded by this.
-- ============================================================================
CREATE TABLE IF NOT EXISTS booking_leg_passengers (
  id                    SERIAL PRIMARY KEY,
  booking_leg_id        INTEGER       NOT NULL REFERENCES booking_legs(id) ON DELETE CASCADE,
  booking_passenger_id  INTEGER       NOT NULL REFERENCES booking_passengers(id) ON DELETE CASCADE,
  flight_leg_id         INTEGER       REFERENCES flight_legs(id) ON DELETE SET NULL,
  clothed_weight_kg     NUMERIC(5,1),
  baggage_weight_kg     NUMERIC(5,1),
  baggage_description   TEXT,
  freight_description   TEXT,
  freight_weight_kg     NUMERIC(8,1),
  seat_number           VARCHAR(10),
  checked_in            BOOLEAN       NOT NULL DEFAULT false,
  checked_in_at         TIMESTAMPTZ,
  checked_in_by         INTEGER       REFERENCES users(id),
  boarded               BOOLEAN       NOT NULL DEFAULT false,
  boarded_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- A passenger can only be linked to a specific leg once
  CONSTRAINT uq_booking_leg_passenger UNIQUE (booking_leg_id, booking_passenger_id)
);

CREATE INDEX IF NOT EXISTS idx_booking_leg_passengers_leg_id ON booking_leg_passengers (booking_leg_id);
CREATE INDEX IF NOT EXISTS idx_booking_leg_passengers_passenger_id ON booking_leg_passengers (booking_passenger_id);
CREATE INDEX IF NOT EXISTS idx_booking_leg_passengers_checked_in ON booking_leg_passengers (checked_in) WHERE checked_in = false;
CREATE INDEX IF NOT EXISTS idx_booking_leg_passengers_flight_leg_id ON booking_leg_passengers(flight_leg_id);
CREATE INDEX IF NOT EXISTS idx_blp_booking_leg_id ON booking_leg_passengers(booking_leg_id);
CREATE INDEX IF NOT EXISTS idx_blp_passenger_id ON booking_leg_passengers(booking_passenger_id);

-- ============================================================================
-- 12. seat_assignments – Seat assignments per flight
--     Columns consolidated from: 001 (base), 002 (row_number, column_letter,
--     is_available)
-- ============================================================================
CREATE TABLE IF NOT EXISTS seat_assignments (
  id              SERIAL PRIMARY KEY,
  flight_id       INTEGER      NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  passenger_id    INTEGER      NOT NULL REFERENCES booking_passengers(id),
  seat_number     VARCHAR(10)  NOT NULL,
  assigned_by     VARCHAR(50)  NOT NULL DEFAULT 'system',
  assigned_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  row_number      INTEGER,
  column_letter   VARCHAR(5),
  is_available    BOOLEAN      NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seat_assignments_flight ON seat_assignments (flight_id);
CREATE INDEX IF NOT EXISTS idx_seat_assignments_passenger ON seat_assignments (passenger_id);

-- ============================================================================
-- 13. checkin_reminders – Check-in reminder tracking
--     Columns consolidated from: 001 (base), 002 (flight_id, passenger_id,
--     reminder_type, scheduled_for, sent_via)
-- ============================================================================
CREATE TABLE IF NOT EXISTS checkin_reminders (
  id            SERIAL PRIMARY KEY,
  flight_id     INTEGER      NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  booking_id    INTEGER      NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  passenger_id  INTEGER,
  reminder_type VARCHAR(50),
  scheduled_at  TIMESTAMPTZ  NOT NULL,
  scheduled_for TIMESTAMPTZ,
  sent_at       TIMESTAMPTZ,
  sent_via      VARCHAR(50),
  status        VARCHAR(50)  NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkin_reminders_flight ON checkin_reminders (flight_id);

-- ============================================================================
-- 14. notifications – Notification log
--     Columns consolidated from: 001 (base), 002 (type, recipient_phone,
--     subject, message)
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id                SERIAL PRIMARY KEY,
  booking_id        INTEGER       REFERENCES bookings(id),
  flight_id         INTEGER       REFERENCES flights(id),
  type              VARCHAR(100),
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

CREATE INDEX IF NOT EXISTS idx_notifications_booking ON notifications (booking_id);
CREATE INDEX IF NOT EXISTS idx_notifications_flight ON notifications (flight_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications (status);

-- ============================================================================
-- 15. flight_manifests – Flight manifest records
--     Columns consolidated from: 001 (base), 002 (total_passengers, total_weight,
--     total_freight_weight, total_baggage_weight, total_fuel_weight,
--     pilot_signoff, signed_off_at)
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

CREATE INDEX IF NOT EXISTS idx_flight_manifests_flight ON flight_manifests (flight_id);
CREATE INDEX IF NOT EXISTS idx_flight_manifests_pilot ON flight_manifests (pilot_id);

-- ============================================================================
-- 16. system_settings – Key-value settings store
-- ============================================================================
CREATE TABLE IF NOT EXISTS system_settings (
  id          SERIAL PRIMARY KEY,
  key         VARCHAR(255) NOT NULL UNIQUE,
  value       TEXT,
  description VARCHAR(255),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings (key);

-- ============================================================================
-- 17. payments – Payment records
--     Columns consolidated from: 001 (base), 002 (amount_gbp, method,
--     transaction_reference), 013 (payment_method_id, currency, fee_gbp,
--     net_amount_gbp, notes, reconciled_at, reconciled_by)
-- ============================================================================
CREATE TABLE IF NOT EXISTS payments (
  id                    SERIAL PRIMARY KEY,
  booking_id            INTEGER       NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount                NUMERIC(10,2) NOT NULL,
  amount_gbp            NUMERIC(10,2),
  method                VARCHAR(50),
  payment_method        VARCHAR(50),
  payment_method_id     UUID,
  currency              VARCHAR(3)    NOT NULL DEFAULT 'GBP',
  fee_gbp               DECIMAL(10,2) NOT NULL DEFAULT 0,
  net_amount_gbp        DECIMAL(10,2) NOT NULL DEFAULT 0,
  status                VARCHAR(50)   NOT NULL DEFAULT 'pending',
  transaction_id        VARCHAR(255),
  transaction_reference VARCHAR(255),
  paid_at               TIMESTAMPTZ,
  notes                 TEXT,
  reconciled_at         TIMESTAMPTZ,
  reconciled_by         INTEGER       REFERENCES users(id),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments (booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (payment_status);
CREATE INDEX IF NOT EXISTS idx_payments_payment_method_id ON payments (payment_method_id);
CREATE INDEX IF NOT EXISTS idx_payments_reconciled_at ON payments (reconciled_at);

-- ============================================================================
-- Data migration: Populate booking_legs.departure_date from leg_date
-- (Originally from migration 005)
-- ============================================================================
UPDATE booking_legs
  SET departure_date = leg_date::DATE
  WHERE departure_date IS NULL;
