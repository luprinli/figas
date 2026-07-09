# FIGAS Test Data Seeding Plan — v3.0

**Date:** 2026-06-05
**Purpose:** Comprehensive, chronologically-sequential seed data to validate system robustness, end-to-end data integrity, accounting accuracy, and reporting engine correctness.
**Temporal Range:** 2026-04-01 through 2026-12-31 (9 months)
**Execution Model:** Single transactional SQL script runnable via `npx tsx scripts/seed-comprehensive.ts`

---

## 1. GOVERNING PRINCIPLES

### 1.1 Sequential Dependency Chain

Data must be seeded in strict dependency order. Each phase depends on data created in the previous phase:

```
Phase 1: Reference Data
  (aerodromes, aircraft, fare_routes, fuel_rules, distances, headings, airframe_hours, system_settings, organizations)
    ↓
Phase 2: Users, Roles & Permissions
  (users → user_roles, pilots → users)
    ↓
Phase 3: No-Fly Rules
  (no_fly_rules — must exist before bookings can be validated)
    ↓
Phase 4: Bookings & Passengers
  (bookings → booking_legs → booking_passengers → booking_leg_passengers)
    ↓
Phase 5: Schedules & Flights
  (schedules → flights → flight_legs → pilot_assignments → aircraft_assignments)
    ↓
Phase 6: Weight & Balance
  (weight_balance_snapshots → loadsheets → loadsheet_passengers)
    ↓
Phase 7: Check-In Activity
  (booking_leg_passengers.checked_in, payments for check-in transactions)
    ↓
Phase 8: Financial Records
  (payments, invoices, invoice_items, accounting_journal_entries, bank_transactions)
    ↓
Phase 9: Maintenance & Operations
  (flight_logs, maintenance_tasks, defects, airframe_hours updates)
    ↓
Phase 10: Freight
  (freight_consignments)
    ↓
Phase 11: Notifications & Reminders
  (notifications, checkin_reminders, payment_reminders)
    ↓
Phase 12: Audit Trail Validation
  (audit_log cross-reference verification)
```

### 1.2 No-Fly Day Rules

Applied to all 275 days in the seed range. A no-fly day means zero flights and zero bookings with `flight_assigned` or higher status. Bookings may still be created on no-fly days but will not advance past `confirmed`.

| # | Rule Type | Description | Days | Season |
|---|-----------|-------------|------|--------|
| NF-1 | Recurring | Sundays — no commercial flights | Day 0 (Sun) | Year-round |
| NF-2 | One-off | Good Friday | 2026-04-03 | — |
| NF-3 | One-off | Easter Monday | 2026-04-06 | — |
| NF-4 | One-off | Liberation Day | 2026-06-14 | — |
| NF-5 | One-off | Christmas Day | 2026-12-25 | — |
| NF-6 | One-off | Boxing Day | 2026-12-26 | — |
| NF-7 | One-off | New Year's Eve | 2026-12-31 | — |

**Result:** 275 total days → 39 Sundays + 5 one-off holidays (3 Sundays overlap) = 41 no-fly days, ~234 fly days.

### 1.3 Booking Density Targets

| Period | Dates | Fly Days | Target Bookings | Min/Day |
|--------|-------|----------|-----------------|---------|
| Historical (Apr) | 2026-04-01 to 2026-04-30 | ~26 | 80-90 | 3 |
| Historical (May) | 2026-05-01 to 2026-05-31 | ~27 | 100-110 | 3 |
| Current (Jun) | 2026-06-01 to 2026-06-30 | ~26 | 120-140 | 3 |
| Near Future (Jul) | 2026-07-01 to 2026-07-31 | ~27 | 140-160 | 3 |
| Taper (Aug) | 2026-08-01 to 2026-08-31 | ~27 | 90-100 | 3 |
| Ramp-Up (Sep) | 2026-09-01 to 2026-09-30 | ~26 | 120-130 | 3 |
| Ramp-Up (Oct) | 2026-10-01 to 2026-10-31 | ~27 | 140-150 | 3 |
| Peak (Nov) | 2026-11-01 to 2026-11-30 | ~26 | 160-170 | 3 |
| Peak (Dec) | 2026-12-01 to 2026-12-30 | ~24 | 150-160 | 3 |

**Peak Density Days (≥18 bookings triggering ≥3 flights):**
- 2026-06-15 (Monday) — 22 bookings, requires 3 flights
- 2026-07-06 (Monday) — 24 bookings, requires 4 flights
- 2026-07-20 (Monday) — 20 bookings, requires 3 flights
- 2026-09-14 (Monday) — 18 bookings, requires 3 flights
- 2026-10-19 (Monday) — 22 bookings, requires 3 flights
- 2026-11-09 (Monday) — 26 bookings, requires 4 flights
- 2026-12-07 (Monday) — 24 bookings, requires 4 flights

---

## 2. PHASE-BY-PHASE SEED SPECIFICATION

### 2.1 PHASE 1: Reference Data

#### 2.1.1 Aerodromes (31 active)
Reuse existing seed from `scripts/seed-full.ts`. Key aerodromes for high STY density:

| Code | Name | City | Runway | MTOW Limit | Fuel |
|------|------|------|--------|-----------|------|
| STY | Stanley Airport | Stanley | 918m gravel | 2994 kg | true |
| MPA | Mount Pleasant | Mount Pleasant | 2590m paved | 99999 kg | true |
| PSY | Port Stanley | Stanley | 918m gravel | 2994 kg | true |
| BVI | Beaver Island | Beaver Island | 600m grass | 2994 kg | false |
| CCI | Carcass Island | Carcass Island | 550m grass | 2994 kg | false |
| CHR | Chartres | Chartres | 700m grass | 2994 kg | false |
| DGS | Douglas Station | Douglas | 650m grass | 2994 kg | false |
| ... | (all 31 aerodromes) | | | | |

**STY-reachable aerodromes (within BN-2 range with reserve):** All 30 other aerodromes within 250nm.

#### 2.1.2 Aircraft (3 active, 1 OOS)

| Registration | Type | Seats | MTOW | Empty Wt | Status | Next Service |
|-------------|------|-------|------|----------|--------|-------------|
| VP-FBZ | BN-2B-26 | 9 | 2994 kg | 1627 kg | Active | 142h remaining |
| VP-FAZ | BN-2B-26 | 9 | 2994 kg | 1627 kg | Active | 87h remaining |
| VP-FCZ | BN-2B-26 | 9 | 2994 kg | 1627 kg | Active | 23h remaining |
| VP-FDZ | BN-2B-26 | 9 | 2994 kg | 1627 kg | **Out of Service** | 0h (overdue) |

#### 2.1.3 Fare Routes
Base fare matrix from existing seed. Key STY routes:
- STY→MPA: £15
- STY→BVI: £25
- STY→CCI: £30
- STY→CHR: £35
- STY→DGS: £40
- Other STY routes: £20-£60

#### 2.1.4 Organizations (4)
| Name | Code | Credit Limit | Payment Terms |
|------|------|-------------|---------------|
| Falkland Islands Government | FIG | £50,000 | net_30 |
| Falkland Islands Tourist Board | FITB | £10,000 | net_15 |
| Falklands Conservation | FCS | £5,000 | net_30 |
| Stanley Services Ltd | SSL | £3,000 | net_7 |

---

### 2.2 PHASE 2: Users, Roles & Permissions

#### 2.2.1 System Users (10)
Reuses PBAC seed from `prisma/seed-pbac.ts`. All passwords: `figas2024!`

| Email | Name | Role | Additional Roles |
|-------|------|------|-----------------|
| admin@figas.gov.fk | Sarah Admin | admin | — |
| ops@figas.gov.fk | James Ops | operations | — |
| checkin@figas.gov.fk | Emma Counter | checkin | — |
| checkin2@figas.gov.fk | Tom Desk | checkin | — |
| finance@figas.gov.fk | Rachel Finance | finance | — |
| pilot1@figas.gov.fk | Felix Captain | pilot | — |
| pilot2@figas.gov.fk | Oscar First | pilot | — |
| pilot3@figas.gov.fk | Nina Relief | pilot | — |
| engineer@figas.gov.fk | Mike Engineer | engineer | — |
| passenger@figas.gov.fk | Test Passenger | passenger | — |

#### 2.2.2 Pilot Records (3)
Linked to pilot user accounts:
| User | License | Rating | Medical Expiry |
|------|---------|--------|---------------|
| Felix Captain (pilot1) | ATPL-001 | BN-2 Type Rating | 2027-01-15 |
| Oscar First (pilot2) | CPL-002 | BN-2 Type Rating | 2026-09-30 |
| Nina Relief (pilot3) | CPL-003 | BN-2 Type Rating | 2027-06-01 |

#### 2.2.3 Passenger Users (60)
Distributed across the booking timeline. Created individually as `users` with role `passenger`.

| Age Range | Count | Weight Range (kg) | Notes |
|-----------|-------|-------------------|-------|
| 2-12 (child) | 8 | 20-40 | Under minimum age checks |
| 13-17 (youth) | 7 | 40-65 | |
| 18-40 (adult) | 25 | 55-90 | Most common |
| 41-60 (adult) | 12 | 65-100 | |
| 61-80 (senior) | 6 | 55-85 | |
| 81+ (senior) | 2 | 50-75 | |

---

### 2.3 PHASE 3: No-Fly Rules

7 rules as defined in Section 1.2. Rule NF-1 (Sundays, priority 10) is year-round. One-off holiday rules have priority 20 (override recurring).

---

### 2.4 PHASE 4: Bookings & Passengers (Core Data)

#### 2.4.1 Booking Distribution Strategy

| Trip Type | Percentage | Description |
|-----------|-----------|-------------|
| Single leg | 55% | STY → {destination} one-way |
| Return | 30% | STY → DEST → (1-7 day gap) → STY |
| Multi-leg | 15% | STY → A → (1-2 day layover) → B → STY |

#### 2.4.2 Destination Distribution (STY-heavy)

| Destination | Percentage | Notes |
|-------------|-----------|-------|
| MPA | 25% | Highest volume — government/business |
| BVI | 12% | Tourism |
| CCI | 10% | Tourism |
| CHR | 8% | Settlement |
| DGS | 8% | Settlement |
| DWN | 7% | Settlement |
| FXB | 5% | Research station |
| Other 25 aerodromes | 25% | Distributed evenly |

#### 2.4.3 Passenger Distribution per Booking

| Passengers | Percentage |
|-----------|-----------|
| 1 | 40% |
| 2 | 35% |
| 3 | 15% |
| 4+ | 10% |

#### 2.4.4 Booking Status Distribution

| Status | Count | Purpose |
|--------|-------|---------|
| `cancelled` | ~25 | Test cancelled booking handling, refund logic |
| `confirmed` (unassigned) | ~200 | Test schedule builder clustering |
| `flight_assigned` | ~350 | Test check-in availability gating |
| `pilot_review` | ~50 | Test manifest workflow |
| `approved` | ~100 | Test pre-check-in state |
| `checkin_open` | ~20 | Test check-in eligibility |
| `checked_in` / `completed` | ~355 | Test historical reporting |

#### 2.4.5 Payment Status Distribution

| Status | Count | Purpose |
|--------|-------|---------|
| `pending` | ~150 | Test payment reminders, overdue escalation |
| `paid` | ~400 | Normal flow |
| `invoiced` | ~80 | Test organization billing |
| `overdue` | ~40 | Test collections workflow — invoices past due_date |
| `partially_paid` | ~30 | Test split payment, top-up scenarios |
| `refunded` | ~20 | Test refund reconciliation |
| `partially_refunded` | ~10 | Test partial refund edge cases |
| `failed` | ~10 | Test payment failure retry logic |
| `cancelled` | ~25 | Test cancelled booking financial cleanup |

#### 2.4.6 Payment Method Distribution

| Method | Count | Purpose |
|--------|-------|---------|
| Stripe (`stripe`) | 40% | Online self-service payments |
| Invoice (`invoice`) | 20% | Organization billing (FIG, FITB, FCS, SSL) |
| Pay on Departure (`pay_on_departure`) | 20% | Counter check-in payments |
| Bank Transfer (`bank_transfer`) | 10% | Manual reconciliation testing |
| Pay on Arrival (`pay_on_arrival`) | 10% | Destination collection testing |

#### 2.4.7 Specific Multi-Leg Itineraries

| Booking Ref | Route | Passengers | Layover | Notes |
|-------------|-------|-----------|---------|-------|
| FIG-00100 | STY→MPA→BVI→STY | 2 | 1d at BVI | Government officials, invoice billing |
| FIG-00110 | STY→DGS→DWN→CHR→STY | 1 | 1d at DGS | Conservation researcher |
| FIG-00120 | STY→CCI→FXB→MPA→STY | 3 | 2d at FXB | Tourist family, split payment (2× card + 1× depart) |
| FIG-00130 | STY→BVI→CCI→STY | 1 | 1d at each | Island hopping tourist |
| FIG-00140 | MPA→STY→DGS | 4 | 1d at STY | Contractor crew, organization billing |
| FIG-00150 | STY→CHR→DWN→FXB→STY | 2 | 1d at DWN | Supply run, freight-heavy |

#### 2.4.8 Special Passenger Profiles

| Name | Age | Weight | Nationality | Special Requirements |
|------|-----|--------|-------------|---------------------|
| Alice Elderly | 82 | 55 kg | Falkland Islands | Wheelchair assistance |
| Bobby Child | 4 | 22 kg | UK | Unaccompanied minor (test age validation) |
| Carlos Heavy | 45 | 120 kg | Argentina | Requires weight-balance seat assignment |
| Diana Medical | 38 | 68 kg | UK | Medical oxygen required |
| Edward Frequent | 55 | 80 kg | Falkland Islands | 8 bookings across the timeline |

---

### 2.5 PHASE 5: Schedules & Flights

#### 2.5.1 Schedule Status Distribution

Schedules are created per-date via the scheduling pipeline. Historical dates have `published` or `completed` status.

| Period | Status | Dates |
|--------|--------|-------|
| Apr 1-30 | `completed` | All fly days |
| May 1-31 | `completed` | All fly days |
| Jun 1-4 | `completed` | All fly days |
| Jun 5 (today) | `published` | Current operating day |
| Jun 6-30 | `published` / `approved` | Future days |
| Jul 1-31 | `approved` / `building` | Near future |
| Aug 1+ | `draft` / `building` | Planning |

#### 2.5.2 Flight Generation

Flights created by Phase 5 of the scheduling pipeline:
1. `buildSchedule()` clusters unassigned bookings by (origin, destination, date)
2. Creates flights with `FIG-YYYYMMDD-NNN` format
3. Assigns aircraft, pilots, computes weight & balance

**Peak day example (2026-06-15, 22 bookings):**
```
FIG-20260615-001: STY→MPA→BVI→STY  (4 passengers)
FIG-20260615-002: STY→CHR→DGS→STY  (6 passengers)
FIG-20260615-003: STY→CCI→DWN→STY  (5 passengers)
FIG-20260615-004: STY→FXB→MPA→STY  (7 passengers)
```

#### 2.5.3 Pilot Assignments

Distribute 3 flights per pilot per day (max duty hours constraint):

| Pilot | Apr-May Flights | Jun Flights | Jul Flights |
|-------|----------------|-------------|-------------|
| Felix Captain | 40 | 22 | 18 |
| Oscar First | 35 | 20 | 16 |
| Nina Relief | 30 | 18 | 14 |

Record various statuses: `assigned` (default), `confirmed`, `checked_in`, `completed` (historical), `declined` (3 random instances to test decline flow).

#### 2.5.4 Aircraft Assignments

Round-robin across VP-FBZ, VP-FAZ, VP-FCZ (VP-FDZ is OOS). Track hours accumulation against airframe_hours limits.

---

### 2.6 PHASE 6: Weight & Balance

For each completed/approved flight:
- Compute passenger_weight_kg from booking_leg_passengers
- Compute baggage_weight_kg from booking_leg_passengers
- Compute freight_weight_kg from freight_consignments
- Compute fuel_weight_kg from fuel_rules
- Create `weight_balance_snapshots` with MTOW/MLW utilization percentages
- Create `loadsheets` for flights where pilot has signed off

**Boundary test cases:**
| Flight | Scenario | Expected |
|--------|----------|----------|
| FIG-20260415-002 | 9 passengers, max baggage → 92% MTOW | Warning, but within limits |
| FIG-20260620-003 | Heavy freight + 7 passengers → 98% MTOW | Near-limit warning |
| FIG-20260710-001 | 2 passengers, light load → 65% MTOW | Normal operation |

---

### 2.7 PHASE 7: Check-In Activity

#### 2.7.1 Checked-In Passengers (Historical: Apr-May)

For each passenger on a completed flight in the historical period (~600 passengers total):
- 85% `checked_in = true` with realistic `checked_in_at` timestamps
- 10% failed to check in (`checked_in = false`, `boarded = false`) — test no-show reporting
- 5% excess baggage (>20kg) recorded with payments

#### 2.7.2 Checked-In Passengers (Current: Jun 1-5)

For current/published flights:
- 60-80% checked in
- 10-15% pending check-in
- Balance remaining for testing

#### 2.7.3 Check-In Agent Actions

| Action | Count | Purpose |
|--------|-------|---------|
| Standard check-in (cash) | 200 | Test cash keypad flow |
| Standard check-in (card) | 150 | Test mock card processor |
| Invoice check-in (organization) | 80 | Test PO reference flow |
| Deferred payment check-in | 30 | Test pay-on-arrival flagging |
| Weight override check-in | 15 | Test manual scale audit trail |

#### 2.7.4 Check-In Reminders

Create `checkin_reminders` for upcoming flights (Jun 6-30):
| Reminder Type | Scheduled For | Count |
|--------------|--------------|-------|
| 24h before | T-24h | 200 |
| 2h before | T-2h | 200 |
| Status `sent` | Past | 150 |
| Status `pending` | Future | 250 |

---

### 2.8 PHASE 8: Financial Records

#### 2.8.1 Payments

Mirror booking payment status distribution. Each payment record includes:
- `booking_id` linkage
- `amount_gbp` matching fare route × passengers + excess baggage
- `method` matching booking payment method
- `status` reflecting current state
- `transaction_reference` for Stripe payments
- `paid_at` timestamp for completed payments

#### 2.8.2 Invoices

For organization-billed bookings (`is_organization_billing = true`):

| Org | Invoice Count | Total Value | Status Mix |
|-----|--------------|-------------|-----------|
| FIG | 15 | ~£4,500 | 60% paid, 20% issued, 10% overdue, 10% draft |
| FITB | 10 | ~£2,000 | 50% paid, 30% issued, 20% overdue |
| FCS | 8 | ~£1,200 | 70% paid, 30% issued |
| SSL | 5 | ~£800 | 80% paid, 20% draft |

Invoice items breakdown:
- `fare` per booking_leg_passenger (70%)
- `baggage` for excess (10%)
- `freight` for freight consignments (10%)
- `passenger_fee` (5%)
- `fuel_surcharge` (5%)

#### 2.8.3 Accounting Journal Entries

Double-entry bookkeeping for all financial transactions:
| Transaction | Debit | Credit |
|-------------|-------|--------|
| Passenger payment (cash) | 1010 Cash at Bank | 4010 Passenger Fare Revenue |
| Passenger payment (Stripe) | 1010 Cash at Bank | 4010 Passenger Fare Revenue |
| Invoice issued | 1020 Accounts Receivable | 4010 Passenger Fare Revenue |
| Invoice paid | 1010 Cash at Bank | 1020 Accounts Receivable |
| Refund | 4010 Passenger Fare Revenue | 1010 Cash at Bank |
| Excess baggage fee | 1010 Cash at Bank | 4010 Passenger Fare Revenue |

#### 2.8.4 Payment Reminders

For bookings with `payment_status IN ('pending', 'invoiced')` and past `payment_due_date`:
| Reminder Type | Count | Status |
|--------------|-------|--------|
| `payment_due` (at due date) | 30 | sent |
| `overdue_1d` (1 day past) | 20 | sent |
| `overdue_7d` (7 days past) | 15 | sent |
| `overdue_30d` (30 days past) | 10 | sent |

---

### 2.9 PHASE 9: Maintenance & Operations

#### 2.9.1 Flight Logs

For each completed flight in the historical period:
- Block time, tach time, cycles (1 per flight)
- Fuel uplift (kg) at STY, nil at out-stations
- Oil uplift (nil, BN-2 is piston)

#### 2.9.2 Maintenance Tasks

| Aircraft | Task | Due Date/Hours | Status |
|----------|------|---------------|--------|
| VP-FBZ | 50hr Inspection | 142h remaining | Open |
| VP-FBZ | 100hr Inspection | 442h remaining | Open |
| VP-FAZ | 50hr Inspection | 87h remaining | Open |
| VP-FAZ | 500hr Check | 387h remaining | Open |
| VP-FCZ | 50hr Inspection | 23h remaining (⚠ imminent) | Open |
| VP-FDZ | Engine Overhaul | 0h (overdue) | Open |

#### 2.9.3 Defects

| Aircraft | Defect | Severity | MEL Deferral | Status |
|----------|--------|----------|-------------|--------|
| VP-FCZ | Cabin heater INOP | Minor | Yes (Cat C, 10d) | Open |
| VP-FDZ | #2 Cylinder low compression | Major | No | Open |

---

### 2.10 PHASE 10: Freight Consignments

| Count | Distribution | Purpose |
|-------|-------------|---------|
| 40 | Historical (Apr-May, status `assigned`) | Test freight reporting |
| 15 | Current (Jun 1-5, mixed status) | Test active freight tracking |
| 10 | Future (Jun 6+, `unassigned`) | Test freight-to-flight assignment |

Mix of priorities: 20% urgent, 30% high, 40% medium, 10% low.
10% hazardous (dangerous goods declarations).
Mix of payment modes: cash, invoice, collect_on_arrival.

---

### 2.11 PHASE 11: Notifications & Reminders

| Type | Count | Status | Purpose |
|------|-------|--------|---------|
| Booking confirmation | 1 per booking | `sent` | Test notification history |
| Check-in reminder | Per Phase 7.4 | mixed | Test reminder pipeline |
| Payment reminder | Per Phase 8.4 | mixed | Test collections |
| Flight status change | 50 | `sent` | Test delay/cancellation notifications |
| System alert | 5 | `pending` | Test admin notification dashboard |

---

### 2.12 PHASE 12: Audit Trail Validation

Verify `audit_log` records exist for:
- All user creations
- All role assignments/modifications
- All schedule status transitions (draft→building→approved→published→completed)
- All booking status transitions
- All payment status transitions
- All permission changes

Cross-reference counts:
- `audit_log` entries should match the count of state-changing operations
- Each `schedules` record with status ≠ `draft` must have at least 1 audit_log entry
- Each `bookings` record with `cancelled_at` NOT NULL must have a cancellation audit entry

---

## 3. IMPLEMENTATION SCRIPT STRUCTURE

```typescript
// scripts/seed-comprehensive.ts
import { db } from "../app/utils/db.server";
import { hashPassword } from "../app/utils/password.server";

async function seed() {
  console.log("=== FIGAS Comprehensive Seed v3.0 ===");

  // Phase 1: Reference Data
  await seedAerodromes();
  await seedAircraft();
  await seedFareRoutes();
  await seedFuelRules();
  await seedDistancesAndHeadings();
  await seedAirframeHours();
  await seedSystemSettings();
  await seedOrganizations();

  // Phase 2: Users & Roles
  await seedUsers();
  await seedPBAC();          // roles, permissions, role_permissions, user_roles
  await seedPilots();

  // Phase 3: No-Fly Rules
  await seedNoFlyRules();

  // Phase 4: Bookings (chronological, Apr→Dec)
  for (const month of MONTHS) {
    for (const day of month.flyDays) {
      await seedBookingsForDay(day);  // skips no-fly days
    }
  }

  // Phase 5: Schedules (historical Apr-May, build pipeline for Jun+)
  await seedHistoricalSchedules();
  await seedCurrentSchedules();
  await seedFutureSchedules();

  // Phase 6: Weight & Balance
  await seedWeightBalance();

  // Phase 7: Check-In Activity
  await seedHistoricalCheckins();
  await seedCurrentCheckins();
  await seedCheckinReminders();

  // Phase 8: Financial Records
  await seedPayments();
  await seedInvoices();
  await seedJournalEntries();
  await seedPaymentReminders();

  // Phase 9: Maintenance
  await seedFlightLogs();
  await seedMaintenanceTasks();
  await seedDefects();

  // Phase 10: Freight
  await seedFreightConsignments();

  // Phase 11: Notifications
  await seedNotifications();

  // Phase 12: Audit Trail Validation
  await validateAuditTrail();

  console.log("=== Seed Complete ===");
  console.log(`Total bookings: ${bookingCount}`);
  console.log(`Total flights: ${flightCount}`);
  console.log(`Total passengers: ${passengerCount}`);
  console.log(`Checked in: ${checkedInCount}`);
  console.log(`No-shows: ${noShowCount}`);
}

seed().catch(console.error);
```

---

## 4. VALIDATION QUERIES (Post-Seed)

After seeding, run these validation queries to confirm data integrity:

```sql
-- 1. No bookings assigned to flights on no-fly days
SELECT COUNT(*) FROM booking_legs bl
JOIN flights f ON f.id = bl.flight_id
WHERE f.departure_time::date = '2026-04-05'::date; -- Sunday
-- Expected: 0

-- 2. All flights have at least one booking_leg
SELECT f.flight_number FROM flights f
LEFT JOIN booking_legs bl ON bl.flight_id = f.id
WHERE bl.id IS NULL AND f.status != 'cancelled';
-- Expected: 0 rows

-- 3. No orphan booking_leg_passengers
SELECT blp.id FROM booking_leg_passengers blp
LEFT JOIN booking_legs bl ON bl.id = blp.booking_leg_id
WHERE bl.id IS NULL;
-- Expected: 0 rows

-- 4. Weight & balance within MTOW
SELECT f.flight_number, wb.total_weight_kg, a.max_takeoff_weight_kg
FROM flights f
JOIN weight_balance_snapshots wb ON wb.flight_leg_id = f.id
JOIN aircraft a ON a.id = f.aircraft_id
WHERE wb.total_weight_kg > a.max_takeoff_weight_kg;
-- Expected: 0 rows

-- 5. Check-in count matches manifest passenger count for historical flights
SELECT f.flight_number,
  (SELECT COUNT(*) FROM booking_leg_passengers blp
   JOIN booking_legs bl ON bl.id = blp.booking_leg_id
   WHERE bl.flight_id = f.id AND blp.checked_in = true) AS checked_in,
  fm.total_passengers
FROM flights f
JOIN flight_manifests fm ON fm.flight_id = f.id
WHERE f.status = 'completed';
-- Expected: checked_in = total_passengers for all rows

-- 6. Payment totals match invoice totals
SELECT i.id, i.total_amount, SUM(il.amount) AS line_total
FROM invoices i
JOIN invoice_items il ON il.invoice_id = i.id
GROUP BY i.id
HAVING i.total_amount != SUM(il.amount);
-- Expected: 0 rows

-- 7. Journal entries balance (debits = credits)
SELECT je.id, SUM(jl.debit_amount) AS total_debits, SUM(jl.credit_amount) AS total_credits
FROM accounting_journal_entries je
JOIN accounting_journal_lines jl ON jl.journal_entry_id = je.id
GROUP BY je.id
HAVING SUM(jl.debit_amount) != SUM(jl.credit_amount);
-- Expected: 0 rows

-- 8. Pilot duty hours within limits
-- (requires aggregation by pilot per day — complex query, validate in application layer)

-- 9. At least 3 bookings per fly day
SELECT d::date, COUNT(b.id) AS booking_count
FROM generate_series('2026-04-01'::date, '2026-12-31'::date, '1 day') d
LEFT JOIN booking_legs bl ON bl.leg_date = d::date
LEFT JOIN bookings b ON b.id = bl.booking_id
WHERE d::date NOT IN (SELECT specific_date FROM no_fly_rules WHERE rule_type = 'one_off')
  AND EXTRACT(DOW FROM d::date) != 0  -- Sunday = day 0
GROUP BY d::date
HAVING COUNT(b.id) < 3;
-- Expected: 0 rows (all fly days have ≥3 bookings)

-- 10. No duplicate flight numbers
SELECT flight_number, COUNT(*) FROM flights GROUP BY flight_number HAVING COUNT(*) > 1;
-- Expected: 0 rows
```

---

## 5. DOWNSTREAM IMPACT TESTING

The seeded data enables these specific test scenarios:

### Accounting Module
- Revenue recognition: Verify £50 × N passengers booked matches 4010 account credits
- Invoice aging: Verify overdue invoices flagged correctly
- Reconciliation: Match bank_transactions to payments by transaction_reference
- Refund completeness: Verify refunded bookings have matching credit journal entries
- Split payment accuracy: Verify partial payments sum correctly

### Reporting Engine
- Daily flight manifest: Verify passenger count, weight totals, balance
- Monthly revenue report: Sum all payments by method for each month
- Check-in compliance: % passengers checked in vs total confirmed
- No-show rate: % passengers failed to check in
- Fleet utilization: Flight hours per aircraft per month
- Pilot duty hours: Hours flown per pilot per month (validate ≤8h/day limit)

### Schedule Builder
- Peak day clustering: 22+ bookings on 2026-06-15 requires 3+ flights
- No-fly day gating: Attempt to build schedule on Sunday returns error
- Weight & balance limits: Heavy passenger + freight scenario should trigger MTOW warning
- Pilot availability: When all 3 pilots are assigned, 4th flight should get error

### Check-In Counter
- Passenger search: Find Edward Frequent across 8 bookings
- Weight override: Test scale malfunction audit trail on 15 overrides
- Payment methods: Test all 5 methods (cash, card, invoice, deferred, bank_transfer)
- Concurrent check-in: Two agents checking in same passenger → one gets 409
- Excess baggage: Test >20kg charge calculation at £5/kg

---

## 6. EXECUTION COMMANDS

```bash
# WARNING: Destroys all existing data
npx tsx scripts/seed-comprehensive.ts --execute

# Dry-run mode (validate only, no writes)
npx tsx scripts/seed-comprehensive.ts --dry-run

# Seed specific phase only
npx tsx scripts/seed-comprehensive.ts --phase 4 --execute  # Bookings only
npx tsx scripts/seed-comprehensive.ts --phase 5 --execute  # Schedules only

# Validate post-seed
npx tsx scripts/seed-comprehensive.ts --validate
```

---

*End of Test Data Seeding Plan*
