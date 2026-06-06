# Booking System — Architectural Review & Remediation Plan

> **Version**: 1.0  
> **Date**: 2026-06-04  
> **Status**: Pre-implementation analysis  

---

## 1. "Admin User" Bug — Root Cause & Fix

### 1.1 Diagnosis

**Symptom**: Dragging one passenger on the schedule board drags all passengers with the same name (e.g., "Admin User" booked on multiple legs).

**Root Cause**: The `DraggablePassengerRow` previously identified passengers by `bookingLegId` (which groups ALL passengers on the same origin→destination leg). When "Admin User" was booked on multiple legs (each with a different `booking_leg`), dragging one would move the entire leg's passenger group because the handler operated at `booking_leg` granularity, not `booking_leg_passenger` granularity.

**Fix Applied (2026-06-04)**: 
- `DraggablePassengerRow` now carries `bookingLegPassengerId` (the unique junction record ID)
- `handleTransferBooking` now operates on individual `booking_leg_passengers` records
- Only the specific passenger-leg combination is moved; other passengers on the same booking leg remain

### 1.2 "Admin User" as Seed Data

The seed data (`prisma/seed-realistic-bookings.ts`) creates a user "Admin User" with multiple booking legs. This is valid test data but should not appear in production. The `prisma/cleanup-test-data.ts` and `prisma/repair-leg-passengers.ts` scripts exist for this purpose.

**Recommendation**: Run `prisma/repair-leg-passengers.ts` to ensure all `booking_leg_passengers` records have valid `flight_leg_id` references. Run `prisma/cleanup-test-data.ts` to remove test-only bookings.

---

## 2. Current Data Model Analysis

### 2.1 Existing Entities

```
bookings
├── id, booking_reference, status, total_amount, payment_status
├── user_id, organization_id, booking_source
├── stripe_session_id, invoice_id
└── payment_due_date, payment_terms

booking_legs
├── id, booking_id, flight_id
├── origin_code, destination_code
├── leg_date, status
└── passenger_count (denormalized)

booking_passengers
├── id, booking_id, user_id
├── first_name, last_name, email
├── date_of_birth (for age-based discounts)
├── clothed_body_weight_kg
└── special_requirements

booking_leg_passengers (junction)
├── id (auto-increment, UNIQUE per passenger-leg)
├── booking_leg_id → booking_legs
├── booking_passenger_id → booking_passengers
├── flight_leg_id → flight_legs (null = unassigned)
├── clothed_weight_kg, baggage_weight_kg
├── freight_weight_kg
└── checked_in, checked_in_at

fare_routes
├── origin_code, destination_code
├── one_way_price (numeric)
├── return_price (numeric)
└── is_active

payments
├── id, booking_id, amount, currency
├── payment_method, status, stripe_payment_intent_id
└── payment_date, reconciled_at

invoices
├── id, booking_id, invoice_number
├── total_amount, status
├── due_date, issued_date
└── organization_id
```

### 2.2 Identified Gaps

| Gap | Impact | Priority |
|-----|--------|----------|
| No per-passenger pricing | All passengers on a booking pay the same amount regardless of age/discounts | **High** |
| No per-leg fare lookup | Fares from MATRIX_FARES.csv not integrated into booking flow | **High** |
| `booking_legs.passenger_count` denormalized | Stale count, no trigger to update on changes | Medium |
| No capacity enforcement | Booking can exceed aircraft seat count | **High** |
| Payment reconciled at booking level | Can't track which legs a partial payment covers | Medium |
| No refund workflow | No tracking of refunded amounts or reasons | Medium |
| No line-item invoices | Invoice shows total only, no per-passenger/per-leg breakdown | Medium |
| `fare_routes` has `one_way_price`/`return_price` | MATRIX_FARES.csv has a single base price per origin→destination | **High** |

---

## 3. Target Architecture

### 3.1 Entity Relationship Diagram

```
booking
  │
  ├── booking_legs (1:N)
  │     │
  │     ├── origin_code, destination_code
  │     ├── leg_date, status
  │     └── fare_amount (computed from fare_matrix, denormalized)
  │
  ├── booking_passengers (1:N)
  │     │
  │     ├── first_name, last_name, date_of_birth
  │     ├── discount_type (none, child, veteran, senior, student, staff)
  │     └── discount_percent (computed from discount_type + age)
  │
  ├── booking_leg_passengers (junction, M:N between legs & passengers)
  │     │
  │     ├── booking_leg_id, booking_passenger_id
  │     ├── flight_leg_id (null = unassigned)
  │     ├── line_fare_amount (per-passenger-per-leg price, post-discount)
  │     ├── discount_applied (boolean)
  │     └── payment_allocation_id (which payment covered this leg)
  │
  ├── payments (1:N)
  │     │
  │     ├── amount, currency, payment_method
  │     ├── status (pending, completed, failed, refunded, partially_refunded)
  │     ├── stripe_session_id, stripe_payment_intent_id
  │     ├── refunded_amount
  │     └── reconciliation_status
  │
  ├── payment_allocations (new)
  │     │
  │     ├── payment_id → payments
  │     ├── booking_leg_passenger_id → booking_leg_passengers
  │     ├── allocated_amount
  │     └── allocation_type (full, partial, top_up, refund)
  │
  └── invoice (1:1)
        │
        ├── invoice_number, total_amount
        ├── status (draft, issued, paid, overdue, cancelled, refunded)
        ├── issued_date, due_date
        └── invoice_line_items (new)
              │
              ├── description (e.g., "H. Irving: STY→BKI, 4 Jun 2026")
              ├── unit_price, quantity, discount, line_total
              ├── booking_leg_passenger_id
              └── tax_rate, tax_amount
```

### 3.2 Fares Integration

Parse `data/MATRIX_FARES.csv` into `fare_matrix`:

```sql
CREATE TABLE fare_matrix (
  origin_code      VARCHAR(4) NOT NULL,
  destination_code VARCHAR(4) NOT NULL,
  fare_amount_gbp  NUMERIC(8,2) NOT NULL,
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (origin_code, destination_code)
);
```

Migration script to populate from CSV:
```typescript
// One-time import
const csv = readFileSync("data/MATRIX_FARES.csv", "utf-8");
const lines = csv.trim().split("\n");
const headerLine = lines[0].split("\t");
const aerodromes = headerLine.slice(1); // column headers

for (const line of lines.slice(1)) {
  const cells = line.split("\t");
  const origin = cells[0].trim();
  for (let j = 1; j < cells.length; j++) {
    const amount = parseFloat(cells[j].replace("£", ""));
    if (!isNaN(amount) && amount > 0) {
      await db.fare_matrix.upsert({
        where: { origin_code_destination_code: { origin_code: origin, destination_code: aerodromes[j-1] } },
        create: { origin_code: origin, destination_code: aerodromes[j-1], fare_amount_gbp: amount },
        update: { fare_amount_gbp: amount },
      });
    }
  }
}
```

### 3.3 Pricing Engine

```typescript
// app/utils/pricing/pricing-engine.server.ts

interface PricingRequest {
  originCode: string;
  destinationCode: string;
  passengerAge: number;
  discountType: DiscountType;
  isReturn: boolean;
}

type DiscountType = "none" | "child" | "veteran" | "senior" | "student" | "staff";

const DISCOUNT_RULES: Record<DiscountType, { percent: number; maxAge?: number; minAge?: number }> = {
  none:    { percent: 0 },
  child:   { percent: 50, maxAge: 12 },          // under 12: 50% off
  student: { percent: 25, maxAge: 25 },           // under 25 with student ID: 25% off
  senior:  { percent: 25, minAge: 65 },           // 65+: 25% off
  veteran: { percent: 30 },                       // veterans: 30% off
  staff:   { percent: 100 },                      // FIGAS staff: free
};

export async function computeFare(params: PricingRequest): Promise<number> {
  const baseFare = await lookupFareFromMatrix(params.originCode, params.destinationCode);
  const discount = DISCOUNT_RULES[params.discountType] ?? DISCOUNT_RULES.none;

  let applicableDiscount = discount.percent;

  // Validate age-based eligibility
  if (discount.maxAge && params.passengerAge > discount.maxAge) applicableDiscount = 0;
  if (discount.minAge && params.passengerAge < discount.minAge) applicableDiscount = 0;

  const discountedFare = baseFare * (1 - applicableDiscount / 100);

  // Return journey gets same fare as outbound
  // (FIGAS charges one-way prices; return = outbound + outbound)
  return params.isReturn ? discountedFare * 2 : discountedFare;
}

export function computeBookingTotal(legFares: number[]): {
  subtotal: number;
  totalDiscount: number;
  taxAmount: number;
  grandTotal: number;
} {
  const subtotal = legFares.reduce((s, f) => s + f, 0);
  // No VAT on Falklands domestic flights; placeholder for future
  const taxAmount = 0;
  const grandTotal = subtotal + taxAmount;
  return { subtotal, totalDiscount: 0, taxAmount, grandTotal };
}
```

### 3.4 Capacity Management

When a booking leg has more passengers than aircraft capacity:

```typescript
// app/utils/scheduling/capacity-check.ts

export async function splitOversizedBookingLeg(
  bookingLegId: number,
  maxSeats: number
): Promise<void> {
  const passengerCount = await db.booking_leg_passengers.count({
    where: { booking_leg_id: bookingLegId },
  });

  if (passengerCount <= maxSeats) return;

  // Split into groups of maxSeats
  const passengers = await db.booking_leg_passengers.findMany({
    where: { booking_leg_id: bookingLegId },
    orderBy: { id: "asc" },
  });

  for (let i = 0; i < passengers.length; i += maxSeats) {
    const group = passengers.slice(i, i + maxSeats);
    if (i === 0) continue; // first group stays on original leg

    // Create new booking leg for overflow
    const newLeg = await db.booking_legs.create({
      data: {
        booking_id: /* from parent */,
        origin_code: /* from parent */,
        destination_code: /* from parent */,
        leg_date: /* from parent */,
        status: "confirmed",
      },
    });

    // Move passengers to new leg
    for (const p of group) {
      await db.booking_leg_passengers.update({
        where: { id: p.id },
        data: { booking_leg_id: newLeg.id },
      });
    }
  }
}
```

During auto-build scheduling, the scheduler checks capacity before assigning a booking leg to a flight. If the leg exceeds capacity, it triggers the split function.

### 3.5 Booking Workflow — End to End

```
Customer/Agent                    System                           Admin
    │                               │                                │
    ├─ Create booking ─────────────→│                                │
    │  (select passengers,          │  Create booking + legs          │
    │   origin→destination,         │  Compute fares per passenger    │
    │   date, discount types)       │  Generate invoice               │
    │                               │                                │
    ├─ View invoice ───────────────→│                                │
    │  (per-passenger line items)   │                                │
    │                               │                                │
    ├─ Make payment ───────────────→│                                │
    │  (Stripe / bank transfer)    │  Create payment record           │
    │                               │  Allocate to leg-passengers     │
    │                               │  Update invoice status           │
    │                               │                                │
    │                               ├─ Schedule built ──────────────→│
    │                               │  (auto-build or manual)         │
    │                               │  Assign legs to flights          │
    │                               │  Check capacity                  │
    │                               │  Split oversized legs            │
    │                               │                                │
    │                               ├─ Schedule published ──────────→│
    │                               │  Notify passengers               │
    │                               │  Generate boarding passes        │
    │                               │                                │
    ├─ Check-in ───────────────────→│                                │
    │  (day of flight)              │  Mark passenger as checked in   │
    │                               │  Verify payment status           │
    │                               │                                │
    │                               ├─ Flight completed ────────────→│
    │                               │  Finalize loadsheet              │
    │                               │  Reconcile payment               │
    │                               │  Archive records                 │
    │                               │                                │
    ├─ Request refund ─────────────→│                                │
    │                               ├─ Process refund ──────────────→│
    │                               │  (Stripe / manual)              │
    │                               │  Update payment status           │
    │                               │  Issue credit note               │
    │                               │                                │
    │                               │                                │
    ◄── Invoice (PDF) ─────────────│                                │
    ◄── Boarding pass (QR) ────────│                                │
    ◄── Receipt ───────────────────│                                │
    ◄── Refund confirmation ──────│                                │
```

### 3.6 Payment Processing & Reconciliation

#### 3.6.1 Payment Methods

| Method | Flow | Reconciliation |
|--------|------|---------------|
| **Stripe (Card)** | Customer pays via Stripe Checkout → webhook confirms → payment record created → auto-reconciled | Automatic via Stripe webhook |
| **Bank Transfer** | Customer instructed to transfer → admin manually confirms receipt → payment record created → manual reconciliation | Manual: admin matches bank statement to booking |
| **Cash (at counter)** | Admin collects cash at check-in → payment record created → manual reconciliation | Immediate |
| **Invoice (Agent)** | Agent booking → invoice issued with NET-30 terms → agent pays later → admin reconciles | Manual: admin marks invoice as paid |

#### 3.6.2 Reconciliation Workflow

```
Payment Received (Stripe webhook / manual entry)
    │
    ├── Match to booking by:
    │   ├── stripe_session_id (Stripe)
    │   ├── booking_reference in payment reference (bank transfer)
    │   └── manual association (cash)
    │
    ├── Allocate payment across booking_leg_passengers:
    │   │  payment_allocations.created for each line item
    │   │  allocation.allocated_amount = min(payment.remaining, line.total)
    │   │  payment.remaining -= allocated_amount
    │   │
    │   ├── If payment fully covers all lines → status = "paid"
    │   ├── If payment partially covers → status = "partially_paid"
    │   └── If overpayment → creates credit balance on booking
    │
    └── Update invoice status
```

#### 3.6.3 Refund Flow

```
Refund Requested
    │
    ├── Validate: booking exists, payment received, passenger not flown
    │
    ├── Calculate refund amount:
    │   ├── Full refund: all line items if 48h+ before departure
    │   ├── Partial refund: per-passenger cancellation
    │   └── No refund: within 24h of departure (FIGAS policy)
    │
    ├── Process via Stripe:
    │   ├── Create Stripe Refund (stripe.refunds.create)
    │   ├── Update payment.refunded_amount
    │   └── Update payment.status = "refunded" or "partially_refunded"
    │
    ├── Process manually (cash/bank):
    │   └── Create refund transaction record
    │
    └── Update booking:
        ├── Unassign passenger from flight leg
        ├── Update invoice with credit note
        └── Record journal entry (debit revenue, credit refund liability)
```

#### 3.6.4 Accounting Journal Entries

Double-entry bookkeeping for every financial transaction:

| Event | Debit | Credit |
|-------|-------|--------|
| Invoice issued | Accounts Receivable | Deferred Revenue |
| Payment received | Cash/Bank | Accounts Receivable |
| Flight completed | Deferred Revenue | Passenger Revenue |
| Refund issued | Passenger Revenue / Refund Expense | Cash/Bank |
| Cancellation fee | Accounts Receivable | Cancellation Fee Revenue |

---

## 4. Implementation Roadmap

### Phase 1: Fare Integration (Day 1)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Create `fare_matrix` table migration | 1h | SQL + Prisma model |
| Import MATRIX_FARES.csv into `fare_matrix` | 0.5h | Seed script |
| Create `pricing-engine.server.ts` with `computeFare()` | 2h | Utility module |
| Add per-leg fare calculation to booking creation | 1.5h | `create-booking.server.ts` |
| Display fares on booking confirmation page | 1h | UI update |

### Phase 2: Discount Engine (Day 2)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Add `discount_type` and `discount_percent` to `booking_passengers` | 0.5h | Migration |
| Implement discount rules in pricing engine | 1.5h | Updated `pricing-engine` |
| Add discount selection to booking form | 1h | UI |
| Validate age-based eligibility | 1h | Server validation |
| Store `line_fare_amount` on `booking_leg_passengers` | 0.5h | Migration |

### Phase 3: Payment Allocation (Day 3)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Create `payment_allocations` table | 0.5h | Migration + Prisma |
| Update Stripe webhook to allocate payments to line items | 2h | Webhook handler |
| Add bank transfer / cash payment allocation UI | 1.5h | Admin UI |
| Implement partial payment and overpayment handling | 1h | Logic |
| Add `payment_allocation_id` FK to `booking_leg_passengers` | 0.5h | Migration |

### Phase 4: Line-Item Invoices (Day 4)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Create `invoice_line_items` table | 0.5h | Migration |
| Generate line items from `booking_leg_passengers` fares | 2h | Invoice generation |
| Create PDF invoice template with line items | 2h | PDF renderer |
| Add credit note generation for refunds | 1h | Logic |
| Customer-facing invoice view | 1h | UI route |

### Phase 5: Capacity Management (Day 5)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Implement `splitOversizedBookingLeg()` | 2h | Scheduling utility |
| Add capacity check to auto-build pipeline | 1h | `buildSchedule()` |
| Add capacity check to manual drag-and-drop | 1h | `handleAssignBooking()` |
| Show capacity warning in booking UI | 1h | UI |
| Allow admin to manually split booking legs | 1h | Admin action |

### Phase 6: Refund & Reconciliation (Day 6)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Implement Stripe refund flow | 2h | Server handler + webhook |
| Implement manual refund flow (cash/bank) | 1h | Admin UI |
| Create reconciliation dashboard | 2h | Admin route |
| Add journal entry automation | 1.5h | Accounting module |
| Create reconciliation report export | 1h | CSV export |

### Phase 7: Cleanup & Validation (Day 7)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Run `repair-leg-passengers.ts` to fix junction records | 0.5h | DB cleanup |
| Run `cleanup-test-data.ts` to remove test users | 0.5h | DB cleanup |
| Add unique constraint validation on `booking_leg_passengers` | 0.5h | Migration |
| End-to-end test: booking → payment → schedule → complete | 2h | Test plan |
| Update seed data with realistic passenger names | 1h | Seed script |

---

## 5. Drag-and-Drop Architecture — Final Fix Summary

### 5.1 Current Fix Applied

The `DraggablePassengerRow` now carries `bookingLegPassengerId` (the unique `booking_leg_passengers.id`) instead of `bookingLegId`. This ensures:

- Each passenger-leg combination is a **distinct draggable entity**
- Dragging one "Admin User" booking leg only moves that specific passenger on that specific leg
- Other passengers on the same booking leg (same origin→destination) remain in place
- The same passenger booked on multiple legs (different `booking_leg_passengers` records) moves independently

### 5.2 Remaining Edge Case

If two passengers share the same `booking_leg_passengers` record (which should not happen due to the UNIQUE constraint on `(booking_leg_id, booking_passenger_id)`), they would still be linked. The existing UNIQUE constraint prevents this.

### 5.3 Verification

After running migrations and seed data cleanup, verify:
1. Each `booking_leg_passengers` record has a unique `id`
2. No duplicate `(booking_leg_id, booking_passenger_id)` pairs exist
3. Dragging a single passenger only moves that passenger's card

---

## 6. Migration Rollout Strategy

1. **Create backup**: Full database dump before running migrations
2. **Run Phase 1-4 migrations**: Schema changes are additive (new tables, new columns)
3. **Import fare data**: One-time MATRIX_FARES.csv import
4. **Data repair**: Run `repair-leg-passengers.ts` for junction integrity
5. **Test in staging**: Full booking → payment → schedule → refund flow
6. **Deploy to production**: Feature flag (`ENABLE_FARE_ENGINE=true`) for gradual rollout
