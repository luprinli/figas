# Database Audit — Phase 3: Duplicates, Redundancy & Hardcoded Data

**Date:** 2026-06-01  
**Scope:** FIGAS Remix II — full project audit  
**Auditor:** Roo (Architect mode)

---

## Table of Contents

1. [Duplicate SQL Files](#1-duplicate-sql-files)
2. [Redundant Database Files (`.server.ts` vs `.ts` Pairs)](#2-redundant-database-files)
3. [Hardcoded Data Sources](#3-hardcoded-data-sources)
4. [CSV/JSON Data Files](#4-csvjson-data-files)
5. [Script Files](#5-script-files)
6. [Migration Redundancy](#6-migration-redundancy)
7. [Consolidated Action Items](#7-consolidated-action-items)

---

## 1. Duplicate SQL Files

### 1.1 Standalone SQL Files

All standalone SQL resides in [`migrations/`](../migrations/). There are **19 migration files** numbered `001` through `019`. No SQL files exist outside the `migrations/` directory.

| File | Purpose | Lines |
|------|---------|-------|
| [`001_create_tables.sql`](../migrations/001_create_tables.sql) | Core schema: users, aerodromes, aircraft, organizations, pilots, fare_routes, flights, bookings, booking_legs, passengers, seat_assignments, checkin_reminders, notifications, flight_manifests, system_settings, payments | 333 |
| [`002_add_missing_columns.sql`](../migrations/002_add_missing_columns.sql) | Add columns to all core tables + indexes | 174 |
| [`003_create_reference_tables.sql`](../migrations/003_create_reference_tables.sql) | fuel_rules, aerodrome_distances, aerodrome_headings, airframe_hours | 85 |
| [`004_add_timestamps_to_reference_tables.sql`](../migrations/004_add_timestamps_to_reference_tables.sql) | Add created_at/updated_at to reference tables | 27 |
| [`005_add_booking_source_and_cancellation.sql`](../migrations/005_add_booking_source_and_cancellation.sql) | booking_source, cancellation tracking, special_requirements | 38 |
| [`006_create_payment_methods.sql`](../migrations/006_create_payment_methods.sql) | payment_methods table + seed data + `set_updated_at()` trigger | 50 |
| [`007_create_invoices.sql`](../migrations/007_create_invoices.sql) | invoices + invoice_items tables | 79 |
| [`008_create_accounting_journal.sql`](../migrations/008_create_accounting_journal.sql) | chart_of_accounts + seed + accounting_journal_entries + accounting_journal_lines | 130 |
| [`009_create_payment_reminders.sql`](../migrations/009_create_payment_reminders.sql) | payment_reminders table | 40 |
| [`010_create_stripe_payments.sql`](../migrations/010_create_stripe_payments.sql) | stripe_payments table | 64 |
| [`011_create_bank_transactions.sql`](../migrations/011_create_bank_transactions.sql) | bank_transactions table | 60 |
| [`012_create_export_log.sql`](../migrations/012_create_export_log.sql) | export_log table | 40 |
| [`013_enhance_existing_tables.sql`](../migrations/013_enhance_existing_tables.sql) | Add payment/accounting columns to bookings, payments, organizations | 76 |
| [`014_create_scheduling_tables.sql`](../migrations/014_create_scheduling_tables.sql) | schedules, flight_legs, pilot_assignments, booking_leg_passengers | 111 |
| [`015_create_rbac_tables.sql`](../migrations/015_create_rbac_tables.sql) | roles, permissions, role_permissions, user_roles, audit_log + seed data | 227 |
| [`016_create_booking_leg_passengers.sql`](../migrations/016_create_booking_leg_passengers.sql) | Rename passengers→booking_passengers, create booking_leg_passengers, data migration | 89 |
| [`017_create_no_fly_dates.sql`](../migrations/017_create_no_fly_dates.sql) | no_fly_rules table + `update_nfr_updated_at()` trigger | 89 |
| [`018_alter_no_fly_rules_day_of_week_array.sql`](../migrations/018_alter_no_fly_rules_day_of_week_array.sql) | Change day_of_week INTEGER→INTEGER[] | 41 |
| [`019_add_schedule_audit_and_weight_balance.sql`](../migrations/019_add_schedule_audit_and_weight_balance.sql) | Schedule audit columns, weight_balance_snapshots, pilot_assignments enhancements, aerodrome scheduling columns | 79 |

**Verdict:** No duplicate standalone SQL files. All 19 migrations are distinct.

### 1.2 Inline DDL in TypeScript Files

One instance of inline DDL found:

| File | Line | DDL | Table Created |
|------|------|-----|---------------|
| [`app/utils/repositories/admin.ts`](../app/utils/repositories/admin.ts) | 534–543 | `CREATE TABLE IF NOT EXISTS system_settings (...)` | `system_settings` |

**Issue:** The `system_settings` table is already created in [`migrations/001_create_tables.sql`](../migrations/001_create_tables.sql) (lines 307–314). The inline DDL in `admin.ts` is a **duplicate** — it uses `IF NOT EXISTS` so it won't error, but it represents a code-level dependency on a table that should be managed solely by migrations.

**Severity:** Medium — the `IF NOT EXISTS` guard prevents runtime errors, but it creates a hidden coupling. If the migration schema changes, the inline DDL could become stale.

---

## 2. Redundant Database Files (`.server.ts` vs `.ts` Pairs)

### 2.1 Inventory of Dual-File Pairs

| `.server.ts` File | `.ts` File | Analysis |
|-------------------|-----------|----------|
| [`booking-leg.server.ts`](../app/utils/repositories/booking-leg.server.ts) | [`booking-leg.ts`](../app/utils/repositories/booking-leg.ts) | **Proper separation.** `.server.ts` has advanced queries (findUnassignedByDate, findByFlightId, countUnassignedByDate, countUnassignedByDates). `.ts` has basic CRUD + types. No overlap. |
| [`flight.server.ts`](../app/utils/repositories/flight.server.ts) | [`flight.ts`](../app/utils/repositories/flight.ts) | **Partial overlap.** `.server.ts` has create/update/delete/findByScheduleId. `.ts` has findById/findByFlightNumber/assignPilot/approveByPilot/updateStatus/updateWeights/deleteFlight. **Both have delete logic** — `flight.server.ts` deletes via `booking_leg_passengers → booking_legs → flight_legs → pilot_assignments → flights`, while `flight.ts` deletes via `flight_legs → flights`. The `.server.ts` version is more thorough. |
| [`schedule.server.ts`](../app/utils/repositories/schedule.server.ts) | [`schedule.ts`](../app/utils/repositories/schedule.ts) | **Proper separation.** `.server.ts` has aggregate queries (findWithStats, findRangeWithStats, findUpcomingWithStats, findOrCreate). `.ts` has basic CRUD (findById, findByDate, findByDateRange, findByStatus, create, updateStatus, updateNotes, findUpcoming). No overlap. |
| [`fare-calculator.server.ts`](../app/utils/services/fare-calculator.server.ts) | [`fare-calculator.ts`](../app/utils/services/fare-calculator.ts) | **Proper separation.** `.server.ts` has actual fare calculation logic. `.ts` is intentionally client-safe — exports only types and interfaces (FareLineItem, FareCalculationResult). |

### 2.2 Redundancy Findings

**Flight delete logic duplication:**
- [`flight.server.ts`](../app/utils/repositories/flight.server.ts) lines 126–143: Deletes `booking_leg_passengers` → unassigns `booking_legs` → deletes `flight_legs` → deletes `pilot_assignments` → deletes `flights`
- [`flight.ts`](../app/utils/repositories/flight.ts) lines 135–148: Deletes `flight_legs` → deletes `flights` (in a transaction)

The `.server.ts` version is more comprehensive (handles `booking_leg_passengers`, `booking_legs`, and `pilot_assignments`). The `.ts` version is a subset and could leave orphaned records.

**Verdict:** No true redundancy — the `.server.ts`/`.ts` convention is used correctly. However, the dual delete functions in `flight.ts` and `flight.server.ts` should be consolidated.

---

## 3. Hardcoded Data Sources

### 3.1 Hardcoded Matrices

#### [`fuel-data.ts`](../app/utils/scheduling/fuel-data.ts) — FUEL_MATRIX (30×30)

- **Lines:** 1–60
- **Content:** Hardcoded 30×30 aerodrome fuel consumption lookup table (kg)
- **Comment:** "Hardcoded fuel lookup table derived from data/fuel.csv"
- **Issue:** `data/fuel.csv` is **empty** (headers only). The matrix is hardcoded with no DB backing.
- **Severity:** High — fuel data cannot be updated without code changes.

#### [`suggest-route.ts`](../app/utils/scheduling/suggest-route.ts) — DISTANCE_MATRIX (30×30) + AIRCRAFT_DATA (5 aircraft)

- **Lines:** 1–308
- **Content:**
  - `DISTANCE_MATRIX`: 30×30 hardcoded distance lookup (nautical miles)
  - `AIRCRAFT_DATA`: 5 aircraft with full specs (registration, type, weights, fuel capacity, seats)
- **Issue:** The DB has `aerodrome_distances` table (created in migration 003) and `aircraft` table (created in migration 001), but this file duplicates that data in code.
- **Severity:** High — dual sources of truth for distances and aircraft specs.

### 3.2 Hardcoded Constants Duplicated Across Files

| Constant | File | Line | Value |
|----------|------|------|-------|
| `DEFAULT_FARE_PER_PASSENGER` | [`fare-calculator.server.ts`](../app/utils/services/fare-calculator.server.ts) | 9 | `50` |
| `DEFAULT_FARE_PER_PASSENGER` | [`payment.service.ts`](../app/utils/services/payment.service.ts) | 42 | `50` |
| `FREIGHT_RATE_PER_KG` | [`fare-calculator.server.ts`](../app/utils/services/fare-calculator.server.ts) | 10 | `2` |
| Freight rate £2/kg | [`payment.service.ts`](../app/utils/services/payment.service.ts) | 64 | `2` |

**Issue:** The same constants are defined in two places. If one is updated and the other is not, fare calculations and payment calculations will diverge.

**Severity:** High — these should be centralized in [`constants.ts`](../app/utils/constants.ts) or read from the `system_settings` DB table.

### 3.3 Hardcoded Account Codes

| File | Line | Codes |
|------|------|-------|
| [`payment.service.ts`](../app/utils/services/payment.service.ts) | 90–92 | `"1020"` (Accounts Receivable), `"4010"` (Passenger Fare Revenue), `"1010"` (Cash at Bank) |

**Issue:** These account codes are hardcoded strings. The `chart_of_accounts` table (migration 008) has these same codes as seed data. If the chart of accounts changes, the hardcoded codes will be out of sync.

**Severity:** Medium — should reference the DB or a constants file.

### 3.4 Hardcoded Pilot Defaults

| File | Line | Defaults |
|------|------|----------|
| [`assign-pilots.ts`](../app/utils/scheduling/assign-pilots.ts) | 40–46 | `currentDutyHours: 0`, `maxDutyHoursPerDay: 12`, `currentFlightHours: 0`, `maxFlightHoursPerDay: 8`, `medicalValid: true` |

**Issue:** Comment says "In a full implementation, this would query pilot_scheduling table." These are placeholder defaults that could produce incorrect pilot assignments.

**Severity:** Medium — placeholder data that could cause incorrect scheduling decisions.

### 3.5 Stanley Airport Code Bug

| File | Line | Wrong Code | Should Be |
|------|------|-----------|-----------|
| [`nearest-neighbor.ts`](../app/utils/scheduling/nearest-neighbor.ts) | 82 | `"STY"` | `"PSY"` |
| [`suggest-route.ts`](../app/utils/scheduling/suggest-route.ts) | 194 | `"STY"` | `"PSY"` |
| [`data/aerodromes.csv`](../data/aerodromes.csv) | 30 | `STY` | `PSY` |

**Issue:** The IATA code for Stanley Airport (Port Stanley) is `PSY`, but two scheduling files and the CSV data file use `STY`. This will cause lookup failures in the DB-backed `nearest-neighbor.ts` since the `aerodromes` table likely uses `PSY`.

**Severity:** High — this is a functional bug that would cause nearest-neighbor routing to fail for Stanley.

---

## 4. CSV/JSON Data Files

### 4.1 Inventory

| File | Size | Content | Status |
|------|------|---------|--------|
| [`data/aerodromes.csv`](../data/aerodromes.csv) | 31 lines | 31 aerodromes with codes, coordinates, runway data | **Populated** — duplicates `aerodromes` DB table |
| [`data/aircraft.csv`](../data/aircraft.csv) | 6 lines | 5 aircraft (VP-FBD, VP-FMC, VP-FBN, VP-FBO, VP-FBR) | **Populated** — duplicates `aircraft` DB table |
| [`data/airframe_hours.csv`](../data/airframe_hours.csv) | 6 lines | 5 aircraft with maintenance data | **Populated** — duplicates `airframe_hours` DB table |
| [`data/distance.csv`](../data/distance.csv) | 1 line | Headers only | **Empty** — was supposed to seed `aerodrome_distances` |
| [`data/fuel.csv`](../data/fuel.csv) | 1 line | Headers only | **Empty** — was supposed to seed fuel data |
| [`data/pilots.csv`](../data/pilots.csv) | 1 line | Headers only | **Empty** — was supposed to seed `pilots` table |
| [`data/heading.csv`](../data/heading.csv) | 1 line | Headers only | **Empty** — was supposed to seed `aerodrome_headings` |
| [`data/FlightList.csv`](../data/FlightList.csv) | 1 line | Headers only | **Empty** |
| [`data/MATRIX FARES.txt`](../data/MATRIX%20FARES.txt) | Raw text | Unstructured fare matrix data | **Populated** — hard to parse, raw format |
| [`data/processed/fare-matrix-structured.json`](../data/processed/fare-matrix-structured.json) | 56,219 lines | 961 routes with structured fare data | **Populated** — derived from MATRIX FARES.txt |
| [`data/processed/fare-schema.json`](../data/processed/fare-schema.json) | 386 lines | JSON Schema for fare pricing model | **Populated** — schema definition |
| [`data/processed/fare-summary.csv`](../data/processed/fare-summary.csv) | 962 lines | 961 fare routes in CSV format | **Populated** — duplicates `fare_routes` DB table |
| [`data/processed/validation-report.json`](../data/processed/validation-report.json) | 37 lines | Validation: VALID, 2 warnings, 63 missing routes | **Populated** — audit artifact |

### 4.2 Key Findings

**5 empty CSV files** that were clearly intended to seed database tables:
- [`data/distance.csv`](../data/distance.csv) — for `aerodrome_distances` table
- [`data/fuel.csv`](../data/fuel.csv) — for fuel matrix data
- [`data/pilots.csv`](../data/pilots.csv) — for `pilots` table
- [`data/heading.csv`](../data/heading.csv) — for `aerodrome_headings` table
- [`data/FlightList.csv`](../data/FlightList.csv) — unknown purpose

**3 populated CSV files** that duplicate database tables:
- [`data/aerodromes.csv`](../data/aerodromes.csv) duplicates `aerodromes` table
- [`data/aircraft.csv`](../data/aircraft.csv) duplicates `aircraft` table
- [`data/airframe_hours.csv`](../data/airframe_hours.csv) duplicates `airframe_hours` table

**Fare data fragmentation:**
- Raw source: [`data/MATRIX FARES.txt`](../data/MATRIX%20FARES.txt) (unstructured)
- Structured JSON: [`data/processed/fare-matrix-structured.json`](../data/processed/fare-matrix-structured.json) (56K lines)
- CSV summary: [`data/processed/fare-summary.csv`](../data/processed/fare-summary.csv) (962 lines)
- DB table: `fare_routes` (created in migration 001)
- Hardcoded fallback: `DEFAULT_FARE_PER_PASSENGER = 50` in two service files

**Severity:** High — the `data/` directory contains stale, empty, and redundant files that create confusion about the true source of truth.

---

## 5. Script Files

### 5.1 Inventory

| File | Purpose | Hardcoded Data |
|------|---------|----------------|
| [`scripts/lib/reference-data.ts`](../scripts/lib/reference-data.ts) | Fetches reference data from DB | None — DB-backed |
| [`scripts/lib/types.ts`](../scripts/lib/types.ts) | Type definitions | None — types only |
| [`scripts/lib/booking-writer.ts`](../scripts/lib/booking-writer.ts) | Writes bookings to DB | Weighted random selection for booking source, payment status, status |
| [`scripts/lib/itinerary-builder.ts`](../scripts/lib/itinerary-builder.ts) | Builds itineraries | **Biased toward STY 60%** — uses wrong code "STY" instead of "PSY" |
| [`scripts/lib/passenger-generator.ts`](../scripts/lib/passenger-generator.ts) | Generates passenger profiles | **35 male names, 35 female names, 40 last names** — hardcoded name pools |
| [`scripts/lib/date-utils.ts`](../scripts/lib/date-utils.ts) | Date utilities | No-fly date checking logic (duplicates logic in `no-fly.service.ts`) |

### 5.2 Key Findings

**Acceptable hardcoding:** The name pools in [`passenger-generator.ts`](../scripts/lib/passenger-generator.ts) are acceptable for a seed script — they generate random test data.

**Bug:** [`itinerary-builder.ts`](../scripts/lib/itinerary-builder.ts) uses `"STY"` instead of `"PSY"` for Stanley, consistent with the bug found in scheduling files.

**Logic duplication:** [`date-utils.ts`](../scripts/lib/date-utils.ts) contains no-fly date checking logic that duplicates the business logic in [`no-fly.service.ts`](../app/utils/services/no-fly.service.ts). While acceptable for a seed script, changes to the no-fly logic would need to be mirrored.

---

## 6. Migration Redundancy

### 6.1 Tables Created in Multiple Migrations

| Table | First Created | Also Referenced In |
|-------|---------------|-------------------|
| `system_settings` | 001 (lines 307–314) | **Inline DDL** in `admin.ts` (lines 534–543) |
| `booking_leg_passengers` | 014 (lines 77–90) | 016 (lines 17–37) — **recreated with different schema** |
| `weight_balance_snapshots` | 019 (lines 24–52) | — (only created once) |

**Critical finding — `booking_leg_passengers` created twice:**
- [`014_create_scheduling_tables.sql`](../migrations/014_create_scheduling_tables.sql) lines 77–90: Creates `booking_leg_passengers` with columns: `booking_leg_id`, `passenger_id`, `flight_leg_id`, `checked_in`, `boarded`, `seat`, `bags`, `weight_kg`, `tag_number`
- [`016_create_booking_leg_passengers.sql`](../migrations/016_create_booking_leg_passengers.sql) lines 17–37: Creates `booking_leg_passengers` with columns: `booking_leg_id`, `booking_passenger_id`, `clothed_weight_kg`, `baggage_weight_kg`, `baggage_description`, `freight_description`, `freight_weight_kg`, `seat_number`, `checked_in`, `checked_in_at`, `checked_in_by`, `boarded`, `boarded_at`

These are **two different schemas for the same table name**. Migration 016 uses `CREATE TABLE IF NOT EXISTS`, so if 014 ran first, 016's schema would be ignored. But if 016 runs first (or on a fresh DB), the table would have 016's schema, and code expecting 014's columns would break.

**Severity:** Critical — this is a schema conflict that could cause runtime errors depending on migration order.

### 6.2 Duplicate Trigger Functions

| Function | Created In | Also Created In |
|----------|-----------|-----------------|
| `set_updated_at()` | 006 (lines 37–43) | — (only created once, reused by migrations 007, 008, 010, 011, 017) |
| `update_nfr_updated_at()` | 017 (lines 76–82) | — (dedicated function for no_fly_rules) |

**Note:** `set_updated_at()` is a generic trigger function reused across many tables. `update_nfr_updated_at()` is a duplicate of the same logic but with a different name for `no_fly_rules`. These could be consolidated.

### 6.3 Seed Data Mixed with Schema Changes

| Migration | Lines | Seed Data |
|-----------|-------|-----------|
| 006 | 25–32 | 5 payment methods |
| 008 | 24–54 | 20 chart of accounts |
| 015 | 74–224 | 7 roles, 55 permissions, role-permission assignments |

**Issue:** Seed data is embedded in migration files rather than in a separate seed script. This makes it harder to re-seed after a fresh migration and couples business data to schema versioning.

### 6.4 Migrations That Could Be Consolidated

| Group | Migrations | Rationale |
|-------|-----------|-----------|
| Core tables | 001 + 002 | 002 adds columns that should have been in 001 |
| Reference tables | 003 + 004 | 004 adds timestamps that should have been in 003 |
| No-fly rules | 017 + 018 | 018 alters the schema created in 017 (day_of_week type change) |
| Scheduling | 014 + 019 | 019 adds columns to tables created in 014 |

### 6.5 Redundant `ALTER TABLE IF EXISTS` Patterns

Migration 002 adds columns that already exist in migration 001's `CREATE TABLE` statements. For example:

- `users.is_active` — created in 001 line 22, re-added in 002 line 9
- `aerodromes.city` — created in 001 line 44, re-added in 002 line 22
- `aircraft.manufacturer` — created in 001 line 62, re-added in 002 line 29
- `aircraft.model` — created in 001 line 63, re-added in 002 line 30
- `flights.origin_code` — created in 001 line 132, re-added in 002 line 60
- `flights.destination_code` — created in 001 line 133, re-added in 002 line 61
- `flights.available_seats` — created in 001 line 141, re-added in 002 line 62
- `flights.base_fare` — created in 001 line 142, re-added in 002 line 63
- `bookings.total_amount` — created in 001 line 168, re-added in 002 line 76
- `booking_legs.departure_date` — created in 001 line 188, re-added in 002 line 83
- `passengers.nationality` — created in 001 line 213, re-added in 002 line 90
- `passengers.id_document_type` — created in 001 line 214, re-added in 002 line 91
- `passengers.id_document_number` — created in 001 line 215, re-added in 002 line 92
- `seat_assignments.row_number` — created in 001 line 237, re-added in 002 line 103
- `seat_assignments.column_letter` — created in 001 line 238, re-added in 002 line 104
- `seat_assignments.is_available` — created in 001 line 239, re-added in 002 line 105
- `flight_manifests.total_passengers` — created in 001 line 284, re-added in 002 line 129
- `flight_manifests.total_weight` — created in 001 line 290, re-added in 002 line 130
- `flight_manifests.total_freight_weight` — created in 001 line 291, re-added in 002 line 131
- `flight_manifests.total_baggage_weight` — created in 001 line 292, re-added in 002 line 132
- `flight_manifests.total_fuel_weight` — created in 001 line 293, re-added in 002 line 133
- `flight_manifests.pilot_signoff` — created in 001 line 296, re-added in 002 line 134
- `flight_manifests.signed_off_at` — created in 001 line 297, re-added in 002 line 135
- `payments.method` — created in 001 line 324, re-added in 002 line 141

**Severity:** Low (harmless due to `IF NOT EXISTS`) but indicates poor migration planning — columns were defined in the initial schema but migration 002 tries to add them again.

### 6.6 `booking_legs.departure_date` — Created in 001, Re-Added in 002, Re-Added Again in 005

- [`001_create_tables.sql`](../migrations/001_create_tables.sql) line 188: `departure_date DATE` in `booking_legs`
- [`002_add_missing_columns.sql`](../migrations/002_add_missing_columns.sql) line 83: `ALTER TABLE booking_legs ADD COLUMN IF NOT EXISTS departure_date DATE`
- [`005_add_booking_source_and_cancellation.sql`](../migrations/005_add_booking_source_and_cancellation.sql) line 32: `ALTER TABLE booking_legs ADD COLUMN IF NOT EXISTS departure_date DATE`

**Triple redundancy** for the same column.

---

## 7. Consolidated Action Items

### Critical (Must Fix)

| # | Issue | Location | Recommendation |
|---|-------|----------|----------------|
| C1 | `booking_leg_passengers` schema conflict | Migrations 014 vs 016 | Consolidate into a single migration with the correct schema. Remove the duplicate `CREATE TABLE IF NOT EXISTS`. |
| C2 | Stanley code bug (`STY` → `PSY`) | [`nearest-neighbor.ts:82`](../app/utils/scheduling/nearest-neighbor.ts#L82), [`suggest-route.ts:194`](../app/utils/scheduling/suggest-route.ts#L194), [`itinerary-builder.ts`](../scripts/lib/itinerary-builder.ts), [`data/aerodromes.csv`](../data/aerodromes.csv) | Replace all `"STY"` with `"PSY"` to match the DB aerodrome codes. |

### High Priority

| # | Issue | Location | Recommendation |
|---|-------|----------|----------------|
| H1 | Duplicate fare constants | [`fare-calculator.server.ts:9-10`](../app/utils/services/fare-calculator.server.ts#L9), [`payment.service.ts:42,64`](../app/utils/services/payment.service.ts#L42) | Centralize `DEFAULT_FARE_PER_PASSENGER` and `FREIGHT_RATE_PER_KG` in [`constants.ts`](../app/utils/constants.ts) or read from `system_settings` DB table. |
| H2 | Hardcoded distance matrix | [`suggest-route.ts`](../app/utils/scheduling/suggest-route.ts) | Replace with DB queries to `aerodrome_distances` table (migration 003). |
| H3 | Hardcoded aircraft data | [`suggest-route.ts`](../app/utils/scheduling/suggest-route.ts) | Replace with DB queries to `aircraft` table. |
| H4 | Hardcoded fuel matrix | [`fuel-data.ts`](../app/utils/scheduling/fuel-data.ts) | Replace with DB queries to a fuel rules table (or populate `data/fuel.csv` and create a seed script). |
| H5 | Empty CSV files | [`data/distance.csv`](../data/distance.csv), [`data/fuel.csv`](../data/fuel.csv), [`data/pilots.csv`](../data/pilots.csv), [`data/heading.csv`](../data/heading.csv), [`data/FlightList.csv`](../data/FlightList.csv) | Either populate with data or remove if no longer needed. |
| H6 | Inline DDL for `system_settings` | [`admin.ts:534-543`](../app/utils/repositories/admin.ts#L534) | Remove inline DDL — table is already created in migration 001. |
| H7 | Dual flight delete functions | [`flight.server.ts:126-143`](../app/utils/repositories/flight.server.ts#L126), [`flight.ts:135-148`](../app/utils/repositories/flight.ts#L135) | Consolidate into a single delete function (the `.server.ts` version is more comprehensive). |

### Medium Priority

| # | Issue | Location | Recommendation |
|---|-------|----------|----------------|
| M1 | Hardcoded account codes | [`payment.service.ts:90-92`](../app/utils/services/payment.service.ts#L90) | Look up account codes from `chart_of_accounts` table or centralize in constants. |
| M2 | Placeholder pilot defaults | [`assign-pilots.ts:40-46`](../app/utils/scheduling/assign-pilots.ts#L40) | Implement actual pilot_scheduling table query or remove placeholder defaults. |
| M3 | Duplicate trigger functions | Migrations 006 vs 017 | Consolidate `set_updated_at()` and `update_nfr_updated_at()` into a single generic trigger. |
| M4 | Seed data in migrations | Migrations 006, 008, 015 | Move seed data to a separate seed script (e.g., `prisma/seed-pbac.ts` pattern). |
| M5 | Redundant `ALTER TABLE` in 002 | [`migrations/002_add_missing_columns.sql`](../migrations/002_add_missing_columns.sql) | Clean up — remove `ALTER TABLE ADD COLUMN IF NOT EXISTS` for columns already defined in 001. |
| M6 | Triple `departure_date` addition | Migrations 001, 002, 005 | Remove redundant ALTER statements from 002 and 005. |

### Low Priority / Informational

| # | Issue | Location | Recommendation |
|---|-------|----------|----------------|
| L1 | Populated CSV files duplicate DB tables | [`data/aerodromes.csv`](../data/aerodromes.csv), [`data/aircraft.csv`](../data/aircraft.csv), [`data/airframe_hours.csv`](../data/airframe_hours.csv) | Document as seed data sources or remove if DB is the source of truth. |
| L2 | Fare data fragmentation | `data/MATRIX FARES.txt` → `data/processed/` → DB `fare_routes` → hardcoded fallback | Consolidate fare data pipeline: single source → DB → application. |
| L3 | No-fly logic duplication | [`date-utils.ts`](../scripts/lib/date-utils.ts) vs [`no-fly.service.ts`](../app/utils/services/no-fly.service.ts) | Acceptable for seed scripts, but document the dependency. |
| L4 | Migration consolidation opportunities | 001+002, 003+004, 017+018, 014+019 | Consider squashing related migrations in a future cleanup. |

---

## Summary

The audit identified **1 critical schema conflict**, **7 high-priority issues**, **6 medium-priority issues**, and **4 low-priority items**. The most urgent findings are:

1. **`booking_leg_passengers`** is created with two different schemas in migrations 014 and 016 — this is a runtime bug waiting to happen.
2. **Stanley Airport code `STY` vs `PSY`** is inconsistent across 3 source files and 1 data file, causing lookup failures.
3. **Hardcoded matrices** (distance, fuel, aircraft) in scheduling code create dual sources of truth that diverge from the database.
4. **Duplicate fare constants** in two service files will cause silent calculation discrepancies if only one is updated.
5. **5 empty CSV files** and **3 stale CSV files** in `data/` create confusion about the authoritative data source.
