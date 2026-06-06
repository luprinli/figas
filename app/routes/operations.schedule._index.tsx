import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, Link, useSearchParams, isRouteErrorResponse, useRouteError } from "@remix-run/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useToast } from "../utils/toast";
import { requirePermission, hasPermission } from "../utils/permissions.server";
import { db } from "../utils/db.server";
import { scheduleRepository } from "../utils/repositories/schedule";
import { ScheduleStatus } from "../utils/constants";
import { todayISO } from "../utils/dates";

/**
 * Recursively convert BigInt values to Number in a value or object tree.
 * Prisma's $queryRawUnsafe returns BigInt for integer columns, which cannot
 * be serialized by JSON.stringify (used by Remix's json() helper).
 */
function convertBigInts<T>(value: T): T {
  if (typeof value === "bigint") {
    return Number(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map(convertBigInts) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      obj[key] = convertBigInts(obj[key]);
    }
    return obj as T;
  }
  return value;
}
import { handleAutoBuild, handleApprove, handleRevise, handlePublish, handleCancel, handleCreateFlight, handleCreateFlightFromBooking, handleUnassignBooking, handleAssignBooking, handleTransferBooking, handleAssignPilot, handleAssignAircraft, handleReorderFlights, handleResetDraft, handleRemoveFlight } from "../utils/schedule-handlers.server";
import { isNoFlyDay } from "../utils/services/no-fly.service";
import type { ScheduleBuildResult } from "../utils/scheduling/types";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  pointerWithin,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import DatePicker from "../components/DatePicker";
import PageLayout from "../components/PageLayout";
import ScheduleStatusBar from "../components/schedule/ScheduleStatusBar";
import ScheduleBoard from "../components/schedule/ScheduleBoard";
import type { FlightCardFlight, PilotOption, AircraftOption } from "../components/schedule/FlightCard";
import { SortableDroppableFlightCard } from "../components/schedule/SortableDroppableFlightCard";
import { DraftFlightPlaceholder } from "../components/schedule/DraftFlightPlaceholder";
import { UnassignPoolPanel } from "../components/schedule/UnassignPoolPanel";
import { DraggablePassengerRow } from "../components/schedule/DraggablePassengerRow";
import { buildFlightCardFlight } from "../utils/scheduling/build-flight-card-flight";
import type { FlightSummaryRow } from "../utils/scheduling/build-flight-card-flight";
import type { FlightLegRow, PassengerManifestRow } from "../utils/scheduling/build-stop-activities";
import type { UnassignedBookingRow } from "../components/schedule/DraggableBookingItem";
import ScheduleSkeleton from "../components/schedule/ScheduleSkeleton";
import AutoBuildPanel from "../components/schedule/AutoBuildPanel";
import LoadsheetModal from "../components/loadsheet/LoadsheetModal";
import ConfirmDialog from "../components/ConfirmDialog";

export const meta: MetaFunction = () => [{ title: "Schedule Builder - FIGAS" }];

// ── Types ────────────────────────────────────────────────────────────────────

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
}

// ── Loader ───────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requirePermission(request, "schedule:create");
  const url = new URL(request.url);
  const selectedDate = url.searchParams.get("date") ?? todayISO();
  const schedule = await scheduleRepository.findByDate(selectedDate);
  const noFlyDay = await isNoFlyDay(selectedDate);


  let flights: FlightSummaryRow[] = [];
  let flightLegs: FlightLegRow[] = [];
  let passengerManifests: PassengerManifestRow[] = [];
  let unassignedBookings: UnassignedBookingRow[] = [];

  if (schedule) {
    // NOTE: The actual `flights` table does NOT have sort_order, check_in_time,
    // duration_minutes, max_takeoff_weight_kg, max_landing_weight_kg,
    // basic_empty_weight_kg, payload_kg, fuel_kg, or crew_weight_kg columns.
    // These are set to NULL in the query result and handled as optional in the UI.
    const flightsResult = await db.query(
      `SELECT f.id, f.flight_number, f.departure_time, f.arrival_time, f.status,
              NULL::int AS sort_order,
              NULL::int AS duration_minutes,
              NULL::timestamp AS check_in_time,
              NULL::numeric AS max_takeoff_weight_kg,
              NULL::numeric AS max_landing_weight_kg,
              NULL::numeric AS basic_empty_weight_kg,
              NULL::numeric AS payload_kg,
              NULL::numeric AS fuel_kg,
              NULL::numeric AS crew_weight_kg,
              COALESCE(f.origin_code, ao.code) AS origin_code,
              COALESCE(f.destination_code, ad.code) AS destination_code,
              a.registration AS aircraft_registration, a.type AS aircraft_type, a.seat_count,
              p.name AS pilot_name, pa.status AS pilot_status,
              ROW_NUMBER() OVER (ORDER BY f.id, f.departure_time) AS flight_ordinal
       FROM flights f
       LEFT JOIN aerodromes ao ON ao.id = f.origin_aerodrome_id
       LEFT JOIN aerodromes ad ON ad.id = f.destination_aerodrome_id
       LEFT JOIN aircraft a ON a.id = f.aircraft_id
       LEFT JOIN pilots p ON p.id = f.pilot_id
       LEFT JOIN pilot_assignments pa ON pa.flight_id = f.id AND pa.status = 'confirmed'
       WHERE f.schedule_id = $1
       ORDER BY f.id, f.departure_time`,
      [schedule.id]
    );
    flights = convertBigInts(flightsResult.rows) as unknown as FlightSummaryRow[];

    const flightIds = flights.map((f) => f.id);
    if (flightIds.length > 0) {
      // flight_legs uses origin_code/destination_code as varchar directly (not FK)
      const legsResult = await db.query(
        `SELECT fl.id, fl.flight_id, fl.leg_number AS leg_sequence, fl.etd AS departure_time, fl.eta AS arrival_time, fl.status,
                fl.origin_code, fl.destination_code, fl.distance_nm, fl.heading
         FROM flight_legs fl
         WHERE fl.flight_id = ANY($1::int[])
         ORDER BY fl.flight_id, fl.leg_number`,
        [flightIds]
      );
      flightLegs = convertBigInts(legsResult.rows) as unknown as FlightLegRow[];

      // booking_leg_passengers does NOT have passenger_name or body_weight_kg directly.
      // We join through booking_passengers to get first_name/last_name and clothed_weight_kg.
      // booking_legs uses origin_code/destination_code as varchar (not FK).
      const manifestsResult = await db.query(
        `SELECT blp.id, blp.booking_leg_id,
                CONCAT(bp.first_name, ' ', bp.last_name) AS passenger_name,
                blp.clothed_weight_kg AS body_weight_kg,
                blp.baggage_weight_kg, blp.freight_weight_kg,
                bl.origin_code, bl.destination_code
         FROM booking_leg_passengers blp
         JOIN booking_legs bl ON bl.id = blp.booking_leg_id
         JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
         WHERE bl.flight_id = ANY($1::int[])
         ORDER BY blp.id`,
        [flightIds]
      );
      passengerManifests = convertBigInts(manifestsResult.rows) as unknown as PassengerManifestRow[];
    }

  }

  // Unassigned bookings are independent of schedule existence.
  // Booking legs with flight_id = NULL exist regardless of whether a schedule
  // has been created for this date.
  // passengers table does NOT exist. Use booking_passengers + users for passenger name.
  // booking_legs uses origin_code/destination_code as varchar (not FK).
  // bookings uses user_id (not primary_passenger_id).
  const unassignedResult = await db.query(
    `SELECT bl.id, b.booking_reference,
            COALESCE(u.name, CONCAT(bp.first_name, ' ', bp.last_name)) AS passenger_name,
            bl.origin_code, bl.destination_code,
            COUNT(blp.id)::int AS passenger_count
     FROM booking_legs bl
     JOIN bookings b ON b.id = bl.booking_id
     LEFT JOIN users u ON u.id = b.user_id
     LEFT JOIN booking_passengers bp ON bp.booking_id = b.id
     LEFT JOIN booking_leg_passengers blp ON blp.booking_leg_id = bl.id
     WHERE bl.flight_id IS NULL AND bl.leg_date = $1 AND b.status NOT IN ('cancelled', 'completed')
     GROUP BY bl.id, b.booking_reference, u.name, bp.first_name, bp.last_name, bl.origin_code, bl.destination_code
     ORDER BY b.booking_reference`,
    [selectedDate]
  );
  unassignedBookings = convertBigInts(unassignedResult.rows) as unknown as UnassignedBookingRow[];

  const [canApprove, canPublish, canEdit, canAssignPilot, canAssignAircraft] = await Promise.all([
    hasPermission(Number(user.id), "schedule:approve"),
    hasPermission(Number(user.id), "schedule:publish"),
    hasPermission(Number(user.id), "schedule:edit"),
    hasPermission(Number(user.id), "schedule:assign-pilot"),
    hasPermission(Number(user.id), "schedule:edit"), // Same permission as edit for now
  ]);

  // Load available pilots for the pilot assignment dropdown
  const pilots = await db.pilots.findMany({
    where: { is_active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const availablePilots: PilotOption[] = pilots
    .filter((p) => p.name !== null)
    .map((p) => ({ id: p.id, name: p.name! }));

  // Load available aircraft for the aircraft assignment dropdown
  const aircraft = await db.aircraft.findMany({
    where: { is_active: true },
    select: { id: true, registration: true, type: true, seat_count: true },
    orderBy: { registration: "asc" },
  });
  const availableAircraft: AircraftOption[] = aircraft.map((a) => ({
    id: a.id,
    registration: a.registration,
    type: a.type ?? "",
    seat_count: a.seat_count,
  }));

  // Load aerodrome names for display
  const aerodromesResult = await db.query(
    `SELECT id, code, name FROM aerodromes WHERE is_active = true`
  );
  const aerodromeRows = aerodromesResult.rows as { id: number; code: string; name: string }[];
  const aerodromeNames: Record<string, string> = {};
  const aerodromes: { id: number; code: string; name: string }[] = [];
  for (const a of aerodromeRows) {
    aerodromeNames[a.code] = a.name;
    aerodromes.push({ id: a.id, code: a.code, name: a.name });
  }


  return json<LoaderData>({
    schedule, flights, flightLegs, passengerManifests, unassignedBookings, selectedDate,
    isNoFlyDay: noFlyDay,
    user: { name: user.name, email: user.email },
    canApprove, canPublish, canEdit, canAssignPilot,
    availablePilots,
    canAssignAircraft,
    availableAircraft,
    aerodromeNames,
    aerodromes,
    buildResult: null,
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// ── Action ───────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const user = await requirePermission(request, "schedule:create");
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();
  const date = formData.get("date")?.toString() ?? todayISO();

  // Helper to check a specific permission and return 403 if denied
  async function requireActionPermission(permission: string): Promise<boolean> {
    const allowed = await hasPermission(Number(user.id), permission);
    if (!allowed) return false;
    return true;
  }

  switch (intent) {
    case "auto-build": {
      if (!(await requireActionPermission("schedule:edit"))) {
        return json({ error: "You do not have permission to build schedules" }, { status: 403 });
      }
      const result = await handleAutoBuild(date, Number(user.id));
      if (result.error) return json(result, { status: (result as { status?: number }).status ?? 400 });
      return json({ ...result, buildResult: (result as { result?: ScheduleBuildResult }).result ?? null });
    }
    case "approve": {
      if (!(await requireActionPermission("schedule:approve"))) {
        return json({ error: "You do not have permission to approve schedules" }, { status: 403 });
      }
      const scheduleId = Number(formData.get("scheduleId"));
      const result = await handleApprove(scheduleId, Number(user.id));
      if (result.error) return json(result, { status: (result as { status?: number }).status ?? 400 });
      return json(result);
    }
    case "revise": {
      if (!(await requireActionPermission("schedule:edit"))) {
        return json({ error: "You do not have permission to revise schedules" }, { status: 403 });
      }
      const scheduleId = Number(formData.get("scheduleId"));
      const result = await handleRevise(scheduleId, Number(user.id));
      if (result.error) return json(result, { status: (result as { status?: number }).status ?? 400 });
      return json(result);
    }
    case "publish": {
      if (!(await requireActionPermission("schedule:publish"))) {
        return json({ error: "You do not have permission to publish schedules" }, { status: 403 });
      }
      const scheduleId = Number(formData.get("scheduleId"));
      const result = await handlePublish(scheduleId, Number(user.id));
      if (result.error) return json(result, { status: (result as { status?: number }).status ?? 400 });
      return json(result);
    }
    case "publish-schedule": {
      if (!(await requireActionPermission("schedule:publish"))) {
        return json({ error: "You do not have permission to publish schedules" }, { status: 403 });
      }
      const scheduleId = Number(formData.get("scheduleId"));
      const { publishSchedule } = await import("../utils/publishing/publish.server");
      const result = await publishSchedule(scheduleId, Number(user.id));
      if (result.error) return json({ error: result.error }, { status: 400 });
      return json(result);
    }
    case "cancel": {
      if (!(await requireActionPermission("schedule:edit"))) {
        return json({ error: "You do not have permission to cancel schedules" }, { status: 403 });
      }
      const scheduleId = Number(formData.get("scheduleId"));
      const cancellationReason = formData.get("cancellationReason")?.toString() ?? "";
      const result = await handleCancel(scheduleId, Number(user.id), cancellationReason);
      if (result.error) return json(result, { status: (result as { status?: number }).status ?? 400 });
      return json(result);
    }
    case "reorder-flights": {
      if (!(await requireActionPermission("schedule:edit"))) {
        return json({ error: "You do not have permission to reorder flights" }, { status: 403 });
      }
      const scheduleId = Number(formData.get("scheduleId"));
      const flightIdsRaw = formData.get("flightIds")?.toString();
      if (!flightIdsRaw) return json({ error: "No flight IDs provided" }, { status: 400 });
      const flightIds: number[] = JSON.parse(flightIdsRaw);
      const result = await handleReorderFlights(scheduleId, flightIds);
      if (result.error) return json(result, { status: (result as { status?: number }).status ?? 500 });
      return json(result);
    }
    case "create-flight": {
      if (!(await requireActionPermission("schedule:edit"))) {
        return json({ error: "You do not have permission to create flights" }, { status: 403 });
      }
      const scheduleId = Number(formData.get("scheduleId"));
      const originAerodromeId = Number(formData.get("originAerodromeId"));
      const destinationAerodromeId = Number(formData.get("destinationAerodromeId"));
      const aircraftId = formData.get("aircraftId") ? Number(formData.get("aircraftId")) : null;
      const result = await handleCreateFlight(
        scheduleId, originAerodromeId, destinationAerodromeId, aircraftId, Number(user.id)
      );
      if (result.error) return json(result, { status: (result as { status?: number }).status ?? 400 });
      return json(result);
    }
    case "assign-booking": {
      if (!(await requireActionPermission("schedule:edit"))) {
        return json({ error: "You do not have permission to assign bookings" }, { status: 403 });
      }
      const bookingLegId = Number(formData.get("bookingLegId"));
      const flightId = Number(formData.get("flightId"));
      const result = await handleAssignBooking(bookingLegId, flightId);
      if (result.error) return json(result, { status: (result as { status?: number }).status ?? 400 });
      return json(result);
    }
    case "transfer-booking": {
      if (!(await requireActionPermission("schedule:edit"))) {
        return json({ error: "You do not have permission to transfer bookings" }, { status: 403 });
      }
      const bookingLegPassengerId = Number(formData.get("bookingLegPassengerId"));
      const targetFlightId = Number(formData.get("targetFlightId"));
      const result = await handleTransferBooking(bookingLegPassengerId, targetFlightId);
      if (result.error) return json(result, { status: (result as { status?: number }).status ?? 400 });
      return json(result);
    }
    case "create-flight-from-booking": {
      if (!(await requireActionPermission("schedule:edit"))) {
        return json({ error: "You do not have permission to create flights" }, { status: 403 });
      }
      const scheduleId = Number(formData.get("scheduleId"));
      const bookingLegIdsRaw = formData.get("bookingLegIds")?.toString();
      if (!bookingLegIdsRaw) return json({ error: "No booking leg IDs provided" }, { status: 400 });
      const bookingLegIds: number[] = JSON.parse(bookingLegIdsRaw);
      const result = await handleCreateFlightFromBooking(scheduleId, bookingLegIds, {
        date: formData.get("date")?.toString(),
        createdBy: Number(user.id),
      });
      if (result.error) return json(result, { status: (result as { status?: number }).status ?? 400 });
      // Convert BigInt values from raw SQL queries before JSON serialization.
      // db.query() delegates to $queryRawUnsafe which returns BigInt for
      // integer columns; JSON.stringify (used by Remix's json() helper)
      // cannot serialize BigInt and would throw a TypeError, preventing
      // the frontend from receiving the created flight data.
      return json(convertBigInts(result));
    }
    case "unassign-booking": {
      if (!(await requireActionPermission("schedule:edit"))) {
        return json({ error: "You do not have permission to unassign bookings" }, { status: 403 });
      }
      const bookingLegId = Number(formData.get("bookingLegId"));
      const result = await handleUnassignBooking(bookingLegId);
      if (result.error) return json(result, { status: (result as { status?: number }).status ?? 400 });
      return json(result);
    }
    case "remove-flight": {
      if (!(await requireActionPermission("schedule:edit"))) {
        return json({ error: "You do not have permission to remove flights" }, { status: 403 });
      }
      const flightId = Number(formData.get("flightId"));
      const result = await handleRemoveFlight(flightId);
      if (result.error) return json(result, { status: (result as { status?: number }).status ?? 400 });
      return json(convertBigInts(result));
    }
    case "assign-pilot": {
      if (!(await requireActionPermission("schedule:assign-pilot"))) {
        return json({ error: "You do not have permission to assign pilots" }, { status: 403 });
      }
      const flightId = Number(formData.get("flightId"));
      const pilotId = Number(formData.get("pilotId"));
      const scheduleId = Number(formData.get("scheduleId"));
      const result = await handleAssignPilot(flightId, pilotId, scheduleId, Number(user.id));
      if (result.error) return json(result, { status: (result as { status?: number }).status ?? 400 });
      return json(result);
    }
    case "assign-aircraft": {
      if (!(await requireActionPermission("schedule:edit"))) {
        return json({ error: "You do not have permission to assign aircraft" }, { status: 403 });
      }
      const flightId = Number(formData.get("flightId"));
      const aircraftId = Number(formData.get("aircraftId"));
      const scheduleId = Number(formData.get("scheduleId"));
      const result = await handleAssignAircraft(flightId, aircraftId, scheduleId, Number(user.id));
      if (result.error) return json(result, { status: (result as { status?: number }).status ?? 400 });
      return json(result);
    }
    case "suggest-route": {
      const passengersRaw = formData.get("passengers")?.toString();
      if (!passengersRaw) return json({ error: "No passenger data provided" }, { status: 400 });
      const passengers = JSON.parse(passengersRaw);
      const { suggestRoute } = await import("../utils/scheduling/suggest-route.server");
      const result = await suggestRoute(passengers);
      return json(result);
    }
    case "reset-draft": {
      if (!(await requireActionPermission("schedule:edit"))) {
        return json({ error: "You do not have permission to reset schedules" }, { status: 403 });
      }
      const scheduleId = Number(formData.get("scheduleId"));
      const result = await handleResetDraft(scheduleId);
      if (result.error) return json(result, { status: (result as { status?: number }).status ?? 400 });
      return json(result);
    }
    default:
      return json({ error: `Unknown intent: ${intent}` }, { status: 400 });
  }
}

// ── Error Boundary ────────────────────────────────────────────────────────────

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
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">{error.data}</p>
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
          <div className="mb-4 text-4xl">⚠</div>
          <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
            An unexpected error occurred
          </h1>
          <p className="mb-2 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">{error.message}</p>
          <p className="mb-6 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
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
        <div className="mb-4 text-4xl">⚠</div>
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

// ── Unassign Pool Wrapper (droppable for reverse drag) ──────────────────────

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

// ── Main Component ───────────────────────────────────────────────────────────

export default function ScheduleBuilder() {
  const loaderData = useLoaderData<LoaderData>();
  const { schedule, flights: initialFlights, flightLegs: initialFlightLegs,
    passengerManifests: initialPassengerManifests, unassignedBookings: initialUnassignedBookings,
    selectedDate, isNoFlyDay: isNoFlyDayDate, user, canApprove, canPublish, canEdit, canAssignPilot, availablePilots,
    canAssignAircraft, availableAircraft, aerodromes, buildResult } = loaderData;
  const fetcher = useFetcher();
  const [, setSearchParams] = useSearchParams();
  const { showToast } = useToast();

  const [view, setView] = useState<"manual" | "auto">("manual");
  const [loadsheetModalFlightId, setLoadsheetModalFlightId] = useState<number | null>(null);
  const [loadsheetModalFlightNumber, setLoadsheetModalFlightNumber] = useState<string>("");
  const [flights, setFlights] = useState<FlightSummaryRow[]>(initialFlights);

  // Flight legs and passenger manifests used for rendering flight cards.
  // These are updated directly from the fetcher response on assign-booking/unassign-booking success
  // so the flight card reflects new data immediately without a page refresh.
  const [flightLegsState, setFlightLegsState] = useState<FlightLegRow[]>(initialFlightLegs);
  const [passengerManifestsState, setPassengerManifestsState] = useState<PassengerManifestRow[]>(initialPassengerManifests);
  const unassignedBookingsState = useMemo(() => initialUnassignedBookings, [initialUnassignedBookings]);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [routeSuggestion, setRouteSuggestion] = useState<{
    suggested_legs: { leg_sequence: number; origin_code: string; destination_code: string; distance_nm: number | null }[];
    total_distance_nm: number;
    stop_count: number;
    aircraft_recommendation: string | null;
    weight_warnings: string[];
  } | null>(null);
  const routeSuggestionFetcher = useFetcher();
  const [optimisticAssignedIds, setOptimisticAssignedIds] = useState<Set<number>>(new Set());
  const [isDraggingBooking, setIsDraggingBooking] = useState(false);
  const [activeDragItem, setActiveDragItem] = useState<{
    type: "flight" | "booking" | "passenger";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any;
  } | null>(null);
  const [activeOverId, setActiveOverId] = useState<string | null>(null);

  // ── Add Flight modal state ─────────────────────────────────────────────────
  const [showAddFlightModal, setShowAddFlightModal] = useState(false);

  // ── Confirmation dialog state ──────────────────────────────────────────────
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: "danger" | "default";
    onConfirm: () => void;
  }>({ isOpen: false, title: "", message: "", variant: "default", onConfirm: () => {} });

  // ── Sync flights state when loader data changes (e.g., date change) ────────
  // Keep useState for optimistic updates, but sync when the loader returns new data.
  const prevDateRef = useRef(selectedDate);
  useEffect(() => {
    if (prevDateRef.current !== selectedDate) {
      prevDateRef.current = selectedDate;
      setFlights(initialFlights);
      setFlightLegsState(initialFlightLegs);
      setPassengerManifestsState(initialPassengerManifests);
      setOptimisticAssignedIds(new Set());
    }
  }, [selectedDate, initialFlights, initialFlightLegs, initialPassengerManifests]);

  // ── Simulate initial loading to show skeleton ──────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 150);
    return () => clearTimeout(timer);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // ── Optimistic Update Rollback ────────────────────────────────────────────────
  interface PendingOp {
    type: "assign" | "unassign" | "reorder" | "create-flight";
    snapshot: { flights: FlightSummaryRow[]; assignedIds: Set<number> };
    timestamp: number;
    /** Temporary negative flight ID used for the optimistic flight card, so it
     * can be replaced with the real flight on success. */
    tempFlightId?: number;
  }
  const pendingOpsRef = useRef<PendingOp[]>([]);
  /** Buffer for booking→optimistic-flight drops that arrive while a
   * create-flight-from-booking request is in flight.  These are submitted
   * as assign-booking requests once the real flight ID is known. */
  const pendingAssignAfterCreateRef = useRef<{ bookingLegId: number }[]>([]);

  function handleDropOnFlight(bookingLegId: number, flightId: number) {
    // Save pre-mutation snapshot
    pendingOpsRef.current.push({
      type: "assign",
      snapshot: { flights: [...flights], assignedIds: new Set(optimisticAssignedIds) },
      timestamp: Date.now(),
    });
    // Optimistic update — immediately mark booking as assigned (hides from unassigned pool)
    setOptimisticAssignedIds((prev) => new Set(prev).add(bookingLegId));
    // Set the intent so the fetcher response handler can update flightLegsState/passengerManifestsState
    lastIntentRef.current = "assign-booking";
    const formData = new FormData();
    formData.set("intent", "assign-booking");
    formData.set("bookingLegId", String(bookingLegId));
    formData.set("flightId", String(flightId));
    fetcher.submit(formData, { method: "post" });
  }

  function handleReorderFlight(flightId: number, newIndex: number) {
    const oldIndex = flights.findIndex((f) => f.id === flightId);
    if (oldIndex === -1) return;
    const reordered = [...flights];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    // Save pre-mutation snapshot
    pendingOpsRef.current.push({
      type: "reorder",
      snapshot: { flights: [...flights], assignedIds: new Set(optimisticAssignedIds) },
      timestamp: Date.now(),
    });
    // Optimistic update
    setFlights(reordered);
    const formData = new FormData();
    formData.set("intent", "reorder-flights");
    formData.set("scheduleId", String(schedule?.id ?? 0));
    formData.set("flightIds", JSON.stringify(reordered.map((f) => f.id)));
    fetcher.submit(formData, { method: "post" });
  }

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      if (passengerManifestsState.length === 0) { setRouteSuggestion(null); return; }
      const passengers = passengerManifestsState.map((p) => ({
        origin_code: p.origin_code, destination_code: p.destination_code,
        clothed_weight_kg: p.body_weight_kg, baggage_weight_kg: p.baggage_weight_kg,
      }));
      const formData = new FormData();
      formData.set("intent", "suggest-route");
      formData.set("passengers", JSON.stringify(passengers));
      routeSuggestionFetcher.submit(formData, { method: "post" });
    }, 300);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [passengerManifestsState]);

  // Read route suggestion fetcher response
  useEffect(() => {
    if (routeSuggestionFetcher.state === "idle" && routeSuggestionFetcher.data) {
      const data = routeSuggestionFetcher.data as { error?: string };
      if (!data.error) {
        setRouteSuggestion(routeSuggestionFetcher.data as typeof routeSuggestion);
      }
    }
  }, [routeSuggestionFetcher.state, routeSuggestionFetcher.data]);

  const handleAutoBuild = useCallback(() => {
    setIsBuilding(true);
    const formData = new FormData();
    formData.set("intent", "auto-build");
    fetcher.submit(formData, { method: "post" });
  }, [fetcher]);

  useEffect(() => {
    if (fetcher.state === "idle" && isBuilding) setIsBuilding(false);
  }, [fetcher.state, isBuilding]);

  const lastIntentRef = useRef<string | null>(null);

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
      "create-flight": "Flight created",
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
      const data = fetcher.data as { error?: string; success?: boolean };
      const intent = lastIntentRef.current;

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
            setPassengerManifestsState((prev) => prev.filter((m) => {
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
            fetcher.submit(assignFormData, { method: "post" });
          }
        }
        // On accept-build success, reload the page to show the newly created flights.
        if (intent === "accept-build") {
          window.location.reload();
        }
        // On reset-draft, clear local flights state since all flights were deleted
        if (intent === "reset-draft") {
          setFlights([]);
          setOptimisticAssignedIds(new Set());
          setFlightLegsState([]);
          setPassengerManifestsState([]);
        }
        if (intent && intentLabels[intent]) {
          showToast(intentLabels[intent], "success");
        } else {
          showToast("Action completed successfully", "success");
        }
      }

      lastIntentRef.current = null;
    }
  }, [fetcher.state, fetcher.data, showToast]);
  // ── Cross-container drag-and-drop handler ──────────────────────────────────
  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    if (data?.type === "booking") {
      setIsDraggingBooking(true);
      setActiveDragItem({ type: "booking", data: data.booking });
    } else if (data?.type === "flight") {
      setActiveDragItem({ type: "flight", data: data.flight });
    } else if (data?.type === "passenger") {
      setActiveDragItem({ type: "passenger", data: data.passenger });
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { over } = event;
    setActiveOverId(over?.id?.toString() ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDragItem(null);
    setActiveOverId(null);
    setIsDraggingBooking(false);

    if (!over || active.id === over.id) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // Determine the flight ID from the over target
    // over.id could be:
    //   - "flight-{id}" (string) from SortableDroppableFlightCard's useDroppable
    //   - numeric flight ID from SortableFlightCardWrapper's useSortable droppable
    const overFlightId = overData?.type === "flight"
      ? ((overData.flight as FlightCardFlight)?.id ?? (typeof over.id === "number" ? (over.id as number) : null))
      : activeData?.type === "flight" && typeof over.id === "number"
        ? (over.id as number)
        : null;

    // Handle flight reordering (active is a sortable flight card being dragged over another flight)
    if (overFlightId != null && activeData?.type === "flight") {
      const flightId = active.id as number;
      const newIndex = flights.findIndex((f) => f.id === overFlightId);
      if (newIndex !== -1) {
        handleReorderFlight(flightId, newIndex);
      }
      return;
    }

    // Handle booking → flight assignment
    if (activeData?.type === "booking" && overFlightId != null) {
      const booking = activeData.booking as UnassignedBookingRow;
      // If the target flight is optimistic (negative temp ID), buffer the
      // assignment and hide the booking from the unassigned pool.  The
      // create-flight-from-booking response handler will submit the real
      // assign-booking request once the real flight ID is known.
      // No PendingOp is pushed here because no fetcher is submitted yet;
      // the create-flight snapshot already captured the pre-optimistic state
      // and will roll back everything if it fails.
      if (overFlightId < 0) {
        pendingAssignAfterCreateRef.current.push({ bookingLegId: booking.id });
        setOptimisticAssignedIds((prev) => new Set(prev).add(booking.id));
        lastIntentRef.current = "assign-booking";
        return;
      }
      handleDropOnFlight(booking.id, overFlightId);
      return;
    }

    // Handle booking → draft flight placeholder (create flight from booking)
    if (activeData?.type === "booking" && overData?.type === "draft-flight") {
      const booking = activeData.booking as UnassignedBookingRow;
      // ── Optimistic update: create a temporary flight card immediately ──
      const tempId = -Date.now();
      pendingOpsRef.current.push({
        type: "create-flight",
        snapshot: { flights: [...flights], assignedIds: new Set(optimisticAssignedIds) },
        timestamp: Date.now(),
        tempFlightId: tempId,
      });
      // Hide the booking from the unassigned pool immediately
      setOptimisticAssignedIds((prev) => new Set(prev).add(booking.id));
      // Push an optimistic flight card so subsequent drops land on this
      // flight instead of the draft placeholder (prevents duplicate flights).
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
      // Submit the server request
      lastIntentRef.current = "create-flight-from-booking";
      const formData = new FormData();
      formData.set("intent", "create-flight-from-booking");
      formData.set("bookingLegIds", JSON.stringify([booking.id]));
      formData.set("scheduleId", String(schedule?.id ?? 0));
      formData.set("originCode", booking.origin_code);
      formData.set("destinationCode", booking.destination_code);
      formData.set("date", selectedDate);
      fetcher.submit(formData, { method: "post" });
      return;
    }

    // Handle passenger → flight (direct transfer between flights)
    if (activeData?.type === "passenger" && overFlightId != null) {
      const passenger = activeData.passenger as { bookingLegId: number; bookingLegPassengerId: number; passengerId: number; passengerName: string };
      lastIntentRef.current = "transfer-booking";
      const formData = new FormData();
      formData.set("intent", "transfer-booking");
      formData.set("bookingLegPassengerId", String(passenger.bookingLegPassengerId));
      formData.set("targetFlightId", String(overFlightId));
      fetcher.submit(formData, { method: "post" });
      return;
    }

    // Handle passenger → unassign pool (reverse drag)
    if (activeData?.type === "passenger" && overData?.type === "unassign-pool") {
      const passenger = activeData.passenger as { bookingLegId: number; bookingLegPassengerId: number; passengerId: number };
      lastIntentRef.current = "unassign-booking";
      const formData = new FormData();
      formData.set("intent", "unassign-booking");
      formData.set("bookingLegPassengerId", String(passenger.bookingLegPassengerId));
      fetcher.submit(formData, { method: "post" });
      return;
    }
  }

  // ── Action submission helpers ──────────────────────────────────────────────
  function submitAction(intent: string, extraFields?: Record<string, string>) {
    lastIntentRef.current = intent;
    const formData = new FormData();
    formData.set("intent", intent);
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
        lastIntentRef.current = "reset-draft";
        const formData = new FormData();
        formData.set("intent", "reset-draft");
        formData.set("scheduleId", String(schedule?.id ?? 0));
        fetcher.submit(formData, { method: "post" });
      },
    });
  }

  const canApproveAction = schedule && schedule.status === ScheduleStatus.BUILDING && canApprove;
  const canPublishAction = schedule && schedule.status === ScheduleStatus.APPROVED && canPublish;
  const canReviseAction = schedule && (schedule.status === ScheduleStatus.APPROVED || schedule.status === ScheduleStatus.PUBLISHED) && canEdit;
  const canCancelAction = schedule && schedule.status !== ScheduleStatus.CANCELLED && schedule.status !== ScheduleStatus.COMPLETED && canEdit;
  const fetcherData = fetcher.data as { error?: string; success?: boolean } | null;

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
    >
      {isNoFlyDayDate ? (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/30 px-4 py-3">
          <div className="flex items-start gap-3">
            <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
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
        <div className="mb-6"><p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">No schedule built for {selectedDate}.</p></div>
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const d = new Date(selectedDate);
              d.setDate(d.getDate() - 1);
              setSearchParams({ date: d.toISOString().split("T")[0] });
            }}
            className="px-2 py-1 text-sm border rounded dark:border-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 dark:hover:bg-slate-700/50"
          >
            ← Previous
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
            Next →
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setView("manual")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${view === "manual"               ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"}`}>
            Manual Build
          </button>
          <button onClick={() => setView("auto")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${view === "auto"               ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"}`}>
            Auto-Build
          </button>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && schedule && (
            <button
              onClick={() => setShowAddFlightModal(true)}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              + Add Flight
            </button>
          )}
          {canEdit && schedule && (schedule.status === "draft" || schedule.status === "building") && (
            <button
              onClick={handleConfirmResetDraft}
              className="px-3 py-1.5 text-sm bg-red-100 text-red-700 dark:text-red-400 rounded hover:bg-red-200"
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
                <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">Public:</span>
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
            window.location.reload();
          }}
        />
      )}

      {view === "manual" && (
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
                    <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">Building schedule...</p>
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
                  <div className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                    {activeDragItem.data.origin_code} → {activeDragItem.data.destination_code}
                  </div>
                </div>
              ) : activeDragItem?.type === "booking" && activeDragItem.data ? (
                <div className="opacity-90 shadow-xl dark:shadow-slate-900/50 rounded-md border border-blue-300 bg-white dark:bg-slate-800 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800 dark:text-slate-100">
                      {activeDragItem.data.booking_reference}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
                      {activeDragItem.data.passenger_count} pax
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                    {activeDragItem.data.origin_code} → {activeDragItem.data.destination_code}
                  </div>
                </div>
              ) : activeDragItem?.type === "passenger" && activeDragItem.data ? (
                <div className="opacity-90 shadow-xl dark:shadow-slate-900/50 rounded-md border border-red-300 bg-white dark:bg-slate-800 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <svg className="h-3 w-3 flex-shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                    <span className="text-sm text-slate-700 dark:text-slate-200">
                      {activeDragItem.data.passengerName}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
                    Drag to unassign pool to remove from flight
                  </div>
                </div>
              ) : null}
            </DragOverlay>,
            document.body
          )}
        </DndContext>
      )}

      {/* Add Flight Modal */}
      {showAddFlightModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Add Flight</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const formData = new FormData(form);
                formData.set("intent", "create-flight");
                formData.set("scheduleId", String(schedule?.id ?? 0));
                fetcher.submit(formData, { method: "post" });
                setShowAddFlightModal(false);
              }}
            >
              <div className="space-y-3">
                <div>
                  <label htmlFor="flightNumber" className="block text-sm font-medium mb-1">Flight Number</label>
                  <input
                    id="flightNumber"
                    name="flightNumber"
                    required
                    className="w-full border rounded px-2 py-1.5 text-sm"
                    placeholder="e.g. FIG0106001"
                  />
                </div>
                <div>
                  <label htmlFor="originAerodromeId" className="block text-sm font-medium mb-1">Origin</label>
                  <select
                    id="originAerodromeId"
                    name="originAerodromeId"
                    required
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  >
                    <option value="">Select origin...</option>
                    {aerodromes.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="destinationAerodromeId" className="block text-sm font-medium mb-1">Destination</label>
                  <select
                    id="destinationAerodromeId"
                    name="destinationAerodromeId"
                    required
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  >
                    <option value="">Select destination...</option>
                    {aerodromes.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="aircraftId" className="block text-sm font-medium mb-1">Aircraft (optional)</label>
                  <select
                    id="aircraftId"
                    name="aircraftId"
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  >
                    <option value="">No aircraft</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddFlightModal(false)}
                  className="px-4 py-2 text-sm border rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Create Flight
                </button>
              </div>
            </form>
          </div>
        </div>
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
