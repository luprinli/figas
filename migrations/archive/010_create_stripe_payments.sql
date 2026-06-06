-- ============================================================================
-- FIGAS Airline Booking System – Stripe Payments
-- Migration 010: Create stripe_payments table for tracking Stripe Checkout
--              Session data and payment lifecycle.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Create stripe_payments table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stripe_payments (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id                INTEGER        NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  stripe_session_id         VARCHAR(255)   NOT NULL UNIQUE,
  stripe_payment_intent_id  VARCHAR(255),
  stripe_customer_id        VARCHAR(255),
  amount_gbp                DECIMAL(10,2)  NOT NULL,
  currency                  VARCHAR(3)     NOT NULL DEFAULT 'GBP',
  status                    VARCHAR(30)    NOT NULL DEFAULT 'pending'
                            CHECK (status IN (
                              'pending',
                              'requires_payment_method',
                              'requires_confirmation',
                              'requires_action',
                              'processing',
                              'succeeded',
                              'failed',
                              'refunded',
                              'partially_refunded'
                            )),
  payment_method_details    JSONB,
  receipt_url               TEXT,
  refund_amount_gbp         DECIMAL(10,2)  NOT NULL DEFAULT 0,
  refunded_at               TIMESTAMPTZ,
  error_message             TEXT,
  idempotency_key           VARCHAR(255),
  created_at                TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 2. Create indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_stripe_payments_session_id
  ON stripe_payments(stripe_session_id);

CREATE INDEX IF NOT EXISTS idx_stripe_payments_payment_intent_id
  ON stripe_payments(stripe_payment_intent_id);

CREATE INDEX IF NOT EXISTS idx_stripe_payments_payment_id
  ON stripe_payments(payment_id);

CREATE INDEX IF NOT EXISTS idx_stripe_payments_idempotency_key
  ON stripe_payments(idempotency_key);

-- ---------------------------------------------------------------------------
-- 3. Create updated_at trigger
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_stripe_payments_updated_at ON stripe_payments;
CREATE TRIGGER trg_stripe_payments_updated_at
  BEFORE UPDATE ON stripe_payments
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

