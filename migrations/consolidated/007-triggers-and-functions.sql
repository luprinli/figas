-- ============================================================================
-- FIGAS Airline Booking System – Triggers & Functions
-- Consolidated from migrations: 006, 007, 008, 010, 011, 017
--
-- This file contains all shared trigger functions and applies triggers
-- to all tables that have updated_at columns.
--
-- NOTE: The update_nfr_updated_at() function from migration 017 has been
-- replaced by the generic set_updated_at() function to avoid duplication.
-- ============================================================================

-- ============================================================================
-- 1. Generic updated_at trigger function
--    Originally created in migration 006, re-created in 007, 008, 010, 011.
--    Replaces update_nfr_updated_at() from migration 017.
-- ============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. Apply triggers to all tables with updated_at columns
--    Uses DO block for idempotency (IF NOT EXISTS pattern via DROP TRIGGER)
-- ============================================================================

-- Core schema tables
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_aerodromes_updated_at ON aerodromes;
CREATE TRIGGER trg_aerodromes_updated_at
  BEFORE UPDATE ON aerodromes
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_aircraft_updated_at ON aircraft;
CREATE TRIGGER trg_aircraft_updated_at
  BEFORE UPDATE ON aircraft
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON organizations;
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_pilots_updated_at ON pilots;
CREATE TRIGGER trg_pilots_updated_at
  BEFORE UPDATE ON pilots
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_fare_routes_updated_at ON fare_routes;
CREATE TRIGGER trg_fare_routes_updated_at
  BEFORE UPDATE ON fare_routes
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_flights_updated_at ON flights;
CREATE TRIGGER trg_flights_updated_at
  BEFORE UPDATE ON flights
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_bookings_updated_at ON bookings;
CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_booking_legs_updated_at ON booking_legs;
CREATE TRIGGER trg_booking_legs_updated_at
  BEFORE UPDATE ON booking_legs
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_booking_passengers_updated_at ON booking_passengers;
CREATE TRIGGER trg_booking_passengers_updated_at
  BEFORE UPDATE ON booking_passengers
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_booking_leg_passengers_updated_at ON booking_leg_passengers;
CREATE TRIGGER trg_booking_leg_passengers_updated_at
  BEFORE UPDATE ON booking_leg_passengers
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_seat_assignments_updated_at ON seat_assignments;
CREATE TRIGGER trg_seat_assignments_updated_at
  BEFORE UPDATE ON seat_assignments
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_checkin_reminders_updated_at ON checkin_reminders;
CREATE TRIGGER trg_checkin_reminders_updated_at
  BEFORE UPDATE ON checkin_reminders
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_notifications_updated_at ON notifications;
CREATE TRIGGER trg_notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_flight_manifests_updated_at ON flight_manifests;
CREATE TRIGGER trg_flight_manifests_updated_at
  BEFORE UPDATE ON flight_manifests
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_system_settings_updated_at ON system_settings;
CREATE TRIGGER trg_system_settings_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Reference data tables
DROP TRIGGER IF EXISTS trg_fuel_rules_updated_at ON fuel_rules;
CREATE TRIGGER trg_fuel_rules_updated_at
  BEFORE UPDATE ON fuel_rules
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_aerodrome_distances_updated_at ON aerodrome_distances;
CREATE TRIGGER trg_aerodrome_distances_updated_at
  BEFORE UPDATE ON aerodrome_distances
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_aerodrome_headings_updated_at ON aerodrome_headings;
CREATE TRIGGER trg_aerodrome_headings_updated_at
  BEFORE UPDATE ON aerodrome_headings
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_airframe_hours_updated_at ON airframe_hours;
CREATE TRIGGER trg_airframe_hours_updated_at
  BEFORE UPDATE ON airframe_hours
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Finance tables
DROP TRIGGER IF EXISTS trg_payment_methods_updated_at ON payment_methods;
CREATE TRIGGER trg_payment_methods_updated_at
  BEFORE UPDATE ON payment_methods
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON invoices;
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_accounting_journal_entries_updated_at ON accounting_journal_entries;
CREATE TRIGGER trg_accounting_journal_entries_updated_at
  BEFORE UPDATE ON accounting_journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_stripe_payments_updated_at ON stripe_payments;
CREATE TRIGGER trg_stripe_payments_updated_at
  BEFORE UPDATE ON stripe_payments
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_bank_transactions_updated_at ON bank_transactions;
CREATE TRIGGER trg_bank_transactions_updated_at
  BEFORE UPDATE ON bank_transactions
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Scheduling tables
DROP TRIGGER IF EXISTS trg_schedules_updated_at ON schedules;
CREATE TRIGGER trg_schedules_updated_at
  BEFORE UPDATE ON schedules
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_flight_legs_updated_at ON flight_legs;
CREATE TRIGGER trg_flight_legs_updated_at
  BEFORE UPDATE ON flight_legs
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_pilot_assignments_updated_at ON pilot_assignments;
CREATE TRIGGER trg_pilot_assignments_updated_at
  BEFORE UPDATE ON pilot_assignments
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_weight_balance_snapshots_updated_at ON weight_balance_snapshots;
CREATE TRIGGER trg_weight_balance_snapshots_updated_at
  BEFORE UPDATE ON weight_balance_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- PBAC tables
DROP TRIGGER IF EXISTS trg_roles_updated_at ON roles;
CREATE TRIGGER trg_roles_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- No-fly rules table (uses set_updated_at instead of the now-removed update_nfr_updated_at)
DROP TRIGGER IF EXISTS trg_nfr_updated_at ON no_fly_rules;
CREATE TRIGGER trg_nfr_updated_at
  BEFORE UPDATE ON no_fly_rules
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
