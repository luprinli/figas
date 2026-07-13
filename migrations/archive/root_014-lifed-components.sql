-- 014-lifed-components.sql
-- Life-limited parts (LLPs) with TBO/TSO tracking.

CREATE TABLE IF NOT EXISTS lifed_components (
    id              SERIAL PRIMARY KEY,
    aircraft_id     INTEGER NOT NULL REFERENCES aircraft(id),
    component_name  VARCHAR(255) NOT NULL,
    part_number     VARCHAR(100),
    serial_number   VARCHAR(100),
    ata_chapter     VARCHAR(10),
    tbo_hours       NUMERIC(7,1) NOT NULL,
    tbo_cycles      INTEGER,
    tbo_calendar_months INTEGER,
    installed_hours NUMERIC(7,1) NOT NULL,
    installed_cycles INTEGER DEFAULT 0,
    installed_date  DATE NOT NULL,
    current_hours   NUMERIC(7,1) NOT NULL,
    current_cycles  INTEGER DEFAULT 0,
    hours_remaining NUMERIC(7,1),
    cycles_remaining INTEGER,
    status          VARCHAR(20) DEFAULT 'active',
    last_inspected_at TIMESTAMPTZ,
    remarks         TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lifed_comp_aircraft ON lifed_components(aircraft_id, status);
CREATE INDEX IF NOT EXISTS idx_lifed_comp_due ON lifed_components(hours_remaining) WHERE status = 'active';
