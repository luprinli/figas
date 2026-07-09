import { useMemo, type ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import FlightCard from "./FlightCard";
import ValidationBanner from "./ValidationBanner";
import type { ValidationIssue } from "./ValidationBanner";
import type { PilotOption, AircraftOption } from "./FlightCard";
import { buildFlightCardFlight } from "../../utils/scheduling/build-flight-card-flight";
import type { FlightSummaryRow } from "../../utils/scheduling/build-flight-card-flight";
import type { FlightLegRow, PassengerManifestRow } from "../../utils/scheduling/build-stop-activities";

export function SortableDroppableFlightCard({
  flight, flightLegs, passengerManifests, canAssignPilot, availablePilots, scheduleId,
  canAssignAircraft = false, availableAircraft = [],
  activeOverId, renderPassengerRow, onRemoveFlight, onFlightUpdated, onOpenLoadsheet,
}: {
  flight: FlightSummaryRow;
  flightLegs: FlightLegRow[];
  passengerManifests: PassengerManifestRow[];
  canAssignPilot: boolean;
  availablePilots: PilotOption[];
  scheduleId: number;
  canAssignAircraft?: boolean;
  availableAircraft?: AircraftOption[];
  activeOverId?: string | null;
  renderPassengerRow?: (params: {
    passenger: { id: number; booking_leg_id: number; compact_name: string; body_weight_kg: number; baggage_weight_kg: number };
    aerodromeCode: string;
    flightId: number;
  }) => ReactNode;
  onRemoveFlight?: (flightId: number) => void;
  onFlightUpdated?: (updatedFlight: Record<string, unknown>) => void;
  onOpenLoadsheet?: (flightId: number) => void;
}) {
  const flightCardFlight = buildFlightCardFlight(flight, flightLegs, passengerManifests, canAssignPilot, availablePilots, scheduleId, canAssignAircraft, availableAircraft);
  const { setNodeRef, isOver } = useDroppable({
    id: `flight-${flight.id}`,
    data: { type: "flight", flight: flightCardFlight },
  });

  const validationIssues = useMemo<ValidationIssue[]>(() => {
    const issues: ValidationIssue[] = [];

    if (flightCardFlight.seat_count != null && flightCardFlight.stop_manifests.length > 0) {
      let maxOnBoard = 0;
      let onBoard = 0;
      for (const sm of flightCardFlight.stop_manifests) {
        onBoard = onBoard - sm.arriving_passengers.length + sm.departing_passengers.length;
        if (onBoard > maxOnBoard) maxOnBoard = onBoard;
      }
      if (maxOnBoard > flightCardFlight.seat_count) {
        issues.push({ type: "error", message: `Passenger count (${maxOnBoard} on busiest leg) exceeds seat capacity (${flightCardFlight.seat_count})` });
      }
    }

    return issues;
  }, [flightCardFlight]);

  const isActiveOver = activeOverId === `flight-${flight.id}`;

  return (
    <div
      ref={setNodeRef}
      id={`flight-${flight.id}`}
      role="button"
      tabIndex={0}
      data-testid="flight-card"
      aria-label={`Flight ${flightCardFlight.flight_number}, ${flightCardFlight.origin_code} to ${flightCardFlight.destination_code}. Drop zone for bookings and passengers.`}
      className={`relative transition-all duration-150 ${
        isOver ? "ring-2 ring-blue-400 rounded-lg"
        : isActiveOver ? "ring-2 ring-blue-500 ring-offset-2 rounded-lg" : ""
      }`}
    >
      {validationIssues.length > 0 && <ValidationBanner issues={validationIssues} />}
      <FlightCard flight={flightCardFlight} maxTakeoffWeightKg={flight.max_takeoff_weight_kg ?? 2994} linkable={false} renderPassengerRow={renderPassengerRow} onRemoveFlight={onRemoveFlight} onFlightUpdated={onFlightUpdated} onOpenLoadsheet={onOpenLoadsheet} />
    </div>
  );
}
