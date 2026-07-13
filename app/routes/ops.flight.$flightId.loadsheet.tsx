import { useLoaderData, useFetcher, Link, useNavigate, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { useEffect, useCallback } from "react";
import { X } from "lucide-react";
import SeatMap from "../components/seat-map/SeatMap";

import type { loader } from "./ops.flight.$flightId.loadsheet.server";
export { loader, action } from "./ops.flight.$flightId.loadsheet.server";

export default function LoadsheetPage() {
  const { loadsheet, flightNumber, departureTime, pilotName, aircraftRegistration, aircraftType, passengers, sectors, stopCodes, canEdit, canEnterActual, isLocked, canPerformInFlight } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigate = useNavigate();

  const handleClose = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/operations/schedule");
    }
  }, [navigate]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  const statusColors: Record<string, string> = {
    draft: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
    review: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
    active: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
    finalized: "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300",
    archived: "bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-400",
  };

  const depDate = departureTime ? new Date(departureTime).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto">
      {/* Overlay backdrop Ã¢â‚¬â€ click to close */}
      <div
        className="fixed inset-0 bg-slate-900/50 dark:bg-slate-950/70 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />
      {/* Content panel */}
      <div className="relative z-10 w-full max-w-5xl min-h-screen my-0">
        {/* Close button Ã¢â‚¬â€ fixed position */}
        <button
          type="button"
          onClick={handleClose}
          className="fixed top-4 right-4 z-20 rounded-full bg-white dark:bg-slate-800 p-2 shadow-lg dark:shadow-slate-900/50 ring-1 ring-slate-200 dark:ring-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          aria-label="Close loadsheet"
        >
          <X size={20} />
        </button>
        {/* Main content */}
        <div className="bg-slate-50 dark:bg-slate-900">
          <div className="mx-auto max-w-5xl px-3 py-4 sm:px-6 sm:py-6">
        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Header Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <div className="mb-4 rounded-lg bg-white dark:bg-slate-800 p-3 shadow-sm dark:shadow-slate-900/20 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div>
              <Link to="/operations/schedule" className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:text-slate-300 dark:text-slate-500">Ã¢â€ Â Schedule</Link>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 sm:text-xl">{flightNumber} Loadsheet</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">{depDate}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[loadsheet.status] ?? "bg-slate-100 dark:bg-slate-700"}`}>
                {loadsheet.status.toUpperCase()}
              </span>
              <Link to={`/ops/flight/${loadsheet.flight_id}/passengers`}
                className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-700">
                Passenger View
              </Link>
              <button
                type="button"
                onClick={() => window.open(`/ops/flight/${loadsheet.flight_id}/loadsheet/print`, "_blank", "width=1024,height=768")}
                className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Print
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300 dark:text-slate-500">
            <span>
              <span className="text-slate-500 dark:text-slate-400">Pilot:</span>{" "}
              <span className="font-medium">{pilotName}</span>
            </span>
            <span>
              <span className="text-slate-500 dark:text-slate-400">Aircraft:</span>{" "}
              <span className="font-medium">{aircraftType} {aircraftRegistration}</span>
            </span>
            <span>
              <span className="text-slate-500 dark:text-slate-400">Empty Wt:</span>{" "}
              <span className="font-medium">{Number(loadsheet.empty_weight_kg)}kg</span>
            </span>
            <span>
              <span className="text-slate-500 dark:text-slate-400">Pax:</span>{" "}
              <span className="font-medium">{loadsheet.total_pax}</span>
            </span>
            <span>
              <span className="text-slate-500 dark:text-slate-400">Fuel:</span>{" "}
              <span className="font-medium">{sectors.length > 0 ? `${Number(sectors[0].fuel_on_board_kg)}kg` : "Ã¢â‚¬â€"}</span>
            </span>
          </div>
        </div>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Key metrics Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <div className="rounded-lg bg-white dark:bg-slate-800 p-2.5 shadow-sm dark:shadow-slate-900/20 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Crew Wt</div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{Number(loadsheet.pilot_weight_kg)}kg</div>
          </div>
          <div className="rounded-lg bg-white dark:bg-slate-800 p-2.5 shadow-sm dark:shadow-slate-900/20 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Pax Wt</div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{passengers.reduce((s, p) => s + p.clothedWeightKg, 0)}kg</div>
          </div>
          <div className="rounded-lg bg-white dark:bg-slate-800 p-2.5 shadow-sm dark:shadow-slate-900/20 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Baggage</div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{passengers.reduce((s, p) => s + p.baggageWeightKg, 0)}kg</div>
          </div>
          <div className="rounded-lg bg-white dark:bg-slate-800 p-2.5 shadow-sm dark:shadow-slate-900/20 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Legs</div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{sectors.length}</div>
          </div>
          <div className="rounded-lg bg-white dark:bg-slate-800 p-2.5 shadow-sm dark:shadow-slate-900/20 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">W&amp;B</div>
            <div className={`text-sm font-bold ${
              sectors.some((s) => s.tow_status === "violation" || s.cog_status === "violation") ? "text-red-600" :
              sectors.some((s) => s.tow_status === "warning" || s.cog_status === "warning") ? "text-amber-600" :
              "text-green-600"
            }`}>
              {sectors.some((s) => s.tow_status === "violation" || s.cog_status === "violation") ? "VIOLATION" :
               sectors.some((s) => s.tow_status === "warning" || s.cog_status === "warning") ? "Warning" : "OK"}
            </div>
          </div>
        </div>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Passenger Manifest Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <div className="mb-4 overflow-x-auto rounded-lg bg-white dark:bg-slate-800 shadow-sm dark:shadow-slate-900/20">
          <div className="p-3 sm:p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Passenger Manifest</h2>
            <div className="min-w-[700px]">
              <table className="w-full text-xs border-separate" style={{ borderSpacing: 0 }}>
                <thead>
                  <tr className="text-left">
                    <th className="py-1.5 pr-2 font-medium text-slate-500 dark:text-slate-400 w-14 sticky left-0 bg-white dark:bg-slate-800 z-10">Seat</th>
                    <th className="py-1.5 pr-2 font-medium text-slate-500 dark:text-slate-400 w-36 sticky left-[56px] bg-white dark:bg-slate-800 z-10">Passenger</th>
                    <th className="py-1.5 pr-2 font-medium text-slate-500 dark:text-slate-400 w-14">Wt</th>
                    <th className="py-1.5 pr-2 font-medium text-slate-500 dark:text-slate-400 w-14">Bag</th>
                    {stopCodes.map((code, i) => (
                      <th key={`${code}-${i}`} className={`py-1.5 px-1 text-center font-medium text-slate-500 dark:text-slate-400 ${code === "STY" ? "w-12" : "w-16"}`}>
                        <span className={code === "STY" ? "text-cyan-600 text-[10px]" : ""}>{code}</span>
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <td colSpan={4 + stopCodes.length} className="p-0">
                      <div className="border-t border-slate-200 dark:border-slate-700" />
                    </td>
                  </tr>
                </thead>
                <tbody>
                  {passengers.map((p) => {
                    const originIdx = stopCodes.indexOf(p.origin);
                    const destIdx = stopCodes.indexOf(p.destination);
                    return (
                      <tr key={p.id} className="hover:bg-slate-50 dark:bg-slate-700">
                        <td className="py-1.5 pr-2 border-b border-slate-100 dark:border-slate-700 sticky left-0 bg-white dark:bg-slate-800">
                          <span className="rounded bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300 dark:text-slate-500">
                            {p.seat}
                          </span>
                        </td>
                        <td className="py-1.5 pr-2 border-b border-slate-100 dark:border-slate-700 font-medium text-slate-700 dark:text-slate-200 truncate max-w-[140px] sticky left-[56px] bg-white dark:bg-slate-800">
                          {p.name}
                        </td>
                        <td className="py-1.5 pr-2 border-b border-slate-100 dark:border-slate-700 font-mono text-slate-500 dark:text-slate-400">
                          {p.clothedWeightKg}kg
                        </td>
                        <td className="py-1.5 pr-2 border-b border-slate-100 dark:border-slate-700 font-mono text-slate-500 dark:text-slate-400">
                          {p.baggageWeightKg > 0 ? `${p.baggageWeightKg}kg` : "Ã¢â‚¬â€"}
                        </td>
                        {stopCodes.map((code, i) => {
                          const isOrigin = p.origin === code;
                          const isDestination = p.destination === code;
                          const isBetween = originIdx >= 0 && destIdx >= 0 && i > originIdx && i < destIdx;
                          return (
                            <td key={`${p.id}-${i}`} className="py-1.5 px-0.5 border-b border-slate-100 dark:border-slate-700 text-center">
                              {isOrigin ? (
                                <span className="inline-flex items-center gap-0">
                                  <span className="h-0.5 flex-1 bg-cyan-400 rounded-l" />
                                  <span className="h-2 w-2 rounded-full bg-cyan-500 ring-1 ring-cyan-200" />
                                  <span className="h-0.5 flex-1 bg-cyan-400 rounded-r" />
                                </span>
                              ) : isDestination ? (
                                <span className="inline-flex items-center gap-0">
                                  <span className={`h-0.5 flex-1 ${originIdx >= 0 && i > originIdx ? "bg-cyan-400" : "bg-transparent"} rounded-l`} />
                                  <span className="h-2 w-2 rounded-full border-2 border-cyan-500 bg-white dark:bg-slate-800" />
                                  <span className="h-0.5 flex-1 bg-transparent rounded-r" />
                                </span>
                              ) : isBetween ? (
                                <span className="h-0.5 w-full bg-cyan-300 inline-block rounded" />
                              ) : (
                                <span className="text-[10px] text-slate-200">Ã¢â‚¬â€</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {/* Baggage row */}
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700">
                    <td className="py-1.5 pr-2 sticky left-0 bg-white dark:bg-slate-800" colSpan={2}>
                      <span className="text-[10px] font-medium text-amber-600">Aft Hold (Baggage)</span>
                    </td>
                    <td className="py-1.5 pr-2 text-[10px] text-slate-500 dark:text-slate-400">Ã¢â‚¬â€</td>
                    <td className="py-1.5 pr-2 font-mono text-slate-500 dark:text-slate-400">
                      {passengers.reduce((s, p) => s + p.baggageWeightKg, 0)}kg
                    </td>
                    {stopCodes.map((_, i) => (
                      <td key={`bag-${i}`} className="py-1.5 px-1 text-center">
                        <span className="h-0.5 w-full bg-amber-200 inline-block rounded" />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex items-center gap-4 text-[10px] text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-cyan-500 ring-1 ring-cyan-200" /> Board
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full border-2 border-cyan-500 bg-white dark:bg-slate-800" /> Alight
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-0.5 w-4 bg-cyan-300 rounded" /> In transit
              </span>
            </div>
          </div>
        </div>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Sector Calculations + Weight & Balance Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <div className="mb-4 overflow-x-auto rounded-lg bg-white dark:bg-slate-800 shadow-sm dark:shadow-slate-900/20">
          <div className="p-3 sm:p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Sector Calculations &amp; Weight/Balance</h2>
            <div className="min-w-[900px]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
                    <th className="py-1.5 pr-2 font-medium text-slate-500 dark:text-slate-400 w-6">#</th>
                    <th className="py-1.5 pr-2 font-medium text-slate-500 dark:text-slate-400">From{'\u2192'}To</th>
                    <th className="py-1.5 pr-2 font-medium text-slate-500 dark:text-slate-400 w-11">Dist</th>
                    <th className="py-1.5 pr-2 font-medium text-slate-500 dark:text-slate-400 w-11">Plan</th>
                    <th className="py-1.5 pr-2 font-medium text-slate-500 dark:text-slate-400 w-12">ETD</th>
                    <th className="py-1.5 pr-2 font-medium text-slate-500 dark:text-slate-400 w-12">ETA</th>
                    {canEnterActual && canPerformInFlight && (
                      <>
                        <th className="py-1.5 pr-2 font-medium text-slate-500 dark:text-slate-400 w-12">ATD</th>
                        <th className="py-1.5 pr-2 font-medium text-slate-500 dark:text-slate-400 w-12">ATA</th>
                      </>
                    )}
                    {/* Ã¢â€â‚¬Ã¢â€â‚¬ W&B columns Ã¢â€â‚¬Ã¢â€â‚¬ */}
                    <th className="py-1.5 pr-2 font-medium text-slate-500 dark:text-slate-400 w-14 border-l-2 border-indigo-200 pl-2">TOW</th>
                    <th className="py-1.5 pr-2 font-medium text-slate-500 dark:text-slate-400 w-14 bg-indigo-50/50">LW</th>
                    <th className="py-1.5 pr-2 font-medium text-slate-500 dark:text-slate-400 w-14 bg-indigo-50/50">CG</th>
                    <th className="py-1.5 pr-2 font-medium text-slate-500 dark:text-slate-400 w-16 bg-indigo-50/50">W&amp;B</th>
                    {/* Ã¢â€â‚¬Ã¢â€â‚¬ Fuel columns Ã¢â€â‚¬Ã¢â€â‚¬ */}
                    <th className="py-1.5 pr-2 font-medium text-slate-500 dark:text-slate-400 w-11 border-l-2 border-amber-200 pl-2">FOB</th>
                    <th className="py-1.5 pr-2 font-medium text-slate-500 dark:text-slate-400 w-11 bg-amber-50/30">Burn</th>
                    <th className="py-1.5 pr-2 font-medium text-slate-500 dark:text-slate-400 w-11 bg-amber-50/30">Rem</th>
                  </tr>
                </thead>
                <tbody>
                  {sectors.map((s) => {
                    const fuelLow = s.fuel_remaining_kg != null && Number(s.fuel_remaining_kg) < 10;
                    const hasViolation = s.tow_status === "violation" || s.cog_status === "violation";
                    const hasWarning = s.tow_status === "warning" || s.cog_status === "warning";
                    return (
                    <tr key={s.leg_sequence} className="border-b border-slate-100 dark:border-slate-700">
                      <td className="py-1.5 pr-2 font-mono text-slate-600 dark:text-slate-300 dark:text-slate-500">{s.leg_sequence}</td>
                      <td className="py-1.5 pr-2 font-medium text-slate-700 dark:text-slate-200">{s.origin_code}{'\u2192'}{s.destination_code}</td>
                      <td className="py-1.5 pr-2 font-mono text-slate-500 dark:text-slate-400">{Number(s.distance_nm)}</td>
                      <td className="py-1.5 pr-2 font-mono text-slate-500 dark:text-slate-400">{s.planned_time_min}m</td>
                      <td className="py-1.5 pr-2 font-mono text-slate-600 dark:text-slate-300 dark:text-slate-500">{s.etd}</td>
                      <td className="py-1.5 pr-2 font-mono text-slate-600 dark:text-slate-300 dark:text-slate-500">{s.eta}</td>
                      {canEnterActual && canPerformInFlight && (
                        <>
                          <td className="py-1.5 pr-2">
                            <input type="text" inputMode="numeric" maxLength={4} defaultValue={s.atd ?? ""}
                              className="w-12 rounded border border-slate-200 dark:border-slate-700 px-1 py-0.5 text-xs font-mono focus:border-cyan-400 focus:outline-none text-center"
                              placeholder="0800"
                              onBlur={(e) => fetcher.submit({ intent: "update-sector", sectorId: String(s.id), atd: e.target.value, ata: s.ata ?? "" }, { method: "post" })} />
                          </td>
                          <td className="py-1.5 pr-2">
                            <input type="text" inputMode="numeric" maxLength={4} defaultValue={s.ata ?? ""}
                              className="w-12 rounded border border-slate-200 dark:border-slate-700 px-1 py-0.5 text-xs font-mono focus:border-cyan-400 focus:outline-none text-center"
                              placeholder="0800"
                              onBlur={(e) => fetcher.submit({ intent: "update-sector", sectorId: String(s.id), atd: s.atd ?? "", ata: e.target.value }, { method: "post" })} />
                          </td>
                        </>
                      )}
                      {/* Ã¢â€â‚¬Ã¢â€â‚¬ W&B cells Ã¢â€â‚¬Ã¢â€â‚¬ */}
                      <td className={`py-1.5 pr-2 font-mono border-l-2 border-indigo-100 pl-2 ${
                        s.tow_status === "violation" ? "text-red-600 bg-red-50 dark:bg-red-900/30 font-bold" :
                        s.tow_status === "warning" ? "text-amber-600 bg-amber-50" : "text-slate-600 dark:text-slate-300 dark:text-slate-500"
                      }`} title={s.notes ?? undefined}>
                        {Number(s.takeoff_weight_kg)}
                      </td>
                      <td className={`py-1.5 pr-2 font-mono bg-indigo-50/30 ${
                        s.tow_status === "violation" ? "text-red-600" : "text-slate-600 dark:text-slate-300 dark:text-slate-500"
                      }`}>{Number(s.landing_weight_kg)}</td>
                      <td className={`py-1.5 pr-2 font-mono bg-indigo-50/30 ${
                        s.cog_status === "violation" ? "text-red-600 bg-red-50 dark:bg-red-900/30 font-bold" :
                        s.cog_status === "warning" ? "text-amber-600 bg-amber-50" : "text-slate-600 dark:text-slate-300 dark:text-slate-500"
                      }`} title={s.notes ?? undefined}>
                        {Number(s.cog_position_mm).toFixed(1)}
                      </td>
                      <td className="py-1.5 pr-2 bg-indigo-50/30">
                        {hasViolation ? (
                          <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700" title={s.notes ?? undefined}>
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                            {s.tow_status === "violation" ? "MTOW" : "CG"}
                          </span>
                        ) : hasWarning ? (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700" title={s.notes ?? undefined}>
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            {s.tow_status === "warning" ? "MTOW" : "CG"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> OK
                          </span>
                        )}
                      </td>
                      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Fuel cells Ã¢â€â‚¬Ã¢â€â‚¬ */}
                      <td className="py-1.5 pr-2 font-mono text-slate-600 dark:text-slate-300 border-l-2 border-amber-100 pl-2">{Number(s.fuel_on_board_kg)}</td>
                      <td className="py-1.5 pr-2 font-mono text-slate-600 dark:text-slate-300 bg-amber-50/30">{Number(s.fuel_burn_kg)}</td>
                      <td className={`py-1.5 pr-2 font-mono bg-amber-50/30 font-semibold ${fuelLow ? "text-red-600" : "text-slate-600 dark:text-slate-300 dark:text-slate-500"}`}>
                        {Number(s.fuel_remaining_kg)}
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex items-center gap-4 text-[10px] text-slate-500 dark:text-slate-400">
              <span>CG limits: 81.0Ã¢â‚¬Â³Ã¢â‚¬â€œ101.0Ã¢â‚¬Â³ (2057Ã¢â‚¬â€œ2565 mm)</span>
              <span className="text-slate-300 dark:text-slate-500">|</span>
              <span>MTOW: {sectors[0]?.takeoff_weight_kg ? `${Number(sectors[0].takeoff_weight_kg)}kg` : "Ã¢â‚¬â€"}</span>
              <span className="text-slate-300 dark:text-slate-500">|</span>
              <span>Bordered columns = Weight &amp; Balance</span>
            </div>
          </div>
        </div>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Actions Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && canPerformInFlight && (
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="regenerate" />
              <button type="submit" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-700">
                Regenerate
              </button>
            </fetcher.Form>
          )}
          {(loadsheet.status === "active" || loadsheet.status === "review") && canPerformInFlight && (
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="finalize" />
              <button type="submit" className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
                Finalize Loadsheet
              </button>
            </fetcher.Form>
          )}
          {isLocked && (
            <p className="text-xs text-slate-500 dark:text-slate-400 italic">This loadsheet is locked and cannot be modified.</p>
          )}
        </div>
          </div>

          {/* Seat Map with CG Impact */}
          {passengers.length > 0 && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 mt-4 p-4">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">Seat Assignment &amp; CG</h3>
              <SeatMap
                passengers={passengers.map((p) => ({
                  id: p.id,
                  name: p.name || `Passenger ${p.id}`,
                  weightKg: Number(p.clothedWeightKg ?? 70),
                }))}
                assignments={{}}
                onAssign={() => {}}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="mx-auto max-w-lg text-center px-4">
          <div className="mb-4 text-5xl font-bold text-slate-300 dark:text-slate-600">{error.status}</div>
          <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Something went wrong</h1>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">{error.statusText}</p>
          <button onClick={() => window.location.reload()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">Try Again</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="mx-auto max-w-lg text-center px-4">
        <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Unexpected Error</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">An unexpected error occurred. Please try again.</p>
        <button onClick={() => window.location.reload()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">Try Again</button>
      </div>
    </div>
  );
}
