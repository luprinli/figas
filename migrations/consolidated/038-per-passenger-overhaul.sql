-- ============================================================================
-- 038: Per-Passenger Scheduling Overhaul
-- Derived from docs/atomic_passenger_scheduling_remediation.md
-- ============================================================================

-- Phase 1: Booking payment mode
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(20) NOT NULL DEFAULT 'per_booking';
DO $$ BEGIN
  ALTER TABLE bookings
    ADD CONSTRAINT chk_bookings_payment_mode CHECK (payment_mode IN ('per_booking', 'per_passenger'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Phase 2: Refund tracking on junction records
ALTER TABLE booking_leg_passengers
  ADD COLUMN IF NOT EXISTS refund_amount_gbp NUMERIC(8,2);
ALTER TABLE booking_leg_passengers
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_blp_refunded_at ON booking_leg_passengers(refunded_at);

-- Phase 3: Derivation trigger — booking_legs.flight_id becomes a read-only derived column.
-- When a booking_leg_passengers.flight_leg_id is set or cleared, the corresponding
-- booking_legs.flight_id is recalculated from the junction records.
CREATE OR REPLACE FUNCTION derive_booking_leg_flight_id() RETURNS TRIGGER AS $$
DECLARE
  target_leg_id INTEGER;
BEGIN
  target_leg_id := COALESCE(NEW.booking_leg_id, OLD.booking_leg_id);
  UPDATE booking_legs bl
    SET flight_id = (
      SELECT fl.flight_id
        FROM booking_leg_passengers blp2
        JOIN flight_legs fl ON fl.id = blp2.flight_leg_id
        WHERE blp2.booking_leg_id = bl.id
          AND blp2.flight_leg_id IS NOT NULL
        LIMIT 1
    )
    WHERE bl.id = target_leg_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_blp_derive_flight_id ON booking_leg_passengers;
CREATE TRIGGER trg_blp_derive_flight_id
  AFTER INSERT OR UPDATE OF flight_leg_id OR DELETE ON booking_leg_passengers
  FOR EACH ROW EXECUTE FUNCTION derive_booking_leg_flight_id();

-- Phase 4: Backfill existing stale booking_legs.flight_id values
-- This is the one-time counterpart to the removal of the runtime self-healing backfill.
-- After this migration, the trigger handles all future consistency.
UPDATE booking_legs bl
  SET flight_id = sub.flight_id
  FROM (
    SELECT blp2.booking_leg_id, fl.flight_id
      FROM booking_leg_passengers blp2
      JOIN flight_legs fl ON fl.id = blp2.flight_leg_id
      WHERE blp2.flight_leg_id IS NOT NULL
      GROUP BY blp2.booking_leg_id, fl.flight_id
  ) sub
  WHERE bl.id = sub.booking_leg_id
    AND (bl.flight_id IS NULL OR bl.flight_id <> sub.flight_id);
