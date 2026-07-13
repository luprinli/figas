# Integration Points with Project 1 (Booking)

> Part of the Dynamic Scheduling & Flight Assignment plan.
> See main plan at [`scheduling-flight-assignment-plan.md`](scheduling-flight-assignment-plan.md)

## 5.1 Data Contracts

Project 1 (Booking) and Project 2 (Scheduling) share these interfaces:

### Booking → Scheduling

```typescript
// From booking-repository.ts — used by scheduling to find unassigned bookings
interface BookingForScheduling {
  booking: {
    id: number;
    reference: string;
    status: BookingStatus;
    total_passengers: number;
  };
  legs: Array<{
    id: number;           // booking_leg.id
    origin_code: string;  // aerodrome code
    destination_code: string;
    leg_date: string;     // YYYY-MM-DD
    departure_time: string | null;
    arrival_time: string | null;
    flight_id: number | null;  // null = unassigned
    passengers: number;
    freight_kg: number;
    baggage_kg: number;
  }>;
}
```

**Changes from original plan:** Removed `sortie_id` field — booking legs link directly to `flights` via `flight_id`, not to a separate sortie entity.

### Scheduling → Booking (Flight Assignment)

```typescript
// When a schedule is published, booking legs get linked to flights
interface FlightAssignment {
  bookingLegId: number;
  flightId: number;
  legSequence: number;  // Which leg in the flight (1, 2, 3...)
}
```

**Changes from original plan:** Removed `sortieId` — flights ARE the sortie entity. The `legSequence` maps the booking leg to the corresponding `flight_legs.sequence_number`.

### Scheduling → Manifest

```typescript
// When loadsheets are generated, manifest data is prepared
interface ManifestPassenger {
  bookingReference: string;
  passengerName: string;
  origin: string;
  destination: string;
  weight_kg: number;
  baggage_kg: number;
  special_requirements?: string;
}

interface FlightManifestData {
  flightId: number;
  passengers: ManifestPassenger[];
  freight: Array<{ description: string; weight_kg: number }>;
  weightSnapshot: WeightBalanceSnapshot;
}
```

**Changes from original plan:** Removed `sortieId` — the flight IS the sortie. Manifest data is fetched via `booking_legs.flight_id` → `bookings` → `passengers` joins.

### WeightBalanceSnapshot Interface

```typescript
// Per-leg weight and balance snapshot with per-aerodrome constraint tracking
// Fuel is computed per leg using fuel.csv direct lookup (Required Fuel, Minimum Fuel, Fuel State).
// Aircraft structural limits, aerodrome limits, and CG data are looked up dynamically.
// Pilot weight is included in zero_fuel_weight calculation.
interface WeightBalanceSnapshot {
  id?: number;
  flightLegId: number;
  flightId: number;
  legSequence: number;

  // Fuel planning fields (computed per leg from fuel.csv direct lookup)
  fuelRequiredKg: number;
    // Fuel needed for this leg per fuel.csv Required Fuel column
  fuelMinimumKg: number;
    // Minimum fuel that must be on board before departure (fuel.csv Minimum Fuel column)
  fuelState: string | null;
    // Fuel state string from fuel.csv (e.g., "35/35", "40/40") — what the refueler loads at Stanley
  fuelEnduranceMinutes: number;
    // How long the fuel on board will last at planned burn rate
  legFlightTimeMinutes: number;
    // Scheduled flight time for this leg (distance / cruise_speed + taxi)
  sectorsSoFar: number;
    // Number of sectors completed including this leg (used for fuel.csv lookup)

  // Fuel state tracking
  fuelOnBoardKg: number;
    // Fuel on board at departure for this leg (the Fuel State value loaded at Stanley)
  fuelBurnKg: number;
    // Estimated fuel burn for this leg (= fuel.csv Required Fuel)
  fuelRemainingKg: number;
    // Fuel remaining after completing this leg (fuel_on_board - fuel_burn)

  // Weight components
  zeroFuelWeightKg: number;
    // Aircraft empty weight + passengers + baggage + freight + pilot weight
  rampWeightKg: number;
  taxiFuelKg: number;
  takeoffWeightKg: number;
  landingWeightKg: number;

  // CG (Center of Gravity) — simplified calculation
  totalMomentKgm: number;
    // Sum of (weight x arm) for all components
  cgPositionPct: number | null;
    // CG position as percentage of MAC: total_moment / total_weight
  cgOk: boolean;
    // TRUE if cg_forward_limit <= cg_position <= cg_aft_limit

  // Effective (binding) constraints — MIN of aircraft and aerodrome limits
  // Aircraft limits are looked up from aircraft table at query time
  // Aerodrome limits are looked up from aerodromes table at query time
  effectiveMtowLimitKg: number;
  effectiveMlwLimitKg: number;

  // Check results against effective limits
  mtowOk: boolean;
  mlwOk: boolean;
  mtowUtilizationPct: number | null;
  mlwUtilizationPct: number | null;

  fuelOk: boolean;
    // TRUE if fuelOnBoardKg >= fuelRequiredKg AND fuelRemainingKg >= fuelMinimumKg
  fuelWarning: string | null;

  createdAt?: string;
}

// Helper type to identify which limit is binding
type BindingConstraint = 'aircraft' | 'aerodrome';

interface BindingConstraintInfo {
  mtow: BindingConstraint;
  mlw: BindingConstraint;
  reason: string;  // e.g., "Beaver Island BVI limits MTOW to 2,580 kg"
}
```

**Changes from original plan:**
- Removed `aircraftMtowLimitKg`, `aircraftMlwLimitKg`, `aerodromeMtowLimitKg`, `aerodromeMlwLimitKg`, `runwayLengthM` — these are looked up dynamically from the `aircraft` and `aerodromes` tables. Only the computed effective limits are stored in the snapshot.
- Renamed `fuelContingencyKg` to `fuelMinimumKg` to match fuel.csv Minimum Fuel column semantics.
- Added `fuelState` field to track the Fuel State string (e.g., "35/35") from fuel.csv.
- Added CG fields: `totalMomentKgm`, `cgPositionPct`, `cgOk` for simplified CG calculation.
- `zeroFuelWeightKg` now includes pilot weight in addition to passengers, baggage, and freight.

### FuelPlan Data Contract

```typescript
// Per-leg fuel plan computed from fuel.csv direct lookup
interface FuelPlan {
  legSequence: number;
  flightTimeMinutes: number;
  sectorsSoFar: number;

  // Fuel.csv lookup results
  fuelRequiredKg: number;     // From fuel.csv Required Fuel column (the burn)
  fuelMinimumKg: number;      // From fuel.csv Minimum Fuel column (reserve that must remain)
  fuelState: string;          // From fuel.csv Fuel State column (e.g., "35/35")

  // Fuel state
  fuelOnBoardKg: number;      // Fuel at departure for this leg (the Fuel State value at Stanley)
  fuelBurnKg: number;         // Fuel consumed during this leg (= fuelRequiredKg)
  fuelRemainingKg: number;    // Fuel remaining after this leg

  // Endurance
  fuelEnduranceMinutes: number;  // How long fuel lasts at planned burn rate

  // Validation
  fuelOk: boolean;            // fuelOnBoardKg >= fuelRequiredKg
  reserveOk: boolean;         // fuelRemainingKg >= fuelMinimumKg
  needsStanleyRevisit: boolean;  // True if fuel constraints require a Stanley stop
}

// Fuel.csv lookup result
interface FuelRule {
  flightTimeMinutes: number;
  sectors: number;
  requiredFuelKg: number;
  minimumFuelKg: number;  // The fuel that must be on board before departure
  fuelState: string;      // e.g., "35/35" — what the refueler loads at Stanley
}

// Fuel.csv lookup function signature
type FuelCsvLookup = (
  flightTimeMinutes: number,
  sectors: number,
  fuelRules: FuelRule[]
) => FuelRule;
```

## 5.2 Shared Repository Methods

| Method | Defined In | Used By P2 For |
|--------|-----------|----------------|
| `bookingLegRepository.assignFlight(id, flightId)` | [`booking-leg.ts:62`](../app/utils/repositories/booking-leg.ts:62) | Linking booking legs to published flights |
| `bookingRepository.updateStatus(id, status)` | [`booking.ts:77`](../app/utils/repositories/booking.ts:77) | Updating booking status when flight assigned |
| `bookingRepository.findByFlightId(flightId)` | [`booking.ts:348`](../app/utils/repositories/booking.ts:348) | Getting bookings for a flight's manifest |
| `bookingRepository.getPassengers(bookingId)` | [`booking.ts:131`](../app/utils/repositories/booking.ts:131) | Getting passenger details for loadsheet |
| `flightManifestRepository.create(data)` | [`flight-manifest.ts:29`](../app/utils/repositories/flight-manifest.ts:29) | Creating loadsheet from weight snapshot |
| `flightRepository.updateWeights(flightId, weights)` | [`flight.ts:133`](../app/utils/repositories/flight.ts:133) | Updating flight weights after loadsheet generation |
| `flightRepository.assignPilot(flightId, pilotId)` | [`flight.ts:118`](../app/utils/repositories/flight.ts:118) | Assigning pilot to individual flight |
| `flightRepository.approveByPilot(flightId, pilotId)` | [`flight.ts:122`](../app/utils/repositories/flight.ts:122) | Pilot approval of manifest |

### New Repository Methods Required

| Method | Repository | Purpose |
|--------|-----------|---------|
| `scheduleRepository.create(data)` | New: `schedule.ts` | Create a new schedule for a date |
| `scheduleRepository.findByDate(date)` | New: `schedule.ts` | Get schedule by date |
| `scheduleRepository.updateStatus(id, status)` | New: `schedule.ts` | Update schedule pipeline status |
| `scheduleRepository.updatePublishedAt(id)` | New: `schedule.ts` | Set published_at timestamp |
| `flightLegRepository.create(data)` | New: `flight-leg.ts` | Create a flight leg |
| `flightLegRepository.findByFlightId(flightId)` | New: `flight-leg.ts` | Get all legs for a flight |
| `flightLegRepository.updateStatus(id, status)` | New: `flight-leg.ts` | Update per-leg status |
| `weightBalanceRepository.create(data)` | New: `weight-balance.ts` | Create weight snapshot for a leg |
| `weightBalanceRepository.findByFlightId(flightId)` | New: `weight-balance.ts` | Get all weight snapshots for a flight |
| `pilotAssignmentRepository.create(data)` | New: `pilot-assignment.ts` | Assign pilot to flight |
| `pilotAssignmentRepository.findByFlightId(flightId)` | New: `pilot-assignment.ts` | Get pilot assignments for a flight |
| `pilotAssignmentRepository.findByPilotId(pilotId, date)` | New: `pilot-assignment.ts` | Get pilot's assignments for a date (duty-time check) |

## 5.3 Booking Status Flow (Impacted by Scheduling)

```
PENDING ──► PASSENGERS_ADDED ──► WEIGHT_DECLARED ──► FREIGHT_DECLARED
                                                            │
                                                            ▼
                                                    FLIGHT_ASSIGNED �—�── Schedule published,
                                                            │         flight_id set on booking_leg
                                                            ▼
                                                    PILOT_REVIEW �—�── Pilot reviews manifest
                                                            │
                                                            ▼
                                                    APPROVED
```

**Status added by P2:** `FLIGHT_ASSIGNED` — set when a schedule is published and `booking_leg.flight_id` is populated. This status already exists in the [`BookingStatus`](../app/utils/constants.ts) enum.

## 5.4 Check-in Integration

When a schedule is published and flights are created, the check-in system (Project 1) can reference flights by their schedule context:

- Check-in counter shows flights grouped by schedule
- Passenger check-in updates passenger weight data, which flows back to the weight snapshot
- If weights change significantly after check-in, a re-calculation warning is shown on the schedule

## 5.5 Manifest Route Bug Fix

The existing manifest route at [`operations.flights.$flightId.manifest.tsx`](../app/routes/operations.flights.$flightId.manifest.tsx) queries a non-existent `booking_passengers` table (line 67). This must be fixed to query through the correct join path:

```
passengers → bookings → booking_legs → flights
```

**SQL fix:**
```sql
-- Instead of: SELECT * FROM booking_passengers WHERE flight_id = $1
-- Use:
SELECT p.*
FROM passengers p
JOIN bookings b ON b.id = p.booking_id
JOIN booking_legs bl ON bl.booking_id = b.id
WHERE bl.flight_id = $1;
```

This fix is in application code only — no migration needed (see [`scheduling-migration-plan.md`](scheduling-migration-plan.md) Section 8.2).
