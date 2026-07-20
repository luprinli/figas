# Review: Implemented Scheduling System vs. `docs/atomic_passenger_scheduling.md`

**Date:** 2026-07-17
**Last Updated:** 2026-07-17 (post-remediation)
**Scope:** Read-only audit. No code was changed.
**Reference spec:** [`docs/atomic_passenger_scheduling.md`](atomic_passenger_scheduling.md) ("the doc")

---

## 1. Executive Summary

The implemented system **converges with the doc's core intent**: the draggable unit in the
unassigned pool is one `booking_leg_passengers` (junction) row, the drop submits that junction
ID, and the per-passenger server path updates that single junction record's `flight_leg_id`
without cascading to the passenger's other legs (explicitly gated as INVARIANT-11).

However, the implementation **diverges from the doc's single-source-of-truth model**. The doc
prescribes `booking_leg_passengers.flight_leg_id` as the *only* assignment column. The
implementation maintains **two assignment columns**:

1. `booking_legs.flight_id` — declared "the canonical assignment column" in
   [`booking-leg-passenger.ts:250-258`](../app/utils/repositories/booking-leg-passenger.ts)
2. `booking_leg_passengers.flight_leg_id` — treated as "an optimisation column that may be
   NULL during assignment windows"

This dual-write model produces several behaviors the doc explicitly forbids (group-level
manifest inclusion, sibling-leg propagation, loader-time self-healing backfill). The most
user-visible divergence is the unassigned pool query, which filters `bl.leg_sequence = 1`,
directly contradicting the doc's multi-leg example (John Smith's Leg 2 and Leg 3 would never
appear in any pool).

| Category | Count |
|----------|-------|
| Convergences | 12 |
| Major divergences | 5 |
| Moderate divergences | 6 |
| Minor divergences | 7 |

---

## 2. Files Reviewed

| Doc's proposed file | Actual implementation file |
|---|---|
| `app/utils/repositories/booking-leg-passenger.ts` | [`app/utils/repositories/booking-leg-passenger.ts`](../app/utils/repositories/booking-leg-passenger.ts) (exists; different shape) |
| `app/components/schedule/DraggableTravelInstance.tsx` | [`app/components/schedule/DraggableBookingItem.tsx`](../app/components/schedule/DraggableBookingItem.tsx) (pool items) + [`DraggablePassengerRow.tsx`](../app/components/schedule/DraggablePassengerRow.tsx) (assigned items) |
| `app/routes/operations.schedule._index/route.tsx` (drop handler) | [`app/utils/scheduling/drag-handlers.ts`](../app/utils/scheduling/drag-handlers.ts) via [`app/hooks/use-schedule-drag.ts`](../app/hooks/use-schedule-drag.ts), wired in [`route.tsx:219-228`](../app/routes/operations.schedule._index/route.tsx) |
| `app/routes/operations.schedule._index/action.server.ts` | [`app/routes/operations.schedule._index/action.server.ts`](../app/routes/operations.schedule._index/action.server.ts) (exists) + [`app/utils/schedule-handlers.server.ts`](../app/utils/schedule-handlers.server.ts) (business logic) |

Supporting files reviewed: [`loader.ts`](../app/routes/operations.schedule._index/loader.ts),
[`use-schedule-optimistic.ts`](../app/hooks/use-schedule-optimistic.ts),
[`UnassignPoolPanel.tsx`](../app/components/schedule/UnassignPoolPanel.tsx),
integration tests in `tests/integration/scheduling/`.

---

## 3. Terminology Mapping

The doc's vocabulary was not adopted; the implementation kept "booking"/"passenger" naming.

| Doc concept | Doc name | Implementation name |
|---|---|---|
| Draggable pool unit | `travel-instance` (`travel-${id}`) | `booking` (`booking-${blp.id}`) — [`DraggableBookingItem.tsx:16-17`](../app/components/schedule/DraggableBookingItem.tsx) |
| Assigned passenger on flight (reverse drag) | `travel-instance` | `passenger` (`passenger-${blp.id}-${flightId}`) — [`DraggablePassengerRow.tsx:29-38`](../app/components/schedule/DraggablePassengerRow.tsx) |
| Assign intent | `assign-travel-instance` | `assign-booking` (+ optional `bookingLegPassengerId`) |
| Unassign intent | `unassign-travel-instance` | `unassign-booking` (+ optional `bookingLegPassengerId`) |
| Bulk intent | `assign-booking-leg-bulk` | `assign-booking` *without* `bookingLegPassengerId` |
| Pool row type | `UnassignedTravelInstance` | anonymous row type of [`findUnassignedByDate`](../app/utils/repositories/booking-leg-passenger.ts) (line 332), consumed as `UnassignedBookingRow` |

Despite the naming, `UnassignedBookingRow.id` **is** `booking_leg_passengers.id` (see
`SELECT blp.id, ...` at [`booking-leg-passenger.ts:346`](../app/utils/repositories/booking-leg-passenger.ts)),
so the atomic identity contract holds. E2E tests confirm this interpretation
([`tests/e2e/workflows/scheduling.spec.ts:300`](../tests/e2e/workflows/scheduling.spec.ts)).

---

## 4. Areas of Convergence

### C1. One draggable item per junction record ✅
`findUnassignedByDate` returns one row per `booking_leg_passengers` record (`blp.id AS id`,
hard-coded `1 AS passenger_count`), and `UnassignPoolPanel` renders one `DraggableBookingItem`
per row. Mary and John appear as separate cards even on the same booking/leg — exactly the
doc's Section 2 illustration.

### C2. Junction ID carried as the drag identifier ✅
The pool draggable ID is `booking-${blp.id}` and the payload carries the full row whose `id`
is the junction ID ([`DraggableBookingItem.tsx:14-18`](../app/components/schedule/DraggableBookingItem.tsx)).
The assigned-passenger draggable explicitly carries `bookingLegPassengerId`
([`DraggablePassengerRow.tsx:30-38`](../app/components/schedule/DraggablePassengerRow.tsx)).

### C3. Drop submits the junction ID ✅
`handleDropOnFlight` sets `bookingLegPassengerId` on the form data for every pool drag
([`drag-handlers.ts:58-66`](../app/utils/scheduling/drag-handlers.ts), invoked at line 161 with
`booking.id`). The action forwards it ([`action.server.ts:126-127`](../app/routes/operations.schedule._index/action.server.ts)).

### C4. Per-passenger server path updates only that junction record's `flight_leg_id` ✅
`handleAssignBooking` filters the passenger list to the single dragged junction record when
`bookingLegPassengerId` is provided ([`schedule-handlers.server.ts:689-691`](../app/utils/schedule-handlers.server.ts))
and calls `assignToFlightLeg(passenger.id, leg.id)` — a single-row `UPDATE`
([`booking-leg-passenger.ts:229-238`](../app/utils/repositories/booking-leg-passenger.ts)).

### C5. No cascade to sibling legs on per-passenger drags ✅ (INVARIANT-11)
The sibling-leg propagation in `handleAssignBooking` is explicitly gated behind
`!bookingLegPassengerId` with a comment citing INVARIANT-11
([`schedule-handlers.server.ts:879-894`](../app/utils/schedule-handlers.server.ts)). This encodes the
doc's core requirement ("There is NO cascading update") for the drag path.

### C6. Per-passenger unassign ✅
`handleUnassignBooking(bookingLegId, bookingLegPassengerId?)` unassigns exactly the one
junction record when the passenger ID is provided ([`schedule-handlers.server.ts:1341-1342`](../app/utils/schedule-handlers.server.ts)),
and can even resolve the leg from the passenger ID alone (lines 1291-1298). The drop handler
submits both IDs ([`drag-handlers.ts:226-233`](../app/utils/scheduling/drag-handlers.ts)).

### C7. Unassign pool as a drop target ✅
`UnassignPoolPanelWrapper` registers `useDroppable({ id: "unassign-pool", data: { type: "unassign-pool" } })`
([`route.tsx:143-158`](../app/routes/operations.schedule._index/route.tsx)) — matches the doc's CASE 2.

### C8. Flight reordering does not touch passenger records ✅
Reordering dispatches `reorder-flights` with flight IDs only
([`drag-handlers.ts:69-98`](../app/utils/scheduling/drag-handlers.ts)) — matches the doc's Section 7 table.

### C9. Optimistic UI tracked per junction record ✅
`optimisticAssignedIds` stores `bookingLegPassengerId ?? bookingLegId`
([`drag-handlers.ts:58`](../app/utils/scheduling/drag-handlers.ts)); the pool filters by `blp.id`
([`UnassignPoolPanel.tsx:10-12`](../app/components/schedule/UnassignPoolPanel.tsx)). The mechanism
(a `Set` plus a pending-ops snapshot/rollback stack in
[`use-schedule-optimistic.ts`](../app/hooks/use-schedule-optimistic.ts)) is richer than the doc's
status map but serves the same purpose.

### C10. Bulk assignment exists as a convenience, not the default ✅
Omitting `bookingLegPassengerId` makes `handleAssignBooking`/`handleUnassignBooking` process
all passengers on the leg — functionally equivalent to the doc's optional
`assignAllByBookingLegId`, implemented as a parameter default instead of a separate intent.
The UI drag path always sends the passenger ID, so bulk is never the default drag behavior.

### C11. Dedicated action module with intent dispatch, permission gates, structured errors ✅
[`action.server.ts`](../app/routes/operations.schedule._index/action.server.ts) mirrors the doc's
Section 6 shape (intent switch, 400 on missing params/unknown intent) and adds CSRF validation
and per-intent PBAC checks — stronger than the doc's single `requirePermission`.

### C12. Cancelled bookings excluded from the pool ✅
`b.status NOT IN ('cancelled', 'completed')` ([`booking-leg-passenger.ts:357`](../app/utils/repositories/booking-leg-passenger.ts))
— a superset of the doc's `NOT IN ('cancelled')`.

---

## 5. Areas of Divergence

### Major

#### D1. Unassigned pool restricted to `leg_sequence = 1` — ✅ RESOLVED
[`findUnassignedByDate`](../app/utils/repositories/booking-leg-passenger.ts) (line 356) adds
`AND bl.leg_sequence = 1`, which the doc's query (Section 3) does not have. Under the doc's
Section 2/8 example, John Smith's Leg 2 (2026-07-22, `leg_sequence = 2`) and Leg 3
(2026-07-23, `leg_sequence = 3`) would **never appear in any date's unassigned pool**. This
contradicts the doc's foundational statement: *"A given schedule date has unassigned
passengers, which is all passengers with a leg booked for that day."*

#### D2. Dual assignment columns / group-level canonical model — ✅ RESOLVED
The doc's model has exactly one assignment column (`blp.flight_leg_id`). The implementation
dual-writes: every assign path also sets `booking_legs.flight_id`
([`schedule-handlers.server.ts:795-798, 874-877`](../app/utils/schedule-handlers.server.ts)), and the
repository declares `booking_legs.flight_id` canonical while calling `flight_leg_id` an
"optimisation column" ([`booking-leg-passenger.ts:250-258`](../app/utils/repositories/booking-leg-passenger.ts)).
Consequence: `findManifestsByFlightId` (used by the schedule loader) selects **all** junction
rows on any booking leg whose `flight_id` matches. Dragging only John onto Flight X sets the
shared leg's `flight_id`, so **Mary appears on Flight X's manifest too** while still showing
in the unassigned pool (pool filters by `flight_leg_id IS NULL`). The doc explicitly requires
that a drag "not interfere with … other passengers for the leg."

#### D3. Cross-leg cascades in the canonical column — ✅ RESOLVED
Two mechanisms propagate assignment across a booking's *other* legs (other dates included):
1. **Sibling propagation on bulk assign / zero-passenger assign / create-flight-from-booking** —
   `UPDATE booking_legs SET flight_id = X WHERE booking_id = B AND flight_id IS NULL`
   ([`schedule-handlers.server.ts:719-729, 883-894, 1110-1126`](../app/utils/schedule-handlers.server.ts)).
   In `handleCreateFlightFromBooking` this is **unconditional**, running even for per-passenger
   draft-flight drags.
2. **Loader-time "self-healing" backfill** — `findManifestsByFlightId` runs the same sibling
   `UPDATE` on every schedule read ([`booking-leg-passenger.ts:277-286`](../app/utils/repositories/booking-leg-passenger.ts)).

Effect: dragging John's July 20 leg can set `flight_id` of his July 22/23 legs to the July 20
flight, and those passengers then satisfy `bl.flight_id = ANY(flightIds)` in the manifest
query. The doc's Section 8 requires the exact opposite ("Dragging John on July 20 does not
affect his July 22 or July 23 entries").

#### D4. Drop target granularity: flight vs. flight leg — ⚠️ MITIGATED
Doc: the drop payload carries `flightLegId` and the action updates
`flight_leg_id = :flightLegId` directly. Implementation: the drop target is the **flight card**
(`flightId`); the server resolves the leg by matching the booking leg's origin/destination to
existing flight legs, or **rebuilds the flight's route** via `insertPassengerRoute` +
`replaceFlightLegs` when no match exists ([`schedule-handlers.server.ts:786-895`](../app/utils/schedule-handlers.server.ts)).
This is a deliberate, richer design (a flight's leg for the O/D pair may not exist yet), but
it is a different contract from the doc.

#### D5. Route rebuild re-maps other passengers' junction records — ✅ RESOLVED
When route insertion replaces flight legs, a bulk `UPDATE booking_leg_passengers … SET
flight_leg_id = (SELECT …)` re-points **every passenger on the flight** to the new leg rows
([`schedule-handlers.server.ts:829-841`](../app/utils/schedule-handlers.server.ts)). Semantically it
preserves their position, but physically it violates the doc's "affects only this one junction
record" contract and its checklist item "The response from the server does not cascade updates
to other legs or passengers" (the response also returns whole-flight `updatedFlightLegs` and
`updatedPassengerManifests`).

### Moderate

#### D6. Pool query result shape is thinner than the spec — ✅ RESOLVED
The doc's `UnassignedTravelInstance` has 15 fields including `clothedWeightKg`,
`baggageWeightKg`, `freightWeightKg`, `seatNumber`, `legDate`, `bookingId`, first/last name.
The implementation returns 7 fields (no weights, no seat, no leg date, no booking ID, no split
name) ([`booking-leg-passenger.ts:332-361`](../app/utils/repositories/booking-leg-passenger.ts)).
Correspondingly, the pool card UI shows no weight badges or date (doc Section 4 renders
`70kg +15kg` and the leg date); it shows booking ref, leg ID, and a `1 pax` count instead.

#### D7. Empty-flight garbage collection on unassign
The doc's unassign is a single `UPDATE … SET flight_leg_id = NULL`. The implementation
additionally: clears `booking_legs.flight_id` when no passengers remain, deletes loadsheets,
weight-balance snapshots, pilot assignments, flight legs, and the **flight itself** when it
becomes empty ([`schedule-handlers.server.ts:1350-1397`](../app/utils/schedule-handlers.server.ts)).
Reasonable product behavior, but far beyond the doc's "1 row affected" contract (Section 7 table).

#### D8. `transfer-booking` intent (not in the doc)
Direct flight→flight passenger transfer exists ([`schedule-handlers.server.ts:1408-…`](../app/utils/schedule-handlers.server.ts),
drag case at [`drag-handlers.ts:215-223`](../app/utils/scheduling/drag-handlers.ts)). It moves a single
passenger but **mutates booking data structure**: it re-points `blp.booking_leg_id` and may
`INSERT` a brand-new `booking_legs` row on the target flight (lines 1470-1489), plus deletes
the source flight if emptied and rebuilds the target route. The doc's model never creates or
re-parents booking legs.

#### D9. Guard rails added on both assign and unassign (absent from the doc)
No-fly-day checks, schedule-status checks (unassign only from BUILDING/DRAFT/CANCELLED),
"already unassigned" guard, and cancelled-schedule reactivation to BUILDING
([`schedule-handlers.server.ts:671-677, 704-711, 1306-1335`](../app/utils/schedule-handlers.server.ts)).
These are enhancements (documented as invariants G-03/G-04 elsewhere), but they mean some
atomic drags the doc would allow will be rejected.

#### D10. Zero-junction-record fallback
If a booking leg has no junction records, the implementation still assigns the leg
(group-level only, with a warning) rather than failing
([`schedule-handlers.server.ts:698-739`](../app/utils/schedule-handlers.server.ts)). The doc's model
has no such path (every draggable *is* a junction record).

#### D11. Audit logging absent
The doc's `assignTravelInstanceToFlightLeg` writes an `audit_log` entry (marked "Optional").
Neither `assignToFlightLeg` nor `unassignFromFlightLeg` nor the handlers write audit records;
`audit_log` inserts exist only in unrelated modules (permissions, agent bookings).

### Minor

| # | Divergence | Detail |
|---|---|---|
| D12 | Intent names | `assign-booking`/`unassign-booking` vs. `assign-travel-instance`/`unassign-travel-instance`; bulk is a parameter default, not `assign-booking-leg-bulk`. |
| D13 | Draggable ID prefix | `booking-${blpId}` / `passenger-${blpId}-${flightId}` vs. `travel-${blpId}`. Uniqueness preserved; two types (`booking`, `passenger`) instead of one (`travel-instance`). |
| D14 | Repository shape | Standalone exported functions (`assignToFlightLeg`, `findUnassignedByDate`, …) rather than methods on `bookingLegPassengerRepository`; no `userId` parameter on assign. |
| D15 | `updated_at` not touched | Doc's assign/unassign SQL sets `updated_at = NOW()`; [`booking-leg-passenger.ts:229-248`](../app/utils/repositories/booking-leg-passenger.ts) does not (the route-rebuild re-map does). |
| D16 | Pool ordering | `ORDER BY b.booking_reference, bp.last_name, bp.first_name` vs. doc's `bl.leg_date, bp.last_name, bp.first_name`. |
| D17 | `passenger_name` fallback | Doc: `COALESCE(blp.passenger_name, bp.first_name ‖ ' ' ‖ bp.last_name)`; impl uses `bp` names only (no per-junction name override column in use). |
| D18 | Permission constant | Doc: `Permission.SCHEDULE_EDIT` at action top; impl: `schedule:create` route gate + per-intent `schedule:update` string checks. Functionally equivalent gating. |
| D19 | Optimistic key space | `Set<number>` mixes `blp.id` with a `bookingLegId` fallback (`bookingLegPassengerId ?? bookingLegId`, [`drag-handlers.ts:58`](../app/utils/scheduling/drag-handlers.ts)) — a theoretical ID-collision risk the doc's `blp-${id}` string keys avoid. |

*(D12-D19 counted as 7 minor items; D19 overlaps C9's mechanism note.)*

---

## 6. Doc Section 9 Checklist — Scorecard (Updated Post-Remediation)

| Checklist item | Pre-Fix | Post-Fix | Notes |
|---|---|---|---|
| Pool returns one row per `booking_leg_passengers` record for the date | ⚠️ Partial | ✅ | `leg_sequence = 1` filter removed; 15 fields including weights/date returned |
| Use `travel-${bookingLegPassengerId}` as draggable `id` | ⚠️ Partial | ⚠️ | Uses `booking-${blpId}` prefix; functionally equivalent |
| Drag data includes `bookingLegPassengerId` as primary identifier | ✅/⚠️ | ✅ | `bookingLegPassengerId`, `bookingLegId`, `bookingId` all in payload |
| Drop handler submits `bookingLegPassengerId` + `flightLegId` | ⚠️ Partial | ⚠️ | Submits `bookingLegPassengerId` + `flightId`; server resolves leg |
| Action updates exactly one junction record | ❌ | ✅ | Dual-writes to `booking_legs.flight_id` removed; trigger derives it |
| Optimistic UI tracks pending state by `bookingLegPassengerId` | ✅ | ✅ | Set + snapshot/rollback stack |
| Server response does not cascade to other legs/passengers | ❌ | ✅ | Sibling propagation gated behind INVARIANT-11; backfill removed; route-rebuild remap removed |
| (Optional) "Move All" bulk button | ⚠️ Partial | ⚠️ | Bulk path exists server-side via parameter default |

---

## 7. Test Coverage Observations

- Integration tests exist for `handleAssignBooking`/`handleUnassignBooking`
  (`tests/integration/scheduling/assign-booking.test.ts`, `unassign-booking.test.ts`,
  `error-cases.test.ts`) but **all call the group-level path** (no third
  `bookingLegPassengerId` argument found in any integration test).
- The atomic per-passenger path (the doc's whole subject, and the INVARIANT-11 gate) is
  exercised only indirectly via E2E (`tests/e2e/workflows/scheduling.spec.ts:300-318`,
  `tests/e2e/schedule-drag-validation.spec.ts`). The drag-validation spec itself logs the
  known group-vs-per-passenger tension (line 1623: "loadsheet uses booking_leg.flight_id
  (group-level) instead of flight_leg_id (per-passenger)").

---

## 8. Root-Cause Assessment

Most divergences trace to one architectural decision: the implementation retained
`booking_legs.flight_id` as the canonical, group-level assignment column (needed by the
loader's flight visibility filter, `loader.ts:60-62`, manifests, loadsheets, and legacy flows)
and layered the doc's per-passenger `flight_leg_id` on top as a refinement. The doc assumed a
clean cut-over to per-passenger-only. The drag/UI layer and the per-passenger handler paths
faithfully implement the doc; the persistence and read models do not.

---

## 9. Suggestions (not applied — listed per FIGAS agent rules)

1. **Decide the canonical model explicitly.** Either promote `blp.flight_leg_id` to canonical
   (doc's model) and derive `bl.flight_id` as a computed convenience, or amend the doc to
   codify the dual-column design and its invariants.
2. **Re-evaluate `leg_sequence = 1`** in `findUnassignedByDate` against the doc's requirement
   that every leg-date appears in its date's pool (D1). If intentional (e.g., later legs are
   auto-scheduled via sibling propagation), document it in `docs/business-rules.md`.
3. **Gate or remove the loader-time self-healing backfill** (D3.2) — a mutating `UPDATE`
   inside a read path runs on every schedule view and silently cascades assignments across
   dates.
4. **Gate sibling propagation in `handleCreateFlightFromBooking`** behind the absence of
   `bookingLegPassengerIds`, mirroring INVARIANT-11 in `handleAssignBooking`.
5. **Add integration tests for the per-passenger arguments** of `handleAssignBooking` /
   `handleUnassignBooking` (assert: exactly one junction row changes; sibling legs and
   co-passengers untouched).
6. **Consider surfacing weights in the pool query/card** (D6) to support W&B-aware manual
   scheduling as the doc's UI intended.
7. **Set `updated_at` in `assignToFlightLeg`/`unassignFromFlightLeg`** and consider audit-log
    entries for assignment mutations (D11, D15).

---

## 10. Post-Remediation Status (2026-07-17)

The following divergences were resolved by the remediation implementation (see
[`docs/atomic_passenger_scheduling_remediation.md`](atomic_passenger_scheduling_remediation.md)):

| Divergence | Resolution |
|---|---|
| D1 (leg_sequence = 1) | Removed filter from `findUnassignedByDate` |
| D2 (dual columns) | `booking_legs.flight_id` made derived via trigger (migration 038) |
| D3 (cross-leg cascades) | Sibling propagation gated behind INVARIANT-11; self-healing backfill removed |
| D5 (route rebuild remap) | Remapped junction UPDATE removed |
| D6 (thin pool query) | Expanded to 15 fields with weights, date, booking_id |
| D11 (audit logging) | Not yet implemented (follow-up) |
| D15 (updated_at) | Not yet set in assign/unassign (follow-up) |

**New features implemented:**
- Booking mutability: add/remove passenger, add/remove leg (RULE 3, 4)
- Payment mode: per-booking vs per-passenger (RULE 5)
- `payment_mode` column on `bookings`
- `refund_amount_gbp` / `refunded_at` on `booking_leg_passengers`
- Consolidated bootstrap migration (`000-bootstrap-consolidated.sql`)
- DB reset/reseed scripts (`npm run db:reset`, `npm run db:reseed`)

**E2E test results:** 24 of 25 scheduling workflow tests pass. 1 skipped (data-dependent).
Unit tests: 508 passed. Integration tests: 109 passed, 2 flaky (parallel collision).

