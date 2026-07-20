# Confirmation & Refined Implementation: Atomic Passenger Scheduling

## 1. Validation: Your Clarification is Exactly My Recommendation

Your clarification confirms my recommended approach. Let me explicitly align:

> *"A given schedule date has unassigned passengers, which is all passengers with a leg booked for that day."*

✅ **This is the `booking_leg_passengers` table, filtered by `booking_legs.leg_date = :date` AND `flight_leg_id IS NULL`.**

> *"So the single draggable item is the passenger on a given leg for that given day."*

✅ **Exactly. The draggable item represents ONE row from the junction table. It carries `bookingLegPassengerId` as its unique identifier.**

> *"On drop, assigns the passenger to the respective flight, for that leg."*

✅ **The drop updates ONLY that specific junction record's `flight_leg_id`.**

> *"It should therefore not interfere with other legs for the passenger, or other passengers for the leg, even if they are on the same booking."*

✅ **Correct. There is NO cascading update. Each drag is atomic.**

---

## 2. Concrete Example: Booking with Multiple Legs & Passengers

### Booking: `FIG-ABC123`
| Passenger | Leg | Date | Origin → Destination |
|-----------|-----|------|---------------------|
| John Smith | Leg 1 | 2026-07-20 | STY → PBI |
| John Smith | Leg 2 | 2026-07-22 | PBI → SLI |
| John Smith | Leg 3 | 2026-07-23 | SLI → STY |
| Mary Jones | Leg 1 | 2026-07-20 | STY → PBI |

### Unassigned Pool for 2026-07-20

```
┌─────────────────────────────────────────────────────────────┐
│ Unassigned Passengers - 2026-07-20                         │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 🔹 John Smith    STY → PBI    FIG-ABC123  70kg      │   │
│  │   bookingLegPassengerId: 101                        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 🔹 Mary Jones    STY → PBI    FIG-ABC123  65kg      │   │
│  │   bookingLegPassengerId: 102                        │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Notice:** John Smith's other legs (July 22, July 23) **do not appear** because they are on different dates. Mary Jones appears separately from John, even though they share the same booking and the same leg.

---

## 3. The Correct Unassigned Pool Query

**File:** `app/utils/repositories/booking-leg-passenger.ts`

```typescript
export interface UnassignedTravelInstance {
    id: number;                           // booking_leg_passengers.id
    bookingLegId: number;
    bookingPassengerId: number;
    bookingId: number;
    bookingReference: string;
    passengerName: string;
    passengerFirstName: string;
    passengerLastName: string;
    originCode: string;
    destinationCode: string;
    legDate: string;
    clothedWeightKg: number;
    baggageWeightKg: number;
    freightWeightKg: number;
    seatNumber: string | null;
}

export const bookingLegPassengerRepository = {
    /**
     * Find all unassigned travel instances for a specific date.
     * Each row is ONE passenger on ONE leg.
     * No grouping by booking or passenger. Each junction record stands alone.
     */
    async findUnassignedByDate(date: string): Promise<UnassignedTravelInstance[]> {
        const result = await db.query(
            `SELECT 
                blp.id,
                blp.booking_leg_id AS "bookingLegId",
                blp.booking_passenger_id AS "bookingPassengerId",
                bl.booking_id AS "bookingId",
                b.booking_reference AS "bookingReference",
                COALESCE(blp.passenger_name, bp.first_name || ' ' || bp.last_name) AS "passengerName",
                bp.first_name AS "passengerFirstName",
                bp.last_name AS "passengerLastName",
                bl.origin_code AS "originCode",
                bl.destination_code AS "destinationCode",
                bl.leg_date AS "legDate",
                COALESCE(blp.clothed_weight_kg, bp.clothed_body_weight_kg, 70) AS "clothedWeightKg",
                COALESCE(blp.baggage_weight_kg, 0) AS "baggageWeightKg",
                COALESCE(blp.freight_weight_kg, 0) AS "freightWeightKg",
                blp.seat_number AS "seatNumber"
             FROM booking_leg_passengers blp
             JOIN booking_legs bl ON bl.id = blp.booking_leg_id
             JOIN bookings b ON b.id = bl.booking_id
             JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
             WHERE blp.flight_leg_id IS NULL           -- Unassigned
               AND bl.leg_date = $1                    -- Specific date
               AND b.status NOT IN ('cancelled')       -- Ignore cancelled bookings
             ORDER BY bl.leg_date, bp.last_name, bp.first_name
            `,
            [date]
        );
        return result.rows as UnassignedTravelInstance[];
    },

    /**
     * Assign a SINGLE travel instance to a flight leg.
     * Affects only this one junction record.
     */
    async assignTravelInstanceToFlightLeg(
        bookingLegPassengerId: number,
        flightLegId: number,
        userId: number
    ): Promise<void> {
        await db.query(
            `UPDATE booking_leg_passengers 
             SET flight_leg_id = $1, updated_at = NOW()
             WHERE id = $2`,
            [flightLegId, bookingLegPassengerId]
        );

        // Optional: Audit log entry
        await db.query(
            `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [userId, 'booking_leg_passenger.assign', 'booking_leg_passenger', bookingLegPassengerId, 
             JSON.stringify({ flight_leg_id: flightLegId })]
        );
    },

    /**
     * Unassign a SINGLE travel instance from its current flight leg.
     */
    async unassignTravelInstance(bookingLegPassengerId: number): Promise<void> {
        await db.query(
            `UPDATE booking_leg_passengers 
             SET flight_leg_id = NULL, updated_at = NOW()
             WHERE id = $1`,
            [bookingLegPassengerId]
        );
    },

    /**
     * BULK ASSIGN: For UX convenience only.
     * Moves ALL passengers on a given booking leg (e.g., STY→PBI on July 20)
     * to a specific flight leg in one action.
     * This is useful for "Move all passengers from this booking leg" buttons.
     */
    async assignAllByBookingLegId(
        bookingLegId: number,
        flightLegId: number,
        userId: number
    ): Promise<number> {
        // This is a CONVENIENCE method, not the default drag behavior
        const result = await db.query(
            `UPDATE booking_leg_passengers 
             SET flight_leg_id = $1, updated_at = NOW()
             WHERE booking_leg_id = $2 AND flight_leg_id IS NULL
             RETURNING id`,
            [flightLegId, bookingLegId]
        );
        return result.rowCount || 0;
    }
};
```

---

## 4. The Draggable Item (Atomic)

**File:** `app/components/schedule/DraggableTravelInstance.tsx`

```tsx
interface DraggableTravelInstanceProps {
    instance: UnassignedTravelInstance;  // ONE junction record
}

export function DraggableTravelInstance({ instance }: DraggableTravelInstanceProps) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        // Unique ID per junction record
        id: `travel-${instance.id}`,
        data: {
            type: 'travel-instance',
            // The critical identifier: specific passenger on specific leg
            bookingLegPassengerId: instance.id,
            bookingLegId: instance.bookingLegId,
            bookingPassengerId: instance.bookingPassengerId,
            bookingId: instance.bookingId,
            passengerName: instance.passengerName,
            origin: instance.originCode,
            destination: instance.destinationCode,
            legDate: instance.legDate,
        },
    });

    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            className={`cursor-grab rounded-md border p-3 bg-white dark:bg-slate-800 shadow-sm hover:shadow-md transition-shadow ${
                isDragging ? 'opacity-50' : ''
            }`}
        >
            <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        {instance.passengerName}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        {instance.originCode} → {instance.destinationCode}
                        <span className="ml-2">
                            {new Date(instance.legDate).toLocaleDateString('en-GB')}
                        </span>
                    </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>{instance.clothedWeightKg}kg</span>
                    {instance.baggageWeightKg > 0 && (
                        <span>+{instance.baggageWeightKg}kg</span>
                    )}
                </div>
                <Badge variant="outline" className="text-[10px]">
                    {instance.bookingReference}
                </Badge>
            </div>
        </div>
    );
}
```

---

## 5. The Drop Handler (Atomic)

**File:** `app/routes/operations.schedule._index/route.tsx` (extract)

```tsx
function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // ── CASE 1: Single Travel Instance → Flight Leg ────────────────────────
    if (activeData?.type === 'travel-instance' && overData?.type === 'flight') {
        const bookingLegPassengerId = activeData.bookingLegPassengerId;
        const flightLegId = overData.flightLegId;

        // Build unique key for optimistic tracking (per junction record)
        const optimisticKey = `blp-${bookingLegPassengerId}`;

        // Optimistic update: mark this ONE record as assigned
        setOptimisticAssignments((prev) => ({
            ...prev,
            [optimisticKey]: { status: 'pending', flightLegId },
        }));

        // Submit atomic assignment
        const formData = new FormData();
        formData.set('intent', 'assign-travel-instance');
        formData.set('bookingLegPassengerId', String(bookingLegPassengerId));
        formData.set('flightLegId', String(flightLegId));
        fetcher.submit(formData, { method: 'post' });

        return;
    }

    // ── CASE 2: Travel Instance → Unassign Pool ────────────────────────────
    if (activeData?.type === 'travel-instance' && overData?.type === 'unassign-pool') {
        const bookingLegPassengerId = activeData.bookingLegPassengerId;
        const optimisticKey = `blp-${bookingLegPassengerId}`;

        setOptimisticAssignments((prev) => ({
            ...prev,
            [optimisticKey]: { status: 'pending_unassign' },
        }));

        const formData = new FormData();
        formData.set('intent', 'unassign-travel-instance');
        formData.set('bookingLegPassengerId', String(bookingLegPassengerId));
        fetcher.submit(formData, { method: 'post' });

        return;
    }

    // ── CASE 3: Flight Reordering (unchanged) ──────────────────────────────
    if (activeData?.type === 'flight' && overData?.type === 'flight') {
        // ... existing reorder logic
        return;
    }
}
```

---

## 6. Server Action (Atomic)

**File:** `app/routes/operations.schedule._index/action.server.ts`

```typescript
import { bookingLegPassengerRepository } from '~/utils/repositories/booking-leg-passenger';
import { requirePermission } from '~/utils/permissions.server';
import { Permission } from '~/utils/constants';

export async function action({ request }: ActionFunctionArgs) {
    const user = await requirePermission(request, Permission.SCHEDULE_EDIT);
    const formData = await request.formData();
    const intent = formData.get('intent')?.toString();

    // ── Assign Single Travel Instance ───────────────────────────────────────
    if (intent === 'assign-travel-instance') {
        const bookingLegPassengerId = Number(formData.get('bookingLegPassengerId'));
        const flightLegId = Number(formData.get('flightLegId'));

        if (!bookingLegPassengerId || !flightLegId) {
            return json({ error: 'Missing bookingLegPassengerId or flightLegId' }, { status: 400 });
        }

        // ONLY updates the specific junction record
        await bookingLegPassengerRepository.assignTravelInstanceToFlightLeg(
            bookingLegPassengerId,
            flightLegId,
            Number(user.id)
        );

        return json({ success: true });
    }

    // ── Unassign Single Travel Instance ──────────────────────────────────────
    if (intent === 'unassign-travel-instance') {
        const bookingLegPassengerId = Number(formData.get('bookingLegPassengerId'));

        if (!bookingLegPassengerId) {
            return json({ error: 'Missing bookingLegPassengerId' }, { status: 400 });
        }

        // ONLY updates the specific junction record
        await bookingLegPassengerRepository.unassignTravelInstance(bookingLegPassengerId);

        return json({ success: true });
    }

    // ── BULK ASSIGN (Optional: "Move all passengers from this booking leg") ──
    if (intent === 'assign-booking-leg-bulk') {
        const bookingLegId = Number(formData.get('bookingLegId'));
        const flightLegId = Number(formData.get('flightLegId'));

        // This assigns ALL passengers on that booking leg to the flight leg
        // Typically used by a "Move All" button, NOT the default drag behavior
        const count = await bookingLegPassengerRepository.assignAllByBookingLegId(
            bookingLegId,
            flightLegId,
            Number(user.id)
        );

        return json({ success: true, assignedCount: count });
    }

    return json({ error: 'Unknown intent' }, { status: 400 });
}
```

---

## 7. Summary: Why This Works

| Action | Data Affected | SQL Operation |
|--------|---------------|---------------|
| **Drag passenger onto flight** | 1 `booking_leg_passengers` row | `UPDATE ... SET flight_leg_id = X WHERE id = Y` |
| **Drag passenger to unassigned pool** | 1 `booking_leg_passengers` row | `UPDATE ... SET flight_leg_id = NULL WHERE id = Y` |
| **Reorder flight** | 0 passenger records | Reorder flights array (no DB update to passengers) |
| **Bulk assign all on booking leg** | N `booking_leg_passengers` rows | `UPDATE ... SET flight_leg_id = X WHERE booking_leg_id = Y` |

---

## 8. Visualizing the Independence

```
Booking: FIG-ABC123
┌─────────────────────────────────────────────────────────────────────────────┐
│ Passengers: John Smith, Mary Jones                                         │
│ Legs:                                                                      │
│   Leg 1: STY→PBI, 2026-07-20                                               │
│   Leg 2: PBI→SLI, 2026-07-22                                               │
│   Leg 3: SLI→STY, 2026-07-23                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│ Unassigned Pool (2026-07-20):                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  🟢 John Smith  → STY→PBI   [DRAG]    → Flight X, Leg 1            │   │
│   │      bookingLegPassengerId: 101                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  🟢 Mary Jones  → STY→PBI   [DRAG]    → Flight X, Leg 1            │   │
│   │      bookingLegPassengerId: 102                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│ Unassigned Pool (2026-07-22):                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  🟢 John Smith  → PBI→SLI   [DRAG]    → Flight Y, Leg 2            │   │
│   │      bookingLegPassengerId: 103                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│ Unassigned Pool (2026-07-23):                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  🟢 John Smith  → SLI→STY   [DRAG]    → Flight Z, Leg 3            │   │
│   │      bookingLegPassengerId: 104                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Observations:**
- John Smith appears **three times** across three different dates.
- Each appearance has a **different `bookingLegPassengerId`**.
- Dragging John on July 20 **does not affect** his July 22 or July 23 entries.
- Mary Jones appears **only once** (she has only one leg).
- Dragging Mary does not affect John.

---

## 9. Final Checklist for Implementation

- [ ] Ensure the unassigned pool query returns **one row per `booking_leg_passengers` record** for the selected date.
- [ ] Use `travel-${bookingLegPassengerId}` as the draggable `id`.
- [ ] In the drag data, include `bookingLegPassengerId` as the primary identifier.
- [ ] The drop handler submits `bookingLegPassengerId` and `flightLegId` to the action.
- [ ] The action updates **exactly one** junction record.
- [ ] The optimistic UI tracks pending states by `bookingLegPassengerId`.
- [ ] The response from the server does **not** cascade updates to other legs or passengers.
- [ ] (Optional) Add a "Move All" button for bulk assignment if needed for efficiency.