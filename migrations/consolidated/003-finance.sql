-- ============================================================================
-- FIGAS Airline Booking System – Finance & Accounting Tables
-- Consolidated from migrations: 006, 007, 008, 009, 010, 011, 012, 013
--
-- This file contains all finance-related tables: payment methods, invoices,
-- accounting journal, payment reminders, Stripe payments, bank transactions,
-- and export log.
-- ============================================================================

-- ============================================================================
-- 1. payment_methods – Payment method reference table
--    From migration 006
-- ============================================================================
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

-- Seed payment methods
INSERT INTO payment_methods (code, name, description, requires_online, requires_invoice, sort_order)
VALUES
  ('stripe',            'Stripe (Card Payment)',  'Online payment via credit/debit card',  true,  false, 1),
  ('pay_on_departure',  'Pay on Departure',       'Pay at the airport before departure',   false, false, 2),
  ('pay_on_arrival',    'Pay on Arrival',         'Pay at the destination airport',        false, false, 3),
  ('invoice',           'Invoice',                'Billed via invoice to organization or individual', false, true, 4),
  ('bank_transfer',     'Bank Transfer',          'Direct bank transfer',                  false, true,  5)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 2. invoices – Invoice records
--    From migration 007
-- ============================================================================
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

CREATE INDEX IF NOT EXISTS idx_invoices_booking_id ON invoices(booking_id);
CREATE INDEX IF NOT EXISTS idx_invoices_organization_id ON invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);

-- ============================================================================
-- 3. invoice_items – Invoice line items
--    From migration 007
-- ============================================================================
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

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);

-- ============================================================================
-- 4. chart_of_accounts – Accounting chart of accounts
--    From migration 008
-- ============================================================================
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code  VARCHAR(10)  NOT NULL UNIQUE,
  account_name  VARCHAR(100) NOT NULL,
  account_type  VARCHAR(20)  NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  description   TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed chart of accounts (20 accounts for a government aviation entity)
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

-- ============================================================================
-- 5. accounting_journal_entries – Journal entry headers
--    From migration 008
-- ============================================================================
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

CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_date ON accounting_journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_booking_id ON accounting_journal_entries(booking_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_invoice_id ON accounting_journal_entries(invoice_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_type ON accounting_journal_entries(entry_type);

-- ============================================================================
-- 6. accounting_journal_lines – Journal entry detail lines
--    From migration 008
-- ============================================================================
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

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry_id ON accounting_journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account_id ON accounting_journal_lines(account_id);

-- ============================================================================
-- 7. payment_reminders – Payment reminder scheduling
--    From migration 009
-- ============================================================================
CREATE TABLE IF NOT EXISTS payment_reminders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      INTEGER      REFERENCES bookings(id) ON DELETE CASCADE,
  invoice_id      UUID         REFERENCES invoices(id) ON DELETE CASCADE,
  reminder_type   VARCHAR(20)  NOT NULL
                  CHECK (reminder_type IN ('payment_due','overdue_1d','overdue_7d','overdue_30d')),
  scheduled_at    TIMESTAMPTZ  NOT NULL,
  sent_at         TIMESTAMPTZ,
  sent_to         VARCHAR(255),
  status          VARCHAR(20)  NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','sent','failed','cancelled')),
  error_message   TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminders_status ON payment_reminders(status);
CREATE INDEX IF NOT EXISTS idx_reminders_scheduled_at ON payment_reminders(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_reminders_booking_id ON payment_reminders(booking_id);
CREATE INDEX IF NOT EXISTS idx_reminders_invoice_id ON payment_reminders(invoice_id);

-- ============================================================================
-- 8. stripe_payments – Stripe Checkout Session tracking
--    From migration 010
-- ============================================================================
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

CREATE INDEX IF NOT EXISTS idx_stripe_payments_session_id ON stripe_payments(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_stripe_payments_payment_intent_id ON stripe_payments(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_stripe_payments_payment_id ON stripe_payments(payment_id);
CREATE INDEX IF NOT EXISTS idx_stripe_payments_idempotency_key ON stripe_payments(idempotency_key);

-- ============================================================================
-- 9. bank_transactions – Bank reconciliation
--    From migration 011
-- ============================================================================
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

CREATE INDEX IF NOT EXISTS idx_bank_transactions_date ON bank_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_status ON bank_transactions(reconciliation_status);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_payment_id ON bank_transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_import_batch ON bank_transactions(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_external_id ON bank_transactions(external_id);

-- ============================================================================
-- 10. export_log – Export tracking for external accounting systems
--     From migration 012
-- ============================================================================
CREATE TABLE IF NOT EXISTS export_log (
  id                UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  export_type       VARCHAR(30)     NOT NULL
                    CHECK (export_type IN ('csv','xml','xero','quickbooks','sage','other')),
  export_format     VARCHAR(10)     NOT NULL
                    CHECK (export_format IN ('csv','xml','json')),
  date_from         DATE            NOT NULL,
  date_to           DATE            NOT NULL,
  record_count      INTEGER         NOT NULL DEFAULT 0,
  total_amount_gbp  DECIMAL(10,2)   NOT NULL DEFAULT 0,
  status            VARCHAR(20)     NOT NULL DEFAULT 'completed'
                    CHECK (status IN ('completed','failed','partial')),
  file_path         TEXT,
  error_message     TEXT,
  exported_by       INTEGER         NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_export_log_type ON export_log(export_type);
CREATE INDEX IF NOT EXISTS idx_export_log_date_range ON export_log(date_from, date_to);
CREATE INDEX IF NOT EXISTS idx_export_log_exported_by ON export_log(exported_by);
