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
| **Netlify Account** | — | Hosting & deployment (optional for local dev) |

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
#    SUPABASE_DATABASE_URL=postgresql://user:password@host:5432/figas

# 5. Create the database
createdb figas

# 6. Run database migrations
npx tsx app/utils/migrate.ts

# 7. Seed reference data (optional)
npx tsx app/utils/seed.ts

# 8. Start the development server
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

The system uses a custom migration runner at [`app/utils/migrate.ts`](../app/utils/migrate.ts). Migrations are SQL files in the [`migrations/`](../migrations/) directory, tracked via a `_migrations` table.

```bash
# Run all pending migrations
npx tsx app/utils/migrate.ts
```

**What this does:**
1. Creates the `_migrations` tracking table (if not exists)
2. Reads all `.sql` files from `migrations/` directory (sorted by filename)
3. Applies only unapplied migrations, each in its own transaction
4. Records each successful migration in `_migrations`

**Migration order (16 files):**

| # | File | Purpose |
|---|---|---|
| 001 | [`001_create_tables.sql`](../migrations/001_create_tables.sql) | Core schema: users, aerodromes, aircraft, bookings, passengers, etc. |
| 002 | [`002_add_missing_columns.sql`](../migrations/002_add_missing_columns.sql) | Missing columns and constraints |
| 003 | [`003_create_reference_tables.sql`](../migrations/003_create_reference_tables.sql) | Reference data tables |
| 004 | [`004_add_timestamps_to_reference_tables.sql`](../migrations/004_add_timestamps_to_reference_tables.sql) | Timestamps on reference tables |
| 005 | [`005_add_booking_source_and_cancellation.sql`](../migrations/005_add_booking_source_and_cancellation.sql) | Booking source, cancellation support |
| 006 | [`006_create_payment_methods.sql`](../migrations/006_create_payment_methods.sql) | Payment methods reference table |
| 007 | [`007_create_invoices.sql`](../migrations/007_create_invoices.sql) | Invoices and invoice_items |
| 008 | [`008_create_accounting_journal.sql`](../migrations/008_create_accounting_journal.sql) | Chart of accounts, journal entries, journal lines |
| 009 | [`009_create_payment_reminders.sql`](../migrations/009_create_payment_reminders.sql) | Payment reminder scheduling |
| 010 | [`010_create_stripe_payments.sql`](../migrations/010_create_stripe_payments.sql) | Stripe payment tracking |
| 011 | [`011_create_bank_transactions.sql`](../migrations/011_create_bank_transactions.sql) | Bank transaction records |
| 012 | [`012_create_export_log.sql`](../migrations/012_create_export_log.sql) | Export audit log |
| 013 | [`013_enhance_existing_tables.sql`](../migrations/013_enhance_existing_tables.sql) | Table enhancements |
| 014 | [`014_create_scheduling_tables.sql`](../migrations/014_create_scheduling_tables.sql) | Schedules, flight_legs, weight_balance, pilot_assignments |
| 015 | [`015_create_rbac_tables.sql`](../migrations/015_create_rbac_tables.sql) | Roles, permissions, role_permissions, user_roles, audit_log |
| 016 | [`016_create_booking_leg_passengers.sql`](../migrations/016_create_booking_leg_passengers.sql) | Junction table, schema rename (passengers → booking_passengers) |

### 4.3 Seed Reference Data

```bash
# Load reference data (aerodromes, aircraft, pilots, fare routes, etc.)
npx tsx app/utils/seed.ts
```

The seed script loads data from CSV files in the [`data/`](../data/) directory:
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
npx tsx app/utils/migrate.ts

# Re-seed data
npx tsx app/utils/seed.ts
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
| `typecheck` | `npx tsc --noEmit` | Run TypeScript type checking |
| `lint` | `npx eslint .` | Run ESLint (if configured) |

### 5.3 Development Database Workflow

When making schema changes during development:

1. **Create a new migration file** in [`migrations/`](../migrations/) with the next sequential number (e.g., `017_add_new_feature.sql`)
2. **Write the SQL** for your schema changes
3. **Run the migration:** `npx tsx app/utils/migrate.ts`
4. **Update repositories** in [`app/utils/repositories/`](../app/utils/repositories/) if needed
5. **Update TypeScript interfaces** to match new columns

### 5.4 Code Quality

```bash
# Type checking
npx tsc --noEmit

# Run linter
npx eslint app/ --ext .ts,.tsx
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

### 6.1 Manual Testing

The application can be tested manually by:

1. **Creating a booking** at `/bookings/new` (public) or `/operations/bookings/new` (operations)
2. **Processing check-in** at `/checkin/counter`
3. **Building a schedule** via the scheduling pipeline (see [`WORKFLOWS.md`](./WORKFLOWS.md#3-flight-scheduling-pipeline))
4. **Processing payments** via Stripe test mode (use card number `4242 4242 4242 4242`)
5. **Generating invoices** via the finance module at `/finance/invoices`

### 6.2 Test Cards (Stripe)

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
SUPABASE_DATABASE_URL=postgresql://user:password@host:5432/figas
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Optional
SUPABASE_ANON_KEY=eyJ...  # Only if using Supabase Auth
SESSION_SECRET=your-secret-key  # For session encryption
```

> **Security Note:** Never commit `.env` files or expose secrets. Use your hosting provider's environment variable management (e.g., Netlify Environment Variables).

---

## 8. Deployment

### 8.1 Netlify Deployment

The project is configured for Netlify deployment via [`netlify.toml`](../netlify.toml):

```toml
[build]
  command = "npm run build"
  publish = "build/client"

[dev]
  command = "npm run dev"
  port = 5173
```

**Steps:**

1. Push your repository to GitHub/GitLab
2. In Netlify Dashboard → **Add new site** → **Import from Git**
3. Select your repository
4. Netlify auto-detects the build settings from `netlify.toml`
5. Add environment variables in **Site settings** → **Environment variables**
6. Deploy

**Required Netlify Environment Variables:**

| Variable | Value |
|---|---|
| `SUPABASE_DATABASE_URL` | Production PostgreSQL connection string |
| `STRIPE_SECRET_KEY` | Production Stripe secret key (`sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Production webhook secret |

### 8.2 Supabase Integration (Optional)

If using Supabase for database hosting:

1. Create a [Supabase](https://supabase.com) project
2. Navigate to **Project Settings** → **Database** → **Connection string**
3. Copy the URI and set as `SUPABASE_DATABASE_URL`
4. (Optional) Enable Supabase Auth and set `SUPABASE_ANON_KEY`

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
psql "$SUPABASE_DATABASE_URL" -c "SELECT 1;"

# Check if PostgreSQL is running
pg_isready

# Verify migration status
psql "$SUPABASE_DATABASE_URL" -c "SELECT name, applied_at FROM _migrations ORDER BY name;"
```

### 9.2 Migration Errors

| Symptom | Likely Cause | Solution |
|---|---|---|
| `relation "_migrations" does not exist` | First run | Run `npx tsx app/utils/migrate.ts` — the table is auto-created |
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
| [`netlify.toml`](../netlify.toml) | Netlify deployment configuration |
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
npx tsx app/utils/migrate.ts   # Run migrations
npx tsx app/utils/seed.ts      # Seed reference data

# Production
npm run build        # Build for production
npm run start        # Start production server

# Deployment
git push             # Auto-deploy via Netlify CI
```
