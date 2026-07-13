-- ============================================================================
-- FIGAS — Missing Table + Foreign Key Indexes
-- Creates the time_templates table (missing from prior migrations) and
-- adds indexes on FK columns used in common query patterns.
-- ============================================================================

CREATE TABLE IF NOT EXISTS time_templates (
    id                   SERIAL PRIMARY KEY,
    user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_of_week          INTEGER NOT NULL,
    preferred_time_start TIME,
    preferred_time_end   TIME,
    origin_code          VARCHAR(10),
    destination_code     VARCHAR(10),
    is_active            BOOLEAN NOT NULL DEFAULT true,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_templates_user_id ON time_templates(user_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_table_migrations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name  VARCHAR(255) NOT NULL,
    version     INTEGER NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_checkin_reminders_booking_id ON checkin_reminders(booking_id);
CREATE INDEX IF NOT EXISTS idx_checkin_reminders_passenger_id ON checkin_reminders(passenger_id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_blp_id ON invoice_line_items(booking_leg_passenger_id);
CREATE INDEX IF NOT EXISTS idx_freight_consignments_created_by ON freight_consignments(created_by);
CREATE INDEX IF NOT EXISTS idx_flight_logs_flight_id ON flight_logs(flight_id);
CREATE INDEX IF NOT EXISTS idx_flight_logs_captain_id ON flight_logs(captain_id);
CREATE INDEX IF NOT EXISTS idx_defects_flight_log_id ON defects(flight_log_id);
CREATE INDEX IF NOT EXISTS idx_defects_reported_by ON defects(reported_by);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_assigned_to ON maintenance_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_sign_offs_signed_by ON sign_offs(signed_by);
CREATE INDEX IF NOT EXISTS idx_lifed_components_aircraft_id ON lifed_components(aircraft_id);
CREATE INDEX IF NOT EXISTS idx_booking_legs_status ON booking_legs(status);
