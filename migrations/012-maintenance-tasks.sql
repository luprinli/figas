-- 012-maintenance-tasks.sql
-- Scheduled inspections, work orders, and maintenance activities.

CREATE TABLE IF NOT EXISTS maintenance_tasks (
    id              SERIAL PRIMARY KEY,
    aircraft_id     INTEGER NOT NULL REFERENCES aircraft(id),
    task_type       VARCHAR(50) NOT NULL DEFAULT 'inspection',
    ata_chapter     VARCHAR(10),
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    interval_type   VARCHAR(20) NOT NULL DEFAULT 'hours',
    interval_value  INTEGER NOT NULL,
    last_completed_at TIMESTAMPTZ,
    last_completed_hours NUMERIC(7,1),
    last_completed_cycles INTEGER DEFAULT 0,
    next_due_hours  NUMERIC(7,1),
    next_due_date   DATE,
    status          VARCHAR(20) DEFAULT 'open',
    assigned_to     INTEGER REFERENCES users(id),
    priority        VARCHAR(10) DEFAULT 'routine',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    completed_by    INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_maint_tasks_aircraft ON maintenance_tasks(aircraft_id, status);
CREATE INDEX IF NOT EXISTS idx_maint_tasks_status ON maintenance_tasks(status);
