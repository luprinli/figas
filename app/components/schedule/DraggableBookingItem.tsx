import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

export interface UnassignedBookingRow {
  id: number;
  booking_leg_id: number;
  booking_reference: string;
  passenger_name: string;
  origin_code: string;
  destination_code: string;
  passenger_count: number;
}

export function DraggableBookingItem({ booking }: { booking: UnassignedBookingRow }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `booking-${booking.id}`,
    data: { type: "booking", booking },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform), zIndex: 50, touchAction: "none" } as React.CSSProperties
    : undefined;

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="border-2 border-dashed border-blue-400 dark:border-blue-500 rounded-lg bg-blue-50 dark:bg-blue-900/30 p-3"
        role="button"
        aria-grabbed={true}
        aria-label={`Dragging booking ${booking.booking_reference}`}
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      id={`booking-${booking.id}`}
      style={style}
      {...listeners}
      {...attributes}
      role="button"
      tabIndex={0}
      data-testid="booking-item"
      aria-grabbed={false}
      aria-label={`Passenger ${booking.passenger_name}, booking ${booking.booking_reference}, ${booking.origin_code} to ${booking.destination_code}. Press spacebar or enter to start dragging.`}
      className="group cursor-grab active:cursor-grabbing rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs shadow-sm dark:shadow-slate-900/20 transition hover:border-blue-300 dark:hover:border-blue-500 hover:shadow-md"
    >
      <div className="font-medium text-slate-800 dark:text-slate-100 truncate">{booking.passenger_name}</div>
      <div className="mt-0.5 text-slate-500 dark:text-slate-400">
        {booking.origin_code} {'\u2192'} {booking.destination_code}
      </div>
      <div className="flex items-center justify-between mt-0.5">
        <span className="text-[10px] text-slate-400 dark:text-slate-500">{booking.booking_reference} (L{booking.booking_leg_id})</span>
        <span className="text-[10px] text-slate-500 dark:text-slate-400">{booking.passenger_count} pax</span>
      </div>
    </div>
  );
}
