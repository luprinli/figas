import { useState, useEffect, useRef } from "react";
import { useFetcher } from "@remix-run/react";
import { RefreshCw, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

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

const BUILD_PHASES = [
  { key: "cluster", label: "Clustering bookings" },
  { key: "route", label: "Building routes" },
  { key: "aircraft", label: "Assigning aircraft" },
  { key: "validate", label: "Validating constraints" },
  { key: "score", label: "Scoring configurations" },
];

export default function AutoBuildPanel({
  selectedDate,
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
  const [expanded, setExpanded] = useState(false);
  const [showFlightDetails, setShowFlightDetails] = useState(false);
  const [buildPhase, setBuildPhase] = useState(0);
  const phaseIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onAcceptRef = useRef(onAccept);
  onAcceptRef.current = onAccept;

  useEffect(() => {
    if (previewFetcher.state === "idle" && previewFetcher.data) {
      setIsBuilding(false);
      if (phaseIntervalRef.current) {
        clearInterval(phaseIntervalRef.current);
        phaseIntervalRef.current = null;
      }
      setBuildPhase(BUILD_PHASES.length);
      if (previewFetcher.data.success && previewFetcher.data.configs) {
        setBuildConfig(previewFetcher.data.configs[0] ?? null);
        setAllErrors(previewFetcher.data.errors ?? []);
        setAllWarnings(previewFetcher.data.warnings ?? []);
        setUnassignedCount(previewFetcher.data.unassignedCount ?? 0);
        setExpanded(true);
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
      } else if (data.error) {
        setAllErrors([data.error]);
      }
    }
  }, [acceptFetcher.state, acceptFetcher.data]);

  function handleGenerate() {
    setIsBuilding(true);
    setBuildPhase(0);
    setBuildConfig(null);
    setAllErrors([]);
    setAllWarnings([]);
    setExpanded(false);
    const formData = new FormData();
    formData.set("intent", "preview-build");
    formData.set("date", selectedDate);
    previewFetcher.submit(formData, { method: "post" });

    phaseIntervalRef.current = setInterval(() => {
      setBuildPhase((prev) => Math.min(prev + 1, BUILD_PHASES.length - 1));
    }, 800);
  }

  useEffect(() => {
    return () => {
      if (phaseIntervalRef.current) clearInterval(phaseIntervalRef.current);
    };
  }, []);

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
    setExpanded(false);
  }

  const isAccepting = acceptFetcher.state !== "idle";
  const progressPct = BUILD_PHASES.length > 0 ? Math.round((buildPhase / BUILD_PHASES.length) * 100) : 0;

  const scoreBg = (score: number) =>
    score >= 80 ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" : score >= 50 ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300" : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300";

  return (
    <div className="mb-6" data-tour="schedule-autobuild">
      <div className="rounded-lg bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/20 ring-1 ring-slate-200 dark:ring-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              aria-label={expanded ? "Collapse auto-build panel" : "Expand auto-build panel"}
            >
              {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Auto-Build Schedule</h3>
            {unassignedCount > 0 && !isBuilding && (
              <span className="rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                {unassignedCount} unassigned
              </span>
            )}
          </div>
          <button
            onClick={handleGenerate}
            disabled={isBuilding || isAccepting}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw size={14} className={isBuilding ? "animate-spin" : ""} />
            {isBuilding ? "Generating..." : "Generate"}
          </button>
        </div>

        <p className="mt-1 ml-7 text-[11px] text-slate-500 dark:text-slate-400">
          Automatically build optimal flights from unassigned passengers using minimum flights and shortest routes.
        </p>

        {isBuilding && (
          <div className="mt-3 ml-7 space-y-2">
            <div className="flex items-center gap-2">
              <div
                role="progressbar"
                aria-valuenow={progressPct}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-1.5 flex-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="text-[10px] tabular-nums text-slate-500 dark:text-slate-400 w-8 text-right">{progressPct}%</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {BUILD_PHASES[buildPhase]?.label ?? "Finalizing..."}
            </p>
          </div>
        )}

        {allErrors.length > 0 && !buildConfig && (
          <div className="mt-3 ml-7 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3">
            {allErrors.map((e, i) => (
              <p key={i} className="text-xs text-red-700 dark:text-red-400">{e}</p>
            ))}
          </div>
        )}
      </div>

      {expanded && buildConfig && (
        <div className="mt-3 rounded-lg bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/20 ring-1 ring-slate-200 dark:ring-slate-700 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Best Configuration</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${scoreBg(buildConfig.score)}`}>
                Score: {buildConfig.score}
              </span>
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">
              Strategy: {buildConfig.strategy}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-md bg-slate-50 dark:bg-slate-700/50 p-2 text-center">
              <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{buildConfig.metrics.flightCount}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Flights</p>
            </div>
            <div className="rounded-md bg-slate-50 dark:bg-slate-700/50 p-2 text-center">
              <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{buildConfig.metrics.totalPassengers}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Passengers</p>
            </div>
            <div className="rounded-md bg-slate-50 dark:bg-slate-700/50 p-2 text-center">
              <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{buildConfig.metrics.totalDistanceNm}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Total nm</p>
            </div>
            <div className="rounded-md bg-slate-50 dark:bg-slate-700/50 p-2 text-center">
              <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{Math.round(buildConfig.metrics.totalFlightTimeHours * 10) / 10}h</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Flight time</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500 dark:text-slate-400">Aircraft utilization</span>
              <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300">{Math.round(buildConfig.metrics.aircraftUtilization * 100)}%</span>
            </div>
            <div className="h-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.round(buildConfig.metrics.aircraftUtilization * 100)}%` }}
              />
            </div>
          </div>

          {allWarnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-2">
              <div className="flex items-center gap-1 mb-1">
                <AlertTriangle size={12} className="text-amber-500" />
                <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">{allWarnings.length} warning{allWarnings.length !== 1 ? "s" : ""}</span>
              </div>
              {allWarnings.slice(0, 3).map((w, i) => (
                <p key={i} className="text-[10px] text-amber-700 dark:text-amber-400">{w}</p>
              ))}
              {allWarnings.length > 3 && (
                <button onClick={() => setShowFlightDetails(!showFlightDetails)} className="text-[10px] text-amber-600 dark:text-amber-400 underline mt-1">
                  Show all {allWarnings.length} warnings
                </button>
              )}
            </div>
          )}

          <button
            onClick={() => setShowFlightDetails(!showFlightDetails)}
            className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
          >
            {showFlightDetails ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Flight details ({buildConfig.flights.length})
          </button>

          {showFlightDetails && (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {buildConfig.flights.map((plan, i) => (
                <div key={i} className="rounded-md border border-slate-200 dark:border-slate-700 p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                      {plan.flightNumber || `Flight ${i + 1}`}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      {plan.passengerCount} pax · {plan.aircraftRegistration}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                    <span>{plan.originCode}</span>
                    {plan.stops.map((s, j) => (
                      <span key={j} className="flex items-center gap-1">
                        <span className="text-slate-300">{'\u2192'}</span>
                        <span>{s}</span>
                      </span>
                    ))}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[10px]">
                    <span className="text-slate-500 dark:text-slate-400">{plan.totalDistanceNm}nm</span>
                    <span className="text-slate-500 dark:text-slate-400">{plan.estimatedFlightTimeHours.toFixed(1)}h</span>
                    {plan.isFeasible ? (
                      <span className="flex items-center gap-0.5 text-green-600 dark:text-green-400"><CheckCircle size={10} /> Feasible</span>
                    ) : (
                      <span className="flex items-center gap-0.5 text-red-600 dark:text-red-400"><XCircle size={10} /> Warning</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={handleAccept}
              disabled={isAccepting}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isAccepting ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Building...
                </>
              ) : (
                "Accept & Build"
              )}
            </button>
            <button
              onClick={handleDismiss}
              disabled={isAccepting}
              className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 disabled:opacity-50"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
