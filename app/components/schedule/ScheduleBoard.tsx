import type { ReactNode } from "react";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import FlightCard from "./FlightCard";
import type { FlightCardFlight } from "./FlightCard";

export interface ScheduleBoardProps {
  flights: FlightCardFlight[];
  maxTakeoffWeightKg: number;
  className?: string;
  children?: ReactNode;
  /** Optional custom render function for flight cards. When provided, overrides the default FlightCard rendering. */
  renderFlightCard?: (flight: FlightCardFlight) => ReactNode;
  onOpenLoadsheet?: (flightId: number) => void;
}

/**
 * ScheduleBoard displays a sortable list of flights for a daily schedule.
 * Uses @dnd-kit SortableContext for drag-and-drop reordering.
 * The DndContext is provided by the parent component to avoid nested DndContext issues.
 * Form submission happens on drop via the parent's onDragEnd handler.
 */
export default function ScheduleBoard({
  flights,
  maxTakeoffWeightKg,
  className,
  children,
  renderFlightCard,
  onOpenLoadsheet,
}: ScheduleBoardProps) {
  return (
    <div className={className} data-testid="schedule-board" data-tour="schedule-board">
      <SortableContext
        items={flights.map((f) => f.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-3">
          {flights.map((flight) =>
            renderFlightCard ? (
              <SortableFlightCardWrapper key={flight.id} flightId={flight.id}>
                {renderFlightCard(flight)}
              </SortableFlightCardWrapper>
            ) : (
              <SortableFlightCard
                key={flight.id}
                flight={flight}
                maxTakeoffWeightKg={maxTakeoffWeightKg}
                onOpenLoadsheet={onOpenLoadsheet}
              />
            )
          )}
        </div>
      </SortableContext>
      {children}
    </div>
  );
}

// ── Sortable wrappers ────────────────────────────────────────────────────────

interface SortableFlightCardProps {
  flight: FlightCardFlight;
  maxTakeoffWeightKg: number;
  onOpenLoadsheet?: (flightId: number) => void;
}

function SortableFlightCard({
  flight,
  maxTakeoffWeightKg,
  onOpenLoadsheet,
}: SortableFlightCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: flight.id,
    data: { type: "flight", flight },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="border-2 border-dashed border-blue-400 dark:border-blue-600 rounded-lg bg-blue-50 dark:bg-blue-900/30 min-h-[100px]"
        role="button"
        aria-grabbed={true}
        aria-label={`Dragging flight ${flight.flight_number}`}
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-grabbed={false}
      aria-label={`Flight ${flight.flight_number}, ${flight.origin_code} to ${flight.destination_code}. Press spacebar or enter to start dragging to reorder.`}
      aria-describedby={`sortable-flight-desc-${flight.id}`}
    >
      <FlightCard flight={flight} maxTakeoffWeightKg={maxTakeoffWeightKg} onOpenLoadsheet={onOpenLoadsheet} />
    </div>
  );
}

/**
 * SortableFlightCardWrapper wraps arbitrary children in a sortable container.
 * Used when renderFlightCard is provided to ScheduleBoard.
 */
function SortableFlightCardWrapper({
  flightId,
  children,
}: {
  flightId: number;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: flightId,
    data: { type: "flight" },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="border-2 border-dashed border-blue-400 dark:border-blue-600 rounded-lg bg-blue-50 dark:bg-blue-900/30 min-h-[100px]"
        role="button"
        aria-grabbed={true}
        aria-label="Dragging flight"
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-grabbed={false}
      aria-label={`Flight card ${flightId}. Press spacebar or enter to start dragging to reorder.`}
      aria-describedby={`sortable-flight-desc-${flightId}`}
    >
      {children}
    </div>
  );
}
