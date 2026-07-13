-- 013-defects.sql
-- Defect/Snag tracker with MEL references and deferral workflow.

CREATE TABLE IF NOT EXISTS defects (
    id              SERIAL PRIMARY KEY,
    aircraft_id     INTEGER NOT NULL REFERENCES aircraft(id),
    flight_log_id   INTEGER REFERENCES flight_logs(id),
    reported_by     INTEGER NOT NULL REFERENCES users(id),
    reported_at     TIMESTAMPTZ DEFAULT NOW(),
    ata_chapter     VARCHAR(10),
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    severity        VARCHAR(20) DEFAULT 'minor',
    mel_reference   VARCHAR(50),
    mel_category    VARCHAR(1),
    deferral_status VARCHAR(20) DEFAULT 'open',
    deferral_approved_by INTEGER REFERENCES users(id),
    deferral_expiry_date DATE,
    rectification   TEXT,
    rectified_at    TIMESTAMPTZ,
    rectified_by    INTEGER REFERENCES users(id),
    maintenance_task_id INTEGER REFERENCES maintenance_tasks(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_defects_aircraft ON defects(aircraft_id, deferral_status);
CREATE INDEX IF NOT EXISTS idx_defects_open ON defects(deferral_status) WHERE deferral_status != 'closed';
