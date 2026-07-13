# FIGAS Database Audit — Phase 1

**Date:** 2026-06-01  
**Scope:** Full exploration of database access patterns, schema definitions, data layers, and codebase architecture  
**Auditor:** Roo (Architect mode)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Database Access Architecture](#2-database-access-architecture)
3. [Schema Definition Analysis](#3-schema-definition-analysis)
4. [Repository Layer Analysis](#4-repository-layer-analysis)
5. [Service Layer Analysis](#5-service-layer-analysis)
6. [Scheduling Engine Analysis](#6-scheduling-engine-analysis)
7. [Migration Analysis](#7-migration-analysis)
8. [PBAC / Permissions System](#8-pbac--permissions-system)
9. [Hardcoded Data Inventory](#9-hardcoded-data-inventory)
10. [Bugs and Anomalies](#10-bugs-and-anomalies)
11. [Consolidation Opportunities](#11-consolidation-opportunities)
12. [Duplicate / Redundant File Analysis](#12-duplicate--redundant-file-analysis)
13. [Recommendations](#13-recommendations)

---

## 1. Executive Summary

The FIGAS application uses a **dual database access pattern**:

- **Prisma Client** (`@prisma/client` v7.8.0) is installed as a dependency and generates TypeScript type definitions in [`generated/prisma/`](../generated/prisma/). The [`prisma/schema.prisma`](../prisma/schema.prisma) file defines only **5 PBAC models** (roles, permissions, role_permissions, user_roles, audit_log).
- **ALL runtime database queries** use **raw SQL** via [`app/utils/db.server.ts`](../app/utils/db.server.ts), which wraps a `pg.Pool` (node-postgres) connection pool.

The database schema (30+ tables) is managed entirely through **19 raw SQL migration files** in [`migrations/`](../migrations/), applied by a custom migration runner at [`app/utils/migrate.ts`](../app/utils/migrate.ts).

**Key finding:** Prisma is used **only for type generation** (via `prisma db pull` or `prisma generate` against the live database). The Prisma schema does **not** define business tables (bookings, flights, schedules, etc.). This means Prisma's migration engine, type safety at the query level, and client-side features are all unused at runtime.

---

## 2. Database Access Architecture

### 2.1 Connection Management

**File:** [`app/utils/db.server.ts`](../app/utils/db.server.ts)

```typescript
import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: url });

export const db = {
  async query(text: string, params?: unknown[]) {
    const result = await pool.query(text, params);
    return result;
  },
  async queryOne(text: string, params?: unknown[]) {
    const result = await pool.query(text, params);
    return result.rows[0] ?? null;
  },
};
export type DbClient = pg.PoolClient;
```

- **Single connection pool** created at module load time from `DATABASE_URL` env var.
- Two exported methods: `db.query()` (returns full `QueryResult`) and `db.queryOne()` (returns first row or null).
- `DbClient` type is `pg.PoolClient`, used by some repositories for transaction support.

### 2.2 Transaction Support

**File:** [`app/utils/repositories/shared.ts`](../app/utils/repositories/shared.ts)

```typescript
export async function withTransaction<T>(
  fn: (client: DbClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
```

- Transactions use `pool.connect()` to get a dedicated client, then `BEGIN`/`COMMIT`/`ROLLBACK`.
- Some repository methods accept an optional `DbClient` parameter to participate in an existing transaction (e.g., [`booking-leg.ts`](../app/utils/repositories/booking-leg.ts) `assignFlight()` and `updateStatus()`).

### 2.3 Migration Runner

**File:** [`app/utils/migrate.ts`](../app/utils/migrate.ts)

- Reads `.sql` files from [`migrations/`](../migrations/) directory using `fs.readdirSync`.
- Tracks applied migrations in a `_migrations` table (filename, applied_at timestamp, hash).
- Applies pending migrations sequentially within transactions.
- **Notable:** Runs as a standalone script, not integrated into the application startup.

### 2.4 Environment Variables

**File:** [`.env.example`](../.env.example)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string for `pg.Pool` |
| `SESSION_SECRET` | Cookie signing secret for session management |
| `STRIPE_SECRET_KEY` | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `SUPABASE_DATABASE_URL` | Supabase-specific database URL (legacy?) |
| `SUPABASE_ANON_KEY` | Supabase anonymous key (legacy?) |

### 2.5 Access Pattern Summary

| Pattern | Used? | Location |
|---------|-------|----------|
| `db.query()` raw SQL | **Yes — primary** | All repositories, services, scheduling |
| `db.queryOne()` raw SQL | **Yes** | Various repositories |
| `pool.connect()` + transaction | **Yes** | `shared.ts`, some repository methods |
| Prisma Client queries | **No** | Not used at runtime |
| Prisma migrations | **No** | Custom migration runner instead |
| Supabase client | **No** | `@supabase/supabase-js` in dependencies but unused |

---

## 3. Schema Definition Analysis

### 3.1 Prisma Schema

**File:** [`prisma/schema.prisma`](../prisma/schema.prisma)

Defines only **5 models**:

| Model | Table | Fields |
|-------|-------|--------|
| `Role` | `roles` | id, name, slug, description, hierarchy_level, created_at, updated_at |
| `Permission` | `permissions` | id, name, slug, description, resource, action, created_at |
| `RolePermission` | `role_permissions` | id, role_id (FK), permission_id (FK) |
| `UserRole` | `user_roles` | id, user_id (FK to users), role_id (FK), assigned_by, assigned_at |
| `AuditLog` | `audit_log` | id, actor_id, action, resource, resource_id, details, created_at |

**Key observations:**
- The `users` table is referenced by `user_roles.user_id` but is **not defined** in the Prisma schema (it exists only in raw SQL migrations).
- The generator output goes to `../generated/prisma` — but the generated types include **all** database tables (including business tables), suggesting `prisma db pull` was run against the live database at some point.
- No `enum` blocks are defined in the schema, even though the database uses VARCHAR columns with CHECK constraints for status fields.

### 3.2 Database Schema (from Migrations)

The full database schema spans **30+ tables** across 19 migration files:

**Core Business Tables:**
| Table | Created In | Purpose |
|-------|-----------|---------|
| `users` | 001 | System users (agents, pilots, engineers, admins) |
| `aerodromes` | 001 | Airport/airstrip reference data |
| `aircraft` | 001 | Aircraft fleet registry |
| `organizations` | 001 | Client organizations (e.g., FIGAS, other) |
| `pilots` | 001 | Pilot-specific data (licenses, medicals) |
| `fare_routes` | 001 | Fare pricing by route |
| `flights` | 001 | Scheduled flights |
| `bookings` | 001 | Booking records |
| `booking_legs` | 001 | Individual legs of multi-leg bookings |
| `passengers` → `booking_passengers` | 001 → 016 | Passenger details (renamed in migration 016) |
| `booking_leg_passengers` | 016 | Junction table linking passengers to legs |
| `seat_assignments` | 001 | Seat assignments |
| `checkin_reminders` | 001 | Check-in reminder tracking |
| `notifications` | 001 | Notification records |
| `flight_manifests` | 001 | Flight manifest data |
| `system_settings` | 001 | Key-value configuration store |
| `payments` | 001 | Payment records |

**Scheduling Tables:**
| Table | Created In | Purpose |
|-------|-----------|---------|
| `schedules` | 014 | Schedule headers (date, status, version) |
| `flight_legs` | 014 | Individual legs within scheduled flights |
| `weight_balance_snapshots` | 014/019 | Weight & balance computation snapshots |
| `pilot_assignments` | 014 | Pilot-to-flight assignments |

**Reference Tables:**
| Table | Created In | Purpose |
|-------|-----------|---------|
| `fuel_rules` | 003 | Fuel burn rules by route/aircraft |
| `aerodrome_distances` | 003 | Distance matrix between aerodromes |
| `aerodrome_headings` | 003 | Heading/bearing between aerodromes |
| `airframe_hours` | 003 | Airframe hour tracking |
| `payment_methods` | 006 | Payment method reference (cash, card, etc.) |

**Financial Tables:**
| Table | Created In | Purpose |
|-------|-----------|---------|
| `invoices` | 007 | Invoice records |
| `invoice_items` | 007 | Invoice line items |
| `chart_of_accounts` | 008 | Accounting chart of accounts |
| `accounting_journal_entries` | 008 | Journal entry headers |
| `accounting_journal_lines` | 008 | Journal entry line items |
| `payment_reminders` | 009 | Payment reminder scheduling |
| `stripe_payments` | 010 | Stripe payment tracking |
| `bank_transactions` | 011 | Bank statement transaction import |
| `export_log` | 012 | Data export audit log |

**PBAC Tables:**
| Table | Created In | Purpose |
|-------|-----------|---------|
| `roles` | 015 | Role definitions |
| `permissions` | 015 | Permission definitions |
| `role_permissions` | 015 | Role-to-permission assignments |
| `user_roles` | 015 | User-to-role assignments |
| `audit_log` | 015 | Authorization audit trail |

**Other:**
| Table | Created In | Purpose |
|-------|-----------|---------|
| `no_fly_rules` | 017 | No-fly day rules (recurring/one-off) |
| `_migrations` | 001 | Migration tracking table |

### 3.3 ID Type Inconsistency

| ID Type | Tables |
|---------|--------|
| **Integer (SERIAL)** | users, aerodromes, aircraft, organizations, pilots, fare_routes, flights, bookings, booking_legs, booking_passengers, booking_leg_passengers, schedules, flight_legs, weight_balance_snapshots, pilot_assignments, roles, permissions, role_permissions, user_roles, audit_log, no_fly_rules, checkin_reminders, notifications, flight_manifests, seat_assignments, fuel_rules, aerodrome_distances, aerodrome_headings, airframe_hours, system_settings |
| **UUID** | invoices, invoice_items, chart_of_accounts, accounting_journal_entries, accounting_journal_lines, payment_reminders, stripe_payments, bank_transactions, export_log, payment_methods |

**Observation:** Financial/accounting tables use UUIDs while all business tables use integer IDs. This is a deliberate design choice but creates complexity in the codebase where some repository methods accept `number` and others accept `string` for IDs.

---

## 4. Repository Layer Analysis

### 4.1 Overview

All 25+ repository files are in [`app/utils/repositories/`](../app/utils/repositories/) and follow a consistent pattern:

- **Exported as a singleton object** (e.g., `export const bookingRepository = { ... }`)
- **All methods use `db.query()`** with parameterized SQL (`$1`, `$2` placeholders)
- **Row types defined as TypeScript interfaces** at the top of each file
- **No ORM usage** — all queries are hand-written SQL

### 4.2 Repository Inventory

| File | Entity | Methods | Lines | Notes |
|------|--------|---------|-------|-------|
| [`booking.ts`](../app/utils/repositories/booking.ts) | Bookings | 20+ | 820 | Largest repo. Pagination, search, date range, needs attention, pipeline counts, agent portfolio, recent activity |
| [`admin.ts`](../app/utils/repositories/admin.ts) | Admin CRUD | 40+ | 881 | Largest file. Dashboard stats, CRUD for users/aerodromes/aircraft/fare-routes/fuel-rules/distances/headings/airframe-hours. **Contains inline DDL:** `CREATE TABLE IF NOT EXISTS system_settings` |
| [`booking-leg.ts`](../app/utils/repositories/booking-leg.ts) | Booking Legs | 8 | 108 | Supports transaction client via optional `DbClient` param |
| [`booking-leg.server.ts`](../app/utils/repositories/booking-leg.server.ts) | Booking Legs (read) | 4 | 114 | Server-only read operations with JOINs |
| [`booking-leg-passenger.ts`](../app/utils/repositories/booking-leg-passenger.ts) | Booking Leg Passengers | 7 | 146 | Junction table CRUD with check-in |
| [`booking-passenger.ts`](../app/utils/repositories/booking-passenger.ts) | Booking Passengers | 6 | 108 | Passenger CRUD with search |
| [`flight.ts`](../app/utils/repositories/flight.ts) | Flights (read) | 5 | 149 | Read operations with seat availability |
| [`flight.server.ts`](../app/utils/repositories/flight.server.ts) | Flights (write) | 4 | 166 | Write operations (create, update, delete) |
| [`flight-leg.ts`](../app/utils/repositories/flight-leg.ts) | Flight Legs | 7 | 129 | CRUD with `replaceFlightLegs()` using transaction |
| [`schedule.ts`](../app/utils/repositories/schedule.ts) | Schedules (CRUD) | 6 | 122 | Basic CRUD with status management |
| [`schedule.server.ts`](../app/utils/repositories/schedule.server.ts) | Schedules (read) | 4 | 100 | Read operations with aggregate stats |
| [`aerodrome.ts`](../app/utils/repositories/aerodrome.ts) | Aerodromes | 5 | 77 | CRUD |
| [`aircraft.ts`](../app/utils/repositories/aircraft.ts) | Aircraft | 4 | 78 | CRUD |
| [`checkin.ts`](../app/utils/repositories/checkin.ts) | Check-in | 10 | 234 | Check-in reminders, booking search, passenger check-in, payment recording |
| [`accounting-entry.ts`](../app/utils/repositories/accounting-entry.ts) | Accounting | 10 | 184 | Journal entries/lines with `resolveAccountId()` |
| [`bank-transaction.ts`](../app/utils/repositories/bank-transaction.ts) | Bank Transactions | 6 | 95 | CRUD with batch import |
| [`invoice.ts`](../app/utils/repositories/invoice.ts) | Invoices | 9 | 140 | CRUD with number generation |
| [`invoice-item.ts`](../app/utils/repositories/invoice-item.ts) | Invoice Items | 2 | 59 | Create and findByInvoice |
| [`stripe-payment.ts`](../app/utils/repositories/stripe-payment.ts) | Stripe Payments | 8 | 125 | CRUD with atomic claim processing |
| [`pilot-assignment.ts`](../app/utils/repositories/pilot-assignment.ts) | Pilot Assignments | 6 | 124 | CRUD with availability checking |
| [`weight-balance.ts`](../app/utils/repositories/weight-balance.ts) | Weight Balance | 4 | 123 | CRUD for snapshots |
| [`fare-route.ts`](../app/utils/repositories/fare-route.ts) | Fare Routes | 5 | 52 | Lookup (symmetric A→B or B→A) |
| [`payment-method.ts`](../app/utils/repositories/payment-method.ts) | Payment Methods | 3 | 39 | Lookup |
| [`payment-reminder.ts`](../app/utils/repositories/payment-reminder.ts) | Payment Reminders | 5 | 70 | CRUD with status tracking |
| [`organization.ts`](../app/utils/repositories/organization.ts) | Organizations | 2 | 33 | Lookup |
| [`notification.ts`](../app/utils/repositories/notification.ts) | Notifications | 4 | 57 | CRUD |
| [`export-log.ts`](../app/utils/repositories/export-log.ts) | Export Log | 2 | 61 | Create and findRecent |
| [`shared.ts`](../app/utils/repositories/shared.ts) | Utilities | 2 functions | 74 | `buildUpdateQuery()`, `withTransaction()` |

### 4.3 Key Patterns

**Dual file pattern (`.server.ts` + `.ts`):**

Three entities split read vs. write operations across separate files:

| Entity | Read File | Write File |
|--------|-----------|------------|
| Flight | [`flight.ts`](../app/utils/repositories/flight.ts) | [`flight.server.ts`](../app/utils/repositories/flight.server.ts) |
| Schedule | [`schedule.ts`](../app/utils/repositories/schedule.ts) | [`schedule.server.ts`](../app/utils/repositories/schedule.server.ts) |
| Booking Leg | [`booking-leg.ts`](../app/utils/repositories/booking-leg.ts) | [`booking-leg.server.ts`](../app/utils/repositories/booking-leg.server.ts) |

The `.server.ts` files contain read operations that JOIN across tables (and thus are server-only), while the `.ts` files contain basic CRUD that could theoretically be used from client loaders. However, **all files use `db.query()` which is server-only**, so this distinction is somewhat artificial.

**Inline DDL in [`admin.ts`](../app/utils/repositories/admin.ts):**

At line ~530, the `getSettings()` method contains:
```sql
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(255) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```
This DDL should be in a migration file, not embedded in application code.

**Transaction support pattern:**

Some repository methods accept an optional `client?: DbClient` parameter (e.g., [`booking-leg.ts`](../app/utils/repositories/booking-leg.ts) `assignFlight()`, `updateStatus()`). When provided, the method uses that client for the query instead of the pool, allowing participation in an outer transaction managed by `withTransaction()`.

---

## 5. Service Layer Analysis

### 5.1 Overview

8 service files in [`app/utils/services/`](../app/utils/services/) orchestrate business logic across multiple repositories.

### 5.2 Service Inventory

| File | Purpose | Lines | DB Access Pattern |
|------|---------|-------|-------------------|
| [`fare-calculator.server.ts`](../app/utils/services/fare-calculator.server.ts) | Fare calculation | 94 | Uses `fareRouteRepository` |
| [`fare-calculator.ts`](../app/utils/services/fare-calculator.ts) | Client-safe types only | 21 | **None** (types only) |
| [`export.service.ts`](../app/utils/services/export.service.ts) | CSV/XML export | 375 | Direct `db.query()` with raw SQL |
| [`invoice.service.ts`](../app/utils/services/invoice.service.ts) | Invoice lifecycle | 801 | Uses repositories + direct `db.query()` |
| [`no-fly.service.ts`](../app/utils/services/no-fly.service.ts) | No-fly day rules | 420 | Direct `db.query()` |
| [`payment.service.ts`](../app/utils/services/payment.service.ts) | Payment processing | 398 | Uses repositories + direct `db.query()` |
| [`reconciliation.service.ts`](../app/utils/services/reconciliation.service.ts) | Bank reconciliation | 308 | Direct `db.query()` |
| [`reminder.service.ts`](../app/utils/services/reminder.service.ts) | Payment reminders | 149 | Direct `db.query()` |

### 5.3 Key Observations

**Mixed access patterns:** Some services use repositories (e.g., `fare-calculator.server.ts` uses `fareRouteRepository`), while others use direct `db.query()` calls (e.g., `export.service.ts`, `no-fly.service.ts`). This inconsistency makes it harder to track all database access points.

**Hardcoded constants duplicated across services:**
- `DEFAULT_FARE_PER_PASSENGER = 50` in [`fare-calculator.server.ts`](../app/utils/services/fare-calculator.server.ts), [`invoice.service.ts`](../app/utils/services/invoice.service.ts), [`payment.service.ts`](../app/utils/services/payment.service.ts)
- `FREIGHT_RATE_PER_KG = 2` in [`fare-calculator.server.ts`](../app/utils/services/fare-calculator.server.ts), [`invoice.service.ts`](../app/utils/services/invoice.service.ts), [`payment.service.ts`](../app/utils/services/payment.service.ts)

These should be centralized (e.g., in `constants.ts` or a database configuration table).

**Export service uses raw SQL for all export types:**
- Payments export: 5-table JOIN with aggregation
- Invoices export: 4-table JOIN
- Journal export: 3-table JOIN
- Aging export: Complex subquery with COALESCE

---

## 6. Scheduling Engine Analysis

### 6.1 Overview

12 files in [`app/utils/scheduling/`](../app/utils/scheduling/) implement a 5-phase schedule builder.

### 6.2 Architecture

```
buildSchedule(date, createdBy)  [index.ts]
  │
  ├── Phase 1: clusterBookings()        [cluster-bookings.ts]
  │     Groups unassigned booking legs by date+origin+destination
  │
  ├── Phase 2: buildRoute()             [nearest-neighbor.ts]
  │     Constructs optimal routes using nearest-neighbor heuristic
  │     Loads distances/headings from DB
  │
  ├── Phase 3: assignAircraft()         [assign-aircraft.ts]
  │     Evaluates all active aircraft for each route
  │
  ├── Phase 4: computeWeightBalance()   [weight-balance.ts]
  │     Computes weight & balance for each leg
  │     Loads passenger weights from DB
  │
  └── Phase 5: assignPilots()           [assign-pilots.ts]
        Assigns pilots based on availability
        (Placeholder implementation)
```

### 6.3 File Inventory

| File | Purpose | Lines | DB Access |
|------|---------|-------|-----------|
| [`types.ts`](../app/utils/scheduling/types.ts) | Type definitions | 175 | None |
| [`index.ts`](../app/utils/scheduling/index.ts) | Main orchestrator | 294 | Uses repositories + direct `db.query()` |
| [`cluster-bookings.ts`](../app/utils/scheduling/cluster-bookings.ts) | Phase 1: Clustering | 60 | Direct `db.query()` |
| [`nearest-neighbor.ts`](../app/utils/scheduling/nearest-neighbor.ts) | Phase 2: Routing | 154 | Direct `db.query()` |
| [`assign-aircraft.ts`](../app/utils/scheduling/assign-aircraft.ts) | Phase 3: Aircraft | 100 | Direct `db.query()` |
| [`weight-balance.ts`](../app/utils/scheduling/weight-balance.ts) | Phase 4: W&B | 394 | Direct `db.query()` |
| [`assign-pilots.ts`](../app/utils/scheduling/assign-pilots.ts) | Phase 5: Pilots | 132 | Direct `db.query()` |
| [`fuel-data.ts`](../app/utils/scheduling/fuel-data.ts) | Fuel lookup table | 59 | **None** (hardcoded matrix) |
| [`fuel-planning.ts`](../app/utils/scheduling/fuel-planning.ts) | Fuel planning | 235 | **None** (hardcoded CSV data) |
| [`insert-passenger-route.ts`](../app/utils/scheduling/insert-passenger-route.ts) | Route insertion | 194 | **None** (pure algorithm) |
| [`flight-validation.ts`](../app/utils/scheduling/flight-validation.ts) | Flight validation | 659 | **None** (pure client-side) |
| [`suggest-route.ts`](../app/utils/scheduling/suggest-route.ts) | Route suggestion | 307 | **None** (hardcoded data) |

### 6.4 Key Observations

**Hardcoded reference data in scheduling code:**
- 30�—30 distance matrix in [`suggest-route.ts`](../app/utils/scheduling/suggest-route.ts) (also exists in DB as `aerodrome_distances`)
- 30�—30 fuel matrix in [`fuel-data.ts`](../app/utils/scheduling/fuel-data.ts)
- 77-row fuel CSV rules embedded in [`fuel-planning.ts`](../app/utils/scheduling/fuel-planning.ts) (also exists in DB as `fuel_rules`)
- 5 aircraft definitions in [`suggest-route.ts`](../app/utils/scheduling/suggest-route.ts) (also exists in DB as `aircraft` table)

**Phase 5 (Pilot Assignment) is a placeholder:**
- [`assign-pilots.ts`](../app/utils/scheduling/assign-pilots.ts) defaults to 0 duty hours, 12 max duty hours, 8 max flight hours
- Assumes all pilots have valid medicals
- Does not query actual pilot availability from the database

**Client-side files with hardcoded data:**
- [`suggest-route.ts`](../app/utils/scheduling/suggest-route.ts) — Used in route loaders, contains hardcoded distance matrix and aircraft data
- [`flight-validation.ts`](../app/utils/scheduling/flight-validation.ts) — Pure client-side validation with hardcoded aircraft performance parameters
- [`fuel-data.ts`](../app/utils/scheduling/fuel-data.ts) — Hardcoded fuel lookup table

---

## 7. Migration Analysis

### 7.1 Migration Inventory

| # | File | Tables Created | Lines | Notes |
|---|------|---------------|-------|-------|
| 001 | [`001_create_tables.sql`](../migrations/001_create_tables.sql) | 16 core tables + `_migrations` | ~200 | Initial schema |
| 002 | [`002_add_missing_columns.sql`](../migrations/002_add_missing_columns.sql) | — | ~100 | Adds missing columns, creates indexes |
| 003 | [`003_create_reference_tables.sql`](../migrations/003_create_reference_tables.sql) | fuel_rules, aerodrome_distances, aerodrome_headings, airframe_hours | ~80 | Reference data tables |
| 004 | [`004_add_timestamps_to_reference_tables.sql`](../migrations/004_add_timestamps_to_reference_tables.sql) | — | ~20 | Adds timestamps to 3 reference tables |
| 005 | [`005_add_booking_source_and_cancellation.sql`](../migrations/005_add_booking_source_and_cancellation.sql) | — | ~40 | Booking source, cancellation fields |
| 006 | [`006_create_payment_methods.sql`](../migrations/006_create_payment_methods.sql) | payment_methods | ~60 | Creates `set_updated_at()` function |
| 007 | [`007_create_invoices.sql`](../migrations/007_create_invoices.sql) | invoices, invoice_items | ~80 | With CHECK constraints, triggers |
| 008 | [`008_create_accounting_journal.sql`](../migrations/008_create_accounting_journal.sql) | chart_of_accounts, accounting_journal_entries, accounting_journal_lines | ~120 | 20 seeded accounts |
| 009 | [`009_create_payment_reminders.sql`](../migrations/009_create_payment_reminders.sql) | payment_reminders | ~30 | |
| 010 | [`010_create_stripe_payments.sql`](../migrations/010_create_stripe_payments.sql) | stripe_payments | ~40 | |
| 011 | [`011_create_bank_transactions.sql`](../migrations/011_create_bank_transactions.sql) | bank_transactions | ~30 | |
| 012 | [`012_create_export_log.sql`](../migrations/012_create_export_log.sql) | export_log | ~20 | |
| 013 | [`013_enhance_existing_tables.sql`](../migrations/013_enhance_existing_tables.sql) | — | ~50 | Adds payment/accounting columns |
| 014 | [`014_create_scheduling_tables.sql`](../migrations/014_create_scheduling_tables.sql) | schedules, flight_legs, weight_balance_snapshots, pilot_assignments | ~100 | Adds scheduling columns to flights/aircraft/pilots/aerodromes |
| 015 | [`015_create_rbac_tables.sql`](../migrations/015_create_rbac_tables.sql) | roles, permissions, role_permissions, user_roles, audit_log | ~200 | Seeds 7 roles, 50+ permissions |
| 016 | [`016_create_booking_leg_passengers.sql`](../migrations/016_create_booking_leg_passengers.sql) | booking_leg_passengers | ~80 | Renames passengers → booking_passengers, migrates data |
| 017 | [`017_create_no_fly_dates.sql`](../migrations/017_create_no_fly_dates.sql) | no_fly_rules | ~60 | Creates own `update_nfr_updated_at()` function |
| 018 | [`018_alter_no_fly_rules_day_of_week_array.sql`](../migrations/018_alter_no_fly_rules_day_of_week_array.sql) | — | ~20 | Changes day_of_week to array |
| 019 | [`019_add_schedule_audit_and_weight_balance.sql`](../migrations/019_add_schedule_audit_and_weight_balance.sql) | weight_balance_snapshots (duplicate?) | ~60 | Adds audit columns, scheduling columns |

### 7.2 Issues Found

**1. Duplicate `weight_balance_snapshots` creation:**
- Migration 014 creates `weight_balance_snapshots` table
- Migration 019 also creates `weight_balance_snapshots` table (would fail if 014 already ran)
- Migration 019 likely intended to add columns to the existing table

**2. Duplicate trigger function:**
- Migration 006 creates `set_updated_at()` function (generic, reusable)
- Migration 017 creates `update_nfr_updated_at()` function (specific to no_fly_rules)
- Migration 017 should reuse `set_updated_at()` instead

**3. Migration 017 → 018 could be consolidated:**
- Migration 017 creates `no_fly_rules` with `day_of_week INTEGER`
- Migration 018 immediately changes it to `day_of_week INTEGER[]`
- These could be a single migration

**4. No down migrations:**
- All 19 migrations are forward-only
- No rollback scripts exist

**5. Seed data in migrations:**
- Migration 006 seeds 5 payment methods
- Migration 008 seeds 20 chart of accounts
- Migration 015 seeds 7 roles and 50+ permissions
- This mixes schema changes with data seeding

---

## 8. PBAC / Permissions System

### 8.1 Overview

The Permission-Based Access Control (PBAC) system is implemented across multiple files:

| File | Purpose | Lines |
|------|---------|-------|
| [`app/utils/permissions.server.ts`](../app/utils/permissions.server.ts) | Core authorization logic | 609 |
| [`app/utils/auth.server.ts`](../app/utils/auth.server.ts) | Session-based authentication | 151 |
| [`app/session.server.ts`](../app/session.server.ts) | Session configuration | ~30 |
| [`prisma/schema.prisma`](../prisma/schema.prisma) | PBAC model definitions (Prisma) | ~50 |
| [`prisma/seed-pbac.ts`](../prisma/seed-pbac.ts) | PBAC seed script | 357 |
| [`prisma/migrate-users-to-pbac.ts`](../prisma/migrate-users-to-pbac.ts) | User migration script | 176 |

### 8.2 Key Functions in [`permissions.server.ts`](../app/utils/permissions.server.ts)

| Function | Purpose |
|----------|---------|
| `requirePermission(request, permission)` | Throws redirect if user lacks permission |
| `requireAnyPermission(request, [perms])` | Throws if user lacks ALL listed permissions |
| `requireAllPermissions(request, [perms])` | Throws if user lacks ANY listed permission |
| `hasPermission(userId, permission)` | Returns boolean (for UI rendering) |
| `getUserPermissions(userId)` | Returns all permissions (cached per request) |
| `assignRole()` / `revokeRole()` | Role management with audit logging |
| `addPermissionToRole()` / `removePermissionFromRole()` | Permission management with audit logging |
| `createAuditLogEntry()` | Records audit trail |
| `queryAuditLog()` | Queries audit log with filters |
| `validateSoD()` / `validateAllSoD()` / `validateSoDForRole()` | Segregation of duties enforcement |
| `validateApproval()` | Prevents self-approval |

### 8.3 Segregation of Duties (SoD)

Three incompatible permission pairs:
1. `finance:record-payment` ↔ `finance:reconcile`
2. `finance:create-invoice` ↔ `finance:record-payment`
3. `user:create` ↔ `user:assign-role`

### 8.4 Caching

Request-scoped permission caching using `Map<string, string[]>` keyed by `user:${userId}`. Cache is cleared at the start of each request via `clearPermissionCache()`.

### 8.5 Database Access

All PBAC functions use `db.query()` with raw SQL. The Prisma schema defines the same tables but is **not used** for runtime queries — only for type generation.

---

## 9. Hardcoded Data Inventory

### 9.1 Financial Constants

| Constant | Value | Files |
|----------|-------|-------|
| `DEFAULT_FARE_PER_PASSENGER` | 50 | [`fare-calculator.server.ts`](../app/utils/services/fare-calculator.server.ts), [`invoice.service.ts`](../app/utils/services/invoice.service.ts), [`payment.service.ts`](../app/utils/services/payment.service.ts) |
| `FREIGHT_RATE_PER_KG` | 2 | [`fare-calculator.server.ts`](../app/utils/services/fare-calculator.server.ts), [`invoice.service.ts`](../app/utils/services/invoice.service.ts), [`payment.service.ts`](../app/utils/services/payment.service.ts) |
| Tax rate | 0 (no VAT) | [`invoice.service.ts`](../app/utils/services/invoice.service.ts) |

### 9.2 Scheduling Constants

| Constant | Value | File |
|----------|-------|------|
| `STANDARD_CREW_WEIGHT_KG` | 80 | [`weight-balance.ts`](../app/utils/scheduling/weight-balance.ts) |
| `CREW_COUNT` | 2 | [`weight-balance.ts`](../app/utils/scheduling/weight-balance.ts) |
| `CRUISE_SPEED_KTAS` | 140 | [`weight-balance.ts`](../app/utils/scheduling/weight-balance.ts) |
| Arm positions for CG | Various | [`weight-balance.ts`](../app/utils/scheduling/weight-balance.ts) |

### 9.3 Hardcoded Reference Data (Duplicated from Database)

| Data | Size | File | Also in DB? |
|------|------|------|-------------|
| Distance matrix | 30�—30 (900 values) | [`suggest-route.ts`](../app/utils/scheduling/suggest-route.ts) | Yes — `aerodrome_distances` |
| Fuel matrix | 30�—30 (900 values) | [`fuel-data.ts`](../app/utils/scheduling/fuel-data.ts) | Yes — `fuel_rules` |
| Fuel CSV rules | 77 rows | [`fuel-planning.ts`](../app/utils/scheduling/fuel-planning.ts) | Yes — `fuel_rules` |
| Aircraft data | 5 aircraft | [`suggest-route.ts`](../app/utils/scheduling/suggest-route.ts) | Yes — `aircraft` table |

### 9.4 Hardcoded Data in Scheduling Code (Not in Database)

| Data | Location | Notes |
|------|----------|-------|
| `STANDARD_CREW_WEIGHT_KG = 80` | [`weight-balance.ts`](../app/utils/scheduling/weight-balance.ts) | Should be configurable |
| `CREW_COUNT = 2` | [`weight-balance.ts`](../app/utils/scheduling/weight-balance.ts) | Should be per-aircraft |
| `CRUISE_SPEED_KTAS = 140` | [`weight-balance.ts`](../app/utils/scheduling/weight-balance.ts) | Should be per-aircraft |
| Arm positions for CG calculation | [`weight-balance.ts`](../app/utils/scheduling/weight-balance.ts) | Should be per-aircraft |
| Pilot availability defaults (0 duty hrs, 12 max duty, 8 max flight) | [`assign-pilots.ts`](../app/utils/scheduling/assign-pilots.ts) | Placeholder — not querying actual data |
| `STANLEY = "STY"` constant | [`nearest-neighbor.ts`](../app/utils/scheduling/nearest-neighbor.ts) | **BUG**: distance matrix uses "PSY" |
| `STANLEY = "STY"` constant | [`suggest-route.ts`](../app/utils/scheduling/suggest-route.ts) | **BUG**: distance matrix uses "PSY" |

---

## 10. Bugs and Anomalies

### 10.1 Stanley Aerodrome Code Mismatch (CRITICAL)

**Files:** [`nearest-neighbor.ts`](../app/utils/scheduling/nearest-neighbor.ts) (line ~76), [`suggest-route.ts`](../app/utils/scheduling/suggest-route.ts) (line ~131)

Both files define `const STANLEY = "STY"`, but the hardcoded distance matrix in [`suggest-route.ts`](../app/utils/scheduling/suggest-route.ts) and [`fuel-data.ts`](../app/utils/scheduling/fuel-data.ts) uses `"PSY"` as the key for Stanley. The `getDistance()` function would return `0` for "STY" lookups against a matrix keyed by "PSY".

**Impact:** Route construction and fuel planning would fail or produce incorrect results for any route involving Stanley (the main hub).

### 10.2 Duplicate `weight_balance_snapshots` Table Creation

**Files:** [`014_create_scheduling_tables.sql`](../migrations/014_create_scheduling_tables.sql), [`019_add_schedule_audit_and_weight_balance.sql`](../migrations/019_add_schedule_audit_and_weight_balance.sql)

Migration 014 creates `weight_balance_snapshots`. Migration 019 also attempts to create it. If migration 014 has already run, migration 019 would fail with "relation already exists".

### 10.3 Duplicate Trigger Function

**Files:** [`006_create_payment_methods.sql`](../migrations/006_create_payment_methods.sql), [`017_create_no_fly_dates.sql`](../migrations/017_create_no_fly_dates.sql)

Migration 006 creates a generic `set_updated_at()` trigger function. Migration 017 creates a duplicate `update_nfr_updated_at()` function specific to `no_fly_rules`. The generic function could be reused.

### 10.4 Inline DDL in Application Code

**File:** [`admin.ts`](../app/utils/repositories/admin.ts) (line ~530)

Contains `CREATE TABLE IF NOT EXISTS system_settings` embedded in a repository method. DDL should be in migration files only.

### 10.5 Pilot Assignment is a Placeholder

**File:** [`assign-pilots.ts`](../app/utils/scheduling/assign-pilots.ts)

The `getPilotAvailabilities()` function returns hardcoded defaults (0 duty hours, 12 max duty hours, 8 max flight hours, medical valid) instead of querying actual pilot data from the database.

### 10.6 Mixed ID Types

Business tables use integer IDs (`SERIAL`), while financial tables use UUIDs. This creates complexity where some repository methods accept `number` and others accept `string` for IDs. The [`accounting-entry.ts`](../app/utils/repositories/accounting-entry.ts) `resolveAccountId()` function bridges this gap by looking up accounts by code.

---

## 11. Consolidation Opportunities

### 11.1 Migration Consolidation

| Migrations | Reason to Consolidate |
|------------|----------------------|
| 003 + 004 | 004 just adds timestamps to tables created in 003 |
| 006 + 007 + 008 + 009 + 010 + 011 + 012 | All create financial tables in a logical sequence |
| 017 + 018 | 018 immediately alters a column created in 017 |
| 014 + 019 | Both touch scheduling tables; 019 may duplicate 014 |

### 11.2 Code Consolidation

| What | Where | Suggestion |
|------|-------|------------|
| `DEFAULT_FARE_PER_PASSENGER = 50` | 3 service files | Move to [`constants.ts`](../app/utils/constants.ts) |
| `FREIGHT_RATE_PER_KG = 2` | 3 service files | Move to [`constants.ts`](../app/utils/constants.ts) |
| Distance matrix | [`suggest-route.ts`](../app/utils/scheduling/suggest-route.ts) + DB | Remove hardcoded copy, load from DB |
| Fuel matrix | [`fuel-data.ts`](../app/utils/scheduling/fuel-data.ts) + DB | Remove hardcoded copy, load from DB |
| Fuel CSV rules | [`fuel-planning.ts`](../app/utils/scheduling/fuel-planning.ts) + DB | Remove hardcoded copy, load from DB |
| Aircraft data | [`suggest-route.ts`](../app/utils/scheduling/suggest-route.ts) + DB | Remove hardcoded copy, load from DB |
| `set_updated_at()` vs `update_nfr_updated_at()` | Migrations 006 and 017 | Consolidate to single function |

### 11.3 Repository Consolidation

| Files | Issue | Suggestion |
|-------|-------|------------|
| [`flight.ts`](../app/utils/repositories/flight.ts) + [`flight.server.ts`](../app/utils/repositories/flight.server.ts) | Split read/write | Merge into single file |
| [`schedule.ts`](../app/utils/repositories/schedule.ts) + [`schedule.server.ts`](../app/utils/repositories/schedule.server.ts) | Split read/write | Merge into single file |
| [`booking-leg.ts`](../app/utils/repositories/booking-leg.ts) + [`booking-leg.server.ts`](../app/utils/repositories/booking-leg.server.ts) | Split read/write | Merge into single file |

### 11.4 Prisma Usage Consolidation

**Current state:** Prisma is installed and generates types, but is unused at runtime. The schema only defines 5 PBAC models while the generated types include all tables.

**Options:**
1. **Remove Prisma entirely** — Use only raw SQL with `pg` types. Remove `@prisma/client` dependency.
2. **Adopt Prisma fully** — Define all tables in `schema.prisma`, use Prisma Client for all queries, remove raw SQL repositories.
3. **Keep hybrid** — Use Prisma only for type generation (current state), but clean up the schema to match the database exactly.

---

## 12. Duplicate / Redundant File Analysis

### 12.1 Dual File Pattern (`.server.ts` + `.ts`)

Three entity pairs split across read/write files:

| Read File | Write File | Lines (Read) | Lines (Write) |
|-----------|-----------|-------------|---------------|
| [`flight.ts`](../app/utils/repositories/flight.ts) | [`flight.server.ts`](../app/utils/repositories/flight.server.ts) | 149 | 166 |
| [`schedule.ts`](../app/utils/repositories/schedule.ts) | [`schedule.server.ts`](../app/utils/repositories/schedule.server.ts) | 122 | 100 |
| [`booking-leg.ts`](../app/utils/repositories/booking-leg.ts) | [`booking-leg.server.ts`](../app/utils/repositories/booking-leg.server.ts) | 108 | 114 |

**Assessment:** The `.server.ts` suffix implies these are server-only (cannot be imported by client code), but **all** repository files use `db.query()` which is server-only. The split is inconsistent — [`booking.ts`](../app/utils/repositories/booking.ts) (820 lines) contains both read and write operations in a single file. Recommend merging each pair.

### 12.2 Hardcoded Data Duplication

| Data | In Code | In Database | Duplication? |
|------|---------|-------------|--------------|
| Distance matrix | [`suggest-route.ts`](../app/utils/scheduling/suggest-route.ts) | `aerodrome_distances` | **Yes** — 900 values duplicated |
| Fuel matrix | [`fuel-data.ts`](../app/utils/scheduling/fuel-data.ts) | `fuel_rules` | **Yes** — 900 values duplicated |
| Fuel CSV rules | [`fuel-planning.ts`](../app/utils/scheduling/fuel-planning.ts) | `fuel_rules` | **Yes** — 77 rows duplicated |
| Aircraft data | [`suggest-route.ts`](../app/utils/scheduling/suggest-route.ts) | `aircraft` | **Yes** — 5 aircraft duplicated |

### 12.3 No True Redundant Files

No files were found that are exact duplicates of each other. The dual-file pattern is a deliberate (if inconsistent) architectural choice.

---

## 13. Recommendations

### Priority 1 — Critical Bugs

| # | Recommendation | File(s) | Effort |
|---|---------------|---------|--------|
| 1 | Fix Stanley aerodrome code: change `"STY"` to `"PSY"` in [`nearest-neighbor.ts`](../app/utils/scheduling/nearest-neighbor.ts) and [`suggest-route.ts`](../app/utils/scheduling/suggest-route.ts) | [`nearest-neighbor.ts`](../app/utils/scheduling/nearest-neighbor.ts), [`suggest-route.ts`](../app/utils/scheduling/suggest-route.ts) | Small |
| 2 | Fix migration 019 to not re-create `weight_balance_snapshots` | [`019_add_schedule_audit_and_weight_balance.sql`](../migrations/019_add_schedule_audit_and_weight_balance.sql) | Small |

### Priority 2 — Hardcoded Data

| # | Recommendation | File(s) | Effort |
|---|---------------|---------|--------|
| 3 | Centralize `DEFAULT_FARE_PER_PASSENGER` and `FREIGHT_RATE_PER_KG` into [`constants.ts`](../app/utils/constants.ts) | 3 service files | Small |
| 4 | Replace hardcoded distance matrix in [`suggest-route.ts`](../app/utils/scheduling/suggest-route.ts) with DB query | [`suggest-route.ts`](../app/utils/scheduling/suggest-route.ts) | Medium |
| 5 | Replace hardcoded fuel matrix in [`fuel-data.ts`](../app/utils/scheduling/fuel-data.ts) with DB query | [`fuel-data.ts`](../app/utils/scheduling/fuel-data.ts) | Medium |
| 6 | Replace hardcoded fuel CSV rules in [`fuel-planning.ts`](../app/utils/scheduling/fuel-planning.ts) with DB query | [`fuel-planning.ts`](../app/utils/scheduling/fuel-planning.ts) | Medium |
| 7 | Replace hardcoded aircraft data in [`suggest-route.ts`](../app/utils/scheduling/suggest-route.ts) with DB query | [`suggest-route.ts`](../app/utils/scheduling/suggest-route.ts) | Medium |

### Priority 3 — Code Quality

| # | Recommendation | File(s) | Effort |
|---|---------------|---------|--------|
| 8 | Remove inline DDL from [`admin.ts`](../app/utils/repositories/admin.ts) and add to migration | [`admin.ts`](../app/utils/repositories/admin.ts) | Small |
| 9 | Merge dual-file repository pairs (flight, schedule, booking-leg) | 6 files | Medium |
| 10 | Implement proper pilot availability querying in [`assign-pilots.ts`](../app/utils/scheduling/assign-pilots.ts) | [`assign-pilots.ts`](../app/utils/scheduling/assign-pilots.ts) | Medium |
| 11 | Consolidate `set_updated_at()` and `update_nfr_updated_at()` trigger functions | Migrations 006, 017 | Small |

### Priority 4 — Migration Cleanup

| # | Recommendation | File(s) | Effort |
|---|---------------|---------|--------|
| 12 | Consolidate migrations 017 + 018 | 2 files | Small |
| 13 | Consolidate migrations 003 + 004 | 2 files | Small |
| 14 | Add down-migration scripts for all migrations | 19 files | Large |
| 15 | Separate seed data from schema migrations | Migrations 006, 008, 015 | Medium |

### Priority 5 — Strategic

| # | Recommendation | Effort | Impact |
|---|---------------|--------|--------|
| 16 | Decide on Prisma strategy: remove entirely or adopt fully | Large | High |
| 17 | Move scheduling constants (crew weight, cruise speed, etc.) to database configuration | Medium | Medium |
| 18 | Add TypeScript strict mode and type-safe query builders | Large | High |
| 19 | Consider migrating to a query builder (Kysely, Drizzle) for type-safe SQL | Large | High |

---

## Appendix A: Complete File Inventory

### Core Infrastructure (app/utils/)
| File | Lines | Purpose |
|------|-------|---------|
| [`db.server.ts`](../app/utils/db.server.ts) | 25 | Database connection (pg.Pool) |
| [`migrate.ts`](../app/utils/migrate.ts) | 114 | Custom migration runner |
| [`seed.ts`](../app/utils/seed.ts) | 160 | Test data seeding |
| [`constants.ts`](../app/utils/constants.ts) | ~200 | Enum/constant definitions |
| [`auth.server.ts`](../app/utils/auth.server.ts) | 151 | Session-based authentication |
| [`permissions.server.ts`](../app/utils/permissions.server.ts) | 609 | PBAC authorization |
| [`stripe.server.ts`](../app/utils/stripe.server.ts) | 48 | Stripe integration |
| [`schedule-handlers.server.ts`](../app/utils/schedule-handlers.server.ts) | 521 | Schedule action handlers |
| [`layout.server.ts`](../app/utils/layout.server.ts) | 11 | Layout utilities |
| [`session.server.ts`](../app/session.server.ts) | ~30 | Session configuration |

### Repositories (app/utils/repositories/)
| File | Lines | Entity |
|------|-------|--------|
| [`shared.ts`](../app/utils/repositories/shared.ts) | 74 | Utilities |
| [`booking.ts`](../app/utils/repositories/booking.ts) | 820 | Bookings |
| [`admin.ts`](../app/utils/repositories/admin.ts) | 881 | Admin CRUD |
| [`booking-leg.ts`](../app/utils/repositories/booking-leg.ts) | 108 | Booking Legs |
| [`booking-leg.server.ts`](../app/utils/repositories/booking-leg.server.ts) | 114 | Booking Legs (server reads) |
| [`booking-leg-passenger.ts`](../app/utils/repositories/booking-leg-passenger.ts) | 146 | Booking Leg Passengers |
| [`booking-passenger.ts`](../app/utils/repositories/booking-passenger.ts) | 108 | Booking Passengers |
| [`flight.ts`](../app/utils/repositories/flight.ts) | 149 | Flights (reads) |
| [`flight.server.ts`](../app/utils/repositories/flight.server.ts) | 166 | Flights (writes) |
| [`flight-leg.ts`](../app/utils/repositories/flight-leg.ts) | 129 | Flight Legs |
| [`schedule.ts`](../app/utils/repositories/schedule.ts) | 122 | Schedules |
| [`schedule.server.ts`](../app/utils/repositories/schedule.server.ts) | 100 | Schedules (server reads) |
| [`aerodrome.ts`](../app/utils/repositories/aerodrome.ts) | 77 | Aerodromes |
| [`aircraft.ts`](../app/utils/repositories/aircraft.ts) | 78 | Aircraft |
| [`checkin.ts`](../app/utils/repositories/checkin.ts) | 234 | Check-in |
| [`accounting-entry.ts`](../app/utils/repositories/accounting-entry.ts) | 184 | Accounting |
| [`bank-transaction.ts`](../app/utils/repositories/bank-transaction.ts) | 95 | Bank Transactions |
| [`invoice.ts`](../app/utils/repositories/invoice.ts) | 140 | Invoices |
| [`invoice-item.ts`](../app/utils/repositories/invoice-item.ts) | 59 | Invoice Items |
| [`stripe-payment.ts`](../app/utils/repositories/stripe-payment.ts) | 125 | Stripe Payments |
| [`pilot-assignment.ts`](../app/utils/repositories/pilot-assignment.ts) | 124 | Pilot Assignments |
| [`weight-balance.ts`](../app/utils/repositories/weight-balance.ts) | 123 | Weight Balance |
| [`fare-route.ts`](../app/utils/repositories/fare-route.ts) | 52 | Fare Routes |
| [`payment-method.ts`](../app/utils/repositories/payment-method.ts) | 39 | Payment Methods |
| [`payment-reminder.ts`](../app/utils/repositories/payment-reminder.ts) | 70 | Payment Reminders |
| [`organization.ts`](../app/utils/repositories/organization.ts) | 33 | Organizations |
| [`notification.ts`](../app/utils/repositories/notification.ts) | 57 | Notifications |
| [`export-log.ts`](../app/utils/repositories/export-log.ts) | 61 | Export Log |

### Services (app/utils/services/)
| File | Lines | Purpose |
|------|-------|---------|
| [`fare-calculator.server.ts`](../app/utils/services/fare-calculator.server.ts) | 94 | Fare calculation |
| [`fare-calculator.ts`](../app/utils/services/fare-calculator.ts) | 21 | Client-safe types |
| [`export.service.ts`](../app/utils/services/export.service.ts) | 375 | CSV/XML export |
| [`invoice.service.ts`](../app/utils/services/invoice.service.ts) | 801 | Invoice lifecycle |
| [`no-fly.service.ts`](../app/utils/services/no-fly.service.ts) | 420 | No-fly rules |
| [`payment.service.ts`](../app/utils/services/payment.service.ts) | 398 | Payment processing |
| [`reconciliation.service.ts`](../app/utils/services/reconciliation.service.ts) | 308 | Bank reconciliation |
| [`reminder.service.ts`](../app/utils/services/reminder.service.ts) | 149 | Payment reminders |

### Scheduling (app/utils/scheduling/)
| File | Lines | Phase |
|------|-------|-------|
| [`types.ts`](../app/utils/scheduling/types.ts) | 175 | Types |
| [`index.ts`](../app/utils/scheduling/index.ts) | 294 | Orchestrator |
| [`cluster-bookings.ts`](../app/utils/scheduling/cluster-bookings.ts) | 60 | Phase 1 |
| [`nearest-neighbor.ts`](../app/utils/scheduling/nearest-neighbor.ts) | 154 | Phase 2 |
| [`assign-aircraft.ts`](../app/utils/scheduling/assign-aircraft.ts) | 100 | Phase 3 |
| [`weight-balance.ts`](../app/utils/scheduling/weight-balance.ts) | 394 | Phase 4 |
| [`assign-pilots.ts`](../app/utils/scheduling/assign-pilots.ts) | 132 | Phase 5 |
| [`fuel-data.ts`](../app/utils/scheduling/fuel-data.ts) | 59 | Fuel lookup |
| [`fuel-planning.ts`](../app/utils/scheduling/fuel-planning.ts) | 235 | Fuel planning |
| [`insert-passenger-route.ts`](../app/utils/scheduling/insert-passenger-route.ts) | 194 | Route insertion |
| [`flight-validation.ts`](../app/utils/scheduling/flight-validation.ts) | 659 | Flight validation |
| [`suggest-route.ts`](../app/utils/scheduling/suggest-route.ts) | 307 | Route suggestion |

### PBAC / Prisma
| File | Lines | Purpose |
|------|-------|---------|
| [`prisma/schema.prisma`](../prisma/schema.prisma) | ~50 | PBAC model definitions |
| [`prisma/seed-pbac.ts`](../prisma/seed-pbac.ts) | 357 | PBAC seed script |
| [`prisma/migrate-users-to-pbac.ts`](../prisma/migrate-users-to-pbac.ts) | 176 | User migration script |

### Migrations (migrations/)
| # | File | Purpose |
|---|------|---------|
| 001 | [`001_create_tables.sql`](../migrations/001_create_tables.sql) | Core schema (16 tables) |
| 002 | [`002_add_missing_columns.sql`](../migrations/002_add_missing_columns.sql) | Missing columns + indexes |
| 003 | [`003_create_reference_tables.sql`](../migrations/003_create_reference_tables.sql) | Reference tables |
| 004 | [`004_add_timestamps_to_reference_tables.sql`](../migrations/004_add_timestamps_to_reference_tables.sql) | Timestamps |
| 005 | [`005_add_booking_source_and_cancellation.sql`](../migrations/005_add_booking_source_and_cancellation.sql) | Booking enhancements |
| 006 | [`006_create_payment_methods.sql`](../migrations/006_create_payment_methods.sql) | Payment methods + trigger function |
| 007 | [`007_create_invoices.sql`](../migrations/007_create_invoices.sql) | Invoicing |
| 008 | [`008_create_accounting_journal.sql`](../migrations/008_create_accounting_journal.sql) | Accounting |
| 009 | [`009_create_payment_reminders.sql`](../migrations/009_create_payment_reminders.sql) | Payment reminders |
| 010 | [`010_create_stripe_payments.sql`](../migrations/010_create_stripe_payments.sql) | Stripe payments |
| 011 | [`011_create_bank_transactions.sql`](../migrations/011_create_bank_transactions.sql) | Bank reconciliation |
| 012 | [`012_create_export_log.sql`](../migrations/012_create_export_log.sql) | Export logging |
| 013 | [`013_enhance_existing_tables.sql`](../migrations/013_enhance_existing_tables.sql) | Table enhancements |
| 014 | [`014_create_scheduling_tables.sql`](../migrations/014_create_scheduling_tables.sql) | Scheduling |
| 015 | [`015_create_rbac_tables.sql`](../migrations/015_create_rbac_tables.sql) | PBAC |
| 016 | [`016_create_booking_leg_passengers.sql`](../migrations/016_create_booking_leg_passengers.sql) | Passenger refactor |
| 017 | [`017_create_no_fly_dates.sql`](../migrations/017_create_no_fly_dates.sql) | No-fly rules |
| 018 | [`018_alter_no_fly_rules_day_of_week_array.sql`](../migrations/018_alter_no_fly_rules_day_of_week_array.sql) | No-fly array fix |
| 019 | [`019_add_schedule_audit_and_weight_balance.sql`](../migrations/019_add_schedule_audit_and_weight_balance.sql) | Schedule audit |

---

## Appendix B: Database Access Pattern Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Code                          │
├─────────────────────────────────────────────────────────────┤
│  Route Loaders/Actions  ───►  Services  ───►  Repositories  │
│         │                              │            │        │
│         │                              │            │        │
│         ▼                              ▼            ▼        │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              db.query() / db.queryOne()              │    │
│  │              (pg.Pool — raw SQL)                     │    │
│  └──────────────────────┬──────────────────────────────┘    │
│                         │                                    │
│                         ▼                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              PostgreSQL Database                      │    │
│  │  30+ tables managed by 19 SQL migrations              │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Prisma Client (INSTALLED but NOT USED at runtime)   │    │
│  │  └─ schema.prisma: only 5 PBAC models                │    │
│  │  └─ generated/prisma/: types for ALL tables          │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

*End of Phase 1 Database Audit*