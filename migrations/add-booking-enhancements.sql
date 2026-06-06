-- Phase 2: Discount fields on booking_passengers
ALTER TABLE booking_passengers ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) DEFAULT 'none';
ALTER TABLE booking_passengers ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,1) DEFAULT 0;

-- Phase 3: Line-item fare on booking_leg_passengers + payment allocations
ALTER TABLE booking_leg_passengers ADD COLUMN IF NOT EXISTS line_fare_amount NUMERIC(8,2);
ALTER TABLE booking_leg_passengers ADD COLUMN IF NOT EXISTS discount_applied BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS payment_allocations (
  id                        SERIAL PRIMARY KEY,
  payment_id                INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  booking_leg_passenger_id  INTEGER NOT NULL REFERENCES booking_leg_passengers(id) ON DELETE RESTRICT,
  allocated_amount          NUMERIC(10,2) NOT NULL,
  allocation_type           VARCHAR(20) DEFAULT 'full',
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payment_allocations_payment ON payment_allocations(payment_id);
CREATE INDEX idx_payment_allocations_blp ON payment_allocations(booking_leg_passenger_id);

-- Phase 4: Line-item invoices
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id                        SERIAL PRIMARY KEY,
  invoice_id                UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  booking_leg_passenger_id  INTEGER REFERENCES booking_leg_passengers(id) ON DELETE SET NULL,
  description               VARCHAR(255) NOT NULL,
  unit_price                NUMERIC(10,2) NOT NULL,
  quantity                  INTEGER DEFAULT 1,
  discount_amount           NUMERIC(10,2) DEFAULT 0,
  line_total                NUMERIC(10,2) NOT NULL,
  tax_rate                  NUMERIC(5,2) DEFAULT 0,
  tax_amount                NUMERIC(10,2) DEFAULT 0,
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoice_line_items_invoice ON invoice_line_items(invoice_id);
