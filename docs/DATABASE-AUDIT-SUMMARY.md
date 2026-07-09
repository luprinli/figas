# FIGAS Database Audit — Consolidated Summary

**Date:** 2026-06-04
**Status:** Complete
**Sources:** Consolidated from three-phase audit (`database-audit-phase1.md` through `phase3-duplicates.md`), verification report, and 2026-06-04 comprehensive codebase audit.

---

## 1. Database Architecture

- **Engine:** PostgreSQL 16
- **ORM:** Prisma Client 7.8.0 with `@prisma/adapter-pg`
- **Migration Strategy:** Consolidated into 7 rational migration files (`migrations/consolidated/`)
- **Connection:** Single Prisma Client singleton (`app/utils/db.server.ts`)
- **Access Pattern:** Hybrid — Prisma ORM for simple CRUD, `$queryRawUnsafe` for complex queries

---

## 2. Key Findings

### 2.1 Access Pattern (Resolved)

| Concern | Finding | Status |
|---------|---------|--------|
| Dual access pattern | Previously used raw `pg.Pool` alongside Prisma | Resolved — fully unified under Prisma Client |
| `db.query()` shims | 30 call sites in 6 files wrapping Prisma raw queries | Acceptable — intentional transitional pattern |
| Broken pool imports | `migrate.ts` and `test-passenger-assignment.ts` still import `pg.Pool` | Files excluded from production build; acceptable |

### 2.2 Schema Issues

| # | Issue | Severity | Resolution |
|---|-------|----------|------------|
| 1 | `booking_leg_passengers` created twice with different schemas in migrations | Critical | Consolidated in `004-scheduling.sql` |
| 2 | `weight_balance_snapshots` table created in two separate migrations | High | Consolidated |
| 3 | Duplicate trigger functions in multiple migration files | Medium | Moved to `007-triggers-and-functions.sql` |
| 4 | Seed data mixed with schema DDL in 3 migrations | Medium | Extracted to seed scripts |
| 5 | `departure_date` column added to `booking_legs` in 3 separate migrations | Low | Consolidated |
| 6 | `schedule_id` vs `flight_id` column name mismatch in `flight-leg.ts` | High | Fixed — column name corrected |

### 2.3 Configuration Debt

| # | Constant | Duplicate Count | Status |
|---|----------|----------------|--------|
| 1 | `DEFAULT_FARE_PER_PASSENGER = 50` | 4 files | Needs centralization |
| 2 | `FREIGHT_RATE_PER_KG = 2` | 2 files + 1 magic number | Needs centralization |
| 3 | BN-2 empty weight (1,627 kg) | 2 files | Needs centralization |
| 4 | BN-2 MTOW (2,994 kg) | 3 files | Needs centralization |
| 5 | Cruise speed 140 kt | 5 files | Needs centralization |
| 6 | Tax rate = 0 | 3 files | Needs centralization |
| 7 | Chart of accounts codes | 2 files | Needs centralization |
| 8 | 30-day default due date | 3 locations | Needs centralization |

### 2.4 Data Integrity

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Three conflicting BN-2 fuel burn rates (140, 45, 25 kg/h) | Critical | 140 kg/h is wrong — fix to 45 kg/h |
| 2 | Taxi time inconsistency (5 vs 10 min) | Critical | Standardize to 10 min |
| 3 | `SYSTEM_USER_ID = 0` in Stripe webhook — potential FK violation | High | Create system user or handle differently |
| 4 | Stanley airport code `STY` in legacy files — should be `PSY` | Medium | Fixed in active code; 3 legacy files remain |
| 5 | Default passenger age fallback of 35 | Medium | Enforce non-null birth dates |
| 6 | Hardcoded BN-2 seat arm positions, CG limits | Medium | Move to aircraft DB records |
| 7 | `pilotWeightKg: 80` hardcoded in 2 files | Medium | Centralize to single constant |

### 2.5 Environment Variables (Resolved Shortfalls)

| Variable | Previous State | Current State |
|----------|---------------|---------------|
| `DATABASE_URL` | In `.env`, missing from `.env.example` | Added to `.env.example` |
| `SESSION_SECRET` | Has dev fallback, missing from `.env.example` | Added to `.env.example` |
| `CSRF_SECRET` | Has dev fallback, missing from `.env.example` | Added to `.env.example` |
| `APP_URL` | Hardcoded `https://figas.co` | Added as env var |
| `CONTACT_EMAIL` | Hardcoded `ops@figas.gov.fk` | Added as env var |
| `CONTACT_PHONE` | Hardcoded `+500 27219` | Added as env var |
| `SYSTEM_EMAIL` | Hardcoded `system@figas.gov.fk` | Added as env var |
| `STRIPE_API_VERSION` | Hardcoded `"2026-04-22.dahlia"` | Added as env var |

### 2.6 Migration Consolidation

19 sequential migrations were consolidated into 7 rational files:

| File | Tables |
|------|--------|
| `001-core-schema.sql` | users, bookings, booking_legs, booking_passengers, organizations |
| `002-reference-data.sql` | aerodromes, aircraft, pilots, aerodrome_distances, aerodrome_headings |
| `003-finance.sql` | payment_methods, payments, stripe_payments, invoices, invoice_items, chart_of_accounts, accounting_journal_entries, accounting_journal_lines |
| `004-scheduling.sql` | schedules, flights, flight_legs, booking_leg_passengers, weight_balance_snapshots, pilot_assignments |
| `005-pbac.sql` | roles, permissions, role_permissions, user_roles, audit_log |
| `006-no-fly.sql` | no_fly_rules |
| `007-triggers-and-functions.sql` | Common triggers and SQL functions |

---

## 3. ORM Feasibility Assessment

**Verdict: Maintain current hybrid approach.**

42+ `$queryRawUnsafe` call sites across 15+ files. Analysis found:

- **~20 queries** could be converted to Prisma's type-safe API with moderate effort
- **~15-20 queries** are irreducible — they use computed columns, window functions, dynamic WHERE, DDL, `ILIKE` cross-model joins, or `COUNT(DISTINCT)` across multiple tables
- No alternative ORM (Drizzle, Kysely, TypeORM) eliminates all raw SQL requirements for this schema

### Irreducible Query Categories

| Category | Count | Reason |
|----------|-------|--------|
| Computed columns with type casts | 3 | `CAST(EXTRACT(...))`, `COALESCE(...)` in SELECT |
| Window functions | 2 | `ROW_NUMBER() OVER (PARTITION BY ...)` |
| Dynamic WHERE clauses | 4 | Filter arrays built at runtime |
| DDL statements | 2 | `CREATE TABLE`, `ADD COLUMN` in migration runners |
| `INSERT ... RETURNING` with subqueries | 2 | Complex multi-table insert patterns |
| `ILIKE` cross-model joins | 1 | Search across booking references + passenger names |
| Computed subqueries | 2 | `EXISTS`, `NOT EXISTS` with complex conditions |
| `COUNT(DISTINCT)` across joined tables | 1 | Booking statistics across models |

---

## 4. Hardcoded Data Sources

| Data | Source | Recommendation |
|------|--------|---------------|
| Fuel matrix (30×30 aerodromes) | `app/utils/scheduling/fuel-data.ts` | Keep in code — reference data that rarely changes; already backed by `fuel_rules` DB table |
| Distance matrix (30×30) | `app/utils/scheduling/suggest-route.ts` | Keep in code with DB fallback — used for rapid route suggestion; validated against `aerodrome_distances` table |
| Aircraft performance data (5 aircraft) | `app/utils/scheduling/suggest-route.ts` | Move to DB `aircraft` table — already partially migrated; remaining fields should follow |

---

## 5. Remaining Action Items

| Priority | Item | Phase in Implementation Plan |
|----------|------|------------------------------|
| P0 | Fix BN-2 fuel burn rate comment (140 → 45 kg/h) | Phase 0 |
| P0 | Fix taxi time inconsistency (standardize to 10 min) | Phase 0 |
| P0 | Create `system_settings` table | Phase 3 |
| P1 | Centralize 15+ duplicated business constants | Phase 3 |
| P1 | Add missing environment variables | Phase 3 |
| P1 | Move pilot regulatory limits to DB config | Phase 3 |
| P2 | Move remaining hardcoded BN-2 data to aircraft records | Phase 4 |
| P2 | Move hardcoded fuel matrix to DB with in-memory cache | Phase 4 |
| P3 | Convert ~20 convertible raw SQL queries to Prisma | Backlog |

---

## 6. Cross-References

- **Master Plan:** [`plans/MASTER-PLAN.md`](../plans/MASTER-PLAN.md) — Data integrity & configuration roadmap
- **Architecture:** [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) — Section 7: Repository Pattern
- **Data Model:** [`docs/DATA_MODEL.md`](DATA_MODEL.md) — Complete table documentation
- **Original Phase 1 Audit:** [`docs/archive/database-audit-phase1.md`](archive/database-audit-phase1.md)
- **Original Phase 2 Audit:** [`docs/archive/database-audit-phase2-env.md`](archive/database-audit-phase2-env.md)
- **Original Phase 3 Audit:** [`docs/archive/database-audit-phase3-duplicates.md`](archive/database-audit-phase3-duplicates.md)
- **ORM Feasibility Analysis:** [`plans/prisma-orm-feasibility-analysis.md`](../plans/prisma-orm-feasibility-analysis.md)
- **Migration Consolidation Plan:** [`plans/migration-consolidation-plan.md`](../plans/migration-consolidation-plan.md)
