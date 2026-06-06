# UI Component Recommendations

> Part of the Dynamic Scheduling & Flight Assignment plan.
> See main plan at [`scheduling-flight-assignment-plan.md`](scheduling-flight-assignment-plan.md)

## 6.1 New Components Required

| Component | Purpose | Props |
|-----------|---------|-------|
| `ScheduleBoard` | Drag-and-drop assignment board using @dnd-kit for grouping bookings into flights | `flights: FlightWithBookings[]`, `unassigned: BookingLegRow[]`, `scheduleStatus: ScheduleStatus` |
| `TimelineView` | Timeline list view of flights by aircraft (replaces Gantt chart) | `flights: FlightWithLegs[]`, `date: Date`, `onClickFlight` |
| `FlightCard` | Card representing a flight with its assigned booking legs | `flight: FlightWithBookings`, `onRemoveBooking`, `onEdit` |
| `WeightSummary` | Weight breakdown panel with MTOW/MLW bars showing effective limits | `weights: WeightBalanceSnapshot`, `aircraftReg: string`, `aerodromeName: string` |
| `ScheduleStatusBar` | Workflow stage indicator with progress dots | `status: ScheduleStatus`, `stages: string[]` |
| `PilotAssignmentPanel` | Assign pilots to flights with duty-time overview | `flight: FlightWithPilots`, `availablePilots: PilotRow[]` |

**Changes from original plan:**
- Replaced `SortieBoard` (Kanban DnD) with `ScheduleBoard` using @dnd-kit/core + @dnd-kit/sortable
- Replaced `GanttChart` with `TimelineView` (list-based, no canvas rendering)
- `FlightCard` is a draggable sortable card using `useSortable` from @dnd-kit/sortable
- `WeightSummary` extends existing [`WeightBar`](../app/components/WeightBar.tsx) rather than being standalone
- Form submission happens **on drop** via `useSubmit()` from Remix — no client-side drag state management

## 6.2 Component Architecture

```
ScheduleBuilder (page)
├── ScheduleStatusBar
├── DateSelector (existing)
├── TimelineView
│   └── FlightRow (inline)
├── ScheduleBoard (DndContext wrapper)
│   ├── FlightColumn (useDroppable)
│   │   ├── FlightCard (useSortable, draggable)
│   │   │   └── StatusBadge (existing)
│   │   └── SortableContext
│   └── UnassignedBookingsPanel (useDroppable)
│       └── BookingCard (useSortable, draggable)
└── FlightDetailPanel (conditional)
    ├── WeightSummary
    │   ├── CG position indicator (new)
    │   └── WeightBar (existing)
    ├── LegTimeline (inline)
    └── PilotAssignmentPanel
```

**Key architectural decision:** Drag-and-drop uses @dnd-kit/core and @dnd-kit/sortable. Form submission is triggered **on drop** via `useSubmit()` from Remix — not on every drag event. When a booking card is dropped onto a flight column, `onDragEnd` fires a single POST with `booking_id` and `target_flight_id`. No client-side state is maintained for drag positions; the server is the source of truth. The `ScheduleBoard` renders booking cards as sortable items within droppable flight columns.

## 6.3 State Management

No client-side state management library is needed. All state is derived from the Remix loader data:

```typescript
// Schedule builder state — derived from loader, not managed client-side
interface ScheduleBuilderLoaderData {
  date: string;
  schedule: Schedule | null;
  flights: FlightWithBookings[];       // Flights in this schedule
  unassignedBookings: BookingLegRow[]; // Bookings not yet assigned to any flight
  availableAircraft: AircraftRow[];
  availablePilots: PilotRow[];
  workflowStage: ScheduleStatus;
}

// Mutations use Remix action with intent-based routing
type ScheduleAction =
  | { intent: 'auto-build' }
  | { intent: 'assign-booking'; bookingLegId: number; flightId: number }
  | { intent: 'remove-booking'; bookingLegId: number; flightId: number }
  | { intent: 'move-booking'; bookingLegId: number; fromFlightId?: number; toFlightId: number }
  | { intent: 'create-flight' }
  | { intent: 'delete-flight'; flightId: number }
  | { intent: 'approve' }
  | { intent: 'revise' }
  | { intent: 'publish' }
  | { intent: 'assign-pilot'; flightId: number; pilotId: number; role: 'CAPTAIN' | 'FIRST_OFFICER' }
  | { intent: 'generate-loadsheets' }
  | { intent: 'cancel'; reason: string };
```

**Changes from original plan:** Removed `SET_DATE`, `AUTO_BUILD`, `ASSIGN_BOOKING`, `MOVE_BOOKING`, `REMOVE_BOOKING`, `SELECT_SORTIE` client-side actions. These are now server-side intents processed by the Remix action function. Added `move-booking` intent for dnd-kit drop events. No `isDragging` state needed.

## 6.4 ScheduleBoard Component — @dnd-kit Drag-and-Drop Assignment

The `ScheduleBoard` uses @dnd-kit/core and @dnd-kit/sortable for drag-and-drop assignment of booking cards to flight columns. Form submission is triggered **on drop** via Remix `useSubmit()`:

```typescript
// ScheduleBoard.tsx — @dnd-kit drag-and-drop assignment
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSubmit } from '@remix-run/react';

// Draggable booking card
function BookingCard({ booking }: { booking: BookingLegRow }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `booking-${booking.id}`,
    data: { type: 'booking', bookingLegId: booking.id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-white rounded p-3 mb-2 shadow-sm cursor-grab active:cursor-grabbing border border-slate-200 hover:border-blue-300"
    >
      <p className="text-sm font-medium">
        {booking.origin_code} → {booking.destination_code}
      </p>
      <p className="text-xs text-slate-500">
        {booking.passengers} pax · {booking.freight_kg} kg freight
      </p>
    </div>
  );
}

// Droppable flight column
function FlightColumn({ flight, bookings }: { flight: FlightWithBookings; bookings: BookingLegRow[] }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `flight-${flight.id}`,
    data: { type: 'flight', flightId: flight.id },
  });

  return (
    <div
      ref={setNodeRef}
      className={`border rounded-lg p-4 ${isOver ? 'bg-blue-50 border-blue-300' : 'bg-white border-slate-200'}`}
    >
      <h3 className="font-semibold mb-3 text-sm">
        {flight.call_sign}
        <span className="text-xs text-slate-500 ml-2">
          {flight.legs.map(l => l.to_aerodrome_code).join(' → ')}
        </span>
      </h3>
      <SortableContext items={bookings.map(b => `booking-${b.id}`)} strategy={rectSortingStrategy}>
        {bookings.map((booking) => (
          <BookingCard key={booking.id} booking={booking} />
        ))}
      </SortableContext>
      {bookings.length === 0 && (
        <p className="text-xs text-slate-400 text-center py-4">Drop bookings here</p>
      )}
    </div>
  );
}

// Main ScheduleBoard with DndContext
function ScheduleBoard({ flights, unassigned, scheduleStatus }: ScheduleBoardProps) {
  const submit = useSubmit();

  function handleDragEnd(event: any) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // Only handle booking → flight drops
    if (activeData?.type !== 'booking' || overData?.type !== 'flight') return;

    const bookingLegId = activeData.bookingLegId;
    const targetFlightId = overData.flightId;

    // Find source flight (if moving from another flight)
    const sourceFlight = flights.find(f =>
      f.booking_legs?.some((bl: any) => bl.id === bookingLegId)
    );

    // Submit form on drop — single POST with booking_id and target_flight_id
    submit(
      {
        intent: 'move-booking',
        bookingLegId: String(bookingLegId),
        toFlightId: String(targetFlightId),
        fromFlightId: sourceFlight ? String(sourceFlight.id) : '',
      },
      { method: 'post' }
    );
  }

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Unassigned bookings panel — also a droppable area */}
        <div className="border rounded-lg p-4 bg-slate-50">
          <h3 className="font-semibold mb-3">Unassigned Bookings</h3>
          <SortableContext items={unassigned.map(b => `booking-${b.id}`)} strategy={rectSortingStrategy}>
            {unassigned.map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))}
          </SortableContext>
          {unassigned.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-4">All bookings assigned</p>
          )}
        </div>

        {/* Flight columns — each is a droppable area */}
        {flights.map((flight) => (
          <FlightColumn
            key={flight.id}
            flight={flight}
            bookings={flight.booking_legs || []}
          />
        ))}
      </div>
    </DndContext>
  );
}
```

**Key design decisions:**
- `DndContext` wraps the entire board; `onDragEnd` is the only event handler
- `useSortable` on each booking card provides drag handle + visual feedback
- `useDroppable` on each flight column highlights on hover
- Form submission via `useSubmit()` fires **only on drop**, not on every drag event
- The `move-booking` intent sends `bookingLegId`, `toFlightId`, and optional `fromFlightId`
- No client-side drag state is maintained — server re-renders on each drop
- `DragOverlay` can be added for a floating preview during drag (optional enhancement)

## 6.5 TimelineView Component — List-Based Timeline

Replaces the Gantt chart with a simpler list-based timeline:

```typescript
// TimelineView.tsx — list-based timeline
function TimelineView({ flights, date, onClickFlight }: TimelineViewProps) {
  // Group flights by aircraft
  const byAircraft = groupBy(flights, 'aircraft_registration');

  return (
    <div className="space-y-4">
      {Object.entries(byAircraft).map(([aircraftReg, aircraftFlights]) => (
        <div key={aircraftReg} className="border rounded-lg">
          <div className="bg-slate-100 px-4 py-2 font-semibold text-sm">
            {aircraftReg}
          </div>
          <div className="divide-y">
            {aircraftFlights.map((flight) => (
              <button
                key={flight.id}
                onClick={() => onClickFlight(flight.id)}
                className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center gap-4"
              >
                <span className="font-mono text-sm w-20">{flight.call_sign}</span>
                <span className="text-xs text-slate-500 w-16">
                  {flight.departure_time?.slice(11, 16)}
                </span>
                <span className="text-sm flex-1">
                  {flight.legs.map(l => l.to_aerodrome_code).join(' → ')}
                </span>
                <StatusBadge status={flight.status} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Changes from original plan:** Replaced Gantt chart (canvas/SVG rendering with horizontal bars) with a simple list grouped by aircraft. No time-scale rendering, no overlapping bar detection, no scroll-sync logic. The departure time and route text provide the temporal context.

## 6.6 WeightSummary Component — Extends Existing WeightBar

The `WeightSummary` component extends the existing [`WeightBar`](../app/components/WeightBar.tsx) component rather than creating a standalone implementation:

```typescript
// WeightSummary.tsx — extends WeightBar with per-aerodrome constraint display, CG, and pilot weight
function WeightSummary({ weights, aircraftReg, aerodromeName }: WeightSummaryProps) {
  return (
    <div className="space-y-3 p-4 border rounded-lg">
      <h4 className="font-semibold text-sm">Weight Summary — {aerodromeName}</h4>

      {/* Weight breakdown */}
      <div className="text-xs space-y-1 text-slate-600">
        <div className="flex justify-between">
          <span>Aircraft Empty:</span>
          <span className="font-mono">{weights.emptyWeightKg} kg</span>
        </div>
        <div className="flex justify-between">
          <span>Pilot:</span>
          <span className="font-mono">{weights.pilotWeightKg} kg</span>
        </div>
        <div className="flex justify-between">
          <span>Pax:</span>
          <span className="font-mono">{weights.passengerWeightKg} kg</span>
        </div>
        <div className="flex justify-between">
          <span>Bag:</span>
          <span className="font-mono">{weights.baggageWeightKg} kg</span>
        </div>
        <div className="flex justify-between">
          <span>Freight:</span>
          <span className="font-mono">{weights.freightWeightKg} kg</span>
        </div>
        <hr className="my-1" />
        <div className="flex justify-between font-semibold">
          <span>Zero Fuel Weight:</span>
          <span className="font-mono">{weights.zeroFuelWeightKg} kg</span>
        </div>
        <hr className="my-1" />
        <div className="flex justify-between">
          <span>Fuel Required:</span>
          <span className="font-mono">{weights.fuelRequiredKg} kg</span>
        </div>
        <div className="flex justify-between">
          <span>Fuel Minimum (reserve):</span>
          <span className="font-mono">{weights.fuelMinimumKg} kg</span>
        </div>
        <div className="flex justify-between">
          <span>Fuel State:</span>
          <span className="font-mono">{weights.fuelState}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Fuel On Board:</span>
          <span className="font-mono">{weights.fuelOnBoardKg} kg</span>
        </div>
        <hr className="my-1" />
        <div className="flex justify-between font-semibold">
          <span>Ramp Weight:</span>
          <span className="font-mono">{weights.rampWeightKg} kg</span>
        </div>
      </div>

      {/* Fuel gauge */}
      <div className="border rounded p-2 text-xs">
        <div className="flex justify-between mb-1">
          <span>Fuel on board: {weights.fuelOnBoardKg} kg</span>
          <span>Leg burn: {weights.fuelBurnKg} kg</span>
        </div>
        <div className="flex justify-between mb-1">
          <span>Remaining: {weights.fuelRemainingKg} kg</span>
          <span>Fuel State: {weights.fuelState}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                weights.fuelOk ? 'bg-green-500' : 'bg-red-500'
              }`}
              style={{
                width: `${Math.min(
                  ((weights.fuelOnBoardKg - weights.fuelRemainingKg) / weights.fuelOnBoardKg) * 100,
                  100
                )}%`
              }}
            />
          </div>
          <span className={weights.fuelOk ? 'text-green-600' : 'text-red-600'}>
            {weights.fuelOk ? '✅ Fuel OK' : '❌ Fuel Low'}
          </span>
        </div>
      </div>

      {/* CG position indicator */}
      <div className="border rounded p-2 text-xs">
        <div className="flex justify-between mb-1">
          <span>CG Position:</span>
          <span className="font-mono">{weights.cgPositionPct}%</span>
        </div>
        <div className="flex justify-between mb-1">
          <span>Forward Limit:</span>
          <span className="font-mono">{weights.cgForwardLimitPct}%</span>
          <span>Aft Limit:</span>
          <span className="font-mono">{weights.cgAftLimitPct}%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden relative">
            {/* Forward limit marker */}
            <div
              className="absolute top-0 h-full w-0.5 bg-red-500"
              style={{ left: `${(weights.cgForwardLimitPct / 100) * 100}%` }}
            />
            {/* Aft limit marker */}
            <div
              className="absolute top-0 h-full w-0.5 bg-red-500"
              style={{ left: `${(weights.cgAftLimitPct / 100) * 100}%` }}
            />
            {/* CG position bar */}
            <div
              className={`h-full rounded-full ${
                weights.cgOk ? 'bg-green-500' : 'bg-red-500'
              }`}
              style={{
                width: `${Math.min(weights.cgPositionPct, 100)}%`
              }}
            />
          </div>
          <span className={weights.cgOk ? 'text-green-600' : 'text-red-600'}>
            {weights.cgOk ? '✅ CG OK' : '❌ CG Out of Limits'}
          </span>
        </div>
      </div>

      {/* MTOW bar — uses existing WeightBar component */}
      <WeightBar
        label="MTOW"
        current={weights.takeoffWeightKg}
        limit={weights.effectiveMtowLimitKg}
        utilization={weights.mtowUtilizationPct}
        binding={weights.mtowBinding}
        bindingReason={weights.mtowBindingReason}
      />

      {/* MLW bar */}
      <WeightBar
        label="MLW"
        current={weights.landingWeightKg}
        limit={weights.effectiveMlwLimitKg}
        utilization={weights.mlwUtilizationPct}
        binding={weights.mlwBinding}
        bindingReason={weights.mlwBindingReason}
      />
    </div>
  );
}
```

### Extended WeightBar Props

The existing [`WeightBar`](../app/components/WeightBar.tsx) component should be extended to accept:

```typescript
interface WeightBarProps {
  label: string;           // "MTOW" or "MLW"
  current: number;         // Current weight value
  limit: number;           // Effective limit (MIN of aircraft + aerodrome)
  utilization: number | null;  // Percentage (0-100+)
  binding?: 'aircraft' | 'aerodrome';  // Which limit is binding
  bindingReason?: string;  // e.g., "Goose Green PGR limits MTOW to 2,790 kg"
}
```

### Color Coding Rules

| Utilization | Color | Meaning |
|-------------|-------|---------|
| 0-79% | Green `#2E7D32` | Safe — ample margin |
| 80-94% | Amber `#FF8F00` | Approaching limit — caution |
| 95-100% | Red `#D32F2F` | Critical — near or at limit |
| >100% | Red + alert icon | Exceeded — not allowed |

### Binding Constraint Indicator

- When `aerodrome_mtow_limit < aircraft_mtow_limit`, show "← BINDING" next to the aerodrome value
- When `aircraft_mtow_limit <= aerodrome_mtow_limit`, show "← BINDING" next to the aircraft value
- Tooltip on the binding label explains: "Goose Green PGR limits MTOW to 2,790 kg"

### Props Interface

```typescript
interface WeightSummaryProps {
  weights: {
    emptyWeightKg: number;
    pilotWeightKg: number;         // Pilot weight from pilots.weight_kg
    passengerWeightKg: number;
    baggageWeightKg: number;
    freightWeightKg: number;
    zeroFuelWeightKg: number;      // empty + pilot + pax + bag + freight

    // CG fields
    totalMomentKgm: number;        // sum(weight × arm) for all load items
    cgPositionPct: number;         // total_moment / total_weight (as percentage)
    cgForwardLimitPct: number;     // from aircraft.cg_forward_limit_pct
    cgAftLimitPct: number;         // from aircraft.cg_aft_limit_pct
    cgOk: boolean;                 // forward_limit <= cg_position <= aft_limit

    // Fuel planning fields (computed per leg via fuel.csv lookup)
    fuelRequiredKg: number;        // Fuel needed for this leg (from fuel.csv)
    fuelMinimumKg: number;         // Reserve/minimum fuel (from fuel.csv)
    fuelState: string;             // Fuel state label (e.g., "35/35" from fuel.csv)
    fuelOnBoardKg: number;         // Fuel at departure (= fuelMinimumKg at Stanley)
    fuelBurnKg: number;            // Fuel consumed this leg
    fuelRemainingKg: number;       // Fuel after leg
    fuelOk: boolean;               // fuel_on_board >= fuel_required

    rampWeightKg: number;
    takeoffWeightKg: number;
    landingWeightKg: number;
    effectiveMtowLimitKg: number;
    effectiveMlwLimitKg: number;
    mtowUtilizationPct: number;
    mlwUtilizationPct: number;
    mtowBinding?: 'aircraft' | 'aerodrome';
    mlwBinding?: 'aircraft' | 'aerodrome';
    mtowBindingReason?: string;
    mlwBindingReason?: string;
  };
  aircraftReg: string;
  aerodromeName: string;  // e.g., "Goose Green PGR"
  compact?: boolean;       // Compact mode for mobile
}
```

**Changes from original plan:** Removed `aircraftMtowLimitKg`, `aircraftMlwLimitKg`, `aerodromeMtowLimitKg`, `aerodromeMlwLimitKg`, `runwayLengthM` from props — these are looked up dynamically. Added `mtowBinding`, `mlwBinding`, `mtowBindingReason`, `mlwBindingReason` to identify which constraint is binding. Added `pilotWeightKg`, `zeroFuelWeightKg`, CG fields (`totalMomentKgm`, `cgPositionPct`, `cgForwardLimitPct`, `cgAftLimitPct`, `cgOk`). Replaced `fuelContingencyKg` with `fuelMinimumKg` + `fuelState`. Uses extended [`WeightBar`](../app/components/WeightBar.tsx) instead of standalone bar rendering.

## 6.7 Loading, Empty, and Error States

All components must handle these states:

### Loading State

Use the existing [`Skeleton`](../app/components/Skeleton.tsx) component:

```typescript
function ScheduleBoardSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="border rounded-lg p-4">
          <Skeleton className="h-4 w-24 mb-3" />
          <Skeleton className="h-16 w-full mb-2" />
          <Skeleton className="h-16 w-full mb-2" />
          <Skeleton className="h-16 w-full" />
        </div>
      ))}
    </div>
  );
}
```

### Empty State

Use the existing [`EmptyState`](../app/components/EmptyState.tsx) component:

```typescript
function ScheduleEmptyState() {
  return (
    <EmptyState
      title="No schedule for this date"
      description="Create a new schedule or select a different date."
      action={{
        label: "Auto-Build Schedule",
        onClick: () => fetcher.submit({ intent: 'auto-build' }, { method: 'post' })
      }}
    />
  );
}
```

### Error State

Use the existing [`GlobalErrorBoundary`](../app/components/GlobalErrorBoundary.tsx) or inline error display:

```typescript
function ScheduleErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="border border-red-200 bg-red-50 rounded-lg p-4">
      <p className="text-red-700 text-sm">{error}</p>
      <Button variant="secondary" onClick={onRetry} className="mt-2">
        Retry
      </Button>
    </div>
  );
}
```

## 6.8 Responsive Component Variants

| Component | Desktop | Tablet | Mobile |
|-----------|---------|--------|--------|
| TimelineView | Full list grouped by aircraft | Same as desktop | Same (scroll horizontally) |
| ScheduleBoard | 3 columns (unassigned + 2 flights) | 2 columns | Single column with tabs |
| FlightDetailPanel | Right sidebar (30% width) | Full-screen overlay | Separate page |
| WeightSummary | Side-by-side bars with full detail | Stacked bars with aerodrome name | Compact bars, binding only |

## 6.9 Existing Components Used

| Component | Path | Usage |
|-----------|------|-------|
| [`Badge`](../app/components/Badge.tsx) | Status indicators on flights and legs |
| [`Button`](../app/components/Button.tsx) | Action buttons (Approve, Publish, Cancel) |
| [`Card`](../app/components/Card.tsx) | Flight cards in ScheduleBoard |
| [`EmptyState`](../app/components/EmptyState.tsx) | No schedule / no bookings states |
| [`PageHeader`](../app/components/PageHeader.tsx) | Schedule page headers |
| [`PageLayout`](../app/components/PageLayout.tsx) | Page layout wrapper |
| [`Skeleton`](../app/components/Skeleton.tsx) | Loading states |
| [`StatusBadge`](../app/components/StatusBadge.tsx) | Flight and leg status indicators |
| [`WeightBar`](../app/components/WeightBar.tsx) | MTOW/MLW utilization bars (extended) |
| [`DataTable`](../app/components/DataTable.tsx) | Schedule list view |
| [`Pagination`](../app/components/Pagination.tsx) | Schedule list pagination |
| [`ConfirmDialog`](../app/components/ConfirmDialog.tsx) | Cancel confirmation with reason input |
