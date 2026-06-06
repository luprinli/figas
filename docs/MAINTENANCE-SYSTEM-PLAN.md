# FIGAS Maintenance Management System — Engineering Development Plan

**Date:** 2026-06-05
**Status:** Design & Gap Analysis
**TypeScript:** Zero errors on existing code

---

## 1. Executive Summary

The current maintenance interface provides basic fleet visibility — aircraft registration, airframe hours as `VARCHAR` strings, and service interval progress bars. There is no flight log table, no defect tracking, no component life monitoring, no maintenance task scheduling, no digital sign-off capability, and no ATA chapter categorization.

This plan defines a phased roadmap to build a regulatory-compliant maintenance tracking system suitable for the BN-2 Islander fleet operating in the Falkland Islands.

---

## 2. Current State Assessment

### 2.1 Existing Schema

Only two tables serve the maintenance domain:

| Table | Purpose | Critical Issues |
|-------|---------|----------------|
| `aircraft` | Basic fleet registry (registration, type, weights, arm stations) | No `tbo_hours`, `last_annual_date`, `ata_chapter` mapping |
| `airframe_hours` | Hour tracking per aircraft | `total_hours` stored as `VARCHAR(20)` ("20677:14"), no distinction between tach/Hobbs, no flight-cycle column |

### 2.2 Existing UI

| Component | Purpose | Gaps |
|-----------|---------|------|
| `engineer._index.tsx` | Fleet dashboard with ProgressBar service intervals | Fixed 2500-hour interval, no multi-tier inspection visibility (100hr, 500hr, annual) |
| `engineer.aircraft.tsx` | Fleet list with DataGrid | No hour/cycle columns, no last inspection dates |
| `engineer.airframe-hours.tsx` | Hour records list | Shows raw VARCHAR values, no cycle data |
| `engineer.maintenance.tsx` | Maintenance log | Repurposed airframe hour records — not true maintenance tasks |
| `ProgressBar.tsx` | Single-threshold linear bar | One threshold per bar, no multi-tier (staged) inspection tracking |

### 2.3 Missing Entities (Zero Tables Exist)

None of the following tables exist in the current schema:

- **Flight Log** — actual flight block times, cycles, fuel uplift, snags
- **Maintenance Tasks** — scheduled inspections, work orders, workflow states
- **Defects/Snags** — recorded defects, MEL references, deferral status
- **Lifed Components** — LLPs with serial numbers, TBO/TSO tracking
- **Sign-offs** — digital certification records with engineer credentials
- **ATA Chapters** — chapter reference data for categorizing defects and tasks

---

## 3. Industry Standards Reference

### 3.1 Regulatory Context for BN-2 Islander Operations

The Britten-Norman BN-2B Islander operates under these maintenance frameworks:

| Standard | Requirement |
|----------|-------------|
| **UK CAA CAP 562** | Civil Aircraft Airworthiness Information and Procedures |
| **Part-M / Part-CAMO** | Continuing Airworthiness Management Organisation requirements |
| **Manufacturer's MPD** | BN-2B Maintenance Planning Document — inspection intervals |
| **Falkland Islands Aviation Regulations (FIAR)** | Local regulatory authority requirements |

### 3.2 Inspection Intervals (BN-2B Manufacturer Schedule)

| Interval | Description | Typical Scope |
|----------|-------------|--------------|
| **Pre-flight / Daily** | Walk-around check | Fluids, tires, control surfaces, fuel drains |
| **50-hour** | Minor inspection | Oil change, filter check, cable tensions |
| **100-hour / Annual** | Major inspection | Compression checks, magneto timing, full structural |
| **500-hour** | Intermediate inspection | Propeller overhaul check, landing gear inspection |
| **1,000-hour** | Heavy inspection | Engine removal/inspection, major component replacements |
| **TBO (Time Between Overhaul)** | Engine/propeller overhaul | Lycoming O-540: 2,000 hrs; Hartzell propeller: 2,000 hrs / 6 years |

### 3.3 ATA Chapter System

ATA chapters categorize maintenance activities by aircraft system:

| ATA | System | Relevant to BN-2B |
|-----|--------|-------------------|
| 05 | Time Limits / Maintenance Checks | Inspection intervals |
| 12 | Servicing | Fuel, oil, hydraulics |
| 27 | Flight Controls | Cable tensions, pulleys |
| 32 | Landing Gear | Tires, brakes, oleos |
| 61 | Propellers | Propeller TBO, governor |
| 71 | Power Plant | Engine mounts, controls |
| 72 | Engine | Lycoming O-540 TBO |
| 79 | Oil System | Oil cooler, filter |

---

## 4. Phase 1: Foundation Schema (Week 1-2)

### 4.1 Flight Log Table

Replaces the current practice of using `flights` table for operational scheduling only. Flight Log records actual flown data.

```sql
CREATE TABLE flight_logs (
    id              SERIAL PRIMARY KEY,
    flight_id       INTEGER REFERENCES flights(id) ON DELETE SET NULL,
    aircraft_id     INTEGER NOT NULL REFERENCES aircraft(id),
    captain_id      INTEGER REFERENCES pilots(id),
    departure_date  DATE NOT NULL,
    block_off_time  TIME,            -- chocks off / brakes release
    block_on_time   TIME,            -- chocks on / brakes set
    block_time      INTERVAL GENERATED ALWAYS AS (block_on_time - block_off_time) STORED,
    tach_start      NUMERIC(7,1),    -- Hobbs/tach at engine start
    tach_end        NUMERIC(7,1),    -- Hobbs/tach at engine stop
    tach_time       NUMERIC(4,1) GENERATED ALWAYS AS (tach_end - tach_start) STORED,
    cycles          INTEGER NOT NULL DEFAULT 1,
    fuel_uplift_ltr INTEGER,         -- fuel added before departure
    fuel_start_ltr  INTEGER,         -- fuel at engine start
    fuel_end_ltr    INTEGER,         -- fuel at engine stop
    oil_uplift_ltr  NUMERIC(3,1),
    origin_code     VARCHAR(10) NOT NULL,
    destination_code VARCHAR(10) NOT NULL,
    remarks         TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_flight_logs_aircraft ON flight_logs(aircraft_id, departure_date);
CREATE INDEX idx_flight_logs_date ON flight_logs(departure_date);
```

**Triggers:** After INSERT on `flight_logs`, automatically update `airframe_hours` and component times.

```sql
CREATE OR REPLACE FUNCTION update_airframe_hours()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE airframe_hours
    SET total_hours = TO_CHAR(
        (SPLIT_PART(total_hours, ':', 1)::int + FLOOR(NEW.tach_time))::int,
        'FM999999'
    ) || ':' || LPAD(
        (
            (SPLIT_PART(total_hours, ':', 2)::int + ROUND((NEW.tach_time - FLOOR(NEW.tach_time)) * 60))
            % 60
        )::text,
        2, '0'
    ),
    last_reading_date = NEW.departure_date,
    updated_at = NOW()
    WHERE aircraft_id = NEW.aircraft_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER flight_log_update_hours
AFTER INSERT ON flight_logs
FOR EACH ROW EXECUTE FUNCTION update_airframe_hours();
```

### 4.2 Maintenance Tasks Table

```sql
CREATE TABLE maintenance_tasks (
    id              SERIAL PRIMARY KEY,
    aircraft_id     INTEGER NOT NULL REFERENCES aircraft(id),
    task_type       VARCHAR(50) NOT NULL,     -- 'inspection','repair','overhaul','replacement','modification'
    ata_chapter     VARCHAR(10),              -- '27','32','72', etc.
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    interval_type   VARCHAR(20) NOT NULL,     -- 'hours','cycles','calendar','condition'
    interval_value  INTEGER NOT NULL,         -- 50, 100, 500, 1000, etc.
    last_completed_at TIMESTAMPTZ,
    last_completed_hours NUMERIC(7,1),
    last_completed_cycles INTEGER,
    next_due_hours  NUMERIC(7,1) GENERATED ALWAYS AS (last_completed_hours + interval_value) STORED,
    next_due_date   DATE,
    status          VARCHAR(20) DEFAULT 'open', -- 'open','in_progress','completed','deferred'
    assigned_to     INTEGER REFERENCES users(id),
    priority        VARCHAR(10) DEFAULT 'routine', -- 'routine','urgent','aog' (Aircraft On Ground)
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    completed_by    INTEGER REFERENCES users(id)
);

CREATE INDEX idx_maint_tasks_aircraft ON maintenance_tasks(aircraft_id, status);
CREATE INDEX idx_maint_tasks_due ON maintenance_tasks(next_due_hours) WHERE status = 'open';
```

### 4.3 Defects & Snags Table

```sql
CREATE TABLE defects (
    id              SERIAL PRIMARY KEY,
    aircraft_id     INTEGER NOT NULL REFERENCES aircraft(id),
    flight_log_id   INTEGER REFERENCES flight_logs(id),
    reported_by     INTEGER NOT NULL REFERENCES users(id),
    reported_at     TIMESTAMPTZ DEFAULT NOW(),
    ata_chapter     VARCHAR(10),
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    severity        VARCHAR(20) DEFAULT 'minor', -- 'minor','major','critical','aog'
    mel_reference   VARCHAR(50),                 -- MEL item number (e.g., '32-10-01')
    mel_category    VARCHAR(1),                  -- 'A','B','C','D' per MEL
    deferral_status VARCHAR(20) DEFAULT 'open',  -- 'open','deferred','rectified','closed'
    deferral_approved_by INTEGER REFERENCES users(id),
    deferral_expiry_date DATE,
    rectification   TEXT,                         -- corrective action taken
    rectified_at    TIMESTAMPTZ,
    rectified_by    INTEGER REFERENCES users(id),
    maintenance_task_id INTEGER REFERENCES maintenance_tasks(id), -- linked work order
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_defects_aircraft ON defects(aircraft_id, deferral_status);
CREATE INDEX idx_defects_open ON defects(deferral_status) WHERE deferral_status = 'open';
```

### 4.4 Lifed Components Table

```sql
CREATE TABLE lifed_components (
    id              SERIAL PRIMARY KEY,
    aircraft_id     INTEGER NOT NULL REFERENCES aircraft(id),
    component_name  VARCHAR(255) NOT NULL,
    part_number     VARCHAR(100),
    serial_number   VARCHAR(100),
    ata_chapter     VARCHAR(10),
    tbo_hours       NUMERIC(7,1) NOT NULL,       -- Time Between Overhaul in hours
    tbo_cycles      INTEGER,                     -- Time Between Overhaul in cycles
    tbo_calendar_months INTEGER,                 -- Calendar life limit
    installed_hours NUMERIC(7,1) NOT NULL,       -- Hours at installation
    installed_cycles INTEGER,                    -- Cycles at installation
    installed_date  DATE NOT NULL,               -- Installation date
    current_hours   NUMERIC(7,1) NOT NULL,       -- Current component hours
    current_cycles  INTEGER,                     -- Current component cycles
    hours_remaining NUMERIC(7,1) GENERATED ALWAYS AS (tbo_hours - (current_hours - installed_hours)) STORED,
    cycles_remaining INTEGER GENERATED ALWAYS AS (tbo_cycles - (current_cycles - installed_cycles)) STORED,
    days_remaining  INTEGER GENERATED ALWAYS AS (
        tbo_calendar_months * 30 - (CURRENT_DATE - installed_date)
    ) STORED,
    status          VARCHAR(20) DEFAULT 'active', -- 'active','removed','overhauled','scrapped'
    last_inspected_at TIMESTAMPTZ,
    remarks         TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lifed_components_aircraft ON lifed_components(aircraft_id, status);
CREATE INDEX idx_lifed_components_due ON lifed_components(hours_remaining) WHERE status = 'active';
```

### 4.5 Digital Sign-offs Table

```sql
CREATE TABLE sign_offs (
    id              SERIAL PRIMARY KEY,
    entity_type     VARCHAR(30) NOT NULL,        -- 'flight_log','maintenance_task','defect','inspection'
    entity_id       INTEGER NOT NULL,
    signed_by       INTEGER NOT NULL REFERENCES users(id),
    signed_at       TIMESTAMPTZ DEFAULT NOW(),
    certification_statement TEXT,               -- "I certify that the work described has been carried out..."
    licence_number  VARCHAR(50),                 -- Engineer's licence number (e.g., CAA LWTR)
    signature_hash  VARCHAR(64),                 -- Cryptographic hash for non-repudiation
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sign_offs_entity ON sign_offs(entity_type, entity_id);
```

### 4.6 ATA Chapters Reference Table

```sql
CREATE TABLE ata_chapters (
    chapter         VARCHAR(10) PRIMARY KEY,
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    aircraft_type   VARCHAR(100) DEFAULT 'BN-2B Islander'
);

INSERT INTO ata_chapters (chapter, title, description) VALUES
('05','Time Limits/Maintenance Checks','Scheduled inspection intervals and life limits'),
('12','Servicing','Fuel, oil, hydraulic, and pneumatic servicing'),
('27','Flight Controls','Aileron, elevator, rudder, and flap control systems'),
('32','Landing Gear','Main gear, nose gear, wheels, brakes, and tires'),
('61','Propellers','Propeller assembly, governor, and de-ice system'),
('71','Power Plant','Engine cowling, mounts, and fire detection'),
('72','Engine','Lycoming O-540-E4C5 — cylinders, pistons, valves'),
('79','Oil System','Oil tank, cooler, filter, and indicating system');
```

---

## 5. Phase 2: Backend Wiring (Week 3-4)

### 5.1 Flight Log → Component Tracking

When a `flight_logs` row is inserted, a trigger or service should:

1. **Update** `airframe_hours` — increment `total_hours` by `tach_time`, update `last_reading_date`
2. **Decrement** `lifed_components.hours_remaining` and `cycles_remaining` for all active components on the aircraft
3. **Check** `maintenance_tasks` — if any task's `next_due_hours` ≤ current hours, create a work order with `status = 'open'`
4. **Update** `aircraft` — set `is_active = false` if any critical defect is open with `severity = 'aog'`

### 5.2 Color-Coded Alerting

```typescript
// app/utils/maintenance-alerts.server.ts
export function getComponentStatus(remaining: number, tbo: number): 'green' | 'amber' | 'red' {
  const pct = remaining / tbo;
  if (pct <= 0.10) return 'red';      // <10% remaining — immediate action
  if (pct <= 0.25) return 'amber';    // <25% remaining — plan replacement
  return 'green';                     // OK
}

export function getTaskPriority(task: { next_due_hours: number; current_hours: number }): 'routine' | 'urgent' | 'aog' {
  const remaining = task.next_due_hours - task.current_hours;
  if (remaining <= 0) return 'aog';     // Overdue
  if (remaining <= 5) return 'urgent';  // Due within 5 hours
  return 'routine';
}
```

---

## 6. Phase 3: UI Enhancements (Week 5-6)

### 6.1 Enhanced Fleet Status Dashboard

Replace the current single-threshold `ProgressBar` with:

- **Multi-tier inspection progress** per aircraft — 100hr, 500hr, 1000hr shown as stacked compact bars
- **Component health summary** — worst-case LLP status per aircraft (red=any LLP < 10% life)
- **Open defects badge** — count of open/deferred defects per registration
- **Next inspection due** — days/hours until next scheduled task

### 6.2 Electronic Tech Log (ETL)

| UI Element | Data Source | Features |
|-----------|------------|----------|
| Flight selector | `flights` + `flight_logs` | Dropdown of today's scheduled flights, or manual entry |
| Block times | `flight_logs.block_off_time`, `block_on_time` | Auto-calculate block time from times |
| Tach in/out | `flight_logs.tach_start`, `tach_end` | Number inputs with validation |
| Fuel section | `flight_logs.fuel_*` columns | Uplift, start, end with auto-calculated burn |
| Snag reporting | `defects` (linked to `flight_log_id`) | Quick-add defects during/after flight |
| Sign-off | `sign_offs` | Digital certification with licence number |

### 6.3 Maintenance Task Board

Kanban-style board with columns:

```
[Open] → [In Progress] → [Pending Sign-off] → [Completed]
```

- Drag tasks between columns
- Filter by ATA chapter, aircraft, date range
- Color-coded by priority (routine=blue, urgent=amber, AOG=red)
- Click task → detail panel with full description, linked defects, sign-off history

### 6.4 Defect & Snag Tracker

- **MEL integration:** Dropdown of MEL references with auto-populated category and rectification interval
- **Deferral workflow:**
  1. Engineer reports defect → `status = 'open'`
  2. Engineer applies MEL reference → `deferral_status = 'deferred'`, `deferral_expiry_date` set
  3. Maintenance completes rectification → `status = 'rectified'`, linked `maintenance_task` created
  4. Inspector signs off → `status = 'closed'`
- **ATA chapter filter:** Categorize defects by system for trend analysis

### 6.5 Component Time-Track

- **Dashboard widget:** LLP status with color-coded gauges
- **Detail table:** All components per aircraft, sortable by hours/cycles remaining
- **Auto-alert:** RED when ≤10% life remaining, AMBER when ≤25%
- **Replacement logging:** Record removal reason, new serial number, installation hours

---

## 7. Phase 4: API & Permissions (Week 7-8)

### 7.1 New Permissions

| Permission | Description |
|-----------|-------------|
| `maintenance:log-flight` | Create flight log entries (engineer, pilot) |
| `maintenance:create-task` | Create maintenance work orders |
| `maintenance:sign-off` | Digitally certify work completed |
| `maintenance:defer-defect` | Approve defect deferrals (senior engineer) |
| `maintenance:manage-components` | Add/remove/replace lifed components |

### 7.2 API Endpoints

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/flight-log` | POST | Submit electronic tech log entry |
| `/api/maintenance-tasks` | GET/POST | List/create tasks |
| `/api/maintenance-tasks/:id` | PATCH | Update task status (kanban moves) |
| `/api/defects` | GET/POST | Report/list defects |
| `/api/defects/:id/defer` | POST | Apply MEL deferral |
| `/api/defects/:id/rectify` | POST | Record rectification |
| `/api/components` | GET/POST | Component lifecycle tracking |
| `/api/sign-off` | POST | Digital certification |

---

## 8. Data Integrity & Validation Rules

### 8.1 Referential Integrity

| Rule | Enforcement |
|------|-------------|
| Flight log must reference valid aircraft | FK `aircraft_id NOT NULL` |
| Defect rectification must link to maintenance task | FK `maintenance_task_id` (optional) |
| Sign-off must reference valid user with `maintenance:sign-off` permission | Application-level check |
| Component install date < current date | CHECK constraint |
| Tach end > Tach start | CHECK constraint |

### 8.2 Running Calculations

```sql
-- Remaining hours until next 100-hour inspection
SELECT aircraft_id,
       last_completed_hours + 100 - (
         SELECT MAX(tach_end) FROM flight_logs WHERE aircraft_id = a.id
       ) AS hours_remaining
FROM maintenance_tasks
WHERE task_type = 'inspection' AND interval_value = 100;

-- Components due for replacement within 50 hours
SELECT c.registration, lc.*
FROM lifed_components lc
JOIN aircraft c ON c.id = lc.aircraft_id
WHERE lc.hours_remaining <= 50 AND lc.status = 'active'
ORDER BY lc.hours_remaining ASC;
```

---

## 9. Implementation Priority Matrix

| Phase | Deliverable | Effort | Dependencies |
|-------|------------|--------|-------------|
| 1 | `flight_logs` table + triggers | 4h | None |
| 1 | `maintenance_tasks` table | 2h | None |
| 1 | `defects` table | 2h | None |
| 1 | `lifed_components` table | 2h | None |
| 1 | `sign_offs` table | 1h | `users` table |
| 1 | `ata_chapters` reference data | 1h | None |
| 2 | Auto-update triggers for flight log → component tracking | 3h | Phase 1 tables |
| 2 | Color-coded alert service | 2h | Phase 1 tables |
| 3 | Enhanced fleet dashboard (multi-tier bars) | 4h | Phase 1-2 |
| 3 | Electronic Tech Log UI | 6h | Phase 1 tables |
| 3 | Maintenance Task Board (kanban) | 4h | `maintenance_tasks` table |
| 3 | Defect Tracker with MEL integration | 4h | `defects` table |
| 3 | Component Time-Track widget | 3h | `lifed_components` table |
| 4 | Permissions + API routes | 4h | Phase 3 |
| 4 | Sign-off digital certification | 2h | `sign_offs` table |

**Total effort:** ~40h over 8 weeks.

---

## 10. Migration Safety

All new tables are additive — zero changes to existing tables. Existing `airframe_hours` queries continue to function via `SPLIT_PART` parsing. The `flights` table remains untouched for scheduling purposes; `flight_logs` is a separate table for actual flown data. Backward compatibility is maintained by keeping all existing engineer routes operational while adding new routes under `/engineer/*`.
