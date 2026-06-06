-- ============================================================================
-- FIGAS Airline Booking System – Export Log
-- Migration 012: Create export_log table for tracking exports to external
--               accounting systems
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Create export_log table
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2. Create indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_export_log_type
  ON export_log(export_type);

CREATE INDEX IF NOT EXISTS idx_export_log_date_range
  ON export_log(date_from, date_to);

CREATE INDEX IF NOT EXISTS idx_export_log_exported_by
  ON export_log(exported_by);

