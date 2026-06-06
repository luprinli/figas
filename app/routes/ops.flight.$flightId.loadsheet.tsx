import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, Link, useNavigate } from "@remix-run/react";
import { useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { useEffect, useCallback } from "react";
import { loadsheetRepository, canEditLoadsheet, canEnterActualData, isImmutable } from "../utils/loadsheet/loadsheet-repository.server";
import { createLoadsheetFromFlight } from "../utils/loadsheet/create-loadsheet.server";
import { requireUser } from "../utils/layout.server";
import { hasPermission, requirePermission } from "../utils/permissions.server";
import { db } from "../utils/db.server";
import SeatMap from "../components/seat-map/SeatMap";

function formatTime(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === "string") {
    const cleaned = val.replace(/^1970-01-01T/, "").replace(/\.000Z$/, "").replace(/:\d{2}\.\d{3}Z$/, "").substring(0, 5);
    return cleaned || null;
  }
  if (val instanceof Date) {
    const h = String(val.getUTCHours()).padStart(2, "0");
    const m = String(val.getUTCMinutes()).padStart(2, "0");
    return `${h}${m}`;
  }
  return null;
}

export async function loader({ params, request }: LoaderFunctionArgs) {
  const { userId } = await requireUser(request);
  const flightId = Number(params.flightId);
  if (!flightId) throw new Response("Flight ID required", { status: 400 });

  let loadsheet = await loadsheetRepository.findByFlightId(flightId);
  if (!loadsheet) {
    const createdId = await createLoadsheetFromFlight(flightId);
    loadsheet = createdId ? await loadsheetRepository.findById(createdId) : null;
  }

  if (!loadsheet) throw new Response("Loadsheet not found", { status: 404 });

  const passengers = await loadsheetRepository.findPassengers(loadsheet.id);
  let sectors = await loadsheetRepository.findSectors(loadsheet.id);

  // If sectors are empty (e.g. loadsheet was created before migration was applied),
  // regenerate the loadsheet data.
  if (sectors.length === 0) {
    await loadsheetRepository.deleteByFlightId(flightId);
    const createdId = await createLoadsheetFromFlight(flightId);
    const regenerated = createdId ? await loadsheetRepository.findById(createdId) : null;
    if (!regenerated) {
      throw new Response("Failed to regenerate loadsheet", { status: 500 });
    }
    loadsheet = regenerated;
    sectors = await loadsheetRepository.findSectors(loadsheet.id);
  }

  // ── Flight metadata (number, pilot, aircraft) ───────────────────────────
  const flight = await db.flights.findUnique({
    where: { id: flightId },
    select: { flight_number: true, departure_time: true, arrival_time: true },
  });
  const pilot = loadsheet.pilot_id
    ? await db.pilots.findUnique({ where: { id: Number(loadsheet.pilot_id) }, select: { name: true } })
    : null;
  const aircraft = loadsheet.aircraft_id
    ? await db.aircraft.findUnique({ where: { id: Number(loadsheet.aircraft_id) }, select: { registration: true, type: true } })
    : null;

  // ── Passenger names + origin/destination ────────────────────────────────
  const passengerIds = passengers.map((p) => p.booking_passenger_id);
  let passengerNames: Record<number, string> = {};
  let passengerLegData: Record<number, { origin: string; destination: string }> = {};
  if (passengerIds.length > 0) {
    const nameRows = await db.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT bp.id, CONCAT(bp.first_name, ' ', bp.last_name) AS name
       FROM booking_passengers bp
       WHERE bp.id = ANY($1::int[])`,
      passengerIds
    );
    for (const r of (nameRows as Array<{ id: number | bigint; name: string }>)) {
      passengerNames[Number(r.id)] = r.name;
    }
  }
  const legIds = [...new Set(passengers.map((p) => p.booking_leg_id))];
  if (legIds.length > 0) {
    const legRows = await db.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT id, origin_code, destination_code FROM booking_legs WHERE id = ANY($1::int[])`,
      legIds
    );
    for (const r of (legRows as Array<{ id: number | bigint; origin_code: string; destination_code: string }>)) {
      passengerLegData[Number(r.id)] = { origin: r.origin_code, destination: r.destination_code };
    }
  }

  // ── Build route stops (STY → ... → STY) ────────────────────────────────
  const stopCodes: string[] = ["STY"];
  for (const s of sectors) {
    if (s.destination_code && s.destination_code !== "STY") {
      if (!stopCodes.includes(s.destination_code)) stopCodes.push(s.destination_code);
    }
  }
  if (stopCodes[stopCodes.length - 1] !== "STY") stopCodes.push("STY");

  const canPerformInFlight = await hasPermission(Number(userId), "loadsheet:edit");

  return json({
    loadsheet: {
      ...loadsheet,
      created_at: loadsheet.created_at?.toString() ?? null,
      updated_at: loadsheet.updated_at?.toString() ?? null,
      finalized_at: loadsheet.finalized_at?.toString() ?? null,
      archived_at: loadsheet.archived_at?.toString() ?? null,
    },
    flightNumber: flight?.flight_number ?? `Flight #${flightId}`,
    departureTime: flight?.departure_time ? new Date(flight.departure_time).toISOString() : null,
    pilotName: pilot?.name ?? "Unassigned",
    aircraftRegistration: aircraft?.registration ?? "Unassigned",
    aircraftType: aircraft?.type ?? "",
    passengers: passengers.map((p) => ({
      id: p.id,
      seat: `${p.seat_row ?? "?"}${p.seat_side ?? ""}`,
      name: passengerNames[p.booking_passenger_id] ?? `Passenger #${p.booking_passenger_id}`,
      bookingLegId: p.booking_leg_id,
      origin: passengerLegData[p.booking_leg_id]?.origin ?? "?",
      destination: passengerLegData[p.booking_leg_id]?.destination ?? "?",
      clothedWeightKg: Number(p.clothed_weight_kg ?? 0),
      baggageWeightKg: Number(p.baggage_weight_kg ?? 0),
      boarded: p.boarded,
    })),
    sectors: sectors.map((s) => ({
      ...s,
      etd: formatTime(s.etd),
      eta: formatTime(s.eta),
      atd: formatTime(s.atd),
      ata: formatTime(s.ata),
    })),
    stopCodes,
    canEdit: canEditLoadsheet(loadsheet.status) && canPerformInFlight,
    canEnterActual: canEnterActualData(loadsheet.status) && canPerformInFlight,
    isLocked: isImmutable(loadsheet.status),
    canPerformInFlight,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { userId } = await requireUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();
  const flightId = Number(params.flightId);

  await requirePermission(request, "loadsheet:edit");

  let loadsheet = await loadsheetRepository.findByFlightId(flightId);
  if (!loadsheet) return json({ error: "Not found" }, { status: 404 });

  switch (intent) {
    case "regenerate": {
      await loadsheetRepository.deleteByFlightId(flightId);
      await createLoadsheetFromFlight(flightId);
      return json({ success: true });
    }
    case "toggle-boarding": {
      const passengerId = Number(formData.get("passengerId"));
      const current = formData.get("boarded") === "true";
      if (!canEnterActualData(loadsheet.status)) {
        return json({ error: "Cannot modify this loadsheet" }, { status: 400 });
      }
      await loadsheetRepository.updatePassengerBoarding(passengerId, !current);
      return json({ success: true });
    }
    case "update-sector": {
      const sectorId = Number(formData.get("sectorId"));
      const atd = formData.get("atd")?.toString() || null;
      const ata = formData.get("ata")?.toString() || null;
      if (!canEnterActualData(loadsheet.status)) {
        return json({ error: "Cannot modify sector times" }, { status: 400 });
      }
      let actualTimeMin: number | null = null;
      if (atd && ata) {
        const [atdH, atdM] = atd.split(":").map(Number);
        const [ataH, ataM] = ata.split(":").map(Number);
        actualTimeMin = (ataH * 60 + ataM) - (atdH * 60 + atdM);
        if (actualTimeMin < 0) actualTimeMin += 24 * 60;
      }
      await loadsheetRepository.updateSectorATD(sectorId, atd, ata, actualTimeMin);
      return json({ success: true });
    }
    case "finalize": {
      if (!canEditLoadsheet(loadsheet.status) && loadsheet.status !== "active") {
        return json({ error: "Can only finalize active loadsheets" }, { status: 400 });
      }
      const checksum = "";
      await loadsheetRepository.finalize(loadsheet.id, 1, checksum);
      await loadsheetRepository.logAudit({ loadsheet_id: loadsheet.id, action: "finalized" });
      return json({ success: true });
    }
    default:
      return json({ error: "Unknown intent" }, { status: 400 });
  }
}

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
    draft: "bg-amber-100 text-amber-700",
    review: "bg-blue-100 text-blue-700",
    active: "bg-emerald-100 text-emerald-700",
    finalized: "bg-slate-200 text-slate-600 dark:text-slate-300 dark:text-slate-500",
    archived: "bg-slate-300 text-slate-500 dark:text-slate-400 dark:text-slate-500",
  };

  const depDate = departureTime ? new Date(departureTime).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto">
      {/* Overlay backdrop — click to close */}
      <div
        className="fixed inset-0 bg-slate-900/50 dark:bg-slate-950/70 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />
      {/* Content panel */}
      <div className="relative z-10 w-full max-w-5xl min-h-screen my-0">
        {/* Close button — fixed position */}
        <button
          type="button"
          onClick={handleClose}
          className="fixed top-4 right-4 z-20 rounded-full bg-white dark:bg-slate-800 p-2 shadow-lg dark:shadow-slate-900/50 ring-1 ring-slate-200 dark:ring-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          aria-label="Close loadsheet"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
        {/* Main content */}
        <div className="bg-slate-50 dark:bg-slate-900">
          <div className="mx-auto max-w-5xl px-3 py-4 sm:px-6 sm:py-6">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="mb-4 rounded-lg bg-white dark:bg-slate-800 p-3 shadow-sm dark:shadow-slate-900/20 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div>
              <Link to="/operations/schedule" className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:text-slate-300 dark:text-slate-500">← Schedule</Link>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 sm:text-xl">{flightNumber} Loadsheet</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{depDate}</p>
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
              <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">Pilot:</span>{" "}
              <span className="font-medium">{pilotName}</span>
            </span>
            <span>
              <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">Aircraft:</span>{" "}
              <span className="font-medium">{aircraftType} {aircraftRegistration}</span>
            </span>
            <span>
              <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">Empty Wt:</span>{" "}
              <span className="font-medium">{Number(loadsheet.empty_weight_kg)}kg</span>
            </span>
            <span>
              <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">Pax:</span>{" "}
              <span className="font-medium">{loadsheet.total_pax}</span>
            </span>
            <span>
              <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">Fuel:</span>{" "}
              <span className="font-medium">{sectors.length > 0 ? `${Number(sectors[0].fuel_on_board_kg)}kg` : "—"}</span>
            </span>
          </div>
        </div>

        {/* ── Key metrics ─────────────────────────────────────────────── */}
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <div className="rounded-lg bg-white dark:bg-slate-800 p-2.5 shadow-sm dark:shadow-slate-900/20 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500">Crew Wt</div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{Number(loadsheet.pilot_weight_kg)}kg</div>
          </div>
          <div className="rounded-lg bg-white dark:bg-slate-800 p-2.5 shadow-sm dark:shadow-slate-900/20 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500">Total Pax Wt</div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{passengers.reduce((s, p) => s + p.clothedWeightKg, 0)}kg</div>
          </div>
          <div className="rounded-lg bg-white dark:bg-slate-800 p-2.5 shadow-sm dark:shadow-slate-900/20 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500">Baggage</div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{passengers.reduce((s, p) => s + p.baggageWeightKg, 0)}kg</div>
          </div>
          <div className="rounded-lg bg-white dark:bg-slate-800 p-2.5 shadow-sm dark:shadow-slate-900/20 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500">Legs</div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{sectors.length}</div>
          </div>
          <div className="rounded-lg bg-white dark:bg-slate-800 p-2.5 shadow-sm dark:shadow-slate-900/20 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500">W&amp;B</div>
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

        {/* ── Passenger Manifest ───────────────────────────────────────── */}
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
                        <td className="py-1.5 pr-2 border-b border-slate-100 sticky left-0 bg-white dark:bg-slate-800">
                          <span className="rounded bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300 dark:text-slate-500">
                            {p.seat}
                          </span>
                        </td>
                        <td className="py-1.5 pr-2 border-b border-slate-100 font-medium text-slate-700 dark:text-slate-200 truncate max-w-[140px] sticky left-[56px] bg-white dark:bg-slate-800">
                          {p.name}
                        </td>
                        <td className="py-1.5 pr-2 border-b border-slate-100 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">
                          {p.clothedWeightKg}kg
                        </td>
                        <td className="py-1.5 pr-2 border-b border-slate-100 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">
                          {p.baggageWeightKg > 0 ? `${p.baggageWeightKg}kg` : "—"}
                        </td>
                        {stopCodes.map((code, i) => {
                          const isOrigin = p.origin === code;
                          const isDestination = p.destination === code;
                          const isBetween = originIdx >= 0 && destIdx >= 0 && i > originIdx && i < destIdx;
                          return (
                            <td key={`${p.id}-${i}`} className="py-1.5 px-0.5 border-b border-slate-100 text-center">
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
                                <span className="text-[10px] text-slate-200">—</span>
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
                    <td className="py-1.5 pr-2 text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500">—</td>
                    <td className="py-1.5 pr-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">
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
            <div className="mt-2 flex items-center gap-4 text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
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

        {/* ── Sector Calculations + Weight & Balance ────────────────── */}
        <div className="mb-4 overflow-x-auto rounded-lg bg-white dark:bg-slate-800 shadow-sm dark:shadow-slate-900/20">
          <div className="p-3 sm:p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Sector Calculations &amp; Weight/Balance</h2>
            <div className="min-w-[900px]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
                    <th className="py-1.5 pr-2 font-medium text-slate-500 dark:text-slate-400 w-6">#</th>
                    <th className="py-1.5 pr-2 font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">From→To</th>
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
                    {/* ── W&B columns ── */}
                    <th className="py-1.5 pr-2 font-medium text-slate-500 dark:text-slate-400 w-14 border-l-2 border-indigo-200 pl-2">TOW</th>
                    <th className="py-1.5 pr-2 font-medium text-slate-500 dark:text-slate-400 w-14 bg-indigo-50/50">LW</th>
                    <th className="py-1.5 pr-2 font-medium text-slate-500 dark:text-slate-400 w-14 bg-indigo-50/50">CG</th>
                    <th className="py-1.5 pr-2 font-medium text-slate-500 dark:text-slate-400 w-16 bg-indigo-50/50">W&amp;B</th>
                    {/* ── Fuel columns ── */}
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
                    <tr key={s.leg_sequence} className="border-b border-slate-100">
                      <td className="py-1.5 pr-2 font-mono text-slate-600 dark:text-slate-300 dark:text-slate-500">{s.leg_sequence}</td>
                      <td className="py-1.5 pr-2 font-medium text-slate-700 dark:text-slate-200">{s.origin_code}→{s.destination_code}</td>
                      <td className="py-1.5 pr-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">{Number(s.distance_nm)}</td>
                      <td className="py-1.5 pr-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">{s.planned_time_min}m</td>
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
                      {/* ── W&B cells ── */}
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
                      {/* ── Fuel cells ── */}
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
            <div className="mt-2 flex items-center gap-4 text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
              <span>CG limits: 81.0″–101.0″ (2057–2565 mm)</span>
              <span className="text-slate-300 dark:text-slate-500">|</span>
              <span>MTOW: {sectors[0]?.takeoff_weight_kg ? `${Number(sectors[0].takeoff_weight_kg)}kg` : "—"}</span>
              <span className="text-slate-300 dark:text-slate-500">|</span>
              <span>Bordered columns = Weight &amp; Balance</span>
            </div>
          </div>
        </div>

        {/* ── Actions ──────────────────────────────────────────────────── */}
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
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-700 dark:bg-slate-900">
        <div className="mx-auto max-w-lg text-center px-4">
          <div className="mb-4 text-5xl font-bold text-slate-300 dark:text-slate-500 dark:text-slate-600 dark:text-slate-300 dark:text-slate-500">{error.status}</div>
          <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Something went wrong</h1>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">{error.statusText}</p>
          <button onClick={() => window.location.reload()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Try Again</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-700 dark:bg-slate-900">
      <div className="mx-auto max-w-lg text-center px-4">
        <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Unexpected Error</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">An unexpected error occurred. Please try again.</p>
        <button onClick={() => window.location.reload()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Try Again</button>
      </div>
    </div>
  );
}