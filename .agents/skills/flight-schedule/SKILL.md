---
name: flight-schedule
description: >-
  Authoritative skill for the FIGAS flight scheduling system. Preserves core
  specifications, interfaces, validation invariants, database query contracts,
  and test coverage requirements. Prevents regressions during any development
  or refactoring of the scheduling pipeline, route builder, aircraft assignment,
  weight & balance, pilot assignment, or schedule status lifecycle.
author: FIGAS Engineering
---

# Flight Schedule Skill

## Overview

This skill defines the **contract** for the FIGAS flight scheduling system. Any
change to schedule-related files **must** preserve the interfaces, invariants,
query contracts, and test coverage documented here. The skill is organized into
14 sections that collectively serve as the authoritative reference for:

- **Architecture Guardrails** — status lifecycle, permission gates, pipeline phases
- **Drag-and-Drop (dnd-kit) Implementation Patterns** — exact hook configurations, ID naming conventions, sensor setup, optimistic state management, and E2E simulation
- **Interface & Type Contracts** — exact TypeScript interfaces with file locations
- **Validation Invariants** — 10 rules that must never be removed or relaxed
- **Database Query Contracts** — raw SQL queries with expected result shapes
- **Test Coverage Requirements** — minimum coverage thresholds and test patterns
- **Regression Trigger Map** — file-change → required test run mappings
- **CI/CD Integration** — automated checks on schedule-related changes
- **Development Workflow** — step-by-step process for making changes safely
- **Edge Case Registry** — known edge cases and how they are handled
- **Gap Analysis Reference** — known gaps from the formal gap analysis

---

## Architecture Guardrails

### Schedule Status Lifecycle

The schedule status lifecycle is defined in [`docs/WORKFLOWS.md`](../../docs/WORKFLOWS.md)
and enforced in [`app/utils/schedule-handlers.server.ts`](../../app/utils/schedule-handlers.server.ts).

```
                    ┌──────────┝
                    │  DRAFT   │
                    └────┬─────┘
                         │ auto-build
                    ┌────▼─────┝
              ┌─────│ BUILDING │�—�──── revise ──────┝
              │     └────┬─────┘                    │
              │          │ approve                  │
              │     ┌────▼─────┝                    │
              │     │ APPROVED │──── revise ────────┤
              │     └────┬─────┘                    │
              │          │ publish                  │
              │     ┌────▼──────┝                   │
              │     │ PUBLISHED │──── revise ───────┤
              │     └────┬──────┘                   │
              │          │ (time passes)            │
              │     ┌────▼──────┝                   │
              │     │ COMPLETED │                   │
              │     └───────────┘                   │
              │                                     │
              └──── cancel ─────────────────────────┘
                         │
                    ┌────▼──────┝
                    │ CANCELLED │
                    └───────────┘
```

**Transition Rules** (enforced in [`app/utils/schedule-handlers.server.ts`](../../app/utils/schedule-handlers.server.ts)):

| From | To | Action | Handler | Line |
|------|----|--------|---------|------|
| `draft` | `building` | `auto-build` | [`handleAutoBuild()`](../../app/utils/schedule-handlers.server.ts:29) | 29 |
| `building` | `approved` | `approve` | [`handleApprove()`](../../app/utils/schedule-handlers.server.ts:69) | 69 |
| `approved` | `published` | `publish` | [`handlePublish()`](../../app/utils/schedule-handlers.server.ts:173) | 173 |
| `approved` | `draft` | `revise` | [`handleRevise()`](../../app/utils/schedule-handlers.server.ts:128) | 128 |
| `published` | `draft` | `revise` | [`handleRevise()`](../../app/utils/schedule-handlers.server.ts:128) | 128 |
| `building` | `cancelled` | `cancel` | [`handleCancel()`](../../app/utils/schedule-handlers.server.ts:232) | 232 |
| `approved` | `cancelled` | `cancel` | [`handleCancel()`](../../app/utils/schedule-handlers.server.ts:232) | 232 |
| `cancelled` | *(any)* | — | **Blocked** | 232 |
| `completed` | *(any)* | — | **Blocked** | — |

### Permission Gates (PBAC)

All schedule actions require specific PBAC permissions, checked via
[`hasPermission()`](../../app/utils/permissions.server.ts) in the route action
[`operations.schedule._index.tsx`](../../app/routes/operations.schedule._index.tsx:220):

| Action | Required Permission | Check Location |
|--------|-------------------|----------------|
| Auto-build | `schedule:create` | Line 227 |
| Approve | `schedule:approve` | Line 235 |
| Revise | `schedule:edit` | Line 244 |
| Publish | `schedule:publish` | Line 253 |
| Cancel | `schedule:edit` | Line 262 |
| Reorder flights | `schedule:edit` | Line 272 |
| Create flight | `flight:create` | Line 284 |
| Assign booking | `booking:assign-flight` | Line 299 |
| Create flight from booking | `flight:create` | Line 309 |
| Unassign booking | `booking:assign-flight` | Line 321 |
| Assign pilot | `flight:assign-pilot` | Line 330 |
| Suggest route | `schedule:create` | Line 341 |

### Scheduling Pipeline (5 Phases)

The scheduling pipeline is orchestrated by [`buildSchedule()`](../../app/utils/scheduling/index.ts:34)
in [`app/utils/scheduling/index.ts`](../../app/utils/scheduling/index.ts):

```
Phase 1: Cluster Bookings
  └── clusterBookingsByDate() → groups by (origin, destination)
  └── File: app/utils/scheduling/index.ts:207

Phase 2: Route Construction
  └── createFlightForCluster() → generates FIG-YYYYMMDD-NNN flight numbers
  └── createFlightLegs() → creates leg records with distance/heading
  └── File: app/utils/scheduling/index.ts:216

Phase 3: Aircraft Assignment
  └── (embedded in buildSchedule pipeline)
  └── Assigns suitable aircraft based on seat count, range, runway requirements

Phase 4: Weight & Balance
  └── Creates weight_balance_snapshots per flight
  └── Validates MTOW, MLW, seat count, range

Phase 5: Pilot Assignment
  └── assignPilots() → checks medical, duty hours, flight hours, type rating, rest
  └── File: app/utils/scheduling/assign-pilots.ts:43
```

### Pilot Assignment Constraints

Defined in [`app/utils/scheduling/assign-pilots.ts`](../../app/utils/scheduling/assign-pilots.ts):

| Constraint | Value | Enforced At |
|-----------|-------|-------------|
| Minimum rest between duties | 12 hours | Line 43 |
| Maximum duty hours per day | 12 hours | Line 81 |
| Maximum flight hours per day | 8 hours | Line 81 |
| Valid medical certificate | Required | Line 91 |
| Type rating match | Required | Line 207 |
| Pilot selection | Lowest duty hours | Line 128 |

---

## Drag-and-Drop (dnd-kit) Implementation Patterns

This section documents the exact `@dnd-kit` patterns used in the scheduling UI.
Any change to the drag-and-drop behavior **must** preserve these patterns.

### Architecture Overview

The scheduling UI uses a **single DndContext** architecture:

1. **Single outer `DndContext`** (in [`operations.schedule._index.tsx`](../../app/routes/operations.schedule._index.tsx:1067)) — handles all drag operations: booking → flight assignment, booking → draft-flight creation, and flight reordering. Uses `pointerWithin` collision detection.
2. **`SortableContext`** (in [`ScheduleBoard.tsx`](../../app/components/schedule/ScheduleBoard.tsx:35)) — nested inside the single `DndContext`, provides sortable context for flight reordering within the schedule board. Uses `verticalListSortingStrategy`.

This single-context approach allows all drag operations to coexist without interference, with the `data.type` discriminator routing drops to the correct handler.

### ID Naming Conventions

All draggable/droppable IDs use a **prefix-numeric** format. These IDs are used as CSS selectors in E2E tests and **must not** change without updating test selectors.

| Prefix | Format | Used By | File |
|--------|--------|---------|------|
| `flight-{id}` | `flight-42` | [`useDroppable`](../../app/components/schedule/SortableDroppableFlightCard.tsx:22) — flight card as drop target | [`SortableDroppableFlightCard.tsx`](../../app/components/schedule/SortableDroppableFlightCard.tsx:23) |
| `booking-{id}` | `booking-17` | [`useDraggable`](../../app/components/schedule/DraggableBookingItem.tsx:13) — unassigned booking item | [`DraggableBookingItem.tsx`](../../app/components/schedule/DraggableBookingItem.tsx:14) |
| `draft-flight-placeholder` | (literal) | [`useDroppable`](../../app/components/schedule/DraftFlightPlaceholder.tsx:8) — drop zone to create new flight | [`DraftFlightPlaceholder.tsx`](../../app/components/schedule/DraftFlightPlaceholder.tsx:9) |
| `{flightId}` (numeric) | `42` | [`useSortable`](../../app/components/schedule/ScheduleBoard.tsx:118) — flight card for reordering | [`ScheduleBoard.tsx`](../../app/components/schedule/ScheduleBoard.tsx:118) |

### Data Payload Convention

Every draggable/droppable/sortable node carries a `data` payload with a `type` discriminator:

```typescript
// Draggable booking (useDraggable)
data: { type: "booking", booking: UnassignedBookingRow }

// Droppable flight card (useDroppable)
data: { type: "flight", flight: FlightCardFlight }

// Droppable draft placeholder (useDroppable)
data: { type: "draft-flight" }

// Sortable flight card (useSortable) — data discriminator added
data: { type: "flight", flight: FlightCardFlight }
// Sortable flight card wrapper (useSortable) — minimal payload
data: { type: "flight" }
```

The `type` discriminator is used in [`handleDragEnd`](../../app/routes/operations.schedule._index.tsx:785) to route the drop to the correct handler. The `data.type` check replaces the previous fragile `typeof active.id === "number"` pattern for detecting flight reordering.

### Hook Configurations

#### 1. [`useDraggable`](../../app/components/schedule/DraggableBookingItem.tsx:13) — Unassigned Booking Items

**File:** [`app/components/schedule/DraggableBookingItem.tsx`](../../app/components/schedule/DraggableBookingItem.tsx)

```typescript
const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
  id: `booking-${booking.id}`,
  data: { type: "booking", booking },
});
```

**Pattern:**
- `attributes`, `listeners`, and `setNodeRef` are spread onto the same root `<div>` element
- `transform` is applied as an inline `translate3d` style (not via `CSS.Transform.toString()`)
- When `isDragging` is true, a **placeholder skeleton** is rendered instead of the actual content — a dashed-border `div` with `setNodeRef` so dnd-kit can track the original position
- The actual dragged element is rendered via `DragOverlay` in a portal (see DragOverlay section)
- The element uses `cursor-grab active:cursor-grabbing` Tailwind classes

```typescript
const style = transform
  ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
  : undefined;

if (isDragging) {
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border-2 border-dashed border-blue-400 rounded-lg bg-blue-50/30 p-3"
    />
  );
}

return (
  <div ref={setNodeRef} style={style} {...listeners} {...attributes}
    className="group cursor-grab active:cursor-grabbing rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm transition hover:border-blue-300 hover:shadow-md">
    {/* content */}
  </div>
);
```

#### 2. [`useDroppable`](../../app/components/schedule/SortableDroppableFlightCard.tsx:22) — Flight Cards (Drop Target)

**File:** [`app/components/schedule/SortableDroppableFlightCard.tsx`](../../app/components/schedule/SortableDroppableFlightCard.tsx)

```typescript
const { setNodeRef, isOver } = useDroppable({
  id: `flight-${flight.id}`,
  data: { type: "flight", flight: flightCardFlight },
});
```

**Pattern:**
- Only `setNodeRef` and `isOver` are used (no `useSortable` — sorting is handled by the parent `ScheduleBoard`)
- `isOver` triggers `ring-2 ring-blue-400 rounded-lg` visual feedback
- The droppable wraps a [`FlightCard`](../../app/components/schedule/FlightCard.tsx) component
- The `data.flight` payload carries the full [`FlightCardFlight`](../../app/components/schedule/FlightCard.tsx) object so the drop handler has immediate access to flight metadata

```typescript
<div ref={setNodeRef}
  className={`relative transition-all duration-150 ${isOver ? "ring-2 ring-blue-400 rounded-lg" : ""}`}>
  <ValidationBanner issues={validationIssues} />
  <FlightCard flight={flightCardFlight} ... />
</div>
```

#### 3. [`useDroppable`](../../app/components/schedule/DraftFlightPlaceholder.tsx:8) — Draft Flight Placeholder

**File:** [`app/components/schedule/DraftFlightPlaceholder.tsx`](../../app/components/schedule/DraftFlightPlaceholder.tsx)

```typescript
const { setNodeRef, isOver } = useDroppable({
  id: "draft-flight-placeholder",
  data: { type: "draft-flight" },
});
```

**Pattern:**
- Fixed literal ID `"draft-flight-placeholder"` (no numeric suffix)
- Accepts optional `activeOverId` prop for enhanced real-time visual feedback via `onDragOver`
- Four visual states based on `isOver`, `activeOverId`, and the parent's `isDraggingBooking` prop:
  - **Default** (`!isOver && !isActiveOver && !isDraggingBooking`): `border-slate-300 bg-slate-50`
  - **Booking dragging nearby** (`!isOver && !isActiveOver && isDraggingBooking`): `border-blue-300 bg-blue-50/50`
  - **Pointer hovering over** (`isOver`): `border-blue-400 bg-blue-50 ring-2 ring-blue-400`
  - **Pointer over via onDragOver** (`isActiveOver && !isOver`): `border-blue-500 bg-blue-50 ring-2 ring-blue-500 ring-offset-2`
- The `isDraggingBooking` prop is set by the parent route's `onDragStart`/`onDragEnd` handlers
- The `activeOverId` prop is set by the parent route's `onDragOver` handler

#### 4. [`useSortable`](../../app/components/schedule/ScheduleBoard.tsx:111) — Flight Cards (Sortable)

**File:** [`app/components/schedule/ScheduleBoard.tsx`](../../app/components/schedule/ScheduleBoard.tsx)

```typescript
const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
  id: flight.id,  // numeric ID only
  data: { type: "flight", flight },  // data discriminator for handleDragEnd routing
});

const style = {
  transform: CSS.Transform.toString(transform),
  transition,
  // NOTE: opacity is NOT set here — placeholder skeleton is used instead
};

if (isDragging) {
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border-2 border-dashed border-blue-400 rounded-lg bg-blue-50/30 min-h-[100px]"
    />
  );
}

return (
  <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
    <FlightCard ... />
  </div>
);
```

**Pattern:**
- Uses numeric `flight.id` as the sortable ID (no prefix)
- Includes `data: { type: "flight", flight }` discriminator for `handleDragEnd` routing
- Uses `CSS.Transform.toString()` from `@dnd-kit/utilities` (unlike `useDraggable` which uses manual `translate3d`)
- Includes `transition` for smooth animated reordering
- When `isDragging` is true, a **placeholder skeleton** is rendered instead of the actual content — a dashed-border `div` with `setNodeRef` so dnd-kit can track the original position
- The actual dragged element is rendered via `DragOverlay` in a portal (see DragOverlay section)
- Two wrapper variants exist:
  - [`SortableFlightCard`](../../app/components/schedule/ScheduleBoard.tsx:67) — renders `FlightCard` directly
  - [`SortableFlightCardWrapper`](../../app/components/schedule/ScheduleBoard.tsx:97) — wraps arbitrary children (used when `renderFlightCard` prop is provided)

### DndContext Setup

#### Single DndContext (All Operations)

**File:** [`app/routes/operations.schedule._index.tsx`](../../app/routes/operations.schedule._index.tsx:1067)

```typescript
<DndContext
  sensors={sensors}
  collisionDetection={pointerWithin}
  onDragStart={handleDragStart}
  onDragOver={handleDragOver}
  onDragEnd={handleDragEnd}
>
  {/* ScheduleBoard with nested SortableContext */}
  <ScheduleBoard ...>
    <SortableContext
      items={flights.map((f) => f.id)}
      strategy={verticalListSortingStrategy}
    >
      {/* sortable flight cards */}
    </SortableContext>
  </ScheduleBoard>

  {/* DragOverlay rendered via createPortal to document.body */}
  {createPortal(
    <DragOverlay dropAnimation={null}>
      {activeDragItem?.type === "flight" && (
        <div className="opacity-90 shadow-xl rounded-lg border border-blue-300 bg-white p-4">
          <div className="text-sm font-bold">{activeDragItem.data.flight_number}</div>
          <div className="text-xs text-slate-500">
            {activeDragItem.data.origin_code} → {activeDragItem.data.destination_code}
          </div>
        </div>
      )}
      {activeDragItem?.type === "booking" && (
        <div className="opacity-90 shadow-xl rounded-md border border-blue-300 bg-white px-3 py-2">
          <div className="font-medium text-slate-800">{activeDragItem.data.booking_reference}</div>
          <div className="text-xs text-slate-500">
            {activeDragItem.data.origin_code} → {activeDragItem.data.destination_code}
          </div>
        </div>
      )}
    </DragOverlay>,
    document.body
  )}
</DndContext>
```

#### Sensor Configuration

**File:** [`app/routes/operations.schedule._index.tsx`](../../app/routes/operations.schedule._index.tsx:477)

```typescript
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  useSensor(KeyboardSensor)
);
```

**Pattern:**
- `PointerSensor` with `distance: 8` activation constraint (8px threshold prevents accidental drags)
- `KeyboardSensor` for accessibility (keyboard-based reordering)

### handleDragEnd Logic

**File:** [`app/routes/operations.schedule._index.tsx`](../../app/routes/operations.schedule._index.tsx:785)

The `handleDragEnd` function handles four cases, dispatched by the `active.data.current.type` discriminator. It also clears `activeDragItem` and `activeOverId` state:

```typescript
function handleDragEnd(event: DragEndEvent) {
  const { active, over } = event;
  setActiveDragItem(null);
  setActiveOverId(null);
  setIsDraggingBooking(false);

  if (!over || active.id === over.id) return;

  const activeData = active.data.current;
  const overData = over.data.current;

  // Determine the flight ID from the over target
  const overFlightId = overData?.type === "flight"
    ? (overData.flight as FlightCardFlight)?.id
    : activeData?.type === "flight" && typeof over.id === "number"
      ? (over.id as number)
      : null;

  // Case 1: Flight reordering (active.data.type === "flight")
  if (overFlightId != null && activeData?.type === "flight") {
    const flightId = active.id as number;
    const newIndex = flights.findIndex((f) => f.id === overFlightId);
    if (newIndex !== -1) {
      handleReorderFlight(flightId, newIndex);
    }
    return;
  }

  // Case 2: Booking → Flight assignment
  if (activeData?.type === "booking" && overFlightId != null) {
    const booking = activeData.booking as UnassignedBookingRow;
    handleDropOnFlight(booking.id, overFlightId);
    return;
  }

  // Case 3: Booking → Draft flight placeholder (create flight from booking)
  if (activeData?.type === "booking" && overData?.type === "draft-flight") {
    const booking = activeData.booking as UnassignedBookingRow;
    const formData = new FormData();
    formData.set("intent", "create-flight-from-booking");
    formData.set("bookingLegIds", JSON.stringify([booking.id]));
    formData.set("scheduleId", String(schedule?.id ?? 0));
    formData.set("originCode", booking.origin_code);
    formData.set("destinationCode", booking.destination_code);
    formData.set("date", selectedDate);
    fetcher.submit(formData, { method: "post" });
    return;
  }

  // Case 4: Passenger → Unassign pool (reverse drag)
  if (activeData?.type === "passenger" && overData?.type === "unassign-pool") {
    const passenger = activeData.passenger as { bookingLegId: number; passengerId: number };
    lastIntentRef.current = "unassign-booking";
    const formData = new FormData();
    formData.set("intent", "unassign-booking");
    formData.set("bookingLegId", String(passenger.bookingLegId));
    fetcher.submit(formData, { method: "post" });
    return;
  }
}
```

**Key changes from previous pattern:**
- Flight reordering is now detected via `activeData?.type === "flight"` instead of `typeof active.id === "number"`
- `activeDragItem` is cleared on drag end to remove the DragOverlay
- `activeOverId` is cleared on drag end to reset visual feedback
- `setIsDraggingBooking(false)` is called inside `handleDragEnd` instead of inline in the JSX

### Optimistic State Management

**File:** [`app/routes/operations.schedule._index.tsx`](../../app/routes/operations.schedule._index.tsx:482)

The route uses a **pending operations stack** pattern for optimistic updates with rollback:

```typescript
interface PendingOp {
  type: "assign" | "unassign" | "reorder";
  snapshot: { flights: FlightSummaryRow[]; assignedIds: Set<number> };
  timestamp: number;
}
const pendingOpsRef = useRef<PendingOp[]>([]);
```

**`handleDropOnFlight`** (booking assignment):

```typescript
function handleDropOnFlight(bookingLegId: number, flightId: number) {
  // Save pre-mutation snapshot
  pendingOpsRef.current.push({
    type: "assign",
    snapshot: { flights: [...flights], assignedIds: new Set(assignedMockIds) },
    timestamp: Date.now(),
  });
  // Optimistic update — immediately mark booking as assigned
  setAssignedMockIds((prev) => new Set(prev).add(bookingLegId));
  // Submit the actual mutation
  const formData = new FormData();
  formData.set("intent", "assign-booking");
  formData.set("bookingLegId", String(bookingLegId));
  formData.set("flightId", String(flightId));
  fetcher.submit(formData, { method: "post" });
}
```

**`handleReorderFlight`** (flight reordering):

```typescript
function handleReorderFlight(flightId: number, newIndex: number) {
  const oldIndex = flights.findIndex((f) => f.id === flightId);
  if (oldIndex === -1) return;
  const reordered = [...flights];
  const [moved] = reordered.splice(oldIndex, 1);
  reordered.splice(newIndex, 0, moved);
  // Save pre-mutation snapshot
  pendingOpsRef.current.push({
    type: "reorder",
    snapshot: { flights: [...flights], assignedIds: new Set(assignedMockIds) },
    timestamp: Date.now(),
  });
  // Optimistic update — immediately reorder
  setFlights(reordered);
  // Submit the actual mutation
  const formData = new FormData();
  formData.set("intent", "reorder-flights");
  formData.set("scheduleId", String(schedule?.id ?? 0));
  formData.set("flightIds", JSON.stringify(reordered.map((f) => f.id)));
  fetcher.submit(formData, { method: "post" });
}
```

**`handleRollback`** (on error):

```typescript
function handleRollback(error: string) {
  const op = pendingOpsRef.current.pop();
  if (!op) return;
  setFlights(op.snapshot.flights);
  setAssignedMockIds(new Set(op.snapshot.assignedIds));
  showToast(`Action reverted: ${error}`, "error");
}
```

The rollback is triggered in the `useEffect` that watches `fetcher.state` and `fetcher.data`:

```typescript
useEffect(() => {
  if (fetcher.state === "idle" && fetcher.data) {
    const data = fetcher.data as { error?: string; success?: boolean };
    if (data.error) {
      if (pendingOpsRef.current.length > 0) {
        handleRollback(data.error);
      } else {
        showToast(data.error, "error");
      }
    } else if (data.success) {
      if (pendingOpsRef.current.length > 0) {
        pendingOpsRef.current.pop(); // commit — remove snapshot
      }
      showToast(intentLabels[intent], "success");
    }
  }
}, [fetcher.state, fetcher.data]);
```

### DragOverlay

The scheduling UI uses `DragOverlay` with `createPortal` to render a full-opacity copy of the dragged item on `document.body` while the original position shows a placeholder skeleton.

#### Imports

```typescript
import { DragOverlay } from "@dnd-kit/core";
import { createPortal } from "react-dom";
```

#### State Management

```typescript
const [activeDragItem, setActiveDragItem] = useState<{
  type: "flight" | "booking";
  data: any; // eslint-disable-line @typescript-eslint/no-explicit-any
} | null>(null);
```

#### DragStart Handler

```typescript
function handleDragStart(event: DragStartEvent) {
  const activeData = event.active.data.current;
  if (activeData?.type === "booking") {
    setActiveDragItem({ type: "booking", data: activeData });
  } else if (activeData?.type === "flight") {
    setActiveDragItem({ type: "flight", data: activeData });
  }
}
```

#### DragOverlay JSX (inside DndContext, wrapped in createPortal)

```typescript
{createPortal(
  <DragOverlay dropAnimation={null}>
    {activeDragItem?.type === "flight" && activeDragItem.data ? (
      <div className="bg-white rounded-lg shadow-xl border border-blue-200 p-3 w-[350px]">
        <FlightCard
          flight={activeDragItem.data.flight}
          scheduleStatus={schedule.status}
          onAssignPilot={handleAssignPilot}
          onAssignAircraft={handleAssignAircraft}
          onRemoveFlight={handleRemoveFlight}
          aerodromes={aerodromes}
          maxTakeoffWeightKg={maxTakeoffWeightKg}
        />
      </div>
    ) : activeDragItem?.type === "booking" && activeDragItem.data ? (
      <div className="bg-white rounded-lg shadow-xl border border-blue-200 p-3 w-[280px] opacity-90 rotate-2">
        <BookingCard booking={activeDragItem.data.booking} />
      </div>
    ) : null}
  </DragOverlay>,
  document.body
)}
```

#### Placeholder Skeleton Pattern

When an item is being dragged, the original position renders a placeholder skeleton instead of the `opacity: 0.5` approach:

**`useSortable` (flight cards):**
```typescript
if (isDragging) {
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border-2 border-dashed border-blue-400 rounded-lg bg-blue-50/30 min-h-[100px]"
    />
  );
}
```

**`useDraggable` (booking items):**
```typescript
if (isDragging) {
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border-2 border-dashed border-blue-400 rounded-lg bg-blue-50/30 p-3"
    />
  );
}
```

**Benefits over opacity-based approach:**
- The dragged item appears at full opacity in the DragOverlay portal (no visual degradation)
- The original position shows a clear dashed-border placeholder, indicating where the item will return
- No z-index conflicts — the portal renders on `document.body` above all other content
- Smoother visual experience with `dropAnimation: null` for instant overlay positioning

### E2E Drag Simulation

#### Helper Functions

**File:** [`tests/e2e/helpers/drag-simulator.ts`](../../tests/e2e/helpers/drag-simulator.ts)

Three exported functions:

```typescript
// Generic drag-and-drop using pointer events (10-step interpolation)
export async function simulateDragDrop(page: Page, dragSelector: string, dropSelector: string): Promise<void>

// Booking → Flight: uses `[id="booking-{id}"]` and `[id="flight-{id}"]` selectors
export async function dragBookingToFlight(page: Page, bookingLegId: number, flightId: number): Promise<void>

// Booking → Draft placeholder: uses `[id="booking-{id}"]` and `[id="draft-flight-placeholder"]` selectors
export async function dragBookingToDraftFlight(page: Page, bookingLegId: number): Promise<void>
```

**Simulation pattern** (in [`simulateDragDrop`](../../tests/e2e/helpers/drag-simulator.ts:11)):

```typescript
// 1. Get bounding boxes for source and target
const dragBox = await dragEl.boundingBox();
const dropBox = await dropEl.boundingBox();

// 2. Calculate center coordinates
const startX = dragBox.x + dragBox.width / 2;
const startY = dragBox.y + dragBox.height / 2;
const endX = dropBox.x + dropBox.width / 2;
const endY = dropBox.y + dropBox.height / 2;

// 3. Perform pointer event sequence
await page.mouse.move(startX, startY);
await page.mouse.down();
await page.waitForTimeout(200);           // let dnd-kit register drag start
// 10-step interpolation for smooth movement
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(
    startX + (endX - startX) * (i / 10),
    startY + (endY - startY) * (i / 10)
  );
  await page.waitForTimeout(50);
}
await page.waitForTimeout(100);
await page.mouse.up();
await page.waitForTimeout(500);           // let UI settle
await page.waitForLoadState("networkidle");
```

**Key timing parameters:**
- 200ms pause after `mouse.down()` — allows `PointerSensor` activation constraint (8px distance) to trigger
- 10 interpolation steps at 50ms each — smooth movement for collision detection
- 100ms pause before `mouse.up()` — ensures drop target is registered
- 500ms settle time after drop — allows optimistic UI to render

#### Page Object Model

**File:** [`tests/e2e/pages/schedule-page.ts`](../../tests/e2e/pages/schedule-page.ts)

Drag-related selectors:

```typescript
this.draggableItems = page.locator('[draggable="true"]');  // all draggable booking items
this.draftFlightPlaceholder = page.locator("text=Draft Flight").first();
```

#### E2E Test Cases

**File:** [`tests/e2e/scheduling.spec.ts`](../../tests/e2e/scheduling.spec.ts)

Two drag-and-drop test cases (lines 203-281):

**Test: "should assign a booking to a flight via drag-and-drop"**
1. Checks `bookingCount > 0 && flightCount > 0`
2. Extracts numeric IDs from `booking-{id}` and `flight-{id}` attributes
3. Calls `dragBookingToFlight(page, bookingNum, flightNum)`
4. Verifies no errors after drop

**Test: "should create a new flight by dragging to draft placeholder"**
1. Checks `bookingCount > 0`
2. Verifies draft placeholder is visible
3. Extracts numeric booking ID from `booking-{id}` attribute
4. Calls `dragBookingToDraftFlight(page, bookingNum)`
5. Verifies no errors after drop

#### DragOverlay Impact on E2E Tests

The introduction of `DragOverlay` with `createPortal` has the following implications for E2E drag simulation:

**No change to the simulation mechanism.** The E2E drag simulation still works correctly because:
- The simulation uses raw Playwright pointer events (`page.mouse.move`, `page.mouse.down`, `page.mouse.up`) which trigger the browser's native pointer event pipeline
- dnd-kit's `PointerSensor` responds to these synthetic pointer events identically to real user interactions
- The `DragOverlay` portal rendering is a visual-only concern — it does not affect the collision detection or drop logic
- The placeholder skeleton rendered at the original position still has the `setNodeRef` attached, so dnd-kit maintains correct reference tracking

**What the simulation does NOT need to do:**
- It does NOT need to interact with the DragOverlay portal element directly
- It does NOT need to wait for portal rendering
- It does NOT need to target the overlay element for drop coordinates

**Key verification after DragOverlay changes:**
- The placeholder skeleton (`border-2 border-dashed border-blue-400`) should be visible at the source position during drag
- The DragOverlay content should appear on `document.body` (verify via Playwright's `page.locator('[data-dnd-overlay]')` if needed)
- The `dropAnimation: null` prop means the overlay snaps instantly — no animation wait needed

### Do's and Don'ts for dnd-kit Changes

#### Do

- ✅ Do preserve the prefix-numeric ID format (`flight-{id}`, `booking-{id}`)
- ✅ Do preserve the `data.type` discriminator pattern (`data: { type: "flight" }`, `data: { type: "booking" }`)
- ✅ Do use `pointerWithin` for cross-container drops and `closestCenter` for sortable reordering
- ✅ Do use `PointerSensor` with `distance: 8` activation constraint
- ✅ Do use the pending-ops stack pattern for optimistic updates with rollback
- ✅ Do update E2E test selectors when changing any dnd-kit ID
- ✅ Do use `CSS.Transform.toString()` for `useSortable` positioning
- ✅ Do render a placeholder skeleton (`border-2 border-dashed border-blue-400`) when `isDragging` is true, instead of using `opacity`
- ✅ Do use `DragOverlay` with `createPortal` for the visual drag representation
- ✅ Do pass `activeOverId` prop to `SortableDroppableFlightCard` and `DraftFlightPlaceholder` for real-time drop target highlighting
- ✅ Do use `onDragOver` to track `activeOverId` for cross-container visual feedback
- ✅ Do clear `activeDragItem` and `activeOverId` state in `handleDragEnd`
- ✅ Do use `dropAnimation={null}` on `DragOverlay` for instant overlay positioning
- ✅ Do use `onMouseEnter`/`onMouseLeave` for hover-reveal secondary action buttons on `FlightCard`

#### Don't

- ❌ Don't use `opacity`-based drag feedback (`opacity: 0.5` or `opacity-50`) — use placeholder skeletons instead
- ❌ Don't rely on `typeof active.id === "number"` to detect flight reordering — use `activeData?.type === "flight"` instead
- ❌ Don't change the `draft-flight-placeholder` literal ID without updating E2E tests and `DraftFlightPlaceholder` component
- ❌ Don't remove the `activeOverId` state tracking — it provides real-time visual feedback for drop targets
- ❌ Don't change the 8px activation distance without updating the E2E simulation timing
- ❌ Don't remove the `KeyboardSensor` — it provides accessibility for keyboard-based reordering
- ❌ Don't forget to wrap `DragOverlay` in `createPortal(<DragOverlay>...</DragOverlay>, document.body)`
- ❌ Don't add `DragOverlay` without verifying the E2E drag simulation still works (pointer events are unaffected by portal rendering)
- ❌ Don't forget to add `// eslint-disable-next-line @typescript-eslint/no-explicit-any` on the `activeDragItem.data` field

---

## Interface & Type Contracts

The following interfaces **must not** have their shapes changed without updating
all consumers and test fixtures. Adding optional fields is permitted; removing
or renaming fields is **not** permitted without a migration plan.

### ScheduleRow

**File:** [`app/utils/repositories/schedule.ts`](../../app/utils/repositories/schedule.ts:4)

```typescript
export interface ScheduleRow {
  id: number;
  schedule_date: string;        // YYYY-MM-DD
  status: ScheduleStatus;       // "draft" | "building" | "approved" | "published" | "completed" | "cancelled"
  notes: string | null;
  created_by: number;
  approved_by: number | null;
  approved_at: Date | null;
  published_by: number | null;
  published_at: Date | null;
  cancelled_by: number | null;
  cancelled_at: Date | null;
  cancellation_reason: string | null;
  created_at: Date;
  updated_at: Date;
}
```

### BookingLegRow

**File:** [`app/utils/repositories/booking-leg.ts`](../../app/utils/repositories/booking-leg.ts:3)

```typescript
export interface BookingLegRow {
  id: number;
  booking_id: number;
  flight_id: number | null;     // null = unassigned
  origin_code: string;
  destination_code: string;
  leg_date: string;             // YYYY-MM-DD
  departure_date: string;       // YYYY-MM-DD
  preferred_time: string | null;
  preferred_time_start: string | null;
  preferred_time_end: string | null;
  leg_sequence: number;
  status: string;
  created_at: Date;
  updated_at: Date;
}
```

### BookingLegWithDetails

**File:** [`app/utils/repositories/booking-leg.server.ts`](../../app/utils/repositories/booking-leg.server.ts:9)

```typescript
export interface BookingLegWithDetails extends BookingLegRow {
  booking_reference: string;
  passenger_name: string;
  passenger_count: number;
  origin_code: string;
  destination_code: string;
}
```

### FlightRow (implied from FlightCreateInput / FlightUpdateInput)

**File:** [`app/utils/repositories/flight.server.ts`](../../app/utils/repositories/flight.server.ts:9)

```typescript
export interface FlightCreateInput {
  schedule_id: number;
  flight_number: string;
  origin_aerodrome_id: number;
  destination_aerodrome_id: number;
  aircraft_id?: number;
  pilot_id?: number;
  status?: string;
  created_by: number;
}

export interface FlightUpdateInput {
  departure_time?: string;
  arrival_time?: string;
  aircraft_id?: number;
  pilot_id?: number;
  status?: string;
  sort_order?: number;
  max_takeoff_weight_kg?: number;
  max_landing_weight_kg?: number;
  basic_empty_weight_kg?: number;
  payload_kg?: number;
  fuel_kg?: number;
  crew_weight_kg?: number;
}
```

### FlightLegRow

**File:** [`app/utils/repositories/flight-leg.ts`](../../app/utils/repositories/flight-leg.ts:4)

```typescript
export interface FlightLegRow {
  id: number;
  flight_id: number;
  leg_sequence: number;
  origin_code: string;
  destination_code: string;
  departure_time: string;       // HH:mm
  arrival_time: string;         // HH:mm
  distance_nm: number | null;
  heading: number | null;
  status: FlightLegStatus;      // "scheduled" | "active" | "completed" | "cancelled"
  created_at: Date;
  updated_at: Date;
}
```

### FlightSummaryRow

**File:** [`app/utils/scheduling/build-flight-card-flight.ts`](../../app/utils/scheduling/build-flight-card-flight.ts:8)

```typescript
export interface FlightSummaryRow {
  flight_number: string;
  origin_code: string;
  destination_code: string;
  departure_time: string;
  arrival_time: string;
  status: string;
  aircraft_registration: string | null;
  aircraft_type: string | null;
  seat_count: number | null;
  pilot_name: string | null;
  pilot_status: string | null;
  sort_order: number;
  duration_minutes: number;
  check_in_time: string | null;
  operational_notes: string | null;
  flight_ordinal: number;
  max_takeoff_weight_kg: number | null;
  max_landing_weight_kg: number | null;
  basic_empty_weight_kg: number | null;
  payload_kg: number | null;
  fuel_kg: number | null;
  crew_weight_kg: number | null;
  // ... additional fields from the raw SQL query
}
```

### PassengerManifestRow

**File:** [`app/utils/scheduling/build-stop-activities.ts`](../../app/utils/scheduling/build-stop-activities.ts:16)

```typescript
export interface PassengerManifestRow {
  id: number;
  booking_leg_id: number;
  passenger_name: string;
  body_weight_kg: number;
  baggage_weight_kg: number;
  freight_weight_kg: number;
  origin_code: string;
  destination_code: string;
}
```

### StopActivity

**File:** [`app/utils/scheduling/build-stop-activities.ts`](../../app/utils/scheduling/build-stop-activities.ts:27)

```typescript
export interface StopActivity {
  aerodrome_code: string;
  leg_sequence: number;
  arriving_passengers: PassengerManifestRow[];
  departing_passengers: PassengerManifestRow[];
  arrival_time: string;
  departure_time: string;
  distance_nm: number | null;
  heading: number | null;
}
```

### BookingLegPassengerRow

**File:** [`app/utils/repositories/booking-leg-passenger.ts`](../../app/utils/repositories/booking-leg-passenger.ts:3)

```typescript
export interface BookingLegPassengerRow {
  id: number;
  booking_leg_id: number;
  booking_passenger_id: number;
  clothed_weight_kg: number | null;
  baggage_weight_kg: number | null;
  baggage_description: string | null;
  freight_description: string | null;
  freight_weight_kg: number | null;
  seat_number: string | null;
  checked_in: boolean;
  checked_in_at: Date | null;
  checked_in_by: number | null;
  boarded: boolean;
  boarded_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
```

### BookingLegPassengerWithDetails

**File:** [`app/utils/repositories/booking-leg-passenger.ts`](../../app/utils/repositories/booking-leg-passenger.ts:22)

```typescript
export interface BookingLegPassengerWithDetails extends BookingLegPassengerRow {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  residency: string;
  special_requirements: string;
  origin_code: string;
  destination_code: string;
  leg_date: string;
  leg_sequence: number;
}
```

### NoFlyRuleRow

**File:** [`app/utils/services/no-fly.service.ts`](../../app/utils/services/no-fly.service.ts:6)

```typescript
export interface NoFlyRuleRow {
  id: number;
  label: string;
  description: string | null;
  rule_type: "recurring" | "one_off";
  is_active: boolean;
  day_of_week: number[];        // 0=Sunday, 6=Saturday
  season_start: string | null;  // MM-DD
  season_end: string | null;    // MM-DD
  specific_date: string | null; // YYYY-MM-DD
  priority: number;
  override_reason: string | null;
  created_by: number;
  created_at: Date;
  updated_at: Date;
}
```

### ActionContext & ActionResult

**File:** [`app/utils/schedule-handlers.server.ts`](../../app/utils/schedule-handlers.server.ts:18)

```typescript
export interface ActionContext {
  userId: number;
  formData: FormData;
}

export type ActionResult =
  | { success: true; [key: string]: unknown }
  | { error: string; status?: number };
```

### LoaderData (Updated)

**File:** [`app/routes/operations.schedule._index.tsx`](../../app/routes/operations.schedule._index.tsx:44)

```typescript
interface LoaderData {
  schedule: ScheduleRow | null;
  flights: FlightSummaryRow[];
  flightLegs: FlightLegRow[];
  passengerManifests: PassengerManifestRow[];
  unassignedBookings: BookingLegWithDetails[];
  selectedDate: string;
  isNoFlyDay: boolean;
  user: { id: number; name: string; email: string };
  canApprove: boolean;
  canPublish: boolean;
  canEdit: boolean;
  canAssignPilot: boolean;
  availablePilots: PilotAvailability[];
  aerodromeNames: Record<string, string>;
  aerodromes: Array<{id: number, code: string, name: string}>;
  buildResult: ScheduleBuildResult | null;
}
```

| Field | Type | Source |
|-------|------|--------|
| `aerodromeNames` | `Record<string, string>` | `SELECT code, name FROM aerodromes WHERE is_active = true` |
| `aerodromes` | `Array<{id: number, code: string, name: string}>` | `SELECT id, code, name FROM aerodromes WHERE is_active = true` |
| `buildResult` | `ScheduleBuildResult \| null` | Returned from auto-build action, initially `null` |

### ScheduleBuildResult (from scheduling pipeline)

**File:** [`app/utils/scheduling/index.ts`](../../app/utils/scheduling/index.ts:1)

```typescript
// Inferred from the buildSchedule return type
interface ScheduleBuildResult {
  scheduleId: number;
  flightsCreated: number;
  legsCreated: number;
  warnings: string[];
  // ... additional fields
}
```

---

## Repository Methods

### Repository: booking-leg-passenger.ts

New methods added for per-passenger flight assignment:

| Method | Signature | Description |
|--------|-----------|-------------|
| `assignToFlightLeg` | `(passengerId: number, flightLegId: number, client?: Prisma.TransactionClient) => Promise<void>` | Assigns a booking_leg_passenger to a flight_leg. Uses `$executeRawUnsafe` to update `flight_leg_id`. Accepts optional transaction client. |
| `unassignFromFlightLeg` | `(passengerId: number, client?: Prisma.TransactionClient) => Promise<void>` | Unassigns a booking_leg_passenger from their flight_leg (sets `flight_leg_id = NULL`). Accepts optional transaction client. |
| `findByBookingLegId` | `(bookingLegId: number) => Promise<Array<{id, booking_leg_id, flight_leg_id, passenger_name, passenger_count}>>` | Finds all booking_leg_passengers for a given booking_leg. Joins with booking_passengers to resolve passenger names. |

### Repository: aerodrome.ts

| Method | Signature | Description |
|--------|-----------|-------------|
| `findByCode` | `(code: string) => Promise<{id, code, name, is_active} \| null>` | Looks up an aerodrome by ICAO code using raw SQL. |

### Transaction Wrapper

**File:** `app/utils/repositories/transaction.ts`

```typescript
export async function withTransaction<T>(
  fn: (client: Prisma.TransactionClient) => Promise<T>
): Promise<T>
```

Generic transaction wrapper that delegates to `db.$transaction(fn)`. Used by all mutation handlers that need atomicity.

---

## Action Handlers

### New/Enhanced Handlers in schedule-handlers.server.ts

| Handler | Signature | Changes |
|---------|-----------|---------|
| `handleAssignBooking` | `(bookingLegId: number, flightId: number) => Promise<ActionResult>` | **Enhanced**: Now uses per-passenger assignment via `assignToFlightLeg()`. Wrapped in `withTransaction`. Finds passengers via `findByBookingLegId()`. Returns 404 if no passengers found. |
| `handleUnassignBooking` | `(bookingLegId: number) => Promise<ActionResult>` | **Enhanced**: Now uses per-passenger unassignment via `unassignFromFlightLeg()`. Wrapped in `withTransaction`. |
| `handleCreateFlightFromBooking` | `(scheduleId: number, bookingLegIds: number[]) => Promise<ActionResult>` | **Enhanced**: Creates flight with STY→origin→destination→STY route pattern. Looks up STY aerodrome ID. Wrapped in `withTransaction`. |
| `handleResetDraft` | `(scheduleId: number) => Promise<ActionResult>` | **New**: Resets a draft/building schedule by clearing all passenger assignments, deleting flight legs, clearing booking_leg assignments, deleting flights, and resetting status to BUILDING. |
| `handleReorderFlights` | `(scheduleId: number, flightIds: number[]) => Promise<ActionResult>` | **Enhanced**: Now sets departure/arrival times with 15-minute spacing starting from 06:00 base time, in addition to updating sort_order. |

### New Action Intents

| Intent | Handler | Form Data |
|--------|---------|-----------|
| `reset-draft` | `handleResetDraft` | `scheduleId` |
| `add-flight` | `handleCreateFlight` (alias) | `scheduleId`, `flightNumber`, `originAerodromeId`, `destinationAerodromeId`, `aircraftId` (optional) |

---

## Component State & UI Features

### New Component State Variables

| Variable | Type | Purpose |
|----------|------|---------|
| `assigningFlightId` | `number \| null` | Per-item loading state for flight assignment |
| `unassigningPassengerKey` | `string \| null` | Per-item loading state for passenger unassignment |
| `reorderingFlightId` | `number \| null` | Per-item loading state for flight reordering |
| `flightWarnings` | `Record<number, string>` | Per-flight persistent warning messages |
| `optimisticFlightLegs` | `FlightLegRow[] \| null` | Optimistic flight legs state for BUG-34 fix (prevents legs disappearing after assign) |
| `showAddFlightModal` | `boolean` | Controls Add Flight modal visibility |

### New UI Features

1. **Add Flight Modal**: Form with flight number, origin (select from aerodromes), destination (select from aerodromes), and optional aircraft. Submits `create-flight` intent.
2. **Previous/Next Date Navigation**: Buttons flanking the DatePicker that adjust the `date` search param by ±1 day.
3. **Reset Draft Button**: Visible for draft/building schedules. Submits `reset-draft` intent with confirmation prompt.
4. **Build Result Display**: Green banner showing auto-build results (flights created, bookings assigned, warnings).
5. **Reverse Drag (Unassign)**: `handleDragStart` tracks passenger drag source. `handleDragEnd` handles passenger→unassign-pool drops, submitting `unassign-booking` intent.
6. **`formatTime` Helper**: `formatTime(date)` returns `HH:MM` format using `en-GB` locale.

---

## Schema Changes

### Schema Migration: Add flight_leg_id to booking_leg_passengers

**File:** `migrations/fix-add-flight-leg-id.sql`

```sql
ALTER TABLE booking_leg_passengers
ADD COLUMN IF NOT EXISTS flight_leg_id INTEGER REFERENCES flight_legs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_booking_leg_passengers_flight_leg_id
ON booking_leg_passengers(flight_leg_id);
```

**Prisma Schema Update:**
- Added `flight_leg_id Int?` field to `booking_leg_passengers` model with `@map("flight_leg_id")`
- Added relation: `flight_leg flight_legs? @relation(fields: [flight_leg_id], references: [id], onDelete: SetNull)`
- Added reverse relation: `booking_leg_passengers booking_leg_passengers[]` to `flight_legs` model

---

## Test Results Post-Implementation

| Test Suite | Status | Count |
|------------|--------|-------|
| Unit tests | ✅ All passed | 59 tests, 8 files |
| Integration tests | ✅ All passed | 58 tests, 7 files |
| **Total** | **✅ All passed** | **117 tests (59 unit + 58 integration)** |
| TypeScript compilation | ⚠︝ 2 pre-existing errors | cluster-bookings.test.ts (beforeEach), vite.config.ts (tsconfigPaths) |

**Known Issues:**
1. `cluster-bookings.test.ts`: `beforeEach` not recognized — Vitest globals not in tsconfig
2. `vite.config.ts`: `tsconfigPaths` not a valid resolve option — stale config

---

## Validation Invariants

The following invariants **must never be removed or relaxed**. They are the
core safety properties of the scheduling system.

### Invariant 1: No-Fly Day Enforcement

Auto-build, assign-booking, and unassign-booking **must** fail on no-fly days.

**Enforced at:**
- [`handleAutoBuild()`](../../app/utils/schedule-handlers.server.ts:29) — checks `isNoFlyDay(date)` before proceeding
- [`handleAssignBooking()`](../../app/utils/schedule-handlers.server.ts:337) — checks no-fly status
- [`handleUnassignBooking()`](../../app/utils/schedule-handlers.server.ts:471) — checks no-fly status

**Test:** [`auto-build.test.ts`](../../tests/integration/scheduling/auto-build.test.ts:101) — "auto-build on no-fly day fails"

### Invariant 2: Approve Requires Flights with Bookings

A schedule can only transition from `building` → `approved` if **all flights**
have at least one booking leg assigned.

**Enforced at:** [`handleApprove()`](../../app/utils/schedule-handlers.server.ts:69)

**Test:** [`schedule-status-flow.test.ts`](../../tests/integration/scheduling/schedule-status-flow.test.ts:56) — "fails to approve a schedule with no flights"

### Invariant 3: Publish Requires Captain Assignment

A schedule can only transition from `approved` → `published` if **all flights**
have a captain (pilot) assigned.

**Enforced at:** [`handlePublish()`](../../app/utils/schedule-handlers.server.ts:173)

**Test:** [`schedule-status-flow.test.ts`](../../tests/integration/scheduling/schedule-status-flow.test.ts:114) — "publishes an approved schedule succeeds"

### Invariant 4: Pilot Constraints

Pilot assignment must enforce:
- Minimum 12 hours rest between duties
- Maximum 12 hours duty per day
- Maximum 8 hours flight time per day
- Valid medical certificate
- Correct type rating for aircraft

**Enforced at:** [`assignPilots()`](../../app/utils/scheduling/assign-pilots.ts:43)

### Invariant 5: Weight & Balance Validation

Each flight must have valid weight & balance after aircraft assignment:
- Seat count must not be exceeded
- MTOW must not be exceeded
- MLW must not be exceeded at any stop
- Aircraft range must cover all legs
- Runway length must be adequate (with derating for short strips)

**Enforced at:** [`buildSchedule()`](../../app/utils/scheduling/index.ts:34) (Phase 4)

**Test:** [`flight-validation.test.ts`](../../tests/unit/scheduling/flight-validation.test.ts:23)

### Invariant 6: Empty Flight Cleanup

When the last booking leg is unassigned from a flight, the flight **must** be
deleted (including its legs, manifests, and pilot assignments).

**Enforced at:** [`handleUnassignBooking()`](../../app/utils/schedule-handlers.server.ts:471)

**Test:** [`unassign-booking.test.ts`](../../tests/integration/scheduling/unassign-booking.test.ts:92) — "unassigns last booking deletes flight"

### Invariant 7: Route Insertion Integrity

When a booking is assigned to a flight, the booking's origin/destination must
match a leg in the flight's route. Flights cannot contain legs that don't
correspond to any assigned booking.

**Enforced at:** [`handleAssignBooking()`](../../app/utils/schedule-handlers.server.ts:337)

### Invariant 8: Status Transition Validity

Only the transitions documented in the status lifecycle diagram above are
permitted. Invalid transitions (e.g., `draft` → `published`, `cancelled` →
`approved`) **must** return an error.

**Enforced at:** [`scheduleRepository.updateStatus()`](../../app/utils/repositories/schedule.ts:73)

**Test:** [`schedule-status-flow.test.ts`](../../tests/integration/scheduling/schedule-status-flow.test.ts:299) — "publishes a non-approved schedule fails"

### Invariant 9: Audit Trail Preservation

All status transitions **must** record the acting user and timestamp in the
appropriate audit fields (`approved_by`/`approved_at`, `published_by`/`published_at`,
`cancelled_by`/`cancelled_at`).

**Enforced at:** [`scheduleRepository.updateStatus()`](../../app/utils/repositories/schedule.ts:73)

### Invariant 10: Permission Enforcement

Every schedule action **must** check the caller's PBAC permission before
executing. Unauthorized requests **must** return a 403 error.

**Enforced at:** [`operations.schedule._index.tsx`](../../app/routes/operations.schedule._index.tsx:220)

**Test:** [`permissions.test.ts`](../../tests/integration/scheduling/permissions.test.ts:7)

---

### Invariant 11: Sibling Leg Propagation � Per-Passenger Drag Must Not Cascade

When a single passenger is dragged onto a flight (per-passenger assignment via
`bookingLegPassengerId`), the handler **must not** propagate the flight
assignment to sibling unassigned booking legs of the same booking. Only
whole-leg drags (`bookingLegPassengerId === undefined`) may cascade.

**Rationale:** A booking may have multiple legs (STY?MPA, MPA?STY). Dragging a
single passenger from the outbound leg should assign only that passenger � not
pull the return leg and all its passengers into the same flight.

**Enforced at:**  
[`handleAssignBooking()`](../../app/utils/schedule-handlers.server.ts:879-889) �  
the sibling-legs propagation block is gated behind `if (!bookingLegPassengerId)`.
This gate runs at the **end** of `handleAssignBooking` after the per-passenger
filter at line 688-691 and the main assignment logic. If the gate is removed or
the condition is inverted, per-passenger drags will incorrectly cascade.

```typescript
// CRITICAL INVARIANT 11
// Propagate to sibling unassigned legs of the same booking.
// Only propagate when assigning the whole booking leg � per-passenger
// drags should NOT pull in sibling legs (the user explicitly scoped to
// one passenger).
if (!bookingLegPassengerId) {
  const bk = await tx.selectFrom("booking_legs")
    .select("booking_id").where("id", "=", bookingLegId)
    .executeTakeFirst();
  if (bk?.booking_id) {
    await tx.updateTable("booking_legs")
      .set({ flight_id: flightId })
      .where("booking_id", "=", bk.booking_id)
      .where("flight_id", "is", null)
      .execute();
  }
}
```

**Test coverage:** Unit tests for both whole-leg and per-passenger paths must
verify that sibling legs are assigned only when `bookingLegPassengerId` is
`undefined`. Existing integration tests in
[`assign-booking.test.ts`](../../tests/integration/scheduling/assign-booking.test.ts)
cover the whole-leg path. A per-passenger path test should be added.
*To be implemented: `tests/integration/scheduling/per-passenger-assign.test.ts`*

**Regression risk:** **HIGH** � removing or inverting the `bookingLegPassengerId`
gate causes "one drag, multiple passengers moved" UX bug across the entire
schedule board.

---

## Database Query Contracts

The following SQL queries are **contracts** — their result shapes must not
change without updating all consumers and tests.

### Q1: Find Unassigned Booking Legs by Date

**File:** [`app/utils/repositories/booking-leg.server.ts`](../../app/utils/repositories/booking-leg.server.ts:22)

```sql
SELECT
  bl.*,
  b.reference AS booking_reference,
  bp.first_name || ' ' || bp.last_name AS passenger_name,
  (SELECT COUNT(*) FROM booking_leg_passengers blp2
   WHERE blp2.booking_leg_id = bl.id)::int AS passenger_count,
  bl.origin_code,
  bl.destination_code
FROM booking_legs bl
JOIN bookings b ON b.id = bl.booking_id
JOIN booking_passengers bp ON bp.booking_id = b.id
JOIN booking_leg_passengers blp ON blp.booking_leg_id = bl.id
WHERE bl.flight_id IS NULL
  AND bl.leg_date = $1
  AND b.status NOT IN ('cancelled', 'completed')
ORDER BY bl.origin_code, bl.destination_code, bl.preferred_time;
```

**Result shape:** [`BookingLegWithDetails`](../../app/utils/repositories/booking-leg.server.ts:9)

**Test:** [`unassigned-by-date.test.ts`](../../tests/integration/scheduling/unassigned-by-date.test.ts:23)

### Q2: Count Unassigned by Date

**File:** [`app/utils/repositories/booking-leg.server.ts`](../../app/utils/repositories/booking-leg.server.ts:75)

```sql
SELECT COUNT(*)
FROM booking_legs bl
JOIN bookings b ON b.id = bl.booking_id
WHERE bl.flight_id IS NULL
  AND bl.leg_date = $1
  AND b.status NOT IN ('cancelled', 'completed');
```

### Q3: Find Flights with Summary Data

**File:** [`app/routes/operations.schedule._index.tsx`](../../app/routes/operations.schedule._index.tsx:62)

```sql
SELECT
  f.id, f.flight_number, f.status, f.sort_order,
  f.departure_time, f.arrival_time,
  f.max_takeoff_weight_kg, f.max_landing_weight_kg,
  f.basic_empty_weight_kg, f.payload_kg, f.fuel_kg, f.crew_weight_kg,
  ao.code AS origin_code,
  ad.code AS destination_code,
  a.registration AS aircraft_registration,
  a.aircraft_type,
  a.seat_count,
  p.full_name AS pilot_name,
  p.medical_expiry AS pilot_medical_expiry,
  -- computed fields
  EXTRACT(EPOCH FROM (f.arrival_time::time - f.departure_time::time)) / 60 AS duration_minutes
FROM flights f
JOIN aerodromes ao ON ao.id = f.origin_aerodrome_id
JOIN aerodromes ad ON ad.id = f.destination_aerodrome_id
LEFT JOIN aircraft a ON a.id = f.aircraft_id
LEFT JOIN pilots p ON p.id = f.pilot_id
WHERE f.schedule_id = $1
ORDER BY f.sort_order;
```

### Q4: Find Flight Legs by Schedule

**File:** [`app/utils/repositories/flight-leg.ts`](../../app/utils/repositories/flight-leg.ts:35)

```sql
SELECT fl.*
FROM flight_legs fl
JOIN flights f ON f.id = fl.flight_id
WHERE f.schedule_id = $1
ORDER BY fl.flight_id, fl.leg_sequence;
```

### Q5: Find Passenger Manifests by Schedule

**File:** [`app/routes/operations.schedule._index.tsx`](../../app/routes/operations.schedule._index.tsx:62)

```sql
SELECT
  blp.id,
  blp.booking_leg_id,
  bp.first_name || ' ' || bp.last_name AS passenger_name,
  blp.clothed_weight_kg AS body_weight_kg,
  blp.baggage_weight_kg,
  blp.freight_weight_kg,
  bl.origin_code,
  bl.destination_code
FROM booking_leg_passengers blp
JOIN booking_legs bl ON bl.id = blp.booking_leg_id
JOIN bookings b ON b.id = bl.booking_id
JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
WHERE bl.flight_id IN (SELECT id FROM flights WHERE schedule_id = $1)
ORDER BY bl.flight_id, bl.leg_sequence, bp.last_name;
```

### Q6: Find Schedule by Date

**File:** [`app/utils/repositories/schedule.ts`](../../app/utils/repositories/schedule.ts:29)

```sql
SELECT * FROM schedules WHERE schedule_date = $1;
```

### Q7: Update Schedule Status with Audit

**File:** [`app/utils/repositories/schedule.ts`](../../app/utils/repositories/schedule.ts:73)

```sql
UPDATE schedules
SET
  status = $1,
  approved_by = CASE WHEN $1 = 'approved' THEN $2 ELSE approved_by END,
  approved_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE approved_at END,
  published_by = CASE WHEN $1 = 'published' THEN $2 ELSE published_by END,
  published_at = CASE WHEN $1 = 'published' THEN NOW() ELSE published_at END,
  cancelled_by = CASE WHEN $1 = 'cancelled' THEN $2 ELSE cancelled_by END,
  cancelled_at = CASE WHEN $1 = 'cancelled' THEN NOW() ELSE cancelled_at END,
  cancellation_reason = CASE WHEN $1 = 'cancelled' THEN $3 ELSE cancellation_reason END,
  updated_at = NOW()
WHERE id = $4;
```

### Q8: Replace Flight Legs (Transactional)

**File:** [`app/utils/repositories/flight-leg.ts`](../../app/utils/repositories/flight-leg.ts:99)

```typescript
// Wrapped in db.$transaction:
// 1. DELETE FROM flight_legs WHERE flight_id = $1
// 2. INSERT INTO flight_legs (flight_id, leg_sequence, origin_code, destination_code, ...)
//    VALUES (...), (...), ...
```

### Q9: No-Fly Day Check

**File:** [`app/utils/services/no-fly.service.ts`](../../app/utils/services/no-fly.service.ts:226)

```typescript
// Logic (not raw SQL):
// 1. Find all active rules
// 2. Filter by date match (recurring: day_of_week + season; one_off: specific_date)
// 3. One-off beats recurring
// 4. Within type, highest priority wins
// 5. Return true if any rule matches
```

---

## Test Coverage Requirements

### Integration Tests

All integration tests use the `withRollback` pattern from
[`tests/fixtures/helpers.ts`](../../tests/fixtures/helpers.ts):

```typescript
await withRollback(async (tx) => {
  // test logic here — all DB changes are rolled back after test
});
```

| Test File | Lines | Coverage | Key Scenarios |
|-----------|-------|----------|---------------|
| [`assign-booking.test.ts`](../../tests/integration/scheduling/assign-booking.test.ts) | 192 | `handleAssignBooking()` | Success, 404, multiple assignments, race condition |
| [`unassign-booking.test.ts`](../../tests/integration/scheduling/unassign-booking.test.ts) | 220 | `handleUnassignBooking()` | Partial unassign, last-booking cleanup, no-fly day, approved schedule block, already-unassigned |
| [`auto-build.test.ts`](../../tests/integration/scheduling/auto-build.test.ts) | 311 | `handleAutoBuild()` | Zero bookings, 10+ bookings, no-fly day, insufficient aircraft, pilot assignment, weight balance, leg sequences |
| [`schedule-status-flow.test.ts`](../../tests/integration/scheduling/schedule-status-flow.test.ts) | 333 | Full lifecycle | Draft create, approve with/without flights, publish, revise, cancel, invalid transitions |
| [`error-cases.test.ts`](../../tests/integration/scheduling/error-cases.test.ts) | 229 | Error handling | Unknown intent, missing params, 404s, past/future dates, NaN, empty cancel reason |
| [`permissions.test.ts`](../../tests/integration/scheduling/permissions.test.ts) | 120 | PBAC enforcement | 403 for each action without permission, positive tests for ops/admin roles |
| [`unassigned-by-date.test.ts`](../../tests/integration/scheduling/unassigned-by-date.test.ts) | 284 | `findUnassignedByDate()` | Date filtering, empty results, assigned exclusion, multi-date, cancelled/completed exclusion |

### E2E Tests

E2E tests use the [`SchedulePage`](../../tests/e2e/pages/schedule-page.ts) Page Object Model
and Playwright.

| Test File | Lines | Coverage |
|-----------|-------|----------|
| [`scheduling.spec.ts`](../../tests/e2e/scheduling.spec.ts) | 282 | Date picker, unassigned bookings, date change, empty state, URL state, flight cards, auto-build, approve, drag-and-drop assign, drag-to-create |

### Unit Tests

| Test File | Lines | Coverage |
|-----------|-------|----------|
| [`cluster-bookings.test.ts`](../../tests/unit/scheduling/cluster-bookings.test.ts) | 227 | `clusterBookings()` — grouping by date/route, empty, multi-date, same-route-different-date |
| [`flight-validation.test.ts`](../../tests/unit/scheduling/flight-validation.test.ts) | 265 | `validateFlight()` — seat count, MTOW, range, runway derating, multi-leg, MLW, empty passengers, suggestions |

### Minimum Coverage Thresholds

| Metric | Threshold | Enforcement |
|--------|-----------|-------------|
| Integration tests passing | 100% | CI gate |
| E2E tests passing | 100% | CI gate |
| Unit tests passing | 100% | CI gate |
| Schedule handler branches covered | ≥90% | Code review |
| Repository method coverage | ≥80% | Code review |
| New code test coverage | ≥80% | PR gate |

### Test Patterns (Do Not Change)

1. **Integration tests** use `withRollback(async (tx) => { ... })` — do not use
   `beforeAll`/`afterAll` for DB setup/teardown in integration tests.
2. **E2E tests** use the `SchedulePage` Page Object Model — do not inline
   page interactions.
3. **Unit tests** mock repositories using `vi.mock()` — do not use real DB
   connections in unit tests.
4. **Factories** from [`tests/fixtures/factories.ts`](../../tests/fixtures/factories.ts)
   use `generateUniqueDate()` for parallel-safe unique date generation.
5. **Seed data** from [`tests/fixtures/seed-data.ts`](../../tests/fixtures/seed-data.ts)
   defines `MOCK_AERODROMES`, `MOCK_USER_IDS`, and `TEST_VALUES`.

---

## Regression Trigger Map

Any change to the following files **must** trigger the corresponding test runs:

### Schedule Handlers & Route

| File Changed | Required Tests |
|-------------|----------------|
| [`app/utils/schedule-handlers.server.ts`](../../app/utils/schedule-handlers.server.ts) | All integration scheduling tests |
| [`app/routes/operations.schedule._index.tsx`](../../app/routes/operations.schedule._index.tsx) | All integration + E2E scheduling tests |
| [`app/utils/scheduling/index.ts`](../../app/utils/scheduling/index.ts) | All integration + unit scheduling tests |

### Repositories

| File Changed | Required Tests |
|-------------|----------------|
| [`app/utils/repositories/schedule.ts`](../../app/utils/repositories/schedule.ts) | `schedule-status-flow.test.ts`, `auto-build.test.ts` |
| [`app/utils/repositories/flight.server.ts`](../../app/utils/repositories/flight.server.ts) | `auto-build.test.ts`, `assign-booking.test.ts`, `unassign-booking.test.ts` |
| [`app/utils/repositories/flight-leg.ts`](../../app/utils/repositories/flight-leg.ts) | `auto-build.test.ts` |
| [`app/utils/repositories/booking-leg.ts`](../../app/utils/repositories/booking-leg.ts) | `assign-booking.test.ts`, `unassign-booking.test.ts`, `unassigned-by-date.test.ts` |
| [`app/utils/repositories/booking-leg.server.ts`](../../app/utils/repositories/booking-leg.server.ts) | `unassigned-by-date.test.ts` |
| [`app/utils/repositories/booking-leg-passenger.ts`](../../app/utils/repositories/booking-leg-passenger.ts) | `auto-build.test.ts` |

### Scheduling Pipeline

| File Changed | Required Tests |
|-------------|----------------|
| [`app/utils/scheduling/assign-pilots.ts`](../../app/utils/scheduling/assign-pilots.ts) | `auto-build.test.ts` (pilot assignment scenarios) |
| [`app/utils/scheduling/build-flight-card-flight.ts`](../../app/utils/scheduling/build-flight-card-flight.ts) | E2E `scheduling.spec.ts` (flight card display) |
| [`app/utils/scheduling/build-stop-activities.ts`](../../app/utils/scheduling/build-stop-activities.ts) | `auto-build.test.ts` (leg sequences) |

### Services

| File Changed | Required Tests |
|-------------|----------------|
| [`app/utils/services/no-fly.service.ts`](../../app/utils/services/no-fly.service.ts) | `auto-build.test.ts`, `assign-booking.test.ts`, `unassign-booking.test.ts` |

### Components

| File Changed | Required Tests |
|-------------|----------------|
| Any file in `app/components/schedule/` | E2E `scheduling.spec.ts` |
| [`app/components/schedule/SortableDroppableFlightCard.tsx`](../../app/components/schedule/SortableDroppableFlightCard.tsx) | E2E `scheduling.spec.ts` (drag-and-drop tests) |
| [`app/components/schedule/DraggableBookingItem.tsx`](../../app/components/schedule/DraggableBookingItem.tsx) | E2E `scheduling.spec.ts` (drag-and-drop tests) |
| [`app/components/schedule/DraftFlightPlaceholder.tsx`](../../app/components/schedule/DraftFlightPlaceholder.tsx) | E2E `scheduling.spec.ts` (drag-to-create tests) |
| [`app/components/schedule/ScheduleBoard.tsx`](../../app/components/schedule/ScheduleBoard.tsx) | E2E `scheduling.spec.ts` (flight reorder tests) |
| [`app/components/schedule/UnassignPoolPanel.tsx`](../../app/components/schedule/UnassignPoolPanel.tsx) | E2E `scheduling.spec.ts` (unassigned pool display) |
| [`app/components/DatePicker.tsx`](../../app/components/DatePicker.tsx) | E2E `scheduling.spec.ts` (date picker tests) |
| [`app/components/ConfirmDialog.tsx`](../../app/components/ConfirmDialog.tsx) | E2E `scheduling.spec.ts` |

### E2E Test Helpers

| File Changed | Required Tests |
|-------------|----------------|
| [`tests/e2e/helpers/drag-simulator.ts`](../../tests/e2e/helpers/drag-simulator.ts) | E2E `scheduling.spec.ts` (all drag-and-drop tests) |
| [`tests/e2e/pages/schedule-page.ts`](../../tests/e2e/pages/schedule-page.ts) | E2E `scheduling.spec.ts` (all schedule tests) |

### Test Fixtures

| File Changed | Required Tests |
|-------------|----------------|
| [`tests/fixtures/factories.ts`](../../tests/fixtures/factories.ts) | All integration scheduling tests |
| [`tests/fixtures/seed-data.ts`](../../tests/fixtures/seed-data.ts) | All integration scheduling tests |
| [`tests/fixtures/helpers.ts`](../../tests/fixtures/helpers.ts) | All integration tests |

### Database Schema

| File Changed | Required Tests |
|-------------|----------------|
| [`prisma/schema.prisma`](../../prisma/schema.prisma) | All integration + E2E scheduling tests |
| Any migration in `migrations/` | All integration + E2E scheduling tests |

---

## CI/CD Integration

### Pre-Commit Checks

Before committing any schedule-related changes, run:

```bash
# Integration tests (with test DB)
npx vitest run tests/integration/scheduling/

# Unit tests
npx vitest run tests/unit/scheduling/

# E2E tests

npx playwright test tests/e2e/scheduling.spec.ts

# TypeScript compilation check
npx tsc --noEmit
```

### PR Gate Checklist

Every PR touching schedule-related files **must** pass:

- [ ] All integration scheduling tests pass
- [ ] All unit scheduling tests pass
- [ ] All E2E scheduling tests pass
- [ ] No TypeScript errors (`npx tsc --noEmit`)
- [ ] No lint errors (`npx eslint app/utils/scheduling/ app/utils/schedule-handlers.server.ts`)
- [ ] All 10 validation invariants are preserved
- [ ] No interface shapes changed without consumer updates
- [ ] No SQL query result shapes changed without consumer updates
- [ ] Test coverage meets minimum thresholds
- [ ] New edge cases added to Edge Case Registry (below)

### Automated Regression Checks

When any file in the Regression Trigger Map is modified, the CI pipeline must:

1. Detect the changed files
2. Run the corresponding test suite(s)
3. Verify all 10 validation invariants via integration tests
4. Block merge if any test fails

---

## Development Workflow

Follow this workflow when making changes to the scheduling system:

### Step 1: Identify Affected Contracts

Before writing code, identify which of the following are affected:

- **Interfaces** — check [`Interface & Type Contracts`](#interface--type-contracts)
- **Validation invariants** — check [`Validation Invariants`](#validation-invariants)
- **Database queries** — check [`Database Query Contracts`](#database-query-contracts)
- **Test coverage** — check [`Test Coverage Requirements`](#test-coverage-requirements)

### Step 2: Make Changes

1. Make the smallest possible change to achieve the goal
2. Update all consumers of any changed interface
3. Update all test fixtures that depend on changed types
4. Add new edge cases to the Edge Case Registry

### Step 3: Verify Invariants

Run the invariant-specific tests:

```bash
# Invariant 1: No-fly day enforcement
npx vitest run tests/integration/scheduling/auto-build.test.ts -t "no-fly"

# Invariant 2: Approve requires flights with bookings
npx vitest run tests/integration/scheduling/schedule-status-flow.test.ts -t "approve"

# Invariant 3: Publish requires captain
npx vitest run tests/integration/scheduling/schedule-status-flow.test.ts -t "publish"

# Invariant 4: Pilot constraints
npx vitest run tests/integration/scheduling/auto-build.test.ts -t "pilot"

# Invariant 5: Weight & balance
npx vitest run tests/unit/scheduling/flight-validation.test.ts

# Invariant 6: Empty flight cleanup
npx vitest run tests/integration/scheduling/unassign-booking.test.ts -t "last booking"

# Invariant 8: Status transition validity
npx vitest run tests/integration/scheduling/schedule-status-flow.test.ts

# Invariant 10: Permission enforcement
npx vitest run tests/integration/scheduling/permissions.test.ts
```

### Step 4: Run Full Test Suite

```bash
npx vitest run tests/integration/scheduling/ tests/unit/scheduling/
npx playwright test tests/e2e/scheduling.spec.ts
```

### Step 5: Update This Skill

If the change introduces new interfaces, invariants, queries, or edge cases,
update this skill file accordingly.

---

## Edge Case Registry

The following edge cases are documented with their handling strategy. Any new
edge case discovered during development **must** be added here.

### EC-1: No-Fly Day During Auto-Build

**Scenario:** User triggers auto-build on a date marked as a no-fly day.

**Expected behavior:** `handleAutoBuild()` returns `{ error: "Cannot auto-build on a no-fly day", status: 400 }`.

**Test:** [`auto-build.test.ts`](../../tests/integration/scheduling/auto-build.test.ts:101)

### EC-2: No-Fly Day During Booking Assignment

**Scenario:** User tries to assign a booking to a flight on a no-fly day.

**Expected behavior:** `handleAssignBooking()` returns error.

**Test:** [`assign-booking.test.ts`](../../tests/integration/scheduling/assign-booking.test.ts) (implicit in no-fly check)

### EC-3: No-Fly Day During Unassign

**Scenario:** User tries to unassign a booking on a no-fly day.

**Expected behavior:** `handleUnassignBooking()` returns error.

**Test:** [`unassign-booking.test.ts`](../../tests/integration/scheduling/unassign-booking.test.ts:133)

### EC-4: Empty Flight Cleanup on Last Unassign

**Scenario:** The last booking leg is unassigned from a flight, leaving it empty.

**Expected behavior:** The flight (and its legs, manifests, pilot assignments) is deleted.

**Test:** [`unassign-booking.test.ts`](../../tests/integration/scheduling/unassign-booking.test.ts:92)

### EC-5: Approve Schedule with No Flights

**Scenario:** User tries to approve a schedule that has no flights.

**Expected behavior:** `handleApprove()` returns `{ error: "Schedule has no flights", status: 400 }`.

**Test:** [`schedule-status-flow.test.ts`](../../tests/integration/scheduling/schedule-status-flow.test.ts:56)

### EC-6: Publish Without Captain Assignment

**Scenario:** User tries to publish a schedule where some flights have no pilot.

**Expected behavior:** `handlePublish()` returns error indicating missing captain.

**Test:** [`schedule-status-flow.test.ts`](../../tests/integration/scheduling/schedule-status-flow.test.ts:114)

### EC-7: Invalid Status Transition

**Scenario:** User tries to publish a `draft` schedule (skipping approval).

**Expected behavior:** Handler returns error for invalid transition.

**Test:** [`schedule-status-flow.test.ts`](../../tests/integration/scheduling/schedule-status-flow.test.ts:299)

### EC-8: Double-Cancel

**Scenario:** User tries to cancel an already-cancelled schedule.

**Expected behavior:** Handler returns error — cancelled is a terminal state.

**Test:** [`schedule-status-flow.test.ts`](../../tests/integration/scheduling/schedule-status-flow.test.ts:232)

### EC-9: Assign to Non-Existent Flight

**Scenario:** User tries to assign a booking to a flight ID that doesn't exist.

**Expected behavior:** `handleAssignBooking()` returns `{ error: "Flight not found", status: 404 }`.

**Test:** [`assign-booking.test.ts`](../../tests/integration/scheduling/assign-booking.test.ts:80)

### EC-10: Assign Non-Existent Booking Leg

**Scenario:** User tries to assign a booking leg ID that doesn't exist.

**Expected behavior:** Handler returns `{ error: "Booking leg not found", status: 404 }`.

**Test:** [`assign-booking.test.ts`](../../tests/integration/scheduling/assign-booking.test.ts:68)

### EC-11: Race Condition on Simultaneous Assignment

**Scenario:** Two users try to assign the same booking leg to different flights simultaneously.

**Expected behavior:** The second assignment fails (booking leg is already assigned).

**Test:** [`assign-booking.test.ts`](../../tests/integration/scheduling/assign-booking.test.ts:154)

### EC-12: Past Date Auto-Build

**Scenario:** User triggers auto-build for a date in the past.

**Expected behavior:** Auto-build succeeds (historical schedules can be created).

**Test:** [`error-cases.test.ts`](../../tests/integration/scheduling/error-cases.test.ts:146)

### EC-13: Far Future Date Auto-Build

**Scenario:** User triggers auto-build for a date far in the future with no bookings.

**Expected behavior:** Auto-build succeeds but creates 0 flights.

**Test:** [`error-cases.test.ts`](../../tests/integration/scheduling/error-cases.test.ts:168)

### EC-14: Approve with NaN Schedule ID

**Scenario:** User submits approve with a non-numeric schedule ID.

**Expected behavior:** Handler returns `{ error: "Invalid schedule ID", status: 404 }`.

**Test:** [`error-cases.test.ts`](../../tests/integration/scheduling/error-cases.test.ts:190)

### EC-15: Cancel with Empty Reason

**Scenario:** User cancels a schedule without providing a cancellation reason.

**Expected behavior:** Cancel succeeds (reason is optional).

**Test:** [`error-cases.test.ts`](../../tests/integration/scheduling/error-cases.test.ts:210)

### EC-16: Unknown Action Intent

**Scenario:** User submits a form with an unrecognized `intent` value.

**Expected behavior:** `routeScheduleAction()` returns `{ error: "Unknown intent", status: 400 }`.

**Test:** [`error-cases.test.ts`](../../tests/integration/scheduling/error-cases.test.ts:59)

### EC-17: Missing Required Parameters

**Scenario:** User submits an action without required form fields.

**Expected behavior:** Handler returns `{ error: "Missing required parameters", status: 400 }`.

**Test:** [`error-cases.test.ts`](../../tests/integration/scheduling/error-cases.test.ts:73)

### EC-18: Insufficient Aircraft During Auto-Build

**Scenario:** Auto-build creates more flights than available aircraft.

**Expected behavior:** Flights are created without aircraft assignment; warning is logged.

**Test:** [`auto-build.test.ts`](../../tests/integration/scheduling/auto-build.test.ts:124)

### EC-19: No Available Pilots During Auto-Build

**Scenario:** Auto-build completes but no pilots are available for assignment.

**Expected behavior:** Flights are created without pilot assignment; warning is logged.

**Test:** [`auto-build.test.ts`](../../tests/integration/scheduling/auto-build.test.ts:199)

### EC-20: Seat Count Exceeded

**Scenario:** A flight has more passengers than the assigned aircraft's seat count.

**Expected behavior:** `validateFlight()` returns a violation.

**Test:** [`flight-validation.test.ts`](../../tests/unit/scheduling/flight-validation.test.ts:60)

### EC-21: MTOW Exceeded

**Scenario:** Total passenger + baggage weight exceeds aircraft MTOW.

**Expected behavior:** `validateFlight()` returns a violation.

**Test:** [`flight-validation.test.ts`](../../tests/unit/scheduling/flight-validation.test.ts:83)

### EC-22: Range Exceeded

**Scenario:** A flight leg distance exceeds the aircraft's maximum range.

**Expected behavior:** `validateFlight()` returns a violation.

**Test:** [`flight-validation.test.ts`](../../tests/unit/scheduling/flight-validation.test.ts:104)

### EC-23: Short Runway Derating

**Scenario:** A flight lands at an aerodrome with a short runway (e.g., SHR with 350m).

**Expected behavior:** `validateFlight()` applies runway derating and may return a violation.

**Test:** [`flight-validation.test.ts`](../../tests/unit/scheduling/flight-validation.test.ts:128)

### EC-24: MLW Approached at Stop

**Scenario:** A multi-leg flight has weight approaching MLW at an intermediate stop.

**Expected behavior:** `validateFlight()` returns a warning.

**Test:** [`flight-validation.test.ts`](../../tests/unit/scheduling/flight-validation.test.ts:198)

### EC-25: Empty Passenger List

**Scenario:** A flight has no passengers assigned.

**Expected behavior:** `validateFlight()` handles gracefully (no violation for empty list).

**Test:** [`flight-validation.test.ts`](../../tests/unit/scheduling/flight-validation.test.ts:223)

### EC-26: Unassign from Approved Schedule

**Scenario:** User tries to unassign a booking from a flight in an approved schedule.

**Expected behavior:** `handleUnassignBooking()` returns error — cannot modify approved schedule.

**Status:** **Resolved** — schedule status check added to `handleUnassignBooking()` in [`schedule-handlers.server.ts`](../../app/utils/schedule-handlers.server.ts:814).

**Test:** [`unassign-booking.test.ts`](../../tests/integration/scheduling/unassign-booking.test.ts:162)

### EC-27: Unassign Already-Unassigned Booking

**Scenario:** User tries to unassign a booking leg that has no flight assignment.

**Expected behavior:** Handler returns `{ error: "Booking is already unassigned", status: 400 }`.

**Status:** **Resolved** — already-unassigned check added to `handleUnassignBooking()` in [`schedule-handlers.server.ts`](../../app/utils/schedule-handlers.server.ts:810).

**Test:** [`unassign-booking.test.ts`](../../tests/integration/scheduling/unassign-booking.test.ts:200)

### EC-28: Create Flight on Non-Existent Schedule

**Scenario:** User tries to create a flight on a schedule ID that doesn't exist.

**Expected behavior:** Handler returns `{ error: "Schedule not found", status: 404 }`.

**Test:** [`error-cases.test.ts`](../../tests/integration/scheduling/error-cases.test.ts:129)

### EC-29: Revise Non-Published Schedule

**Scenario:** User tries to revise a schedule that is not in `approved` or `published` status.

**Expected behavior:** `handleRevise()` returns error.

**Test:** [`schedule-status-flow.test.ts`](../../tests/integration/scheduling/schedule-status-flow.test.ts:317)

### EC-30: Booking Legs with Different Dates

**Scenario:** Booking legs for the same route exist on different dates.

**Expected behavior:** `clusterBookings()` groups them separately by date.

**Test:** [`cluster-bookings.test.ts`](../../tests/unit/scheduling/cluster-bookings.test.ts:108)

---

## Gap Analysis Reference

The formal gap analysis is documented in
[`plans/scheduling-audit-report.md`](../../plans/scheduling-audit-report.md).
Below is a summary of all gaps identified in the audit report and their current
resolution status. **All 22 items across 4 phases have been resolved.**

### Phase 1 — Critical Fixes (All Resolved)

| ID | Gap | Resolution |
|----|-----|------------|
| G-01 | `ScheduleStatus` enum mismatch — `'building'` missing from CHECK constraint | **Resolved** — Fixed CHECK constraint in [`004-scheduling.sql`](../../migrations/consolidated/004-scheduling.sql); created [`migrations/fix-schedule-status-enum.sql`](../../migrations/fix-schedule-status-enum.sql) |
| G-03 | Unassign from approved schedule — no status guard | **Resolved** — Added schedule status check to [`handleUnassignBooking()`](../../app/utils/schedule-handlers.server.ts:814) |
| G-04 | Unassign of already-unassigned booking — no pre-condition check | **Resolved** — Added pre-condition check to [`handleUnassignBooking()`](../../app/utils/schedule-handlers.server.ts:810) |
| G-05 | `createdBy: 0` default in scheduling functions | **Resolved** — Fixed [`handleRevise()`](../../app/utils/schedule-handlers.server.ts:128), [`handleAutoBuild()`](../../app/utils/schedule-handlers.server.ts:29), [`handleCreateFlight()`](../../app/utils/schedule-handlers.server.ts), [`buildSchedule()`](../../app/utils/scheduling/index.ts:34) to require `userId` |
| G-06 | Missing transaction wrapping in `buildSchedule` | **Resolved** — Wrapped `buildSchedule` body in [`db.$transaction()`](../../app/utils/scheduling/index.ts:34) |
| G-17 | `findByScheduleId()` column name mismatch — used `where: { schedule_id: scheduleId }` instead of `where: { flight: { schedule_id: scheduleId } }` | **Resolved** — Changed to use Prisma relation filter in [`flight-leg.ts`](../../app/utils/repositories/flight-leg.ts:38) |

### Phase 2 — Core Improvements (All Resolved)

| ID | Gap | Resolution |
|----|-----|------------|
| G-07 | Pilot duty time stubs — used placeholder values instead of actual flight time calculations | **Resolved** — Replaced with actual flight time calculations in [`assign-pilots.ts`](../../app/utils/scheduling/assign-pilots.ts:43) |
| G-08 | Two-crew assumption — system assumed two pilots per flight | **Resolved** — Changed to single-crew (CAPTAIN only, `CREW_COUNT=1`) in [`assign-pilots.ts`](../../app/utils/scheduling/assign-pilots.ts) |
| G-09 | Aircraft availability — no time-overlap check | **Resolved** — Added time-overlap check in [`assign-aircraft.ts`](../../app/utils/scheduling/assign-aircraft.ts) |
| G-10 | N+1 query in `cluster-bookings` — per-leg loop | **Resolved** — Replaced per-leg loop with single batched SQL query in [`cluster-bookings.ts`](../../app/utils/scheduling/cluster-bookings.ts) |
| G-11 | N+1 query in `booking-leg.server` — inefficient GROUP BY | **Resolved** — Fixed GROUP BY, added `ARRAY_AGG(DISTINCT)` for passenger names in [`booking-leg.server.ts`](../../app/utils/repositories/booking-leg.server.ts) |
| G-16 | Missing composite unique constraint on `booking_leg_passengers` | **Resolved** — Added `@@unique([booking_leg_id, flight_leg_id])` to Prisma schema in [`schema.prisma`](../../prisma/schema.prisma) |

### Phase 3 — Consolidation (All Resolved)

| ID | Gap | Resolution |
|----|-----|------------|
| G-12 | Duplicate distance cache — logic duplicated across files | **Resolved** — Created shared [`distance-cache.ts`](../../app/utils/scheduling/distance-cache.ts) module |
| G-13 | Duplicate nearest-neighbor logic — logic duplicated across files | **Resolved** — Created shared [`route-builder.ts`](../../app/utils/scheduling/route-builder.ts) module |
| G-14 | Duplicate runway derating — logic duplicated across files | **Resolved** — Created shared [`runway-derating.ts`](../../app/utils/scheduling/runway-derating.ts) module |
| G-15 | Duplicate fuel calculation — logic duplicated across files | **Resolved** — Created shared [`fuel-lookup.ts`](../../app/utils/scheduling/fuel-lookup.ts) module |
| OE #3 | Dynamic imports — used `import()` in hot paths | **Resolved** — Replaced with static imports in [`index.ts`](../../app/utils/scheduling/index.ts) and [`weight-balance.ts`](../../app/utils/scheduling/weight-balance.ts) |
| OE #4 | Overlapping flight repositories — `.server.ts` and non-`.server.ts` variants | **Resolved** — Consolidated [`flight.server.ts`](../../app/utils/repositories/flight.server.ts) → [`flight.ts`](../../app/utils/repositories/flight.ts), [`schedule.server.ts`](../../app/utils/repositories/schedule.server.ts) → [`schedule.ts`](../../app/utils/repositories/schedule.ts); deleted `.server.ts` files |

### Phase 4 — Production Polish (All Resolved)

| ID | Gap | Resolution |
|----|-----|------------|
| G-02 | Missing loadsheet UI — no visual loadsheet for flights | **Resolved** — Created [`Loadsheet.tsx`](../../app/components/schedule/Loadsheet.tsx) component |
| G-18 | Hardcoded arm positions — weight & balance used constants instead of DB values | **Resolved** — Added arm columns to aircraft model; replaced hardcoded constants with DB lookups in [`assign-aircraft.ts`](../../app/utils/scheduling/assign-aircraft.ts) |
| — | Reverse drag (unassign → pool) — no way to drag passengers back to unassigned pool | **Resolved** — Created [`DraggablePassengerRow.tsx`](../../app/components/schedule/DraggablePassengerRow.tsx) component |
| — | Keyboard accessibility — no keyboard-based drag support | **Resolved** — Added `KeyboardSensor` + ARIA attributes to all draggable/sortable components in [`operations.schedule._index.tsx`](../../app/routes/operations.schedule._index.tsx:477) |
| — | E2E tests — insufficient coverage for new features | **Resolved** — Added 7 new test cases to [`scheduling.spec.ts`](../../tests/e2e/scheduling.spec.ts), 3 new helpers to [`drag-simulator.ts`](../../tests/e2e/helpers/drag-simulator.ts) |
| — | Fuel summary display — no fuel summary component | **Resolved** — Created [`FuelSummary.tsx`](../../app/components/schedule/FuelSummary.tsx) component |

### When Fixing Gaps

When addressing any gap from this analysis:

1. **Update the corresponding interface** in [`Interface & Type Contracts`](#interface--type-contracts)
2. **Update the corresponding query** in [`Database Query Contracts`](#database-query-contracts)
3. **Update test fixtures** in [`tests/fixtures/factories.ts`](../../tests/fixtures/factories.ts)
4. **Add new edge cases** to the Edge Case Registry
5. **Update all affected tests** in the Regression Trigger Map
6. **Mark the gap as resolved** in this section

---

## Do's and Don'ts

### Do

- ✅ Do preserve all 10 validation invariants
- ✅ Do maintain backward compatibility of all interfaces
- ✅ Do update all consumers when changing an interface shape
- ✅ Do run the full test suite before committing schedule changes
- ✅ Do add new edge cases to the Edge Case Registry
- ✅ Do use `withRollback` for integration tests
- ✅ Do use the `SchedulePage` Page Object Model for E2E tests
- ✅ Do use `vi.mock()` for unit tests
- ✅ Do use factory functions from `tests/fixtures/factories.ts`
- ✅ Do check PBAC permissions before every schedule action
- ✅ Do record audit fields on every status transition
- ✅ Do check no-fly day status before mutating operations
- ✅ Do preserve the prefix-numeric dnd-kit ID format (`flight-{id}`, `booking-{id}`)
- ✅ Do preserve the `data.type` discriminator pattern in dnd-kit payloads
- ✅ Do use `pointerWithin` for cross-container drops and `closestCenter` for sortable reordering
- ✅ Do use `PointerSensor` with `distance: 8` activation constraint
- ✅ Do use the pending-ops stack pattern for optimistic updates with rollback
- ✅ Do update E2E test selectors when changing any dnd-kit ID
- ✅ Do use `CSS.Transform.toString()` for `useSortable` and manual `translate3d` for `useDraggable`
- ✅ Do pass `isDraggingBooking` prop to `DraftFlightPlaceholder` for visual feedback

### Don't

- ❌ Don't remove or relax any validation invariant
- ❌ Don't change interface shapes without updating all consumers
- ❌ Don't change SQL query result shapes without updating all consumers
- ❌ Don't skip permission checks
- ❌ Don't use real DB connections in unit tests
- ❌ Don't inline page interactions in E2E tests (use Page Object Model)
- ❌ Don't use `beforeAll`/`afterAll` for DB setup in integration tests
- ❌ Don't allow invalid status transitions
- ❌ Don't skip no-fly day checks
- ❌ Don't leave orphaned records when deleting flights
- ❌ Don't merge without passing all scheduling tests
- ❌ Don't forget to update this skill file when adding new contracts
- ❌ Don't add `DragOverlay` without updating the E2E drag simulation
- ❌ Don't change the `draft-flight-placeholder` literal ID without updating E2E tests
- ❌ Don't remove the `isDraggingBooking` state tracking
- ❌ Don't change the 8px activation distance without updating the E2E simulation timing
- ❌ Don't remove the `KeyboardSensor` — it provides accessibility for keyboard-based reordering
- ❌ Don't merge the two `DndContext` instances into one

---

## Implementation Status

All 22 items from the audit report have been resolved across 4 phases:

| Phase | Items | Status | Key Deliverables |
|-------|-------|--------|------------------|
| **Phase 1 — Critical Fixes** | G-01, G-03, G-04, G-05, G-06, G-17 | ✅ **All Resolved** | ScheduleStatus enum fix, unassign guards, `createdBy` audit fix, transaction wrapping, `findByScheduleId` column fix |
| **Phase 2 — Core Improvements** | G-07, G-08, G-09, G-10, G-11, G-16 | ✅ **All Resolved** | Actual pilot duty time calc, single-crew model, aircraft availability overlap check, N+1 query fixes, composite unique constraint |
| **Phase 3 — Consolidation** | G-12, G-13, G-14, G-15, OE #3, OE #4 | ✅ **All Resolved** | Shared modules (distance-cache, route-builder, runway-derating, fuel-lookup), static imports, repository consolidation |
| **Phase 4 — Production Polish** | G-02, G-18, reverse drag, keyboard a11y, E2E tests, fuel summary | ✅ **All Resolved** | Loadsheet UI, DB arm positions, DraggablePassengerRow, KeyboardSensor + ARIA, 7 new E2E tests, FuelSummary component |

### Production-Readiness Plan

The production-readiness plan is documented in [`plans/scheduling-audit-report.md`](../../plans/scheduling-audit-report.md). The plan is organized into 4 phases:

| Phase | Focus | Items | Status |
|-------|-------|-------|--------|
| **Phase 1 — Critical Fixes** | Data integrity, security, and correctness | G-01, G-03, G-04, G-05, G-06, G-17 | ✅ **Complete** |
| **Phase 2 — Core Improvements** | Performance, correctness, and pilot/aircraft logic | G-07, G-08, G-09, G-10, G-11, G-16 | ✅ **Complete** |
| **Phase 3 — Consolidation** | Code quality, deduplication, and maintainability | G-12, G-13, G-14, G-15, OE #3, OE #4 | ✅ **Complete** |
| **Phase 4 — Production Polish** | UI/UX, accessibility, and test coverage | G-02, G-18, reverse drag, keyboard a11y, E2E tests, fuel summary | ✅ **Complete** |

**Key Deviation — Two-Crew vs Single-Crew (G-08):** The original backup code assumed a two-crew model (CAPTAIN + FIRST_OFFICER) for all flights. The current implementation uses a single-crew model (CAPTAIN only, `CREW_COUNT=1`) based on operational requirements for the BN-2 Islander fleet. This is a deliberate design decision, not a gap. The pilot assignment logic in [`assign-pilots.ts`](../../app/utils/scheduling/assign-pilots.ts) supports both models via the `role` field but defaults to single-crew.

**Summary:** The scheduling system has been fully hardened against all identified gaps. The system now features:
- Correct `ScheduleStatus` enum with all valid states enforced at DB level
- Per-passenger flight leg assignment with transaction safety
- Schedule status guards preventing mutations on approved/published schedules
- Proper audit trail with non-zero `created_by` values
- Transaction-wrapped pipeline operations
- Single-crew (CAPTAIN-only) pilot assignment with actual duty time calculations
- Aircraft availability overlap detection
- Batched queries eliminating N+1 patterns
- Shared utility modules eliminating code duplication
- Consolidated repository layer (no `.server.ts`/non-`.server.ts` split)
- Loadsheet and fuel summary UI components
- Keyboard-accessible drag-and-drop with ARIA support
- Comprehensive E2E test coverage for all drag operations

---

## File Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-06-02 | FIGAS Engineering | Initial skill creation — extracted from source code analysis of 20+ files |
| 2026-06-02 | FIGAS Engineering | Added Drag-and-Drop (dnd-kit) Implementation Patterns section with hook configurations, ID conventions, sensor setup, optimistic state management, E2E simulation patterns, and regression trigger entries for all dnd-kit component files |
| 2026-06-02 | FIGAS Engineering | Added Repository Methods section (booking-leg-passenger, aerodrome, transaction wrapper), Action Handlers section (enhanced assign/unassign, new reset-draft, reorder-flights), Component State & UI Features section, Schema Changes section (flight_leg_id migration), Test Results section, updated LoaderData with aerodromeNames/aerodromes/buildResult fields, marked G-01/G-02 as resolved in Gap Analysis |
| 2026-06-02 | FIGAS Engineering | Added schedule status check (G-03) and already-unassigned check (G-04) to `handleUnassignBooking()`; updated EC-26/EC-27 as resolved; updated test expectations in `unassign-booking.test.ts` |
| 2026-06-03 | FIGAS Engineering | Marked G-17 (findByScheduleId column name mismatch) as Resolved — fix applied to `flight-leg.ts:38` |
| 2026-06-03 | FIGAS Engineering | Updated Gap Analysis Reference to reflect all 22 audit report items resolved across 4 phases; added Implementation Status summary section |
| 2026-06-03 | FIGAS Engineering | Documentation harmonization: updated test results to 58/58 integration + 59/59 unit = 117/117 total; added Production-Readiness Plan section with phase summaries and two-crew vs single-crew deviation note (G-08) |
