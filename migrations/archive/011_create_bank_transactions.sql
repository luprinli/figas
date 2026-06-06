-- ============================================================================
-- FIGAS Airline Booking System – Bank Transactions
-- Migration 011: Create bank_transactions table for bank reconciliation
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Create bank_transactions table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bank_transactions (
  id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id             VARCHAR(255),
  transaction_date        DATE            NOT NULL,
  description             TEXT            NOT NULL,
  amount_gbp              DECIMAL(10,2)   NOT NULL,
  balance_gbp             DECIMAL(10,2),
  reference               VARCHAR(255),
  payment_id              INTEGER         REFERENCES payments(id) ON DELETE SET NULL,
  reconciliation_status   VARCHAR(20)     NOT NULL DEFAULT 'unmatched'
                          CHECK (reconciliation_status IN (
                            'unmatched',
                            'matched',
                            'disputed'
                          )),
  matched_at              TIMESTAMPTZ,
  matched_by              INTEGER         REFERENCES users(id),
  import_batch_id         VARCHAR(50),
  raw_data                JSONB,
  notes                   TEXT,
  created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 2. Create indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bank_transactions_date
  ON bank_transactions(transaction_date);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_status
  ON bank_transactions(reconciliation_status);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_payment_id
  ON bank_transactions(payment_id);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_import_batch
  ON bank_transactions(import_batch_id);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_external_id
  ON bank_transactions(external_id);

-- ---------------------------------------------------------------------------
-- 3. Create updated_at trigger
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_bank_transactions_updated_at ON bank_transactions;
CREATE TRIGGER trg_bank_transactions_updated_at
  BEFORE UPDATE ON bank_transactions
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

