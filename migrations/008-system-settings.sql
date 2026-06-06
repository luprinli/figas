-- system_settings: key-value configuration table
-- Enables runtime configuration without redeploying the application.

CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(255) NOT NULL UNIQUE,
    value TEXT NOT NULL DEFAULT '',
    type VARCHAR(50) NOT NULL DEFAULT 'string',
    description TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default configuration values
INSERT INTO system_settings (key, value, type, description) VALUES
    ('fare.default_per_passenger', '50', 'number', 'Fallback fare per passenger when no fare route exists'),
    ('fare.freight_rate_per_kg', '2', 'number', 'Freight rate in GBP per kilogram'),
    ('pilot.rest_hours', '12', 'number', 'Minimum rest hours between pilot duties'),
    ('pilot.max_duty_hours', '12', 'number', 'Maximum duty hours per day for pilots'),
    ('pilot.max_flight_hours', '8', 'number', 'Maximum flight hours per day for pilots'),
    ('aircraft.default_cruise_speed_ktas', '140', 'number', 'Default cruise speed in knots true airspeed'),
    ('aircraft.default_burn_rate_kg_hr', '45', 'number', 'Default fuel burn rate in kg per hour'),
    ('aircraft.default_empty_weight_kg', '1627', 'number', 'Default aircraft empty weight in kg'),
    ('aircraft.default_mtow_kg', '2994', 'number', 'Default maximum takeoff weight in kg'),
    ('aircraft.taxi_minutes', '10', 'number', 'Default taxi time in minutes'),
    ('aircraft.turnaround_minutes', '10', 'number', 'Default turnaround time in minutes'),
    ('aircraft.reserve_fuel_kg', '35', 'number', 'Reserve fuel in kg'),
    ('aircraft.taxi_fuel_kg', '3', 'number', 'Taxi fuel in kg'),
    ('aircraft.pilot_weight_kg', '80', 'number', 'Standard pilot weight in kg'),
    ('booking.max_passengers', '9', 'number', 'Maximum passengers per booking'),
    ('booking.max_legs', '4', 'number', 'Maximum legs per booking'),
    ('booking.payment_term_days', '30', 'number', 'Default payment term in days'),
    ('booking.reference_retry_max', '10', 'number', 'Maximum booking reference generation attempts'),
    ('booking.calendar_lookahead_days', '90', 'number', 'Calendar lookahead for schedule display'),
    ('page.default_size', '20', 'number', 'Default page size for paginated lists'),
    ('rate.auth_max', '5', 'number', 'Auth rate limit max attempts'),
    ('rate.general_max', '10', 'number', 'General rate limit max attempts'),
    ('accounting.cash_at_bank', '1010', 'string', 'Chart of accounts: Cash at Bank'),
    ('accounting.accounts_receivable', '1020', 'string', 'Chart of accounts: Accounts Receivable'),
    ('accounting.passenger_fare_revenue', '4010', 'string', 'Chart of accounts: Passenger Fare Revenue')
ON CONFLICT (key) DO NOTHING;
