-- ============================================================================
-- FIGAS Airline Booking System – Schema Mismatch Fix
-- 
-- This migration adds columns to the database that the Prisma schema expects
-- but are missing from the actual database tables.
--
-- Strategy: Add missing columns only. Do NOT rename existing columns since
-- many raw SQL queries reference the current column names.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. schedules – Add missing updated_by column
--    (This is the immediate cause of the P2022 runtime error)
-- ============================================================================
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);

-- ============================================================================
-- 2. flight_legs – Add missing columns that Prisma expects
--    DB has: leg_sequence, departure_time, arrival_time
--    Prisma expects: leg_number, etd, eta, atd, ata, schedule_id
--    We add the Prisma-expected columns as NEW columns alongside existing ones.
--    The flight-leg.ts repository already maps between the two naming conventions.
-- ============================================================================
ALTER TABLE flight_legs ADD COLUMN IF NOT EXISTS leg_number INTEGER;
ALTER TABLE flight_legs ADD COLUMN IF NOT EXISTS etd TIMESTAMP WITH TIME ZONE;
ALTER TABLE flight_legs ADD COLUMN IF NOT EXISTS eta TIMESTAMP WITH TIME ZONE;
ALTER TABLE flight_legs ADD COLUMN IF NOT EXISTS atd TIMESTAMP WITH TIME ZONE;
ALTER TABLE flight_legs ADD COLUMN IF NOT EXISTS ata TIMESTAMP WITH TIME ZONE;
ALTER TABLE flight_legs ADD COLUMN IF NOT EXISTS schedule_id INTEGER REFERENCES schedules(id) ON DELETE SET NULL;

-- ============================================================================
-- 3. flights – Add missing columns that Prisma expects
-- ============================================================================
ALTER TABLE flights ADD COLUMN IF NOT EXISTS fuel_required_l DECIMAL(10,2) DEFAULT 0;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS fuel_on_board_l DECIMAL(10,2) DEFAULT 0;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS pax_weight_kg DECIMAL(10,2) DEFAULT 0;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS cargo_weight_kg DECIMAL(10,2) DEFAULT 0;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS zero_fuel_weight_kg DECIMAL(10,2) DEFAULT 0;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- ============================================================================
-- 4. booking_legs – Add missing columns
-- ============================================================================
ALTER TABLE booking_legs ADD COLUMN IF NOT EXISTS freight_description TEXT;
ALTER TABLE booking_legs ADD COLUMN IF NOT EXISTS freight_weight DECIMAL(10,2) DEFAULT 0;
ALTER TABLE booking_legs ADD COLUMN IF NOT EXISTS freight_weight_kg DECIMAL(8,1);

-- ============================================================================
-- 5. booking_passengers – Add missing columns
--    DB has: clothed_weight_kg, residency
--    Prisma expects: clothed_body_weight_kg, residency_status
--    We add the Prisma-expected columns as NEW columns.
-- ============================================================================
ALTER TABLE booking_passengers ADD COLUMN IF NOT EXISTS clothed_body_weight_kg DECIMAL(5,1) DEFAULT 70;
ALTER TABLE booking_passengers ADD COLUMN IF NOT EXISTS residency_status VARCHAR(50);
ALTER TABLE booking_passengers ADD COLUMN IF NOT EXISTS nationality VARCHAR(100);
ALTER TABLE booking_passengers ADD COLUMN IF NOT EXISTS id_document_type VARCHAR(50);
ALTER TABLE booking_passengers ADD COLUMN IF NOT EXISTS id_document_number VARCHAR(100);

-- ============================================================================
-- 6. payments – Add missing status column
-- ============================================================================
ALTER TABLE payments ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';

-- ============================================================================
-- 7. invoice_items – Add missing updated_at column
-- ============================================================================
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- ============================================================================
-- 8. Create schedule_audit table (referenced in Prisma schema but missing from DB)
-- ============================================================================
CREATE TABLE IF NOT EXISTS schedule_audit (
  id SERIAL PRIMARY KEY,
  schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  changed_by INTEGER NOT NULL REFERENCES users(id),
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedule_audit_schedule_id ON schedule_audit(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_audit_changed_by ON schedule_audit(changed_by);

COMMIT;
