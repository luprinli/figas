import { useDraggable } from "@dnd-kit/core";

export interface UnassignedBookingRow {
  id: number;
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
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined;

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="border-2 border-dashed border-blue-400 dark:border-blue-600 dark:border-blue-500 rounded-lg bg-blue-50 dark:bg-blue-900/30 dark:bg-blue-900/30/30 dark:bg-blue-900/30 p-3"
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
      aria-label={`Booking ${booking.booking_reference}, ${booking.origin_code} to ${booking.destination_code}, ${booking.passenger_count} passenger(s). Press spacebar or enter to start dragging.`}
      aria-describedby={`booking-desc-${booking.id}`}
      className="group cursor-grab active:cursor-grabbing rounded-md border border-slate-200 dark:border-slate-700 dark:border-slate-700 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-xs shadow-sm dark:shadow-slate-900/20 transition hover:border-blue-300 dark:border-blue-700 dark:hover:border-blue-500 hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-slate-800 dark:text-slate-100 dark:text-slate-100">{booking.booking_reference}</span>
        <span className="text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-400 dark:text-slate-500">{booking.passenger_count} pax</span>
      </div>
      <div className="mt-0.5 text-slate-500 dark:text-slate-400 dark:text-slate-400 dark:text-slate-500">
        {booking.origin_code} &rarr; {booking.destination_code}
      </div>
      <div className="truncate text-slate-500 dark:text-slate-400 dark:text-slate-400 dark:text-slate-500">{booking.passenger_name}</div>
    </div>
  );
}
