# Migration Consolidation Plan

> **Status:** Complete — migrations consolidated into [`migrations/consolidated/`](../migrations/consolidated/).
> **Date:** ~2026-05; consolidated 2026-06-04.
> **Note:** This plan was executed. Original 19 sequential migration files remain preserved for reference; the 7 consolidated files are the canonical migrations.

## Overview

Consolidate 19 sequential SQL migration files into 7 rational, well-organized migration files grouped by domain concern. The original files are preserved for reference.

## Original Migrations (19 files)

| # | File | Purpose |
|---|------|---------|
| 001 | `001_create_tables.sql` | Core tables: users, aerodromes, aircraft, organizations, pilots, fare_routes, flights, bookings, booking_legs, passengers, seat_assignments, checkin_reminders, notifications, flight_manifests, system_settings, payments |
| 002 | `002_add_missing_columns.sql` | ALTER TABLE additions for all core tables + indexes |
| 003 | `003_create_reference_tables.sql` | fuel_rules, aerodrome_distances, aerodrome_headings, airframe_hours + salutation on passengers |
| 004 | `004_add_timestamps_to_reference_tables.sql` | Add created_at/updated_at to fuel_rules, aerodrome_distances, aerodrome_headings |
| 005 | `005_add_booking_source_and_cancellation.sql` | booking_source, cancellation columns, special_requirements + UPDATE seed data |
| 006 | `006_create_payment_methods.sql` | payment_methods table + seed data + set_updated_at trigger |
| 007 | `007_create_invoices.sql` | invoices + invoice_items tables |
| 008 | `008_create_accounting_journal.sql` | chart_of_accounts + accounting_journal_entries + accounting_journal_lines + seed data |
| 009 | `009_create_payment_reminders.sql` | payment_reminders table |
| 010 | `010_create_stripe_payments.sql` | stripe_payments table |
| 011 | `011_create_bank_transactions.sql` | bank_transactions table |
| 012 | `012_create_export_log.sql` | export_log table |
| 013 | `013_enhance_existing_tables.sql` | ALTER TABLE for bookings, payments, organizations (finance columns) |
| 014 | `014_create_scheduling_tables.sql` | schedules, flight_legs, pilot_assignments, booking_leg_passengers (v1) + ALTER flights |
| 015 | `015_create_rbac_tables.sql` | roles, permissions, role_permissions, user_roles, audit_log + seed data |
| 016 | `016_create_booking_leg_passengers.sql` | RENAME passengers→booking_passengers, recreate booking_leg_passengers (v2), migrate data, DROP columns |
| 017 | `017_create_no_fly_dates.sql` | no_fly_rules table + update_nfr_updated_at trigger |
| 018 | `018_alter_no_fly_rules_day_of_week_array.sql` | ALTER no_fly_rules day_of_week INTEGER→INTEGER[] |
| 019 | `019_add_schedule_audit_and_weight_balance.sql` | ALTER schedules (audit cols), weight_balance_snapshots, ALTER pilot_assignments, ALTER aerodromes |

## Rational Grouping (7 consolidated files)

| Consolidated File | Original Migrations Merged | Count |
|-------------------|---------------------------|-------|
| `001-core-schema.sql` | 001, 002, 005, 013, 016, 019 (aerodromes part) | 6 |
| `002-reference-data.sql` | 003, 004 | 2 |
| `003-finance.sql` | 006, 007, 008, 009, 010, 011, 012, 013 (finance parts) | 8 |
| `004-scheduling.sql` | 014, 019 (scheduling parts) | 2 |
| `005-pbac.sql` | 015 | 1 |
| `006-no-fly.sql` | 017, 018 | 2 |
| `007-triggers-and-functions.sql` | 006 (set_updated_at), 017 (update_nfr_updated_at) | 2 |

## Conflicts Resolved

### 1. Duplicate table creation: `weight_balance_snapshots`
- **Created in**: Migration 014 (as part of scheduling tables) and Migration 019
- **Resolution**: Keep the version from Migration 019 (it has more columns: `required_fuel_kg`, `minimum_fuel_kg`, `fuel_state`, `fuel_rule_applied`, `total_moment_kgm`, `cg_position_pct`, `effective_mtow_kg`, `effective_mlw_kg`, `mtow_used_pct`, `mlw_used_pct`, `binding_constraint`, `binding_constraint_detail`, `computed_by`, `computed_at`, `notes`). The 014 version only had basic columns. Include only one CREATE TABLE in `004-scheduling.sql`.

### 2. Schema conflict: `booking_leg_passengers`
- **Created in**: Migration 014 (v1 — references `passengers` table) and Migration 016 (v2 — references `booking_passengers` after rename)
- **Resolution**: Use the v2 schema from Migration 016 which references `booking_passengers` (the renamed table). The v1 table from 014 would be dropped by the rename in 016. In the consolidated file, only include the v2 version.

### 3. Duplicate trigger functions
- `set_updated_at()` created in Migration 006, also re-created in 007, 008, 010, 011
- `update_nfr_updated_at()` created in Migration 017 (functionally identical to `set_updated_at()`)
- **Resolution**: Consolidate into a single `set_updated_at()` function in `007-triggers-and-functions.sql`. Replace `update_nfr_updated_at()` usage with `set_updated_at()`.

### 4. Seed data mixed with schema
- Migration 006: `payment_methods` seed data
- Migration 008: `chart_of_accounts` seed data
- Migration 015: `roles`, `permissions`, `role_permissions` seed data
- Migration 005: UPDATE statement for `booking_legs.departure_date`
- **Resolution**: Keep seed data inline in the consolidated files since it's reference/configuration data essential for the system to function. The UPDATE in 005 is a data migration that should be preserved.

### 5. Redundant ALTER TABLE (Migration 002)
- Migration 002 adds columns that could have been in 001
- **Resolution**: In the consolidated files, all columns are included directly in the CREATE TABLE statements. No ALTER TABLE ADD COLUMN is needed for columns that exist in the final schema.

### 6. Triple `departure_date` addition
- Added in: Migration 001 (in `booking_legs` CREATE TABLE), Migration 002 (ALTER TABLE ADD), Migration 005 (ALTER TABLE ADD + UPDATE)
- **Resolution**: Include `departure_date` once in the CREATE TABLE for `booking_legs` in `001-core-schema.sql`. Preserve the UPDATE statement from 005 as a data migration note.

### 7. `passengers` → `booking_passengers` rename
- Migration 016 renames `passengers` to `booking_passengers`
- **Resolution**: In the consolidated schema, the table is created directly as `booking_passengers` with the final column set (after dropping `baggage_weight_kg`, `checked_in`, `seat_row`, `seat_column`, `weight`).

## New File Structure

```
migrations/
├── consolidated/
│   ├── 001-core-schema.sql          # Core business tables
│   ├── 002-reference-data.sql       # Reference/lookup tables
│   ├── 003-finance.sql              # Finance & accounting tables
│   ├── 004-scheduling.sql           # Scheduling & operations tables
│   ├── 005-pbac.sql                 # RBAC/PBAC tables
│   ├── 006-no-fly.sql               # No-fly rules
│   └── 007-triggers-and-functions.sql # Shared triggers & functions
├── 001_create_tables.sql            # (preserved)
├── 002_add_missing_columns.sql      # (preserved)
├── ...                              # (all originals preserved)
└── 019_add_schedule_audit_and_weight_balance.sql
```

## Detailed File Contents

### `001-core-schema.sql`
Tables (in dependency order):
1. `_migrations` — migration tracking
2. `users` — user accounts (with all columns from 001 + 002)
3. `aerodromes` — airports/airstrips (with all columns from 001 + 002 + 019)
4. `aircraft` — aircraft fleet (with all columns from 001 + 002)
5. `organizations` — organizations (with all columns from 001 + 002 + 013)
6. `pilots` — pilot records (with all columns from 001 + 002)
7. `fare_routes` — fare pricing (with all columns from 001 + 002)
8. `flights` — scheduled flights (with all columns from 001 + 002 + 014)
9. `bookings` — booking records (with all columns from 001 + 002 + 005 + 013)
10. `booking_legs` — booking legs (with all columns from 001 + 002 + 005)
11. `booking_passengers` — passengers (renamed from passengers, with final columns from 016)
12. `booking_leg_passengers` — junction table (v2 from 016)
13. `seat_assignments` — seat assignments (with all columns from 001 + 002)
14. `checkin_reminders` — check-in reminders (with all columns from 001 + 002)
15. `notifications` — notification log (with all columns from 001 + 002)
16. `flight_manifests` — flight manifests (with all columns from 001 + 002)
17. `system_settings` — key-value settings
18. `payments` — payment records (with all columns from 001 + 002 + 013)

Indexes: All indexes from 001, 002, 005, 013, 016

### `002-reference-data.sql`
Tables:
1. `fuel_rules` — fuel calculation rules (with timestamps)
2. `aerodrome_distances` — distance matrix (with timestamps)
3. `aerodrome_headings` — heading matrix (with timestamps)
4. `airframe_hours` — maintenance tracking

Indexes: All from 003

### `003-finance.sql`
Tables:
1. `payment_methods` — payment method reference
2. `invoices` — invoice records
3. `invoice_items` — invoice line items
4. `chart_of_accounts` — accounting chart
5. `accounting_journal_entries` — journal headers
6. `accounting_journal_lines` — journal lines
7. `payment_reminders` — payment reminder scheduling
8. `stripe_payments` — Stripe payment tracking
9. `bank_transactions` — bank reconciliation
10. `export_log` — export tracking

Seed data: payment_methods, chart_of_accounts
Indexes: All from 006-012

### `004-scheduling.sql`
Tables:
1. `schedules` — daily flight schedules (with audit columns from 019)
2. `flight_legs` — individual flight legs
3. `pilot_assignments` — pilot-to-flight assignments (with schedule_id FK from 019)
4. `weight_balance_snapshots` — weight & balance calculations (from 019, the complete version)

ALTER TABLE: flights (schedule_id, flight_number, fuel columns, sort_order from 014)
Indexes: All from 014, 019

### `005-pbac.sql`
Tables:
1. `roles` — role definitions
2. `permissions` — permission definitions
3. `role_permissions` — role-permission junction
4. `user_roles` — user-role junction
5. `audit_log` — audit trail

Seed data: roles, permissions, role_permissions
Indexes: All from 015

### `006-no-fly.sql`
Tables:
1. `no_fly_rules` — no-fly rules (with INTEGER[] day_of_week from 018)

Indexes: All from 017, 018 (including GIN index)

### `007-triggers-and-functions.sql`
Functions:
1. `set_updated_at()` — generic updated_at trigger function

Triggers applied to all tables with updated_at columns (using DO block for idempotency)
