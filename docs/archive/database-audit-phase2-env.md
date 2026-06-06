# Phase 2: Environment Variable & Database Connection Audit

**Date:** 2026-06-01  
**Project:** FIGAS Remix II  
**Scope:** Environment variable inventory, database connection configuration, Prisma vs pg.Pool analysis

---

## 1. Environment Variable Inventory

### 1.1 Variables Defined in `.env` (actual, gitignored)

| Variable | Value (sanitized) | Used By |
|---|---|---|
| `DATABASE_URL` | `postgresql://artisan:***@localhost:5432/figas` | [`app/utils/db.server.ts`](../../app/utils/db.server.ts:6), [`prisma/schema.prisma`](../../prisma/schema.prisma:7) |
| `TEST_DATABASE_URL` | `postgresql://artisan:***@localhost:5432/figas_test` | Not referenced in code (likely for test runner) |
| `SESSION_SECRET` | `figas-session-secret-change-in-production-abc123` | [`app/session.server.ts`](../../app/session.server.ts:7) |
| `CSRF_SECRET` | `figas-csrf-secret-change-in-production-xyz789` | [`app/utils/csrf.server.ts`](../../app/utils/csrf.server.ts:18) |
| `ADMIN_EMAIL` | `admin@figas.gov.fk` | [`app/utils/seed.ts`](../../app/utils/seed.ts:25) |
| `ADMIN_PASSWORD` | `figas2024!` | [`app/utils/seed.ts`](../../app/utils/seed.ts:25) |
| `PILOT1_EMAIL` | `felix.pilot@figas.gov.fk` | [`app/utils/seed.ts`](../../app/utils/seed.ts:25) |
| `PILOT1_PASSWORD` | `figas2024!` | [`app/utils/seed.ts`](../../app/utils/seed.ts:25) |
| `PILOT2_EMAIL` | `oscar.pilot@figas.gov.fk` | [`app/utils/seed.ts`](../../app/utils/seed.ts:25) |
| `PILOT2_PASSWORD` | `figas2024!` | [`app/utils/seed.ts`](../../app/utils/seed.ts:25) |
| `OPERATIONS_EMAIL` | `ops@figas.gov.fk` | [`app/utils/seed.ts`](../../app/utils/seed.ts:25) |
| `OPERATIONS_PASSWORD` | `figas2024!` | [`app/utils/seed.ts`](../../app/utils/seed.ts:25) |
| `ENGINEER_EMAIL` | `engineer@figas.gov.fk` | [`app/utils/seed.ts`](../../app/utils/seed.ts:25) |
| `ENGINEER_PASSWORD` | `figas2024!` | [`app/utils/seed.ts`](../../app/utils/seed.ts:25) |
| `PASSENGER_EMAIL` | `passenger@figas.gov.fk` | [`app/utils/seed.ts`](../../app/utils/seed.ts:25) |
| `PASSENGER_PASSWORD` | `figas2024!` | [`app/utils/seed.ts`](../../app/utils/seed.ts:25) |
| `CHECKIN_EMAIL` | `checkin@figas.gov.fk` | [`app/utils/seed.ts`](../../app/utils/seed.ts:25) |
| `CHECKIN_PASSWORD` | `figas2024!` | [`app/utils/seed.ts`](../../app/utils/seed.ts:25) |
| `FINANCE_EMAIL` | `finance@figas.gov.fk` | [`app/utils/seed.ts`](../../app/utils/seed.ts:25) |
| `FINANCE_PASSWORD` | `figas2024!` | [`app/utils/seed.ts`](../../app/utils/seed.ts:25) |
| `STRIPE_SECRET_KEY` | `sk_test_51TYFxSJQ...` | [`app/utils/stripe.server.ts`](../../app/utils/stripe.server.ts:6) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_test_placeholder` | [`app/utils/stripe.server.ts`](../../app/utils/stripe.server.ts:19) |

### 1.2 Variables Defined in `.env.example` (template, tracked in git)

| Variable | Value (placeholder) | Notes |
|---|---|---|
| `SUPABASE_DATABASE_URL` | *(placeholder)* | **Does not exist in `.env`** — legacy Supabase reference |
| `SUPABASE_ANON_KEY` | *(placeholder)* | **Does not exist in `.env`** — legacy Supabase reference |
| `STRIPE_SECRET_KEY` | *(placeholder)* | ✅ Exists in `.env` |
| `STRIPE_WEBHOOK_SECRET` | *(placeholder)* | ✅ Exists in `.env` |

### 1.3 Variables Referenced in Code but Missing from `.env.example`

| Variable | Code Location | Severity |
|---|---|---|
| `DATABASE_URL` | [`db.server.ts:6`](../../app/utils/db.server.ts:6), [`schema.prisma:7`](../../prisma/schema.prisma:7) | **HIGH** — the primary connection string |
| `SESSION_SECRET` | [`session.server.ts:7`](../../app/session.server.ts:7) | **HIGH** — session encryption |
| `CSRF_SECRET` | [`csrf.server.ts:18`](../../app/utils/csrf.server.ts:18) | **MEDIUM** — CSRF token signing |
| `TEST_DATABASE_URL` | *(not referenced in code)* | **LOW** — test infrastructure |
| All role credential vars | [`seed.ts:25`](../../app/utils/seed.ts:25) | **MEDIUM** — seed data only |

---

## 2. Database Connection Configuration Comparison

### 2.1 Current Architecture (Dual Access Pattern)

```mermaid
flowchart TD
    A[.env DATABASE_URL] --> B[app/utils/db.server.ts]
    A --> C[prisma/schema.prisma]
    
    B --> D[pg.Pool]
    D --> E[Raw SQL Queries]
    D --> F[Custom Migration Runner<br/>app/utils/migrate.ts]
    D --> G[PBAC Scripts<br/>prisma/seed-pbac.ts<br/>prisma/migrate-users-to-pbac.ts]
    
    C --> H[Prisma Client<br/>generated/prisma/]
    H --> I[Types for ALL 30+ tables]
    H --> J[NOT imported anywhere in app/]
    
    style H fill:#f96,stroke:#333,color:#000
    style J fill:#f96,stroke:#333,color:#000
```

### 2.2 Connection Details

| Aspect | `pg.Pool` (via `db.server.ts`) | Prisma Client |
|---|---|---|
| **Connection string** | `DATABASE_URL` | `DATABASE_URL` (same) |
| **Instantiation** | Singleton `Pool` at module scope | Generated client at `generated/prisma/` |
| **Query method** | `db.query(sql, params)` — raw SQL | Prisma ORM methods |
| **Migration runner** | Custom (`migrate.ts` → SQL files in `migrations/`) | Prisma Migrate (not used) |
| **Seed scripts** | Raw SQL via `pool.query()` | Prisma seed (not used) |
| **Runtime usage** | ✅ **All application code** | ❌ **Zero imports in `app/`** |

### 2.3 Key Finding: Prisma Client is Generated but Unused

The generated Prisma Client at [`generated/prisma/`](../../generated/) contains types for **all 30+ database tables** (users, bookings, flights, invoices, etc.), but:

1. **Zero imports** of `@prisma/client` exist anywhere in `app/` code
2. The [`schema.prisma`](../../prisma/schema.prisma) only defines **5 PBAC models** (roles, permissions, role_permissions, user_roles, audit_log)
3. The full-table types were generated via `prisma db pull` (introspection), not from schema definitions
4. The PBAC scripts in [`prisma/seed-pbac.ts`](../../prisma/seed-pbac.ts) and [`prisma/migrate-users-to-pbac.ts`](../../prisma/migrate-users-to-pbac.ts) import `pool` from `db.server.ts` — **not** Prisma Client — despite being in the `prisma/` directory

### 2.4 Migration Strategy

| Aspect | Current Approach |
|---|---|
| **Migration files** | Sequential SQL files in [`migrations/`](../../migrations/) (001 through 019) |
| **Runner** | Custom [`app/utils/migrate.ts`](../../app/utils/migrate.ts) using `pg.Pool` |
| **Tracking** | `_migrations` table in the database |
| **Execution** | `npm run migrate` → `node --env-file .env --import tsx app/utils/migrate.ts` |
| **Prisma Migrate** | Not used |

---

## 3. Configuration Gaps & Discrepancies

### 3.1 `.env.example` is Severely Outdated

The template file at [`.env.example`](../../.env.example) references `SUPABASE_DATABASE_URL` and `SUPABASE_ANON_KEY` — variables that **do not exist** in the actual `.env`. The actual database connection uses `DATABASE_URL` (a direct PostgreSQL connection string, not Supabase's connection pooling URL).

**Missing from `.env.example`:**
- `DATABASE_URL` — the actual connection string used by both `pg.Pool` and Prisma
- `TEST_DATABASE_URL` — test database connection
- `SESSION_SECRET` — session encryption secret
- `CSRF_SECRET` — CSRF protection secret
- All 8 role credential pairs (ADMIN, PILOT1, PILOT2, OPERATIONS, ENGINEER, PASSENGER, CHECKIN, FINANCE)

### 3.2 Hardcoded Fallback Secrets

| File | Code | Risk |
|---|---|---|
| [`app/session.server.ts:7`](../../app/session.server.ts:7) | `process.env.SESSION_SECRET ?? "s3cr3t"` | **HIGH** — hardcoded fallback in production |
| [`app/utils/csrf.server.ts:18`](../../app/utils/csrf.server.ts:18) | `process.env.CSRF_SECRET ?? process.env.SESSION_SECRET ?? "change-me-in-production"` | **MEDIUM** — falls back to SESSION_SECRET then hardcoded string |

### 3.3 No `prisma` CLI in `package.json`

The [`package.json`](../../package.json) includes `@prisma/client` as a runtime dependency but has **no `prisma` package** in devDependencies. This means:
- `prisma generate` cannot be run without installing `prisma` globally or as a dev dependency
- `prisma db pull` cannot be run
- `prisma migrate` cannot be used

### 3.4 Supabase Dependencies Unused

The [`package.json`](../../package.json) includes `@supabase/supabase-js` as a dependency, but:
- No Supabase-related environment variables exist in `.env`
- No Supabase client is instantiated or used in application code
- The `.env.example` references Supabase variables that don't match actual usage

---

## 4. Recommendations for Unifying Under Prisma

### 4.1 Migration Path: `pg.Pool` → Prisma Client

```mermaid
flowchart LR
    subgraph Current
        A[pg.Pool<br/>db.server.ts] --> B[Raw SQL everywhere]
        C[Prisma Client<br/>generated/] --> D[Unused types]
    end
    
    subgraph Target
        E[Prisma Client] --> F[Type-safe queries]
        E --> G[Prisma Migrate]
        E --> H[Prisma Studio]
    end
    
    A -.->|Phase 3: Migrate| E
    C -.->|Phase 3: Activate| E
```

### 4.2 Prerequisites for Prisma-Only Architecture

| Requirement | Current Status | Action Needed |
|---|---|---|
| `DATABASE_URL` in `.env` | ✅ Already present | None |
| Prisma schema covering all tables | ❌ Only 5 PBAC models | Add all 30+ tables to `schema.prisma` |
| `prisma` CLI available | ❌ Not in devDependencies | Add `"prisma": "^7.8.0"` to devDependencies |
| Prisma Client imported in app | ❌ Zero imports | Replace `db.query()` calls with `prisma.model.findMany()` etc. |
| Migration system | ❌ Custom SQL-based | Migrate to `prisma migrate` |
| Seed scripts | ❌ Raw SQL via `pool` | Rewrite using Prisma Client |

### 4.3 Does Current `.env` Support Prisma-Only Architecture?

**Yes, with caveats:**

- ✅ `DATABASE_URL` is already defined and used by both `pg.Pool` and Prisma schema — no change needed
- ✅ The connection string uses `postgresql://` scheme which Prisma supports natively
- ⚠️ Prisma's connection pooling behavior differs from `pg.Pool` — Prisma manages its own connection pool internally
- ⚠️ If Supabase connection pooling is ever needed, Prisma supports `?pgbouncer=true` and `?connection_limit=1` flags on the connection string

### 4.4 Recommended `.env.example` (Updated)

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/figas
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/figas_test

# Session & Security
SESSION_SECRET=your-session-secret-here
CSRF_SECRET=your-csrf-secret-here

# Seed Credentials (development only)
ADMIN_EMAIL=admin@figas.gov.fk
ADMIN_PASSWORD=change-me-in-production
PILOT1_EMAIL=felix.pilot@figas.gov.fk
PILOT1_PASSWORD=change-me-in-production
PILOT2_EMAIL=oscar.pilot@figas.gov.fk
PILOT2_PASSWORD=change-me-in-production
OPERATIONS_EMAIL=ops@figas.gov.fk
OPERATIONS_PASSWORD=change-me-in-production
ENGINEER_EMAIL=engineer@figas.gov.fk
ENGINEER_PASSWORD=change-me-in-production
PASSENGER_EMAIL=passenger@figas.gov.fk
PASSENGER_PASSWORD=change-me-in-production
CHECKIN_EMAIL=checkin@figas.gov.fk
CHECKIN_PASSWORD=change-me-in-production
FINANCE_EMAIL=finance@figas.gov.fk
FINANCE_PASSWORD=change-me-in-production

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## 5. Summary of Findings

### Critical Issues

1. **`.env.example` is dangerously out of date** — references `SUPABASE_DATABASE_URL` which doesn't exist in `.env`, and is missing `DATABASE_URL`, `SESSION_SECRET`, `CSRF_SECRET`, and all role credentials. A developer cloning the repo would have no idea what variables to set.

2. **Hardcoded fallback secrets** — `SESSION_SECRET` defaults to `"s3cr3t"` and `CSRF_SECRET` defaults to `"change-me-in-production"` if environment variables are missing. This is a security risk in production.

3. **Prisma Client is dead code** — installed, generated, and sitting at `generated/prisma/` with types for all 30+ tables, but never imported or used anywhere in application code.

### Moderate Issues

4. **No `prisma` CLI in devDependencies** — `@prisma/client` v7.8.0 is a runtime dependency, but the `prisma` CLI package is absent, making schema management and client regeneration impossible without manual installation.

5. **PBAC scripts mislocated** — [`prisma/seed-pbac.ts`](../../prisma/seed-pbac.ts) and [`prisma/migrate-users-to-pbac.ts`](../../prisma/migrate-users-to-pbac.ts) live in the `prisma/` directory but use `pg.Pool` (not Prisma), which is confusing.

### Low Issues

6. **Supabase dependency unused** — `@supabase/supabase-js` is installed but never used; `.env.example` references Supabase variables that don't match actual configuration.

7. **`TEST_DATABASE_URL` undocumented** — exists in `.env` but not referenced in code or `.env.example`.

---

## 6. Recommended Action Items (for Phase 3+)

| Priority | Action | Details |
|---|---|---|
| P0 | Update `.env.example` | Replace Supabase vars with actual vars; add all missing variables |
| P0 | Remove hardcoded fallback secrets | Make `SESSION_SECRET` and `CSRF_SECRET` throw if not set in production |
| P1 | Add `prisma` to devDependencies | Enable `prisma generate`, `prisma db pull`, `prisma migrate` |
| P1 | Expand `schema.prisma` | Add all 30+ database tables to the Prisma schema |
| P2 | Migrate `db.server.ts` to Prisma Client | Replace `pg.Pool` with `PrismaClient` singleton |
| P2 | Rewrite PBAC scripts using Prisma | Move from `pool.query()` to `prisma.role.create()` etc. |
| P2 | Replace custom migration runner | Migrate from `migrate.ts` + SQL files to `prisma migrate` |
| P3 | Remove `pg` dependency | Once all queries use Prisma, remove `pg` from package.json |
| P3 | Remove `@supabase/supabase-js` | If Supabase is not coming back, remove unused dependency |
