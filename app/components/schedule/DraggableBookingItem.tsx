import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

export interface UnassignedBookingRow {
  id: number;
  booking_leg_id: number;
  booking_id: number;
  booking_reference: string;
  passenger_name: string;
  passenger_first_name: string;
  passenger_last_name: string;
  origin_code: string;
  destination_code: string;
  leg_date: string;
  leg_sequence: number;
  clothed_weight_kg: number;
  baggage_weight_kg: number;
  freight_weight_kg: number;
  seat_number: string | null;
}

export function DraggableBookingItem({ booking }: { booking: UnassignedBookingRow }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `booking-${booking.id}`,
    data: {
      type: "booking",
      booking,
      bookingLegPassengerId: booking.id,
      bookingLegId: booking.booking_leg_id,
      bookingId: booking.booking_id,
      passengerName: booking.passenger_name,
      origin: booking.origin_code,
      destination: booking.destination_code,
      legDate: booking.leg_date,
    },
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
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
            {booking.passenger_name}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {booking.origin_code} {'\u2192'} {booking.destination_code}
            <span className="ml-2">
              {new Date(booking.leg_date).toLocaleDateString('en-GB')}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>{booking.clothed_weight_kg}kg</span>
          {booking.baggage_weight_kg > 0 && (
            <span>+{booking.baggage_weight_kg}kg</span>
          )}
        </div>
        <span className="rounded bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">
          {booking.booking_reference}
        </span>
      </div>
    </div>
  );
}
