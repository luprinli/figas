-- ============================================================================
-- FIGAS Airline Booking System – Payment Reminders
-- Migration 009: Create payment_reminders table for automated payment
--              reminder scheduling (due date, overdue escalation).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Create payment_reminders table
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2. Create indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_reminders_status
  ON payment_reminders(status);

CREATE INDEX IF NOT EXISTS idx_reminders_scheduled_at
  ON payment_reminders(scheduled_at);

CREATE INDEX IF NOT EXISTS idx_reminders_booking_id
  ON payment_reminders(booking_id);

CREATE INDEX IF NOT EXISTS idx_reminders_invoice_id
  ON payment_reminders(invoice_id);

