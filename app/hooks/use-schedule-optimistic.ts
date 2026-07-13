import { useState, useRef, useCallback } from "react";
import type { FlightSummaryRow } from "../utils/scheduling/build-flight-card-flight";
import type { FlightLegRow, PassengerManifestRow } from "../utils/scheduling/build-stop-activities";
import type { DragSnapshot, PendingOp, PendingAssignEntry } from "../utils/scheduling/drag-state";

export function useScheduleOptimistic(
  initialFlights: FlightSummaryRow[],
  initialFlightLegs: FlightLegRow[],
  initialPassengerManifests: PassengerManifestRow[]
) {
  const [flights, setFlights] = useState<FlightSummaryRow[]>(initialFlights);
  const [flightLegsState, setFlightLegsState] = useState<FlightLegRow[]>(initialFlightLegs);
  const [passengerManifestsState, setPassengerManifestsState] = useState<PassengerManifestRow[]>(initialPassengerManifests);
  const [optimisticAssignedIds, setOptimisticAssignedIds] = useState<Set<number>>(new Set());
  const pendingOpsRef = useRef<PendingOp[]>([]);
  const pendingAssignAfterCreateRef = useRef<PendingAssignEntry[]>([]);

  const captureSnapshot = useCallback((): DragSnapshot => ({
    flights: [...flights],
    assignedIds: new Set(optimisticAssignedIds),
  }), [flights, optimisticAssignedIds]);

  const syncFromLoader = useCallback((
    newFlights: FlightSummaryRow[],
    newFlightLegs: FlightLegRow[],
    newManifests: PassengerManifestRow[]
  ) => {
    setFlights(newFlights);
    setFlightLegsState(newFlightLegs);
    setPassengerManifestsState(newManifests);
    setOptimisticAssignedIds(new Set());
  }, []);

  const resetAll = useCallback(() => {
    setFlights([]);
    setFlightLegsState([]);
    setPassengerManifestsState([]);
    setOptimisticAssignedIds(new Set());
  }, []);

  return {
    flights, setFlights,
    flightLegsState, setFlightLegsState,
    passengerManifestsState, setPassengerManifestsState,
    optimisticAssignedIds, setOptimisticAssignedIds,
    pendingOpsRef, pendingAssignAfterCreateRef,
    captureSnapshot, syncFromLoader, resetAll,
  };
}
