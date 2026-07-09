---
name: checkin
description: >-
  Check-in workflow skill for the FIGAS counter operations. Covers per-leg/per-passenger
  check-in via the booking_leg_passengers junction table, booking search, check-in/board
  actions, payment collection at counter (card + cash), weight validation, and freight
  receiving. Preserves invariants for the check-in counter, POS terminal, freight
  check-in, and booking lookup flows.
author: FIGAS Engineering
---

# Check-In Domain Skill

## Overview

This skill defines the **contract** for the FIGAS check-in workflow. The check-in system
operates on a **per-leg, per-passenger** model via the `booking_leg_passengers` junction
table, unlike traditional airline check-in which operates on the full booking. Each
passenger on each leg is independently checked in and boarded.

The check-in domain spans four route groups:

- `/checkin/_index` — Flight selection grid with check-in progress counts
- `/checkin/counter` — Counter check-in workflow (search, weigh, collect payment, check-in, board)
- `/checkin/freight` — Freight consignment receiving and waybill generation
- `/checkin/pos` — POS terminal for standalone payment collection
- `/checkin/lookup` — Booking/passenger lookup by reference, name, email, or flight

PBAC permissions guarding check-in: `checkin:view`, `checkin:process`, `checkin:manage-reminders`.

---

## Architecture

```
booking_leg_passengers (junction table)
├── booking_leg_id → booking_legs → bookings
├── booking_passenger_id → booking_passengers
├── flight_leg_id → flight_legs (assigned flight)
├── checked_in / checked_in_at / checked_in_by
├── boarded / boarded_at
├── clothed_weight_kg, baggage_weight_kg
├── freight_description, freight_weight_kg
└── seat_number
```

**Check-in flow per passenger:**
1. Search booking by reference / passenger name / email / flight number
2. Select flight → display passenger manifest with check-in status
3. For each passenger: weigh (body + baggage), validate against MTOW
4. Collect outstanding payment (cash via CashKeypad or card via CardProcessor)
5. Mark `checked_in = true` in `booking_leg_passengers`
6. Mark `boarded = true` when passenger boards

---

## Key Files

| File | Role |
|------|------|
| `app/routes/checkin._index.tsx` | Flight selection grid; shows check-in progress per flight |
| `app/routes/checkin.counter.tsx` | Main counter workflow: search, manifest, weigh, pay, check-in, board |
| `app/routes/checkin.freight.tsx` | Freight consignment creation; waybill generation (FW-YYYYMMDD-NNNNN) |
| `app/routes/checkin.pos.tsx` | Standalone POS terminal for payment-only operations |
| `app/routes/checkin.lookup.tsx` | Booking/passenger lookup by reference, name, email, flight |
| `app/routes/checkin.tsx` | Layout wrapper for check-in routes |
| `app/utils/repositories/checkin.ts` | `checkinRepository`: searchBookings, getPassengerForCheckin, recordPayment, getOutstandingBalance |
| `app/utils/repositories/booking-leg-passenger.ts` | `bookingLegPassengerRepository`: checkIn, update, findByBookingId, findByLegId |
| `app/components/checkin/CashKeypad.tsx` | On-screen cash denomination keypad (quick amounts: 10, 20, 50) |
| `app/components/checkin/CardProcessor.tsx` | Card payment processor with idle/processing/approved/declined states |
| `app/components/checkin/CheckinSidebar.tsx` | Sidebar showing current check-in session state and payment summary |

---

## Data Flow

### Booking Search (`searchBookings`)

**Repository:** `app/utils/repositories/checkin.ts:131`

Searches across `bookings`, `booking_passengers`, `booking_legs`, `booking_leg_passengers`, `flights`, and `aerodromes`:

```sql
WHERE booking_reference ILIKE $1
   OR flight_number ILIKE $1
   OR first_name ILIKE $1
   OR last_name ILIKE $1
   OR email ILIKE $1
```

Returns `BookingSearchResult[]` with `checkin_status` derived from `blp.checked_in`.

### Passenger Check-In Detail (`getPassengerForCheckin`)

**Repository:** `app/utils/repositories/checkin.ts:167`

Fetches full passenger context for the counter workflow, including:
- Payment status (`b.payment_status`), total amount (`b.total_amount_gbp`), organization billing flag
- Weight data (`bp.clothed_body_weight_kg`, `blp.baggage_weight_kg`)
- Flight assignment (`f.flight_number`, `f.departure_time`, `a_orig.code`, `a_dest.code`)
- Seat number from `blp.seat_number`

### Check-In Confirmation (`bookingLegPassengerRepository.checkIn`)

**Repository:** `app/utils/repositories/booking-leg-passenger.ts:133`

```typescript
async checkIn(id: number, checkedInBy: number): Promise<void> {
  await db.booking_leg_passengers.update({
    where: { id },
    data: {
      checked_in: true,
      checked_in_at: new Date(),
      checked_in_by: checkedInBy,
    },
  });
}
```

### Outstanding Balance (`getOutstandingBalance`)

**Repository:** `app/utils/repositories/checkin.ts:225`

```sql
COALESCE(b.total_amount_gbp, 0) -
COALESCE((SELECT SUM(amount_gbp) FROM payments WHERE booking_id = $1), 0) AS balance
```

### Payment Recording (`recordPayment`)

**Repository:** `app/utils/repositories/checkin.ts:240`

Records a payment with method (`cash`/`card`), amount in GBP, transaction reference, and status `"completed"`.

### Freight Waybill Generation

**Route:** `app/routes/checkin.freight.tsx:52`

```typescript
const waybill = `FW-${date}-${seq}`; // e.g., FW-20260619-00042
```

Inserts into `freight_consignments` with consignor/consignee names, weight (kg), dimensions (cm), priority, hazardous flag, and payment mode. Calculates volumetric weight when dimensions provided: `(L × W × H) / 6000`.

---

## Validation Rules

### Invariant 1: Per-Leg Check-In
Check-in status is tracked on `booking_leg_passengers`, not `bookings` or `booking_passengers`. Each passenger-leg combination has independent `checked_in` and `boarded` flags. Never check in a booking as a whole — always operate at the `booking_leg_passenger` row level.

### Invariant 2: Weight Must Be Recorded
Before check-in, the passenger's clothed body weight and baggage weight must be recorded. The `checkin.counter` flow enforces this: weigh → pay → check-in → board.

### Invariant 3: Outstanding Balance Must Be Settled
Payment must be collected at the counter before check-in completes. The counter shows `getOutstandingBalance()` and requires payment when `balance > 0`. Exceptions: `organization_billing = true` (invoice to organization) or `payment_status = "paid"`.

### Invariant 4: MAX_FREE_BAGGAGE_KG = 20, EXCESS_RATE_PER_KG = 5
Defined in `app/routes/checkin.counter.tsx:17-18`. Baggage over 20kg incurs £5/kg excess charge. These constants must not be removed or changed without updating the fare calculation logic.

### Invariant 5: Freight Waybill Uniqueness
Each freight waybill (`FW-YYYYMMDD-NNNNN`) must be unique. The `seq` is derived from `Date.now() % 100000` padded to 5 digits, which is statistically collision-resistant but not guaranteed unique at scale.

### Invariant 6: Volumetric Weight Override
When freight dimensions are provided and `(L×W×H)/6000 > actual_weight`, the volumetric weight takes precedence for billing. The route redirects with a `warning=vol_weight` query param.

---

## Integration Points

### Payment Integration
- **Card payments**: `app/components/checkin/CardProcessor.tsx` — states: `idle`, `processing`, `approved`, `declined`
- **Cash payments**: `app/components/checkin/CashKeypad.tsx` — quick amounts (10, 20, 50) plus custom entry
- **Payment recording**: `checkinRepository.recordPayment()` writes to `payments` table

### Weight & Balance
Check-in weight data (`clothed_weight_kg`, `baggage_weight_kg`, `freight_weight_kg`) feeds into the scheduling system's weight & balance snapshots and loadsheet generation. The `booking_leg_passengers` table is the single source of truth for passenger/freight weights.

### Schedule Integration
Check-in is only available for flights on the current date (`selectedDate`). The `checkin._index` loader fetches flights with `COUNT(blp.id) FILTER (WHERE blp.checked_in = true)` for progress display.

### PBAC Permissions
Check-in routes are guarded by `requirePermission(request, Permission.CHECKIN_PROCESS)`. The `CHECKIN` role holds: `checkin:view`, `checkin:process`, `checkin:manage-reminders`, `booking:view`, `flight:view`.

---

## Do's and Don'ts

### Do

- ✅ Do check in at the `booking_leg_passengers` row level (per-leg, per-passenger)
- ✅ Do record `clothed_weight_kg` and `baggage_weight_kg` before marking `checked_in = true`
- ✅ Do calculate outstanding balance as `total_amount_gbp - SUM(payments.amount_gbp)` per booking
- ✅ Do respect `organization_billing` flag — skip payment collection when true
- ✅ Do generate freight waybills with format `FW-YYYYMMDD-NNNNN`
- ✅ Do validate volumetric weight `(L×W×H)/6000` for freight dimensions
- ✅ Do use `PaymentEntry` interface with `cardState: "idle" | "processing" | "approved" | "declined"` for card transactions
- ✅ Do guard freight creation with `requirePermission(request, Permission.CHECKIN_PROCESS)`
- ✅ Do handle the `payment_mode` field on freight consignments (`cash`, `invoice`, `credit_account`)
- ✅ Do use the `checkinRepository.searchBookings()` raw SQL query (no Prisma ORM equivalent for cross-table ILIKE)

### Don't

- ❌ Don't check in a booking as a whole — always operate per `booking_leg_passenger` row
- ❌ Don't skip weight recording before check-in
- ❌ Don't allow check-in when `outstandingBalance > 0` and `organization_billing !== true`
- ❌ Don't hardcode `MAX_FREE_BAGGAGE_KG = 20` in multiple places — reference the constant in `checkin.counter.tsx`
- ❌ Don't use `checkinRepository.confirmCheckin()` for new code — it's deprecated in favor of `bookingLegPassengerRepository.checkIn()`
- ❌ Don't change the waybill format (`FW-YYYYMMDD-NNNNN`) without updating freight lookup logic
- ❌ Don't modify `checkinRepository.recordPayment()` without syncing with the finance payment allocation flow
- ❌ Don't remove the `checkin.manage-reminders` permission without updating the check-in reminder scheduling
