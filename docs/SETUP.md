# Setup Guide

> **FIGAS — Falkland Islands Government Air Service**  
> Booking & Flight Operations Management System

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Quick Start](#2-quick-start)
3. [Environment Configuration](#3-environment-configuration)
4. [Database Setup](#4-database-setup)
5. [Development Workflow](#5-development-workflow)
6. [Testing](#6-testing)
7. [Production Build](#7-production-build)
8. [Deployment](#8-deployment)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Prerequisites

| Dependency | Version | Purpose |
|---|---|---|
| **Node.js** | `>= 20.0.0` | Runtime (see [`.nvmrc`](/.nvmrc)) |
| **npm** | `>= 9.x` | Package manager |
| **PostgreSQL** | `>= 16` | Primary database |
| **Stripe Account** | — | Payment processing (test mode for development) |
| **Render Account** | — | Hosting & deployment (optional for local dev) |

Verify your Node.js version:

```bash
node --version   # Must be >= 20.0.0
npm --version    # Must be >= 9.x
```

---

## 2. Quick Start

```bash
# 1. Clone the repository
git clone <repository-url>
cd FIGAS-remix-II

# 2. Install dependencies
npm install

# 3. Copy environment variables
cp .env.example .env

# 4. Edit .env with your credentials (see §3)
#    DATABASE_URL=postgresql://user:password@host:5432/figas

# 5. Create the database
createdb figas

# 6. Run migrations, seed data, and configure PBAC (one command)
npm run setup

# 7. Start the development server
npm run dev
```

The application will be available at [`http://localhost:5173`](http://localhost:5173).

---

## 3. Environment Configuration

### 3.1 Environment Variables

Copy [`.env.example`](/.env.example) to `.env` and configure the following:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | **Yes** | PostgreSQL connection string (see §3.2) |
| `SESSION_SECRET` | **Yes\*** | Session encryption secret (required in production; `"dev-fallback-*"` used in development) |
| `CSRF_SECRET` | **Yes\*** | CSRF token secret (required in production; falls back to `SESSION_SECRET` in dev) |
| `STRIPE_SECRET_KEY` | **Yes** | Stripe secret key (test mode for development) |
| `STRIPE_WEBHOOK_SECRET` | **Yes** | Stripe webhook signing secret |
| `STRIPE_API_VERSION` | No | Stripe API version (default: `"2026-04-22.dahlia"`) |
| `APP_URL` | No | Application base URL for email links (default: `http://localhost:5173`) |
| `CONTACT_EMAIL` | No | Contact email shown in print templates (default: `ops@figas.gov.fk`) |
| `CONTACT_PHONE` | No | Contact phone shown in print templates (default: `+500 27219`) |
| `SYSTEM_EMAIL` | No | Sender email for system notifications (default: `system@figas.gov.fk`) |
| `NODE_ENV` | No | Environment mode: `development`, `production`, `test` (default: `development`) |

\* Required for production deployments only. Development uses auto-generated fallback keys.

### 3.2 Database Connection String Format

```
postgresql://<user>:<password>@<host>:<port>/<database>
```

**Examples:**

- **Local PostgreSQL:** `postgresql://postgres:mysecret@localhost:5432/figas`
- **Supabase:** `postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres`

### 3.3 Stripe Configuration

1. Create a [Stripe account](https://dashboard.stripe.com/register) (or use existing)
2. Switch to **Test mode** in the Stripe dashboard
3. Copy the **Secret key** (starts with `sk_test_...`) to `STRIPE_SECRET_KEY`
4. Set up a webhook endpoint pointing to:
   - **Local:** Use [Stripe CLI](https://stripe.com/docs/stripe-cli) to forward: `stripe listen --forward-to localhost:5173/api/stripe-webhook`
   - **Production:** Point to `https://your-domain.com/api/stripe-webhook`
5. Copy the **Webhook signing secret** (`whsec_...`) to `STRIPE_WEBHOOK_SECRET`

---

## 4. Database Setup

### 4.1 Create the Database

```bash
# Using createdb (PostgreSQL client)
createdb figas

# Or via psql
psql -U postgres -c "CREATE DATABASE figas;"
```

### 4.2 Run Migrations

The system uses a custom migration runner at [`app/utils/migrate.ts`](../app/utils/migrate.ts). It applies SQL files from [`migrations/consolidated/`](../migrations/consolidated/), tracked via a `_migrations` table.

```bash
# Run all pending migrations
npm run migrate
```

**What this does:**
1. Creates the `_migrations` tracking table (if not exists)
2. Reads all `.sql` files from `migrations/consolidated/` (sorted by filename)
3. Applies only unapplied migrations, each in its own transaction
4. Records each successful migration in `_migrations`

**Applied migrations (`migrations/consolidated/`):**

| # | File | Purpose |
|---|---|---|
| 001 | [`001-core-schema.sql`](../migrations/consolidated/001-core-schema.sql) | Core schema: users, bookings, booking_legs, booking_passengers, junction table, flights, manifests, payments |
| 002 | [`002-reference-data.sql`](../migrations/consolidated/002-reference-data.sql) | Reference tables: aerodromes, aircraft, pilots, fare_routes, distances, headings |
| 003 | [`003-finance.sql`](../migrations/consolidated/003-finance.sql) | Invoices, accounting journal, payment methods, stripe payments, bank transactions, export log |
| 004 | [`004-scheduling.sql`](../migrations/consolidated/004-scheduling.sql) | Schedules, flight_legs, weight_balance_snapshots, pilot_assignments |
| 005 | [`005-pbac.sql`](../migrations/consolidated/005-pbac.sql) | PBAC: roles, permissions, role_permissions, user_roles, audit_log |
| 006 | [`006-no-fly.sql`](../migrations/consolidated/006-no-fly.sql) | No-fly rules and dates |
| 007 | [`007-triggers-and-functions.sql`](../migrations/consolidated/007-triggers-and-functions.sql) | Triggers and helper functions |

> The original per-feature migrations (`001`–`019`) are preserved for reference under [`migrations/archive/`](../migrations/archive/). Later feature migrations (`008-system-settings.sql` … `018-freight.sql`) and one-off `fix-*.sql` scripts live at the top of [`migrations/`](../migrations/) and are applied by dedicated scripts under [`scripts/`](../scripts/).

### 4.3 Provision the database (schema + data) — one command

Provisioning is **amalgamated** into a single, idempotent, order‑correct command so there is never a state where required reference data is absent:

```bash
npm run bootstrap
```

`bootstrap` runs, in order:
1. `prisma db push` — sync the schema from `prisma/schema.prisma`.
2. `seed:comprehensive` — all **required reference data** (aerodromes with the canonical `STY` code, `aerodrome_distances`, `aerodrome_headings`, aircraft, fuel rules, fare routes, users, pilots, no‑fly rules) **plus** demo bookings/flights/financials.
3. `seed:pbac` + `seed:pbac:assign` — roles/permissions and their assignment to the seeded users.

The comprehensive seeder ends with a **required‑data integrity gate**: if any table the app cannot function without (aerodromes, distances, headings, aircraft, fuel rules, fares, users, or STY routing) is empty, the seed **fails loudly** rather than leaving a silently‑broken deployment. Every insert is `ON CONFLICT`‑guarded, so `bootstrap` is safe to re‑run.

> `npm run setup` is an alias for `npm run bootstrap`. For a clean rebuild (drops all data), run `npx prisma db push --force-reset` first, then `npm run bootstrap`.

The seed loads data from CSV files in the [`data/`](../data/) directory:
- [`data/aerodromes.csv`](../data/aerodromes.csv) — Airport/airstrip reference data
- [`data/aircraft.csv`](../data/aircraft.csv) — Aircraft fleet information
- [`data/pilots.csv`](../data/pilots.csv) — Pilot records
- [`data/distance.csv`](../data/distance.csv) — Inter-aerodrome distances
- [`data/heading.csv`](../data/heading.csv) — Inter-aerodrome headings
- [`data/fuel.csv`](../data/fuel.csv) — Fuel pricing and availability
- [`data/airframe_hours.csv`](../data/airframe_hours.csv) — Airframe hour tracking

### 4.4 Reset Database

To reset and re-run all migrations from scratch:

```bash
# Drop and recreate the database
psql -U postgres -c "DROP DATABASE figas;"
psql -U postgres -c "CREATE DATABASE figas;"

# Re-run all migrations
npm run migrate

# Re-seed data
npm run seed:full
```

---

## 5. Development Workflow

### 5.1 Start Development Server

```bash
npm run dev
```

This starts the [Vite](https://vitejs.dev/) dev server with HMR (Hot Module Replacement) on [`http://localhost:5173`](http://localhost:5173). The server auto-restarts on file changes.

### 5.2 Project Scripts

| Script | Command | Description |
|---|---|---|
| `dev` | `npm run dev` | Start Vite dev server with HMR |
| `build` | `npm run build` | Production build (server + client) |
| `start` | `npm run start` | Start production server (after build) |
| `typecheck` | `npm run typecheck` | Run TypeScript type checking (`tsc`) |
| `lint` | `npm run lint` | Run ESLint |
| `migrate` | `npm run migrate` | Apply pending migrations |
| `setup` | `npm run setup` | Alias for `bootstrap` |
| `bootstrap` | `npm run bootstrap` | Atomic provisioning: db push + comprehensive seed + PBAC (idempotent, integrity‑gated) |
| `test` | `npm test` | Vitest unit + integration tests |
| `test:e2e` | `npm run test:e2e` | Playwright end-to-end tests |
| `test:related` | `npm run test:related` | Only suites affected by changed files |

### 5.3 Development Database Workflow

When making schema changes during development:

1. **Create a new migration file** in [`migrations/`](../migrations/) (a numbered feature migration or a `fix-*.sql` script)
2. **Write the SQL** for your schema changes
3. **Apply it** (`npm run migrate` for `consolidated/`, or a dedicated `scripts/apply-*.ts` for top-level feature/fix migrations)
4. **Update repositories** in [`app/utils/repositories/`](../app/utils/repositories/) if needed
5. **Regenerate the Prisma client** if the schema changed (`npx prisma generate`) and update TypeScript interfaces

### 5.4 Code Quality

```bash
# Type checking
npm run typecheck

# Run linter
npm run lint
```

### 5.5 Stripe Webhook Testing (Local)

```bash
# Install Stripe CLI (if not already installed)
# https://stripe.com/docs/stripe-cli

# Forward webhooks to local dev server
stripe listen --forward-to localhost:5173/api/stripe-webhook

# Trigger test events
stripe trigger payment_intent.succeeded
```

---

## 6. Testing

### 6.1 Automated Tests

The project uses **Vitest** (unit/integration/smoke) and **Playwright** (end-to-end). Suites live under [`tests/`](../tests/) with shared fixtures in [`tests/fixtures/`](../tests/fixtures/).

```bash
npm test                  # Vitest unit + integration
npm run test:unit         # tests/unit
npm run test:integration  # tests/integration
npm run test:smoke        # tests/smoke
npm run test:e2e          # Playwright e2e (tests/e2e)
npm run test:e2e:ui       # Playwright UI mode
npm run test:related      # Only suites affected by changed files
npm run test:all          # Vitest + Playwright
```

Playwright configuration is in [`playwright.config.ts`](../playwright.config.ts); Vitest configuration is in [`vitest.config.ts`](../vitest.config.ts). CI runs these via the workflows in [`.github/workflows/`](../.github/workflows/).

### 6.2 Manual Testing

The application can also be tested manually by:

1. **Creating a booking** at `/bookings/new` (public) or `/operations/bookings/new` (operations)
2. **Processing check-in** at `/checkin/counter`
3. **Building a schedule** via the scheduling pipeline (see [`WORKFLOWS.md`](./WORKFLOWS.md#3-flight-scheduling-pipeline))
4. **Processing payments** via Stripe test mode (use card number `4242 4242 4242 4242`)
5. **Generating invoices** via the finance module at `/finance/invoices`

### 6.3 Test Cards (Stripe)

| Card Number | Result |
|---|---|
| `4242 4242 4242 4242` | Success |
| `4000 0000 0000 0002` | Decline |
| `4000 0025 0000 3155` | Requires 3D Secure |

---

## 7. Production Build

### 7.1 Build

```bash
npm run build
```

This produces two output directories:

| Directory | Contents |
|---|---|
| `build/server/` | Server-side Remix bundle (Node.js) |
| `build/client/` | Static client assets (HTML, CSS, JS) |

### 7.2 Production Server

```bash
npm run start
```

This runs the Remix production server using `@remix-run/serve`, serving the built application on `process.env.PORT` (default `3000`).

### 7.3 Environment Variables for Production

Ensure the following are set in your production environment:

```bash
# Required
DATABASE_URL=postgresql://user:password@host:5432/figas
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Required in production (see .env.example)
SESSION_SECRET=your-session-secret   # Session cookie encryption
CSRF_SECRET=your-csrf-secret          # CSRF token signing
```

> **Security Note:** Never commit `.env` files or expose secrets. Use your hosting provider's environment variable management (e.g., Render Environment Variables).

---

## 8. Deployment

### 8.1 Render Deployment

The project is configured for **Render** as a persistent Node web service via [`render.yaml`](../render.yaml). A long-running process is used because the app relies on a Server-Sent Events endpoint (`app/routes/api.schedule-events.ts`) and a per-process Prisma connection pool.

The blueprint provisions a managed PostgreSQL 16 database and a web service with:

```yaml
buildCommand: npm ci && npm run build   # postinstall runs `prisma generate`
preDeployCommand: npm run migrate       # applies migrations before go-live
startCommand: npm run start             # remix-serve on $PORT
healthCheckPath: /login
```

**Steps:**

1. Push your repository to GitHub/GitLab.
2. In the Render Dashboard → **New** → **Blueprint**, and select your repository.
3. Render reads `render.yaml`, creating the database and web service.
4. Set the secret env vars marked `sync: false` (Stripe keys, SMTP credentials, `APP_URL`) in the service's **Environment** tab.
5. Deploy. `DATABASE_URL` is wired from the managed database automatically; `SESSION_SECRET` / `CSRF_SECRET` are auto-generated.

> **Migrations:** `preDeployCommand` requires a paid instance type. On the free tier, run `npm run migrate` from a one-off Render Job or the shell instead.

**Key env vars (see `render.yaml` for the full list):**

| Variable | Source |
|---|---|
| `DATABASE_URL` | Wired from the managed Render PostgreSQL database |
| `SESSION_SECRET` / `CSRF_SECRET` | Auto-generated by Render |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Set in dashboard (`sk_live_...`) |
| `APP_URL` | Deployed service URL (e.g. `https://figas.onrender.com`) |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Set in dashboard |

> **Portability:** the standard Remix Node build (`build/server/index.js`) runs on any Node host; only `render.yaml` is Render-specific.

### 8.2 Managed PostgreSQL

`render.yaml` provisions a Render PostgreSQL database and injects its connection string as `DATABASE_URL`. To use an external database (e.g. Supabase) instead, remove the `databases:` block and set `DATABASE_URL` manually:

1. Create a [Supabase](https://supabase.com) project.
2. Navigate to **Project Settings** → **Database** → **Connection string**.
3. Copy the URI and set it as `DATABASE_URL`.

### 8.3 Stripe Webhook (Production)

1. In Stripe Dashboard → **Developers** → **Webhooks** → **Add endpoint**
2. Set endpoint URL to `https://your-domain.com/api/stripe-webhook`
3. Select events to listen for:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
4. Copy the **Signing secret** and set as `STRIPE_WEBHOOK_SECRET`

---

## 9. Troubleshooting

### 9.1 Database Connection Issues

```bash
# Test the connection
psql "$DATABASE_URL" -c "SELECT 1;"

# Check if PostgreSQL is running
pg_isready

# Verify migration status
psql "$DATABASE_URL" -c "SELECT filename, applied_at FROM _migrations ORDER BY filename;"
```

### 9.2 Migration Errors

| Symptom | Likely Cause | Solution |
|---|---|---|
| `relation "_migrations" does not exist` | First run | Run `npm run migrate` — the table is auto-created |
| `relation "X" already exists` | Partial migration | Check `_migrations` table; manually mark as applied or re-run from clean DB |
| `column "X" of relation "Y" does not exist` | Outdated migration | Ensure all migrations are applied in order |
| Migration fails mid-way | SQL error in migration | Fix the SQL, drop and recreate the database, re-run |

### 9.3 Stripe Issues

```bash
# Verify Stripe key is set
echo $STRIPE_SECRET_KEY

# Test Stripe connectivity
curl https://api.stripe.com/v1/charges \
  -u "$STRIPE_SECRET_KEY:" \
  -H "Stripe-Version: 2026-04-22.dahlia"

# Check webhook forwarding (local dev)
stripe listen --forward-to localhost:5173/api/stripe-webhook
```

### 9.4 Build Errors

```bash
# Clear caches and rebuild
rm -rf build/ .cache/
npm run build

# Check TypeScript errors
npx tsc --noEmit

# Verify Node.js version
node --version  # Must be >= 20.0.0
```

### 9.5 Port Conflicts

If port `5173` is already in use:

```bash
# Kill the process on that port (Windows)
netstat -ano | findstr :5173
taskkill /PID <PID> /F

# Or specify a different port
npx vite --port 3000
```

---

## Appendix A: File Reference

| File | Purpose |
|---|---|
| [`package.json`](../package.json) | Dependencies, scripts, Node version requirements |
| [`.env.example`](/.env.example) | Environment variable template |
| [`render.yaml`](../render.yaml) | Render deployment blueprint |
| [`postcss.config.js`](../postcss.config.js) | PostCSS configuration (Tailwind CSS v4) |
| [`.nvmrc`](/.nvmrc) | Node version manager config |
| [`app/utils/migrate.ts`](../app/utils/migrate.ts) | Database migration runner |
| [`app/utils/seed.ts`](../app/utils/seed.ts) | Reference data seeder |
| [`app/utils/db.server.ts`](../app/utils/db.server.ts) | Database connection pool |

## Appendix B: Quick Commands Reference

```bash
# Development
npm install          # Install dependencies
npm run dev          # Start dev server (localhost:5173)
npx tsc --noEmit     # Type check

# Database
npm run migrate                # Run migrations
npm run seed:full              # Seed reference + demo data

# Production
npm run build        # Build for production
npm run start        # Start production server

# Deployment
git push             # Auto-deploy via Render (autoDeploy)
```
