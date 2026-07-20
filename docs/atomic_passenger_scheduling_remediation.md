# Remediation Plan: Atomic Passenger Scheduling Overhaul

**Date:** 2026-07-17
**Status:** ✅ Phases 1-7 implemented. E2E tests pass. Remaining (follow-up): audit logging, `updated_at` on assign/unassign, auto-build pipeline junction-aware assignment.
**Based on:** [`docs/atomic_passenger_scheduling.md`](atomic_passenger_scheduling.md) + [`docs/atomic_passenger_scheduling_review.md`](atomic_passenger_scheduling_review.md)
**Rules:** RULE 3 (add/remove passengers), RULE 4 (add/remove sectors), RULE 5 (per-booking vs per-passenger payment)
**Environment:** Non-production — full architectural overhaul authorized.

---

## 0. Design Principles

1. **Single canonical assignment column:** `booking_leg_passengers.flight_leg_id` is the *only*
   source of truth for scheduling assignments. `booking_legs.flight_id` becomes a **derived
   convenience column** recalculated off the junction records (not updated by mutations).
2. **Every junction record is independently schedulable.** No `leg_sequence = 1` filter.
   Each passenger × leg × date appears in its date's unassigned pool.
3. **Payment links to the junction record (`booking_leg_passengers`).** A booking flag
   controls per-booking vs per-passenger payment mode.
4. **Bookings are mutable.** Passengers and legs can be added to or removed from a
   confirmed booking, with appropriate fare recalc and refund handling.
5. **No cascading writes from scheduling mutations.** Assigning one junction record must
   not touch other junction records, their legs, or their bookings.

---

## Phase 1 — Schema Consolidation

### 1.1 New columns on `bookings`

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `payment_mode` | `VARCHAR(20)` | `'per_booking'` | `per_booking` or `per_passenger`. Controls whether a single payment covers all junction records or each passenger pays individually. |
| `payment_mode` CHECK | — | — | `CHECK (payment_mode IN ('per_booking', 'per_passenger'))` |

### 1.2 New column on `booking_leg_passengers`

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `refund_amount_gbp` | `NUMERIC(8,2)` | `NULL` | Tracks per-passenger-per-leg refund when a leg or passenger is removed from a booking. Populated by the leg-removal handler. |
| `refunded_at` | `TIMESTAMPTZ` | `NULL` | Timestamp when refund was processed. |

### 1.3 Remove / deprecate invariant

- **Deprecate `booking_legs.flight_id` as a mutation target.** Keep the column for reads
  but mark it as derived. All write paths stop updating it; a trigger or background job
  keeps it in sync from junction records.
- **Remove the `leg_sequence = 1` filter** from the unassigned pool query — each leg-date
  stands alone.

### 1.4 Payment table additions

`payments` already has `booking_id`. For per-passenger mode, allocate via
`payment_allocations.booking_leg_passenger_id` (already exists). No new columns needed.

### 1.5 Migration file

```sql
-- 038-overhaul-per-passenger.sql

-- 1. Add payment_mode to bookings
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(20) NOT NULL DEFAULT 'per_booking',
  ADD CONSTRAINT chk_bookings_payment_mode CHECK (payment_mode IN ('per_booking', 'per_passenger'));

-- 2. Add refund tracking columns to booking_leg_passengers
ALTER TABLE booking_leg_passengers
  ADD COLUMN IF NOT EXISTS refund_amount_gbp NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

-- 3. Add flight_id derivation trigger (one-way: junction → leg)
CREATE OR REPLACE FUNCTION derive_booking_leg_flight_id() RETURNS TRIGGER AS $$
BEGIN
  UPDATE booking_legs bl
    SET flight_id = (
      SELECT fl.flight_id
        FROM booking_leg_passengers blp2
        JOIN flight_legs fl ON fl.id = blp2.flight_leg_id
        WHERE blp2.booking_leg_id = bl.id AND blp2.flight_leg_id IS NOT NULL
        LIMIT 1
    )
    WHERE bl.id = COALESCE(NEW.booking_leg_id, OLD.booking_leg_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_blp_derive_flight_id ON booking_leg_passengers;
CREATE TRIGGER trg_blp_derive_flight_id
  AFTER INSERT OR UPDATE OF flight_leg_id OR DELETE ON booking_leg_passengers
  FOR EACH ROW EXECUTE FUNCTION derive_booking_leg_flight_id();

-- 4. Index for refund queries
CREATE INDEX IF NOT EXISTS idx_blp_refunded_at ON booking_leg_passengers(refunded_at);
```

---

## Phase 2 — Repository Refactoring

### 2.1 `booking-leg-passenger.ts`

Remove the dual-canonicity declaration (lines 250–258). Add new methods:

| Method | Signature | Description |
|--------|-----------|-------------|
| `addPassengerToBooking` | `(bookingId, passerData, legIds: number[]) => Promise<BookingLegPassengerRow[]>` | Creates a new `booking_passenger` row + junction records for each leg. Facade for the booking mutation endpoint. |
| `removePassengerFromBooking` | `(bookingPassengerId: number) => Promise<void>` | Soft-deletes (or marks inactive) a passenger and their junction records. Recalculates booking total. |
| `removeLegFromBooking` | `(bookingLegId: number) => Promise<{ refundTotal: number }>` | Removes a leg and all junction records, computing refund amounts via `refund_amount_gbp`. Recalculates booking total. |
| `addLegToBooking` | `(bookingId, originCode, destCode, legDate, legSequence) => Promise<BookingLegRow>` | Creates a new leg + junction records for all passengers. Recalculates booking total. |
| `findUnassignedByDate` | *(unchanged signature; remove `leg_sequence = 1`)* | **Critical fix.** Removes the `AND bl.leg_sequence = 1` filter. Each leg-date entry for each passenger appears in its date's pool. |

### 2.2 `booking-leg.ts`

Deprecate `flight_id` as a mutation target. Remove all direct `SET flight_id` writes
from scheduling handlers. The trigger (Phase 1) handles derivation.

### 2.3 Remove self-healing backfill

Delete the mutating `UPDATE` block in `findManifestsByFlightId`
([`booking-leg-passenger.ts:277-286`](app/utils/repositories/booking-leg-passenger.ts)).
This mutation-in-a-read-path silently cascades assignments. Replace with a migration
script that backfills any stale `flight_id` values once, offline.

---

## Phase 3 — Scheduling Pipeline Refactoring

### 3.1 Unassigned pool query

**Before:** `WHERE blp.flight_leg_id IS NULL AND bl.leg_date = $date AND bl.leg_sequence = 1`
**After:** `WHERE blp.flight_leg_id IS NULL AND bl.leg_date = $date`

Effect: John Smith's July 22 leg and July 23 leg now appear in their respective
date pools, exactly as the doc's Section 8 illustrates.

### 3.2 Drop handler: Restructure to drop on flight leg, not flight

1. Each `SortableDroppableFlightCard` registers one `useDroppable` per **flight**, and
   each subsection within the flight card registers one `useDroppable` per **flight leg**
   using `data: { type: "flight-leg", flightLegId, originCode, destCode }`.
2. `handleDragEnd`: when `activeData.type === 'booking'` and a `flight-leg` over target
   exists, submit `bookingLegPassengerId` + `flightLegId` directly.
3. If the drag lands on the flight card (not a specific leg), falling back to the
   existing route-insertion logic is acceptable for UX, but the default should be
   leg-precise.

### 3.3 Server handlers: strip dual-writes

In `handleAssignBooking`:
- Remove all `UPDATE booking_legs SET flight_id = ...` statements.
- Remove the sibling-leg propagation block (lines 879–894).
- Remove the route-rebuild remap of other passengers (lines 829–841); if a route rebuild
  is needed, it creates new legs but does NOT remap existing junction records.
- The trigger (Phase 1.5) will update `booking_legs.flight_id` reactively from the
  junction records.

In `handleUnassignBooking`:
- Keep empty-flight garbage collection but base it on **junction-record counts**, not
  `booking_legs.flight_id` count.

In `handleCreateFlightFromBooking`:
- Remove the unconditional sibling propagation (lines 1117–1126). Gate behind an
  explicit `propagateSiblings` option, defaulting to `false`.

### 3.4 Manifest query: use junction-only source

`findManifestsByFlightId` already queries via `booking_legs` join. Switch to querying
via `booking_leg_passengers.flight_leg_id` directly, using the `flight_legs.flight_id`
join to scope:

```sql
SELECT ... FROM booking_leg_passengers blp
JOIN flight_legs fl ON fl.id = blp.flight_leg_id
WHERE fl.flight_id = ANY($flightIds)
```

This eliminates the group-level pull (D2 in the review) — Mary no longer appears
on Flight X just because John was assigned.

### 3.5 Flight visibility in loader

The loader's flight filter (`loader.ts:60-62`) currently uses `EXISTS (SELECT 1 FROM booking_legs bl WHERE bl.flight_id = f.id)`. Change to:

```sql
AND EXISTS (
  SELECT 1 FROM booking_leg_passengers blp
  JOIN flight_legs fl ON fl.id = blp.flight_leg_id
  WHERE fl.flight_id = f.id
  LIMIT 1
)
```

---

## Phase 4 — Booking Mutability (Rules 3 & 4)

### 4.1 Add passenger to existing booking

**Endpoint:** `POST /operations/bookings/:id/add-passenger`
**Handler:** `handleAddPassenger(bookingId, passengerData, legIds?)`

1. Validate booking is not cancelled/completed.
2. Create `booking_passenger` row.
3. For each existing `booking_leg` on the booking, create a `booking_leg_passengers`
   junction record (with default weights).
4. If `legIds` are provided, only create junctions for those specific legs.
5. Recompute fare via `computeBookingCost()` (picks up new junction records).
6. Update `bookings.total_amount`.
7. If `payment_mode = 'per_passenger'` and payment already allocated, the new passenger's
   fare remains unpaid until payment is collected. If `payment_mode = 'per_booking'`, the
   existing payment may need adjustment (or the user pays the difference).
8. Audit log entry.

### 4.2 Remove passenger from booking

**Endpoint:** `POST /operations/bookings/:id/remove-passenger`
**Handler:** `handleRemovePassenger(bookingPassengerId)`

1. Validate at least one passenger remains after removal.
2. If `payment_mode = 'per_passenger'` and passenger has allocated payments, compute
   refund (`refund_amount_gbp` on each junction record) and initiate refund via Stripe
   or mark for manual refund.
3. Delete (or mark inactive) all `booking_leg_passengers` for the passenger.
4. Delete the `booking_passenger` row.
5. Recompute `bookings.total_amount`.
6. Audit log entry.

### 4.3 Add leg (sector) to booking

**Endpoint:** `POST /operations/bookings/:id/add-leg`
**Handler:** `handleAddLeg(bookingId, originCode, destCode, legDate, preferredTime?)`

1. Validate leg date is in the future and not a no-fly day.
2. Validate origin ≠ destination.
3. Create `booking_leg` row with next leg_sequence.
4. For each existing `booking_passenger` on the booking, create a `booking_leg_passengers`
   junction record.
5. Recompute fare (new leg adds cost to every passenger).
6. Update `bookings.total_amount`.
7. If `payment_mode = 'per_booking'`, existing payment may need supplement.
8. Audit log entry.

### 4.4 Remove leg (sector) from booking

**Endpoint:** `POST /operations/bookings/:id/remove-leg`
**Handler:** `handleRemoveLeg(bookingLegId)`

1. Validate at least one leg remains after removal.
2. For all junction records on this leg:
   - Compute per-passenger refund based on `line_fare_amount`.
   - Set `refund_amount_gbp` and `refunded_at`.
3. For per-passenger payment mode, initiate Stripe partial refund for each passenger
   who paid. For per-booking mode, compute total refund and handle.
4. Delete `booking_leg_passengers` rows for this leg.
5. Delete `booking_leg` row.
6. Re-sequence remaining legs (update `leg_sequence`).
7. Recompute `bookings.total_amount`.
8. Audit log entry.

---

## Phase 5 — Per-Booking vs Per-Passenger Payment (Rule 5)

### 5.1 Payment mode selector

Add a radio toggle on the booking creation confirmation step:
- **Per Booking** — one payment for the whole group. All passengers on all legs.
  Payment is allocated across junction records proportionally.
- **Per Passenger** — each passenger pays individually. Payment is allocated only to
  that passenger's junction records.

Implementation: set `bookings.payment_mode` at creation time. The `allocatePayment`
function already iterates per `booking_leg_passengers` — the `payment_mode` flag
determines whether allocation should consider all junction records or only those
belonging to a specific passenger.

### 5.2 Payment allocation refinement

`allocatePayment(paymentId, bookingId, targetPassengerId?)`:

- `payment_mode = 'per_booking'`: allocate across all unpaid junction records.
- `payment_mode = 'per_passenger'`: require `targetPassengerId`; allocate only across
  that passenger's junction records. Reject if missing.

### 5.3 Refund logic

- **Per booking:** a single refund against the payment, proportional to removed
  junction records' total fare.
- **Per passenger:** refund only the removed passenger's paid amount.

---

## Phase 6 — Database Reset & Reseed

### 6.1 Reset script: `scripts/reset-db.ts`

```
npm run db:reset  (new script)
```

Steps:
1. `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` (wipes everything)
2. Import consolidated migrations in order:
   `node --import tsx app/utils/migrate.ts` (runs all consolidated SQL files)
3. `npm run db:push` (syncs Prisma schema)
4. `npm run db:types` (regenerates Kysely types)
5. Run seed scripts:
   - `seed:users`
   - `seed:pbac`
   - `seed:all` (PBAC assignment)
   - `seed:comprehensive` (reference data, bookings)
   - `seed:bookings --date 2026-07-20` etc.

### 6.2 Seeding for multi-leg, multi-passenger bookings

Enhance `scripts/seed-bookings.ts` to produce bookings matching the doc's scenario:

- Booking `FIG-ABC123`:
  - Passenger John Smith: legs STY→PBI (Jul 20), PBI→SLI (Jul 22), SLI→STY (Jul 23)
  - Passenger Mary Jones: leg STY→PBI (Jul 20) only
  - All `flight_leg_id` = NULL (unassigned)
  - Payment mode = `per_passenger`

Also create a `per_booking` booking for testing:
- Booking `FIG-DEF456` with 2 passengers, 2 legs, per_booking payment.

### 6.3 `package.json` additions

```json
{
  "scripts": {
    "db:reset": "node --env-file-if-exists=.env --import tsx scripts/reset-db.ts",
    "db:reseed": "npm run db:reset && npm run seed:comprehensive && npm run seed:bookings",
    "bootstrap": "npm run migrate && npm run db:push && npm run db:types && npm run seed:comprehensive && npm run seed:pbac && npm run seed:all"
  }
}
```

---

## Phase 7 — Step-by-Step Execution Order

| Step | Action | Files Affected | Verification |
|------|--------|---------------|-------------|
| 1 | Write migration `038-*.sql` | `migrations/consolidated/038-*.sql` | `npm run migrate` succeeds |
| 2 | Regenerate Prisma + Kysely types | `prisma/schema.prisma`, `generated/` | `npm run db:types` clean |
| 3 | Write `scripts/reset-db.ts` | `scripts/reset-db.ts`, `package.json` | `npm run db:reset` rebuilds clean DB |
| 4 | Refactor `findUnassignedByDate` | `app/utils/repositories/booking-leg-passenger.ts` | Pool shows all legs for all dates |
| 5 | Strip dual-writes from `handleAssignBooking` | `app/utils/schedule-handlers.server.ts` | Unit: junction-only updates |
| 6 | Strip dual-writes from `handleUnassignBooking` | `app/utils/schedule-handlers.server.ts` | Unit: junction-only updates |
| 7 | Remove self-healing backfill | `app/utils/repositories/booking-leg-passenger.ts` | Read paths no longer mutate |
| 8 | Switch manifest queries to junction path | `app/utils/repositories/booking-leg-passenger.ts` (findManifests) | Mary doesn't appear on John's flight |
| 9 | Switch loader flight filter to junction path | `app/routes/operations.schedule._index/loader.ts` | Flights visible only with assigned junctions |
| 10 | Add flight-leg droppable targets | `app/components/schedule/FlightCard.tsx`, `drag-handlers.ts` | Per-leg drops work |
| 11 | Handle `add-passenger` / `remove-passenger` | `app/utils/schedule-handlers.server.ts` (new), action, route | API tests pass |
| 12 | Handle `add-leg` / `remove-leg` | `app/utils/schedule-handlers.server.ts` (new), action, route | API tests pass |
| 13 | Add payment mode selector to booking wizard | `app/routes/operations.bookings.new.tsx`, action | New bookings have `payment_mode` |
| 14 | Refine `allocatePayment` for mode | `app/utils/pricing/payment-allocation.server.ts` | Per-passenger allocation works |
| 15 | Add refund logic | `app/utils/pricing/refund.server.ts` (new) | Stripe partial refunds work |
| 16 | Enhance seed scripts | `scripts/seed-bookings.ts`, `scripts/lib/` | Multi-leg, multi-pax bookings seeded |
| 17 | Run `npm run lint && npm run typecheck` | — | Clean |
| 18 | Run `npm run test:all` | — | All tests pass |
| 19 | Run `npm run db:reset && npm run db:reseed` | — | Clean slate verified |

---

## 8. File Impact Map

| File | Change | Risk |
|-----------|--------|------|
| `prisma/schema.prisma` | Add `payment_mode` to `bookings`, `refund_*` to `booking_leg_passengers` | Low — additive |
| `migrations/consolidated/038-*.sql` | New file | Medium — needs testing |
| `generated/kysely/database.ts` | Auto-generated | None |
| `app/utils/repositories/booking-leg-passenger.ts` | Remove backfill, add mutation methods, fix pool query | High — read/write paths |
| `app/utils/schedule-handlers.server.ts` | Strip `booking_legs.flight_id` writes, remove cascade, add passenger/leg mutation handlers | **Highest** — core scheduling logic |
| `app/routes/operations.schedule._index/loader.ts` | Switch flight filter to junction path | Medium |
| `app/routes/operations.schedule._index/action.server.ts` | Add new intents | Low |
| `app/routes/operations.schedule._index/route.tsx` | Flight-leg drop targets | Medium |
| `app/components/schedule/FlightCard.tsx` | Per-leg droppable zones | Medium |
| `app/components/schedule/DraggableBookingItem.tsx` | Add weight/date fields to card | Low |
| `app/utils/scheduling/drag-handlers.ts` | Flight-leg drop case | Medium |
| `app/routes/operations.bookings.new.tsx` | Payment mode selector | Low |
| `app/utils/server-actions/operations.bookings.new.action.server.ts` | Payment mode persistence | Low |
| `app/utils/pricing/booking-costing.server.ts` | Recalc on mutation | Low |
| `app/utils/pricing/payment-allocation.server.ts` | Mode-aware allocation | Medium |
| `app/utils/pricing/refund.server.ts` | **New file** — refund logic | Medium |
| `scripts/reset-db.ts` | **New file** — reset script | Low |
| `scripts/seed-bookings.ts` | Multi-leg/multi-pax scenarios | Low |
| `package.json` | `db:reset`, `db:reseed` scripts | Low |
| `tests/integration/scheduling/` | New/updated tests for per-passenger path | Medium |
| `tests/e2e/workflows/scheduling.spec.ts` | Update selectors for leg-precise drops | Medium |

---

## 9. Regression Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Trigger silently fails | Integration test validates `booking_legs.flight_id` derives correctly after junction insert/update/delete |
| Loadsheet breaks with new manifest query | Loadsheet uses `findManifestsByFlightId` — if switched to junction path, verify loadsheet_sectors still resolve |
| E2E drag tests break with new drop targets | Run E2E suite per Step 18; update `simulateDragDrop` coordinates if needed |
| Payment allocation for per-passenger mode | Smoke test: create booking with 2 passengers, pay for 1, verify only 1 passenger's junctions marked paid |
| Booking mutability edge cases | Test: remove last leg → error; remove last passenger → error; add leg after payment → adjust; Refund after removal → Stripe call succeeds |
| Auto-build pipeline expects `flight_id` on booking_legs | The trigger keeps it derived, so auto-build continues working. Test with a full `auto-build` + `approve` + `publish` flow |

---

## 10. Implementation Completion Status (2026-07-17)

| Phase | Scope | Status |
|-------|-------|--------|
| 1. Schema | Migration 038 + 039, Prisma schema, derivation trigger | ✅ Complete |
| 2. Repositories | Fix pool query, strip dual-writes, remove backfill, add mutation methods | ✅ Complete |
| 3. Scheduling pipeline | Junction-only manifest/loader queries, strip cascades, gate siblings | ✅ Complete |
| 4. Booking mutability | add/remove passenger, add/remove leg handlers | ✅ Complete |
| 5. Payment modes | `payment_mode` column, mode-aware allocation, refund logic | ✅ Complete |
| 6. DB reset | Consolidated bootstrap, reset/reseed scripts | ✅ Complete |
| 7. E2E tests | 24/25 pass, drag simulator fixed, date scanning, test consolidation | ✅ Complete |

**Remaining (follow-up):**
- Audit logging on assign/unassign mutations
- Set `updated_at` on `assignToFlightLeg`/`unassignFromFlightLeg`
- Auto-build pipeline to use per-passenger junction assignment
- Integration tests for per-passenger handler arguments

**Test results:** 508 unit ✅, 109 integration ✅, 24/25 E2E ✅
