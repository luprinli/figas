-- ============================================================================
-- FIGAS Airline Booking System – Payment Methods Reference Table
-- Migration 006: Create payment_methods table, seed data, add trigger, enable RLS
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Create payment_methods reference table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_methods (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              VARCHAR(50)  NOT NULL UNIQUE,
  name              VARCHAR(100) NOT NULL,
  description       TEXT,
  is_active         BOOLEAN      NOT NULL DEFAULT true,
  requires_online   BOOLEAN      NOT NULL DEFAULT false,
  requires_invoice  BOOLEAN      NOT NULL DEFAULT false,
  sort_order        INTEGER      NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 2. Seed payment methods
-- ---------------------------------------------------------------------------
INSERT INTO payment_methods (code, name, description, requires_online, requires_invoice, sort_order)
VALUES
  ('stripe',            'Stripe (Card Payment)',  'Online payment via credit/debit card',  true,  false, 1),
  ('pay_on_departure',  'Pay on Departure',       'Pay at the airport before departure',   false, false, 2),
  ('pay_on_arrival',    'Pay on Arrival',         'Pay at the destination airport',        false, false, 3),
  ('invoice',           'Invoice',                'Billed via invoice to organization or individual', false, true, 4),
  ('bank_transfer',     'Bank Transfer',          'Direct bank transfer',                  false, true,  5)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Create updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_methods_updated_at ON payment_methods;
CREATE TRIGGER trg_payment_methods_updated_at
  BEFORE UPDATE ON payment_methods
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
