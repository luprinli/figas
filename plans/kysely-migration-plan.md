# FIGAS Kysely Migration — Technical Implementation Plan

> **Decision:** Migrate all runtime database access from PrismaClient + raw SQL to **Kysely** (type‑safe query builder over `pg`), while retaining the Prisma **CLI** for schema management (`schema.prisma` + `db push`) as the single source of truth.  
> **Status:** Proposed — not yet implemented.  
> **Priority:** Best practice over convenience. This is a structural shift; the plan is written to be auditable, testable at each phase, and correct before fast.

---

## 1. Architecture Boundary — what stays, what goes, what replaces what

### Stays (Prisma CLI — schema management)
- **`prisma/schema.prisma`** — remains the **single source of truth** for all table definitions, column types, constraints, indexes, and enum types.
- **`prisma db push`** (and `npx prisma db push --force-reset`) — remains the schema provisioning tool for development, CI, and Render. No migration runner needed.
- **`prisma validate`** — schema linting.
- **`prisma generate`** — retained, but its output (`generated/prisma/`) is **no longer imported at runtime**. It is kept only for the Prisma CLI to operate (the `prisma db push` command reads `schema.prisma` directly and does not depend on the generated client).

### Removed (Prisma runtime — the query engine)
- **`@prisma/client`** — the generated PrismaClient. All runtime imports of `../../generated/prisma/client` are removed.
- **`@prisma/adapter-pg`** — the PostgreSQL adapter that wires PrismaClient to a `pg` pool. Replaced by Kysely's native `pg` driver integration.
- **`prisma.$queryRawUnsafe()` / `prisma.$executeRawUnsafe()`** — every raw‑SQL string is replaced by a Kysely query builder expression.
- **`prisma.model.create/findMany/update/delete()`** — the 29 Prisma model‑API call sites are replaced by Kysely equivalents.
- **`prisma.$transaction()`** — replaced by `db.transaction().execute(async (trx) => …)`.

### Replaced by (Kysely runtime)
- **`kysely`** (v0.27+) — type‑safe SQL query builder.
- **`pg`** (already a transitive dependency; promoted to explicit production dependency) — native PostgreSQL driver. Kysely connects to `pg.Pool` directly.
- **A generated `Database` type** — produced by a script that reads `schema.prisma` and emits the Kysely `Database` interface (tables, columns, column types, `@map` table/column renames). This script runs at build time (or as a `postinstall` alongside `prisma validate`).

### The new `db.server.ts` singleton

```
app/utils/db.server.ts

  import { Kysely, PostgresDialect } from "kysely";
  import { Pool } from "pg";
  import type { DB } from "../../generated/kysely/database";

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

  export const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
```

That's it. ~15 lines. No shims, no `query()`/`queryOne()` wrappers, no `globalThis` singleton cache (Kysely is stateless; the pool handles connection reuse). The `DB` type is the generated schema interface. Every caller that currently does `db.query("SELECT …")` or `db.$queryRawUnsafe(…)` becomes a Kysely query builder chain like:

```ts
const rows = await db
  .selectFrom("aircraft")
  .select(["registration", "max_takeoff_weight_kg"])
  .where("is_active", "=", true)
  .execute();
```

All column names, table names, and WHERE clause types are **compile‑time checked**.

---

## 2. Type generation — `schema.prisma` → Kysely `Database`

**Strategy**: a standalone script that reads `prisma/schema.prisma` (no runtime DB dependency) and emits `generated/kysely/database.ts`. Run via `prisma generate --generator kysely` (a custom generator, see [prisma-generator-kysely](https://github.com/valtyr/prisma-generator-kysely)) *or* via a hand‑rolled script if the generator does not cover our schema features.

### Recommended: custom generator (`prisma-generator-kysely`)
Add to `prisma/schema.prisma`:

```prisma
generator kysely {
  provider = "prisma-generator-kysely"
  output   = "../../generated/kysely"
  runtime  = "kysely"
}
```

`prisma generate` then produces `generated/kysely/database.ts` with a `DB` interface containing one entry per `model` / `@@map`, with column names from the Prisma field names (not `@map` renames — the generator typically uses the Prisma field names, which is correct for Kysely's compile‑time checking). The `postinstall` script already runs `prisma generate`, so the Kysely types are regenerated on every `npm ci` / `npm install`.

### Fallback: hand‑rolled parser
If the community generator does not support the Prisma 7 `prisma-client` provider (the new engine), write a script `scripts/generate-kysely-types.ts` that parses `schema.prisma` with `@mrleebo/prisma-ast` and emits the `Database` interface. ~200 lines. Run it as `npm run db:types` before `tsc`.

---

## 3. How Kysely queries replace every Prisma / raw‑SQL pattern

### 3.1 Simple SELECT (replaces `db.query` / `$queryRawUnsafe`)

**Old (raw SQL):**
```ts
const flights = await db.query(
  `SELECT f.id, f.flight_number, ao.code AS origin_code
   FROM flights f
   JOIN aerodromes ao ON ao.id = f.origin_aerodrome_id
   WHERE f.schedule_id = $1
   ORDER BY f.flight_number`,
  [scheduleId]
);
```

**New (Kysely):**
```ts
const flights = await db
  .selectFrom("flights as f")
  .innerJoin("aerodromes as ao", "ao.id", "f.origin_aerodrome_id")
  .select(["f.id", "f.flight_number", "ao.code as origin_code"])
  .where("f.schedule_id", "=", scheduleId)
  .orderBy("f.flight_number")
  .execute();
```

- The type of `flights` is `Pick<Flights, "id" | "flight_number"> & { origin_code: string }[]` — **compile‑time checked**.
- `scheduleId` is parameterised, no injection risk.

### 3.2 INSERT (replaces `$executeRawUnsafe`)

**Old:**
```ts
await db.$executeRawUnsafe(
  `INSERT INTO aerodrome_distances (origin_code, destination_code, distance_nm)
   VALUES ($1, $2, $3) ON CONFLICT (origin_code, destination_code) DO NOTHING`,
  origin, dest, distance
);
```

**New:**
```ts
await db
  .insertInto("aerodrome_distances")
  .values({ origin_code: origin, destination_code: dest, distance_nm: distance })
  .onConflict((oc) => oc.columns(["origin_code", "destination_code"]).doNothing())
  .execute();
```

### 3.3 UPDATE

**Old:**
```ts
await db.$executeRawUnsafe(
  `UPDATE flights SET aircraft_id = $1, updated_at = NOW() WHERE id = $2`,
  aircraftId, flightId
);
```

**New:**
```ts
await db
  .updateTable("flights")
  .set({ aircraft_id: aircraftId, updated_at: sql`NOW()` })
  .where("id", "=", flightId)
  .execute();
```

### 3.4 DELETE

**Old:**
```ts
await db.$executeRawUnsafe("DELETE FROM flight_legs WHERE flight_id = $1", flightId);
```

**New:**
```ts
await db.deleteFrom("flight_legs").where("flight_id", "=", flightId).execute();
```

### 3.5 Complex query with LATERAL / window functions

Kysely supports the full PostgreSQL dialect, including lateral joins, window functions, CTEs, and `json_build_object`. Where the syntax is not directly in the query builder, Kysely provides `sql<Type>` tagged template literals as an escape hatch — **still typed**:

```ts
const result = await db
  .selectFrom("flights as f")
  .select(sql<{ total: number }>`COUNT(*) OVER ()`.as("total"))
  .execute();
```

This is the Kysely equivalent of `$queryRawUnsafe` but with **typed output**.

### 3.6 Transactions (replaces `withTransaction` / `$transaction`)

**Old (`withTransaction` wrapper):**
```ts
import { withTransaction } from "../../utils/repositories/transaction";
await withTransaction(async (tx) => {
  await bookingLegRepository.assignFlight(blId, flightId, tx);
  await bookingLegRepository.updateStatus(blId, BookingStatus.FLIGHT_ASSIGNED, tx);
});
```

**New (Kysely native):**
```ts
await db.transaction().execute(async (trx) => {
  await bookingLegRepository.assignFlight(blId, flightId, trx);
  await bookingLegRepository.updateStatus(blId, BookingStatus.FLIGHT_ASSIGNED, trx);
});
```

Repository methods that accept an optional transaction client change their signature from `Prisma.TransactionClient` to `Kysely<DB>`:

```ts
// Old
async function assignFlight(legId: number, flightId: number, client?: Prisma.TransactionClient)

// New
async function assignFlight(legId: number, flightId: number, trx?: Kysely<DB>)
```

The `trx` parameter is the same `Kysely<DB>` type as `db` — callers pass `trx` or omit it to use the default singleton.

---

## 4. Migration phases (ordered, testable at each boundary)

### Phase A — Setup (1 file, no codebase changes)  
**Risk: zero**

1. Install `kysely` + `pg` (promoted to explicit dep). Optionally install `prisma-generator-kysely`.
2. Add the Kysely generator block to `schema.prisma`.
3. Run `prisma generate` — verify `generated/kysely/database.ts` is produced with all 62 tables.
4. Create `generated/kysely/.gitignore` containing `*` (types are generated at build time; not committed).

**Gate:** `generated/kysely/database.ts` exists and exports `DB` with a key for every `model`/`@@map` in the schema.

### Phase B — Kysely db singleton + dual‑connection compat (2 files)  
**Risk: low (two connections during transition)**

1. Create `app/utils/db.server.kysely.ts` — the Kysely singleton (pg Pool + Kysely).  
   Note: Kysely needs `DATABASE_URL`. Exported as `kdb` (or `ky` as prefix) to avoid collision with the Prisma `db`.
2. Confirm the Kysely singleton connects (no‑op query at import or on first use).
3. Migrate **one repository** as a proof‑of‑concept — preferably a small, read‑only CRUD repository like `app/utils/repositories/aerodrome.ts` (6 methods, simple SELECTs). Both Prisma `db` and Kysely `kdb` are available during transition.

**Gate:** the migrated repository's methods return identical data shapes to the Prisma version. A diff‑test in the integration suite catches any divergence.

### Phase C — Repository bulk migration (28 repositories, ~155 query sites)  
**Risk: medium — contained within repositories**

Migrate every repository from Prisma raw SQL / model API to Kysely. The migration is **mechanical**:

1. Replace `db.query("SELECT …")` → Kysely `selectFrom(…).select(…).execute()` chains.
2. Replace `db.$executeRawUnsafe("INSERT …")` → `insertInto(…).values(…).execute()`.
3. Replace `db.$executeRawUnsafe("UPDATE …")` → `updateTable(…).set(…).where(…).execute()`.
4. Replace `Prisma.TransactionClient` → `Kysely<DB>` in parameter types.
5. Replace `withTransaction(fn)` → `db.transaction().execute(fn)` or `kdb.transaction().execute(fn)`.

For complex queries (LATERAL, recursive CTEs, JSON aggregates), use Kysely's `sql<Type>` escape hatch — SQL stays the same string but gets a typed return value. This is the pragmatic boundary where "best practice" meets "the query is what the query is."

**Per‑repository gate:** the repository's integration test passes (same data shapes, same behaviour). Do not proceed to the next repository until the current one is green.

### Phase D — Route loaders & scheduling pipeline (15 route files + scheduling utilities)  
**Risk: medium — touches both data and display**

Convert remaining raw‑SQL call sites in route loaders, `schedule-handlers.server.ts`, and the scheduling pipeline (`index.ts`, `cluster-bookings.ts`, `weight-balance.ts`, `assign-aircraft.ts`, etc.). By Phase C all repositories use Kysely, so these callers get the type‑safe result shapes from repository methods rather than `Record<string,unknown>` casts.

Route loaders that currently have inline SQL (the two `$scheduleId` routes, `wb-data.ts`, `pilot.briefing.$flightId.tsx`, `checkin.counter.tsx`) migrate to repository method calls — completing Tier 1 of the SQL standardisation recommendation as a side effect.

**Gate:** load the schedule builder, auto‑build a schedule, and open a loadsheet modal — no 500 errors.

### Phase E — Remove Prisma runtime  
**Risk: low (all queries already migrated)**

1. Delete `app/utils/db.server.ts` (the original PrismaClient export).  
   ⚠️ But wait — do **not** delete the *file*. Keep the Kysely `db` export there instead of a separate file. The rational approach is: rename `db.server.kysely.ts` → overwrite `db.server.ts`. The Kysely singleton becomes the canonical `db` export. All 56 importers require zero path changes — only import type resolution.

2. Remove Prisma runtime dependencies from `package.json`:
   ```bash
   npm uninstall @prisma/client @prisma/adapter-pg
   ```
   Keep `prisma` (the CLI) as a devDependency.

3. Update `postinstall`: replace `prisma generate` with `prisma generate && npm run db:types` (or just `prisma generate` if using the Kysely generator).

4. Remove `generated/prisma/` from the `.gitignore` (now unused and no longer generated at all). Add `generated/kysely/` to `.gitignore` (regenerated on install).

5. Verify the final build — `tsc` should pass; Vite should not bundle any Prisma code.

**Gate:** the app builds and runs against a fresh `prisma db push --force-reset` seeded database, with zero PrismaClient imports anywhere in the source tree.

---

## 5. What the repository interface looks like after migration

### Example: `app/utils/repositories/flight-leg.ts` (before/after snippets)

**Before (raw SQL, untyped):**
```ts
export async function findByFlightId(flightId: number): Promise<FlightLegRow[]> {
  const result = await db.$queryRawUnsafe<FlightLegRow[]>(
    `SELECT id, flight_id, leg_sequence, origin_code, destination_code,
            distance_nm, heading, departure_time, arrival_time, status
     FROM flight_legs WHERE flight_id = $1 ORDER BY leg_sequence`,
    flightId
  );
  return result;
}
```

**After (Kysely, typed):**
```ts
import type { Kysely } from "kysely";
import type { DB } from "../../../generated/kysely/database";

export async function findByFlightId(
  flightId: number,
  trx?: Kysely<DB>
): Promise<FlightLegRow[]> {
  const qb = (trx ?? db)
    .selectFrom("flight_legs")
    .select([
      "id", "flight_id",
      "leg_number as leg_sequence",
      "origin_code", "destination_code",
      "distance_nm", "heading",
      "etd as departure_time", "eta as arrival_time",
      "status",
    ])
    .where("flight_id", "=", flightId)
    .orderBy("leg_number");

  const rows = await qb.execute();
  return rows.map((r) => ({
    id: r.id,
    flight_id: r.flight_id,
    leg_sequence: r.leg_sequence,
    origin_code: r.origin_code,
    destination_code: r.destination_code,
    distance_nm: r.distance_nm != null ? Number(r.distance_nm) : null,
    heading: r.heading != null ? Number(r.heading) : null,
    departure_time: r.departure_time,
    arrival_time: r.arrival_time,
    status: r.status,
  }));
}
```

The `AS` alias convention stays — repository interfaces (`FlightLegRow`) preserve the old names. Kysely's `.select(["leg_number as leg_sequence"])` aliases at query time. The consumer sees the same shape.

### Observations from the migration
- Kysely returns `Decimal` columns as `string` (PostgreSQL wire protocol). The `.map()` conversion to `Number()` at the repository boundary preserves backward compatibility with existing interfaces. This is a one‑time mechanical mapping step per column.
- The `trx` parameter is the same type as `db` — callers pass it or the method uses the default singleton. This is simpler than the `Prisma.TransactionClient | undefined` pattern because Kysely's `Transaction<DB>` is assignable to `Kysely<DB>` (it's a subtype).
- `sql<Type>` tagged literals handle the escape‑hatch cases (complex aggregation, window functions, PostgreSQL‑specific syntax). The output is typed, so it's still safer than `$queryRawUnsafe`.

---

## 6. Interaction surface — where Kysely replaces Prisma vs where Prisma stays

| Concern | Prisma (stays) | Kysely (replaces) |
|---------|---------------|-------------------|
| Schema source of truth | `prisma/schema.prisma` | — |
| Schema provisioning | `prisma db push` | — (reads the schema but does not create it) |
| CLI / DX | `prisma validate`, `prisma generate` | — |
| Connection pooling | — | `pg.Pool` (Kysely `PostgresDialect`) |
| Query building | — | `kysely` query builder API (`selectFrom`, `insertInto`, …) |
| Type‑safe queries | — | `Kysely<DB>` parameterised on the auto‑generated `Database` type |
| Raw SQL escape hatch | — | `sql<Type>` template literal (typed output) |
| Transactions | — | `db.transaction().execute(async (trx) => …)` |
| Row‑level type safety | — | Return types are inferred from the `select(…)` chain |
| Generated client | `prisma generate` (for CLI) | `prisma-generator-kysely` (generates the `Database` type from `schema.prisma`) |

---

## 7. Testing strategy

### Existing tests MUST pass at each phase boundary
- **Unit tests** (36 scheduling tests): run against Kysely‑backed repositories. The test database is seeded via `prisma db push` + a lightweight fixture. No test logic changes needed if repository interfaces stay identical.
- **Integration tests**: verify repository methods against the real DB. The existing pattern uses `db.$queryRawUnsafe` for test setup; those migrate to Kysely `insertInto(…).values(…).execute()` during Phase C.
- **Smoke tests**: the component‑import tests are DB‑agnostic — unaffected.
- **E2E tests** (Playwright): operate through the app, so Kysely queries are transparent.

### New tests
- **Type‑safety regression test**: a `.test-d.ts` file (vitest type tests) that asserts `db.selectFrom("aircraft").select("max_takeoff_weight_kg")` compiles and `db.selectFrom("aircraft").select("bogus_column" as any)` does not. This prevents someone from accidentally adding a `$queryRawUnsafe` regression.

---

## 8. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Kysely generator misses a model / column | Medium | Type‑safe builds fail, preventing bad deploys | Validate the generated `Database` type against `schema.prisma` line‑by‑line in `npm run db:types`. If the community generator fails, fall back to the hand‑rolled parser. |
| `Decimal` → `string` mismatch breaks arithmetic | High | Numerical errors in W&B, finance, fares | A single `mapToNumber<Row, Keys>(rows, cols)` utility consolidates the `Number()` conversion at repository boundaries. Centralised, testable. |
| Performance regression | Low | Slower queries under Kysely | Kysely emits prepared statements via `pg`. The SQL it generates is equivalent to the hand‑written version. Benchmark the CVRP solver's 3 main queries before/after to confirm. |
| Missed `$queryRawUnsafe` left behind | Medium | Silent schema drift returns | Add `"$queryRawUnsafe"` and `"$executeRawUnsafe"` to `eslint` `no-restricted-imports` / `no-restricted-syntax` after Phase E to prevent new raw SQL. |
| 126 query rewrites needed | Certain | Time‑intensive (8–12h) | Phases A–D are individual commits. Each repository is an independent unit of work. The migration is spreadable across sessions. |

---

## 9. Dependencies and package changes

```bash
# Add
npm install kysely pg                    # production: query builder + native driver (promote pg from transitive)
npm install --save-dev prisma-generator-kysely   # dev: type generation (if using the community generator)

# Remove (Phase E)
npm uninstall @prisma/client @prisma/adapter-pg  # runtime: no longer needed
```

The `prisma` CLI stays as a devDependency. `kysely` and `pg` become the only production database dependencies.

---

## 10. File inventory — what changes in each phase

| Phase | Files changed / created |
|-------|------------------------|
| A | `prisma/schema.prisma` (+ generator block), `package.json` (+ deps), `generated/kysely/` (new, gitignored) |
| B | `app/utils/db.server.ts` (rewrite to Kysely singleton, keep `db` export name), `app/utils/repositories/aerodrome.ts` (POC migration) |
| C | `app/utils/repositories/*.ts` (28 files, bulk migration) |
| D | `app/routes/*.tsx` (15 route loaders with inline SQL), `app/utils/schedule-handlers.server.ts`, `app/utils/scheduling/*.ts` (6 files), `app/utils/loadsheet/`, `app/utils/services/` |
| E | Remove `@prisma/client`, `@prisma/adapter-pg`; delete `generated/prisma/`; update `.gitignore`; ESLint rule to forbid raw SQL |

---

## 11. CI / build integration

After Phase E, `package.json` scripts are updated:

```json
{
  "postinstall": "prisma generate",
  "db:types": "prisma generate",
  "typecheck": "tsc",
  "build": "npm run db:types && remix vite:build"
}
```

- `prisma generate` now triggers **both** the Prisma CLI generator (which validates the schema) **and** the Kysely type generator (via the custom generator block in `schema.prisma`).
- `tsc` picks up `generated/kysely/database.ts` and type‑checks all Kysely queries.
- Render's build command is unchanged: `npm ci --include=dev && npm run build` → `postinstall` runs first → types are generated → queries are checked.

---
