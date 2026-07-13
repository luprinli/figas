# FIGAS Loadsheet — Technical & Operational Design Plan

> **Document Version**: 1.0  
> **Last Updated**: 2026-06-04  
> **Author**: FIGAS Engineering  
> **Status**: Draft for Review  

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Dual-Mode Pilot Interface](#2-dual-mode-pilot-interface)
3. [End-to-End Document Lifecycle](#3-end-to-end-document-lifecycle)
4. [Data Integrity & Immutability](#4-data-integrity--immutability)
5. [Database Schema](#5-database-schema)
6. [Seating Configuration & COG Logic](#6-seating-configuration--cog-logic)
7. [Fuel Calculations](#7-fuel-calculations)
8. [Weight & Balance Integration](#8-weight--balance-integration)
9. [Route & Component Architecture](#9-route--component-architecture)
10. [Edge Cases & Critical Features](#10-edge-cases--critical-features)
11. [Development Roadmap](#11-development-roadmap)
12. [Testing Strategy](#12-testing-strategy)
13. [Print & Export](#13-print--export)
14. [Audit & Compliance](#14-audit--compliance)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SYSTEM ARCHITECTURE                          │
│                                                                     │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────────────┐  │
│  │ Schedule │───→│ Published    │───→│ Loadsheet Generation     │  │
│  │ Builder  │    │ Schedule     │    │ (auto from flight data)  │  │
│  └──────────┘    └──────────────┘    └───────────┬──────────────┘  │
│                                                   │                 │
│                                                   ▼                 │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    LOADSHEET LIFECYCLE                        │  │
│  │                                                               │  │
│  │  DRAFT ──→ REVIEW ──→ ACTIVE ──→ FINALIZED ──→ ARCHIVED     │  │
│  │    │          │          │            │            │          │  │
│  │    │    Pilot reviews  In-flight   Post-flight   Immutable   │  │
│  │    │    & adjusts      data entry  sign-off      record      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────┐         ┌────────────────────────────┐  │
│  │  Passenger-Facing    │         │  Flight Operations View    │  │
│  │  Mode (Pilot)        │         │  Mode (Pilot)             │  │
│  │                      │         │                            │  │
│  │  • My bookings       │         │  • Loadsheet dashboard    │  │
│  │  • Flight status     │         │  • Passenger manifest     │  │
│  │  • Passenger list    │         │  • Sector calculations    │  │
│  │  • Boarding check    │         │  • Fuel & W&B            │  │
│  └──────────────────────┘         └────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Technology Stack (Existing)

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Remix 2 + TypeScript + Tailwind CSS |
| Backend | Remix server runtime + Prisma ORM |
| Database | PostgreSQL 15 |
| DnD | @dnd-kit/core (already used for schedule builder) |
| PDF | @react-pdf/renderer or html2canvas for loadsheet export |
| Auth | Existing role-based permissions (permissions.server.ts) |

---

## 2. Dual-Mode Pilot Interface

Pilots interact with the system through two distinct modes, switchable from a unified navigation:

### 2.1 Pilot Dashboard (Entry Point)

Route: `/ops/dashboard`

```
┌──────────────────────────────────────────────────────────────┐
│  FIGAS Operations                      👤 Capt. D. Smith     │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌───────────────────┐  ┌───────────────────┐               │
│  │                   │  │                   │               │
│  │  📋 My Flights    │  │  📊 Loadsheets    │               │
│  │                   │  │                   │               │
│  │  3 flights today  │  │  2 drafts         │               │
│  │                   │  │  1 active         │               │
│  └───────────────────┘  └───────────────────┘               │
│                                                               │
│  Today's Schedule — Thu 4 Jun 2026                            │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ FIG040601  STY→SPI→PHP→PSC→BKI→STY                      │ │
│  │ BN-2 VP-FBN  │  ETD 05:30  │  3 pax  │  [View Loadsheet]│ │
│  ├─────────────────────────────────────────────────────────┤ │
│  │ FIG040602  BKI→SPI→PHP→PSC→STY                          │ │
│  │ BN-2 VP-FBD  │  ETD 07:00  │  3 pax  │  [View Loadsheet]│ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 Passenger-Facing Mode

Route: `/ops/flight/:flightId/passengers`

Designed for the pilot to show passengers or manage boarding. Large text, touch-friendly.

```
┌──────────────────────────────────────────────────────────────┐
│  FIG040601 — STY→SPI→PHP→PSC→BKI→STY     [Switch to Ops]  │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Flight Status: BOARDING                         ETD: 05:30  │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ Passenger          │ From │ To   │ Boarded │ Weight     │ │
│  ├─────────────────────────────────────────────────────────┤ │
│  │ ✅ H. Irving       │ SPI  │ BKI  │   ✓    │ 85 kg      │ │
│  │ ✅ O. Harrison     │ PHP  │ PSC  │   ✓    │ 80 kg      │ │
│  │ ⬜ D. McDonald     │ PHP  │ PSC  │   –    │ 81 kg      │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  [Check In Passenger]     [View Route Map]     [Print]       │
│                                                               │
│  Route: STY → SPI → PHP → PSC → BKI → STY                    │
│  Next stop: SPI (ETD 08:30, ETA SPI 09:00)                  │
│  Weather: ☁️ 12°C, Wind 15kt NW                              │
└──────────────────────────────────────────────────────────────┘
```

**Key features**:
- **Boarding toggle**: Tap passenger row → toggle boarded. Visual feedback with green checkmark.
- **Passenger details**: Tap name → expand to show full name, contact, special requirements, payment status
- **Route progress**: Live indication of which stop is current (highlighted)
- **Search/filter**: Quick search by passenger name
- **Offline-ready**: Cache passenger list for areas without connectivity (Falklands camps)

### 2.3 Flight Operations Mode

Route: `/ops/flight/:flightId/loadsheet`

Full technical loadsheet with all calculations. Dense information layout.

```
┌──────────────────────────────────────────────────────────────┐
│  < Back    FIG040601 Loadsheet    [Passenger View]  [Print]  │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─ Flight Details ────────────────────────────────────────┐ │
│  │ Aircraft: BN-2 Islander VP-FBN   Crew: Capt. D. Smith   │ │
│  │ Empty Weight: 4,200 kg           Date: 04 Jun 2026       │ │
│  │ Status: DRAFT ─────────────────────── [Finalize] [Save] │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─ Passenger Manifest ────────────────────────────────────┐ │
│  │ Seat │ Passenger      │ Wt  │ Bg │ STY│ SPI│ PHP│ PSC│…│ │
│  ├──────┼────────────────┼─────┼────┼────┼────┼────┼────┼─┤ │
│  │  1C  │ H. Irving      │ 85  │ –  │    │ ██→│───→│───→│…│ │
│  │  2L  │ D. McDonald    │ 81  │ –  │ ██→│───→│────│────│ │ │
│  │  2R  │ O. Harrison    │ 80  │ –  │ ██→│───→│────│────│ │ │
│  │  —   │ Baggage (Aft)  │ 15  │    │    │    │    │    │ │ │
│  └──────┴────────────────┴─────┴────┴────┴────┴────┴────┴─┘ │
│                                                               │
│  ┌─ Sector Calculations ───────────────────────────────────┐ │
│  │# │From→To    │Dist│Plan│ ETD  │ ETA  │ ATD  │ ATA  │FOB│ │
│  ├──┼───────────┼────┼────┼──────┼──────┼──────┼──────┼───┤ │
│  │1 │STY→SPI   │ 48 │25m │08:30 │08:55 │[    ]│[    ]│85 │ │
│  │2 │SPI→PHP   │100 │45m │09:05 │09:50 │[    ]│[    ]│60 │ │
│  │3 │PHP→PSC   │  3 │ 5m │10:00 │10:05 │[    ]│[    ]│55 │ │
│  │4 │PSC→BKI   │ 23 │15m │10:15 │10:30 │[    ]│[    ]│50 │ │
│  │5 │BKI→STY   │ 65 │30m │10:40 │11:10 │[    ]│[    ]│35 │ │
│  └──┴───────────┴────┴────┴──────┴──────┴──────┴──────┴───┘ │
│                                                               │
│  ┌─ Weight & Balance ──────────────────────────────────────┐ │
│  │                │ Takeoff │ Landing │ CG (mm) │ Status   │ │
│  │ Leg 1 (STY)   │ 4,692kg │ 4,607kg │  94.2   │ ✅ OK    │ │
│  │ Leg 2 (SPI)   │ 4,522kg │ 4,442kg │  93.8   │ ✅ OK    │ │
│  │ ...                                                        │ │
│  │ Limits: MTOW 2,994kg (aerodrome), CG 81.0–101.0"         │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌─ Fuel Summary ──────────────────────────────────────────┐ │
│  │ Starting Fuel (STY): 85 kg                               │ │
│  │ Total Burn: 50 kg  │  Remaining at STY: 35 kg            │ │
│  │ Reserve: 35 kg (≥ minimum 30 kg) ✅                      │ │
│  │ No intermediate refuel stops (only STY has fuel)         │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 2.4 Mode Switching

```
Pilot Dashboard
    │
    ├── "My Flights" card → Passenger-Facing Mode
    │   └── Route: /ops/flight/:id/passengers
    │   └── Shows: passenger list, boarding status, route progress
    │   └── For: showing passengers, boarding, quick checks
    │
    └── "Loadsheets" card → Flight Ops Mode
        └── Route: /ops/flight/:id/loadsheet
        └── Shows: full manifest, sectors, fuel, W&B, COG
        └── For: pre-flight prep, in-flight data entry, post-flight sign-off
```

Both modes share the same underlying `loadsheet` record in the database. The passenger view is a filtered/optimized subset.

---

## 3. End-to-End Document Lifecycle

### 3.1 State Machine

```
                    ┌──────────┐
                    │  DRAFT   │  ← Auto-generated when schedule is published
                    └────┬─────┘
                         │ Pilot reviews, adjusts seat assignments,
                         │ enters planned times
                         ▼
                    ┌──────────┐
                    │  REVIEW  │  ← Ready for pre-flight briefing
                    └────┬─────┘
                         │ Pilot confirms, marks as ready
                         ▼
                    ┌──────────┐
                    │  ACTIVE  │  ← Day of flight. ATD/ATA editable.
                    └────┬─────┘
                         │ All legs completed, ATD/ATA entered
                         ▼
                    ┌──────────┐
                    │FINALIZED │  ← Pilot signs off. Data becomes
                    └────┬─────┘    IMMUTABLE. No further edits.
                         │
                         ▼
                    ┌──────────┐
                    │ ARCHIVED │  ← 30 days after completion.
                    └──────────┘    Moved to archive storage.
```

### 3.2 Data Flow Per State

#### DRAFT → REVIEW
- System auto-generates loadsheet when schedule status becomes `published`
- `createLoadsheetFromFlight(flightId)`:
  1. Queries flight, flight_legs, booking_leg_passengers
  2. Runs COG seat assignment algorithm
  3. Computes distance per leg from cache
  4. Computes planned flight time per leg
  5. Computes fuel plan per leg
  6. Computes takeoff/landing weight per leg
  7. Creates `loadsheets`, `loadsheet_passengers`, `loadsheet_sectors` records
- Pilot can edit: seat assignments, planned ETD/ETA, add notes
- Pilot clicks "Ready for Review" → status → `review`

#### REVIEW → ACTIVE
- Pilot confirms all data is correct
- System validates:
  - COG within limits for all legs
  - Fuel sufficient for entire route
  - All passengers have seat assignments
  - No unassigned booking legs on this flight
- If validation passes, status → `active`
- ATD/ATA fields become editable (were read-only before)

#### ACTIVE → FINALIZED
- After last leg's ATA is entered, "Finalize" button appears
- Pilot enters any additional notes (delays, weather, maintenance issues)
- Pilot signs off (confirmation dialog)
- System runs final validation:
  - All legs have ATD and ATA
  - Actual flight times computed
  - Final fuel reconciliation
- Status → `finalized`
- **ALL records become read-only at the application level**

#### FINALIZED → ARCHIVED
- 30 days after `finalized_at`, background job moves to archive
- Archived records remain queryable but are stored in a separate schema

### 3.3 Trigger Points

| Event | Action |
|-------|--------|
| Schedule published | Auto-create DRAFT loadsheets for all flights |
| Pilot assigned to flight | Update loadsheet `pilot_id` |
| Passenger added/removed from flight | Recompute COG seat assignments, marks loadsheet as `draft` if previously `review` |
| Flight leg changed | Recompute distances, times, fuel for affected legs |
| Aircraft changed | Recompute W&B with new empty weight and limits |
| Passenger checked in | Update `loadsheet_passengers.boarded` |
| ATD entered | Compute actual vs planned variance |
| ATA entered for last leg | Enable "Finalize" button |

---

## 4. Data Integrity & Immutability

### 4.1 Application-Level Gating

All loadsheet mutations go through a single entry point:

```typescript
// app/utils/loadsheet/loadsheet-mutations.server.ts

export async function mutateLoadsheet(
  loadsheetId: number,
  mutation: LoadsheetMutation,
  userId: number
): Promise<MutationResult> {
  const loadsheet = await loadsheetRepository.findById(loadsheetId);
  if (!loadsheet) throw new Error("Loadsheet not found");

  // Immutability gate: no edits after finalized
  if (loadsheet.status === "finalized" || loadsheet.status === "archived") {
    throw new Error(`Loadsheet is ${loadsheet.status}. No further modifications allowed.`);
  }

  // Only active loadsheets can have ATD/ATA edits
  if (mutation.type === "atd" || mutation.type === "ata") {
    if (loadsheet.status !== "active") {
      throw new Error("ATD/ATA can only be entered when loadsheet is active.");
    }
  }

  // Execute mutation
  const result = await executeMutation(loadsheetId, mutation);

  // Record audit trail
  await createAuditEntry({
    entityType: "loadsheet",
    entityId: loadsheetId,
    action: mutation.type,
    oldValues: mutation.oldValues,
    newValues: mutation.newValues,
    actorId: userId,
  });

  return result;
}
```

### 4.2 Audit Trail

```sql
CREATE TABLE loadsheet_audit_log (
  id            SERIAL PRIMARY KEY,
  loadsheet_id  INTEGER NOT NULL,
  action        VARCHAR(50) NOT NULL,  -- 'created', 'updated', 'finalized', 'seat_changed', 'atd_entered', etc.
  field_name    VARCHAR(100),
  old_value     TEXT,
  new_value     TEXT,
  actor_id      INTEGER REFERENCES users(id),
  ip_address    INET,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_loadsheet ON loadsheet_audit_log(loadsheet_id, created_at);
```

### 4.3 Checksum Verification

When a loadsheet is finalized, compute a SHA-256 hash of all critical fields:

```typescript
function computeLoadsheetChecksum(loadsheetId: number): string {
  const data = [
    loadsheet.flight_id,
    loadsheet.pilot_id,
    ...passengers.map(p => `${p.seat_row}${p.seat_side}:${p.passenger_id}`),
    ...sectors.map(s => `${s.leg_sequence}:${s.ata}:${s.atd}:${s.fuel_burn_kg}`),
  ].join("|");
  return createHash("sha256").update(data).digest("hex");
}
```

Store checksum in `loadsheets` table. Any subsequent verification can detect tampering.

### 4.4 Retention Policy

- Active loadsheets: retained indefinitely in main schema
- Finalized loadsheets: retained 90 days in main schema, then moved to `archive.loadsheets` via partition
- Audit logs: retained 7 years (aviation regulatory requirement)
- Soft-delete: never hard-delete loadsheet data. Use `deleted_at` flag.

---

## 5. Database Schema

### 5.1 New Tables

```sql
CREATE TYPE loadsheet_status AS ENUM ('draft', 'review', 'active', 'finalized', 'archived');

CREATE TABLE loadsheets (
  id                SERIAL PRIMARY KEY,
  flight_id         INTEGER NOT NULL REFERENCES flights(id) ON DELETE RESTRICT UNIQUE,
  schedule_id       INTEGER REFERENCES schedules(id),
  pilot_id          INTEGER REFERENCES pilots(id),
  aircraft_id       INTEGER REFERENCES aircraft(id),
  status            loadsheet_status DEFAULT 'draft',
  empty_weight_kg   NUMERIC(6,1),
  pilot_weight_kg   NUMERIC(5,1) DEFAULT 80,
  cabin_baggage_kg  NUMERIC(5,1) DEFAULT 0,
  total_pax         INTEGER DEFAULT 0,
  checksum          VARCHAR(64),               -- SHA-256 of finalized data
  notes             TEXT,
  finalized_at      TIMESTAMPTZ,
  finalized_by      INTEGER REFERENCES users(id),
  archived_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE loadsheet_passengers (
  id                SERIAL PRIMARY KEY,
  loadsheet_id      INTEGER NOT NULL REFERENCES loadsheets(id) ON DELETE CASCADE,
  booking_passenger_id INTEGER NOT NULL REFERENCES booking_passengers(id),
  booking_leg_id    INTEGER NOT NULL REFERENCES booking_legs(id),
  seat_row          INTEGER CHECK (seat_row BETWEEN 1 AND 5),
  seat_side         VARCHAR(1) CHECK (seat_side IN ('L','R','C')),
  clothed_weight_kg NUMERIC(5,1),
  baggage_weight_kg NUMERIC(5,1) DEFAULT 0,
  freight_weight_kg NUMERIC(5,1) DEFAULT 0,
  boarding_pass     BOOLEAN DEFAULT FALSE,    -- has boarding pass been issued
  boarded           BOOLEAN DEFAULT FALSE,
  boarded_at        TIMESTAMPTZ,
  offloaded_at      TIMESTAMPTZ,
  UNIQUE(loadsheet_id, booking_passenger_id)
);

CREATE TABLE loadsheet_sectors (
  id                  SERIAL PRIMARY KEY,
  loadsheet_id        INTEGER NOT NULL REFERENCES loadsheets(id) ON DELETE CASCADE,
  flight_leg_id       INTEGER NOT NULL REFERENCES flight_legs(id),
  leg_sequence        INTEGER NOT NULL,
  origin_code         VARCHAR(4),
  destination_code    VARCHAR(4),
  distance_nm         NUMERIC(5,1),
  planned_time_min    INTEGER,               -- scheduled flight time in minutes
  etd                 TIME,                   -- estimated time of departure
  eta                 TIME,                   -- estimated time of arrival
  atd                 TIME,                   -- actual time of departure (pilot-entered)
  ata                 TIME,                   -- actual time of arrival (pilot-entered)
  actual_time_min     INTEGER,               -- computed from ATD→ATA delta
  fuel_on_board_kg    NUMERIC(5,1),
  fuel_burn_kg        NUMERIC(5,1),
  fuel_remaining_kg   NUMERIC(5,1),
  takeoff_weight_kg   NUMERIC(7,1),
  landing_weight_kg   NUMERIC(7,1),
  cog_position_mm     NUMERIC(6,1),
  cog_status          VARCHAR(10),            -- ok | warning | violation
  tow_status          VARCHAR(10),            -- ok | warning | violation
  notes               TEXT,
  UNIQUE(loadsheet_id, flight_leg_id)
);

CREATE TABLE loadsheet_audit_log (
  id              SERIAL PRIMARY KEY,
  loadsheet_id    INTEGER NOT NULL REFERENCES loadsheets(id) ON DELETE CASCADE,
  action          VARCHAR(50) NOT NULL,
  field_name      VARCHAR(100),
  old_value       TEXT,
  new_value       TEXT,
  actor_id        INTEGER REFERENCES users(id),
  ip_address      INET,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_loadsheets_flight ON loadsheets(flight_id);
CREATE INDEX idx_loadsheets_status ON loadsheets(status);
CREATE INDEX idx_loadsheets_pilot ON loadsheets(pilot_id);
CREATE INDEX idx_ls_passengers_boarding ON loadsheet_passengers(loadsheet_id, boarded);
CREATE INDEX idx_ls_sectors_leg ON loadsheet_sectors(loadsheet_id, leg_sequence);
CREATE INDEX idx_audit_loadsheet ON loadsheet_audit_log(loadsheet_id, created_at);
```

### 5.2 Prisma Schema Additions

Add to `prisma/schema.prisma` after existing models:

```prisma
model loadsheets {
  id                Int       @id @default(autoincrement())
  flight_id         Int       @unique
  schedule_id       Int?
  pilot_id          Int?
  aircraft_id       Int?
  status            String    @default("draft")
  empty_weight_kg   Decimal?  @db.Decimal(6,1)
  pilot_weight_kg   Decimal?  @db.Decimal(5,1) @default(80)
  cabin_baggage_kg  Decimal?  @db.Decimal(5,1) @default(0)
  total_pax         Int       @default(0)
  checksum          String?   @db.VarChar(64)
  notes             String?   @db.Text
  finalized_at      DateTime? @db.Timestamptz()
  finalized_by      Int?
  archived_at       DateTime? @db.Timestamptz()
  created_at        DateTime  @default(now()) @db.Timestamptz()
  updated_at        DateTime  @default(now()) @db.Timestamptz()

  flight           flights    @relation(fields: [flight_id], references: [id], onDelete: Restrict)
  schedule         schedules? @relation(fields: [schedule_id], references: [id])
  pilot            pilots?    @relation(fields: [pilot_id], references: [id])
  aircraft         aircraft?  @relation(fields: [aircraft_id], references: [id])
  passengers       loadsheet_passengers[]
  sectors          loadsheet_sectors[]
  audit_log        loadsheet_audit_log[]

  @@map("loadsheets")
}

model loadsheet_passengers {
  id                    Int       @id @default(autoincrement())
  loadsheet_id          Int
  booking_passenger_id  Int
  booking_leg_id        Int
  seat_row              Int?
  seat_side             String?   @db.VarChar(1)
  clothed_weight_kg     Decimal?  @db.Decimal(5,1)
  baggage_weight_kg     Decimal?  @db.Decimal(5,1) @default(0)
  freight_weight_kg     Decimal?  @db.Decimal(5,1) @default(0)
  boarding_pass         Boolean   @default(false)
  boarded               Boolean   @default(false)
  boarded_at            DateTime? @db.Timestamptz()
  offloaded_at          DateTime? @db.Timestamptz()

  loadsheet           loadsheets            @relation(fields: [loadsheet_id], references: [id], onDelete: Cascade)
  booking_passenger   booking_passengers    @relation(fields: [booking_passenger_id], references: [id])
  booking_leg         booking_legs          @relation(fields: [booking_leg_id], references: [id])

  @@unique([loadsheet_id, booking_passenger_id])
  @@map("loadsheet_passengers")
}

model loadsheet_sectors {
  id                  Int       @id @default(autoincrement())
  loadsheet_id        Int
  flight_leg_id       Int
  leg_sequence        Int
  origin_code         String?   @db.VarChar(4)
  destination_code    String?   @db.VarChar(4)
  distance_nm         Decimal?  @db.Decimal(5,1)
  planned_time_min    Int?
  etd                 DateTime? @db.Time()
  eta                 DateTime? @db.Time()
  atd                 DateTime? @db.Time()
  ata                 DateTime? @db.Time()
  actual_time_min     Int?
  fuel_on_board_kg    Decimal?  @db.Decimal(5,1)
  fuel_burn_kg        Decimal?  @db.Decimal(5,1)
  fuel_remaining_kg   Decimal?  @db.Decimal(5,1)
  takeoff_weight_kg   Decimal?  @db.Decimal(7,1)
  landing_weight_kg   Decimal?  @db.Decimal(7,1)
  cog_position_mm     Decimal?  @db.Decimal(6,1)
  cog_status          String?   @db.VarChar(10)
  tow_status          String?   @db.VarChar(10)
  notes               String?   @db.Text

  loadsheet   loadsheets   @relation(fields: [loadsheet_id], references: [id], onDelete: Cascade)
  flight_leg  flight_legs  @relation(fields: [flight_leg_id], references: [id])

  @@unique([loadsheet_id, flight_leg_id])
  @@map("loadsheet_sectors")
}

model loadsheet_audit_log {
  id              Int       @id @default(autoincrement())
  loadsheet_id    Int
  action          String    @db.VarChar(50)
  field_name      String?   @db.VarChar(100)
  old_value       String?   @db.Text
  new_value       String?   @db.Text
  actor_id        Int?
  ip_address      String?   @db.Inet
  created_at      DateTime  @default(now()) @db.Timestamptz()

  loadsheet loadsheets @relation(fields: [loadsheet_id], references: [id], onDelete: Cascade)
  actor     users?     @relation(fields: [actor_id], references: [id])

  @@index([loadsheet_id, created_at])
  @@map("loadsheet_audit_log")
}
```

---

## 6. Seating Configuration & COG Logic

### 6.1 BN-2 Islander Cabin Layout

```
                  FORWARD (Station 0")
                  ┌─────────────┐
                  │  COCKPIT     │
                  │  (Pilot)     │
                  └──────┬──────┘
                         │ Station 29.5"
                  ┌──────┴──────┐
                  │  Row 1 [1C] │  ← 1 seat, center
                  └──────┬──────┘
                         │ Station 61.0"
                  ┌──────┴──────┐
                  │ Row 2 [2L|2R]│  ← 2 seats
                  └──────┬──────┘
                         │ Station 92.5"
                  ┌──────┴──────┐
                  │ Row 3 [3L|3R]│  ← 2 seats
                  └──────┬──────┘
                         │ Station 124.0"
                  ┌──────┴──────┐
                  │ Row 4 [4L|4R]│  ← 2 seats
                  └──────┬──────┘
                         │ Station 155.5"
                  ┌──────┴──────┐
                  │ Row 5 [5L|5R]│  ← 2 seats
                  └──────┬──────┘
                         │ Station 186.0"
                  ┌──────┴──────┐
                  │  AFT HOLD    │  ← Baggage only
                  │  (no seats)  │
                  └──────────────┘
                         │ Station 216.5"
                  TAIL CONE
```

**Station Arms (inches from datum)**:
| Location | Station (in) | Station (mm) |
|----------|-------------|--------------|
| Pilot seat | 14.0" | 355.6 mm |
| Row 1 (1C) | 29.5" | 749.3 mm |
| Row 2 (2L, 2R) | 61.0" | 1549.4 mm |
| Row 3 (3L, 3R) | 92.5" | 2349.5 mm |
| Row 4 (4L, 4R) | 124.0" | 3149.6 mm |
| Row 5 (5L, 5R) | 155.5" | 3949.7 mm |
| Aft baggage hold | 186.0" | 4724.4 mm |
| Fuel (main tanks) | 45.0" | 1143.0 mm |

**CG Limits**: 81.0" – 101.0" aft of datum (2057.4 – 2565.4 mm)

### 6.2 COG Assignment Algorithm

```typescript
// app/utils/loadsheet/seat-assignment.ts

interface SeatAssignment {
  passengerId: number;
  bookingLegId: number;
  seatRow: number;
  seatSide: "L" | "R" | "C";
  clothedWeightKg: number;
  baggageWeightKg: number;
}

const SEAT_ARMS_MM: Record<string, number> = {
  "1C": 749.3,
  "2L": 1549.4,
  "2R": 1549.4,
  "3L": 2349.5,
  "3R": 2349.5,
  "4L": 3149.6,
  "4R": 3149.6,
  "5L": 3949.7,
  "5R": 3949.7,
};

const AFT_HOLD_ARM_MM = 4724.4;
const PILOT_ARM_MM = 355.6;
const FUEL_ARM_MM = 1143.0;
const CG_FWD_LIMIT_MM = 2057.4;
const CG_AFT_LIMIT_MM = 2565.4;

export function assignSeatsByCOG(
  passengers: PassengerInput[]
): SeatAssignment[] {
  // Sort by total weight DESC (heaviest first → forward seats)
  const sorted = [...passengers].sort(
    (a, b) => (b.clothedWeightKg + b.baggageWeightKg) -
              (a.clothedWeightKg + a.baggageWeightKg)
  );

  const assignments: SeatAssignment[] = [];
  const availableSeats = [
    { row: 1, side: "C" as const },
    { row: 2, side: "L" as const },
    { row: 2, side: "R" as const },
    { row: 3, side: "L" as const },
    { row: 3, side: "R" as const },
    { row: 4, side: "L" as const },
    { row: 4, side: "R" as const },
    { row: 5, side: "L" as const },
    { row: 5, side: "R" as const },
  ];

  for (let i = 0; i < Math.min(sorted.length, 9); i++) {
    const p = sorted[i];
    const seat = availableSeats[i];
    assignments.push({
      passengerId: p.id,
      bookingLegId: p.bookingLegId,
      seatRow: seat.row,
      seatSide: seat.side,
      clothedWeightKg: p.clothedWeightKg,
      baggageWeightKg: p.baggageWeightKg,
    });
  }

  return assignments;
}

export function computeCG(
  assignments: SeatAssignment[],
  baggageTotalKg: number,
  fuelKg: number,
  emptyWeightKg: number,
  pilotWeightKg: number
): { cogMm: number; status: "ok" | "warning" | "violation" } {
  let totalMoment = 0;
  let totalWeight = 0;

  // Aircraft empty weight
  totalMoment += emptyWeightKg * 2108.2; // empty CG at 83.0"
  totalWeight += emptyWeightKg;

  // Pilot
  totalMoment += pilotWeightKg * PILOT_ARM_MM;
  totalWeight += pilotWeightKg;

  // Passengers
  for (const a of assignments) {
    const key = `${a.seatRow}${a.seatSide}`;
    const arm = SEAT_ARMS_MM[key] ?? 0;
    totalMoment += (a.clothedWeightKg + a.baggageWeightKg) * arm;
    totalWeight += a.clothedWeightKg + a.baggageWeightKg;
  }

  // Baggage (aft hold)
  totalMoment += baggageTotalKg * AFT_HOLD_ARM_MM;
  totalWeight += baggageTotalKg;

  // Fuel
  totalMoment += fuelKg * FUEL_ARM_MM;
  totalWeight += fuelKg;

  const cogMm = totalWeight > 0 ? totalMoment / totalWeight : 0;

  const status =
    cogMm < CG_FWD_LIMIT_MM || cogMm > CG_AFT_LIMIT_MM
      ? "violation"
      : cogMm < CG_FWD_LIMIT_MM + 100 || cogMm > CG_AFT_LIMIT_MM - 100
        ? "warning"
        : "ok";

  return { cogMm, status };
}
```

---

## 7. Fuel Calculations

### 7.1 Starting Fuel Determination

Since only Stanley (STY) has fuel, the aircraft must carry enough fuel for the ENTIRE round trip before departure.

```
STARTING FUEL = Σ(fuelBurn_leg_i) + reserve

Where reserve ≥ minimumFuel from fuel.csv for the longest leg
```

The existing `fuel-planning.ts` handles per-leg calculations. The loadsheet integration:

```typescript
// app/utils/loadsheet/loadsheet-calculations.server.ts

export async function computeSectorFuel(
  legs: FlightLegRow[],
  distances: Map<string, number>
): Promise<SectorFuelResult[]> {
  const results: SectorFuelResult[] = [];
  let previousFuelRemaining = 0;

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const key = `${leg.origin_code}→${leg.destination_code}`;
    const distanceNm = distances.get(key) ?? 0;
    const flightTimeMin = computeFlightTime(distanceNm, 140, 0);
    const isStanleyDeparture = leg.origin_code === "STY" || i === 0;

    const fuelPlan = await computeFuelPlan(
      flightTimeMin,
      i + 1,
      previousFuelRemaining,
      isStanleyDeparture
    );

    results.push({
      legSequence: i + 1,
      originCode: leg.origin_code,
      destinationCode: leg.destination_code,
      distanceNm,
      plannedTimeMin: flightTimeMin,
      fuelOnBoardKg: fuelPlan.fuelOnBoardKg,
      fuelBurnKg: fuelPlan.fuelBurnKg,
      fuelRemainingKg: fuelPlan.fuelRemainingKg,
      fuelOk: fuelPlan.fuelOk,
      reserveOk: fuelPlan.reserveOk,
      needsStanleyRevisit: fuelPlan.needsStanleyRevisit,
    });

    previousFuelRemaining = fuelPlan.fuelRemainingKg;
  }

  return results;
}
```

### 7.2 Fuel Cascade Logic

```
Leg 1 (STY→SPI):  FOB = 85kg (from fuel.csv)  Burn = 25kg  Rem = 60kg
Leg 2 (SPI→PHP):  FOB = 60kg (carry forward)   Burn = 40kg  Rem = 20kg
Leg 3 (PHP→PSC):  FOB = 20kg                   Burn = 5kg   Rem = 15kg
Leg 4 (PSC→BKI):  FOB = 15kg                   Burn = 10kg  Rem = 5kg
Leg 5 (BKI→STY):  FOB = 5kg (LOW! revisits STY) Burn = 35kg Rem = -30 ⚠️

→ needsStanleyRevisit = true on Leg 5 → reload fuel at STY
→ Actually, BKI→STY returns to base, and with only 5kg remaining,
  fuel.csv's rule for Leg 5 would flag this.
→ Starting fuel should've been 85+35 = 120kg to cover all legs.
→ The starting fuel planning should consider the ENTIRE route, not just first leg.
```

**Correction — Total Route Fuel Planning**:

```typescript
// The starting fuel must cover all legs until the next STY visit.
// For a route STY→A→B→C→STY (no intermediate STY stops):
// startingFuel = totalBurnForAllLegs

export function computeStartingFuel(
  sectorResults: SectorFuelResult[]
): number {
  // Fuel needed from STY departure to next STY arrival (or end of route)
  let totalBurn = 0;
  for (const sector of sectorResults) {
    totalBurn += sector.fuelBurnKg;
    if (sector.destinationCode === "STY") break;
  }
  return totalBurn;
}
```

---

## 8. Weight & Balance Integration

The existing `weight-balance.ts` already computes per-leg weights and constraints. The loadsheet extends this with seat-specific arm data:

```typescript
export function computeLoadsheetWeightBalance(
  loadsheet: LoadsheetRow,
  passengers: LoadsheetPassengerRow[],
  sectors: LoadsheetSectorRow[],
  aircraft: AircraftRow
): WeightBalancePerLeg[] {
  const results: WeightBalancePerLeg[] = [];

  for (const sector of sectors) {
    // Determine which passengers are onboard for this leg
    const onboardPassengers = passengers.filter((p) => {
      const leg = sector.flight_leg;
      // Passenger is onboard if they board at or before this leg's origin
      // and alight at or after this leg's destination
      return passengerIsOnboardForLeg(p, leg);
    });

    // Compute total weights
    const paxWeight = onboardPassengers.reduce(
      (s, p) => s + Number(p.clothed_weight_kg), 0
    );
    const baggageWeight = onboardPassengers.reduce(
      (s, p) => s + Number(p.baggage_weight_kg), 0
    );

    const zeroFuelWeight = Number(aircraft.empty_weight_kg) +
      Number(loadsheet.pilot_weight_kg) + paxWeight + baggageWeight;
    const takeoffWeight = zeroFuelWeight + Number(sector.fuel_on_board_kg);
    const landingWeight = takeoffWeight - Number(sector.fuel_burn_kg);

    // COG
    const { cogMm, status: cogStatus } = computeCG(
      onboardPassengers.map(toSeatAssignment),
      baggageWeight,
      Number(sector.fuel_on_board_kg),
      Number(aircraft.empty_weight_kg),
      Number(loadsheet.pilot_weight_kg)
    );

    // MTOW check
    const mtowLimit = aircraft.max_takeoff_weight_kg ?? 2994;
    const towStatus = takeoffWeight > mtowLimit ? "violation"
      : takeoffWeight > mtowLimit * 0.95 ? "warning" : "ok";

    results.push({
      legSequence: sector.leg_sequence,
      zeroFuelWeightKg: zeroFuelWeight,
      takeoffWeightKg: takeoffWeight,
      landingWeightKg: landingWeight,
      mtowLimitKg: mtowLimit,
      towStatus,
      cogMm,
      cogStatus,
    });
  }

  return results;
}
```

---

## 9. Route & Component Architecture

### 9.1 Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/ops/flight/:flightId/loadsheet` | GET | Loadsheet view (ops mode) |
| `/ops/flight/:flightId/loadsheet` | POST | Save/update loadsheet data |
| `/ops/flight/:flightId/passengers` | GET | Passenger-facing view |
| `/ops/flight/:flightId/loadsheet/finalize` | POST | Finalize loadsheet |
| `/ops/loadsheets/:id/print` | GET | Print-optimized view |
| `/ops/loadsheets/:id/export` | GET | PDF export |
| `/ops/dashboard` | GET | Pilot dashboard |

### 9.2 Component Tree

```
LoadsheetPage (route)
├── LoadsheetHeader
│   ├── FlightInfo (flight number, aircraft, pilot, date)
│   ├── StatusBadge (draft/review/active/finalized)
│   └── ActionButtons (Save, Finalize, Print, Switch Mode)
│
├── LoadsheetManifest
│   ├── ManifestTable
│   │   ├── StopHeaders (column headers from flight path)
│   │   ├── PassengerRow[] (per passenger)
│   │   │   ├── SeatBadge (1C, 2L, etc.)
│   │   │   ├── PassengerName
│   │   │   ├── WeightInfo
│   │   │   ├── JourneyArrow[] (spanning from origin to dest columns)
│   │   │   └── BoardedToggle (ops mode only)
│   │   └── BaggageRow (aft hold indicator)
│   └── SeatLegend
│
├── LoadsheetSectors
│   ├── SectorTable
│   │   └── SectorRow[] (per leg)
│   │       ├── LegNumber
│   │       ├── RouteDisplay (origin → dest)
│   │       ├── DistanceCell
│   │       ├── PlannedTimeCell
│   │       ├── ETDInput
│   │       ├── ETAInput
│   │       ├── ATDInput (editable in active mode)
│   │       ├── ATAInput (editable in active mode)
│   │       └── FuelCells (FOB, Burn, Remaining)
│   └── StartingFuelSummary
│
├── LoadsheetWeightBalance
│   ├── WBandBTable
│   │   └── WBRow[] (per leg)
│   │       ├── LegLabel
│   │       ├── TOWCell (with status indicator)
│   │       ├── LWCell
│   │       └── CGCell (with limit bar)
│   └── LimitReference
│
├── LoadsheetFuelSummary
│   ├── StartingFuelCard
│   ├── TotalBurnCard
│   ├── ReserveCard
│   └── RefuelStopsList
│
└── LoadsheetNotes
    └── NotesTextarea (per sector and general)
```

### 9.3 Shared Hooks

```typescript
// app/hooks/useLoadsheet.ts
export function useLoadsheet(flightId: number) {
  const fetcher = useFetcher<LoadsheetData>();
  // Load, auto-save on change, compute derived values
  return { loadsheet, updateSeat, updateSector, finalize, isDirty };
}

// app/hooks/useDistanceLookup.ts
export function useDistanceLookup() {
  // Client-side distance cache for instant sector distance display
  const [distances] = useState(() => loadDistanceMap());
  return { getDistance: (from: string, to: string) => distances.get(`${from}→${to}`) ?? 0 };
}
```

---

## 10. Edge Cases & Critical Features

### 10.1 Edge Cases

| Scenario | Handling |
|----------|----------|
| **No passengers on flight** | Loadsheet still generated (repositioning/ferry flight). W&B computed with crew + empty + fuel only. |
| **Passenger added after loadsheet created** | Recompute COG assignments for affected flight. Revert to DRAFT if previously REVIEW. |
| **Flight with >9 passengers** | BN-2 Islander hard limit. Validation error at schedule level. |
| **Passenger no-shows** | Pilot toggles `boarded = false` with note. Weight recalculated. |
| **Extra passenger (walk-on)** | Pilot manually adds passenger entry (name, weight, destination). Linked to a "manual" booking. |
| **Last-minute aircraft change** | Recompute all W&B values with new empty weight, limits. COG recalculated. |
| **Leg cancelled (weather)** | Pilot enters note on sector. ATA left blank. Loadsheet can still be finalized with partial data. |
| **Divert to alternate** | Pilot enters actual destination code in sector notes. ATA recorded at alternate. |
| **No connectivity at remote strip** | Loadsheet cached in localStorage. Offline edits synced when back online. |
| **Pilot change mid-schedule** | Loadsheet `pilot_id` updated. Previous pilot's entries preserved. Audit trail records change. |

### 10.2 Critical Features

#### 10.2.1 Boarding Pass Integration
Generate a simple boarding pass from `loadsheet_passengers`:
- Passenger name, flight number, date, seat assignment
- QR code containing `booking_leg_id` + `passenger_id` for quick check-in

#### 10.2.2 Fuel Reconciliation
After finalization, compare:
- Planned fuel burn vs actual (from ATD→ATA actual time �— burn rate)
- Flag discrepancies >10%

#### 10.2.3 Cargo/Freight Handling
The `freight_weight_kg` field on `booking_leg_passengers` and `loadsheet_passengers` supports cargo flights:
- Freight is placed in aft hold (like baggage)
- Counts toward total weight but not passenger count
- Separate row on manifest for freight items

#### 10.2.4 Weight Tolerance Alert
If actual passenger weight differs from booked weight by >15%, flag for pilot review.

#### 10.2.5 Multi-Crew Extension Point
Though currently single-crew, the schema supports:
- `co_pilot_id` nullable FK on `loadsheets`
- Second crew weight in W&B calculations
- Dual sign-off on finalization

---

## 11. Development Roadmap

### Phase 0: Preparation (Day 0)
- [x] Backup current codebase
- [x] Create this technical plan document
- [ ] Review with stakeholders

### Phase 1: Schema & Data Layer (Days 1–2)
- [ ] Create migration `add-loadsheet-tables.sql`
- [ ] Add Prisma models to `schema.prisma`
- [ ] Run `npx prisma migrate dev` and `npx prisma generate`
- [ ] Create `app/utils/repositories/loadsheet.ts` (CRUD)
- [ ] Create `app/utils/loadsheet/seat-assignment.ts` (COG algorithm)
- [ ] Create `app/utils/loadsheet/loadsheet-calculations.server.ts` (fuel + W&B)
- [ ] Parse `data/distance.csv` into `distance-cache.ts` Map
- [ ] Write unit tests for seat assignment, COG, fuel calculations

### Phase 2: Loadsheet Generation (Days 3–4)
- [ ] Create `app/utils/loadsheet/create-loadsheet.ts` (auto-generate from flight data)
- [ ] Wire schedule publish → auto-create loadsheets trigger
- [ ] Create `app/routes/ops.flight.$flightId.loadsheet.tsx` (loader + action)
- [ ] Create `LoadsheetHeader` component
- [ ] Create `LoadsheetManifest` component with journey arrows
- [ ] Create `LoadsheetSectors` component with editable ATD/ATA
- [ ] Create `LoadsheetWeightBalance` component
- [ ] Create `LoadsheetFuelSummary` component

### Phase 3: Dual-Mode Interface (Days 5–6)
- [ ] Create pilot dashboard route `/ops/dashboard`
- [ ] Create passenger-facing route `/ops/flight/:flightId/passengers`
- [ ] Implement boarding toggle with optimistic updates
- [ ] Implement mode switch between passenger/ops views
- [ ] Add "View Loadsheet" button to `FlightCard` and `SortableDroppableFlightCard`
- [ ] Implement pilot assignment auto-population on loadsheet

### Phase 4: Finalization & Integrity (Day 7)
- [ ] Implement loadsheet status state machine
- [ ] Implement application-level immutability gate
- [ ] Create audit log triggers
- [ ] Implement checksum computation on finalize
- [ ] Add "Finalize" confirmation dialog
- [ ] Prevent modifications after finalized status

### Phase 5: Print & Export (Day 8)
- [ ] Create print-optimized CSS (`@media print`)
- [ ] Create `/ops/loadsheets/:id/print` route
- [ ] Implement PDF export with `@react-pdf/renderer`
- [ ] Test A4 layout with all sections fitting on one page
- [ ] Add QR code for digital verification

### Phase 6: Polish & Edge Cases (Days 9–10)
- [ ] Implement all edge cases from Section 10.1
- [ ] Add boarding pass generation
- [ ] Add fuel reconciliation alert
- [ ] Add offline caching for remote strip use
- [ ] End-to-end integration testing
- [ ] Performance optimization (memoization, lazy loading)

---

## 12. Testing Strategy

### 12.1 Unit Tests

```
app/utils/loadsheet/__tests__/
├── seat-assignment.test.ts       — COG algorithm, seat filling, edge weight cases
├── loadsheet-calculations.test.ts — Fuel per leg, starting fuel, CG bounds
├── create-loadsheet.test.ts      — Auto-generation from flight data
└── immutability.test.ts          — Status gates, audit log creation
```

### 12.2 Integration Tests

```
app/routes/__tests__/
├── loadsheet.test.ts             — Full lifecycle: create → edit → finalize → verify
├── passenger-view.test.ts        — Boarding toggle, mode switch
└── dashboard.test.ts             — Pilot dashboard data aggregation
```

### 12.3 E2E Scenarios

1. **Happy path**: Schedule publish → loadsheet auto-created → pilot reviews → marks active → enters ATD/ATA → finalizes → immutable
2. **Aircraft change**: Loadsheet in review → aircraft reassigned → W&B recalculated → status reverts to draft
3. **No-show passenger**: Passenger doesn't board → pilot toggles off → weight recalculated → finalize
4. **Walk-on passenger**: Pilot manually adds → COG reassigned → weight updated → finalize
5. **Tamper detection**: Attempt to edit finalized loadsheet → rejected → audit log records attempt

---

## 13. Print & Export

### 13.1 Print CSS

Applied to `/ops/loadsheets/:id/print` route:

```css
@media print {
  nav, .sidebar, .no-print { display: none !important; }
  body { font-size: 10pt; margin: 15mm; }
  .loadsheet-container { width: 100%; max-width: none; }
  .manifest-table, .sector-table { page-break-inside: avoid; }
  @page { size: A4 landscape; margin: 10mm; }
}
```

### 13.2 PDF Export

Use `@react-pdf/renderer` for server-side PDF generation:
- Render loadsheet as a PDF document
- Include FIGAS logo and header
- Watermark "COPY" if not original
- Digital signature block for pilot

---

## 14. Audit & Compliance

### 14.1 Regulatory Requirements (Falkland Islands CAA)

- Loadsheets retained for **2 years** minimum after flight
- Records must be **tamper-evident** (checksum)
- All modifications must have **audit trail** (who, when, what changed)
- Final loadsheet must be **signed** by pilot-in-command

### 14.2 Compliance Mapping

| Requirement | Implementation |
|-------------|---------------|
| Tamper-evident records | SHA-256 checksum on finalization, verified on read |
| Audit trail | `loadsheet_audit_log` table, every mutation logged |
| Pilot sign-off | `finalized_by` FK + timestamp |
| Record retention | Soft-delete only, archive after 2 years |
| Data export | PDF and CSV export for regulatory submission |

### 14.3 Data Retention Implementation

```typescript
// Scheduled job (runs daily at 02:00 UTC)
export async function archiveCompletedLoadsheets() {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 2); // 2 years ago

  const toArchive = await db.loadsheets.findMany({
    where: {
      finalized_at: { lt: cutoff },
      status: "finalized",
      archived_at: null,
    },
  });

  for (const ls of toArchive) {
    // Compute final checksum (if not already done)
    if (!ls.checksum) {
      const checksum = await computeLoadsheetChecksum(ls.id);
      await db.loadsheets.update({
        where: { id: ls.id },
        data: { checksum, archived_at: new Date(), status: "archived" },
      });
    } else {
      await db.loadsheets.update({
        where: { id: ls.id },
        data: { archived_at: new Date(), status: "archived" },
      });
    }
  }
}
```

---

## Appendix A: Distance CSV Parser

```typescript
// app/utils/loadsheet/distance-csv.ts

export function parseDistanceCSV(csvContent: string): Map<string, number> {
  const lines = csvContent.trim().split("\n");
  const headers = lines[0].split("\t").map(h => h.trim()).filter(Boolean);
  const map = new Map<string, number>();

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split("\t");
    const origin = cells[0].trim();
    if (!origin) continue;

    for (let j = 1; j < cells.length; j++) {
      const dest = headers[j - 1];
      const distance = parseInt(cells[j], 10);
      if (dest && !isNaN(distance) && distance > 0) {
        map.set(`${origin}→${dest}`, distance);
        map.set(`${dest}→${origin}`, distance); // bidirectional
      }
    }
  }

  return map;
}
```

## Appendix B: File Inventory

| File | Type | Purpose |
|------|------|---------|
| `prisma/schema.prisma` | Modified | Add 4 new models |
| `migrations/add-loadsheet-tables.sql` | New | Migration SQL |
| `app/utils/repositories/loadsheet.ts` | New | CRUD operations |
| `app/utils/loadsheet/seat-assignment.ts` | New | COG-based seat assignment |
| `app/utils/loadsheet/distance-csv.ts` | New | CSV parser |
| `app/utils/loadsheet/loadsheet-calculations.server.ts` | New | Fuel, COG, W&B calculations |
| `app/utils/loadsheet/create-loadsheet.ts` | New | Auto-generation from flight |
| `app/utils/loadsheet/immutability.ts` | New | Status gates and validation |
| `app/routes/ops.flight.$flightId.loadsheet.tsx` | New | Loadsheet ops route |
| `app/routes/ops.flight.$flightId.passengers.tsx` | New | Passenger-facing route |
| `app/routes/ops.dashboard.tsx` | New | Pilot dashboard |
| `app/components/loadsheet/LoadsheetHeader.tsx` | New | Header component |
| `app/components/loadsheet/LoadsheetManifest.tsx` | New | Manifest with journey arrows |
| `app/components/loadsheet/LoadsheetSectors.tsx` | New | Sector table with ATD/ATA |
| `app/components/loadsheet/LoadsheetWeightBalance.tsx` | New | W&B summary |
| `app/components/loadsheet/LoadsheetFuelSummary.tsx` | New | Fuel summary |
| `app/components/schedule/FlightCard.tsx` | Modified | Add "Loadsheet" link |
| `app/utils/scheduling/distance-cache.ts` | Modified | Load from CSV file |
| `app/utils/scheduling/weight-balance.ts` | Modified | Extend with seat arms |
