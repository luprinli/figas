# Route Map

> Part of the Dynamic Scheduling & Flight Assignment plan.
> See main plan at [`scheduling-flight-assignment-plan.md`](scheduling-flight-assignment-plan.md)

## 7.1 New Routes

| Route (Remix v1 dot convention) | Component | Purpose |
|----------------------------------|-----------|---------|
| `operations.schedule._index` | `ScheduleBuilder` | Main scheduling page — auto-build, assign bookings, timeline view |
| `operations.schedule.list` | `ScheduleList` | Tabular view of all schedules with status filters |
| `operations.schedule.$scheduleId` | `ScheduleDetail` | View/edit a specific schedule, manage pipeline stages |

**Changes from original plan:**
- Removed `/operations/schedule/:scheduleId/sortie/:sortieId` route — no separate sortie entity exists. Flight details are accessed via the existing `operations.flights.$flightId` route.
- Removed `/api/schedule/auto-build`, `/api/schedule/:scheduleId/publish`, `/api/schedule/:scheduleId/assign-pilots` API routes — these are handled as form intents within the existing Remix action functions, not separate API routes.
- All routes use Remix v1 dot-convention file naming (e.g., `operations.schedule.$scheduleId.tsx`).

### Route File Structure

```
app/routes/
├── operations.schedule._index.tsx     # Schedule builder (main page)
├── operations.schedule.list.tsx       # Schedule list
└── operations.schedule.$scheduleId.tsx # Schedule detail
```

### Route Details

#### `operations.schedule._index.tsx` — Schedule Builder

| Aspect | Detail |
|--------|--------|
| **URL** | `/operations/schedule` |
| **Loader** | Fetches today's schedule (or date from query param), flights with legs, unassigned bookings, available aircraft/pilots |
| **Action** | Handles all schedule mutations via `intent` field: `auto-build`, `assign-booking`, `remove-booking`, `move-booking`, `create-flight`, `delete-flight`, `approve`, `revise`, `publish`, `assign-pilot`, `generate-loadsheets`, `cancel` |
| **Components** | `ScheduleStatusBar`, `TimelineView`, `ScheduleBoard`, `FlightDetailPanel` |
| **States** | Loading (skeleton), empty (no schedule), error (fetch failure) |

#### `operations.schedule.list.tsx` — Schedule List

| Aspect | Detail |
|--------|--------|
| **URL** | `/operations/schedule/list` |
| **Loader** | Fetches paginated list of schedules with status filter |
| **Action** | None (read-only list) |
| **Components** | `DataTable`, `Pagination`, `StatusBadge` |
| **States** | Loading (skeleton), empty (no schedules), error (fetch failure) |

#### `operations.schedule.$scheduleId.tsx` — Schedule Detail

| Aspect | Detail |
|--------|--------|
| **URL** | `/operations/schedule/:scheduleId` |
| **Loader** | Fetches schedule with all flights, legs, weight snapshots, pilot assignments |
| **Action** | Same intents as builder page (approve, publish, assign-pilot, generate-loadsheets, cancel, revise) |
| **Components** | `ScheduleStatusBar`, `TimelineView`, `WeightSummary`, `PilotAssignmentPanel` |
| **States** | Loading (skeleton), not found (404), error (fetch failure) |

## 7.2 Updated Routes (Existing Modified)

| Route | Change |
|-------|--------|
| `operations.flights.$flightId.tsx` | Add schedule reference, schedule breadcrumb, weight snapshot display from `weight_balance_snapshots` |
| `operations.flights.$flightId.manifest.tsx` | Accept weight snapshot data from schedule context; **fix `booking_passengers` bug** (see Section 5.5) |
| `operations.tsx` | Add "Schedule" nav item to sidebar |
| `operations._index.tsx` | Add "today's schedule" summary card with flight count and status |

## 7.3 Navigation Structure

```
Operations (/operations)
├── Dashboard (/operations)
├── Schedule (/operations/schedule)          ← NEW
│   ├── List (/operations/schedule/list)     ← NEW
│   └── Detail (/operations/schedule/:id)   ← NEW
├── Bookings (/operations/bookings)
├── Flights (/operations/flights)
│   ├── New (/operations/flights/new)
│   └── Detail (/operations/flights/:flightId)
│       └── Manifest (/operations/flights/:flightId/manifest)
└── Notifications (/operations/notifications)
```

## 7.4 Sidebar Update

Add "Schedule" to `OPERATIONS_NAV_ITEMS` in [`Sidebar.tsx`](../app/components/Sidebar.tsx):

```typescript
const OPERATIONS_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/operations" },
  { label: "Schedule", href: "/operations/schedule" },     // ← NEW
  { label: "Bookings", href: "/operations/bookings" },
  { label: "Create Flight", href: "/operations/flights/new" },
  { label: "Notifications", href: "/operations/notifications" },
];
```

## 7.5 Data Flow

```
User visits /operations/schedule
  │
  ├── Loader fetches:
  │   ├── scheduleRepository.findByDate(today)
  │   ├── flightRepository.findByScheduleId(schedule.id)
  │   ├── flightLegRepository.findByFlightId(flight.id)  [for each flight]
  │   ├── bookingRepository.findUnassignedByDate(today)
  │   ├── aircraftRepository.findAllAvailable()
  │   └── pilotRepository.findAllAvailable()
  │
  └── Renders:
      ├── ScheduleStatusBar (from schedule.status)
      ├── TimelineView (flights grouped by aircraft)
      ├── ScheduleBoard (DndContext with droppable flight columns + sortable booking cards)
      └── FlightDetailPanel (conditional, on flight select)

User drops a booking card onto a flight column (dnd-kit onDragEnd)
  │
  ├── useSubmit() fires POST with { intent: 'move-booking', bookingLegId, toFlightId }
  │
  └── Action handler:
      ├── Validates booking leg exists and target flight is in BUILDING stage
      ├── bookingLegRepository.assignFlight(bookingLegId, toFlightId)
      └── Returns updated loader data (server re-renders)

User submits form (e.g., "Approve")
  │
  └── Action handler:
      ├── Validates transition (BUILDING → APPROVED)
      ├── scheduleRepository.updateStatus(id, 'APPROVED')
      ├── scheduleRepository.updateApprovedBy(id, userId)
      └── Redirects to /operations/schedule/:id
```

## 7.6 Route Guards

| Route | Required Permission | Redirect If Missing |
|-------|-------------------|-------------------|
| `operations.schedule._index` | `operations` role | `/login` |
| `operations.schedule.list` | `operations` role | `/login` |
| `operations.schedule.$scheduleId` | `operations` role | `/login` |
| Approve action | `operations_manager` role | 403 error |
| Publish action | `operations_manager` role | 403 error |
| Cancel action | `operations_manager` role | 403 error |
