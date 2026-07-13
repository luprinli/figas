import { useDraggable } from "@dnd-kit/core";
import { X } from "lucide-react";
import { formatCompactName } from "../../utils/format-compact-name";

export interface DraggablePassengerData {
  bookingLegId: number;
  bookingLegPassengerId: number;
  passengerId: number;
  passengerName: string;
}

interface StopPassenger {
  id: number;
  booking_leg_id: number;
  compact_name: string;
  body_weight_kg: number;
  baggage_weight_kg: number;
}

export function DraggablePassengerRow({
  passenger,
  flightId,
}: {
  passenger: StopPassenger;
  aerodromeCode: string;
  flightId: number;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `passenger-${passenger.id}-${flightId}`,
    data: {
      type: "passenger",
      passenger: {
        bookingLegId: passenger.booking_leg_id,
        bookingLegPassengerId: passenger.id,
        passengerId: passenger.id,
        passengerName: formatCompactName(passenger.compact_name),
      },
    },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined;

  if (isDragging) {
    return (
      <span
        ref={setNodeRef}
        style={style}
        className="inline-block rounded border-2 border-dashed border-red-400 dark:border-red-700 bg-red-50 dark:bg-red-900/30 px-1 text-sm opacity-50"
        role="button"
        aria-grabbed={true}
        aria-label={`Dragging passenger ${formatCompactName(passenger.compact_name)}`}
      >
        {formatCompactName(passenger.compact_name)}
      </span>
    );
  }

  return (
    <span
      ref={setNodeRef}
      id={`passenger-${passenger.id}-${flightId}`}
      style={style}
      {...listeners}
      {...attributes}
      role="button"
      tabIndex={0}
      data-testid="passenger-row"
      aria-grabbed={false}
      aria-label={`Passenger ${formatCompactName(passenger.compact_name)} on flight ${flightId}. Press spacebar or enter to start dragging to unassign.`}
      className="group inline-flex cursor-grab items-center gap-1 rounded px-1 text-sm text-slate-600 dark:text-slate-300 hover:bg-red-50 dark:bg-red-900/30 dark:hover:bg-red-900/30 dark:bg-red-900/30 hover:text-red-700 dark:text-red-400 dark:text-red-400 active:cursor-grabbing"
      title="Drag to unassign pool to remove from flight"
    >
      {formatCompactName(passenger.compact_name)}
      <X
        size={12}
        className="flex-shrink-0 text-slate-300 dark:text-slate-500 opacity-0 transition group-hover:text-red-400 group-hover:opacity-100"
        strokeWidth={1.5}
        absoluteStrokeWidth
      />
    </span>
  );
}
