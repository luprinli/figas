-- ============================================================================
-- FIGAS Airline Booking System – Double-Entry Accounting Journal
-- Migration 008: Create chart_of_accounts, accounting_journal_entries,
--              and accounting_journal_lines tables for proper
--              double-entry bookkeeping.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Create chart_of_accounts table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code  VARCHAR(10)  NOT NULL UNIQUE,
  account_name  VARCHAR(100) NOT NULL,
  account_type  VARCHAR(20)  NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  description   TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 2. Seed chart of accounts (20 accounts for a government aviation entity)
-- ---------------------------------------------------------------------------
INSERT INTO chart_of_accounts (account_code, account_name, account_type, description) VALUES
  -- Assets (1000-1399)
  ('1010', 'Cash at Bank',              'asset',    'Cash held in bank accounts'),
  ('1020', 'Accounts Receivable',       'asset',    'Amounts owed by customers'),
  ('1030', 'Prepaid Expenses',          'asset',    'Prepaid insurance, leases, etc.'),

  -- Liabilities (2000-2399)
  ('2010', 'Accounts Payable',          'liability', 'Amounts owed to suppliers'),
  ('2020', 'Deferred Revenue',          'liability', 'Unearned ticket revenue'),
  ('2030', 'VAT/GST Payable',           'liability', 'Value-added / goods & services tax collected'),

  -- Equity (3000-3399)
  ('3010', 'Retained Earnings',         'equity',    'Accumulated retained earnings'),
  ('3020', 'Current Year Earnings',     'equity',    'Current financial year profit/loss'),

  -- Revenue (4000-4399)
  ('4010', 'Passenger Fare Revenue',    'revenue',   'Revenue from passenger ticket sales'),
  ('4020', 'Freight/Cargo Revenue',     'revenue',   'Revenue from freight and cargo transport'),
  ('4030', 'Baggage Fee Revenue',       'revenue',   'Revenue from baggage fees'),
  ('4040', 'Fuel Surcharge Revenue',    'revenue',   'Revenue from fuel surcharges'),
  ('4050', 'Cancellation Fee Revenue',  'revenue',   'Revenue from cancellation / change fees'),
  ('4060', 'Other Revenue',             'revenue',   'Miscellaneous revenue'),

  -- Expenses (5000-5399)
  ('5010', 'Fuel Expense',              'expense',   'Aircraft fuel and oil costs'),
  ('5020', 'Maintenance Expense',       'expense',   'Aircraft maintenance and repair costs'),
  ('5030', 'Staff Costs',               'expense',   'Salaries, wages, and benefits'),
  ('5040', 'Landing & Handling Fees',   'expense',   'Airport landing and ground handling fees'),
  ('5050', 'Insurance Expense',         'expense',   'Aviation insurance premiums'),
  ('5060', 'Bank Charges & Processing Fees', 'expense', 'Bank fees and payment processing charges')
ON CONFLICT (account_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Create accounting_journal_entries table (journal header)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounting_journal_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_number  VARCHAR(30)  NOT NULL UNIQUE,
  entry_type    VARCHAR(30)  NOT NULL CHECK (entry_type IN ('payment','refund','invoice_issued','invoice_payment','reconciliation','fee','adjustment')),
  description   TEXT         NOT NULL,
  booking_id    INTEGER      REFERENCES bookings(id) ON DELETE SET NULL,
  invoice_id    UUID         REFERENCES invoices(id) ON DELETE SET NULL,
  payment_id    INTEGER      REFERENCES payments(id) ON DELETE SET NULL,
  entry_date    DATE         NOT NULL,
  posting_date  DATE,
  created_by    INTEGER      NOT NULL REFERENCES users(id),
  approved_by   INTEGER      REFERENCES users(id),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 4. Create accounting_journal_lines table (journal detail / lines)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounting_journal_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id          UUID           NOT NULL REFERENCES accounting_journal_entries(id) ON DELETE CASCADE,
  account_id        UUID           NOT NULL REFERENCES chart_of_accounts(id),
  debit_amount_gbp  DECIMAL(10,2)  NOT NULL DEFAULT 0,
  credit_amount_gbp DECIMAL(10,2)  NOT NULL DEFAULT 0,
  description       TEXT,
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  -- Amounts must be non-negative
  CONSTRAINT chk_journal_line_amounts_non_negative
    CHECK (debit_amount_gbp >= 0 AND credit_amount_gbp >= 0),

  -- Each line must have at least one side (debit or credit)
  CONSTRAINT chk_journal_line_at_least_one_side
    CHECK (NOT (debit_amount_gbp = 0 AND credit_amount_gbp = 0)),

  -- A line cannot be both debit AND credit
  CONSTRAINT chk_journal_line_not_both_sides
    CHECK (NOT (debit_amount_gbp > 0 AND credit_amount_gbp > 0))
);

-- ---------------------------------------------------------------------------
-- 5. Create indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_date
  ON accounting_journal_entries(entry_date);

CREATE INDEX IF NOT EXISTS idx_journal_entries_booking_id
  ON accounting_journal_entries(booking_id);

CREATE INDEX IF NOT EXISTS idx_journal_entries_invoice_id
  ON accounting_journal_entries(invoice_id);

CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_type
  ON accounting_journal_entries(entry_type);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry_id
  ON accounting_journal_lines(entry_id);

CREATE INDEX IF NOT EXISTS idx_journal_lines_account_id
  ON accounting_journal_lines(account_id);

-- ---------------------------------------------------------------------------
-- 6. Create updated_at trigger for accounting_journal_entries
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_accounting_journal_entries_updated_at ON accounting_journal_entries;
CREATE TRIGGER trg_accounting_journal_entries_updated_at
  BEFORE UPDATE ON accounting_journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

