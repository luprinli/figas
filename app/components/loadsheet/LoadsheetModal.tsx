import { useEffect, useRef, useState } from "react";
import { useFetcher } from "@remix-run/react";
import ManifestJourney from "./ManifestJourney";

interface LoadsheetModalProps {
  flightId: number;
  flightNumber: string;
  isOpen: boolean;
  onClose: () => void;
  canPerformInFlight: boolean;
}

interface LoadsheetData {
  loadsheet: {
    id: number; flight_id: number; status: string;
    empty_weight_kg: number | null; pilot_weight_kg: number | null;
    total_pax: number; notes: string | null;
    finalized_at: string | null; archived_at: string | null;
  };
  flightNumber: string;
  departureTime: string | null;
  pilotName: string;
  aircraftRegistration: string;
  aircraftType: string;
  passengers: Array<{
    id: number; seat: string; name: string;
    bookingLegId: number; origin: string; destination: string;
    clothedWeightKg: number; baggageWeightKg: number; boarded: boolean;
  }>;
  sectors: Array<{
    id: number; leg_sequence: number;
    origin_code: string | null; destination_code: string | null;
    distance_nm: number | null; planned_time_min: number | null;
    etd: string | null; eta: string | null;
    atd: string | null; ata: string | null;
    fuel_on_board_kg: number | null; fuel_burn_kg: number | null; fuel_remaining_kg: number | null;
    takeoff_weight_kg: number | null; landing_weight_kg: number | null;
    cog_position_mm: number | null; cog_status: string | null; tow_status: string | null;
    notes: string | null;
  }>;
  stopCodes: string[];
  canEdit: boolean; canEnterActual: boolean; isLocked: boolean; canPerformInFlight: boolean;
}

export default function LoadsheetModal({ flightId, flightNumber, isOpen, onClose, canPerformInFlight }: LoadsheetModalProps) {
  const fetcher = useFetcher<LoadsheetData>();
  const [mode, setMode] = useState<"ops" | "pax">(canPerformInFlight ? "ops" : "pax");
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && flightId > 0) {
      fetcher.load(`/ops/flight/${flightId}/loadsheet`);
      setMode(canPerformInFlight ? "ops" : "pax");
    }
  }, [isOpen, flightId]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (isOpen) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  if (!isOpen) return null;

  const data = fetcher.data;
  const isLoading = fetcher.state !== "idle" || !data;

  const statusColors: Record<string, string> = {
    draft: "bg-amber-100 text-amber-700",
    review: "bg-blue-100 text-blue-700",
    active: "bg-emerald-100 text-emerald-700",
    finalized: "bg-slate-200 text-slate-600 dark:text-slate-300 dark:text-slate-500",
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[5vh] pb-[5vh]"
    >
      <div className="relative w-full max-w-4xl rounded-xl bg-white dark:bg-slate-800 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* ── Close button ── */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full p-1 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:bg-slate-700 hover:text-slate-600 dark:text-slate-300 dark:text-slate-500"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 dark:border-slate-600 border-t-cyan-500" />
            <span className="ml-3 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">Loading loadsheet...</span>
          </div>
        ) : data ? (
          <div className="p-4 sm:p-6">
            {/* ── Header ── */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 pr-8">
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                  {data.flightNumber} Loadsheet
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  <span>Pilot: {data.pilotName}</span>
                  <span>Aircraft: {data.aircraftType} {data.aircraftRegistration}</span>
                  <span>{data.loadsheet.total_pax} pax</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.open(`/ops/flight/${flightId}/loadsheet/print`, "_blank")}
                  className="rounded-md border border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 dark:hover:bg-slate-700/50 hover:text-slate-700 no-print"
                >
                  <svg className="h-3.5 w-3.5 inline mr-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                  Print
                </button>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[data.loadsheet.status] ?? "bg-slate-100 dark:bg-slate-700"}`}>
                  {data.loadsheet.status.toUpperCase()}
                </span>
              </div>
            </div>

            {/* ── Mode toggle ── */}
            <div className="mb-4 flex rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 p-0.5 w-fit">
              <button
                onClick={() => setMode("ops")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  mode === "ops" ? "bg-white text-slate-800 dark:text-slate-100 shadow-sm dark:shadow-slate-900/20" : "text-slate-500 hover:text-slate-700 dark:text-slate-200"
                }`}
              >
                Operations
              </button>
              <button
                onClick={() => setMode("pax")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  mode === "pax" ? "bg-white text-slate-800 dark:text-slate-100 shadow-sm dark:shadow-slate-900/20" : "text-slate-500 hover:text-slate-700 dark:text-slate-200"
                }`}
              >
                Passengers
              </button>
            </div>

            {/* ── Operations View ── */}
            {mode === "ops" && (
              <>
                {/* Key metrics */}
                <div className="mb-1 px-1">
                  <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Flight Summary</h3>
                </div>
                <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  <Metric label="Empty Wt" value={`${Number(data.loadsheet.empty_weight_kg)}kg`} />
                  <Metric label="Crew" value={`${Number(data.loadsheet.pilot_weight_kg)}kg`} />
                  <Metric label="Pax Wt" value={`${data.passengers.reduce((s, p) => s + p.clothedWeightKg, 0)}kg`} />
                  <Metric label="Baggage" value={`${data.passengers.reduce((s, p) => s + p.baggageWeightKg, 0)}kg`} />
                  <Metric label="Starting Fuel" value={data.sectors.length > 0 ? `${Number(data.sectors[0].fuel_on_board_kg)}kg` : "—"} />
                  <Metric label="Legs" value={String(data.sectors.length)} />
                </div>

                {/* Passenger manifest with journey arrows */}
                <ManifestJourney
                  passengers={data.passengers}
                  stopCodes={data.stopCodes}
                  className="mb-4"
                />

                {/* Sector table */}
                <div className="mb-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="px-4 pt-3">
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Sector Calculations &amp; Weight / Fuel Planning</h3>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 text-left">
                        <th className="py-1.5 px-2 font-medium text-slate-500 dark:text-slate-400 w-6">#</th>
                        <th className="py-1.5 px-2 font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Route</th>
                        <th className="py-1.5 px-2 font-medium text-slate-500 dark:text-slate-400 w-10">Nm</th>
                        <th className="py-1.5 px-2 font-medium text-slate-500 dark:text-slate-400 w-12">Plan</th>
                        <th className="py-1.5 px-2 font-medium text-slate-500 dark:text-slate-400 w-12">ETD</th>
                        <th className="py-1.5 px-2 font-medium text-slate-500 dark:text-slate-400 w-12">ETA</th>
                        {data.canEnterActual && canPerformInFlight && (
                          <>
                            <th className="py-1.5 px-2 font-medium text-slate-500 dark:text-slate-400 w-12">ATD</th>
                            <th className="py-1.5 px-2 font-medium text-slate-500 dark:text-slate-400 w-12">ATA</th>
                          </>
                        )}
                        <th className="py-1.5 px-2 font-medium text-slate-500 dark:text-slate-400 w-14">TOW</th>
                        <th className="py-1.5 px-2 font-medium text-slate-500 dark:text-slate-400 w-12">FOB</th>
                        <th className="py-1.5 px-2 font-medium text-slate-500 dark:text-slate-400 w-12">Burn</th>
                        <th className="py-1.5 px-2 font-medium text-slate-500 dark:text-slate-400 w-12">Rem</th>
                        <th className="py-1.5 px-2 font-medium text-slate-500 dark:text-slate-400 w-12">CG</th>
                        <th className="py-1.5 px-2 font-medium text-slate-500 dark:text-slate-400 w-16">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sectors.map((s) => {
                        const lowFuel = s.fuel_remaining_kg != null && Number(s.fuel_remaining_kg) < 10;
                        const violation = s.tow_status === "violation" || s.cog_status === "violation";
                        return (
                          <tr key={s.leg_sequence} className="border-b border-slate-100">
                            <td className="py-1.5 px-2 font-mono text-slate-600 dark:text-slate-300 dark:text-slate-500">{s.leg_sequence}</td>
                            <td className="py-1.5 px-2 font-medium text-slate-700 dark:text-slate-200">{s.origin_code}→{s.destination_code}</td>
                            <td className="py-1.5 px-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">{Number(s.distance_nm)}</td>
                            <td className="py-1.5 px-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">{s.planned_time_min}m</td>
                            <td className="py-1.5 px-2 font-mono text-slate-600 dark:text-slate-300 dark:text-slate-500">{s.etd}</td>
                            <td className="py-1.5 px-2 font-mono text-slate-600 dark:text-slate-300 dark:text-slate-500">{s.eta}</td>
                            {data.canEnterActual && canPerformInFlight && (
                              <>
                                <td className="py-1.5 px-2">
                                  <input type="text" inputMode="numeric" maxLength={4} defaultValue={s.atd ?? ""}
                                    className="w-12 rounded border border-slate-200 dark:border-slate-700 dark:border-slate-700 px-1 py-0.5 text-[10px] font-mono focus:border-cyan-400 focus:outline-none text-center"
                                    placeholder="0800"
                                    onBlur={(e) => fetcher.submit(
                                      { intent: "update-sector", sectorId: String(s.id), atd: e.target.value, ata: s.ata ?? "" },
                                      { method: "post", action: `/ops/flight/${flightId}/loadsheet` }
                                    )} />
                                </td>
                                <td className="py-1.5 px-2">
                                  <input type="text" inputMode="numeric" maxLength={4} defaultValue={s.ata ?? ""}
                                    className="w-12 rounded border border-slate-200 dark:border-slate-700 dark:border-slate-700 px-1 py-0.5 text-[10px] font-mono focus:border-cyan-400 focus:outline-none text-center"
                                    placeholder="0800"
                                    onBlur={(e) => fetcher.submit(
                                      { intent: "update-sector", sectorId: String(s.id), atd: s.atd ?? "", ata: e.target.value },
                                      { method: "post", action: `/ops/flight/${flightId}/loadsheet` }
                                    )} />
                                </td>
                              </>
                            )}
                            <td className={`py-1.5 px-2 font-mono ${s.tow_status === "violation" ? "text-red-600 font-bold" : s.tow_status === "warning" ? "text-amber-600" : "text-slate-600 dark:text-slate-300 dark:text-slate-500"}`}>
                              {Number(s.takeoff_weight_kg)}
                            </td>
                            <td className="py-1.5 px-2 font-mono text-slate-600 dark:text-slate-300 dark:text-slate-500">{Number(s.fuel_on_board_kg)}</td>
                            <td className="py-1.5 px-2 font-mono text-slate-600 dark:text-slate-300 dark:text-slate-500">{Number(s.fuel_burn_kg)}</td>
                            <td className={`py-1.5 px-2 font-mono font-semibold ${lowFuel ? "text-red-600" : "text-slate-600 dark:text-slate-300 dark:text-slate-500"}`}>{Number(s.fuel_remaining_kg)}</td>
                            <td className={`py-1.5 px-2 font-mono ${s.cog_status === "violation" ? "text-red-600 font-bold" : s.cog_status === "warning" ? "text-amber-600" : "text-slate-600 dark:text-slate-300 dark:text-slate-500"}`}>
                              {Number(s.cog_position_mm).toFixed(1)}
                            </td>
                            <td className="py-1.5 px-2">
                              {violation ? (
                                <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700" title={s.notes ?? undefined}>
                                  {s.tow_status === "violation" ? "MTOW" : "CG"}
                                </span>
                              ) : (
                                <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">OK</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ── Passenger View ── */}
            {mode === "pax" && (
              <div className="space-y-1.5">
                {data.passengers.map((p) => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 rounded-lg border p-3 ${
                      p.boarded ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white dark:bg-slate-800"
                    }`}
                  >
                    <button
                      onClick={() => {
                        if (!data.canEnterActual || !canPerformInFlight) return;
                        fetcher.submit(
                          { intent: "toggle-boarding", passengerId: String(p.id), boarded: String(p.boarded) },
                          { method: "post", action: `/ops/flight/${flightId}/loadsheet` }
                        );
                      }}
                      disabled={!data.canEnterActual || !canPerformInFlight}
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${
                        p.boarded ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-slate-300 dark:text-slate-500"
                      } ${data.canEnterActual && canPerformInFlight ? "cursor-pointer active:scale-95" : "cursor-default"}`}
                    >
                      {p.boarded ? "✓" : ""}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {p.name} <span className="text-xs font-normal text-slate-500 dark:text-slate-400 dark:text-slate-500">Seat {p.seat}</span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                        {p.origin} → {p.destination} · {p.clothedWeightKg}kg{p.baggageWeightKg > 0 ? ` + ${p.baggageWeightKg}kg` : ""}
                      </div>
                    </div>
                    {p.boarded && (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">Boarded</span>
                    )}
                  </div>
                ))}
                {data.passengers.length === 0 && (
                  <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">No passengers on this flight</p>
                )}
              </div>
            )}

            {/* ── Actions footer ── */}
            {data.canEdit && canPerformInFlight && (
              <div className="mt-4 flex items-center gap-2 border-t border-slate-200 dark:border-slate-700 pt-3">
                <button
                  onClick={() => fetcher.submit(
                    { intent: "regenerate" },
                    { method: "post", action: `/ops/flight/${flightId}/loadsheet` }
                  )}
                  className="rounded-md border border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-700"
                >
                  Regenerate
                </button>
                {(data.loadsheet.status === "active" || data.loadsheet.status === "review") && (
                  <button
                    onClick={() => fetcher.submit(
                      { intent: "finalize" },
                      { method: "post", action: `/ops/flight/${flightId}/loadsheet` }
                    )}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                  >
                    Finalize
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="p-12 text-center text-sm text-red-500">Failed to load loadsheet data.</div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 dark:bg-slate-700 p-2 text-center">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500">{label}</div>
      <div className="text-sm font-bold text-slate-700 dark:text-slate-200">{value}</div>
    </div>
  );
}
