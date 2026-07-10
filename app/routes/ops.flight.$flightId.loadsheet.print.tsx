import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData , useRouteError, isRouteErrorResponse } from "@remix-run/react";

import { loadsheetRepository } from "../utils/loadsheet/loadsheet-repository.server";
import { createLoadsheetFromFlight } from "../utils/loadsheet/create-loadsheet.server";
import { requireUser } from "../utils/layout.server";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";

function formatTime(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === "string") {
    const cleaned = val.replace(/^1970-01-01T/, "").replace(/\.000Z$/, "").replace(/:\d{2}\.\d{3}Z$/, "").substring(0, 5);
    return cleaned?.replace(":", "") || null;
  }
  if (val instanceof Date) {
    const h = String(val.getUTCHours()).padStart(2, "0");
    const m = String(val.getUTCMinutes()).padStart(2, "0");
    return `${h}${m}`;
  }
  return null;
}

export async function loader({ params, request }: LoaderFunctionArgs) {
  await requireUser(request);
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
  if (sectors.length === 0) {
    await loadsheetRepository.deleteByFlightId(flightId);
    const createdId = await createLoadsheetFromFlight(flightId);
    const regenerated = createdId ? await loadsheetRepository.findById(createdId) : null;
    if (!regenerated) throw new Response("Failed to regenerate loadsheet", { status: 500 });
    loadsheet = regenerated;
    sectors = await loadsheetRepository.findSectors(loadsheet.id);
  }

  const flight = (await kdb.selectFrom("flights").select(["flight_number", "departure_time"]).where("id", "=", flightId).execute())[0] ?? null;
  const pilot = loadsheet.pilot_id
    ? (await kdb.selectFrom("pilots").select("name").where("id", "=", Number(loadsheet.pilot_id)).execute())[0] ?? null
    : null;
  const aircraft = loadsheet.aircraft_id
    ? (await kdb.selectFrom("aircraft").select(["registration", "type"]).where("id", "=", Number(loadsheet.aircraft_id)).execute())[0] ?? null
    : null;

  const passengerIds = passengers.map((p) => p.booking_passenger_id);
  const passengerNames: Record<number, string> = {};
  const passengerLegData: Record<number, { origin: string; destination: string }> = {};
  if (passengerIds.length > 0) {
    const nameRows = await sql<{ id: number | bigint; name: string }>`
      SELECT bp.id, CONCAT(bp.first_name, ' ', bp.last_name) AS name FROM booking_passengers bp WHERE bp.id = ANY(${passengerIds}::int[])
    `.execute(kdb);
    for (const r of nameRows.rows) {
      passengerNames[Number(r.id)] = r.name;
    }
  }
  const legIds = [...new Set(passengers.map((p) => p.booking_leg_id))];
  if (legIds.length > 0) {
    const legRows = await sql<{ id: number | bigint; origin_code: string; destination_code: string }>`
      SELECT id, origin_code, destination_code FROM booking_legs WHERE id = ANY(${legIds}::int[])
    `.execute(kdb);
    for (const r of legRows.rows) {
      passengerLegData[Number(r.id)] = { origin: r.origin_code, destination: r.destination_code };
    }
  }

  const stopCodes: string[] = ["STY"];
  for (const s of sectors) {
    if (s.destination_code && s.destination_code !== "STY" && !stopCodes.includes(s.destination_code)) {
      stopCodes.push(s.destination_code);
    }
  }
  if (stopCodes[stopCodes.length - 1] !== "STY") stopCodes.push("STY");

  const depDate = flight?.departure_time
    ? new Date(String(flight.departure_time)).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return json({
    loadsheet: { id: loadsheet.id, status: loadsheet.status, total_pax: loadsheet.total_pax, empty_weight_kg: loadsheet.empty_weight_kg, pilot_weight_kg: loadsheet.pilot_weight_kg },
    flightNumber: flight?.flight_number ?? `Flight #${flightId}`,
    departureTime: flight?.departure_time?.toString() ?? null,
    depDate,
    pilotName: pilot?.name ?? "Unassigned",
    aircraftRegistration: aircraft?.registration ?? "Unassigned",
    aircraftType: aircraft?.type ?? "",
    passengers: passengers.map((p) => ({
      id: p.id,
      seat: `${p.seat_row ?? "?"}${p.seat_side ?? ""}`,
      name: passengerNames[p.booking_passenger_id] ?? `Pax #${p.booking_passenger_id}`,
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
    totalPaxWt: passengers.reduce((s, p) => s + Number(p.clothed_weight_kg ?? 0), 0),
    totalBaggage: passengers.reduce((s, p) => s + Number(p.baggage_weight_kg ?? 0), 0),
    startingFuel: sectors.length > 0 ? Number(sectors[0].fuel_on_board_kg) : 0,
    totalBurn: sectors.reduce((s, sec) => s + Number(sec.fuel_burn_kg ?? 0), 0),
    finalRemaining: sectors.length > 0 ? Number(sectors[sectors.length - 1].fuel_remaining_kg) : 0,
    now: new Date().toISOString(),
    contactEmail: process.env.CONTACT_EMAIL || "ops@figas.gov.fk",
    contactPhone: process.env.CONTACT_PHONE || "+500 27219",
  });
}

export default function PrintLoadsheet() {
  const data = useLoaderData<typeof loader>();
  const TEAL = "#06b6d4";

  const s = (v: unknown) => (v != null ? String(v) : "—");

  return (
    <div>
      {/* Fallback button if auto-print is blocked */}
      <div className="no-print fixed top-4 right-4 z-50">
        <button
          onClick={() => window.print()}
          className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white shadow-lg dark:shadow-slate-900/50 hover:bg-cyan-700"
        >
          Print Loadsheet
        </button>
      </div>

      {/* ── Page 1: Passenger Manifest ── */}
      <div className="print-page mx-auto mb-4 max-w-[277mm] rounded border border-slate-300 dark:border-slate-600 dark:border-slate-600 bg-white dark:bg-slate-800 p-[8mm] shadow-sm dark:shadow-slate-900/20" style={{ width: "277mm", minHeight: "190mm" }}>
        <PrintHeader flightNumber={data.flightNumber} depDate={data.depDate} aircraftType={data.aircraftType} aircraftReg={data.aircraftRegistration} pilotName={data.pilotName} pageTitle="PASSENGER MANIFEST" contactEmail={data.contactEmail} contactPhone={data.contactPhone} />

        <table className="my-3 w-full border-collapse text-[8pt]">
          <thead>
            <tr className="border-b border-slate-300 dark:border-slate-600">
              <th className="py-1 pr-2 text-left font-bold w-12">Seat</th>
              <th className="py-1 pr-2 text-left font-bold">Passenger</th>
              <th className="py-1 pr-2 text-right font-bold w-12">Wt</th>
              <th className="py-1 pr-2 text-right font-bold w-12">Bag</th>
              {data.stopCodes.map((code: string, i: number) => (
                <th key={`${code}-${i}`} className={`py-1 px-1 text-center font-bold w-12 ${code === "STY" ? "text-cyan-700" : ""}`}>{code}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.passengers.map((p: typeof data.passengers[0]) => {
              const oi = data.stopCodes.indexOf(p.origin);
              const di = data.stopCodes.indexOf(p.destination);
              return (
                <tr key={p.id} className="border-b border-slate-200 dark:border-slate-700">
                  <td className="py-1 pr-2 text-xs font-mono font-bold">{p.seat}</td>
                  <td className="py-1 pr-2">{p.name}</td>
                  <td className="py-1 pr-2 text-right text-xs">{p.clothedWeightKg}kg</td>
                  <td className="py-1 pr-2 text-right text-xs">{p.baggageWeightKg > 0 ? `${p.baggageWeightKg}kg` : "—"}</td>
                  {data.stopCodes.map((_: string, i: number) => {
                    const isOrigin = p.origin === data.stopCodes[i];
                    const isDest = p.destination === data.stopCodes[i];
                    const between = oi >= 0 && di >= 0 && i > oi && i < di;
                    return (
                      <td key={i} className="py-1 px-0.5 text-center">
                        {isOrigin ? <span style={{ color: TEAL, fontWeight: "bold", fontSize: "14pt" }}>●</span>
                         : isDest ? <span style={{ color: TEAL, fontWeight: "bold", fontSize: "14pt" }}>▶</span>
                         : between ? <span style={{ color: TEAL, opacity: 0.5 }}>━</span>
                         : <span className="text-slate-300 dark:text-slate-500">—</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {data.totalBaggage > 0 && (
              <tr className="border-t-2 border-slate-300 dark:border-slate-600">
                <td className="py-1 pr-2" colSpan={2}><span className="text-amber-700 dark:text-amber-400 font-medium">Aft Hold (Baggage)</span></td>
                <td className="py-1 pr-2 text-right text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">—</td>
                <td className="py-1 pr-2 text-right text-xs font-bold text-amber-700">{data.totalBaggage}kg</td>
                {data.stopCodes.map((_: string, i: number) => (
                  <td key={i} className="py-1 px-0.5 text-center"><span className="text-amber-400">╌</span></td>
                ))}
              </tr>
            )}
          </tbody>
        </table>

        <div className="mt-2 flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2 text-[7pt] text-slate-500 dark:text-slate-400 dark:text-slate-500">
          <span>Total Pax: {data.loadsheet.total_pax} · Pax Wt: {data.totalPaxWt}kg · Baggage: {data.totalBaggage}kg</span>
          <span>● Board &nbsp; ▶ Alight &nbsp; ━ In transit</span>
        </div>

        <PrintFooter now={data.now} loadsheetId={`LS-${String(data.loadsheet.id).padStart(4, "0")}`} />
      </div>

      {/* ── Page 2: Sector Calculations & Weight/Fuel ── */}
      <div className="print-page mx-auto max-w-[277mm] rounded border border-slate-300 dark:border-slate-600 dark:border-slate-600 bg-white dark:bg-slate-800 p-[8mm] shadow-sm dark:shadow-slate-900/20" style={{ width: "277mm", minHeight: "190mm" }}>
        <PrintHeader flightNumber={data.flightNumber} depDate={data.depDate} aircraftType={data.aircraftType} aircraftReg={data.aircraftRegistration} pilotName={data.pilotName} pageTitle="SECTOR CALCULATIONS & WEIGHT / FUEL PLANNING" contactEmail={data.contactEmail} contactPhone={data.contactPhone} />

        <table className="my-3 w-full border-collapse text-[7.5pt]">
          <thead>
            <tr className="border-b border-slate-300 dark:border-slate-600">
              <th className="py-1 pr-1 text-left font-bold w-5">#</th>
              <th className="py-1 pr-1 text-left font-bold">Route</th>
              <th className="py-1 pr-1 text-right font-bold w-10">Nm</th>
              <th className="py-1 pr-1 text-right font-bold w-10">Plan</th>
              <th className="py-1 pr-1 text-center font-bold w-10">ETD</th>
              <th className="py-1 pr-1 text-center font-bold w-10">ETA</th>
              <th className="py-1 pr-1 text-center font-bold w-10">ATD</th>
              <th className="py-1 pr-1 text-center font-bold w-10">ATA</th>
              <th className="py-1 pr-1 text-right font-bold w-12">TOW</th>
              <th className="py-1 pr-1 text-right font-bold w-12">LW</th>
              <th className="py-1 pr-1 text-right font-bold w-12">CG</th>
              <th className="py-1 pr-1 text-right font-bold w-8">FOB</th>
              <th className="py-1 pr-1 text-right font-bold w-8">Burn</th>
              <th className="py-1 pr-1 text-right font-bold w-8">Rem</th>
              <th className="py-1 pr-1 text-center font-bold w-12">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.sectors.map((sec: typeof data.sectors[0]) => (
              <tr key={sec.id} className="border-b border-slate-200 dark:border-slate-700">
                <td className="py-1 pr-1 text-xs">{sec.leg_sequence}</td>
                <td className="py-1 pr-1">{sec.origin_code}→{sec.destination_code}</td>
                <td className="py-1 pr-1 text-right text-xs">{s(sec.distance_nm)}</td>
                <td className="py-1 pr-1 text-right text-xs">{sec.planned_time_min}m</td>
                <td className="py-1 pr-1 text-center text-xs">{sec.etd ?? "____"}</td>
                <td className="py-1 pr-1 text-center text-xs">{sec.eta ?? "____"}</td>
                <td className="py-1 pr-1 text-center text-xs border-l border-slate-200 dark:border-slate-700">{sec.atd ? sec.atd : <span className="text-slate-300 dark:text-slate-500">____</span>}</td>
                <td className="py-1 pr-1 text-center text-xs">{sec.ata ? sec.ata : <span className="text-slate-300 dark:text-slate-500">____</span>}</td>
                <td className={`py-1 pr-1 text-right text-xs ${sec.tow_status === "violation" ? "text-red-700 dark:text-red-400 font-bold" : ""}`}>{s(sec.takeoff_weight_kg)}</td>
                <td className="py-1 pr-1 text-right text-xs">{s(sec.landing_weight_kg)}</td>
                <td className={`py-1 pr-1 text-right text-xs ${sec.cog_status === "violation" ? "text-red-700 dark:text-red-400 font-bold" : ""}`}>{Number(sec.cog_position_mm).toFixed(1)}</td>
                <td className="py-1 pr-1 text-right text-xs">{s(sec.fuel_on_board_kg)}</td>
                <td className="py-1 pr-1 text-right text-xs">{s(sec.fuel_burn_kg)}</td>
                <td className="py-1 pr-1 text-right text-xs">{s(sec.fuel_remaining_kg)}</td>
                <td className="py-1 pr-1 text-center text-xs">
                  {sec.tow_status === "violation" || sec.cog_status === "violation"
                    ? <span className="text-red-700 dark:text-red-400 font-bold">⚠</span>
                    : <span className="text-green-600">✓</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-2 border-t border-slate-300 dark:border-slate-600 pt-2 text-[7pt]">
          <div className="flex gap-6">
            <span>Starting Fuel: <strong>{data.startingFuel} kg</strong></span>
            <span>Total Burn: <strong>{data.totalBurn} kg</strong></span>
            <span>Reserve: 35 kg</span>
            <span>Remaining at STY: <strong className={data.finalRemaining >= 35 ? "text-green-700" : "text-red-700"}>{data.finalRemaining} kg</strong></span>
          </div>
          <div className="mt-1 text-slate-500 dark:text-slate-400 dark:text-slate-500">
            CG Limits: 81.0″–101.0″ (2057–2565 mm) · MTOW: 2,994 kg · Only Stanley (STY) has refueling facilities.
          </div>
          <div className="mt-3 flex justify-between">
            <span>Pilot Signature: _______________________</span>
            <span>Date: _______________________</span>
          </div>
        </div>

        <PrintFooter now={data.now} loadsheetId={`LS-${String(data.loadsheet.id).padStart(4, "0")}`} />
      </div>
    </div>
  );
}

function PrintHeader({ flightNumber, depDate, aircraftType, aircraftReg, pilotName, pageTitle, contactEmail, contactPhone }: {
  flightNumber: string; depDate: string; aircraftType: string; aircraftReg: string; pilotName: string; pageTitle: string; contactEmail: string; contactPhone: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between border-b-2 border-slate-800 pb-1 mb-2">
        <div>
          <div className="text-[9pt] font-bold tracking-wide">FIGAS</div>
          <div className="text-[6pt] text-slate-500 dark:text-slate-400 dark:text-slate-500">Falkland Islands Government Air Service</div>
        </div>
        <div className="text-right text-[6pt] text-slate-500 dark:text-slate-400 dark:text-slate-500">
          <div>{contactEmail}</div>
          <div>{contactPhone}</div>
        </div>
      </div>
      <div className="flex items-center justify-between text-[7pt]">
        <div>
          <span className="font-bold text-[9pt]">{flightNumber} LOADSHEET</span>
          <span className="ml-4 text-slate-500 dark:text-slate-400 dark:text-slate-500">{depDate}</span>
        </div>
        <div className="text-slate-500 dark:text-slate-400 dark:text-slate-500">
          {aircraftType} {aircraftReg} · Pilot: {pilotName}
        </div>
      </div>
      <div className="mt-1 border-b border-slate-300 dark:border-slate-600 pb-0.5 text-[7pt] font-bold text-slate-600 dark:text-slate-300 dark:text-slate-500">
        {pageTitle}
      </div>
    </div>
  );
}

function PrintFooter({ now, loadsheetId }: { now: string; loadsheetId: string }) {
  return (
    <div className="mt-3 border-t border-slate-200 dark:border-slate-700 pt-1 text-[6pt] text-slate-500 dark:text-slate-400 flex justify-between">
      <span>FIGAS Flight Operations System · {loadsheetId}</span>
      <span>
        Printed: {new Date(now).toLocaleDateString("en-GB")} {new Date(now).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · UNCONTROLLED WHEN PRINTED
      </span>
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
