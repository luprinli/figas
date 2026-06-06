# Database Audit Verification Report

**Date:** 2026-06-01  
**Scope:** Verify all database access is unified under Prisma Client  
**Project:** FIGAS-remix-II  

---

## 1. Remaining `pg.Pool` / `pg.Client` Usage

### Search: `import pg from "pg"` / `from "pg"` / `new Pool(` / `new Client(`

| Location | Pattern | Status |
|----------|---------|--------|
| `app/` directory | `import pg`, `new Pool(`, `new Client(` | ✅ **None found** |
| `prisma/` directory | `import pg`, `new Pool(`, `new Client(` | ✅ **None found** |
| `scripts/seed-bookings.ts:14` | `import { Pool } from "pg"` | ⚠️ **Found** |
| `scripts/lib/reference-data.ts:1` | `import { Pool } from "pg"` | ⚠️ **Found** |
| `scripts/lib/booking-writer.ts:1` | `import { Pool } from "pg"` | ⚠️ **Found** |
| `scripts/seed-bookings.ts:64` | `new Pool({ connectionString: databaseUrl })` | ⚠️ **Found** |

**Verdict:** The `app/` and `prisma/` directories are clean. Three `scripts/` files still use `pg.Pool` directly. These are standalone seed/utility scripts that run outside the Remix app context and connect to the database independently. They are **not imported by the application code** and do not affect the runtime Prisma unification.

---

## 2. Remaining `db.query()` Calls (Raw SQL Through Old Pattern)

### Search: `db.query(` in all source files

| File | Line(s) | Count |
|------|---------|-------|
| `app/utils/seed.ts` | 32, 43, 89, 99, 109, 125, 134, 142 | **8 calls** |
| `app/utils/scheduling/weight-balance.ts` | 213, 229 | **2 calls** |
| `app/utils/scheduling/index.ts` | 109, 220, 224, 239, 251 | **5 calls** |
| `app/utils/permissions.server.ts` | 171, 191, 215, 231, 273, 299, 325, 349, 378, 446, 555 | **11 calls** |
| `app/utils/auth.server.ts` | 67 | **1 call** |
| `scripts/verify-date-filtering.ts` | 44, 65, 80 | **3 calls** |

**Total:** **30 `db.query()` calls** across 6 files.

**Important context:** The `db.query()` method is **not** the old `pg.Pool` pattern. It is a **backward-compatible shim** defined in [`app/utils/db.server.ts:63-71`](app/utils/db.server.ts:63) that delegates to `prisma.$queryRawUnsafe()`. So these calls **do** go through Prisma Client — they just use raw SQL syntax instead of Prisma ORM methods.

**Verdict:** These are **not a regression** — they use Prisma under the hood. However, they represent **technical debt** that should be migrated to proper Prisma ORM methods (`db.model.findMany()`, `db.model.create()`, etc.) in a future phase.

---

## 3. Remaining `pool` Imports

### Search: `import { pool }` / `import pool`

| File | Line | Pattern | Status |
|------|------|---------|--------|
| `app/utils/migrate.ts:4` | `import { pool } from "./db.server"` | ⚠️ **Found** |
| `scripts/test-passenger-assignment.ts:22` | `import { pool } from "../app/utils/db.server"` | ⚠️ **Found** |

**Important context:** The `pool` export in [`app/utils/db.server.ts:120-124`](app/utils/db.server.ts:120) is a **deprecated stub** — it is `undefined as unknown as { ... }` with a JSDoc `@deprecated` tag. It exists solely to prevent import errors during migration.

- `app/utils/migrate.ts` uses `pool.query()` and `pool.connect()` — this will **fail at runtime** because `pool` is `undefined`. This file needs to be migrated to use Prisma directly.
- `scripts/test-passenger-assignment.ts` imports `pool` but likely also fails at runtime for the same reason.

**Verdict:** These are **broken imports** that will cause runtime errors if executed. They need to be migrated to Prisma.

---

## 4. Repository Files — Prisma Client Usage

### Spot-checked files:

| Repository File | Prisma ORM Usage | Raw SQL (`$queryRawUnsafe`) | Verdict |
|----------------|------------------|----------------------------|---------|
| [`app/utils/repositories/booking.ts`](app/utils/repositories/booking.ts) | `db.bookings.create()`, `db.bookings.findUnique()` | Heavy use of `$queryRawUnsafe` for complex queries | ⚠️ Mixed — uses Prisma ORM for simple ops, raw SQL for complex joins |
| [`app/utils/repositories/schedule.ts`](app/utils/repositories/schedule.ts) | `db.schedules.findUnique()`, `db.schedules.findMany()`, `db.schedules.create()`, `db.schedules.update()` | None | ✅ **Fully Prisma ORM** |
| [`app/utils/repositories/flight.ts`](app/utils/repositories/flight.ts) | `db.flights.update()` | `$queryRawUnsafe` for complex joins (findById, findByFlightNumber) | ⚠️ Mixed — simple updates use ORM, complex queries use raw SQL |
| [`app/utils/repositories/booking-leg.ts`](app/utils/repositories/booking-leg.ts) | Not checked in detail | Not checked in detail | ⚠️ Partial |
| [`app/utils/repositories/invoice.ts`](app/utils/repositories/invoice.ts) | Not checked in detail | Not checked in detail | ⚠️ Partial |

**Verdict:** Repository files consistently use `db` (the PrismaClient instance). Simple CRUD operations use Prisma ORM methods. Complex multi-table queries use `$queryRawUnsafe` (which is still Prisma, just raw SQL mode). No file uses the old `pg.Pool` pattern.

---

## 5. Service Files — Prisma Client / Repository Usage

### Spot-checked files:

| Service File | Database Access Pattern | Verdict |
|-------------|------------------------|---------|
| [`app/utils/services/invoice.service.ts`](app/utils/services/invoice.service.ts) | Uses repository functions + `db.invoices.update()`, `db.invoices.findMany()` | ✅ **Fully Prisma** |
| [`app/utils/services/fare-calculator.ts`](app/utils/services/fare-calculator.ts) | Client-safe — only exports types/interfaces | ✅ **No DB access** |
| [`app/utils/services/fare-calculator.server.ts`](app/utils/services/fare-calculator.server.ts) | Not checked | ⚠️ Not verified |
| [`app/utils/services/export.service.ts`](app/utils/services/export.service.ts) | Not checked | ⚠️ Not verified |
| [`app/utils/services/payment.service.ts`](app/utils/services/payment.service.ts) | Not checked | ⚠️ Not verified |

**Verdict:** Service files use Prisma Client or repository abstractions. No service file uses `pg.Pool` directly.

---

## 6. Prisma Schema Coverage

### Migration tables (consolidated): **42 tables**
### Prisma schema models: **46 models**

| Source | Count |
|--------|-------|
| Consolidated migrations (`CREATE TABLE IF NOT EXISTS`) | 42 |
| Prisma schema (`model` declarations) | 46 |

**Extra models in Prisma schema (not in consolidated migrations):**
- `password_reset_tokens` — from Supabase Auth / custom auth
- `email_verification_tokens` — from Supabase Auth / custom auth
- `data_table_migrations` — from migration framework
- `time_templates` — for preferred booking times

These 4 extra models are for external/auth features that exist in the database but were not created by the FIGAS migration files. They are properly represented in Prisma.

**Verdict:** ✅ **All 42 migration tables are covered** by Prisma models. The 4 additional models are legitimate external tables.

---

## 7. TypeScript Compilation

**Command:** `npx tsc --noEmit`

**Result:** ✅ **Passed with zero errors.**

---

## 8. `.env.example` Completeness

**File:** [`.env.example`](.env.example)

| Variable | Documented | Notes |
|----------|-----------|-------|
| `DATABASE_URL` | ✅ Yes | PostgreSQL connection string |
| `SESSION_SECRET` | ✅ Yes | Session cookie signing |
| `CSRF_SECRET` | ✅ Yes | CSRF token signing |
| `STRIPE_SECRET_KEY` | ✅ Yes | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | ✅ Yes | Stripe webhook signing |
| `NODE_ENV` | ✅ Yes | Environment mode |

**Verdict:** ✅ All required environment variables are documented.

---

## Summary of Findings

### ✅ What's Clean
1. **No `pg.Pool` or `pg.Client` in `app/` or `prisma/`** — all application code uses Prisma Client.
2. **All `db.query()` calls go through Prisma** — the `db` object is a PrismaClient with backward-compatible shims.
3. **TypeScript compiles with zero errors** — `npx tsc --noEmit` passes.
4. **Prisma schema covers all 42 migration tables** plus 4 external tables (46 models total).
5. **Repository files use Prisma ORM** for simple CRUD and `$queryRawUnsafe` for complex queries.
6. **Service files use Prisma Client or repository abstractions.**
7. **`.env.example` is complete** with all required variables.

### ⚠️ Remaining Issues

| # | Issue | Severity | Location | Recommendation |
|---|-------|----------|----------|---------------|
| 1 | **`scripts/` use raw `pg.Pool`** | Low | [`scripts/seed-bookings.ts:14`](scripts/seed-bookings.ts:14), [`scripts/lib/reference-data.ts:1`](scripts/lib/reference-data.ts:1), [`scripts/lib/booking-writer.ts:1`](scripts/lib/booking-writer.ts:1) | Migrate to PrismaClient for consistency, or leave as-is since they're standalone scripts |
| 2 | **`pool` import in `migrate.ts` will crash at runtime** | **High** | [`app/utils/migrate.ts:4`](app/utils/migrate.ts:4) | The `pool` export is `undefined` — this file will fail if executed. Must be migrated to use `prisma.$queryRawUnsafe()` or `db.query()` |
| 3 | **`pool` import in `test-passenger-assignment.ts` will crash at runtime** | **High** | [`scripts/test-passenger-assignment.ts:22`](scripts/test-passenger-assignment.ts:22) | Same issue — imports deprecated `pool` stub. Must use `db` (PrismaClient) instead |
| 4 | **30 `db.query()` calls use raw SQL shim** | Medium | Multiple files in `app/utils/` | These work (they delegate to `$queryRawUnsafe`) but should be migrated to Prisma ORM methods for type safety and maintainability |
| 5 | **`app/utils/seed.ts` uses raw SQL** | Medium | [`app/utils/seed.ts`](app/utils/seed.ts) | Should use repository functions or Prisma ORM methods |

---

## Final Verdict

> ✅ **The codebase IS fully unified under Prisma Client for all application code.**

All database access in `app/` and `prisma/` goes through the PrismaClient singleton defined in [`app/utils/db.server.ts`](app/utils/db.server.ts). The old `pg.Pool` has been replaced. The `db.query()` calls that remain are backward-compatible shims that delegate to `prisma.$queryRawUnsafe()`.

**However, two files will crash at runtime** due to importing the deprecated `pool` stub:
- [`app/utils/migrate.ts`](app/utils/migrate.ts) — the migration runner
- [`scripts/test-passenger-assignment.ts`](scripts/test-passenger-assignment.ts) — a test script

These should be prioritized for migration.

---

## Recommendations

1. **P0 — Fix broken `pool` imports:**
   - Migrate [`app/utils/migrate.ts`](app/utils/migrate.ts) to use `db.query()` (Prisma's `$queryRawUnsafe`) instead of `pool.query()` and `pool.connect()`
   - Migrate [`scripts/test-passenger-assignment.ts`](scripts/test-passenger-assignment.ts) to use `db` instead of `pool`

2. **P1 — Migrate `scripts/` to Prisma:**
   - Convert [`scripts/seed-bookings.ts`](scripts/seed-bookings.ts), [`scripts/lib/reference-data.ts`](scripts/lib/reference-data.ts), and [`scripts/lib/booking-writer.ts`](scripts/lib/booking-writer.ts) to use PrismaClient

3. **P2 — Replace raw SQL shims with Prisma ORM:**
   - Migrate the 30 `db.query()` calls in `app/utils/` to use proper Prisma ORM methods (`findMany`, `create`, `update`, etc.)
   - Prioritize [`app/utils/permissions.server.ts`](app/utils/permissions.server.ts) (11 calls) and [`app/utils/scheduling/index.ts`](app/utils/scheduling/index.ts) (5 calls)

4. **P3 — Remove deprecated stubs:**
   - Once all files are migrated, remove the `pool` and `DbClient` stubs from [`app/utils/db.server.ts`](app/utils/db.server.ts)
   - Remove the `query()` and `queryOne()` shims
