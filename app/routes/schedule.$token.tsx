import { json, type LoaderFunctionArgs, type MetaFunction } from "@remix-run/node";
import { useLoaderData, Link, useRouteError, isRouteErrorResponse } from "@remix-run/react";

import { getPublicSchedule } from "../utils/publishing/publish.server";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data?.schedule) return [{ title: "Flight Schedule - FIGAS" }];
  const publishedAt = data.schedule.publishedAt
    ? new Date(String(data.schedule.publishedAt)).toLocaleDateString("en-GB")
    : "";
  return [{ title: `Flight Schedule${publishedAt ? ` — ${publishedAt}` : ""} | FIGAS` }];
};

export async function loader({ params }: LoaderFunctionArgs) {
  const token = params.token;
  if (!token) throw new Response("Token required", { status: 400 });

  const result = await getPublicSchedule(token);
  if (result.error || !result.schedule) {
    throw new Response(result.error ?? "Schedule not found", { status: 404 });
  }

  return json({
    ...result,
    contactEmail: process.env.CONTACT_EMAIL || "ops@figas.gov.fk",
    contactPhone: process.env.CONTACT_PHONE || "+500 27219",
  });
}

interface ScheduleData {
  version?: number;
  publishedAt?: string;
  isAmendment?: boolean;
  amendmentNote?: string | null;
  disclaimerText?: string | null;
}

interface FlightLegData {
  legNumber: number;
  originCode: string;
  destinationCode: string;
  distanceNm: number | null;
  heading: number | null;
  etd: string | null;
  eta: string | null;
  atd: string | null;
  ata: string | null;
  status: string;
}

interface FlightData {
  flightNumber?: string;
  originCode?: string;
  destinationCode?: string;
  routePath?: string | null;
  departureTime?: string;
  arrivalTime?: string;
  status?: string;
  aircraftType?: string | null;
  aircraftRegistration?: string | null;
  pilotName?: string | null;
  stopCount?: number;
  legs?: FlightLegData[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "\u2014";
  try {
    return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Atlantic/Stanley" });
  } catch { return "\u2014"; }
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function legStatusBadge(status: string): { label: string; color: string } {
  const s = status.toLowerCase();
  if (s === "completed" || s === "arrived") return { label: "Arrived", color: "bg-emerald-100 text-emerald-700" };
  if (s === "active" || s === "departed" || s === "en_route") return { label: "En Route", color: "bg-blue-100 text-blue-700" };
  if (s === "delayed") return { label: "Delayed", color: "bg-amber-100 text-amber-700" };
  if (s === "cancelled") return { label: "Cancelled", color: "bg-red-100 text-red-700" };
  return { label: "Scheduled", color: "bg-slate-100 text-slate-600" };
}

function flightStatusBadge(status: string | undefined): { label: string; color: string } | null {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s === "cancelled") return { label: "Cancelled", color: "bg-red-100 text-red-700 border-red-300" };
  if (s === "completed") return { label: "Completed", color: "bg-emerald-50 text-emerald-600 border-emerald-200" };
  if (s === "active" || s === "in_progress") return { label: "In Progress", color: "bg-blue-50 text-blue-600 border-blue-200" };
  if (s === "delayed") return { label: "Delayed", color: "bg-amber-50 text-amber-600 border-amber-200" };
  return null;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function PublicSchedule() {
  const data = useLoaderData<typeof loader>();
  const schedule = data.schedule as ScheduleData | null;
  const flights = (data.flights ?? []) as FlightData[];

  const depDate = flights.length > 0 && flights[0].departureTime
    ? fmtDate(flights[0].departureTime)
    : "";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-800">
      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="mb-6 text-center">
          <div className="text-sm font-bold tracking-wide text-cyan-700">FIGAS</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Falkland Islands Government Air Service
          </div>
          <h1 className="mt-3 text-xl font-bold text-slate-800 dark:text-slate-100">
            Flight Schedule {depDate ? `— ${depDate}` : ""}
          </h1>
          {schedule?.isAmendment && (
            <span className="mt-1 inline-block rounded-full bg-amber-100 px-3 py-0.5 text-xs font-medium text-amber-700">
              Amendment #{schedule.version}
            </span>
          )}
          {schedule?.amendmentNote && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 italic">
              {schedule.amendmentNote}
            </p>
          )}
        </div>

        {flights.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 p-12 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No scheduled flights for this date.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {flights.map((f, i) => (
              <FlightCard key={i} flight={f} />
            ))}
          </div>
        )}

        {/* ── Footer ─────────────────────────────────────────────── */}
        <div className="mt-10 border-t border-slate-200 dark:border-slate-600 pt-4 text-center text-xs text-slate-500 dark:text-slate-400">
          <p className="mb-1 font-medium text-amber-600">
            {schedule?.disclaimerText ??
              "Flights may change at short notice. Check for updates before travel."}
          </p>
          <p>
            Contact: {data.contactEmail} &middot; {data.contactPhone}
          </p>
          <p className="mt-1">
            Published:{" "}
            {schedule?.publishedAt
              ? new Date(schedule.publishedAt).toLocaleString("en-GB", {
                  timeZone: "Atlantic/Stanley",
                })
              : ""}
          </p>
          <Link to="/" className="mt-2 inline-block text-cyan-600 hover:underline">
            FIGAS Home
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Flight Card ─────────────────────────────────────────────────────────────

function FlightCard({ flight }: { flight: FlightData }) {
  const legs = (flight.legs ?? []) as FlightLegData[];
  const flightBadge = flightStatusBadge(flight.status);
  const hasLiveData = legs.some((l) => l.ata || l.atd);

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 overflow-hidden">
      {/* ── Flight Summary Header ──────────────────────────────── */}
      <div className="bg-slate-50 dark:bg-slate-600 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-cyan-700">{flight.flightNumber}</span>
          {flightBadge && (
            <span
              className={`rounded border px-2 py-0.5 text-xs font-medium ${flightBadge.color}`}
            >
              {flightBadge.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-300">
          {flight.aircraftType && (
            <span>
              {flight.aircraftType}{" "}
              {flight.aircraftRegistration ? `(${flight.aircraftRegistration})` : ""}
            </span>
          )}
          {flight.pilotName && <span>Pilot: {flight.pilotName}</span>}
          {flight.stopCount != null && flight.stopCount > 0 && (
            <span>
              {flight.stopCount} stop{flight.stopCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* ── Route Visualization ────────────────────────────────── */}
      {legs.length > 0 ? (
        <div className="px-4 py-3">
          {/* Route path as stop chips */}
          <div className="flex flex-wrap items-center gap-1 mb-4">
            {buildStopSequence(legs).map((code, idx, arr) => (
              <div key={`${code}-${idx}`} className="flex items-center gap-1">
                <span className="rounded bg-cyan-50 dark:bg-cyan-900 px-2 py-0.5 text-xs font-mono font-semibold text-cyan-700 dark:text-cyan-300">
                  {code}
                </span>
                {idx < arr.length - 1 && (
                  <span className="text-slate-400 text-xs">&rarr;</span>
                )}
              </div>
            ))}
          </div>

          {/* Leg detail table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400">
                  <th className="text-left py-1 pr-2 font-medium">#</th>
                  <th className="text-left py-1 pr-2 font-medium">Route</th>
                  <th className="text-right py-1 pr-2 font-medium">Dist</th>
                  <th className="text-right py-1 pr-2 font-medium">ETD</th>
                  <th className="text-right py-1 pr-2 font-medium">ETA</th>
                  <th className="text-right py-1 pr-2 font-medium">
                    {hasLiveData ? "ATD" : ""}
                  </th>
                  <th className="text-right py-1 pr-2 font-medium">
                    {hasLiveData ? "ATA" : ""}
                  </th>
                  <th className="text-center py-1 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {legs.map((leg) => {
                  const badge = legStatusBadge(leg.status);
                  return (
                    <tr
                      key={leg.legNumber}
                      className="border-b border-slate-100 dark:border-slate-600 last:border-0"
                    >
                      <td className="py-1.5 pr-2 text-slate-500">{leg.legNumber}</td>
                      <td className="py-1.5 pr-2 font-mono text-slate-700 dark:text-slate-200">
                        {leg.originCode}&rarr;{leg.destinationCode}
                      </td>
                      <td className="py-1.5 pr-2 text-right text-slate-500">
                        {leg.distanceNm != null ? `${Number(leg.distanceNm)}nm` : "\u2014"}
                      </td>
                      <td className="py-1.5 pr-2 text-right font-mono">
                        {fmtTime(leg.etd)}
                      </td>
                      <td className="py-1.5 pr-2 text-right font-mono">
                        {fmtTime(leg.eta)}
                      </td>
                      <td
                        className={`py-1.5 pr-2 text-right font-mono ${leg.atd ? "text-emerald-600 font-semibold" : "text-slate-400"}`}
                      >
                        {fmtTime(leg.atd)}
                      </td>
                      <td
                        className={`py-1.5 pr-2 text-right font-mono ${leg.ata ? "text-emerald-600 font-semibold" : "text-slate-400"}`}
                      >
                        {fmtTime(leg.ata)}
                      </td>
                      <td className="py-1.5 text-center">
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${badge.color}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Fallback for flights without leg detail: show route summary */
        <div className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            <span className="font-mono">
              {flight.routePath ||
                `${flight.originCode} \u2192 ${flight.destinationCode}`}
            </span>
            {flight.departureTime && (
              <span>
                {fmtTime(flight.departureTime)}
                {" \u2013 "}
                {flight.arrivalTime ? fmtTime(flight.arrivalTime) : "\u2014"}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildStopSequence(legs: FlightLegData[]): string[] {
  const codes: string[] = [];
  if (legs.length === 0) return codes;
  codes.push(legs[0].originCode);
  for (const leg of legs) {
    if (codes[codes.length - 1] !== leg.originCode) codes.push(leg.originCode);
    codes.push(leg.destinationCode);
  }
  return codes;
}

// ── Error Boundary ──────────────────────────────────────────────────────────

export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="mx-auto max-w-lg text-center px-4">
          <div className="mb-4 text-5xl font-bold text-slate-300 dark:text-slate-600">
            {error.status}
          </div>
          <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
            {error.status === 404 ? "Schedule Not Found" : "Something went wrong"}
          </h1>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
            {error.status === 404
              ? "This schedule link may have expired or been superseded. Please request a new link from FIGAS."
              : error.statusText}
          </p>
          {error.status === 404 && (
            <Link
              to="/"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
            >
              FIGAS Home
            </Link>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="mx-auto max-w-lg text-center px-4">
        <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
          Unexpected Error
        </h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
