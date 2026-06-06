-- ============================================================================
-- FIGAS Airline Booking System – Enhance Existing Tables
-- Migration 013: Add payment/accounting columns to bookings, payments,
--               and organizations tables
-- ============================================================================

-- ── bookings table enhancements ──────────────────────────────────────────────

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_due_date DATE;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(30)
    CHECK (payment_terms IN ('due_on_receipt','net_7','net_15','net_30','pay_on_departure','pay_on_arrival'));

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(255);

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;

-- ── payments table enhancements ─────────────────────────────────────────────

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_method_id UUID REFERENCES payment_methods(id);

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'GBP';

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS fee_gbp DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS net_amount_gbp DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS reconciled_by INTEGER REFERENCES users(id);

-- ── organizations table enhancements ─────────────────────────────────────────

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(30) DEFAULT 'net_30'
    CHECK (payment_terms IN ('due_on_receipt','net_7','net_15','net_30','pay_on_departure','pay_on_arrival'));

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS default_payment_method_id UUID REFERENCES payment_methods(id);

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS tax_id VARCHAR(50);

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS invoice_email VARCHAR(255);

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS credit_remaining_gbp DECIMAL(10,2) NOT NULL DEFAULT 0;

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_bookings_payment_due_date
  ON bookings(payment_due_date);

CREATE INDEX IF NOT EXISTS idx_bookings_stripe_session_id
  ON bookings(stripe_session_id);

CREATE INDEX IF NOT EXISTS idx_payments_payment_method_id
  ON payments(payment_method_id);

CREATE INDEX IF NOT EXISTS idx_payments_reconciled_at
  ON payments(reconciled_at);
