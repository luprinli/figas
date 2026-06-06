-- ============================================================================
-- FIGAS Airline Booking System – Invoices & Invoice Items
-- Migration 007: Create invoices and invoice_items tables for the
--              payment/accounting subsystem
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Create invoices table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number    VARCHAR(20)  NOT NULL UNIQUE,
  booking_id        INTEGER      REFERENCES bookings(id) ON DELETE SET NULL,
  organization_id   INTEGER      REFERENCES organizations(id) ON DELETE SET NULL,
  user_id           INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  status            VARCHAR(20)  NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','issued','paid','overdue','cancelled','written_off')),
  issue_date        DATE         NOT NULL,
  due_date          DATE         NOT NULL,
  paid_at           TIMESTAMPTZ,
  subtotal_gbp      DECIMAL(10,2) NOT NULL DEFAULT 0,
  tax_rate          DECIMAL(5,2)  NOT NULL DEFAULT 0,
  tax_amount_gbp    DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_gbp         DECIMAL(10,2) NOT NULL DEFAULT 0,
  amount_paid_gbp   DECIMAL(10,2) NOT NULL DEFAULT 0,
  amount_due_gbp    DECIMAL(10,2) GENERATED ALWAYS AS (total_gbp - amount_paid_gbp) STORED,
  currency          VARCHAR(3)   NOT NULL DEFAULT 'GBP',
  notes             TEXT,
  created_by        INTEGER      NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 2. Create invoice_items table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id        UUID         NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description       TEXT         NOT NULL,
  quantity          INTEGER      NOT NULL DEFAULT 1,
  unit_price_gbp    DECIMAL(10,2) NOT NULL,
  line_total_gbp    DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price_gbp) STORED,
  type              VARCHAR(30)  NOT NULL
                    CHECK (type IN ('fare','passenger_fee','freight','fuel_surcharge','cargo','baggage','cancellation_fee','adjustment','other')),
  reference_type    VARCHAR(30),
  reference_id      UUID,
  sort_order        INTEGER      NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 3. Create indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_invoices_booking_id
  ON invoices(booking_id);

CREATE INDEX IF NOT EXISTS idx_invoices_organization_id
  ON invoices(organization_id);

CREATE INDEX IF NOT EXISTS idx_invoices_status
  ON invoices(status);

CREATE INDEX IF NOT EXISTS idx_invoices_due_date
  ON invoices(due_date);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id
  ON invoice_items(invoice_id);

-- ---------------------------------------------------------------------------
-- 4. Create updated_at trigger for invoices
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_invoices_updated_at ON invoices;
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

