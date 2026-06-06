-- ============================================================================
-- FIGAS Airline Booking System – Add missing columns to existing tables
-- Migration 002: Add columns that exist in our schema but not in artisan tables
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. users – Add missing columns
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active              BOOLEAN     NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS city                   VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS nationality            VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_name  VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_document_type       VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_document_number     VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_users_is_active ON users (is_active);

-- ---------------------------------------------------------------------------
-- 2. aerodromes – Add missing columns
-- ---------------------------------------------------------------------------
ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS city         VARCHAR(255);
ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(100);
ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS model        VARCHAR(100);

-- ---------------------------------------------------------------------------
-- 3. aircraft – Add missing columns
-- ---------------------------------------------------------------------------
ALTER TABLE aircraft ADD COLUMN IF NOT EXISTS manufacturer       VARCHAR(100);
ALTER TABLE aircraft ADD COLUMN IF NOT EXISTS model              VARCHAR(100);
ALTER TABLE aircraft ADD COLUMN IF NOT EXISTS year               INTEGER;
ALTER TABLE aircraft ADD COLUMN IF NOT EXISTS max_freight_weight NUMERIC(10,2) NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 4. organizations – Add missing columns
-- ---------------------------------------------------------------------------
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS code VARCHAR(50) UNIQUE;

-- ---------------------------------------------------------------------------
-- 5. pilots – Add missing columns
-- ---------------------------------------------------------------------------
ALTER TABLE pilots ADD COLUMN IF NOT EXISTS user_id        INTEGER REFERENCES users(id);
ALTER TABLE pilots ADD COLUMN IF NOT EXISTS license_number VARCHAR(100);
ALTER TABLE pilots ADD COLUMN IF NOT EXISTS medical_expiry DATE;
ALTER TABLE pilots ADD COLUMN IF NOT EXISTS rating         VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_pilots_user_id ON pilots (user_id);

-- ---------------------------------------------------------------------------
-- 6. fare_routes – Add missing columns
-- ---------------------------------------------------------------------------
ALTER TABLE fare_routes ADD COLUMN IF NOT EXISTS base_fare   NUMERIC(10,2);
ALTER TABLE fare_routes ADD COLUMN IF NOT EXISTS is_active   BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_fare_routes_active ON fare_routes (is_active);

-- ---------------------------------------------------------------------------
-- 7. flights – Add missing columns
-- ---------------------------------------------------------------------------
ALTER TABLE flights ADD COLUMN IF NOT EXISTS origin_code              VARCHAR(10);
ALTER TABLE flights ADD COLUMN IF NOT EXISTS destination_code         VARCHAR(10);
ALTER TABLE flights ADD COLUMN IF NOT EXISTS available_seats          INTEGER;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS base_fare                NUMERIC(10,2);
ALTER TABLE flights ADD COLUMN IF NOT EXISTS fuel_weight              NUMERIC(10,2) DEFAULT 0;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS freight_weight           NUMERIC(10,2) DEFAULT 0;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS passenger_weight         NUMERIC(10,2) DEFAULT 0;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS crew_weight              NUMERIC(10,2) DEFAULT 0;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS baggage_weight           NUMERIC(10,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_flights_origin_code      ON flights (origin_code);
CREATE INDEX IF NOT EXISTS idx_flights_destination_code ON flights (destination_code);

-- ---------------------------------------------------------------------------
-- 8. bookings – Add missing columns
-- ---------------------------------------------------------------------------
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS total_amount     NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_date     TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notes            TEXT;

-- ---------------------------------------------------------------------------
-- 9. booking_legs – Add missing columns
-- ---------------------------------------------------------------------------
ALTER TABLE booking_legs ADD COLUMN IF NOT EXISTS departure_date   DATE;
ALTER TABLE booking_legs ADD COLUMN IF NOT EXISTS preferred_time   TIME;
ALTER TABLE booking_legs ADD COLUMN IF NOT EXISTS freight_weight   NUMERIC(10,2) DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 10. passengers – Add missing columns
-- ---------------------------------------------------------------------------
ALTER TABLE passengers ADD COLUMN IF NOT EXISTS nationality        VARCHAR(100);
ALTER TABLE passengers ADD COLUMN IF NOT EXISTS id_document_type   VARCHAR(50);
ALTER TABLE passengers ADD COLUMN IF NOT EXISTS id_document_number VARCHAR(100);
ALTER TABLE passengers ADD COLUMN IF NOT EXISTS seat_row           INTEGER;
ALTER TABLE passengers ADD COLUMN IF NOT EXISTS seat_column        VARCHAR(5);
ALTER TABLE passengers ADD COLUMN IF NOT EXISTS checked_in         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE passengers ADD COLUMN IF NOT EXISTS weight             NUMERIC(10,2) DEFAULT 0;
ALTER TABLE passengers ADD COLUMN IF NOT EXISTS gender             VARCHAR(50);
ALTER TABLE passengers ADD COLUMN IF NOT EXISTS passport_number    VARCHAR(100);

-- ---------------------------------------------------------------------------
-- 11. seat_assignments – Add missing columns
-- ---------------------------------------------------------------------------
ALTER TABLE seat_assignments ADD COLUMN IF NOT EXISTS row_number     INTEGER;
ALTER TABLE seat_assignments ADD COLUMN IF NOT EXISTS column_letter  VARCHAR(5);
ALTER TABLE seat_assignments ADD COLUMN IF NOT EXISTS is_available   BOOLEAN NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- 12. checkin_reminders – Add missing columns
-- ---------------------------------------------------------------------------
ALTER TABLE checkin_reminders ADD COLUMN IF NOT EXISTS flight_id      INTEGER REFERENCES flights(id) ON DELETE CASCADE;
ALTER TABLE checkin_reminders ADD COLUMN IF NOT EXISTS passenger_id   INTEGER;
ALTER TABLE checkin_reminders ADD COLUMN IF NOT EXISTS reminder_type  VARCHAR(50);
ALTER TABLE checkin_reminders ADD COLUMN IF NOT EXISTS scheduled_for  TIMESTAMPTZ;
ALTER TABLE checkin_reminders ADD COLUMN IF NOT EXISTS sent_via       VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_checkin_reminders_flight ON checkin_reminders (flight_id);

-- ---------------------------------------------------------------------------
-- 13. notifications – Add missing columns
-- ---------------------------------------------------------------------------
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type              VARCHAR(100);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient_phone   VARCHAR(50);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS subject           VARCHAR(255);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message           TEXT;

-- ---------------------------------------------------------------------------
-- 14. flight_manifests – Add missing columns
-- ---------------------------------------------------------------------------
ALTER TABLE flight_manifests ADD COLUMN IF NOT EXISTS total_passengers    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE flight_manifests ADD COLUMN IF NOT EXISTS total_weight        NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE flight_manifests ADD COLUMN IF NOT EXISTS total_freight_weight NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE flight_manifests ADD COLUMN IF NOT EXISTS total_baggage_weight NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE flight_manifests ADD COLUMN IF NOT EXISTS total_fuel_weight   NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE flight_manifests ADD COLUMN IF NOT EXISTS pilot_signoff       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE flight_manifests ADD COLUMN IF NOT EXISTS signed_off_at       TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 15. payments – Add missing columns
-- ---------------------------------------------------------------------------
ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount_gbp            NUMERIC(10,2);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS method                VARCHAR(50);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS transaction_reference VARCHAR(255);

-- ---------------------------------------------------------------------------
-- 16. system_settings – (no missing columns)
-- ---------------------------------------------------------------------------

-- ============================================================================
-- Ensure indexes from 001 that reference columns that may not have existed
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_users_role       ON users (role);
CREATE INDEX IF NOT EXISTS idx_aerodromes_code  ON aerodromes (code);
CREATE INDEX IF NOT EXISTS idx_aircraft_registration ON aircraft (registration);
CREATE INDEX IF NOT EXISTS idx_organizations_code     ON organizations (code);
CREATE INDEX IF NOT EXISTS idx_flights_flight_number   ON flights (flight_number);
CREATE INDEX IF NOT EXISTS idx_flights_status          ON flights (status);
CREATE INDEX IF NOT EXISTS idx_bookings_reference      ON bookings (booking_reference);
CREATE INDEX IF NOT EXISTS idx_bookings_status         ON bookings (status);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id        ON bookings (user_id);
CREATE INDEX IF NOT EXISTS idx_booking_legs_booking    ON booking_legs (booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_legs_flight     ON booking_legs (flight_id);
CREATE INDEX IF NOT EXISTS idx_passengers_booking      ON passengers (booking_id);
CREATE INDEX IF NOT EXISTS idx_passengers_user         ON passengers (user_id);
CREATE INDEX IF NOT EXISTS idx_seat_assignments_flight     ON seat_assignments (flight_id);
CREATE INDEX IF NOT EXISTS idx_seat_assignments_passenger  ON seat_assignments (passenger_id);
CREATE INDEX IF NOT EXISTS idx_notifications_booking  ON notifications (booking_id);
CREATE INDEX IF NOT EXISTS idx_notifications_flight   ON notifications (flight_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status   ON notifications (status);
CREATE INDEX IF NOT EXISTS idx_flight_manifests_flight ON flight_manifests (flight_id);
CREATE INDEX IF NOT EXISTS idx_flight_manifests_pilot  ON flight_manifests (pilot_id);
CREATE INDEX IF NOT EXISTS idx_system_settings_key     ON system_settings (key);
CREATE INDEX IF NOT EXISTS idx_payments_booking  ON payments (booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_status   ON payments (payment_status);
