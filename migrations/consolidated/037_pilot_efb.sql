-- EFB Phase 0: Schema additions for Pilot Electronic Flight Bag
-- See docs/pilot_flight_bag.md for full plan
-- Audit date: 2026-07-13

-- 1. Add check_in_time to pilot_assignments
-- (confirmed_at, declined_at, declined_reason already exist)
ALTER TABLE pilot_assignments ADD COLUMN IF NOT EXISTS check_in_time TIMESTAMPTZ;

-- 2. Add actuals columns to flight_legs
-- (atd, ata already exist)
ALTER TABLE flight_legs ADD COLUMN IF NOT EXISTS actual_passengers INTEGER;
ALTER TABLE flight_legs ADD COLUMN IF NOT EXISTS actual_baggage_kg NUMERIC(8,1);
ALTER TABLE flight_legs ADD COLUMN IF NOT EXISTS actual_freight_kg NUMERIC(8,1);

-- 3. Fuel orders
CREATE TABLE IF NOT EXISTS fuel_orders (
    id SERIAL PRIMARY KEY,
    flight_id INTEGER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
    flight_leg_id INTEGER REFERENCES flight_legs(id),
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'fueling', 'completed', 'cancelled')),
    requested_fuel_kg NUMERIC(8,1) NOT NULL,
    calculated_breakdown JSONB,
    issued_by INTEGER REFERENCES users(id),
    issued_at TIMESTAMPTZ,
    fueler_actual_uplift_kg NUMERIC(8,1),
    fueler_confirmed_by INTEGER REFERENCES users(id),
    fueler_confirmed_at TIMESTAMPTZ,
    fueler_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Pilot checklists
CREATE TABLE IF NOT EXISTS pilot_checklists (
    id SERIAL PRIMARY KEY,
    flight_id INTEGER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
    item_key VARCHAR(50) NOT NULL,
    item_label VARCHAR(200) NOT NULL,
    checked BOOLEAN DEFAULT false,
    checked_by INTEGER REFERENCES users(id),
    checked_at TIMESTAMPTZ,
    UNIQUE(flight_id, item_key)
);
