import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { getPublicSchedule } from "../utils/publishing/publish.server";

export async function loader({ params }: LoaderFunctionArgs) {
  const token = params.token;
  if (!token) throw new Response("Token required", { status: 400 });

  const result = await getPublicSchedule(token);
  if (result.error || !result.schedule) {
    throw new Response(result.error ?? "Schedule not found", { status: 404 });
  }

  return json(result);
}

interface ScheduleData {
  version?: number;
  publishedAt?: string;
  isAmendment?: boolean;
  amendmentNote?: string | null;
  disclaimerText?: string | null;
}
interface FlightData {
  flightNumber?: string;
  originCode?: string;
  destinationCode?: string;
  departureTime?: string;
  arrivalTime?: string;
  aircraftType?: string | null;
  aircraftRegistration?: string | null;
  pilotName?: string | null;
  stopCount?: number;
}

export default function PublicSchedule() {
  const data = useLoaderData<typeof loader>();
  const schedule = data.schedule as ScheduleData | null;
  const flights = (data.flights ?? []) as FlightData[];

  const depDate = flights.length > 0 && flights[0].departureTime
    ? new Date(flights[0].departureTime).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-700">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 text-center">
          <div className="text-sm font-bold tracking-wide text-cyan-700">FIGAS</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Falkland Islands Government Air Service</div>
          <h1 className="mt-3 text-xl font-bold text-slate-800 dark:text-slate-100">
            Flight Schedule — {depDate}
          </h1>
          {schedule?.isAmendment && (
            <span className="mt-1 inline-block rounded-full bg-amber-100 px-3 py-0.5 text-xs font-medium text-amber-700">
              Amendment #{schedule.version}
            </span>
          )}
          {schedule?.amendmentNote && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 italic">{schedule.amendmentNote}</p>
          )}
        </div>

        {flights.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-12 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">No scheduled flights for this date.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {flights.map((f, i) => (
              <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <span className="text-sm font-bold text-cyan-700">{f.flightNumber}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{f.originCode} → {f.destinationCode}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300 dark:text-slate-500">
                  {f.departureTime ? (
                    <span>
                      {new Date(f.departureTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      {" – "}
                      {f.arrivalTime ? new Date(f.arrivalTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </span>
                  ) : null}
                  {f.aircraftType ? <span>{f.aircraftType} {f.aircraftRegistration}</span> : null}
                  {f.pilotName ? <span>Pilot: {f.pilotName}</span> : null}
                  {f.stopCount != null && f.stopCount > 0 ? <span>{f.stopCount} stop{f.stopCount !== 1 ? "s" : ""}</span> : null}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 border-t border-slate-200 dark:border-slate-700 pt-4 text-center text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
          <p className="font-medium text-amber-600 mb-1">{schedule?.disclaimerText ?? "Flights may change at short notice. Check for updates before travel."}</p>
          <p>Contact: {process.env.CONTACT_EMAIL || "ops@figas.gov.fk"} · {process.env.CONTACT_PHONE || "+500 27219"}</p>
          <p className="mt-1">
            Published: {schedule?.publishedAt ? new Date(schedule.publishedAt).toLocaleString("en-GB") : ""}
          </p>
          <Link to="/" className="mt-2 inline-block text-cyan-600 hover:underline">FIGAS Home</Link>
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