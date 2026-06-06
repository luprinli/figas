# FIGAS Flight Operations & Booking Management System

[![Remix](https://img.shields.io/badge/Remix-2.15-121212?logo=remix)](https://remix.run)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.1-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql)](https://www.postgresql.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss)](https://tailwindcss.com/)
[![Stripe](https://img.shields.io/badge/Stripe-22.1-008CDD?logo=stripe)](https://stripe.com)

A comprehensive flight booking, scheduling, check-in, and operations management platform built for the **Falkland Islands Government Air Service (FIGAS)**. The system manages the entire lifecycle of passenger flight operations — from booking creation through scheduling, check-in, manifest generation, payment processing, and financial accounting.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Data Model](#data-model)
- [Setup Instructions](#setup-instructions)
- [Project Structure](#project-structure)
- [Key Workflows](#key-workflows)
- [API Overview](#api-overview)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Contributing](#contributing)

---

## Project Overview

FIGAS operates a network of scheduled and on-demand flights across the Falkland Islands, serving approximately 30 aerodromes. This system replaces manual processes with a digital platform that handles:

- **Booking Management** — Multi-leg itineraries with per-leg passenger, baggage, and freight tracking
- **Flight Scheduling** — Automated daily schedule builder using nearest-neighbor route optimization
- **Check-In Operations** — Per-leg passenger check-in with weight verification and boarding tracking
- **Payment Processing** — Stripe integration, invoicing, payment reminders, and accounting journal entries
- **Flight Manifests** — Per-leg passenger manifests with weight and balance calculations
- **Role-Based Access** — Permission-based access control (PBAC) with segregation of duties enforcement
- **Financial Accounting** — Double-entry accounting with invoice generation, payment reconciliation, and aging reports

The system serves multiple personas: passengers (self-service), booking agents, operations staff, check-in counter staff, pilots, engineers, and finance administrators.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | [Remix v2](https://remix.run) (React Router v6) | Server-side rendering, nested routes, loaders/actions |
| **Language** | [TypeScript](https://www.typescriptlang.org/) v5.1 | Type safety across the full stack |
| **Database** | [PostgreSQL](https://www.postgresql.org/) 16 | Relational data store with JSONB support |
| **Database Driver** | [`pg`](https://node-postgres.com/) v8.20 | Native PostgreSQL client |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) v4 | Utility-first CSS framework |
| **Payments** | [Stripe](https://stripe.com) v22.1 | Payment processing (Checkout Sessions, webhooks) |
| **Drag & Drop** | [`@dnd-kit`](https://dndkit.com/) v6/v10 | Schedule board drag-and-drop |
| **Auth** | Session-based (cookie) | Server-side sessions with PBAC |
| **Build** | [Vite](https://vitejs.dev/) v5 | Fast development and production builds |
| **Deployment** | [Netlify](https://www.netlify.com/) | Serverless deployment via `@netlify/remix-adapter` |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Browser (Client)                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Remix Routes  │  │  Components  │  │  Tailwind CSS (v4)       │  │
│  │ (loaders/     │  │  (DataTable, │  │  Utility classes         │  │
│  │  actions)     │  │   Sidebar,   │  │                          │  │
│  │               │  │   Booking-   │  │                          │  │
│  │               │  │   Wizard...) │  │                          │  │
│  └──────┬────────┘  └──────┬───────┘  └──────────────────────────┘  │
└─────────┼──────────────────┼────────────────────────────────────────┘
          │ HTTP (fetch)     │ React hydration
          ▼                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Remix Server (Node.js)                         │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Route Modules                              │   │
│  │  app/routes/operations.bookings.$bookingId.tsx               │   │
│  │  app/routes/checkin.counter.tsx                              │   │
│  │  app/routes/operations.schedule._index.tsx                   │   │
│  │  ... (40+ route files)                                       │   │
│  └──────────────────────┬───────────────────────────────────────┘   │
│                         │                                          │
│  ┌──────────────────────▼───────────────────────────────────────┐   │
│  │                    Services Layer                             │   │
│  │  app/utils/services/payment.service.ts                       │   │
│  │  app/utils/services/invoice.service.ts                       │   │
│  │  app/utils/services/reconciliation.service.ts                │   │
│  │  app/utils/services/reminder.service.ts                      │   │
│  │  app/utils/services/export.service.ts                        │   │
│  └──────────────────────┬───────────────────────────────────────┘   │
│                         │                                          │
│  ┌──────────────────────▼───────────────────────────────────────┐   │
│  │                 Repository Layer                              │   │
│  │  app/utils/repositories/booking.ts                           │   │
│  │  app/utils/repositories/booking-leg.ts                       │   │
│  │  app/utils/repositories/booking-passenger.ts                 │   │
│  │  app/utils/repositories/booking-leg-passenger.ts             │   │
│  │  ... (25+ repository files)                                  │   │
│  └──────────────────────┬───────────────────────────────────────┘   │
│                         │                                          │
│  ┌──────────────────────▼───────────────────────────────────────┐   │
│  │              Scheduling Pipeline                              │   │
│  │  app/utils/scheduling/index.ts (orchestrator)                │   │
│  │  app/utils/scheduling/cluster-bookings.ts                    │   │
│  │  app/utils/scheduling/nearest-neighbor.ts                    │   │
│  │  app/utils/scheduling/assign-aircraft.ts                     │   │
│  │  app/utils/scheduling/weight-balance.ts                      │   │
│  │  app/utils/scheduling/assign-pilots.ts                       │   │
│  └──────────────────────┬───────────────────────────────────────┘   │
│                         │                                          │
│  ┌──────────────────────▼───────────────────────────────────────┐   │
│  │              Database Layer (pg Pool)                         │   │
│  │  app/utils/db.server.ts → PostgreSQL                         │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Repository Pattern** — All database access is abstracted through repository modules in [`app/utils/repositories/`](app/utils/repositories/). This keeps SQL queries isolated from route handlers and enables consistent query patterns.

2. **Server-Side Rendering** — Remix handles all data fetching on the server via loaders. Forms submit to actions on the same server, providing fast initial page loads and progressive enhancement.

3. **PBAC over RBAC** — The system uses Permission-Based Access Control (PBAC) rather than simple Role-Based Access Control. Permissions are granular (`resource:action` format) and assigned to roles. Users can hold multiple roles. See [`app/utils/permissions.server.ts`](app/utils/permissions.server.ts).

4. **Junction Table for Passenger-Leg Relationship** — The [`booking_leg_passengers`](migrations/016_create_booking_leg_passengers.sql) table creates a many-to-many relationship between legs and passengers, enabling per-leg baggage, freight, check-in, seat assignment, and boarding tracking.

5. **5-Phase Scheduling Pipeline** — The daily schedule builder runs five sequential phases: cluster → route (nearest-neighbor) → aircraft assignment → weight & balance → pilot assignment. See [`app/utils/scheduling/index.ts`](app/utils/scheduling/index.ts).

6. **Double-Entry Accounting** — All financial transactions create balanced journal entries with debit/credit lines, supporting audit trails and segregation of duties.

---

## Data Model

### Core Entity Relationship

```
Booking (1) ──→ Booking Legs (many)
  │                    │
  │                    │ (booking_leg_passengers)
  │                    │
  └──→ Booking Passengers (many) ──→ junction table
```

Each booking has:
- **One or more legs** (origin → destination on a date)
- **One or more passengers** (personal data)
- Each passenger is linked to each leg via the [`booking_leg_passengers`](migrations/016_create_booking_leg_passengers.sql) junction table, which stores per-leg baggage, freight, check-in status, seat assignment, and boarding status.

### Key Tables

| Table | Purpose |
|-------|---------|
| [`bookings`](migrations/001_create_tables.sql) | Booking records with reference, status, payment info |
| [`booking_legs`](migrations/001_create_tables.sql) | Individual itinerary legs (origin, destination, date, flight assignment) |
| [`booking_passengers`](migrations/016_create_booking_leg_passengers.sql) | Passenger personal data (name, DOB, weight, residency) |
| [`booking_leg_passengers`](migrations/016_create_booking_leg_passengers.sql) | Junction: per-leg passenger data (baggage, freight, check-in, seat) |
| [`schedules`](migrations/014_create_scheduling_tables.sql) | Daily schedule records with pipeline status |
| [`flights`](migrations/001_create_tables.sql) | Flight records |
| [`flight_legs`](migrations/014_create_scheduling_tables.sql) | Sequenced stops within a sortie flight |
| [`flight_manifests`](migrations/001_create_tables.sql) | Per-flight passenger manifests |
| [`weight_balance_snapshots`](migrations/014_create_scheduling_tables.sql) | Per-leg weight & balance calculations |
| [`pilot_assignments`](migrations/014_create_scheduling_tables.sql) | Pilot-to-flight assignments |
| [`payments`](migrations/001_create_tables.sql) | Payment records |
| [`invoices`](migrations/007_create_invoices.sql) | Invoice records |
| [`accounting_entries`](migrations/008_create_accounting_journal.sql) | Double-entry journal entries |
| [`users`](migrations/001_create_tables.sql) | User accounts |
| [`roles` / `permissions` / `role_permissions` / `user_roles`](migrations/015_create_rbac_tables.sql) | PBAC tables |
| [`aerodromes`](migrations/001_create_tables.sql) | Airport/airstrip reference data |
| [`aircraft`](migrations/001_create_tables.sql) | Aircraft fleet data |
| [`fare_routes`](migrations/001_create_tables.sql) | Fare pricing between aerodromes |

For a complete data model reference, see [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md).

---

## Setup Instructions

### Prerequisites

- **Node.js** >= 20.0.0
- **PostgreSQL** 16+
- **npm** (comes with Node.js)
- **Stripe account** (for payment processing; optional for development)

### Environment Variables

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Required variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (e.g., `postgresql://user:password@localhost:5432/figas`) |
| `STRIPE_SECRET_KEY` | Stripe secret key (test mode for development) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |

### Installation

```bash
# Install dependencies
npm install

# Set up the database
createdb figas
npm run migrate

# (Optional) Seed reference data
npm run seed
```

### Running the Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run migrate` | Run pending database migrations |
| `npm run seed` | Seed reference data (aerodromes, aircraft, fares) |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript type checking |

---

## Project Structure

```
├── app/
│   ├── components/           # Shared UI components
│   │   ├── icons/            # SVG icon components
│   │   ├── scheduling/       # Scheduling-specific components
│   │   ├── ui/               # Base UI components
│   │   ├── DataTable.tsx     # Sortable/filterable data table
│   │   ├── BookingWizard.tsx # 4-step booking creation wizard
│   │   ├── Sidebar.tsx       # Navigation sidebar
│   │   ├── WeightBar.tsx     # Weight utilization bar
│   │   └── ...               # 30+ components
│   ├── routes/               # Remix route modules
│   │   ├── operations.*      # Operations dashboard routes
│   │   ├── bookings.*        # Passenger-facing booking routes
│   │   ├── agent.*           # Agent booking routes
│   │   ├── checkin.*         # Check-in routes
│   │   ├── finance.*         # Finance routes
│   │   ├── admin.*           # Admin routes
│   │   ├── pilot.*           # Pilot routes
│   │   ├── engineer.*        # Engineer routes
│   │   └── api.*             # API routes (Stripe webhook)
│   ├── utils/
│   │   ├── repositories/     # Database access layer (25+ files)
│   │   ├── scheduling/       # Scheduling pipeline (7 files)
│   │   ├── services/         # Business logic services (5 files)
│   │   ├── db.server.ts      # Database connection pool
│   │   ├── permissions.server.ts  # PBAC implementation
│   │   ├── stripe.server.ts  # Stripe client singleton
│   │   ├── migrate.ts        # Migration runner
│   │   ├── seed.ts           # Data seeder
│   │   ├── auth.server.ts    # Authentication
│   │   ├── session.server.ts # Session management
│   │   └── constants.ts      # Enums and constants
│   ├── styles/
│   │   └── tailwind.css      # Tailwind CSS v4 entry point
│   ├── root.tsx              # Root layout
│   └── entry.client.tsx      # Client entry point
├── migrations/               # SQL migration files (001-016)
├── data/                     # Reference data (CSV files)
├── prisma/                   # Prisma schema (for PBAC migration only)
├── public/                   # Static assets
├── docs/                     # Documentation
├── plans/                    # Architecture/design plans
├── netlify.toml              # Netlify deployment config
└── package.json
```

---

## Key Workflows

### Booking Creation (4-Step Process)

1. **Step 1 — Booking Details**: Create a pending booking record with user, organization, and billing info
2. **Step 2 — Legs**: Add one or more itinerary legs (origin, destination, date, preferred time)
3. **Step 3 — Passengers**: Add passenger personal data (name, DOB, weight, residency)
4. **Step 4 — Junction Records**: Link passengers to legs via [`booking_leg_passengers`](migrations/016_create_booking_leg_passengers.sql) with per-leg baggage, freight, and seat assignment

Implemented in [`app/routes/operations.bookings.new.tsx`](app/routes/operations.bookings.new.tsx) using the [`BookingWizard`](app/components/BookingWizard.tsx) component.

### Check-In (Per-Leg)

1. Select a flight leg via the leg selector
2. Search for passengers by booking reference, name, or flight number
3. Verify passenger identity and weight
4. Check in per-leg via [`bookingLegPassengerRepository.checkIn()`](app/utils/repositories/booking-leg-passenger.ts:160)
5. Board passengers via [`bookingLegPassengerRepository.board()`](app/utils/repositories/booking-leg-passenger.ts:169)

Implemented in [`app/routes/checkin.counter.tsx`](app/routes/checkin.counter.tsx).

### Flight Scheduling (5-Phase Pipeline)

1. **Cluster** — Group unassigned booking legs by date/origin/destination
2. **Route** — Build optimal sortie routes using nearest-neighbor heuristic
3. **Aircraft** — Assign aircraft based on capacity and payload
4. **Weight & Balance** — Compute per-leg weight, balance, CG position, and fuel planning
5. **Pilots** — Assign pilots based on qualifications, duty hours, and medical validity

Orchestrated by [`buildSchedule(date)`](app/utils/scheduling/index.ts:30) in [`app/utils/scheduling/index.ts`](app/utils/scheduling/index.ts).

### Payment Processing

1. Customer selects payment method (Stripe, pay-on-departure, invoice, bank transfer)
2. For Stripe: Create Checkout Session → redirect to Stripe → webhook confirms payment
3. For invoice: Generate invoice → issue → record payment against invoice
4. All payments create double-entry accounting journal entries
5. Payment reminders are sent for overdue invoices

### Status Pipelines

**Booking Status**: `PENDING` → `CONFIRMED` → `PILOT_REVIEW` → `APPROVED` → `COMPLETED` (with `CANCELLED` as terminal)

**Schedule Status**: `DRAFT` → `APPROVED` → `PUBLISHED` → `ACTIVE` → `COMPLETED` (with `CANCELLED` as terminal)

---

## API Overview

### Route Structure

The application uses Remix's file-based routing with the following conventions:

| Pattern | Example | Description |
|---------|---------|-------------|
| `operations.*` | `operations.bookings.$bookingId.tsx` | Operations dashboard routes |
| `bookings.*` | `bookings.new.tsx` | Passenger-facing routes |
| `agent.*` | `agent.bookings._index.tsx` | Agent routes |
| `checkin.*` | `checkin.counter.tsx` | Check-in routes |
| `finance.*` | `finance.invoices.tsx` | Finance routes |
| `admin.*` | `admin.users.tsx` | Admin routes |
| `api.*` | `api.stripe-webhook.ts` | API endpoints |

### Data Flow Pattern

```
Browser Request
    │
    ▼
Remix Loader (server-side)
    │  ├── requirePermission(request, "booking:view")
    │  ├── repository.findByBookingId(id)
    │  └── return { booking, legs, passengers }
    │
    ▼
React Component (hydrated)
    │  ├── useLoaderData() → render UI
    │  └── <Form method="post"> → action
    │
    ▼
Remix Action (server-side)
    │  ├── requirePermission(request, "booking:edit")
    │  ├── parse form data
    │  ├── repository.update(...)
    │  └── redirect to detail page
    │
    ▼
Browser (updated page)
```

---

## Configuration

### Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `SESSION_SECRET` | Yes* | — | Session encryption cookie secret (required in production) |
| `CSRF_SECRET` | Yes* | — | CSRF token encryption secret (required in production) |
| `STRIPE_SECRET_KEY` | Yes* | — | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | Yes* | — | Stripe webhook signing secret |
| `STRIPE_API_VERSION` | No | `"2026-04-22.dahlia"` | Stripe API version |
| `APP_URL` | No | `http://localhost:5173` | Application base URL (used for email links) |
| `CONTACT_EMAIL` | No | `ops@figas.gov.fk` | Contact email displayed in print templates |
| `CONTACT_PHONE` | No | `+500 27219` | Contact phone displayed in print templates |
| `SYSTEM_EMAIL` | No | `system@figas.gov.fk` | Sender email for system notifications |
| `NODE_ENV` | No | `development` | Environment mode |


\* Required for payment processing; the app can run without Stripe for development.

---

## Deployment

The application is configured for deployment on **Netlify** via the [`netlify.toml`](netlify.toml) configuration file.

```bash
# Build for production
npm run build

# Deploy to Netlify (requires Netlify CLI)
netlify deploy --prod
```

Key deployment notes:
- The build output goes to `build/client/` (configured in `netlify.toml`)
- The Remix server adapter (`@netlify/remix-adapter`) handles serverless function deployment
- Environment variables must be configured in the Netlify dashboard
- The database must be accessible from Netlify's serverless functions (use a cloud-hosted PostgreSQL like Supabase)

---

## Documentation

Comprehensive documentation is maintained in the `docs/` directory:

| Document | Description |
|----------|-------------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System architecture, design decisions, component tree |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | Complete data model with ER diagrams and column documentation |
| [`docs/SCHEDULING.md`](docs/SCHEDULING.md) | Scheduling pipeline reference (status lifecycle, dnd-kit, validation) |
| [`docs/WORKFLOWS.md`](docs/WORKFLOWS.md) | Business workflows (booking, check-in, payment, scheduling) |
| [`docs/SETUP.md`](docs/SETUP.md) | Environment setup and development guide |
| [`docs/IMPLEMENTATION-PLAN.md`](docs/IMPLEMENTATION-PLAN.md) | Modernization roadmap (6-phase plan) |
| [`docs/IMPLEMENTATION-COMPLETION-REPORT.md`](docs/IMPLEMENTATION-COMPLETION-REPORT.md) | Audit-verified completion report with shelfware inventory and deferred task feasibility plans |
| [`docs/DATABASE-AUDIT-SUMMARY.md`](docs/DATABASE-AUDIT-SUMMARY.md) | Consolidated database audit findings |

**Authoritative technical contracts** are maintained as agent skills:
- [`.agents/skills/flight-schedule/SKILL.md`](.agents/skills/flight-schedule/SKILL.md) — Scheduling system interfaces, invariants, and test contracts
- [`.agents/skills/figas-test-automation/SKILL.md`](.agents/skills/figas-test-automation/SKILL.md) — Testing patterns and fixtures

**Historical planning documents** are archived in [`docs/archive/`](docs/archive/). Active (not yet completed) plans remain in [`plans/`](plans/).

---

## Contributing

### Development Guidelines

1. **Code Style**: TypeScript strict mode, ESLint configured, Prettier formatting
2. **Database Changes**: Add new migration files in `migrations/` directory (numbered sequentially)
3. **Repository Pattern**: All database queries go through repository modules in `app/utils/repositories/`
4. **Permissions**: Use `requirePermission()` in loaders/actions for access control
5. **Components**: Place shared components in `app/components/`, route-specific components co-located with routes
6. **Types**: Define interfaces in repository files or dedicated type files

### Pull Request Process

1. Create a feature branch from `main`
2. Make changes following the development guidelines
3. Run `npm run typecheck` and `npm run lint`
4. Test migrations with `npm run migrate`
5. Submit a pull request with a clear description of changes

---

## License

This project is proprietary software for the Falkland Islands Government Air Service (FIGAS).
