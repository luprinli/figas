import type { MetaFunction } from "@remix-run/node";
import { useLoaderData, useFetcher, useSearchParams, isRouteErrorResponse, useRouteError } from "@remix-run/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useToast } from "../../utils/toast";

import { ScheduleStatus } from "../../utils/constants";
import type { ScheduleBuildResult } from "../../utils/scheduling/types";
import type { scheduleRepository } from "../../utils/repositories/schedule";
import {
  DndContext,
  useDroppable,
  pointerWithin,
  DragOverlay,
} from "@dnd-kit/core";
import DatePicker from "../../components/DatePicker";
import PageLayout from "../../components/PageLayout";
import ScheduleStatusBar from "../../components/schedule/ScheduleStatusBar";
import ScheduleBoard from "../../components/schedule/ScheduleBoard";
import type { PilotOption, AircraftOption } from "../../components/schedule/FlightCard";
import { SortableDroppableFlightCard } from "../../components/schedule/SortableDroppableFlightCard";
import { DraftFlightPlaceholder } from "../../components/schedule/DraftFlightPlaceholder";
import { UnassignPoolPanel } from "../../components/schedule/UnassignPoolPanel";
import { DraggablePassengerRow } from "../../components/schedule/DraggablePassengerRow";
import { buildFlightCardFlight } from "../../utils/scheduling/build-flight-card-flight";
import type { FlightSummaryRow } from "../../utils/scheduling/build-flight-card-flight";
import type { FlightLegRow, PassengerManifestRow } from "../../utils/scheduling/build-stop-activities";
import type { UnassignedBookingRow } from "../../components/schedule/DraggableBookingItem";
import ScheduleSkeleton from "../../components/schedule/ScheduleSkeleton";
import AutoBuildPanel from "../../components/schedule/AutoBuildPanel";
import LoadsheetModal from "../../components/loadsheet/LoadsheetModal";
import ConfirmDialog from "../../components/ConfirmDialog";
import { TourTrigger } from "../../components/TourTrigger";
import { operationsScheduleTour } from "../../utils/tour/definitions/operations-schedule";
import { useScheduleOptimistic } from "../../hooks/use-schedule-optimistic";
import { useScheduleDrag } from "../../hooks/use-schedule-drag";
import type { DragItem } from "../../utils/scheduling/drag-state";

export const meta: MetaFunction = () => [{ title: "Schedule Builder - FIGAS" }];

// -- Types --------------------------------------------------------------------

interface LoaderData {
  schedule: Awaited<ReturnType<typeof scheduleRepository.findByDate>>;
  flights: FlightSummaryRow[];
  flightLegs: FlightLegRow[];
  passengerManifests: PassengerManifestRow[];
  unassignedBookings: UnassignedBookingRow[];
  selectedDate: string;
  isNoFlyDay: boolean;
  user: { name: string; email: string } | null;
  canApprove: boolean;
  canPublish: boolean;
  canEdit: boolean;
  canAssignPilot: boolean;
  availablePilots: PilotOption[];
  canAssignAircraft: boolean;
  availableAircraft: AircraftOption[];
  aerodromeNames: Record<string, string>;
  aerodromes: { id: number; code: string; name: string }[];
  buildResult: ScheduleBuildResult | null;
  csrfToken: string | null;
}


// -- Re-exports (extracted modules) --------------------------------------------

export { loader } from "./loader";
export { action } from "./action.server";
export type { LoaderData } from "./shared";

// -- Error Boundary ------------------------------------------------------------

export function ErrorBoundary() {
  const error = useRouteError();

  console.error("[ScheduleBuilder ErrorBoundary]", error);

  if (isRouteErrorResponse(error)) {
    return (
      <PageLayout title="Schedule Error">
        <div className="mx-auto max-w-lg py-16 text-center">
          <div className="mb-4 text-4xl">{error.status}</div>
          <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
            {error.statusText}
          </h1>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">{error.data}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </PageLayout>
    );
  }

  if (error instanceof Error) {
    return (
      <PageLayout title="Something went wrong">
        <div className="mx-auto max-w-lg py-16 text-center">
          <div className="mb-4 text-4xl">?</div>
          <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
            An unexpected error occurred
          </h1>
          <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">{error.message}</p>
          <p className="mb-6 text-xs text-slate-500 dark:text-slate-400">
            Please try again or contact support if the problem persists.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Something went wrong" userIdentity={null}>
      <div className="mx-auto max-w-lg py-16 text-center">
        <div className="mb-4 text-4xl">?</div>
        <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
          An unexpected error occurred
        </h1>
        <button
          onClick={() => window.location.reload()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Try Again
        </button>
      </div>
    </PageLayout>
  );
}

// -- Unassign Pool Wrapper (droppable for reverse drag) ----------------------

function UnassignPoolPanelWrapper({ children }: { children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: "unassign-pool",
    data: { type: "unassign-pool" },
  });
  return (
    <div
      ref={setNodeRef}
      id="unassign-pool"
      data-testid="unassign-pool"
      className={`transition-all duration-150 ${isOver ? "ring-2 ring-red-400 rounded-lg" : ""}`}
    >
      {children}
    </div>
  );
}

// -- Main Component -----------------------------------------------------------

export default function ScheduleBuilder() {
  const loaderData = useLoaderData<LoaderData>();
  const { schedule, flights: initialFlights, flightLegs: initialFlightLegs,
    passengerManifests: initialPassengerManifests, unassignedBookings: initialUnassignedBookings,
    selectedDate, isNoFlyDay: isNoFlyDayDate, canApprove, canPublish, canEdit, canAssignPilot, availablePilots,
    canAssignAircraft, availableAircraft, buildResult, csrfToken } = loaderData;
  const fetcher = useFetcher();
  const [, setSearchParams] = useSearchParams();
  const { showToast } = useToast();

  const [view, setView] = useState<"manual" | "auto">("manual");
  const [loadsheetModalFlightId, setLoadsheetModalFlightId] = useState<number | null>(null);
  const [loadsheetModalFlightNumber, setLoadsheetModalFlightNumber] = useState<string>("");
  const unassignedBookingsState = useMemo(() => initialUnassignedBookings, [initialUnassignedBookings]);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const routeSuggestionFetcher = useFetcher();
  const [isDraggingBooking, setIsDraggingBooking] = useState(false);

  // -- Optimistic state management
  const optimistic = useScheduleOptimistic(initialFlights, initialFlightLegs, initialPassengerManifests);
  const {
    flights, setFlights, flightLegsState, setFlightLegsState,
    passengerManifestsState, setPassengerManifestsState,
    optimisticAssignedIds, setOptimisticAssignedIds,
    pendingOpsRef, pendingAssignAfterCreateRef, syncFromLoader, resetAll,
  } = optimistic;
  const [activeDragItem, setActiveDragItem] = useState<DragItem | null>(null);
  const [activeOverId, setActiveOverId] = useState<string | null>(null);

  // -- Confirmation dialog state ----------------------------------------------
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: "danger" | "default";
    onConfirm: () => void;
  }>({ isOpen: false, title: "", message: "", variant: "default", onConfirm: () => {} });

  // -- Sync flights state when loader data changes (e.g., date change) --------
  // Keep useState for optimistic updates, but sync when the loader returns new data.
  const prevDateRef = useRef(selectedDate);
  useEffect(() => {
    if (prevDateRef.current !== selectedDate) {
      prevDateRef.current = selectedDate;
      syncFromLoader(initialFlights, initialFlightLegs, initialPassengerManifests);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, initialFlights, initialFlightLegs, initialPassengerManifests]);

  // -- Simulate initial loading to show skeleton ------------------------------
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 150);
    return () => clearTimeout(timer);
  }, []);

  // -- Drag handlers
  const { handleDragStart, handleDragOver, handleDragEnd, sensors } = useScheduleDrag({
    setActiveDragItem, setActiveOverId, setIsDraggingBooking,
    dragEndParams: {
      flights, setFlights, optimisticAssignedIds, setOptimisticAssignedIds,
      scheduleId: schedule?.id, selectedDate,
      fetcherSubmit: (fd, opts) => { if (csrfToken) fd.set("csrf_token", csrfToken); return fetcher.submit(fd, opts); },
      setActiveDragItem, setActiveOverId, setIsDraggingBooking,
      pendingOpsRef, pendingAssignAfterCreateRef,
    },
  });

  const routeSuggestionSubmitRef = useRef(routeSuggestionFetcher.submit);
  routeSuggestionSubmitRef.current = routeSuggestionFetcher.submit;
  const lastSuggestedJsonRef = useRef<string>("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      if (passengerManifestsState.length === 0) return;
      const passengers = passengerManifestsState.map((p) => ({
        origin_code: p.origin_code, destination_code: p.destination_code,
        clothed_weight_kg: p.body_weight_kg, baggage_weight_kg: p.baggage_weight_kg,
      }));
      const json = JSON.stringify(passengers);
      if (json === lastSuggestedJsonRef.current) return;
      lastSuggestedJsonRef.current = json;
      const formData = new FormData();
      formData.set("intent", "suggest-route");
      formData.set("passengers", json);
      routeSuggestionSubmitRef.current(formData, { method: "post" });
    }, 300);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [passengerManifestsState]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (fetcher.state === "idle" && isBuilding) setIsBuilding(false);
  }, [fetcher.state, isBuilding]);

  useEffect(() => {
    const intentLabels: Record<string, string> = {
      "approve": "Schedule approved",
      "publish": "Schedule published",
      "revise": "Schedule revised",
      "cancel": "Schedule cancelled",
      "auto-build": "Schedule built successfully",
      "accept-build": "Configuration accepted",
      "assign-booking": "Booking assigned",
      "transfer-booking": "Passenger transferred",
      "unassign-booking": "Booking unassigned",
      "create-flight-from-booking": "Flight created from booking",
      "assign-pilot": "Pilot assigned",
      "assign-aircraft": "Aircraft assigned",
      "reorder-flights": "Flight order updated",
      "reset-draft": "Schedule reset successfully",
    };

    function handleRollback(error: string) {
      const op = pendingOpsRef.current.pop();
      if (!op) return;
      setFlights(op.snapshot.flights);
      setOptimisticAssignedIds(new Set(op.snapshot.assignedIds));
      showToast(`Action reverted: ${error}`, "error");
      console.warn(`[Rollback] Reverted ${op.type} due to: ${error}`);
    }

    if (fetcher.state === "idle" && fetcher.data) {
      const data = fetcher.data as { error?: string; success?: boolean; intent?: string };
      const intent = data.intent ?? null;

      if (data.error) {
        if (pendingOpsRef.current.length > 0) {
          handleRollback(data.error);
        } else {
          showToast(data.error, "error");
        }
      } else if (data.success) {
        if (pendingOpsRef.current.length > 0) {
          pendingOpsRef.current.pop();
        }
        // On assign-booking success, update flight legs and passenger manifests
        // directly from the response data so the flight card reflects new data
        // immediately without a page refresh.
        if (intent === "assign-booking") {
          const assignData = data as {
            success: boolean;
            updatedFlightLegs?: FlightLegRow[];
            updatedPassengerManifests?: PassengerManifestRow[];
          };
          if (assignData.updatedFlightLegs) {
            const affectedFlightId = assignData.updatedFlightLegs[0]?.flight_id;
            if (affectedFlightId) {
              setFlightLegsState((prev) => {
                // Replace all legs for the affected flight with the updated legs
                const otherLegs = prev.filter((l) => l.flight_id !== affectedFlightId);
                return [...otherLegs, ...assignData.updatedFlightLegs!];
              });
            }
          }
          if (assignData.updatedPassengerManifests) {
            // Merge: keep manifests for other flights, replace for the affected flight.
            // Since PassengerManifestRow doesn't have flight_id, we need to identify
            // which booking_leg_ids belong to the affected flight. We do this by
            // tracking which booking_leg_ids were in the old state for the affected flight.
            // A simpler approach: since the server returns ALL manifests for the affected
            // flight, we remove any manifests whose booking_leg_id matches any of the
            // updated manifests' booking_leg_ids, then add the updated ones.
            const updatedBookingLegIds = new Set(
              assignData.updatedPassengerManifests.map((m) => m.booking_leg_id)
            );
            setPassengerManifestsState((prev) => {
              // Remove old manifests for the affected booking legs
              const otherManifests = prev.filter(
                (m) => !updatedBookingLegIds.has(m.booking_leg_id)
              );
              return [...otherManifests, ...assignData.updatedPassengerManifests!];
            });
          }
        }
        // On transfer-booking success, update target flight legs/manifests
        // and remove the source flight if it was deleted.
        if (intent === "transfer-booking") {
          const transferData = data as {
            success: boolean;
            targetFlightId?: number;
            sourceFlightId?: number;
            deletedFlightId?: number | null;
            updatedFlightLegs?: FlightLegRow[];
            updatedPassengerManifests?: PassengerManifestRow[];
          };
          if (transferData.updatedFlightLegs && transferData.targetFlightId) {
            const targetId = transferData.targetFlightId;
            setFlightLegsState((prev) => {
              const otherLegs = prev.filter((l) => l.flight_id !== targetId);
              return [...otherLegs, ...transferData.updatedFlightLegs!];
            });
          }
          if (transferData.updatedPassengerManifests) {
            const updatedBookingLegIds = new Set(
              transferData.updatedPassengerManifests.map((m) => m.booking_leg_id)
            );
            setPassengerManifestsState((prev) => {
              const other = prev.filter((m) => !updatedBookingLegIds.has(m.booking_leg_id));
              return [...other, ...transferData.updatedPassengerManifests!];
            });
          }
          if (transferData.deletedFlightId) {
            setFlights((prev) =>
              prev.filter((f) => f.id !== transferData.deletedFlightId)
            );
            setFlightLegsState((prev) =>
              prev.filter((l) => l.flight_id !== transferData.deletedFlightId)
            );
          }
        }
        // On assign-pilot or assign-aircraft success, update the flight in local
        // state directly from the response data so the flight card reflects the
        // newly assigned pilot/aircraft immediately without a page refresh.
        if (intent === "assign-pilot" || intent === "assign-aircraft") {
          const assignData = data as {
            success: boolean;
            updatedFlight?: FlightSummaryRow | null;
          };
          if (assignData.updatedFlight) {
            setFlights((prev) =>
              prev.map((f) => (f.id === assignData.updatedFlight!.id ? assignData.updatedFlight! : f))
            );
          }
        }
        // On unassign-booking success, the flight may have been deleted.
        // Remove the flight from local state and clear its legs/manifests.
        if (intent === "unassign-booking") {
          const unassignData = data as { success: boolean; deletedFlightId?: number | null };
          if (unassignData.deletedFlightId) {
            setFlights((prev) => prev.filter((f) => f.id !== unassignData.deletedFlightId));
            setFlightLegsState((prev) => prev.filter((l) => l.flight_id !== unassignData.deletedFlightId));
            setPassengerManifestsState((prev) => prev.filter(() => {
              // Keep manifests whose booking_leg_id is not linked to the deleted flight's legs
              return true; // Safe reset: the loader will refresh on next fetch
            }));
          }
        }
        // On remove-flight success, delete the flight from local state
        if (intent === "remove-flight") {
          const removeData = data as { success: boolean; deletedFlightId: number };
          if (removeData.deletedFlightId) {
            setFlights((prev) => prev.filter((f) => f.id !== removeData.deletedFlightId));
            setFlightLegsState((prev) => prev.filter((l) => l.flight_id !== removeData.deletedFlightId));
          }
        }
        // On create-flight-from-booking success, replace the optimistic flight
        // (which has a temporary negative ID) with the real flight data from the
        // server.  Then process any bookings that were dropped on the optimistic
        // card while the request was in flight.
        if (intent === "create-flight-from-booking") {
          const createData = data as {
            success: boolean;
            flightId: number;
            scheduleId: number;
            flight: FlightSummaryRow | null;
            flightLegs?: FlightLegRow[];
            passengerManifests?: PassengerManifestRow[];
          };
          if (createData.flight) {
            setFlights((prev) => {
              // Replace the optimistic flight (id < 0) with the real one.
              // If no optimistic flight is found (e.g. page revalidated first),
              // just append.
              const optimisticIdx = prev.findIndex((f) => f.id < 0);
              if (optimisticIdx >= 0) {
                const newFlights = [...prev];
                newFlights[optimisticIdx] = createData.flight!;
                return newFlights;
              }
              return [...prev, createData.flight!];
            });
          }
          if (createData.flightLegs && createData.flightLegs.length > 0) {
            setFlightLegsState((prev) => [...prev, ...createData.flightLegs!]);
          }
          if (createData.passengerManifests && createData.passengerManifests.length > 0) {
            setPassengerManifestsState((prev) => [...prev, ...createData.passengerManifests!]);
          }
          // Process any bookings that were dropped on the optimistic flight
          // card while the create-flight request was in flight.
          const buffered = pendingAssignAfterCreateRef.current.splice(0);
          for (const b of buffered) {
            const assignFormData = new FormData();
            assignFormData.set("intent", "assign-booking");
            assignFormData.set("bookingLegId", String(b.bookingLegId));
            assignFormData.set("flightId", String(createData.flightId));
            if (csrfToken) assignFormData.set("csrf_token", csrfToken);
            fetcher.submit(assignFormData, { method: "post" });
          }
        }
        // On accept-build success, reload the page to show the newly created flights.
        if (intent === "accept-build") {
          window.location.reload();
        }
        // On reset-draft, clear local flights state since all flights were deleted
        if (intent === "reset-draft") {
          resetAll();
        }
        if (intent === "cancel") {
          resetAll();
        }
        if (intent && intentLabels[intent]) {
          showToast(intentLabels[intent], "success");
        } else {
          showToast("Action completed successfully", "success");
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher, showToast]);
  // -- Action submission helpers ----------------------------------------------
  function submitAction(intent: string, extraFields?: Record<string, string>) {
    const formData = new FormData();
    formData.set("intent", intent);
    if (csrfToken) formData.set("csrf_token", csrfToken);
    if (schedule) formData.set("scheduleId", String(schedule.id));
    if (extraFields) {
      for (const [key, value] of Object.entries(extraFields)) {
        formData.set(key, value);
      }
    }
    fetcher.submit(formData, { method: "post" });
  }

  function handleRemoveFlightClick(flightId: number) {
    setConfirmDialog({
      isOpen: true,
      title: "Remove Flight",
      message: "Remove this flight? All passengers will be returned to the unassigned pool.",
      variant: "danger",
      onConfirm: () => {
        const formData = new FormData();
        formData.set("intent", "remove-flight");
        formData.set("flightId", String(flightId));
        if (csrfToken) formData.set("csrf_token", csrfToken);
        fetcher.submit(formData, { method: "post" });
      },
    });
  }

  function handleConfirmRevise() {
    setConfirmDialog({
      isOpen: true,
      title: "Revise Schedule",
      message: "Revising will move the schedule back to BUILDING status so you can make changes. Are you sure?",
      variant: "default",
      onConfirm: () => submitAction("revise"),
    });
  }

  function handleConfirmCancel() {
    setConfirmDialog({
      isOpen: true,
      title: "Cancel Schedule",
      message: "Are you sure you want to cancel this schedule? This action cannot be undone.",
      variant: "danger",
      onConfirm: () => submitAction("cancel", { cancellationReason: "" }),
    });
  }

  function handleConfirmResetDraft() {
    setConfirmDialog({
      isOpen: true,
      title: "Reset Draft Schedule",
      message: "Reset this schedule? This will remove all flights and assignments.",
      variant: "danger",
      onConfirm: () => {
        const formData = new FormData();
        formData.set("intent", "reset-draft");
        formData.set("scheduleId", String(schedule?.id ?? 0));
        if (csrfToken) formData.set("csrf_token", csrfToken);
        fetcher.submit(formData, { method: "post" });
      },
    });
  }

  const canApproveAction = schedule && schedule.status === ScheduleStatus.BUILDING && canApprove;
  const canPublishAction = schedule && schedule.status === ScheduleStatus.APPROVED && canPublish;
  const canReviseAction = schedule && (schedule.status === ScheduleStatus.APPROVED || schedule.status === ScheduleStatus.PUBLISHED) && canEdit;
  const canCancelAction = schedule && schedule.status !== ScheduleStatus.CANCELLED && schedule.status !== ScheduleStatus.COMPLETED && canEdit;
  // Show skeleton during initial load
  if (isLoading) {
    return (
      <PageLayout title="Schedule Builder">
        <ScheduleSkeleton />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Schedule Builder"
      headerActions={
        <TourTrigger config={operationsScheduleTour} autoStart />
      }
    >
      {isNoFlyDayDate ? (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/30 px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="mt-0.5 flex-shrink-0 text-amber-500" absoluteStrokeWidth />
            <div>
              <p className="text-sm font-medium text-amber-800">No-fly day</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                {selectedDate} is a scheduled no-fly day. No flights or bookings can be scheduled for this date.
              </p>
            </div>
          </div>
        </div>
      ) : schedule ? (
        <div className="mb-6">
          <ScheduleStatusBar
            status={schedule.status} scheduleDate={selectedDate}
            flightCount={flights.length}
            assignedLegCount={flights.reduce((sum, f) => sum + flightLegsState.filter((l) => l.flight_id === f.id).length, 0)}
          />
        </div>
      ) : (
        <div className="mb-6"><p className="text-sm text-slate-500 dark:text-slate-400">No schedule built for {selectedDate}.</p></div>
      )}

      {/* Build result display */}
      {buildResult && (
        <div className="bg-green-50 dark:bg-green-900/30 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded p-3 mb-4">
          <h3 className="text-sm font-semibold text-green-800 dark:text-green-400 dark:text-green-400">Build Complete</h3>
          <p className="text-sm text-green-700 dark:text-green-400 dark:text-green-400">
            {buildResult.routes.length} flights created, {buildResult.pilotAssignments.length} bookings assigned
          </p>
          {buildResult.warnings.length > 0 && (
            <ul className="mt-2 text-sm text-amber-700">
              {buildResult.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between rounded-lg bg-white dark:bg-slate-800 px-4 py-2 shadow-sm dark:shadow-slate-900/20 ring-1 ring-slate-200 dark:ring-slate-700">
        <div className="flex items-center gap-2" data-tour="schedule-date">
          <button
            onClick={() => {
              const d = new Date(selectedDate);
              d.setDate(d.getDate() - 1);
              setSearchParams({ date: d.toISOString().split("T")[0] });
            }}
            className="px-2 py-1 text-sm border rounded dark:border-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 dark:hover:bg-slate-700/50"
          >
            ? Previous
          </button>
          <DatePicker
            value={selectedDate}
            onChange={(date) => setSearchParams({ date })}
            label="Schedule Date"
          />
          <button
            onClick={() => {
              const d = new Date(selectedDate);
              d.setDate(d.getDate() + 1);
              setSearchParams({ date: d.toISOString().split("T")[0] });
            }}
            className="px-2 py-1 text-sm border rounded dark:border-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 dark:hover:bg-slate-700/50"
          >
            Next ?
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setView("manual")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${view === "manual" ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"}`}>
            Manual Build
          </button>
          <button onClick={() => setView("auto")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${view === "auto" ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"}`}>
            Auto-Build
          </button>
        </div>
        <div className="flex items-center gap-2" data-tour="schedule-actions">
          {canEdit && schedule && (schedule.status === "draft" || schedule.status === "building") && (
            <button
              onClick={handleConfirmResetDraft}
              className="px-3 py-1.5 text-sm bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded hover:bg-red-200 dark:hover:bg-red-800/50"
            >
              Reset Draft
            </button>
          )}
          {canApproveAction && (
            <button onClick={() => submitAction("approve")}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
              Approve
            </button>
          )}
          {canPublishAction && (
            <button onClick={() => submitAction("publish")}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
              Publish
            </button>
          )}
          {canReviseAction && (
            <button onClick={handleConfirmRevise}
              className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600">
              Revise
            </button>
          )}
          {canCancelAction && (
            <button onClick={handleConfirmCancel}
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700">
              Cancel Schedule
            </button>
          )}
          {schedule && (schedule.status === "published" || schedule.status === "approved") && (
            <button onClick={() => submitAction("publish-schedule")}
              className="rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700">
              {schedule.status === "published" ? "Publish to Public" : "Publish & Print"}
            </button>
          )}
          {(() => {
            const pubToken = (fetcher.data as Record<string, unknown> | undefined)?.token as string | undefined;
            if (!pubToken) return null;
            return (
              <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300 ml-2">
                <span className="text-slate-500 dark:text-slate-400">Public:</span>
                <code className="rounded bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-[11px]">/schedule/{pubToken}</code>
                <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/schedule/${pubToken}`)}
                  className="rounded px-1.5 py-0.5 text-[10px] text-cyan-600 hover:bg-cyan-50">Copy</button>
              </div>
            );
          })()}
        </div>
      </div>

      {view === "auto" && (
        <AutoBuildPanel
          selectedDate={selectedDate}
          canAssignPilot={canAssignPilot}
          availablePilots={availablePilots}
          canAssignAircraft={canAssignAircraft}
          availableAircraft={availableAircraft}
          onAccept={() => {
            window.location.href = window.location.pathname + `?date=${selectedDate}`;
          }}
        />
      )}

      {view === "manual" && (
        <>
          {(!schedule || schedule.status === "draft" || schedule.status === "building") && (
            <AutoBuildPanel
              selectedDate={selectedDate}
              canAssignPilot={canAssignPilot}
              availablePilots={availablePilots}
              canAssignAircraft={canAssignAircraft}
              availableAircraft={availableAircraft}
              onAccept={() => {
                window.location.href = window.location.pathname + `?date=${selectedDate}`;
              }}
            />
          )}

          <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-6">
            <div className="flex-1">
              {isBuilding ? (
                <div className="flex items-center justify-center py-16">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                    <p className="text-sm text-slate-500 dark:text-slate-400">Building schedule...</p>
                  </div>
                </div>
              ) : flights.length === 0 ? (
                <>
                  {!schedule && (
                    <div className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                      No schedule exists for this date. Drag a booking onto the draft flight area below to create one automatically.
                    </div>
                  )}
                  <DraftFlightPlaceholder
                    isDraggingBooking={isDraggingBooking}
                    activeOverId={activeOverId}
                  />
                </>
              ) : (
                <>
                  <div className="lg:col-span-2">
                    <ScheduleBoard
                      flights={flights.map((f) => buildFlightCardFlight(f, flightLegsState, passengerManifestsState, canAssignPilot, availablePilots, schedule?.id ?? 0, canAssignAircraft, availableAircraft))}
                      maxTakeoffWeightKg={2994}
                      renderFlightCard={(flightCard) => {
                        // Find the original FlightSummaryRow for this flight to pass to SortableDroppableFlightCard
                        const flightSummary = flights.find((f) => f.id === flightCard.id) ?? flights[0];
                        return (
                          <SortableDroppableFlightCard
                            key={flightCard.id}
                            flight={flightSummary}
                            flightLegs={flightLegsState}
                            passengerManifests={passengerManifestsState}
                            canAssignPilot={canAssignPilot}
                            availablePilots={availablePilots}
                            scheduleId={schedule?.id ?? 0}
                            canAssignAircraft={canAssignAircraft}
                            availableAircraft={availableAircraft}
                            csrfToken={csrfToken}
                            activeOverId={activeOverId}
                            onRemoveFlight={handleRemoveFlightClick}
                            onOpenLoadsheet={(flightId: number) => {
                              const f = flights.find((fl) => fl.id === flightId);
                              setLoadsheetModalFlightId(flightId);
                              setLoadsheetModalFlightNumber(f?.flight_number ?? `Flight #${flightId}`);
                            }}
                            onFlightUpdated={(updated: Record<string, unknown>) => {
                              setFlights((prev) =>
                                prev.map((f) => {
                                  if (f.id !== Number(updated.id)) return f;
                                  const updatedRow = updated as unknown as FlightSummaryRow;
                                  return { ...updatedRow, flight_ordinal: f.flight_ordinal };
                                })
                              );
                            }}
                            renderPassengerRow={({ passenger, aerodromeCode, flightId }) => (
                              <DraggablePassengerRow
                                passenger={passenger}
                                aerodromeCode={aerodromeCode}
                                flightId={flightId}
                              />
                            )}
                          />
                        );
                      }}
                    />
                  </div>
                  <div className="mt-6">
                    <DraftFlightPlaceholder
                      isDraggingBooking={isDraggingBooking}
                      activeOverId={activeOverId}
                    />
                  </div>
                </>
              )}
            </div>
            <UnassignPoolPanelWrapper>
              <UnassignPoolPanel unassignedBookings={unassignedBookingsState} visibleCount={5} isNoFlyDay={isNoFlyDayDate} />
            </UnassignPoolPanelWrapper>
          </div>
          {/* DragOverlay — renders a full-opacity copy of the dragged item in a portal on document.body */}
          {createPortal(
            <DragOverlay
              dropAnimation={null}
              aria-label="Dragged item overlay"
            >
              {activeDragItem?.type === "flight" && activeDragItem.data ? (
                <div className="opacity-90 shadow-xl dark:shadow-slate-900/50 rounded-lg border border-blue-300 bg-white dark:bg-slate-800 p-4">
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {activeDragItem.data.flight_number}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {activeDragItem.data.origin_code} ? {activeDragItem.data.destination_code}
                  </div>
                </div>
              ) : activeDragItem?.type === "booking" && activeDragItem.data ? (
                <div className="opacity-90 shadow-xl dark:shadow-slate-900/50 rounded-md border border-blue-300 bg-white dark:bg-slate-800 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800 dark:text-slate-100">
                      {activeDragItem.data.booking_reference}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      {activeDragItem.data.passenger_count} pax
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {activeDragItem.data.origin_code} ? {activeDragItem.data.destination_code}
                  </div>
                </div>
              ) : activeDragItem?.type === "passenger" && activeDragItem.data ? (
                <div className="opacity-90 shadow-xl dark:shadow-slate-900/50 rounded-md border border-red-300 bg-white dark:bg-slate-800 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <X size={12} className="flex-shrink-0 text-red-400" absoluteStrokeWidth />
                    <span className="text-sm text-slate-700 dark:text-slate-200">
                      {activeDragItem.data.passengerName}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                    Drag to unassign pool to remove from flight
                  </div>
                </div>
              ) : null}
            </DragOverlay>,
            document.body
          )}
        </DndContext>
        </>
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
        confirmLabel="Confirm"
        cancelLabel="Cancel"
      />

      <LoadsheetModal
        flightId={loadsheetModalFlightId ?? 0}
        flightNumber={loadsheetModalFlightNumber}
        isOpen={loadsheetModalFlightId !== null}
        onClose={() => setLoadsheetModalFlightId(null)}
        canPerformInFlight={canAssignPilot || canAssignAircraft}
      />
    </PageLayout>
  );
}