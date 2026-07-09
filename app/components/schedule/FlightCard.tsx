import { useState, useEffect, useRef } from "react";
import { Link, useFetcher } from "@remix-run/react";
import FlightNotes from "./FlightNotes";
import StopActivityList from "./StopActivityList";
import TimePicker from "../TimePicker";
import { validateFlight } from "../../utils/scheduling/flight-validation";
import type { ValidationPassenger, ValidationLeg, ValidationAircraft, ValidationAerodrome, FlightValidationResult, FuelAndDistanceMap } from "../../utils/scheduling/flight-validation";
import PassengerIcon from "../icons/PassengerIcon";

export interface PilotOption {
  id: number;
  name: string;
}

export interface AircraftOption {
  id: number;
  registration: string;
  type: string;
  seat_count: number;
}

export interface FlightCardFlight {
  id: number;
  flight_number: string;
  origin_code: string;
  destination_code: string;
  departure_time: string | null;
  arrival_time: string | null;
  status: string;
  aircraft_registration: string | null;
  seat_count: number | null;
  total_passenger_weight_kg: number | null;
  total_baggage_weight_kg: number | null;
  total_freight_weight_kg: number | null;
  schedule_id: number;
  canAssignPilot: boolean;
  availablePilots: PilotOption[];
  canAssignAircraft: boolean;
  availableAircraft: AircraftOption[];

  flight_legs: Array<{
    leg_sequence: number;
    origin_code: string;
    destination_code: string;
    departure_time: string | null;
    arrival_time: string | null;
    distance_nm: number | null;
    heading: number | null;
  }>;

  stop_manifests: Array<{
    aerodrome_code: string;
    aerodrome_name: string;
    leg_sequence: number;
    departing_passengers: Array<{
      id: number;
      booking_leg_id: number;
      compact_name: string;
      body_weight_kg: number;
      baggage_weight_kg: number;
      destination_code: string;
    }>;
    arriving_passengers: Array<{
      id: number;
      booking_leg_id: number;
      compact_name: string;
      body_weight_kg: number;
      baggage_weight_kg: number;
      destination_code: string;
    }>;
    net_body_weight_change: number;
    net_baggage_weight_change: number;
  }>;

  pilot_name: string | null;
  pilot_status: string | null;
  aircraft_type: string | null;
  duration_minutes: number | null;
  check_in_time: string | null;
  flight_ordinal: number | null;
  operational_notes: string | null;

  max_takeoff_weight_kg?: number;
  max_landing_weight_kg?: number;
  empty_weight_kg?: number;
  fuel_capacity_kg?: number;
  fuel_burn_rate_kg_per_hour?: number;
  cruise_speed_kt?: number;
  max_range_nm?: number;
  fuelAndDistance?: Record<string, { fuel_kg: number; distance_nm: number }>;
}

export interface FlightCardProps {
  flight: FlightCardFlight;
  maxTakeoffWeightKg: number;
  className?: string;
  onRemoveFlight?: (flightId: number) => void;
  onFlightUpdated?: (updatedFlight: Record<string, unknown>) => void;
  onOpenLoadsheet?: (flightId: number) => void;
  renderPassengerRow?: (params: {
    passenger: { id: number; booking_leg_id: number; compact_name: string; body_weight_kg: number; baggage_weight_kg: number };
    aerodromeCode: string;
    flightId: number;
  }) => React.ReactNode;
  linkable?: boolean;
}

const statusAccentMap: Record<string, string> = {
  scheduled: "border-l-green-500", active: "border-l-blue-500", completed: "border-l-slate-400",
  cancelled: "border-l-red-500", draft: "border-l-amber-400", building: "border-l-amber-400",
  approved: "border-l-blue-400", published: "border-l-green-600",
};

export default function FlightCard({
  flight, className, renderPassengerRow, linkable = true, onRemoveFlight, onFlightUpdated, onOpenLoadsheet,
}: FlightCardProps) {
  const [passengersExpanded, setPassengersExpanded] = useState(false);
  const [mouseIsOver, setMouseIsOver] = useState(false);
  const [showPilotOptions, setShowPilotOptions] = useState(false);
  const [showAircraftOptions, setShowAircraftOptions] = useState(false);
  const [checkInTime, setCheckInTime] = useState(flight.check_in_time ?? "08:00");
  const [assigningType, setAssigningType] = useState<"pilot" | "aircraft" | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [optimisticPilotName, setOptimisticPilotName] = useState<string | null>(null);
  const [optimisticAircraftReg, setOptimisticAircraftReg] = useState<string | null>(null);
  const assignmentFetcher = useFetcher();

  const passengerIds = new Set<number>();
  for (const sm of flight.stop_manifests) { for (const p of sm.departing_passengers) passengerIds.add(p.id); for (const p of sm.arriving_passengers) passengerIds.add(p.id); }
  const totalPassengers = passengerIds.size;
  const combinedWeight = (flight.total_passenger_weight_kg ?? 0) + (flight.total_baggage_weight_kg ?? 0);
  const hasMultiStopRoute = flight.flight_legs.length > 0;
  const accentClass = statusAccentMap[flight.status] ?? "border-l-slate-300";
  const hasAircraft = !!(flight.aircraft_type || optimisticAircraftReg || flight.aircraft_registration);
  const hasPilot = !!(optimisticPilotName || flight.pilot_name);
  const canAssignAircraft = flight.canAssignAircraft && flight.availableAircraft.length > 0;
  const canAssignPilot = flight.canAssignPilot && flight.availablePilots.length > 0;

  // ── Route stops string ──
  const routeCodes: string[] = [];
  if (hasMultiStopRoute) { routeCodes.push(flight.flight_legs[0].origin_code); for (const l of flight.flight_legs) routeCodes.push(l.destination_code); }

  // ── Derived first/last leg times for top-level display ──
  const firstLegDep = hasMultiStopRoute ? flight.flight_legs[0]?.departure_time : flight.departure_time;
  const lastLegArr = hasMultiStopRoute ? flight.flight_legs[flight.flight_legs.length - 1]?.arrival_time : flight.arrival_time;

  function formatTimeHM(iso: string | null): string | null {
    if (!iso) return null;
    try { return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }
    catch { return null; }
  }

  const depDisplay = formatTimeHM(firstLegDep);
  const arrDisplay = formatTimeHM(lastLegArr);

  // ── Assignment submission via Remix fetcher ────────────────────────────
  function submitAssign(type: "pilot" | "aircraft", id: number) {
    lastAssignmentRef.current = { type, id, timestamp: Date.now() };
    setAssigningType(type);
    setAssignError(null);
    if (type === "pilot") { const p = flight.availablePilots.find((x) => x.id === id); if (p) setOptimisticPilotName(p.name); }
    else { const a = flight.availableAircraft.find((x) => x.id === id); if (a) setOptimisticAircraftReg(a.registration); }
    const formData = new FormData();
    formData.set("intent", `assign-${type}`);
    formData.set("flightId", String(flight.id));
    formData.set(type === "aircraft" ? "aircraftId" : "pilotId", String(id));
    formData.set("scheduleId", String(flight.schedule_id));
    assignmentFetcher.submit(formData, { method: "post" });
    if (type === "aircraft") setShowAircraftOptions(false); else setShowPilotOptions(false);
  }

  const lastAssignmentRef = useRef<{ type: string; id: number; timestamp: number } | null>(null);

  useEffect(() => {
    if (assignmentFetcher.state === "idle" && assignmentFetcher.data) {
      const data = assignmentFetcher.data as { success?: boolean; error?: string; updatedFlight?: Record<string, unknown> };
      if (data.success && lastAssignmentRef.current) {
        lastAssignmentRef.current = null;
        setAssigningType(null);
        setAssignError(null);
        setOptimisticPilotName(null);
        setOptimisticAircraftReg(null);
        if (data.updatedFlight && onFlightUpdated) onFlightUpdated(data.updatedFlight);
      } else if (data.error) {
        setAssignError(data.error);
        setAssigningType(null);
        setOptimisticPilotName(null);
        setOptimisticAircraftReg(null);
      }
    }
  }, [assignmentFetcher.state, assignmentFetcher.data, onFlightUpdated]);

  // ── Per-stop validation ──────────────────────────────────────────────────
  const [validation, setValidation] = useState<FlightValidationResult | null>(null);
  const validationRef = useRef(validation);
  validationRef.current = validation;

  const lastValidationKey = useRef("");
  useEffect(() => {
    // Gate: validation requires BOTH pilot AND aircraft assigned
    if (!hasAircraft || !hasPilot) { setValidation(null); lastValidationKey.current = ""; return; }
    if (!flight.max_takeoff_weight_kg) { setValidation(null); lastValidationKey.current = ""; return; }

    // Build a stable key from the actual data to skip unnecessary recomputation
    const inputKey = [
      flight.max_takeoff_weight_kg, flight.max_landing_weight_kg, flight.empty_weight_kg,
      flight.fuel_capacity_kg, flight.fuel_burn_rate_kg_per_hour, flight.cruise_speed_kt,
      flight.max_range_nm, flight.aircraft_type, flight.aircraft_registration, flight.seat_count,
      flight.total_freight_weight_kg,
      flight.stop_manifests.map((sm) =>
        sm.aerodrome_code + ":" + sm.departing_passengers.map((p) => p.id).sort().join(",") + ":" + sm.arriving_passengers.map((p) => p.id).sort().join(",")
      ).join("|"),
      flight.flight_legs.map((l) => l.leg_sequence + ":" + l.origin_code + ":" + l.destination_code + ":" + l.distance_nm).join("|"),
      JSON.stringify(flight.fuelAndDistance),
    ].join(";;");
    if (lastValidationKey.current === inputKey && validationRef.current) return;
    lastValidationKey.current = inputKey;
    let cancelled = false;
    async function compute() {
      const seenIds = new Set<number>();
      const passengers: ValidationPassenger[] = [];
      for (const sm of flight.stop_manifests) {
        for (const p of sm.departing_passengers) { if (!seenIds.has(p.id)) { seenIds.add(p.id); passengers.push({ id: p.id, name: p.compact_name, origin_code: sm.aerodrome_code, destination_code: p.destination_code, clothed_weight_kg: p.body_weight_kg, baggage_weight_kg: p.baggage_weight_kg }); } }
        for (const p of sm.arriving_passengers) { if (!seenIds.has(p.id)) { seenIds.add(p.id); passengers.push({ id: p.id, name: p.compact_name, origin_code: sm.aerodrome_code, destination_code: p.destination_code, clothed_weight_kg: p.body_weight_kg, baggage_weight_kg: p.baggage_weight_kg }); } }
      }
      const legs: ValidationLeg[] = flight.flight_legs.map(l => ({ leg_sequence: l.leg_sequence, origin_code: l.origin_code, destination_code: l.destination_code, distance_nm: l.distance_nm }));
      const a: ValidationAircraft = {
        type: flight.aircraft_type ?? flight.aircraft_registration ?? "",
        registration: flight.aircraft_registration ?? "",
        seat_count: flight.seat_count ?? 0,
        max_takeoff_weight_kg: flight.max_takeoff_weight_kg ?? 0,
        max_landing_weight_kg: flight.max_landing_weight_kg ?? flight.max_takeoff_weight_kg ?? 0,
        empty_weight_kg: flight.empty_weight_kg ?? 0,
        fuel_capacity_kg: flight.fuel_capacity_kg ?? 0,
        fuel_burn_rate_kg_per_hour: flight.fuel_burn_rate_kg_per_hour ?? 45,
        cruise_speed_kt: flight.cruise_speed_kt ?? 140,
        max_range_nm: flight.max_range_nm ?? 800,
      };
      const aerodromes: ValidationAerodrome[] = []; const sc = new Set<string>();
      for (const l of flight.flight_legs) { const dc = l.destination_code.toUpperCase(); if (!sc.has(dc)) { sc.add(dc); aerodromes.push({ code: dc, mtow_limit_kg: null, mlw_limit_kg: null, runway_length: null }); } }
      const fd: FuelAndDistanceMap = new Map(); if (flight.fuelAndDistance) for (const [k, v] of Object.entries(flight.fuelAndDistance)) fd.set(k, v);
      const result = await validateFlight(passengers, legs, a, { pilotWeightKg: 160, freightWeightKg: flight.total_freight_weight_kg ?? 0, aerodromes, fuelAndDistance: fd });
      if (!cancelled) setValidation(result);
    }
    compute(); return () => { cancelled = true; };
  }, [flight.stop_manifests, flight.flight_legs, flight.max_takeoff_weight_kg, flight.max_landing_weight_kg, flight.empty_weight_kg, flight.fuel_capacity_kg, flight.fuel_burn_rate_kg_per_hour, flight.cruise_speed_kt, flight.max_range_nm, flight.aircraft_type, flight.aircraft_registration, flight.seat_count, flight.total_freight_weight_kg, flight.fuelAndDistance, hasAircraft, hasPilot]);

  const worstStopStatus: "ok" | "warning" | "violation" = validation
    ? (validation.per_stop.some(s => s.mtow_status === "violation" || s.mlw_status === "violation") ? "violation"
        : validation.per_stop.some(s => s.mtow_status === "warning" || s.mlw_status === "warning") ? "warning" : "ok")
    : "ok";

  // ── Ordinal ──
  const ord = flight.flight_ordinal;
  const aircraftTag = flight.aircraft_registration?.replace("VP-", "") ?? "TBD";
  const ordSuffix = (n: number) => { const s = ["th","st","nd","rd"]; const v = n % 100; return s[(v-20)%10] ?? s[v] ?? s[0]; };
  const ordinalText = ord != null ? `${aircraftTag} ${ord}${ordSuffix(ord)} Flight` : null;

  const cardContent = (
    <>
      {/* ── Top line: Flight # + Pilot + Aircraft + Status + X ── */}
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <span className="text-base font-bold text-cyan-800 dark:text-cyan-300">{flight.flight_number}</span>
        {ordinalText && <span className="rounded bg-slate-100 dark:bg-slate-700 px-1.5 py-px text-[10px] font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">{ordinalText}</span>}

        {/* Pilot */}
        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (canAssignPilot) { setShowPilotOptions(!showPilotOptions); setShowAircraftOptions(false); } }}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
            !hasPilot && canAssignPilot ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30 dark:bg-red-900/30 text-red-700 dark:text-red-400 dark:text-red-400 hover:bg-red-100 dark:bg-red-900/30"
            : hasPilot ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/30 dark:bg-green-900/30 text-green-700 dark:text-green-400 dark:text-green-400"
            : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 dark:text-slate-500"}`}>
          <svg className="h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="8" cy="5" r="3" /><path d="M3 14c0-3 2.2-5 5-5s5 2 5 5" /></svg>
          <span className="max-w-[100px] truncate">{assigningType === "pilot" ? "Assigning..." : hasPilot ? (optimisticPilotName || flight.pilot_name) : (canAssignPilot ? "Pilot" : "TBC")}</span>
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${flight.pilot_status === "confirmed" ? "bg-green-50 dark:bg-green-900/30 dark:bg-green-900/300" : flight.pilot_status === "assigned" ? "bg-blue-50 dark:bg-blue-900/30 dark:bg-blue-900/300" : hasPilot ? "bg-slate-300" : "bg-red-300"}`} />
        </button>

        {/* Aircraft */}
        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (canAssignAircraft) { setShowAircraftOptions(!showAircraftOptions); setShowPilotOptions(false); } }}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
            !hasAircraft && canAssignAircraft ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30 dark:bg-red-900/30 text-red-700 dark:text-red-400 dark:text-red-400 hover:bg-red-100 dark:bg-red-900/30"
            : hasAircraft ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/30 dark:bg-green-900/30 text-green-700 dark:text-green-400 dark:text-green-400"
            : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 dark:text-slate-500"}`}>
          <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M21 14v-2l-8-4V4a1 1 0 0 0-1-1 1 1 0 0 0-1 1v4l-8 4v2l8-2v5l-2 1.5V20l3-.5 3 .5v-1.5L13 17v-5l8 2Z" /></svg>
          <span className="max-w-[120px] truncate">{assigningType === "aircraft" ? "Assigning..." : hasAircraft ? (optimisticAircraftReg || flight.aircraft_registration) : (canAssignAircraft ? "Aircraft" : "TBC")}</span>
          {flight.seat_count != null && <span className="font-normal opacity-70">·{flight.seat_count}s</span>}
        </button>

        <div className="flex items-center gap-1.5 ml-auto">
          <button
            onClick={(e) => { e.stopPropagation(); onOpenLoadsheet?.(flight.id); }}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-[10px] font-medium text-slate-500 dark:text-slate-400 hover:border-cyan-300 hover:text-cyan-700 transition-colors"
            title="View Loadsheet">
            <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="2" width="12" height="12" rx="2" />
              <line x1="6" y1="6" x2="10" y2="6" />
              <line x1="6" y1="9" x2="10" y2="9" />
            </svg>
            <span className="hidden sm:inline">Loadsheet</span>
          </button>
          <TimePicker value={checkInTime} onChange={setCheckInTime} />
          {(() => {
            const rawDur = flight.duration_minutes ?? (hasMultiStopRoute ? flight.flight_legs.reduce((s, l) => s + Number(l.distance_nm ?? 0), 0) / 140 * 60 : null);
            const dur = rawDur != null ? Number(rawDur) : null;
            if (dur != null && isFinite(dur) && dur > 0) return <span className="text-[10px] tabular-nums text-slate-400 dark:text-slate-500">{Math.floor(dur / 60)}h {Math.round(dur % 60)}m</span>;
            return null;
          })()}
          {mouseIsOver && onRemoveFlight && (
            <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemoveFlight(flight.id); }}
              className="rounded-full p-1 text-slate-500 dark:text-slate-400 hover:bg-red-50 dark:bg-red-900/30 dark:hover:bg-red-900/30 dark:bg-red-900/30 hover:text-red-500 transition-colors" title="Remove flight">
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Assignment chips ── */}
      {assignError && (
        <div className="mb-1.5 rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-2 py-1 text-[10px] text-red-700 dark:text-red-400">{assignError}</div>
      )}
      {showAircraftOptions && canAssignAircraft && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {flight.availableAircraft.map(a => (
            <button key={a.id} type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); submitAssign("aircraft", a.id); }}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:border-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 transition-colors cursor-pointer">
              {a.registration} <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">{a.type} · {a.seat_count}s</span>
            </button>
          ))}
          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowAircraftOptions(false); }}
            className="inline-flex items-center rounded-full border border-transparent px-1 py-0.5 text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-400 dark:text-slate-300 cursor-pointer">
            <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" /></svg>
          </button>
        </div>
      )}
      {showPilotOptions && canAssignPilot && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {flight.availablePilots.map(p => (
            <button key={p.id} type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); submitAssign("pilot", p.id); }}
              className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:border-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 transition-colors cursor-pointer">{p.name}</button>
          ))}
          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowPilotOptions(false); }}
            className="inline-flex items-center rounded-full border border-transparent px-1 py-0.5 text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-400 dark:text-slate-300 cursor-pointer">
            <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" /></svg>
          </button>
        </div>
      )}

      {/* ── Route + timing in one compact section ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mb-1.5">
        {/* Route */}
        {hasMultiStopRoute ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 dark:text-slate-500">
            {routeCodes.map((code, i) => (
              <span key={`${code}-${i}`} className="inline-flex items-center gap-1">{i > 0 && <span className="text-slate-300 dark:text-slate-500">→</span>}{code}</span>
            ))}
          </span>
        ) : (
          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 dark:text-slate-500">{flight.origin_code} <span className="text-slate-300 dark:text-slate-500">→</span> {flight.destination_code}</span>
        )}

        {/* Times */}
        {depDisplay && (
          <span className="font-mono tabular-nums text-xs font-semibold text-slate-700 dark:text-slate-200">{depDisplay}</span>
        )}
        {arrDisplay && (
          <>
            <span className="text-slate-300 dark:text-slate-500">–</span>
            <span className="font-mono tabular-nums text-xs font-semibold text-slate-700 dark:text-slate-200">{arrDisplay}</span>
          </>
        )}
        {flight.duration_minutes != null && (
          <span className="rounded bg-slate-100 dark:bg-slate-700 px-1.5 py-px text-[10px] font-medium text-slate-500 dark:text-slate-400 font-mono">
            {(() => { const m = flight.duration_minutes; const h = Math.floor(m/60); const r = Math.round(m%60); return h===0?`${r}m`:r===0?`${h}h`:`${h}h${r}m`; })()}
          </span>
        )}
      </div>

      {/* ── Passenger section ── */}
      {totalPassengers > 0 && (
        <div>
          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPassengersExpanded(!passengersExpanded); }}
            className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left hover:bg-slate-50 dark:bg-slate-700">
            <svg className={`h-3 w-3 text-slate-500 dark:text-slate-400 transition-transform ${passengersExpanded ? "rotate-90" : ""}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6,4 10,8 6,12" /></svg>
            <PassengerIcon className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 dark:text-slate-500" />
            <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{totalPassengers} pax</span>
            <span className="font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{combinedWeight}kg</span>
            {hasPilot && hasAircraft && worstStopStatus !== "ok" && (
              <span className={`h-1.5 w-1.5 rounded-full ${worstStopStatus==="violation"?"bg-red-50 dark:bg-red-900/30 dark:bg-red-900/300":"bg-amber-50 dark:bg-amber-900/30 dark:bg-amber-900/300"}`} />
            )}
            {!hasAircraft && !hasPilot && (
              <span className="text-[10px] text-amber-500 dark:text-amber-400 italic">Awaiting pilot &amp; aircraft</span>
            )}
            {hasAircraft && !hasPilot && (
              <span className="text-[10px] text-amber-500 dark:text-amber-400 italic">Awaiting pilot</span>
            )}
            {!hasAircraft && hasPilot && (
              <span className="text-[10px] text-amber-500 dark:text-amber-400 italic">Awaiting aircraft</span>
            )}
          </button>
          {passengersExpanded && (
            <div className="mt-1 rounded-md bg-slate-50 dark:bg-slate-700 p-2">
              <StopActivityList stopManifests={flight.stop_manifests} flightLegs={flight.flight_legs} flightStatus={flight.status} renderPassengerRow={renderPassengerRow} flightId={flight.id}
                perStopValidation={validation?.per_stop?.map(s => ({
                  stop_code: s.stop_code, takeoff_weight_kg: s.takeoff_weight_kg, mtow_kg: s.mtow_kg,
                  mtow_used_pct: s.mtow_used_pct, mtow_status: s.mtow_status,
                  landing_weight_kg: s.landing_weight_kg, mlw_kg: s.mlw_kg,
                  mlw_used_pct: s.mlw_used_pct, mlw_status: s.mlw_status,
                })) ?? null}
              />
            </div>
          )}
        </div>
      )}

      <FlightNotes operational_notes={flight.operational_notes} />
    </>
  );

  const baseClasses = ["block rounded-lg border-l-[3px] bg-white dark:bg-slate-800 p-2.5 shadow-sm dark:shadow-slate-900/20 transition hover:shadow-md hover:border-cyan-300", accentClass, className].filter(Boolean).join(" ");

  if (linkable) return <Link to={`/ops/flight/${flight.id}`} className={baseClasses} onMouseEnter={() => setMouseIsOver(true)} onMouseLeave={() => setMouseIsOver(false)}>{cardContent}</Link>;
  return <div className={baseClasses} onMouseEnter={() => setMouseIsOver(true)} onMouseLeave={() => setMouseIsOver(false)}>{cardContent}</div>;
}
