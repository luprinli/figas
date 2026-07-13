import type { ReactNode } from "react";

/** Extract HH:MM from an ISO timestamp deterministically (no locale/hydration drift). */
function hhmm(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /T(\d{2}:\d{2})/.exec(iso);
  return m ? m[1] : "—";
}

interface BriefingSectionProps {
  title: string;
  children: ReactNode;
  dataTour?: string;
}

function BriefingSection({ title, children, dataTour }: BriefingSectionProps) {
  return (
    <div
      data-tour={dataTour}
      className="rounded-lg bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/20 ring-1 ring-slate-200 dark:ring-slate-700 dark:bg-slate-800 dark:ring-slate-700"
    >
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">
        {title}
      </h3>
      {children}
    </div>
  );
}

export interface PilotBriefingData {
  flightNumber: string;
  date: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  /** Ordered flight legs (STY \u2192 … \u2192 STY). Empty only for legacy flights without leg rows. */
  legs: {
    legNumber: number;
    originCode: string;
    destinationCode: string;
    distanceNm: number | null;
    etd: string | null;
    eta: string | null;
  }[];
  aircraftRegistration: string;
  aircraftType: string;
  emptyWeightKg: number;
  mtowKg: number;
  mlwKg: number;
  crew: { name: string; role: string }[];
  passengers: { name: string; origin: string; destination: string; seat: string; weightKg: number }[];
  fuelPlan: {
    requiredFuelKg: number;
    reserveFuelKg: number;
    burnRateKgPerHr: number;
    enduranceMinutes: number;
    needsStanleyRevisit: boolean;
  };
  weightBalance: {
    passengerWeightKg: number;
    baggageWeightKg: number;
    freightWeightKg: number;
    fuelWeightKg: number;
    crewWeightKg: number;
    totalWeightKg: number;
    mtowUsedPct: number;
    mlwUsedPct: number;
    cgPositionPct: number;
    bindingConstraint: string;
  };
  weather?: {
    departure: string;
    enroute: string;
    destination: string;
  };
  notams: string[];
  aircraftStatus: string;
  operationalNotes: string;
}

export default function PilotBriefing({ data }: { data: PilotBriefingData }) {
  return (
    <div className="space-y-4 p-4 print:p-0" id="pilot-briefing">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3 dark:border-slate-700">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            Pilot Briefing — {data.flightNumber}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-500">{data.date}</p>
        </div>
        <div className="text-right text-sm text-slate-600 dark:text-slate-300 dark:text-slate-500">
          <p>{data.aircraftRegistration} — {data.aircraftType}</p>
          <p>Empty Wt: {data.emptyWeightKg} kg · MTOW: {data.mtowKg} kg</p>
        </div>
      </div>

      <BriefingSection title="Route" dataTour="briefing-route">
        {data.legs.length > 0 ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-lg font-mono">
              {[data.legs[0].originCode, ...data.legs.map((l) => l.destinationCode)].map((code, i, arr) => (
                <span key={i} className="flex items-center gap-2">
                  <span
                    className={
                      i === 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : i === arr.length - 1
                          ? "text-red-600 dark:text-red-400"
                          : "text-slate-700 dark:text-slate-200"
                    }
                  >
                    {code}
                  </span>
                  {i < arr.length - 1 && <span className="text-slate-400 dark:text-slate-500">{'\u2192'}</span>}
                </span>
              ))}
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-slate-500 dark:text-slate-400">
                    <th className="py-1 pr-3 font-medium">Leg</th>
                    <th className="py-1 pr-3 font-medium">Sector</th>
                    <th className="py-1 pr-3 font-medium">ETD</th>
                    <th className="py-1 pr-3 font-medium">ETA</th>
                    <th className="py-1 text-right font-medium">Dist (nm)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {data.legs.map((l) => (
                    <tr key={l.legNumber}>
                      <td className="py-1 pr-3 tabular-nums text-slate-500 dark:text-slate-400">{l.legNumber}</td>
                      <td className="py-1 pr-3 font-mono text-slate-700 dark:text-slate-200">
                        {l.originCode} {'\u2192'} {l.destinationCode}
                      </td>
                      <td className="py-1 pr-3 tabular-nums text-slate-600 dark:text-slate-300">{hhmm(l.etd)}</td>
                      <td className="py-1 pr-3 tabular-nums text-slate-600 dark:text-slate-300">{hhmm(l.eta)}</td>
                      <td className="py-1 text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {l.distanceNm != null ? Number(l.distanceNm).toFixed(0) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-4 text-lg font-mono">
            <span className="text-emerald-600 dark:text-emerald-400">{data.origin}</span>
            <span className="text-slate-400 dark:text-slate-500">{'\u2192'}</span>
            <span className="text-red-600 dark:text-red-400">{data.destination}</span>
          </div>
        )}
        <div className="mt-2 flex gap-6 text-sm text-slate-600 dark:text-slate-300 dark:text-slate-500">
          <span>ETD: {data.departureTime}</span>
          <span>ETA: {data.arrivalTime}</span>
        </div>
      </BriefingSection>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <BriefingSection title="Crew">
          {data.crew.map((c, i) => (
            <div key={i} className="flex justify-between py-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">{c.name}</span>
              <span className="text-slate-500 dark:text-slate-500">{c.role}</span>
            </div>
          ))}
        </BriefingSection>

        <BriefingSection title="Aircraft Status">
          <p className="text-sm text-slate-700 dark:text-slate-200">{data.aircraftStatus}</p>
          {data.operationalNotes && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{data.operationalNotes}</p>
          )}
        </BriefingSection>
      </div>

      <BriefingSection title="Passenger Manifest" dataTour="briefing-passengers">
        {data.passengers.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-500">No passengers on this flight</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="py-1.5 pr-2 text-left font-medium text-slate-500 dark:text-slate-500">Name</th>
                  <th className="py-1.5 pr-2 text-left font-medium text-slate-500 dark:text-slate-500">Route</th>
                  <th className="py-1.5 pr-2 text-left font-medium text-slate-500 dark:text-slate-500">Seat</th>
                  <th className="py-1.5 text-right font-medium text-slate-500 dark:text-slate-500">Wt (kg)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {data.passengers.map((p, i) => (
                  <tr key={i}>
                    <td className="py-1.5 pr-2 text-slate-800 dark:text-slate-100 dark:text-slate-200">{p.name}</td>
                    <td className="py-1.5 pr-2 text-slate-500 dark:text-slate-500">{p.origin} {'\u2192'} {p.destination}</td>
                    <td className="py-1.5 pr-2 font-mono text-slate-500 dark:text-slate-500">{p.seat || "—"}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300 dark:text-slate-500">{p.weightKg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </BriefingSection>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <BriefingSection title="Weight & Balance" dataTour="briefing-wb">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <span className="text-slate-500 dark:text-slate-500">Passenger Wt</span>
            <span className="text-right tabular-nums text-slate-700 dark:text-slate-200">{data.weightBalance.passengerWeightKg} kg</span>
            <span className="text-slate-500 dark:text-slate-500">Baggage Wt</span>
            <span className="text-right tabular-nums text-slate-700 dark:text-slate-200">{data.weightBalance.baggageWeightKg} kg</span>
            <span className="text-slate-500 dark:text-slate-500">Freight Wt</span>
            <span className="text-right tabular-nums text-slate-700 dark:text-slate-200">{data.weightBalance.freightWeightKg} kg</span>
            <span className="text-slate-500 dark:text-slate-500">Fuel Wt</span>
            <span className="text-right tabular-nums text-slate-700 dark:text-slate-200">{data.weightBalance.fuelWeightKg} kg</span>
            <span className="text-slate-500 dark:text-slate-500">Crew Wt</span>
            <span className="text-right tabular-nums text-slate-700 dark:text-slate-200">{data.weightBalance.crewWeightKg} kg</span>
            <span className="border-t border-slate-200 dark:border-slate-700 pt-1 font-semibold text-slate-700 dark:text-slate-200">Total</span>
            <span className="border-t border-slate-200 dark:border-slate-700 pt-1 text-right tabular-nums font-semibold text-slate-800 dark:text-slate-100">{data.weightBalance.totalWeightKg} kg</span>
          </div>
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-500">MTOW</span>
              <span className="tabular-nums text-slate-700 dark:text-slate-200">
                {data.weightBalance.mtowUsedPct}% of {data.mtowKg} kg
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-500">MLW</span>
              <span className="tabular-nums text-slate-700 dark:text-slate-200">
                {data.weightBalance.mlwUsedPct}% of {data.mlwKg} kg
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-500">CG Position</span>
              <span className="tabular-nums text-slate-700 dark:text-slate-200">{data.weightBalance.cgPositionPct}% MAC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-500">Binding Constraint</span>
              <span className="tabular-nums font-medium text-amber-600">{data.weightBalance.bindingConstraint}</span>
            </div>
          </div>
        </BriefingSection>

        <BriefingSection title="Fuel Plan" dataTour="briefing-fuel">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-500">Required Fuel</span>
              <span className="tabular-nums text-slate-700 dark:text-slate-200">{data.fuelPlan.requiredFuelKg} kg</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-500">Reserve</span>
              <span className="tabular-nums text-slate-700 dark:text-slate-200">{data.fuelPlan.reserveFuelKg} kg</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-500">Burn Rate</span>
              <span className="tabular-nums text-slate-700 dark:text-slate-200">{data.fuelPlan.burnRateKgPerHr} kg/hr</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span className="text-slate-600 dark:text-slate-300 dark:text-slate-500">Endurance</span>
              <span className="tabular-nums text-slate-800 dark:text-slate-100">{data.fuelPlan.enduranceMinutes} min</span>
            </div>
            {data.fuelPlan.needsStanleyRevisit && (
              <p className="mt-2 rounded bg-amber-50 dark:bg-amber-900/30 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400 dark:bg-amber-900/20 dark:text-amber-400">
                Requires Stanley refuel revisit
              </p>
            )}
          </div>
        </BriefingSection>
      </div>

      {data.weather && (
        <BriefingSection title="Weather">
          <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300 dark:text-slate-500">
            <p><strong>Departure:</strong> {data.weather.departure}</p>
            <p><strong>En Route:</strong> {data.weather.enroute}</p>
            <p><strong>Destination:</strong> {data.weather.destination}</p>
          </div>
        </BriefingSection>
      )}

      {data.notams.length > 0 && (
        <BriefingSection title="NOTAMs">
          <ul className="list-inside list-disc space-y-1 text-sm text-amber-700 dark:text-amber-400 dark:text-amber-400">
            {data.notams.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </BriefingSection>
      )}
    </div>
  );
}
