import { useState, useEffect, useRef } from "react";
import { useFetcher } from "@remix-run/react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  pointerWithin,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import ScheduleBoard from "./ScheduleBoard";
import { buildFlightCardFlight } from "../../utils/scheduling/build-flight-card-flight";
import type { FlightSummaryRow } from "../../utils/scheduling/build-flight-card-flight";
import type { FlightLegRow, PassengerManifestRow } from "../../utils/scheduling/build-stop-activities";

interface FlightPlanLeg {
  leg_sequence: number;
  origin_code: string;
  destination_code: string;
  distance_nm: number;
  departure_time: string | null;
  arrival_time: string | null;
}

interface PassengerManifest {
  id: number;
  booking_leg_id: number;
  passenger_name: string;
  body_weight_kg: number;
  baggage_weight_kg: number;
  freight_weight_kg: number;
  origin_code: string;
  destination_code: string;
}

interface FlightPlan {
  flightNumber: string;
  originCode: string;
  destinationCode: string;
  stops: string[];
  legs: FlightPlanLeg[];
  passengerManifests: PassengerManifest[];
  bookingLegIds: number[];
  passengerCount: number;
  totalPassengerWeightKg: number;
  aircraftRegistration: string;
  aircraftType: string;
  seatCount: number;
  totalDistanceNm: number;
  estimatedFlightTimeHours: number;
  pilotName: string | null;
  weightWarnings: string[];
  isFeasible: boolean;
}

interface BuildConfig {
  id: string;
  strategy: string;
  scheduleDate: string;
  flights: FlightPlan[];
  score: number;
  metrics: {
    totalDistanceNm: number;
    totalPassengers: number;
    totalFlightTimeHours: number;
    flightCount: number;
    avgPassengersPerFlight: number;
    aircraftUtilization: number;
    hasWarnings: boolean;
    hasErrors: boolean;
    warningCount: number;
  };
}

interface PreviewResponse {
  success?: boolean;
  error?: string;
  configs?: BuildConfig[];
  errors?: string[];
  warnings?: string[];
  unassignedCount?: number;
}

function planToFlightSummary(plan: FlightPlan, index: number): FlightSummaryRow {
  return {
    id: -(index + 1),
    flight_number: plan.flightNumber || `Draft ${index + 1}`,
    origin_code: plan.originCode,
    destination_code: plan.destinationCode,
    departure_time: null,
    arrival_time: null,
    status: "draft",
    aircraft_registration: plan.aircraftRegistration,
    aircraft_type: plan.aircraftType,
    seat_count: plan.seatCount,
    pilot_name: plan.pilotName,
    pilot_status: null,
    sort_order: index,
    duration_minutes: Math.round(plan.estimatedFlightTimeHours * 60),
    check_in_time: "08:00",
    operational_notes: null,
    flight_ordinal: index + 1,
    max_takeoff_weight_kg: null,
    max_landing_weight_kg: null,
    basic_empty_weight_kg: null,
    payload_kg: null,
    fuel_kg: null,
    crew_weight_kg: null,
  };
}

function planLegsToFlightLegRows(plan: FlightPlan, flightIndex: number): FlightLegRow[] {
  return plan.legs.map((l) => ({
    id: -(flightIndex * 100 + l.leg_sequence),
    flight_id: -(flightIndex + 1),
    leg_sequence: l.leg_sequence,
    origin_code: l.origin_code,
    destination_code: l.destination_code,
    departure_time: l.departure_time,
    arrival_time: l.arrival_time,
    distance_nm: l.distance_nm,
    heading: null,
    status: "scheduled",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
}

function planManifestsToPassengerManifestRows(manifests: PassengerManifest[]): PassengerManifestRow[] {
  return manifests.map((m) => ({
    id: m.id,
    booking_leg_id: m.booking_leg_id,
    passenger_name: m.passenger_name,
    body_weight_kg: m.body_weight_kg,
    baggage_weight_kg: m.baggage_weight_kg,
    freight_weight_kg: m.freight_weight_kg,
    origin_code: m.origin_code,
    destination_code: m.destination_code,
  }));
}

export default function AutoBuildPanel({
  selectedDate,
  canAssignPilot,
  availablePilots,
  canAssignAircraft,
  availableAircraft,
  onAccept,
}: {
  selectedDate: string;
  canAssignPilot: boolean;
  availablePilots: Array<{ id: number; name: string }>;
  canAssignAircraft: boolean;
  availableAircraft: Array<{ id: number; registration: string; type: string; seat_count: number }>;
  onAccept: () => void;
}) {
  const previewFetcher = useFetcher<PreviewResponse>();
  const acceptFetcher = useFetcher();
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildConfig, setBuildConfig] = useState<BuildConfig | null>(null);
  const [allErrors, setAllErrors] = useState<string[]>([]);
  const [allWarnings, setAllWarnings] = useState<string[]>([]);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const onAcceptRef = useRef(onAccept);
  onAcceptRef.current = onAccept;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (previewFetcher.state === "idle" && previewFetcher.data) {
      setIsBuilding(false);
      if (previewFetcher.data.success && previewFetcher.data.configs) {
        setBuildConfig(previewFetcher.data.configs[0] ?? null);
        setAllErrors(previewFetcher.data.errors ?? []);
        setAllWarnings(previewFetcher.data.warnings ?? []);
        setUnassignedCount(previewFetcher.data.unassignedCount ?? 0);
      } else if (previewFetcher.data.error) {
        setAllErrors([previewFetcher.data.error]);
        setBuildConfig(null);
      }
    }
  }, [previewFetcher.state, previewFetcher.data]);

  useEffect(() => {
    if (acceptFetcher.state === "idle" && acceptFetcher.data) {
      const data = acceptFetcher.data as { success?: boolean; error?: string };
      if (data.success) {
        onAcceptRef.current();
      }
    }
  }, [acceptFetcher.state, acceptFetcher.data]);

  function handleGenerate() {
    setIsBuilding(true);
    setBuildConfig(null);
    setAllErrors([]);
    setAllWarnings([]);
    const formData = new FormData();
    formData.set("intent", "preview-build");
    formData.set("date", selectedDate);
    previewFetcher.submit(formData, { method: "post" });
  }

  function handleAccept() {
    const formData = new FormData();
    formData.set("intent", "accept-build");
    formData.set("date", selectedDate);
    acceptFetcher.submit(formData, { method: "post" });
  }

  function handleDismiss() {
    setBuildConfig(null);
    setAllErrors([]);
    setAllWarnings([]);
  }

  const isAccepting = acceptFetcher.state !== "idle";

  const scoreColor = (score: number) =>
    score >= 80 ? "text-green-600 dark:text-green-400" : score >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";

  return (
    <div className="mb-6">
      <div className="rounded-lg bg-white dark:bg-slate-800 p-6 shadow-sm dark:shadow-slate-900/20 ring-1 ring-slate-200 dark:ring-slate-700">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Auto-Build Schedule</h3>
          {unassignedCount > 0 && (
            <span className="rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">
              {unassignedCount} unassigned passenger{unassignedCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
          Build flights from unassigned passengers. One flight per origin→destination cluster.
        </p>

        <button
          onClick={handleGenerate}
          disabled={isBuilding || isAccepting}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isBuilding ? "Generating..." : "Generate Draft Schedule"}
        </button>

        {previewFetcher.data?.error && !buildConfig && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{previewFetcher.data.error}</p>
        )}

        {allErrors.length > 0 && !buildConfig && (
          <div className="mt-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 dark:bg-red-900/30 p-3">
            {allErrors.map((e, i) => (
              <p key={i} className="text-xs text-red-700 dark:text-red-400 dark:text-red-400">{e}</p>
            ))}
          </div>
        )}

        {allWarnings.length > 0 && buildConfig && (
          <div className="mt-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 dark:bg-amber-900/30 p-3">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-400 dark:text-amber-400 mb-1">Warnings</p>
            {allWarnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-700 dark:text-amber-400 dark:text-amber-400">{w}</p>
            ))}
          </div>
        )}
      </div>

      {buildConfig && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Draft Schedule</span>
              <span className={`text-xs font-bold ${scoreColor(buildConfig.score)}`}>
                Score: {buildConfig.score}
              </span>
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
              {buildConfig.flights.length} flight{buildConfig.flights.length !== 1 ? "s" : ""} · {buildConfig.metrics.totalPassengers} pax
            </span>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragEnd={() => {}}
          >
            <ScheduleBoard
              flights={buildConfig.flights.map((plan, i) => {
                const summary = planToFlightSummary(plan, i);
                const allLegs = plan.legs
                  ? (planLegsToFlightLegRows(plan, i) as unknown as FlightLegRow[])
                  : [];
                const allManifests = plan.passengerManifests
                  ? (planManifestsToPassengerManifestRows(plan.passengerManifests) as unknown as PassengerManifestRow[])
                  : [];
                return buildFlightCardFlight(
                  summary,
                  allLegs,
                  allManifests,
                  canAssignPilot,
                  availablePilots,
                  0,
                  canAssignAircraft,
                  availableAircraft
                );
              })}
              maxTakeoffWeightKg={2994}
            />
          </DndContext>

          <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={handleAccept}
              disabled={isAccepting}
              className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isAccepting ? "Building..." : "Accept & Build"}
            </button>
            <button
              onClick={handleDismiss}
              disabled={isAccepting}
              className="rounded-md border border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 dark:hover:bg-slate-700/50 dark:hover:bg-slate-700/50 disabled:opacity-50"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
