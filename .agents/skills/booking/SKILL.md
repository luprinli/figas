---
name: booking
description: >-
  Booking domain skill for the FIGAS booking system. Covers the 4-step booking wizard
  (details → legs → passengers → junction), booking reference generation, passenger
  management, itinerary building, fare calculation, and payment method selection
  (Stripe/Invoice/Pay-on-Departure/Pay-on-Arrival). Preserves invariants for the booking
  lifecycle, leg sequencing, reference uniqueness, and payment flow integration.
author: FIGAS Engineering
---

# Booking Domain Skill

## Overview

This skill defines the **contract** for the FIGAS booking system. Bookings follow a
**4-step wizard** that progresses through details → legs → passengers → junction
(confirmation). The booking lifecycle is: `pending → confirmed → (paid | cancelled | completed)`.

The booking system supports four payment methods:
- **Stripe** — online payment via Stripe Checkout
- **Invoice** — generate invoice for organization billing
- **Pay-on-Departure** — pay at check-in counter before departure
- **Pay-on-Arrival** — pay upon arrival at destination

Bookings can be created via:
- Customer self-service (`/bookings/new`)
- Operations staff (`/operations/bookings/new`)
- Booking agents (via `booking_source = "booking_agent"`)

PBAC permissions guarding booking: `booking:create`, `booking:view`, `booking:edit`, `booking:cancel`,
`booking:approve`, `booking:assign-flight`, `booking:manage-passengers`, `booking:manage-freight`,
`booking:manage-payment`, `booking:checkin`.

---

## Architecture

```
BookingWizard (4-step flow)
│
├── Step 1: Details
│   ├── Organization selection (optional)
│   ├── Organization billing toggle
│   └── Booking source tracking
│
├── Step 2: Legs
│   ├── Origin/Destination aerodrome selection
│   ├── Date per leg
│   ├── Preferred time window (optional)
│   ├── Leg sequence auto-increment
│   └── Creates booking_legs records
│
├── Step 3: Passengers
│   ├── Add/edit/remove passengers
│   ├── Per-passenger: name, DOB, residency, weight, contact
│   ├── Discount type assignment (none/child/student/senior/veteran/staff)
│   └── Creates booking_passengers records
│
└── Step 4: Junction (Confirmation)
    ├── Creates booking_leg_passengers (junction) for each passenger × leg
    ├── Fare calculation via computeBookingCost()
    ├── Payment method selection
    ├── Stripe session creation OR invoice generation
    └── Booking reference assignment (3 letters + 5 digits)
```

---

## Key Files

| File | Role |
|------|------|
| `app/components/BookingWizard.tsx` | 4-step wizard UI with progress indicator |
| `app/routes/bookings._index.tsx` | Customer booking list (owned bookings) |
| `app/routes/bookings.new.tsx` | Customer self-service booking creation |
| `app/routes/bookings.$bookingId.tsx` | Booking detail/confirmation page |
| `app/routes/operations.bookings._index.tsx` | Operations booking list with search/filter/pagination |
| `app/routes/operations.bookings.new.tsx` | Operations-side booking creation |
| `app/routes/operations.bookings.$bookingId.tsx` | Booking detail (operations view) |
| `app/routes/operations.bookings.$bookingId.edit.tsx` | Booking editing (add/remove legs, passengers) |
| `app/routes/operations.bookings.$bookingId.passengers.tsx` | Passenger management for a booking |
| `app/routes/operations.bookings.$bookingId.cancel.tsx` | Booking cancellation with reason |
| `app/routes/operations.bookings.$bookingId.payment-success.tsx` | Stripe success callback page |
| `app/routes/operations.bookings.$bookingId.payment-cancel.tsx` | Stripe cancel callback page |
| `app/utils/repositories/booking.ts` | `bookingRepository`: createPending, search, findAll, pipeline counts, agent portfolio, needs attention |
| `app/utils/repositories/booking-passenger.ts` | `bookingPassengerRepository`: CRUD for passengers with discount types |
| `app/utils/repositories/booking-leg.ts` | `bookingLegRepository`: CRUD for legs with flight assignment |
| `app/utils/repositories/booking-leg.server.ts` | Extended leg queries: `BookingLegWithDetails`, unassigned bookings |
| `app/utils/repositories/booking-leg-passenger.ts` | Junction table repository: create, update, checkIn, findByBookingId, findByLegId |
| `app/utils/pricing/pricing-engine.server.ts` | Fare lookup (`lookupFare`), discount rules, `computeLegFare` |
| `app/utils/pricing/booking-costing.server.ts` | Full booking cost: `computeBookingCost()` → `LegCostLine[]` with per-passenger fares |
| `app/utils/services/payment.service.ts` | Payment initiation: calculateBookingCost, initiatePayment (Stripe/manual/invoice) |
| `app/utils/services/invoice.service.ts` | Invoice generation triggered from booking confirmation |
| `app/utils/repositories/fare-route.ts` | Fare route lookup (`getBaseFare`) |

---

## Data Flow

### Booking Creation (`createPending`)

**Repository:** `app/utils/repositories/booking.ts:67`

1. Generate booking reference: 3 random uppercase letters + 5 random digits (e.g., `ABC12345`)
2. Retry up to 10 times on unique constraint collision (`P2002`)
3. Create booking with `status = "pending"`, `booking_source = "customer_direct"` (or `"booking_agent"` / `"manual_entry"`)
4. Returns `BookingRow`

### Booking Reference Format

```typescript
function generateReference(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let ref = "";
  for (let i = 0; i < 3; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  for (let i = 0; i < 5; i++) ref += Math.floor(Math.random() * 10).toString();
  return ref; // e.g., "KMF38291"
}
```

### Leg Management

Each booking has 1+ `booking_legs` with:
- `leg_sequence` — auto-incremented (1, 2, 3...)
- `origin_code` / `destination_code` — ICAO aerodrome codes
- `leg_date` — travel date (YYYY-MM-DD)
- `preferred_time` / `preferred_time_start` / `preferred_time_end` — time window
- `flight_id` — nullable, assigned during scheduling
- `status` — leg status

### Passenger Management

Each booking has 1+ `booking_passengers` with:
- `first_name`, `last_name`, `email`, `phone`, `date_of_birth`
- `clothed_body_weight_kg` — default 70kg
- `residency_status` — for fare eligibility
- `discount_type` — `"none" | "child" | "student" | "senior" | "veteran" | "staff"`
- `special_requirements` — free text

### Junction Table (`booking_leg_passengers`)

For each passenger × leg combination, a junction record is created:
```
booking_leg_passengers
├── booking_leg_id → booking_legs (which leg)
├── booking_passenger_id → booking_passengers (which passenger)
├── clothed_weight_kg, baggage_weight_kg, baggage_description
├── freight_description, freight_weight_kg
├── seat_number, checked_in, boarded
└── flight_leg_id → flight_legs (specific flight leg assignment)
```

### Fare Calculation

```
computeBookingCost(bookingId)
  ├── Fetch all booking_leg_passengers with origin/destination/passenger age/discount
  ├── For each: lookupFare(origin, destination) from fare_matrix
  ├── Apply discount via DISCOUNT_RULES[discountType]
  ├── Sum per-leg-per-passenger fares = subtotal
  └── Return { legs: LegCostLine[], subtotal, totalDiscount, grandTotal }
```

### Payment Flow

After junction creation, the booking wizard offers payment method selection:

| Method | Flow |
|--------|------|
| **Stripe** | Create Stripe Checkout session → redirect to Stripe → webhook confirms → update `payment_status = "paid"` |
| **Invoice** | Generate invoice via `invoice.service.ts` → set `payment_status = "pending"`, `payment_method = "invoice"` |
| **Pay-on-Departure** | Set `payment_status = "pending"`, `payment_method = "pay_on_departure"` — collected at check-in |
| **Pay-on-Arrival** | Set `payment_status = "pending"`, `payment_method = "pay_on_arrival"` — collected at destination |

### Booking Search (`bookingRepository.search`)

**Repository:** `app/utils/repositories/booking.ts:421`

Uses raw SQL with ILIKE across `booking_reference`, `first_name`, `last_name`, `email`, `phone`:
```sql
WHERE booking_reference ILIKE $1
   OR first_name ILIKE $1
   OR last_name ILIKE $1
   OR email ILIKE $1
   OR phone ILIKE $1
```
Supports pagination with `LIMIT/OFFSET` and returns total count via separate `COUNT` query.

### Pipeline Counts (`getPipelineCounts`)

```typescript
{ total, upcoming, completed, cancelled }
// upcoming = status NOT IN ("completed", "cancelled")
```

### Agent Portfolio (`findAgentPortfolio`)

Groups bookings by client name where `booking_source = "booking_agent"` and `created_by = agentUserId`.
Sorted in application code by passenger last name (Prisma doesn't support nested relation ordering in `findMany`).

### Needs Attention (`findNeedsAttention`)

Four attention triggers detected via raw SQL:
1. **Stuck** — `updated_at < NOW() - 48 hours` and status not terminal
2. **Overdue payment** — `payment_status = 'pending'` and `payment_due_date < CURRENT_DATE`
3. **Approaching departure without flight** — unassigned booking leg within 2 days
4. **Recently cancelled** — `canceled_at >= NOW() - 1 hour`

---

## Validation Rules

### Invariant 1: Booking Reference Uniqueness
Each booking reference must be globally unique. `createPending()` retries up to 10 times on `P2002` collision. Never generate references outside `bookingRepository.createPending()`.

### Invariant 2: Minimum One Leg, One Passenger
A booking must have at least one leg and one passenger. The wizard prevents advancing from Step 2 without at least one leg, and from Step 3 without at least one passenger.

### Invariant 3: Junction Completeness
Every passenger must be linked to every leg via `booking_leg_passengers`. If a booking has 2 legs and 3 passengers, exactly 6 junction records must exist. Never create bookings with missing junction rows.

### Invariant 4: Fare Calculation Consistency
`computeBookingCost()` in `booking-costing.server.ts` is the single source of truth for booking cost. Never calculate fares in route or component files independently.

### Invariant 5: Leg Sequence Order
`leg_sequence` must start at 1 and increment by 1 for each subsequent leg. Never skip numbers or use non-sequential ordering.

### Invariant 6: Payment Method Valid Values
`payment_method` must be one of: `"stripe"`, `"invoice"`, `"pay_on_departure"`, `"pay_on_arrival"`, `null`. Never use undocumented values.

### Invariant 7: Booking Status Lifecycle
```
pending → confirmed → paid/completed
pending → cancelled
confirmed → cancelled
```
- `pending`: Wizard not yet completed (legs + passengers may be incomplete)
- `confirmed`: Wizard completed, payment method selected
- `paid`: Payment received (Stripe webhook or manual recording)
- `completed`: All flights completed
- `cancelled`: Cancelled with `cancelled_by`, `cancelled_at`, `cancellation_reason`

### Invariant 8: Discount Type Validation
`discount_type` must be one of: `"none"`, `"child"`, `"student"`, `"senior"`, `"veteran"`, `"staff"`. Age-based gates are enforced in `pricing-engine.server.ts` but the type assignment happens at booking time.

---

## Integration Points

### Booking → Scheduling
Unassigned booking legs (with `flight_id = NULL`) appear in the scheduling board's unassigned pool. `bookingLegRepository.findUnassignedByDate()` feeds the drag-and-drop interface.

### Booking → Check-in
Junction records (`booking_leg_passengers`) are the target of check-in operations. `checked_in` and `boarded` flags are set per-leg-per-passenger via `bookingLegPassengerRepository.checkIn()`.

### Booking → Finance
After confirmation, `computeBookingCost()` determines the total. Payment method selection triggers either Stripe session creation or invoice generation. The `total_amount_gbp` field on `bookings` is updated with the computed cost.

### Booking → Audit
All status changes, cancellations, and payment records are tracked via `audit_log`. The booking activity feed (`findRecentActivity`) queries `audit_log` for entity_type `"booking"`.

### Stripe Integration
- `stripe_session_id` on bookings links to Stripe Checkout
- `payment-success` and `payment-cancel` routes handle return redirects
- Webhook handler processes `checkout.session.completed` events

---

## Do's and Don'ts

### Do

- ✅ Do use `bookingRepository.createPending()` as the single entry point for booking creation
- ✅ Do generate booking references exclusively via `generateReference()` in `booking.ts`
- ✅ Do use `computeBookingCost()` from `booking-costing.server.ts` for all fare calculations
- ✅ Do create `booking_leg_passengers` junction records for every passenger × leg combination
- ✅ Do maintain `leg_sequence` as sequential integers starting from 1
- ✅ Do use `bookingRepository.search()` for ILIKE search across names/email/phone/reference
- ✅ Do set `booking_source` appropriately: `"customer_direct"`, `"booking_agent"`, or `"manual_entry"`
- ✅ Do validate discount types against `DiscountType` union before saving
- ✅ Do use raw SQL for ILIKE search (Prisma doesn't support ILIKE natively)
- ✅ Do handle Stripe session creation via `payment.service.ts` (not directly in route files)
- ✅ Do retry on reference collision — the `createPending` retry loop (up to 10) is essential

### Don't

- ❌ Don't create booking references outside `bookingRepository.createPending()` — collision handling is critical
- ❌ Don't calculate fares in route files or components — always call `computeBookingCost()`
- ❌ Don't skip creating junction records — the booking is incomplete without them
- ❌ Don't hardcode fare values or discount percentages — reference `DISCOUNT_RULES` and `fare_matrix`
- ❌ Don't change the reference format (3 letters + 5 digits) without updating all reference-dependent logic
- ❌ Don't allow non-sequential `leg_sequence` numbers
- ❌ Don't delete `booking_leg_passengers` records without updating the scheduling board's assigned state
- ❌ Don't use undocumented `payment_method` values — stick to the four supported methods
- ❌ Don't skip the `booking_source` field on creation — it drives agent portfolio and reporting queries
- ❌ Don't remove the "Needs Attention" query logic without providing an equivalent monitoring view
