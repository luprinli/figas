import type {
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import type { FlightSummaryRow } from "./build-flight-card-flight";
import type { UnassignedBookingRow } from "../../components/schedule/DraggableBookingItem";
import type { FlightCardFlight } from "../../components/schedule/FlightCard";
import type { DragItem, PendingOp, PendingAssignEntry } from "./drag-state";

/** Dispatch function signature for submitting fetcher form data */
type FetcherSubmit = (formData: FormData, options: { method: "get" | "post" | "put" | "delete" | "patch" }) => void;

// ── Handler factories ──────────────────────────────────────────────────────────

export function createDragStartHandler(
  setIsDraggingBooking: (v: boolean) => void,
  setActiveDragItem: (item: DragItem | null) => void
) {
  return (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === "booking") {
      setIsDraggingBooking(true);
      setActiveDragItem({ type: "booking", data: data.booking });
    } else if (data?.type === "flight") {
      setActiveDragItem({ type: "flight", data: data.flight });
    } else if (data?.type === "passenger") {
      setActiveDragItem({ type: "passenger", data: data.passenger });
    }
  };
}

export function createDragOverHandler(
  setActiveOverId: (id: string | null) => void
) {
  return (event: DragOverEvent) => {
    setActiveOverId(event.over?.id?.toString() ?? null);
  };
}

// ── Drop helpers (called from drag-end logic) ──────────────────────────────────

export function handleDropOnFlight(
  bookingLegId: number,
  flightId: number,
  bookingLegPassengerId: number | undefined,
  flights: FlightSummaryRow[],
  optimisticAssignedIds: Set<number>,
  pendingOpsRef: { current: PendingOp[] },
  setOptimisticAssignedIds: (updater: Set<number> | ((prev: Set<number>) => Set<number>)) => void,
  fetcherSubmit: FetcherSubmit
) {
  pendingOpsRef.current.push({
    type: "assign",
    snapshot: { flights: [...flights], assignedIds: new Set(optimisticAssignedIds) },
    timestamp: Date.now(),
  });
  setOptimisticAssignedIds((prev) => new Set(prev).add(bookingLegPassengerId ?? bookingLegId));
  const formData = new FormData();
  formData.set("intent", "assign-booking");
  formData.set("bookingLegId", String(bookingLegId));
  formData.set("flightId", String(flightId));
  if (bookingLegPassengerId != null) {
    formData.set("bookingLegPassengerId", String(bookingLegPassengerId));
  }
  fetcherSubmit(formData, { method: "post" });
}

export function handleReorderFlight(
  flightId: number,
  newIndex: number,
  flights: FlightSummaryRow[],
  setFlights: (updater: FlightSummaryRow[] | ((prev: FlightSummaryRow[]) => FlightSummaryRow[])) => void,
  optimisticAssignedIds: Set<number>,
  pendingOpsRef: { current: PendingOp[] },
  fetcherSubmit: FetcherSubmit,
  scheduleId: number | undefined | null,
  selectedDate: string
) {
  const oldIndex = flights.findIndex((f) => f.id === flightId);
  if (oldIndex === -1) return;
  const reordered = [...flights];
  const [moved] = reordered.splice(oldIndex, 1);
  reordered.splice(newIndex, 0, moved);
  pendingOpsRef.current.push({
    type: "reorder",
    snapshot: { flights: [...flights], assignedIds: new Set(optimisticAssignedIds) },
    timestamp: Date.now(),
  });
  setFlights(reordered);
  const formData = new FormData();
  formData.set("intent", "reorder-flights");
  formData.set("date", selectedDate);
  if (scheduleId) formData.set("scheduleId", String(scheduleId));
  const ids = reordered.map((f) => f.id);
  formData.set("flightIds", JSON.stringify(ids));
  fetcherSubmit(formData, { method: "post" });
}

// ── Main drag end handler ─────────────────────────────────────────────────────

export interface CreateDragEndParams {
  flights: FlightSummaryRow[];
  setFlights: (updater: FlightSummaryRow[] | ((prev: FlightSummaryRow[]) => FlightSummaryRow[])) => void;
  optimisticAssignedIds: Set<number>;
  setOptimisticAssignedIds: (updater: Set<number> | ((prev: Set<number>) => Set<number>)) => void;
  scheduleId: number | undefined | null;
  selectedDate: string;
  fetcherSubmit: FetcherSubmit;
  setActiveDragItem: (item: DragItem | null) => void;
  setActiveOverId: (id: string | null) => void;
  setIsDraggingBooking: (v: boolean) => void;
  pendingOpsRef: { current: PendingOp[] };
  pendingAssignAfterCreateRef: { current: PendingAssignEntry[] };
}

export function createDragEndHandler(p: CreateDragEndParams) {
  const {
    flights, setFlights, optimisticAssignedIds, setOptimisticAssignedIds,
    scheduleId, selectedDate, fetcherSubmit,
    setActiveDragItem, setActiveOverId, setIsDraggingBooking,
    pendingOpsRef, pendingAssignAfterCreateRef,
  } = p;

  return (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragItem(null);
    setActiveOverId(null);
    setIsDraggingBooking(false);

    if (!over || active.id === over.id) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // Determine the flight ID from the over target
    const overFlightId = overData?.type === "flight"
      ? ((overData.flight as FlightCardFlight)?.id ?? (typeof over.id === "number" ? (over.id as number) : null))
      : activeData?.type === "flight" && typeof over.id === "number"
        ? (over.id as number)
        : null;

    // Handle flight reordering
    if (overFlightId != null && activeData?.type === "flight") {
      const flightId = active.id as number;
      const newIndex = flights.findIndex((f) => f.id === overFlightId);
      if (newIndex !== -1) {
        handleReorderFlight(flightId, newIndex, flights, setFlights, optimisticAssignedIds, pendingOpsRef, fetcherSubmit, scheduleId, selectedDate);
      }
      return;
    }

    // Handle booking → flight assignment
    if (activeData?.type === "booking" && overFlightId != null) {
      const booking = activeData.booking as UnassignedBookingRow;
      if (overFlightId < 0) {
        pendingAssignAfterCreateRef.current.push({ bookingLegId: booking.booking_leg_id, bookingLegPassengerId: booking.id });
        setOptimisticAssignedIds((prev) => new Set(prev).add(booking.id));
        return;
      }
      handleDropOnFlight(booking.booking_leg_id, overFlightId, booking.id, flights, optimisticAssignedIds, pendingOpsRef, setOptimisticAssignedIds, fetcherSubmit);
      return;
    }

    // Handle booking → draft flight placeholder (create flight from booking)
    if (activeData?.type === "booking" && overData?.type === "draft-flight") {
      const booking = activeData.booking as UnassignedBookingRow;
      const tempId = -Date.now();
      pendingOpsRef.current.push({
        type: "create-flight",
        snapshot: { flights: [...flights], assignedIds: new Set(optimisticAssignedIds) },
        timestamp: Date.now(),
        tempFlightId: tempId,
      });
      setOptimisticAssignedIds((prev) => new Set(prev).add(booking.id));
      const optimisticFlight: FlightSummaryRow = {
        id: tempId,
        flight_number: "Draft...",
        origin_code: booking.origin_code,
        destination_code: booking.destination_code,
        departure_time: null,
        arrival_time: null,
        status: "draft",
        aircraft_registration: null,
        aircraft_type: null,
        seat_count: 0,
        pilot_name: null,
        pilot_status: null,
        sort_order: flights.length,
        duration_minutes: null,
        check_in_time: null,
        operational_notes: null,
        flight_ordinal: null,
        max_takeoff_weight_kg: null,
        max_landing_weight_kg: null,
        basic_empty_weight_kg: null,
        payload_kg: null,
        fuel_kg: null,
        crew_weight_kg: null,
      };
      setFlights((prev) => [...prev, optimisticFlight]);
      const formData = new FormData();
      formData.set("intent", "create-flight-from-booking");
      formData.set("bookingLegIds", JSON.stringify([booking.booking_leg_id]));
      formData.set("bookingLegPassengerIds", JSON.stringify([booking.id]));
      formData.set("scheduleId", String(scheduleId ?? 0));
      formData.set("originCode", booking.origin_code);
      formData.set("destinationCode", booking.destination_code);
      formData.set("date", selectedDate);
      fetcherSubmit(formData, { method: "post" });
      return;
    }

    // Handle passenger → flight (direct transfer)
    if (activeData?.type === "passenger" && overFlightId != null) {
      const passenger = activeData.passenger as { bookingLegId: number; bookingLegPassengerId: number; passengerId: number; passengerName: string };
      const formData = new FormData();
      formData.set("intent", "transfer-booking");
      formData.set("bookingLegPassengerId", String(passenger.bookingLegPassengerId));
      formData.set("targetFlightId", String(overFlightId));
      fetcherSubmit(formData, { method: "post" });
      return;
    }

    // Handle passenger → unassign pool
    if (activeData?.type === "passenger" && overData?.type === "unassign-pool") {
      const passenger = activeData.passenger as { bookingLegId: number; bookingLegPassengerId: number; passengerId: number };
      const formData = new FormData();
      formData.set("intent", "unassign-booking");
      formData.set("bookingLegId", String(passenger.bookingLegId));
      formData.set("bookingLegPassengerId", String(passenger.bookingLegPassengerId));
      fetcherSubmit(formData, { method: "post" });
    }
  };
}
