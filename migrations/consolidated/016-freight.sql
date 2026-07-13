-- 018-freight.sql
-- Freight consignments for FIGAS cargo operations.
-- Freight enters as unassigned and is assigned to flights via the schedule builder drag-and-drop.

CREATE TABLE IF NOT EXISTS freight_consignments (
    id              SERIAL PRIMARY KEY,
    flight_id       INTEGER REFERENCES flights(id) ON DELETE SET NULL,
    consignor_name  VARCHAR(255) NOT NULL,
    consignee_name  VARCHAR(255) NOT NULL,
    description     TEXT,
    weight_kg       NUMERIC(7,1) NOT NULL,
    length_cm       NUMERIC(5,1),
    width_cm        NUMERIC(5,1),
    height_cm       NUMERIC(5,1),
    priority        VARCHAR(20) DEFAULT 'medium',
    hazardous       BOOLEAN DEFAULT false,
    waybill_number  VARCHAR(50),
    payment_mode    VARCHAR(30),
    organization_account_id INTEGER,
    status          VARCHAR(20) DEFAULT 'unassigned',
    created_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_freight_flight ON freight_consignments(flight_id) WHERE flight_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_freight_status ON freight_consignments(status);
