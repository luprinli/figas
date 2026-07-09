# FIGAS Data Model

> **Version**: 1.0  
> **Last Updated**: 2026-05-21  
> **Application**: FIGAS Flight Operations & Booking Management System

---

## Table of Contents

1. [Entity-Relationship Overview](#1-entity-relationship-overview)
2. [Core Tables](#2-core-tables)
3. [Scheduling Tables](#3-scheduling-tables)
4. [Payment & Accounting Tables](#4-payment--accounting-tables)
5. [Reference Tables](#5-reference-tables)
6. [Auth & RBAC Tables](#6-auth--rbac-tables)
7. [Migration History](#7-migration-history)
8. [Key Relationships](#8-key-relationships)

---

## 1. Entity-Relationship Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CORE BOOKING DOMAIN                               │
│                                                                             │
│  ┌──────────┐     ┌──────────────┐     ┌───────────────────┐               │
│  │  users   │1──N│  bookings    │1──N│  booking_legs     │               │
│  └──────────┘     │              │     │                   │               │
│                   │              │     │  (itinerary legs  │               │
│                   │              │     │   per booking)    │               │
│                   └──────┬───────┘     └────────┬──────────┘               │
│                          │                      │                          │
│                          │ 1              N ┌───┘                          │
│                          │                   │ N                           │
│                          │     ┌────────────────────────────┐              │
│                          │     │  booking_leg_passengers    │              │
│                          │     │  (junction table)          │              │
│                          │     │  - per-leg baggage         │              │
│                          │     │  - per-leg check-in        │              │
│                          │     │  - per-leg boarding        │              │
│                          │     │  - per-leg seat            │              │
│                          │     └──────────┬─────────────────┘              │
│                          │                │ N                              │
│                          │     ┌──────────┴──────────┐                     │
│                          └──N──│  booking_passengers │                     │
│                                │  (passenger data)   │                     │
│                                └─────────────────────┘                     │
│                                                                             │
│  ┌────────────────┐     ┌──────────────────┐                               │
│  │  organizations  │1──N│  bookings         │                               │
│  └────────────────┘     └──────────────────┘                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          SCHEDULING DOMAIN                                  │
│                                                                             │
│  ┌────────────┐     ┌──────────┐     ┌──────────────┐                      │
│  │ schedules  │1──N│  flights │1──N│  flight_legs  │                      │
│  └────────────┘     │          │     │              │                      │
│                     │          │     │ (sequenced    │                      │
│                     │          │     │  stops per    │                      │
│                     │          │     │  sortie)      │                      │
│                     └────┬─────┘     └──────────────┘                      │
│                          │                                                  │
│                          │ 1                                               │
│                          │                                                  │
│                     ┌────┴─────┐     ┌───────────────────┐                 │
│                     │ aircraft │     │ weight_balance_   │                 │
│                     │          │     │ snapshots         │                 │
│                     └──────────┘     │ (per-leg weight   │                 │
│                                      │  & balance calc)  │                 │
│  ┌────────┐     ┌──────────────┐     └───────────────────┘                 │
│  │ pilots │1──N│ pilot_       │                                            │
│  │        │     │ assignments  │                                            │
│  └────────┘     └──────────────┘                                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                       PAYMENT & ACCOUNTING DOMAIN                           │
│                                                                             │
│  ┌──────────┐     ┌──────────────┐     ┌──────────────────────┐            │
│  │ bookings │1──N│  payments    │     │  invoices            │            │
│  │          │     │              │     │                      │            │
│  │          │     │              │     │  ┌────────────────┐  │            │
│  │          │     │              │     │  │ invoice_items  │  │            │
│  └──────────┘     └──────┬───────┘     └──┴────────────────┴──┘            │
│                          │                                                  │
│                          │ 1                                               │
│                    ┌─────┴──────┐     ┌──────────────────────┐             │
│                    │ stripe_    │     │ accounting_journal_  │             │
│                    │ payments   │     │ entries              │             │
│                    └────────────┘     │                      │             │
│                                       │  ┌────────────────┐  │             │
│                                       │  │ journal_lines  │  │             │
│                                       └──┴────────────────┴──┘             │
│                                                                             │
│  ┌──────────────────┐     ┌──────────────────────┐                         │
│  │ chart_of_accounts │1──N│ accounting_journal_  │                         │
│  │                   │     │ lines                │                         │
│  └──────────────────┘     └──────────────────────┘                         │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          AUTH DOMAIN                                        │
│                                                                             │
│  ┌──────────┐     ┌──────────────┐     ┌───────────────────┐               │
│  │  users   │1──N│  user_roles  │N──1│  roles            │               │
│  └──────────┘     └──────────────┘     └────────┬──────────┘               │
│                                                  │ N                        │
│                                                  │                          │
│                                            ┌─────┴──────────┐              │
│                                            │ role_          │              │
│                                            │ permissions    │              │
│                                            └─────┬──────────┘              │
│                                                  │ N                        │
│                                            ┌─────┴──────────┐              │
│                                            │  permissions   │              │
│                                            └────────────────┘              │
│                                                                             │
│  ┌────────────┐                                                            │
│  │ audit_log  │                                                            │
│  └────────────┘                                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Tables

### [`users`](migrations/archive/001_create_tables.sql:16)

The user accounts table stores all system users — passengers, staff, pilots, and administrators.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `name` | `VARCHAR(255)` | Full name |
| `email` | `VARCHAR(255) UNIQUE` | Email address (login identifier) |
| `password` | `VARCHAR(255)` | Hashed password (bcrypt) |
| `role` | `VARCHAR(50)` | Legacy role column (migrating to PBAC) |
| `is_active` | `BOOLEAN` | Account active status |
| `phone` | `VARCHAR(50)` | Phone number |
| `date_of_birth` | `DATE` | Date of birth |
| `residency` | `VARCHAR(50)` | Residency status (formerly `residency_status`) |
| `id_document_type` | `VARCHAR(50)` | ID document type |
| `id_document_number` | `VARCHAR(100)` | ID document number |
| `nationality` | `VARCHAR(100)` | Nationality |
| `emergency_contact_name` | `VARCHAR(255)` | Emergency contact |
| `emergency_contact_phone` | `VARCHAR(50)` | Emergency contact phone |
| `clothed_body_weight_kg` | `NUMERIC(5,1)` | Default clothed weight |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

### [`bookings`](migrations/archive/001_create_tables.sql:161)

The central booking record. Each booking represents a travel request from a user.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `booking_reference` | `VARCHAR(20) UNIQUE` | Human-readable reference (e.g., `FIG-ABC123`) |
| `user_id` | `INTEGER FK → users` | Booking creator |
| `status` | `VARCHAR(50)` | Booking status (see pipeline below) |
| `organization_id` | `INTEGER FK → organizations` | Optional organization |
| `is_organization_billing` | `BOOLEAN` | Organization billing flag |
| `total_amount` | `NUMERIC(10,2)` | Total amount (legacy) |
| `total_amount_gbp` | `NUMERIC(10,2)` | Total amount in GBP |
| `payment_status` | `VARCHAR(50)` | Payment status |
| `payment_method` | `VARCHAR(50)` | Selected payment method |
| `payment_date` | `TIMESTAMPTZ` | When payment was completed |
| `notes` | `TEXT` | Internal notes |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

**Booking Status Pipeline:**
```
PENDING ──► CONFIRMED ──► PILOT_REVIEW ──► APPROVED ──► COMPLETED
    │                                                    │
    └──► CANCELLED ◄─────────────────────────────────────┘
```

### [`booking_legs`](migrations/archive/001_create_tables.sql:181)

Individual legs of a booking's itinerary. A booking can have multiple legs (e.g., Stanley → Mount Pleasant → Stanley).

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `booking_id` | `INTEGER FK → bookings` | Parent booking |
| `flight_id` | `INTEGER FK → flights` | Assigned flight (nullable until scheduled) |
| `origin_code` | `VARCHAR(10) FK → aerodromes(code)` | Origin aerodrome |
| `destination_code` | `VARCHAR(10) FK → aerodromes(code)` | Destination aerodrome |
| `leg_date` | `DATE` | Date of travel |
| `departure_date` | `DATE` | Alternative departure date |
| `preferred_time` | `TIME` | Preferred departure time |
| `preferred_time_start` | `TIME` | Preferred time window start |
| `preferred_time_end` | `TIME` | Preferred time window end |
| `leg_sequence` | `INTEGER` | Order within booking (0, 1, 2...) |
| `status` | `VARCHAR(50)` | Leg status |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

### [`booking_passengers`](migrations/archive/016_create_booking_leg_passengers.sql:8)

Passenger personal data. Renamed from `passengers` in migration 016. Each passenger belongs to a booking.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `booking_id` | `INTEGER FK → bookings` | Parent booking |
| `user_id` | `INTEGER FK → users` | Optional linked user account |
| `first_name` | `VARCHAR(100)` | First name |
| `last_name` | `VARCHAR(100)` | Last name |
| `email` | `VARCHAR(255)` | Email address |
| `phone` | `VARCHAR(50)` | Phone number |
| `date_of_birth` | `DATE` | Date of birth |
| `clothed_weight_kg` | `NUMERIC(5,1)` | Clothed weight (formerly `clothed_body_weight_kg`) |
| `residency` | `VARCHAR(50)` | Residency status (formerly `residency_status`) |
| `special_requirements` | `TEXT` | Special requirements |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

### [`booking_leg_passengers`](migrations/archive/016_create_booking_leg_passengers.sql:17)

The junction table that creates a many-to-many relationship between booking legs and passengers. This is the linchpin of the data model, enabling per-leg baggage, check-in, boarding, and seat assignment.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `booking_leg_id` | `INTEGER FK → booking_legs` | Booking leg |
| `booking_passenger_id` | `INTEGER FK → booking_passengers` | Passenger |
| `clothed_weight_kg` | `NUMERIC(5,1)` | Per-leg weight override |
| `baggage_weight_kg` | `NUMERIC(5,1)` | Per-leg baggage weight |
| `baggage_description` | `TEXT` | Baggage description |
| `freight_description` | `TEXT` | Freight description |
| `freight_weight_kg` | `NUMERIC(8,1)` | Per-leg freight weight |
| `seat_number` | `VARCHAR(10)` | Seat assignment |
| `checked_in` | `BOOLEAN` | Check-in status |
| `checked_in_at` | `TIMESTAMPTZ` | Check-in timestamp |
| `checked_in_by` | `INTEGER FK → users` | Check-in agent |
| `boarded` | `BOOLEAN` | Boarding status |
| `boarded_at` | `TIMESTAMPTZ` | Boarding timestamp |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

**Unique constraint:** `(booking_leg_id, booking_passenger_id)` — a passenger can only be linked to a specific leg once.

### [`flights`](migrations/archive/001_create_tables.sql:129)

Scheduled sortie flights. A flight represents one aircraft's journey through multiple legs (stops).

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `flight_number` | `VARCHAR(20) UNIQUE` | Flight identifier (e.g., `FIG-20260518-001`) |
| `origin_aerodrome_id` | `INTEGER FK → aerodromes` | Departure aerodrome |
| `destination_aerodrome_id` | `INTEGER FK → aerodromes` | Final destination |
| `aircraft_id` | `INTEGER FK → aircraft` | Assigned aircraft |
| `pilot_id` | `INTEGER FK → pilots` | Legacy pilot assignment |
| `departure_time` | `TIMESTAMPTZ` | Scheduled departure |
| `arrival_time` | `TIMESTAMPTZ` | Scheduled arrival |
| `status` | `VARCHAR(50)` | Flight status |
| `available_seats` | `INTEGER` | Available seat count |
| `base_fare` | `NUMERIC(10,2)` | Base fare |
| `intermediate_stops` | `JSONB` | Legacy stops (replaced by flight_legs) |
| `total_passenger_weight_kg` | `NUMERIC(8,1)` | Total passenger weight |
| `total_baggage_weight_kg` | `NUMERIC(8,1)` | Total baggage weight |
| `total_freight_weight_kg` | `NUMERIC(8,1)` | Total freight weight |
| `total_fuel_weight_kg` | `NUMERIC(8,1)` | Total fuel weight |
| `schedule_id` | `INTEGER FK → schedules` | Parent schedule (added in migration 014) |
| `pilot_approved_at` | `TIMESTAMPTZ` | Pilot approval timestamp |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

### [`organizations`](migrations/archive/001_create_tables.sql:80)

Corporate and group booking entities.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `name` | `VARCHAR(255)` | Organization name |
| `code` | `VARCHAR(50) UNIQUE` | Short code |
| `contact_email` | `VARCHAR(255)` | Contact email |
| `contact_phone` | `VARCHAR(50)` | Contact phone |
| `billing_address` | `TEXT` | Billing address |
| `credit_limit_gbp` | `NUMERIC(10,2)` | Credit limit |
| `is_active` | `BOOLEAN` | Active status |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

---

## 3. Scheduling Tables

> **ℹ️ Extraction Note:** Detailed scheduling-specific documentation has been extracted to [`docs/SCHEDULING.md`](SCHEDULING.md). This section provides the database schema for scheduling tables; refer to [`docs/SCHEDULING.md`](SCHEDULING.md) for the complete scheduling reference including status lifecycle, pipeline phases, and key interfaces.

### [`schedules`](migrations/consolidated/004-scheduling.sql:14)

Daily schedule grouping with pipeline status tracking. The `status` column uses the `ScheduleStatus` enum with 6 valid values.

**ScheduleStatus Enum:** `draft` | `building` | `approved` | `published` | `completed` | `cancelled`

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `schedule_date` | `DATE` | Schedule date |
| `status` | `VARCHAR(50)` | Status: `draft`, `building`, `approved`, `published`, `completed`, `cancelled` (enforced by CHECK constraint — see [`migrations/consolidated/004-scheduling.sql`](migrations/consolidated/004-scheduling.sql:18)) |
| `notes` | `TEXT` | Schedule notes |
| `created_by` | `INTEGER FK → users` | Creator |
| `approved_by` | `INTEGER FK → users` | Approver |
| `approved_at` | `TIMESTAMPTZ` | Approval timestamp |
| `published_by` | `INTEGER FK → users` | Publisher |
| `published_at` | `TIMESTAMPTZ` | Publication timestamp |
| `cancelled_by` | `INTEGER FK → users` | Canceller |
| `cancelled_at` | `TIMESTAMPTZ` | Cancellation timestamp |
| `cancellation_reason` | `TEXT` | Reason for cancellation |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

### [`flight_legs`](migrations/archive/014_create_scheduling_tables.sql:49)

Sequenced stops for a sortie flight. Replaces the `intermediate_stops` JSONB column on the `flights` table.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `flight_id` | `INTEGER FK → flights` | Parent flight |
| `leg_sequence` | `INTEGER` | Order within flight (1, 2, 3...) |
| `origin_code` | `VARCHAR(10) FK → aerodromes(code)` | Departure aerodrome |
| `destination_code` | `VARCHAR(10) FK → aerodromes(code)` | Arrival aerodrome |
| `departure_time` | `TIMESTAMPTZ` | Actual/scheduled departure |
| `arrival_time` | `TIMESTAMPTZ` | Actual/scheduled arrival |
| `distance_nm` | `NUMERIC(7,1)` | Leg distance in nautical miles |
| `heading` | `NUMERIC(5,1)` | Leg heading in degrees |
| `status` | `VARCHAR(50)` | Status: `scheduled`, `in_progress`, `completed`, `cancelled` |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

### [`weight_balance_snapshots`](migrations/archive/014_create_scheduling_tables.sql:81)

Per-leg weight and balance calculations computed during the scheduling pipeline. Stores effective limits (MIN of aircraft + aerodrome constraints) so recomputation is not needed at loadsheet time.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `flight_leg_id` | `INTEGER FK → flight_legs` | Flight leg |
| `schedule_id` | `INTEGER FK → schedules` | Parent schedule |
| `passenger_weight_kg` | `NUMERIC(8,1)` | Sum of passenger weights |
| `baggage_weight_kg` | `NUMERIC(8,1)` | Sum of baggage weights |
| `freight_weight_kg` | `NUMERIC(8,1)` | Sum of freight weights |
| `fuel_weight_kg` | `NUMERIC(8,1)` | Calculated fuel weight |
| `crew_weight_kg` | `NUMERIC(8,1)` | Standard crew allocation |
| `empty_weight_kg` | `NUMERIC(8,1)` | Aircraft empty weight |
| `total_weight_kg` | `NUMERIC(8,1)` | Total weight (all components) |
| `required_fuel_kg` | `NUMERIC(8,1)` | Fuel required for leg |
| `minimum_fuel_kg` | `NUMERIC(8,1)` | Minimum fuel with reserves |
| `fuel_state` | `VARCHAR(50)` | Fuel state description |
| `fuel_rule_applied` | `VARCHAR(100)` | Which fuel rule was used |
| `total_moment_kgm` | `NUMERIC(10,2)` | Total moment for CG calculation |
| `cg_position_pct` | `NUMERIC(5,2)` | CG position as % of MAC |
| `effective_mtow_kg` | `NUMERIC(7,1)` | Effective MTOW (min of aircraft + aerodrome) |
| `effective_mlw_kg` | `NUMERIC(7,1)` | Effective MLW (min of aircraft + aerodrome) |
| `mtow_used_pct` | `NUMERIC(5,1)` | MTOW utilization percentage |
| `mlw_used_pct` | `NUMERIC(5,1)` | MLW utilization percentage |
| `binding_constraint` | `VARCHAR(100)` | Limiting factor (MTOW, MLW, CG, fuel) |
| `binding_constraint_detail` | `TEXT` | Detailed constraint explanation |
| `computed_by` | `VARCHAR(100)` | Computation source |
| `computed_at` | `TIMESTAMPTZ` | Computation timestamp |
| `notes` | `TEXT` | Additional notes |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

### [`pilot_assignments`](migrations/archive/014_create_scheduling_tables.sql:135)

Pilot-to-flight assignments with status tracking.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `schedule_id` | `INTEGER FK → schedules` | Parent schedule |
| `flight_id` | `INTEGER FK → flights` | Assigned flight |
| `pilot_id` | `INTEGER FK → pilots` | Assigned pilot |
| `role` | `VARCHAR(50)` | Role: `captain`, `first_officer`, `relief` |
| `status` | `VARCHAR(50)` | Status: `assigned`, `confirmed`, `declined`, `checked_in`, `completed` |
| `confirmed_at` | `TIMESTAMPTZ` | Confirmation timestamp |
| `declined_at` | `TIMESTAMPTZ` | Decline timestamp |
| `declined_reason` | `TEXT` | Reason for declining |
| `notes` | `TEXT` | Assignment notes |
| `assigned_by` | `INTEGER FK → users` | Assigning user |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

### Aircraft Scheduling Extensions (added in [`migrations/014_create_scheduling_tables.sql:169`](migrations/archive/014_create_scheduling_tables.sql:169))

| Column | Table | Description |
|--------|-------|-------------|
| `max_ramp_weight_kg` | `aircraft` | Maximum ramp weight |
| `max_landing_weight_kg` | `aircraft` | Maximum landing weight |
| `cg_arm_m` | `aircraft` | CG arm in meters |
| `fuel_flow_kg_per_hour` | `aircraft` | Fuel consumption rate |
| `cruise_speed_ktas` | `aircraft` | Cruise speed in knots TAS |

### Pilot Scheduling Extensions (added in [`migrations/014_create_scheduling_tables.sql:187`](migrations/archive/014_create_scheduling_tables.sql:187))

| Column | Table | Description |
|--------|-------|-------------|
| `max_duty_hours_per_day` | `pilots` | Maximum duty period |
| `max_flight_hours_per_day` | `pilots` | Maximum flight time |
| `current_duty_hours` | `pilots` | Current duty hours (reset daily) |
| `current_flight_hours` | `pilots` | Current flight hours (reset daily) |
| `last_medical_date` | `pilots` | Last medical examination |
| `next_medical_due` | `pilots` | Next medical due date |

### Aerodrome Scheduling Extensions (added in [`migrations/014_create_scheduling_tables.sql:208`](migrations/archive/014_create_scheduling_tables.sql:208))

| Column | Table | Description |
|--------|-------|-------------|
| `mtow_limit_kg` | `aerodromes` | Aerodrome MTOW limit |
| `mlw_limit_kg` | `aerodromes` | Aerodrome MLW limit |
| `fuel_available` | `aerodromes` | Fuel availability |
| `operating_hours` | `aerodromes` | Operating hours |
| `pilot_briefing_required` | `aerodromes` | Briefing requirement |

---

## 4. Payment & Accounting Tables

### [`payment_methods`](migrations/archive/006_create_payment_methods.sql:9)

Reference table for available payment methods.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `UUID PK` | Primary key |
| `code` | `VARCHAR(50) UNIQUE` | Method code |
| `name` | `VARCHAR(100)` | Display name |
| `description` | `TEXT` | Description |
| `is_active` | `BOOLEAN` | Active status |
| `requires_online` | `BOOLEAN` | Requires online payment gateway |
| `requires_invoice` | `BOOLEAN` | Requires invoice generation |
| `sort_order` | `INTEGER` | Display order |

**Seeded methods:** `stripe`, `pay_on_departure`, `pay_on_arrival`, `invoice`, `bank_transfer`

### [`payments`](migrations/archive/001_create_tables.sql:319)

Payment records linked to bookings.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `booking_id` | `INTEGER FK → bookings` | Related booking |
| `amount` | `NUMERIC(10,2)` | Payment amount (legacy) |
| `amount_gbp` | `NUMERIC(10,2)` | Payment amount in GBP |
| `method` | `VARCHAR(50)` | Payment method (legacy) |
| `payment_method` | `VARCHAR(50)` | Payment method code |
| `status` | `VARCHAR(50)` | Payment status |
| `transaction_id` | `VARCHAR(255)` | External transaction ID |
| `transaction_reference` | `VARCHAR(255)` | Transaction reference |
| `paid_at` | `TIMESTAMPTZ` | Payment timestamp |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

### [`stripe_payments`](migrations/archive/010_create_stripe_payments.sql:10)

Stripe-specific payment tracking.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `UUID PK` | Primary key |
| `payment_id` | `INTEGER FK → payments` | Related payment record |
| `stripe_session_id` | `VARCHAR(255) UNIQUE` | Stripe Checkout Session ID |
| `stripe_payment_intent_id` | `VARCHAR(255)` | Stripe Payment Intent ID |
| `stripe_customer_id` | `VARCHAR(255)` | Stripe Customer ID |
| `amount_gbp` | `DECIMAL(10,2)` | Amount in GBP |
| `currency` | `VARCHAR(3)` | Currency code |
| `status` | `VARCHAR(30)` | Stripe payment status |
| `payment_method_details` | `JSONB` | Payment method details |
| `receipt_url` | `TEXT` | Receipt URL |
| `refund_amount_gbp` | `DECIMAL(10,2)` | Refunded amount |
| `refunded_at` | `TIMESTAMPTZ` | Refund timestamp |
| `error_message` | `TEXT` | Error details |
| `idempotency_key` | `VARCHAR(255)` | Idempotency key |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

### [`invoices`](migrations/archive/007_create_invoices.sql:10)

Invoice records for credit-based payments.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `UUID PK` | Primary key |
| `invoice_number` | `VARCHAR(20) UNIQUE` | Sequential invoice number |
| `booking_id` | `INTEGER FK → bookings` | Related booking |
| `organization_id` | `INTEGER FK → organizations` | Billed organization |
| `user_id` | `INTEGER FK → users` | Billed user |
| `status` | `VARCHAR(20)` | Status: `draft`, `issued`, `paid`, `overdue`, `cancelled`, `written_off` |
| `issue_date` | `DATE` | Issue date |
| `due_date` | `DATE` | Payment due date |
| `paid_at` | `TIMESTAMPTZ` | Payment timestamp |
| `subtotal_gbp` | `DECIMAL(10,2)` | Subtotal |
| `tax_rate` | `DECIMAL(5,2)` | Tax rate (0% for Falkland Islands) |
| `tax_amount_gbp` | `DECIMAL(10,2)` | Tax amount |
| `total_gbp` | `DECIMAL(10,2)` | Total amount |
| `amount_paid_gbp` | `DECIMAL(10,2)` | Amount paid |
| `amount_due_gbp` | `DECIMAL(10,2)` | Generated: `total_gbp - amount_paid_gbp` |
| `currency` | `VARCHAR(3)` | Currency |
| `notes` | `TEXT` | Invoice notes |
| `created_by` | `INTEGER FK → users` | Creator |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

### [`invoice_items`](migrations/archive/007_create_invoices.sql:37)

Line items within an invoice.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `UUID PK` | Primary key |
| `invoice_id` | `UUID FK → invoices` | Parent invoice |
| `description` | `TEXT` | Item description |
| `quantity` | `INTEGER` | Quantity |
| `unit_price_gbp` | `DECIMAL(10,2)` | Unit price |
| `line_total_gbp` | `DECIMAL(10,2)` | Generated: `quantity * unit_price_gbp` |
| `type` | `VARCHAR(30)` | Type: `fare`, `passenger_fee`, `freight`, `fuel_surcharge`, `cargo`, `baggage`, `cancellation_fee`, `adjustment`, `other` |
| `reference_type` | `VARCHAR(30)` | Reference entity type |
| `reference_id` | `UUID` | Reference entity ID |
| `sort_order` | `INTEGER` | Display order |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |

### [`chart_of_accounts`](migrations/archive/008_create_accounting_journal.sql:11)

Chart of accounts for double-entry bookkeeping.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `UUID PK` | Primary key |
| `account_code` | `VARCHAR(10) UNIQUE` | Account code (e.g., `1010`, `4010`) |
| `account_name` | `VARCHAR(100)` | Account name |
| `account_type` | `VARCHAR(20)` | Type: `asset`, `liability`, `equity`, `revenue`, `expense` |
| `is_active` | `BOOLEAN` | Active status |
| `description` | `TEXT` | Description |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |

**Seeded accounts (20 total):**

| Code | Name | Type |
|------|------|------|
| `1010` | Cash at Bank | Asset |
| `1020` | Accounts Receivable | Asset |
| `1030` | Prepaid Expenses | Asset |
| `2010` | Accounts Payable | Liability |
| `2020` | Deferred Revenue | Liability |
| `2030` | VAT/GST Payable | Liability |
| `3010` | Retained Earnings | Equity |
| `3020` | Current Year Earnings | Equity |
| `4010` | Passenger Fare Revenue | Revenue |
| `4020` | Freight/Cargo Revenue | Revenue |
| `4030` | Baggage Fee Revenue | Revenue |
| `4040` | Fuel Surcharge Revenue | Revenue |
| `4050` | Cancellation Fee Revenue | Revenue |
| `4060` | Other Revenue | Revenue |
| `5010` | Fuel Expense | Expense |
| `5020` | Maintenance Expense | Expense |
| `5030` | Staff Costs | Expense |
| `5040` | Landing & Handling Fees | Expense |
| `5050` | Insurance Expense | Expense |
| `5060` | Bank Charges & Processing Fees | Expense |

### [`accounting_journal_entries`](migrations/archive/008_create_accounting_journal.sql:59)

Journal entry headers for double-entry accounting.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `UUID PK` | Primary key |
| `entry_number` | `VARCHAR(30) UNIQUE` | Entry number (e.g., `STR-1712345678901`) |
| `entry_type` | `VARCHAR(30)` | Type: `payment`, `refund`, `invoice_issued`, `invoice_payment`, `reconciliation`, `fee`, `adjustment` |
| `description` | `TEXT` | Entry description |
| `booking_id` | `INTEGER FK → bookings` | Related booking |
| `invoice_id` | `UUID FK → invoices` | Related invoice |
| `payment_id` | `INTEGER FK → payments` | Related payment |
| `entry_date` | `DATE` | Accounting date |
| `posting_date` | `DATE` | Posting date |
| `created_by` | `INTEGER FK → users` | Creator |
| `approved_by` | `INTEGER FK → users` | Approver (dual control) |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

### [`accounting_journal_lines`](migrations/archive/008_create_accounting_journal.sql:78)

Individual debit/credit lines within a journal entry.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `UUID PK` | Primary key |
| `entry_id` | `UUID FK → accounting_journal_entries` | Parent entry |
| `account_id` | `UUID FK → chart_of_accounts` | Account |
| `debit_amount_gbp` | `DECIMAL(10,2)` | Debit amount (≥ 0) |
| `credit_amount_gbp` | `DECIMAL(10,2)` | Credit amount (≥ 0) |
| `description` | `TEXT` | Line description |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |

**Constraints:**
- `debit_amount_gbp >= 0 AND credit_amount_gbp >= 0`
- Each line must have at least one side: `NOT (debit = 0 AND credit = 0)`
- A line cannot be both debit AND credit: `NOT (debit > 0 AND credit > 0)`

### [`checkin_reminders`](migrations/archive/001_create_tables.sql:247)

Check-in reminder scheduling and tracking.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `flight_id` | `INTEGER FK → flights` | Related flight |
| `booking_id` | `INTEGER FK → bookings` | Related booking |
| `scheduled_at` | `TIMESTAMPTZ` | When to send reminder |
| `sent_at` | `TIMESTAMPTZ` | When reminder was sent |
| `status` | `VARCHAR(50)` | Reminder status |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

### [`notifications`](migrations/archive/001_create_tables.sql:261)

Notification log for all system notifications.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `booking_id` | `INTEGER FK → bookings` | Related booking |
| `flight_id` | `INTEGER FK → flights` | Related flight |
| `type` | `VARCHAR(100)` | Notification type |
| `recipient_email` | `VARCHAR(255)` | Email recipient |
| `recipient_phone` | `VARCHAR(50)` | SMS recipient |
| `recipient_type` | `VARCHAR(50)` | Recipient category |
| `subject` | `VARCHAR(255)` | Subject line |
| `message` | `TEXT` | Message body |
| `status` | `VARCHAR(50)` | Delivery status |
| `sent_at` | `TIMESTAMPTZ` | Sent timestamp |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

### [`flight_manifests`](migrations/archive/001_create_tables.sql:281)

Flight manifest records with weight summary and pilot sign-off.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `flight_id` | `INTEGER FK → flights` | Related flight |
| `total_passengers` | `INTEGER` | Passenger count |
| `total_passenger_weight_kg` | `NUMERIC(8,1)` | Total passenger weight |
| `total_baggage_weight_kg` | `NUMERIC(8,1)` | Total baggage weight |
| `total_freight_weight_kg` | `NUMERIC(8,1)` | Total freight weight |
| `total_fuel_weight_kg` | `NUMERIC(8,1)` | Total fuel weight |
| `total_weight_kg` | `NUMERIC(8,1)` | Total weight |
| `aircraft_max_takeoff_weight_kg` | `NUMERIC(7,1)` | Aircraft MTOW |
| `weight_balance_percentage` | `NUMERIC(5,1)` | Weight balance % |
| `pilot_signoff` | `BOOLEAN` | Pilot sign-off status |
| `pilot_id` | `INTEGER FK → pilots` | Signing pilot |
| `signed_off_at` | `TIMESTAMPTZ` | Sign-off timestamp |
| `notes` | `TEXT` | Manifest notes |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

### [`seat_assignments`](migrations/archive/001_create_tables.sql:230)

Seat assignments per flight.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `flight_id` | `INTEGER FK → flights` | Related flight |
| `passenger_id` | `INTEGER FK → booking_passengers` | Passenger |
| `seat_number` | `VARCHAR(10)` | Seat identifier |
| `assigned_by` | `VARCHAR(50)` | Assigning entity |
| `assigned_at` | `TIMESTAMPTZ` | Assignment timestamp |
| `row_number` | `INTEGER` | Row number |
| `column_letter` | `VARCHAR(5)` | Column letter |
| `is_available` | `BOOLEAN` | Availability flag |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

### [`system_settings`](migrations/archive/001_create_tables.sql:307)

Key-value settings store for system configuration.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `key` | `VARCHAR(255) UNIQUE` | Setting key |
| `value` | `TEXT` | Setting value |
| `description` | `VARCHAR(255)` | Description |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

---

## 5. Reference Tables

### [`aerodromes`](migrations/archive/001_create_tables.sql:40)

Airports and airstrips across the Falkland Islands.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `code` | `VARCHAR(10) UNIQUE` | ICAO/IATA code (e.g., `PSY`, `MPN`) |
| `name` | `VARCHAR(255)` | Full name |
| `city` | `VARCHAR(255)` | City/location |
| `runway_length` | `NUMERIC(6,1)` | Runway length in meters |
| `runway_type` | `VARCHAR(50)` | Runway surface type |
| `latitude` | `NUMERIC(9,6)` | Latitude |
| `longitude` | `NUMERIC(9,6)` | Longitude |
| `timezone` | `VARCHAR(50)` | Timezone (default: `Atlantic/Stanley`) |
| `is_active` | `BOOLEAN` | Active status |
| `mtow_limit_kg` | `NUMERIC(7,1)` | MTOW limit (scheduling extension) |
| `mlw_limit_kg` | `NUMERIC(7,1)` | MLW limit (scheduling extension) |
| `fuel_available` | `BOOLEAN` | Fuel availability |
| `operating_hours` | `VARCHAR(100)` | Operating hours |
| `pilot_briefing_required` | `BOOLEAN` | Briefing requirement |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

### [`aircraft`](migrations/archive/001_create_tables.sql:58)

Aircraft fleet registry.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `registration` | `VARCHAR(20) UNIQUE` | Aircraft registration (e.g., `VP-FBZ`) |
| `type` | `VARCHAR(100)` | Aircraft type |
| `manufacturer` | `VARCHAR(100)` | Manufacturer |
| `model` | `VARCHAR(100)` | Model |
| `year` | `INTEGER` | Year of manufacture |
| `seat_count` | `INTEGER` | Passenger seats |
| `empty_weight_kg` | `NUMERIC(7,1)` | Empty operating weight |
| `max_takeoff_weight_kg` | `NUMERIC(7,1)` | MTOW |
| `max_payload_kg` | `NUMERIC(7,1)` | Maximum payload |
| `fuel_capacity_kg` | `NUMERIC(7,1)` | Fuel capacity |
| `max_freight_weight` | `NUMERIC(10,2)` | Max freight weight |
| `is_active` | `BOOLEAN` | Active status |
| `max_ramp_weight_kg` | `NUMERIC(7,1)` | Max ramp weight (scheduling) |
| `max_landing_weight_kg` | `NUMERIC(7,1)` | MLW (scheduling) |
| `cg_arm_m` | `NUMERIC(5,2)` | CG arm (scheduling) |
| `fuel_flow_kg_per_hour` | `NUMERIC(6,1)` | Fuel flow (scheduling) |
| `cruise_speed_ktas` | `NUMERIC(5,1)` | Cruise speed (scheduling) |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

### [`pilots`](migrations/archive/001_create_tables.sql:97)

Pilot records with licensing and scheduling data.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `user_id` | `INTEGER FK → users` | Linked user account |
| `name` | `VARCHAR(255)` | Pilot name |
| `email` | `VARCHAR(255)` | Email |
| `license_number` | `VARCHAR(100)` | License number |
| `license_type` | `VARCHAR(50)` | License type |
| `medical_expiry` | `DATE` | Medical certificate expiry |
| `rating` | `VARCHAR(100)` | Aircraft ratings |
| `is_active` | `BOOLEAN` | Active status |
| `max_duty_hours_per_day` | `NUMERIC(4,1)` | Max duty hours (scheduling) |
| `max_flight_hours_per_day` | `NUMERIC(4,1)` | Max flight hours (scheduling) |
| `current_duty_hours` | `NUMERIC(4,1)` | Current duty hours |
| `current_flight_hours` | `NUMERIC(4,1)` | Current flight hours |
| `last_medical_date` | `DATE` | Last medical date |
| `next_medical_due` | `DATE` | Next medical due |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

### [`fare_routes`](migrations/archive/001_create_tables.sql:114)

Fare pricing between aerodrome pairs.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `origin_code` | `VARCHAR(10) FK → aerodromes(code)` | Origin |
| `destination_code` | `VARCHAR(10) FK → aerodromes(code)` | Destination |
| `base_fare` | `NUMERIC(10,2)` | Base fare (legacy) |
| `base_fare_gbp` | `NUMERIC(10,2)` | Base fare in GBP |
| `currency` | `VARCHAR(10)` | Currency (default: `GBP`) |
| `is_active` | `BOOLEAN` | Active status |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

---

## 6. Auth & RBAC Tables

### [`roles`](migrations/archive/015_create_rbac_tables.sql:8)

Role containers for grouping permissions.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `slug` | `VARCHAR(50) UNIQUE` | URL-safe identifier (e.g., `admin`, `operations`) |
| `name` | `VARCHAR(50)` | Display name |
| `description` | `TEXT` | Description |
| `hierarchy_level` | `INTEGER` | Display/ordering level (not permission inheritance) |
| `is_system` | `BOOLEAN` | System-protected role |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

**Seeded roles:**

| Slug | Name | Hierarchy |
|------|------|-----------|
| `admin` | Admin | 100 |
| `operations` | Operations | 80 |
| `finance` | Finance | 70 |
| `checkin` | Check-in | 60 |
| `pilot` | Pilot | 50 |
| `engineer` | Engineer | 40 |
| `passenger` | Passenger | 10 |

### [`permissions`](migrations/archive/015_create_rbac_tables.sql:20)

Granular permissions in `resource:action` format.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `resource` | `VARCHAR(50)` | Resource name (e.g., `bookings`, `flights`) |
| `action` | `VARCHAR(50)` | Action name (e.g., `create`, `read`) |
| `description` | `TEXT` | Description |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |

**Unique constraint:** `(resource, action)`

### [`role_permissions`](migrations/archive/015_create_rbac_tables.sql:30)

Junction table linking roles to permissions.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `role_id` | `INTEGER FK → roles` | Role |
| `permission_id` | `INTEGER FK → permissions` | Permission |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |

**Unique constraint:** `(role_id, permission_id)`

### [`user_roles`](migrations/archive/015_create_rbac_tables.sql:39)

Junction table assigning roles to users.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `user_id` | `INTEGER FK → users` | User |
| `role_id` | `INTEGER FK → roles` | Role |
| `assigned_by` | `INTEGER FK → users` | Assigning user |
| `created_at` | `TIMESTAMPTZ` | Assignment timestamp |

**Unique constraint:** `(user_id, role_id)`

### [`audit_log`](migrations/archive/015_create_rbac_tables.sql:49)

Audit trail for permission changes and system actions.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL PK` | Primary key |
| `actor_id` | `INTEGER FK → users` | Acting user |
| `action` | `VARCHAR(100)` | Action performed |
| `entity_type` | `VARCHAR(50)` | Entity type affected |
| `entity_id` | `INTEGER` | Entity ID affected |
| `old_values` | `JSONB` | Previous values |
| `new_values` | `JSONB` | New values |
| `ip_address` | `VARCHAR(45)` | Actor IP address |
| `user_agent` | `VARCHAR(255)` | Actor user agent |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |

---

## 7. Migration History

> The numbered migrations below (`001`–`016`) are the original per-feature migrations, now preserved under [`migrations/archive/`](../migrations/archive/) (links point there for line-level reference). They have been consolidated into seven files under [`migrations/consolidated/`](../migrations/consolidated/), which is what the runner (`npm run migrate`) applies. Later feature migrations (`008-system-settings.sql`–`018-freight.sql`) and `fix-*.sql` scripts live at the top of [`migrations/`](../migrations/).

| # | File | Purpose |
|---|------|---------|
| 001 | [`001_create_tables.sql`](migrations/archive/001_create_tables.sql) | Core schema: users, aerodromes, aircraft, organizations, pilots, fare_routes, flights, bookings, booking_legs, passengers, seat_assignments, checkin_reminders, notifications, flight_manifests, system_settings, payments |
| 002 | [`002_add_missing_columns.sql`](migrations/archive/002_add_missing_columns.sql) | Missing columns and constraints |
| 003 | [`003_create_reference_tables.sql`](migrations/archive/003_create_reference_tables.sql) | Reference data tables |
| 004 | [`004_add_timestamps_to_reference_tables.sql`](migrations/archive/004_add_timestamps_to_reference_tables.sql) | Timestamps on reference tables |
| 005 | [`005_add_booking_source_and_cancellation.sql`](migrations/archive/005_add_booking_source_and_cancellation.sql) | Booking source and cancellation fields |
| 006 | [`006_create_payment_methods.sql`](migrations/archive/006_create_payment_methods.sql) | Payment methods reference table, `set_updated_at()` function |
| 007 | [`007_create_invoices.sql`](migrations/archive/007_create_invoices.sql) | Invoices and invoice_items tables |
| 008 | [`008_create_accounting_journal.sql`](migrations/archive/008_create_accounting_journal.sql) | Chart of accounts, journal entries, journal lines |
| 009 | [`009_create_payment_reminders.sql`](migrations/archive/009_create_payment_reminders.sql) | Payment reminder scheduling |
| 010 | [`010_create_stripe_payments.sql`](migrations/archive/010_create_stripe_payments.sql) | Stripe payment tracking |
| 011 | [`011_create_bank_transactions.sql`](migrations/archive/011_create_bank_transactions.sql) | Bank transaction reconciliation |
| 012 | [`012_create_export_log.sql`](migrations/archive/012_create_export_log.sql) | Export logging |
| 013 | [`013_enhance_existing_tables.sql`](migrations/archive/013_enhance_existing_tables.sql) | Table enhancements |
| 014 | [`014_create_scheduling_tables.sql`](migrations/archive/014_create_scheduling_tables.sql) | Schedules, flight_legs, weight_balance_snapshots, pilot_assignments; extend aircraft/pilots/aerodromes |
| 015 | [`015_create_rbac_tables.sql`](migrations/archive/015_create_rbac_tables.sql) | PBAC: roles, permissions, role_permissions, user_roles, audit_log |
| 016 | [`016_create_booking_leg_passengers.sql`](migrations/archive/016_create_booking_leg_passengers.sql) | Rename passengers → booking_passengers, create booking_leg_passengers junction table, migrate data |

---

## 8. Key Relationships

### Booking → Legs → Passengers (via Junction)

```
bookings
  │
  ├── 1:N ── booking_legs (itinerary legs)
  │             │
  │             └── N:N ── booking_leg_passengers (junction)
  │                            │
  └── 1:N ── booking_passengers ┘
```

This is the most important relationship in the system. A booking has multiple legs and multiple passengers. The `booking_leg_passengers` junction table links specific passengers to specific legs, enabling:

- **Per-leg baggage**: A passenger might have different baggage on leg 1 vs leg 2
- **Per-leg check-in**: A passenger can be checked in for leg 1 but not leg 2
- **Per-leg boarding**: Boarding status tracked independently per leg
- **Per-leg freight**: Freight can be assigned to specific legs
- **Per-leg seat assignment**: Different seats on different legs

### Schedule → Flights → Flight Legs

```
schedules
  │
  └── 1:N ── flights (sortie flights)
               │
               ├── 1:N ── flight_legs (sequenced stops)
               │
               ├── 1:N ── weight_balance_snapshots (per-leg W&B)
               │
               └── 1:N ── pilot_assignments (crew assignments)
```

A schedule groups all flights for a single day. Each flight represents one aircraft's sortie with multiple stops (flight_legs). Weight and balance is computed per flight_leg. Pilots are assigned per flight.

### Booking → Payment → Accounting

```
bookings
  │
  ├── 1:N ── payments
  │            │
  │            ├── 1:1 ── stripe_payments (if Stripe method)
  │            │
  │            └── 1:N ── accounting_journal_entries
  │                         │
  │                         └── 1:N ── accounting_journal_lines
  │                                      │
  │                                      └── N:1 ── chart_of_accounts
  │
  └── 1:N ── invoices
               │
               ├── 1:N ── invoice_items
               │
               └── 1:N ── accounting_journal_entries
```

Every financial transaction creates balanced double-entry journal entries. Payments and invoices both link to the accounting journal for a complete audit trail.

### User → Roles → Permissions

```
users
  │
  └── N:N ── user_roles
               │
               └── N:N ── roles
                           │
                           └── N:N ── role_permissions
                                       │
                                       └── N:N ── permissions
```

Users are assigned roles via the `user_roles` junction table. Roles group permissions via `role_permissions`. A user's effective permissions are the union of all permissions from all their assigned roles.