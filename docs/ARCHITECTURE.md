# FIGAS System Architecture

> **Version**: 1.0  
> **Last Updated**: 2026-05-21  
> **Application**: FIGAS Flight Operations & Booking Management System

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Data Flow](#2-data-flow)
3. [Route Design](#3-route-design)
4. [Component Architecture](#4-component-architecture)
5. [Repository Pattern](#5-repository-pattern)
6. [Scheduling Pipeline](#6-scheduling-pipeline)
7. [Auth & Authorization](#7-auth--authorization)
8. [Payment Flow](#8-payment-flow)

---

## 1. System Architecture Overview

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            CLIENT (Browser)                              │
│                                                                          │
│  ┌─────────────────────┐  ┌─────────────────┐  ┌────────────────────┐   │
│  │ Remix Hydration      │  │ React Components│  │ Tailwind CSS v4    │   │
│  │ (progressive         │  │ (DataTable,     │  │ (@import "tailwind │   │
│  │  enhancement)        │  │  Sidebar,       │  │  css" in CSS)     │   │
│  │                      │  │  BookingWizard) │  │                    │   │
│  └──────────┬───────────┘  └────────┬────────┘  └────────────────────┘   │
└─────────────┼───────────────────────┼────────────────────────────────────┘
              │ HTTP request/response │ React hydration
              ▼                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         REMIX SERVER (Node.js)                           │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │                      ROUTE MODULES                               │    │
│  │                                                                  │    │
│  │  Each route module exports:                                      │    │
│  │  ┌─────────────────────────────────────────────────────────────┐ │    │
│  │  │ export async function loader({ request, params }) {         │ │    │
│  │  │   // 1. Auth check: requirePermission(request, "perm")     │ │    │
│  │  │   // 2. Data fetch: repository.findByX(params.id)          │ │    │
│  │  │   // 3. Return data to component                           │ │    │
│  │  │   return json({ data });                                    │ │    │
│  │  │ }                                                           │ │    │
│  │  │                                                             │ │    │
│  │  │ export async function action({ request, params }) {         │ │    │
│  │  │   // 1. Auth check: requirePermission(request, "perm")     │ │    │
│  │  │   // 2. Parse form data                                    │ │    │
│  │  │   // 3. Business logic: service.process(data)              │ │    │
│  │  │   // 4. Redirect or return response                        │ │    │
│  │  │   return redirect("/path");                                 │ │    │
│  │  │ }                                                           │ │    │
│  │  └─────────────────────────────────────────────────────────────┘ │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                    │                                     │
│  ┌────────────────────────────────┼─────────────────────────────────────┐│
│  │                                ▼                                     ││
│  │  ┌──────────────────────────────────────────────────────────────┐    ││
│  │  │                      SERVICES LAYER                          │    ││
│  │  │                                                              │    ││
│  │  │  Business logic orchestrators that coordinate multiple       │    ││
│  │  │  repositories and external integrations:                     │    ││
│  │  │                                                              │    ││
│  │  │  • payment.service.ts    — Stripe Checkout, invoice gen      │    ││
│  │  │  • invoice.service.ts    — Invoice CRUD, aging, entries      │    ││
│  │  │  • reconciliation.service.ts — Bank reconciliation           │    ││
│  │  │  • reminder.service.ts   — Payment reminder scheduling       │    ││
│  │  │  • export.service.ts     — CSV/XML export                    │    ││
│  │  └──────────────────────────────────────────────────────────────┘    ││
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │                   REPOSITORY LAYER                               │    │
│  │                                                                  │    │
│  │  Each repository is a plain object with methods that encapsulate │    │
│  │  SQL queries against the `db` client:                            │    │
│  │                                                                  │    │
│  │  export const bookingRepository = {                              │    │
│  │    async findById(id) { ... },                                   │    │
│  │    async create(data) { ... },                                   │    │
│  │    async updateStatus(id, status) { ... },                       │    │
│  │  };                                                              │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │                   SCHEDULING PIPELINE                            │    │
│  │                                                                  │    │
│  │  buildSchedule(date) → ScheduleBuildResult                       │    │
│  │    ├── Phase 1: clusterBookings()                                │    │
│  │    ├── Phase 2: buildRoute() (nearest-neighbor)                  │    │
│  │    ├── Phase 3: assignAircraftToRoutes()                         │    │
│  │    ├── Phase 4: computeWeightBalanceForRoute()                   │    │
│  │    └── Phase 5: assignPilotsToRoutes()                           │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │                   DATABASE LAYER                                 │    │
│  │                                                                  │    │
│  │  app/utils/db.server.ts                                          │    │
│  │  ┌─────────────────────────────────────────────────────────────┐ │    │
│  │  │ const prisma = new PrismaClient({ adapter: PrismaPg(URL) }) │ │    │
│  │  │ export const db = prisma & {                                │ │    │
│  │  │   query(text, params) → Promise<QueryResult>                │ │    │
│  │  │   queryOne(text, params) → Promise<row | null>              │ │    │
│  │  │ }                                                            │ │    │
│  │  └─────────────────────────────────────────────────────────────┘ │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │                    EXTERNAL INTEGRATIONS                          │    │
│  │                                                                  │    │
│  │  • Stripe API — Checkout Sessions, Payment Intents, Webhooks     │    │
│  └──────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack Summary

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **SSR Framework** | Remix v2 | Full-stack web framework with nested routing, server-side rendering, and progressive enhancement |
| **Language** | TypeScript 5.1 | Type safety across server and client, catches errors at compile time |
| **Database** | PostgreSQL 16 | Relational integrity, JSONB for flexible data, window functions for analytics |
| **ORM / Driver** | Prisma v7 + `@prisma/adapter-pg` | PrismaClient singleton over a PostgreSQL adapter, exposing raw-SQL query shims |
| **CSS** | Tailwind CSS v4 | Utility-first, CSS-first config via `@import "tailwindcss"`, no runtime |
| **Payments** | Stripe v22 | PCI-compliant payment processing, Checkout Sessions, webhook events |
| **Auth** | Session cookies + PBAC | Server-side sessions with granular permission checks |
| **Deployment** | Render (persistent Node service) | Long-running `remix-serve` process, suited to SSE + pooled DB; configured via `render.yaml` |

### Key Design Decisions

#### 1. Repository Pattern with Raw SQL over Prisma ORM

The system uses a custom repository pattern with hand-written SQL queries rather than Prisma's query builder. This decision was made because:

- **Complex queries**: The booking/leg/passenger junction queries involve multiple JOINs, LATERAL subqueries, and window functions that ORMs struggle to express efficiently
- **Performance**: Raw SQL gives full control over query plans, indexing, and execution
- **Migration control**: SQL migrations are hand-written for precise schema evolution
- **Type safety**: TypeScript interfaces on repository methods provide compile-time safety without ORM overhead

Since the Prisma migration (Phase 4b), the underlying connection is a `PrismaClient` singleton wired to PostgreSQL via `@prisma/adapter-pg`. The `db` export augments this client with backward-compatible `.query()` / `.queryOne()` raw-SQL helpers (delegating to `$queryRawUnsafe`), so repositories continue to issue raw SQL unchanged. Prisma is also used directly by the PBAC seed script in [`prisma/seed-pbac.ts`](prisma/seed-pbac.ts) and other data utilities under [`prisma/`](prisma/), which rely on the generated client in [`generated/prisma/`](generated/prisma/).

#### 2. Server-Side Rendering with Progressive Enhancement

All data fetching happens in Remix loaders on the server. Forms submit to server actions. This provides:

- **Fast initial page loads** — HTML is rendered on the server
- **SEO-friendly** — Search engines see complete HTML
- **Graceful degradation** — JavaScript is not required for form submission
- **Optimistic UI** — Remix handles pending states automatically

#### 3. PBAC over Simple RBAC

The system implements Permission-Based Access Control (PBAC) where:

- **Permissions** are granular strings in `resource:action` format (e.g., `booking:create`, `finance:reconcile`)
- **Roles** are containers that group permissions
- **Users** can hold multiple users
- **Checks** are done via `requirePermission(request, "resource:action")` in loaders/actions
- **Segregation of Duties (SoD)** prevents incompatible permission combinations (e.g., a user cannot both record payments AND reconcile bank statements)

#### 4. Junction Table for Passenger-Leg Relationship

The [`booking_leg_passengers`](migrations/archive/016_create_booking_leg_passengers.sql) table is the linchpin of the data model. It enables:

- Per-leg baggage weight and description
- Per-leg freight weight and description
- Per-leg check-in status and timestamp
- Per-leg boarding status and timestamp
- Per-leg seat assignment
- Per-leg clothed weight override

This replaces the previous model where baggage, check-in, and seat data lived on the passenger record itself, which couldn't handle multi-leg itineraries where a passenger might have different baggage or check-in status per leg.

---

## 2. Data Flow

### Standard Request/Response Cycle

```
┌──────────┐     HTTP GET /operations/bookings/42
│  Browser  │──────────────────────────────────────────────►
│           │                                                │
│           │                                                ▼
│           │                                    ┌──────────────────────┐
│           │                                    │  Remix Server        │
│           │                                    │                      │
│           │                                    │  1. Match route:     │
│           │                                    │     operations.      │
│           │                                    │     bookings.        │
│           │                                    │     $bookingId.tsx   │
│           │                                    │                      │
│           │                                    │  2. Run loader():    │
│           │                                    │     a. getSession()  │
│           │                                    │     b. requirePerm() │
│           │                                    │     c. repository    │
│           │                                    │        queries       │
│           │                                    │     d. return json   │
│           │                                    │                      │
│           │                                    │  3. Render component │
│           │                                    │     with data        │
│           │◄───────────────────────────────────┼──────────────────────┘
│           │     HTML + JSON (Scripts)          │
│           │                                    │
│           │  4. Hydrate React components        │
│           │  5. User interacts with form        │
│           │                                    │
│           │     POST /operations/bookings/42    │
│           │──────────────────────────────────────────────►
│           │                                    │
│           │                                    │  6. Run action():    │
│           │                                    │     a. requirePerm() │
│           │                                    │     b. parseFormData │
│           │                                    │     c. repository    │
│           │                                    │        mutations     │
│           │                                    │     d. redirect      │
│           │◄───────────────────────────────────┼──────────────────────┘
│           │     302 Redirect                    │
│           │                                    │
│           │     GET /operations/bookings/42     │
│           │──────────────────────────────────────────────►
│           │                                    │
│           │     (re-render with updated data)   │
│           │◄───────────────────────────────────┼──────────────────────┘
└──────────┘                                    └──────────────────────┘
```

### Data Flow for Booking Creation (4-Step)

```
Step 1: POST /operations/bookings/new (booking details)
  │
  ├── action(): requirePermission("booking:create")
  ├── bookingRepository.createPending(userId, orgId, billing)
  ├── Returns booking ID
  │
  ▼
Step 2: POST /operations/bookings/:id/legs (itinerary legs)
  │
  ├── action(): requirePermission("booking:edit")
  ├── bookingLegRepository.create({ booking_id, origin, dest, date, ... })
  ├── Repeat for each leg
  │
  ▼
Step 3: POST /operations/bookings/:id/passengers (passenger data)
  │
  ├── action(): requirePermission("booking:manage-passengers")
  ├── bookingPassengerRepository.create({ booking_id, name, DOB, weight, ... })
  ├── Repeat for each passenger
  │
  ▼
Step 4: POST /operations/bookings/:id/junction (link passengers to legs)
  │
  ├── action(): requirePermission("booking:manage-passengers")
  ├── bookingLegPassengerRepository.create({ booking_leg_id, passenger_id, ... })
  ├── Repeat for each passenger-leg combination
  │
  ▼
  Redirect to booking detail page
```

### Data Flow for Check-In

```
GET /checkin/counter (select flight leg)
  │
  ├── loader(): requirePermission("checkin:process")
  ├── flightLegRepository.findByDate(date)
  ├── Returns available legs for check-in
  │
  ▼
POST /checkin/counter (search passengers)
  │
  ├── action(): checkinRepository.searchBookings(query)
  ├── Returns matching passengers with booking/flight details
  │
  ▼
POST /checkin/counter (check in passenger)
  │
  ├── action(): bookingLegPassengerRepository.checkIn(id, userId)
  ├── Updates checked_in = true, checked_in_at = NOW(), checked_in_by = userId
  ├── Returns updated junction record
  │
  ▼
POST /checkin/counter (board passenger)
  │
  ├── action(): bookingLegPassengerRepository.board(id)
  ├── Updates boarded = true, boarded_at = NOW()
  │
  ▼
  Re-render with updated check-in status
```

---

## 3. Route Design

### Route Conventions

Remix v2 uses file-based routing with the following conventions:

| File Pattern | URL Pattern | Description |
|-------------|-------------|-------------|
| `app/routes/bookings.tsx` | `/bookings` | Layout route for passenger bookings |
| `app/routes/bookings._index.tsx` | `/bookings` | Index route (booking list) |
| `app/routes/bookings.new.tsx` | `/bookings/new` | New booking form |
| `app/routes/bookings.$bookingId.tsx` | `/bookings/:bookingId` | Booking detail |
| `app/routes/operations.bookings.new.tsx` | `/operations/bookings/new` | Nested route via dot notation |
| `app/routes/operations.schedule._index.tsx` | `/operations/schedule` | Schedule builder index |
| `app/routes/api.stripe-webhook.ts` | `/api/stripe-webhook` | API endpoint (no component) |

### Route Hierarchy

```
/ (root.tsx — GlobalErrorBoundary, layout)
│
├── /dashboard (dashboard.tsx)
│
├── /bookings (bookings.tsx — layout)
│   ├── /bookings (bookings._index.tsx — list)
│   ├── /bookings/new (bookings.new.tsx — create)
│   └── /bookings/:bookingId (bookings.$bookingId.tsx — detail)
│
├── /agent/bookings (agent.bookings._index.tsx — agent list)
│   └── /agent/bookings/:bookingId (agent.bookings.$bookingId.tsx — agent detail)
│
├── /checkin (checkin.tsx — layout)
│   ├── /checkin (checkin._index.tsx — hub)
│   ├── /checkin/counter (checkin.counter.tsx — check-in counter)
│   └── /checkin/lookup (checkin.lookup.tsx — booking lookup)
│
├── /operations (operations.tsx — layout)
│   ├── /operations/bookings (hub)
│   │   ├── /operations/bookings (operations.bookings._index.tsx)
│   │   ├── /operations/bookings/new (operations.bookings.new.tsx)
│   │   └── /operations/bookings/:bookingId (operations.bookings.$bookingId.tsx)
│   ├── /operations/flights
│   │   ├── /operations/flights/new (operations.flights.new.tsx)
│   │   ├── /operations/flights/:flightId (operations.flights.$flightId.tsx)
│   │   └── /operations/flights/:flightId/manifest (operations.flights.$flightId.manifest.tsx)
│   ├── /operations/schedule
│   │   ├── /operations/schedule (operations.schedule._index.tsx — builder)
│   │   ├── /operations/schedule/list (operations.schedule.list.tsx)
│   │   └── /operations/schedule/:scheduleId (operations.schedule.$scheduleId.tsx)
│   └── /operations/notifications (operations.notifications.tsx)
│
├── /finance (finance.tsx — layout)
│   ├── /finance (finance._index.tsx — dashboard)
│   ├── /finance/payments (finance.payments.tsx)
│   ├── /finance/invoices (finance.invoices.tsx)
│   ├── /finance/invoices/:invoiceId (finance.invoices.$invoiceId.tsx)
│   ├── /finance/exports (finance.exports.tsx)
│   ├── /finance/reconciliation (finance.reconciliation.tsx)
│   ├── /finance/reports (finance.reports.tsx — layout)
│   │   ├── /finance/reports/aging (finance.reports.aging.tsx)
│   │   └── /finance/reports/daily-sales (finance.reports.daily-sales.tsx)
│   └── /finance/settings (finance.settings.tsx)
│
├── /admin (admin.tsx — layout)
│   ├── /admin (admin._index.tsx — dashboard)
│   ├── /admin/users (admin.users.tsx)
│   ├── /admin/aircraft (admin.aircraft.tsx)
│   ├── /admin/aerodromes (admin.aerodromes.tsx)
│   ├── /admin/aerodrome-distances (admin.aerodrome-distances.tsx)
│   ├── /admin/aerodrome-headings (admin.aerodrome-headings.tsx)
│   ├── /admin/fares (admin.fares.tsx)
│   ├── /admin/fuel-rules (admin.fuel-rules.tsx)
│   ├── /admin/airframe-hours (admin.airframe-hours.tsx)
│   └── /admin/settings (admin.settings.tsx)
│
├── /pilot (pilot.tsx — layout)
│   └── /pilot (pilot._index.tsx — dashboard)
│
├── /engineer (engineer.tsx — layout)
│   └── /engineer (engineer._index.tsx — dashboard)
│
└── /api/stripe-webhook (api.stripe-webhook.ts — no component)
```

### Layout Routes

Layout routes (e.g., [`bookings.tsx`](app/routes/bookings.tsx), [`operations.tsx`](app/routes/operations.tsx), [`finance.tsx`](app/routes/finance.tsx)) use the `<Outlet />` component to render child routes. They typically:

1. Check authentication and permissions via `requirePermission()` or `requireAnyRole()`
2. Fetch sidebar/layout data (user info, notifications, counts)
3. Render the [`SidebarLayout`](app/components/SidebarLayout.tsx) component with navigation
4. Render `<Outlet />` for the child route content

### Data Loading Pattern

```typescript
// app/routes/operations.bookings.$bookingId.tsx
import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { requirePermission } from "~/utils/permissions.server";
import { bookingRepository } from "~/utils/repositories/booking";
import { bookingLegRepository } from "~/utils/repositories/booking-leg";
import { bookingPassengerRepository } from "~/utils/repositories/booking-passenger";

// ── Loader ────────────────────────────────────────────────────────────────
export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await requirePermission(request, "booking:view");
  const bookingId = Number(params.bookingId);

  const [booking, legs, passengers] = await Promise.all([
    bookingRepository.findById(bookingId),
    bookingLegRepository.findByBookingId(bookingId),
    bookingPassengerRepository.findByBookingId(bookingId),
  ]);

  if (!booking) throw new Response("Not Found", { status: 404 });

  return json({ booking, legs, passengers, user });
}

// ── Action ────────────────────────────────────────────────────────────────
export async function action({ request, params }: ActionFunctionArgs) {
  const user = await requirePermission(request, "booking:edit");
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "update-status") {
    const newStatus = formData.get("status") as string;
    await bookingRepository.updateStatus(Number(params.bookingId), newStatus);
  }

  return redirect(`/operations/bookings/${params.bookingId}`);
}

// ── Component ─────────────────────────────────────────────────────────────
export default function BookingDetail() {
  const { booking, legs, passengers } = useLoaderData<typeof loader>();
  // ... render booking detail
}
```

---

## 4. Component Architecture

### Component Hierarchy

```
app/components/
├── Layout/
│   ├── Sidebar.tsx          # Navigation sidebar with persona-based sections
│   ├── SidebarLayout.tsx    # Layout wrapper with sidebar
│   └── PageLayout.tsx       # Page layout with header and actions
│
├── Data Display/
│   ├── DataTable.tsx        # Sortable, filterable, paginated data table
│   ├── Card.tsx             # Card container
│   ├── Badge.tsx            # Status badge
│   ├── StatusBadge.tsx      # Status-specific badge with colors
│   ├── StatCard.tsx         # Statistics/metrics card
│   ├── BookingCard.tsx      # Booking summary card
│   ├── BookingTimeline.tsx  # Booking status timeline visualization
│   ├── ActivityFeed.tsx     # Recent activity feed
│   ├── ClientGroup.tsx      # Client group display (agent view)
│   ├── WeightSummary.tsx    # Weight summary display
│   ├── WeightBar.tsx        # Weight utilization bar (currentWeight, maxWeight, label)
│   └── Skeleton.tsx         # Loading skeleton placeholder
│
├── Forms & Input/
│   ├── TextField.tsx        # Text input field
│   ├── Button.tsx           # Button component
│   ├── DatePicker.tsx       # Date picker
│   ├── DateRangePicker.tsx  # Date range picker
│   ├── DOBPicker.tsx        # Date of birth picker with masked input
│   ├── LegsTable.tsx        # Dynamic legs form table
│   ├── PassengersTable.tsx  # Dynamic passengers form table
│   ├── PassengerForm.tsx    # Passenger data entry form
│   ├── PassengerSearchCombobox.tsx  # Passenger search with autocomplete
│   └── PaymentMethodSelector.tsx    # Payment method selection
│
├── Booking/
│   ├── BookingWizard.tsx         # 4-step booking creation wizard
│   ├── CostBreakdown.tsx         # Cost breakdown display
│   ├── PaymentStatusBadge.tsx    # Payment status badge
│   ├── AirportCodeBadge.tsx      # Luggage-tag-style airport code badge (origin/destination/default, sm/md/lg)
│   ├── FlightLegTimeline.tsx     # Visual vertical timeline with leg cards and timeline connector
│   ├── PassengerManifest.tsx     # Boarding-pass-style passenger cards in responsive grid
│   ├── BookingCostSummary.tsx    # Async fare calculation with cost breakdown display
│   ├── PaymentConfirmation.tsx   # Payment status display (pending/processing/success/failed/refunded)
│   ├── FlightTicket.tsx          # Printable flight ticket with barcode, print button, passenger/leg details
│   ├── FareDifferenceCalculator.tsx  # Stored vs calculated fare comparison with refund/top-up indicators
│   └── PostBookingChanges.tsx    # Post-booking change management (refunds/top-ups) with change history
│
├── Payment/
│   ├── PaymentTimeline.tsx  # Payment timeline
│   └── PaymentMethodSelector.tsx  # Payment method selector
│
├── Feedback/
│   ├── ConfirmDialog.tsx    # Confirmation dialog
│   ├── EmptyState.tsx       # Empty state placeholder
│   ├── AlertBanner.tsx      # Alert banner
│   ├── CountdownBar.tsx     # Countdown timer bar
│   └── Popup.tsx            # Popup/dropdown component
│
├── Navigation/
│   ├── Pagination.tsx       # Pagination component
│   ├── ProfilePopup.tsx     # User profile popup
│   └── ExpandableSection.tsx  # Collapsible section
│
├── Error/
│   ├── GlobalErrorBoundary.tsx  # Global error boundary
│   └── CodeBlock.tsx        # Code display block
│
├── Scheduling/
│   ├── FlightCard.tsx       # Flight card for schedule board
│   ├── FlightCrew.tsx       # Flight crew display
│   ├── FlightTiming.tsx     # Flight timing display
│   ├── RouteStrip.tsx       # Route visualization strip
│   ├── ScheduleBoard.tsx    # Drag-and-drop schedule board
│   ├── StopActivityList.tsx # Stop activity list
│   └── WeightSummary.tsx    # Weight summary for scheduling
│
├── Icons/
│   ├── ArrowRight.tsx         # Right arrow
│   ├── ArrowTopRight.tsx      # Top-right arrow (external link)
│   ├── CalendarIcon.tsx       # Calendar grid
│   ├── Close.tsx              # Close/X icon
│   ├── CompassIcon.tsx        # Compass rose
│   ├── Delete.tsx             # Trash/delete icon
│   ├── Edit.tsx               # Pencil/edit icon
│   ├── FreightIcon.tsx        # Cargo/freight icon
│   ├── ItineraryIcon.tsx      # Route/map icon
│   ├── LoadingSpinner.tsx     # Animated loading spinner
│   ├── Menu.tsx               # Hamburger menu
│   ├── PassengerIcon.tsx      # Passenger silhouette
│   ├── PaymentIcon.tsx        # Payment/card icon
│   ├── View.tsx               # Eye/view icon
│   ├── WeightIcon.tsx         # Weight/scale icon
│   ├── AircraftIcon.tsx       # Aircraft silhouette (BN2 Islander style)
│   ├── FlightPathArc.tsx      # Curved flight path arc with arrowhead
│   ├── RunwayIcon.tsx         # Horizontal runway with centerline dashes
│   ├── CreditCardIcon.tsx     # Credit card with chip line
│   ├── InvoiceIcon.tsx        # Document with lines
│   ├── CashIcon.tsx           # Currency symbol
│   ├── BarcodeIcon.tsx        # Barcode with vertical bars
│   ├── BoardingPassIcon.tsx   # Boarding pass/ticket with horizontal lines
│   ├── RefundIcon.tsx         # Circle with arrow/currency for refunds
│   ├── TopUpIcon.tsx          # Circle with up-arrow for top-ups
│   └── WingIcon.tsx           # Wing/airfoil silhouette
│
└── UI/
    └── ExpandableSection.tsx  # Reusable collapsible section
```

### Component Design Principles

1. **Composition over configuration** — Components are composed together rather than configured via large prop objects
2. **Tailwind CSS for styling** — All styling uses Tailwind utility classes; no CSS modules or styled-components
3. **TypeScript interfaces** — All component props are typed with exported interfaces
4. **Server components stay lean** — Complex client-side interactivity (drag-and-drop, autocomplete) is isolated in specific components

### Key Component Details

#### [`WeightBar`](app/components/WeightBar.tsx)
```typescript
interface WeightBarProps {
  currentWeight: number;
  maxWeight: number;
  label: string;
  className?: string;
}
```
Renders a horizontal bar showing weight utilization as a percentage of max. Color changes based on utilization (green < 70%, yellow 70-90%, red > 90%).

#### [`DataTable`](app/components/DataTable.tsx)
A generic sortable, filterable data table component used as the **application-wide standard** for all tabular data display. Accepts columns configuration and data array. Supports:
- Column sorting (click header) with multi-column sort state
- Text search filtering via filter inputs in header row
- Row click handlers and custom row class names
- Custom cell renderers via `render` prop on each column
- Action column for row-level buttons/links via `actions` render prop
- Empty state via `emptyState` ReactNode prop
- Generic typing via `<T>` parameter (commonly `Record<string, unknown>` for DB rows)

**Usage pattern** (IIFE to avoid polluting component scope):
```typescript
{(() => {
  const columns: Column<Record<string, unknown>>[] = [
    { key: "id", header: "ID" },
    { key: "name", header: "Name", render: (item) => <strong>{item.name as string}</strong> },
  ];
  return (
    <DataTable
      columns={columns}
      data={items as unknown as Array<Record<string, unknown>>}
      keyExtractor={(item) => item.id as number}
      sortable
      initialSortColumn="name"
      initialSortDirection="asc"
      emptyState={<div className="px-4 py-8 text-center text-slate-400">No items found.</div>}
      actions={(item) => (
        <div className="flex gap-2">
          <Link to={`/path/${item.id as number}`} className="text-blue-600 hover:underline text-xs">View</Link>
        </div>
      )}
    />
  );
})()}
```

**Routes using DataTable** (all manual `<table>` implementations replaced):
- [`operations.bookings._index.tsx`](app/routes/operations.bookings._index.tsx) — Booking list with advanced sorting/filtering
- [`operations.schedule.list.tsx`](app/routes/operations.schedule.list.tsx) — Schedule list
- [`operations.notifications.tsx`](app/routes/operations.notifications.tsx) — Notifications list
- [`operations._index.tsx`](app/routes/operations._index.tsx) — Dashboard (2 tables: needs attention, upcoming flights)
- [`checkin.lookup.tsx`](app/routes/checkin.lookup.tsx) — Check-in lookup results
- [`pilot._index.tsx`](app/routes/pilot._index.tsx) — Pilot dashboard (my assigned flights)
- [`engineer._index.tsx`](app/routes/engineer._index.tsx) — Engineer dashboard (aircraft fleet status)
- [`operations.flights.$flightId.manifest.tsx`](app/routes/operations.flights.$flightId.manifest.tsx) — Flight manifest passengers
- [`admin.users.tsx`](app/routes/admin.users.tsx) — User management
- [`admin.fuel-rules.tsx`](app/routes/admin.fuel-rules.tsx) — Fuel rules management
- [`admin.fares.tsx`](app/routes/admin.fares.tsx) — Fare routes management
- [`admin.aircraft.tsx`](app/routes/admin.aircraft.tsx) — Aircraft management
- [`admin.aerodromes.tsx`](app/routes/admin.aerodromes.tsx) — Aerodrome management
- [`admin.aerodrome-headings.tsx`](app/routes/admin.aerodrome-headings.tsx) — Aerodrome headings management
- [`admin.aerodrome-distances.tsx`](app/routes/admin.aerodrome-distances.tsx) — Aerodrome distances management
- [`admin.airframe-hours.tsx`](app/routes/admin.airframe-hours.tsx) — Airframe hours management

**Not converted** (specialized tables not suitable for generic DataTable):
- [`PassengersTable`](app/components/PassengersTable.tsx) — Form table with input fields
- [`LegsTable`](app/components/LegsTable.tsx) — Form table with input fields
- [`AgingReceivablesTable`](app/components/AgingReceivablesTable.tsx) — Specialized financial table
- [`operations.bookings.$bookingId.tsx`](app/routes/operations.bookings.$bookingId.tsx) — Per-leg seat maps with nested structure
- [`bookings.$bookingId.tsx`](app/routes/bookings.$bookingId.tsx) — Public booking detail
- [`agent.bookings.$bookingId.tsx`](app/routes/agent.bookings.$bookingId.tsx) — Agent booking detail

#### [`BookingWizard`](app/components/BookingWizard.tsx)
Manages the 4-step booking creation flow:
1. Booking details (organization, billing)
2. Legs (origin, destination, date, time)
3. Passengers (personal data)
4. Junction records (link passengers to legs)

Each step is a form section that validates before proceeding to the next.

---

## 5. Repository Pattern

### Overview

All database access is encapsulated in repository modules under [`app/utils/repositories/`](app/utils/repositories/). Each repository is a plain JavaScript object with async methods that execute raw SQL queries against the shared `db` client (a `PrismaClient` singleton exposing `.query()` / `.queryOne()` helpers).

### Repository Structure

```typescript
// app/utils/repositories/booking.ts
import { db } from "../db.server";

export interface BookingRow {
  id: number;
  user_id: number;
  booking_reference: string;
  status: string;
  // ... other columns
}

export const bookingRepository = {
  async createPending(userId: number, ...): Promise<BookingRow> { ... },
  async findById(id: number): Promise<BookingRow | null> { ... },
  async findByReference(ref: string): Promise<BookingRow | null> { ... },
  async updateStatus(id: number, status: string): Promise<void> { ... },
  async updatePayment(id: number, data: {...}): Promise<void> { ... },
  async cancel(id: number, cancelledBy: number, reason?: string): Promise<void> { ... },
  async findAll(page, pageSize): Promise<PaginatedResult> { ... },
  async search(query, page, pageSize): Promise<PaginatedResult> { ... },
  // ... more methods
};
```

### Available Repositories

| Repository | File | Key Methods |
|-----------|------|-------------|
| [`bookingRepository`](app/utils/repositories/booking.ts) | `booking.ts` | CRUD, search, pipeline queries, activity feed, agent portfolio |
| [`bookingLegRepository`](app/utils/repositories/booking-leg.ts) | `booking-leg.ts` | CRUD, flight assignment, status update, unassigned legs |
| [`bookingPassengerRepository`](app/utils/repositories/booking-passenger.ts) | `booking-passenger.ts` | CRUD, search, find by booking |
| [`bookingLegPassengerRepository`](app/utils/repositories/booking-leg-passenger.ts) | `booking-leg-passenger.ts` | CRUD, check-in, boarding, per-leg queries |
| [`flightRepository`](app/utils/repositories/flight.ts) | `flight.ts` | CRUD, weight updates |
| [`flightLegRepository`](app/utils/repositories/flight-leg.ts) | `flight-leg.ts` | CRUD, find by flight |
| [`flightManifestRepository`](app/utils/repositories/flight-manifest.ts) | `flight-manifest.ts` | Manifest CRUD |
| [`scheduleRepository`](app/utils/repositories/schedule.ts) | `schedule.ts` | CRUD, status transitions |
| [`checkinRepository`](app/utils/repositories/checkin.ts) | `checkin.ts` | Search bookings, passenger check-in detail, payment recording |
| [`pilotRepository`](app/utils/repositories/pilot.ts) | `pilot.ts` | CRUD, availability |
| [`pilotAssignmentRepository`](app/utils/repositories/pilot-assignment.ts) | `pilot-assignment.ts` | CRUD, assignment management |
| [`weightBalanceRepository`](app/utils/repositories/weight-balance.ts) | `weight-balance.ts` | CRUD, snapshots |
| [`paymentMethodRepository`](app/utils/repositories/payment-method.ts) | `payment-method.ts` | CRUD |
| [`stripePaymentRepository`](app/utils/repositories/stripe-payment.ts) | `stripe-payment.ts` | CRUD, status updates |
| [`paymentReminderRepository`](app/utils/repositories/payment-reminder.ts) | `payment-reminder.ts` | CRUD, pending reminders |
| [`invoiceRepository`](app/utils/repositories/invoice.ts) | `invoice.ts` | CRUD, number generation, payment updates |
| [`invoiceItemRepository`](app/utils/repositories/invoice-item.ts) | `invoice-item.ts` | CRUD, find by invoice |
| [`accountingEntryRepository`](app/utils/repositories/accounting-entry.ts) | `accounting-entry.ts` | Journal entries, lines, approval |
| [`bankTransactionRepository`](app/utils/repositories/bank-transaction.ts) | `bank-transaction.ts` | CRUD, reconciliation |
| [`aerodromeRepository`](app/utils/repositories/aerodrome.ts) | `aerodrome.ts` | CRUD |
| [`aircraftRepository`](app/utils/repositories/aircraft.ts) | `aircraft.ts` | CRUD |
| [`fareRouteRepository`](app/utils/repositories/fare-route.ts) | `fare-route.ts` | CRUD, base fare lookup |
| [`notificationRepository`](app/utils/repositories/notification.ts) | `notification.ts` | CRUD |
| [`exportLogRepository`](app/utils/repositories/export-log.ts) | `export-log.ts` | CRUD |
| [`adminRepository`](app/utils/repositories/admin.ts) | `admin.ts` | Admin dashboard stats |
| [`organizationRepository`](app/utils/repositories/organization.ts) | `organization.ts` | CRUD |
| [`seatRepository`](app/utils/repositories/seat.ts) | `seat.ts` | Seat assignments |

### Database Connection

The [`db`](app/utils/db.server.ts) export is a `PrismaClient` singleton (backed by `@prisma/adapter-pg`) augmented with two raw-SQL helpers:

```typescript
// app/utils/db.server.ts (simplified)
const prisma = new PrismaClient({ adapter: new PrismaPg(DATABASE_URL) });

export const db = prisma as PrismaClient & {
  async query(text: string, params?: unknown[]) {
    // Returns { rows, rowCount } via $queryRawUnsafe
    const rows = await prisma.$queryRawUnsafe(text, ...(params ?? []));
    return { rows, rowCount: rows.length };
  },
  async queryOne(text: string, params?: unknown[]) {
    // Returns first row or null
    const rows = await prisma.$queryRawUnsafe(text, ...(params ?? []));
    return rows[0] ?? null;
  },
};
```

All repositories use these helpers directly. There is no query builder layer; the Prisma client is used as a raw-SQL executor (its generated model API is reserved for `prisma/` seed and data-utility scripts).

---

## 6. Scheduling Pipeline

> **ℹ️ Extraction Note:** Detailed scheduling-specific documentation has been extracted to [`docs/SCHEDULING.md`](SCHEDULING.md), which serves as the single source of truth for the scheduling system. This section provides a high-level overview; refer to [`docs/SCHEDULING.md`](SCHEDULING.md) for complete details on the status lifecycle, pipeline phases, dnd-kit architecture, validation invariants, database schema, and key interfaces.

### Overview

The scheduling pipeline is the system's most complex algorithmic component. It automatically builds daily flight schedules from unassigned booking legs. The pipeline is orchestrated by [`buildSchedule(date)`](app/utils/scheduling/index.ts:30) in [`app/utils/scheduling/index.ts`](app/utils/scheduling/index.ts).

### Pipeline Phases

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     buildSchedule("2026-05-21")                         │
│                                                                         │
│  ┌──────────────┐                                                      │
│  │  Phase 1:    │  Cluster unassigned booking legs by date, origin,    │
│  │  CLUSTER     │  and destination. Groups legs that share the same    │
│  │              │  route into clusters that can be served by a single  │
│  │              │  sortie flight.                                      │
│  │              │  → cluster-bookings.ts: clusterBookings()            │
│  └──────┬───────┘                                                      │
│         ▼                                                              │
│  ┌──────────────┐                                                      │
│  │  Phase 2:    │  Build optimal sortie route using nearest-neighbor   │
│  │  ROUTE       │  heuristic. Route always starts and ends at Stanley  │
│  │              │  (PSY). Visits all aerodromes in the cluster in      │
│  │              │  the order that minimizes total distance.            │
│  │              │  → nearest-neighbor.ts: buildRoute()                 │
│  └──────┬───────┘                                                      │
│         ▼                                                              │
│  ┌──────────────┐                                                      │
│  │  Phase 3:    │  Assign aircraft to routes based on passenger count,      │
│  │  AIRCRAFT    │  payload capacity, fuel range, and aircraft availability. │
│  │              │  Evaluates all active aircraft and picks the best fit.    │
│  │              │  → assign-aircraft.ts: assignAircraftToRoutes()           │
│  │  └──────┬───────┘                                                      │
│  │         ▼                                                              │
│  │  ┌──────────────┐                                                      │
│  │  │  Phase 4:    │  Compute weight and balance for each flight leg.      │
│  │  │  WEIGHT &    │  Calculates passenger, baggage, freight, fuel, and    │
│  │  │  BALANCE     │  crew weights. Validates against MTOW and MLW.       │
│  │  │              │  Identifies binding constraints (fuel, payload, CG). │
│  │  │              │  → weight-balance.ts: computeWeightBalanceForRoute() │
│  │  └──────┬───────┘                                                      │
│  │         ▼                                                              │
│  │  ┌──────────────┐                                                      │
│  │  │  Phase 5:    │  Assign pilots to flights based on qualifications,    │
│  │  │  PILOTS      │  duty time limits, rest requirements, and            │
│  │  │              │  availability. Supports PIC and SIC roles.           │
│  │  │              │  → assign-pilots.ts: assignPilotsToRoutes()          │
│  │  └──────────────┘                                                      │
│  └──────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
```

### Phase Details

#### Phase 1: Clustering ([`cluster-bookings.ts`](app/utils/scheduling/cluster-bookings.ts))

Groups unassigned booking legs by a composite key of `date|origin|destination`. Each cluster represents a set of passengers who need to travel between the same two aerodromes on the same day. The clusterer counts passengers per cluster via [`bookingLegPassengerRepository.findByLegId()`](app/utils/repositories/booking-leg-passenger.ts:62).

```typescript
export interface ClusterResult {
  date: string;
  origin: string;
  destination: string;
  legs: BookingLegRow[];
  passengerCount: number;
}
```

#### Phase 2: Route Construction ([`nearest-neighbor.ts`](app/utils/scheduling/nearest-neighbor.ts))

Builds an optimal sortie route using the nearest-neighbor heuristic. The route always starts and ends at Stanley Airport (PSY). For each cluster, the algorithm:

1. Determines the set of aerodromes to visit
2. Starting from PSY, repeatedly visits the nearest unvisited aerodrome
3. Returns to PSY after all stops are completed
4. Uses cached [`aerodrome_distances`](migrations/archive/014_create_scheduling_tables.sql) and [`aerodrome_headings`](migrations/archive/014_create_scheduling_tables.sql) tables for navigation data
5. Assumes ~140 knots cruise speed (BN-2 Islander performance)

```typescript
export interface RouteResult {
  flight: FlightRow;
  stops: RouteStop[];
  totalDistanceNm: number;
  totalFlightTimeMinutes: number;
}

export interface RouteStop {
  aerodromeCode: string;
  legSequence: number;
  distanceNm: number;
  heading: number;
}
```

#### Phase 3: Aircraft Assignment ([`assign-aircraft.ts`](app/utils/scheduling/assign-aircraft.ts))

Evaluates all active aircraft against each route's requirements:

- **Passenger capacity** — seat count must accommodate all passengers
- **Payload capacity** — total passenger + baggage + freight weight must not exceed max payload
- **Fuel range** — aircraft must have sufficient range for the total route distance with reserves
- **Runway compatibility** — aircraft must be able to operate from all aerodromes on the route

Selects the best-fit aircraft per route. Marks assignments as infeasible with a reason if no aircraft meets requirements.

#### Phase 4: Weight & Balance ([`weight-balance.ts`](app/utils/scheduling/weight-balance.ts))

Computes detailed weight and balance for each flight leg:

- **Passenger weight** — sum of passenger clothed weights (from [`booking_leg_passengers`](migrations/archive/016_create_booking_leg_passengers.sql) junction records)
- **Baggage weight** — sum of baggage weights per leg
- **Freight weight** — sum of freight weights per leg
- **Fuel weight** — calculated based on leg distance, aircraft fuel consumption, and reserves
- **Crew weight** — standard crew weight allocation (PIC + SIC)
- **Empty weight** — aircraft empty weight from [`aircraft`](migrations/archive/001_create_tables.sql) table
- **CG position** — center of gravity position as percentage of mean aerodynamic chord
- **Binding constraints** — identifies the limiting factor (MTOW, MLW, CG envelope, fuel capacity)

```typescript
export interface WeightBalanceResult {
  flightLegId: number;
  passengerWeightKg: number;
  baggageWeightKg: number;
  freightWeightKg: number;
  fuelWeightKg: number;
  crewWeightKg: number;
  emptyWeightKg: number;
  totalWeightKg: number;
  totalMomentKgm: number;
  cgPositionPct: number;
  effectiveMtowKg: number;
  effectiveMlwKg: number;
  mtowUsedPct: number;
  mlwUsedPct: number;
  fuelPlan: FuelPlan;
  bindingConstraint: BindingConstraintInfo;
}
```

#### Phase 5: Pilot Assignment ([`assign-pilots.ts`](app/utils/scheduling/assign-pilots.ts))

Assigns pilots to each flight based on:

- **Qualifications** — pilot must hold valid ratings for the aircraft type
- **Duty time** — must not exceed maximum duty period limits
- **Rest requirements** — must have had adequate rest before duty
- **Availability** — pilot must not already be assigned to another flight at the same time
- **Role suitability** — PIC (Captain) vs SIC (First Officer) role assignment

```typescript
export interface PilotAssignmentResult {
  flightId: number;
  pilotId: number;
  role: PilotRole; // "pic" | "sic"
}

export interface PilotAvailability {
  pilotId: number;
  name: string;
  isAvailable: boolean;
  reason?: string;
}
```

### Schedule Build Result

The [`buildSchedule()`](app/utils/scheduling/index.ts:30) function returns a [`ScheduleBuildResult`](app/utils/scheduling/types.ts:136) containing all phase outputs:

```typescript
export interface ScheduleBuildResult {
  scheduleId: number;
  scheduleDate: string;
  clusters: ClusterResult[];
  routes: RouteResult[];
  aircraftAssignments: AircraftAssignmentResult[];
  weightBalances: WeightBalanceResult[];
  pilotAssignments: PilotAssignmentResult[];
  errors: string[];
  warnings: string[];
}
```

### Database Tables Created

The scheduling pipeline creates records in these tables (defined in [`migrations/archive/014_create_scheduling_tables.sql`](migrations/archive/014_create_scheduling_tables.sql)):

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `schedules` | Schedule header record | `id`, `schedule_date`, `status`, `created_by` |
| `flights` | Individual sortie flights | `id`, `flight_number`, `aircraft_id`, `schedule_id` |
| `flight_legs` | Legs within a flight route | `id`, `flight_id`, `leg_sequence`, `origin_code`, `destination_code`, `distance_nm` |
| `weight_balance_snapshots` | Per-leg weight/balance calculations | `id`, `flight_leg_id`, `schedule_id`, all weight columns, CG data |
| `pilot_assignments` | Pilot-to-flight assignments | `id`, `schedule_id`, `flight_id`, `pilot_id`, `role` |

### Schedule Status Lifecycle

The schedule status lifecycle is enforced by a database CHECK constraint on the `schedules` table (see [`migrations/consolidated/004-scheduling.sql`](migrations/consolidated/004-scheduling.sql:18)). The lifecycle consists of 6 stages:

```
                    ┌──────────┐
                    │  DRAFT   │
                    └────┬─────┘
                         │ auto-build
                    ┌────▼─────┐
              ┌─────│ BUILDING │◄──── revise ──────┐
              │     └────┬─────┘                    │
              │          │ approve                  │
              │     ┌────▼─────┐                    │
              │     │ APPROVED │──── revise ────────┤
              │     └────┬─────┘                    │
              │          │ publish                  │
              │     ┌────▼──────┐                   │
              │     │ PUBLISHED │──── revise ───────┤
              │     └────┬──────┘                   │
              │          │ (time passes)            │
              │     ┌────▼──────┐                   │
              │     │ COMPLETED │                   │
              │     └───────────┘                   │
              │                                     │
              └──── cancel ─────────────────────────┘
                         │
                    ┌────▼──────┐
                    │ CANCELLED │
                    └───────────┘
```

- **DRAFT** — Initial state when a schedule is created; no flights exist yet
- **BUILDING** — Schedule is being constructed by the pipeline; flights can be modified
- **APPROVED** — Schedule has been reviewed and approved by operations
- **PUBLISHED** — Schedule is visible to pilots and passengers
- **COMPLETED** — All flights in the schedule have been completed (terminal state)
- **CANCELLED** — Schedule was cancelled (terminal state)

> **Full details:** See [`docs/SCHEDULING.md`](SCHEDULING.md) for the complete status lifecycle including transition rules, permission gates, and handler locations.

---

## 7. Auth & Authorization

### Overview

The system implements Permission-Based Access Control (PBAC) with role-based grouping. Authorization is enforced in every route loader and action via the [`permissions.server.ts`](app/utils/permissions.server.ts) module.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AUTHENTICATION                               │
│                                                                     │
│  Session cookies (app/session.server.ts)                            │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  • Cookie-based sessions with encrypted data                  │  │
│  │  • Session stores userId                                      │  │
│  │  • Login sets session, logout destroys it                     │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      AUTHORIZATION (PBAC)                           │
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │    users      │───►│  user_roles  │◄───│       roles          │  │
│  │  (identities) │    │ (assignments)│    │  (role containers)   │  │
│  └──────────────┘    └──────────────┘    └───────────┬──────────┘  │
│                                                      │              │
│                                                      ▼              │
│                                              ┌──────────────┐      │
│                                              │role_permissions│     │
│                                              │  (mapping)    │     │
│                                              └───────┬───────┘      │
│                                                      │              │
│                                                      ▼              │
│                                              ┌──────────────┐      │
│                                              │  permissions  │      │
│                                              │ (resource:    │      │
│                                              │  action)      │      │
│                                              └──────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
```

### Database Schema (from [`migrations/archive/015_create_rbac_tables.sql`](migrations/archive/015_create_rbac_tables.sql))

```sql
-- Roles (grouping containers)
CREATE TABLE roles (
  id               SERIAL PRIMARY KEY,
  slug             VARCHAR(50)  NOT NULL UNIQUE,
  name             VARCHAR(100) NOT NULL,
  description      TEXT,
  hierarchy_level  INTEGER      NOT NULL DEFAULT 0,
  is_system        BOOLEAN      NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Permissions (granular resource:action pairs)
CREATE TABLE permissions (
  id          SERIAL PRIMARY KEY,
  resource    VARCHAR(100) NOT NULL,
  action      VARCHAR(100) NOT NULL,
  description TEXT,
  UNIQUE(resource, action)
);

-- Role-Permission mapping
CREATE TABLE role_permissions (
  role_id       INTEGER REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- User-Role assignment
CREATE TABLE user_roles (
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role_id    INTEGER REFERENCES roles(id) ON DELETE CASCADE,
  assigned_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id)
);

-- Audit log for permission changes
CREATE TABLE audit_log (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id),
  action      VARCHAR(100) NOT NULL,
  resource    VARCHAR(100),
  details     JSONB,
  ip_address  VARCHAR(45),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Permission Format

Permissions use the `resource:action` format:

| Resource | Actions | Example |
|----------|---------|---------|
| `booking` | `create`, `view`, `edit`, `cancel`, `manage-passengers` | `booking:create` |
| `checkin` | `process`, `view` | `checkin:process` |
| `flight` | `create`, `view`, `edit`, `schedule` | `flight:schedule` |
| `schedule` | `create`, `view`, `edit`, `publish`, `approve` | `schedule:publish` |
| `finance` | `view`, `reconcile`, `export`, `manage-invoices` | `finance:reconcile` |
| `payment` | `process`, `refund`, `view` | `payment:process` |
| `admin` | `manage-users`, `manage-roles`, `manage-aircraft`, `manage-aerodromes`, `manage-fares`, `view-audit-log` | `admin:manage-users` |
| `pilot` | `view-assignments`, `update-flight-status` | `pilot:view-assignments` |
| `report` | `view`, `export` | `report:view` |

### Default Roles

| Role | Slug | Hierarchy | Description |
|------|------|-----------|-------------|
| Administrator | `admin` | 100 | Full system access |
| Operations | `operations` | 80 | Booking management, scheduling, flight ops |
| Finance | `finance` | 70 | Payments, invoices, reconciliation, exports |
| Check-in Agent | `checkin` | 50 | Passenger check-in, boarding |
| Pilot | `pilot` | 40 | Flight assignments, status updates |
| Engineer | `engineer` | 30 | Aircraft maintenance, airframe hours |
| Passenger | `passenger` | 10 | Self-service bookings, own booking view |

### Core Authorization Functions

| Function | Purpose |
|----------|---------|
| [`requirePermission(request, "resource:action")`](app/utils/permissions.server.ts:46) | Throws redirect if user lacks permission; returns `PermissionUser` |
| [`requireAnyPermission(request, ["perm1", "perm2"])`](app/utils/permissions.server.ts:61) | Throws redirect if user lacks ALL listed permissions |
| [`requireAllPermissions(request, ["perm1", "perm2"])`](app/utils/permissions.server.ts:77) | Throws redirect if user lacks ANY listed permission |
| [`requireRole(request, "role-slug")`](app/utils/permissions.server.ts:98) | Throws redirect if user lacks role (backward compat) |
| [`requireAnyRole(request, ["role1", "role2"])`](app/utils/permissions.server.ts:114) | Throws redirect if user lacks ALL listed roles |
| [`hasPermission(userId, "resource:action")`](app/utils/permissions.server.ts:135) | Returns boolean (for UI rendering decisions) |
| [`getUserPermissions(userId)`](app/utils/permissions.server.ts:164) | Returns all permissions for a user (cached) |
| [`getUserRoles(userId)`](app/utils/permissions.server.ts:188) | Returns all roles for a user |

### Request-Scoped Caching

Permissions are cached per-user in a `Map<string, string[]>` keyed by `user:${userId}`. The cache is scoped to the server process lifetime and can be cleared via [`clearPermissionCache(userId?)`](app/utils/permissions.server.ts:21).

### Segregation of Duties (SoD)

The system enforces SoD rules to prevent conflicts of interest. Defined incompatible permission pairs include:

| Permission A | Permission B | Rationale |
|-------------|-------------|-----------|
| `payment:process` | `finance:reconcile` | Cannot process payments AND reconcile bank statements |
| `booking:create` | `booking:approve` | Cannot create AND approve the same booking |
| `admin:manage-users` | `finance:view` | Cannot manage users AND view financial data |

SoD validation is enforced via [`validateSoD(userId, permission)`](app/utils/permissions.server.ts:512) and [`validateAllSoD(userId)`](app/utils/permissions.server.ts:534) which check all existing permissions for conflicts before granting new ones.

### Approval Workflow (Dual Control)

Certain operations require dual-control approval via [`validateApproval(actorId, targetId)`](app/utils/permissions.server.ts:599):

- **No self-approval** — A user cannot approve their own actions
- **Hierarchy check** — Approver must have equal or higher hierarchy level
- **Audit trail** — All approvals are logged in the audit log

---

## 8. Payment Flow

### Overview

The payment system supports four payment methods: Stripe (online card), Invoice (credit terms), Pay-on-Departure, and Pay-on-Arrival. All payments create double-entry accounting journal entries.

### Payment Methods

| Method | Code | Description |
|--------|------|-------------|
| Stripe | `stripe` | Online card payment via Stripe Checkout Sessions |
| Invoice | `invoice` | Credit terms with 30-day net payment |
| Pay on Departure | `pay_on_departure` | Cash/card payment at departure |
| Pay on Arrival | `pay_on_arrival` | Cash/card payment at arrival |

### Payment Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       PAYMENT PROCESSING FLOW                           │
│                                                                         │
│  ┌──────────────┐                                                      │
│  │  Booking      │  User selects payment method on booking detail page  │
│  │  Created      │                                                      │
│  └──────┬───────┘                                                      │
│         │                                                              │
│         ▼                                                              │
│  ┌──────────────┐                                                      │
│  │  Select       │  Four options:                                       │
│  │  Method       │  ┌────────┐ ┌─────────┐ ┌───────────────┐ ┌───────┐ │
│  │              │  │ Stripe │ │ Invoice │ │ Pay on Depart │ │Pay on │ │
│  │              │  │        │ │         │ │ / Arrival     │ │Arrival│ │
│  │              │  └───┬────┘ └──┬──────┘ └───────┬───────┘ └───┬───┘ │
│  └──────────────┘      │         │                │              │     │
│         │              │         │                │              │     │
│         ▼              ▼         ▼                ▼              ▼     │
│  ┌───────────┐  ┌──────────┐ ┌────────┐ ┌──────────────┐ ┌──────────┐ │
│  │calculate  │  │ Stripe   │ │Generate│ │ Record       │ │ Record   │ │
│  │BookingCost│  │Checkout  │ │Invoice │ │ Offline      │ │ Offline  │ │
│  │           │  │Session   │ │        │ │ Selection    │ │ Selection│ │
│  └───────────┘  └────┬─────┘ └───┬────┘ └──────┬───────┘ └────┬─────┘ │
│                      │           │              │              │       │
│                      ▼           ▼              ▼              ▼       │
│              ┌──────────────────────────────────────────────┐          │
│              │         ACCOUNTING JOURNAL ENTRY             │          │
│              │                                              │          │
│              │  Dr. Accounts Receivable / Cash at Bank      │          │
│              │  Cr. Passenger Fare Revenue                  │          │
│              │                                              │          │
│              │  (Double-entry: every payment creates        │          │
│              │   balanced debit/credit lines)               │          │
│              └──────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Cost Calculation ([`payment.service.ts`](app/utils/services/payment.service.ts):33)

```typescript
export async function calculateBookingCost(bookingId: number): Promise<number> {
  // 1. Fetch booking legs and passengers
  const [legs, passengers] = await Promise.all([
    bookingLegRepository.findByBookingId(bookingId),
    bookingPassengerRepository.findByBookingId(bookingId),
  ]);

  // 2. For each leg, look up base fare from fare_route table
  // 3. Multiply fare per passenger by passenger count
  // 4. Add freight costs (£2/kg placeholder rate)
  // 5. Return total
}
```

### Stripe Integration ([`stripe.server.ts`](app/utils/stripe.server.ts))

- **Singleton pattern** — Stripe client is initialized once and reused (with HMR-safe global)
- **API version** — `"2026-04-22.dahlia"`
- **Checkout Sessions** — Created with `mode: "payment"`, currency GBP, amount in pence
- **Metadata** — Booking ID and payment UUID stored in session metadata for webhook correlation
- **Webhook** — [`api.stripe-webhook.ts`](app/routes/api.stripe-webhook.ts) handles `checkout.session.completed` events

### Payment Initiation ([`payment.service.ts`](app/utils/services/payment.service.ts):86)

```typescript
export async function initiateStripePayment(params: {
  bookingId: number;
  amount: number;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
  userId: number;
}): Promise<PaymentInitiationResult> {
  // 1. Update booking: payment_status = PROCESSING, payment_method = STRIPE
  // 2. Generate payment UUID
  // 3. Create Stripe Checkout Session with line items
  // 4. Store stripe_payments record
  // 5. Return session URL for redirect
}
```

### Invoice Generation ([`invoice.service.ts`](app/utils/services/invoice.service.ts):117)

```typescript
export async function generateInvoice(params: GenerateInvoiceParams): Promise<InvoiceResult> {
  // 1. Generate invoice number (sequential)
  // 2. Calculate subtotal, tax (0% — Falkland Islands), total
  // 3. Create invoice record (status: DRAFT)
  // 4. Create invoice line items
  // 5. Update booking: payment_status = INVOICED
  // 6. Return invoice ID
}
```

### Accounting Journal Entries

Every payment creates a double-entry journal entry with balanced debit and credit lines:

| Payment Method | Debit Account | Credit Account |
|---------------|---------------|----------------|
| Stripe | Accounts Receivable (1020) | Passenger Fare Revenue (4010) |
| Manual (Cash) | Cash at Bank (1010) | Passenger Fare Revenue (4010) |
| Invoice | Accounts Receivable (1020) | Passenger Fare Revenue (4010) |

Journal entries support:
- **Dual-control approval** — Entries require a second user to approve ([`approveJournalEntry()`](app/utils/services/invoice.service.ts:715))
- **Validation** — Entries must be balanced (total debits = total credits) via [`validateBalancedEntry()`](app/utils/services/invoice.service.ts:670)
- **Reversing entries** — Cancelled/voided invoices create reversing entries to nullify the original

### Payment Status Pipeline

```
PENDING ──► PROCESSING ──► PAID ──► RECONCILED
    │                           │
    └──► CANCELLED              └──► REFUNDED
```

- **PENDING** — Awaiting payment
- **PROCESSING** — Payment in progress (Stripe Checkout open)
- **PAID** — Payment completed successfully
- **RECONCILED** — Payment matched in bank reconciliation
- **CANCELLED** — Payment cancelled (terminal)
- **REFUNDED** — Payment refunded (terminal)

### Invoice Status Pipeline

```
DRAFT ──► ISSUED ──► PAID ──► RECONCILED
  │          │           │
  └──► CANCELLED         └──► VOID
```

- **DRAFT** — Invoice created but not yet sent to customer
- **ISSUED** — Invoice sent to customer, awaiting payment
- **PAID** — Full payment received against invoice
- **RECONCILED** — Payment matched in bank reconciliation
- **CANCELLED** — Invoice cancelled before issuance
- **VOID** — Invoice voided after issuance (creates reversing entry)

---

## Appendix: Key File Reference

| File | Purpose |
|------|---------|
| [`app/utils/db.server.ts`](app/utils/db.server.ts) | PrismaClient singleton (adapter-pg) and raw-SQL query helpers |
| [`app/utils/constants.ts`](app/utils/constants.ts) | All enums, permission constants, limits |
| [`app/utils/permissions.server.ts`](app/utils/permissions.server.ts) | PBAC authorization system |
| [`app/utils/stripe.server.ts`](app/utils/stripe.server.ts) | Stripe client singleton |
| [`app/utils/migrate.ts`](app/utils/migrate.ts) | Migration runner |
| [`app/utils/scheduling/index.ts`](app/utils/scheduling/index.ts) | Scheduling pipeline orchestrator |
| [`app/utils/services/payment.service.ts`](app/utils/services/payment.service.ts) | Payment processing service |
| [`app/utils/services/invoice.service.ts`](app/utils/services/invoice.service.ts) | Invoice and accounting service |
| [`app/utils/services/fare-calculator.ts`](app/utils/services/fare-calculator.ts) | Fare calculation service (per-leg/per-passenger breakdown) |
| [`app/utils/compute-stop-weights.ts`](app/utils/compute-stop-weights.ts) | Weight computation utility |
| [`app/utils/auth.server.ts`](app/utils/auth.server.ts) | Authentication helpers |
| [`app/utils/csrf.server.ts`](app/utils/csrf.server.ts) | CSRF protection |
| [`app/utils/form-data.ts`](app/utils/form-data.ts) | Form data parsing utilities |
| [`app/utils/dates.ts`](app/utils/dates.ts) | Date formatting utilities |
| [`app/styles/ticket-print.css`](app/styles/ticket-print.css) | Print stylesheet for flight ticket (A4 portrait) |
| [`app/session.server.ts`](app/session.server.ts) | Session configuration |