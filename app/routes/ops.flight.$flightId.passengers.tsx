import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, Link } from "@remix-run/react";
import { useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { loadsheetRepository, canEnterActualData } from "../utils/loadsheet/loadsheet-repository.server";
import { requireUser } from "../utils/layout.server";
import { hasPermission, requirePermission } from "../utils/permissions.server";

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
  const { userId } = await requireUser(request);
  const flightId = Number(params.flightId);
  const loadsheet = await loadsheetRepository.findByFlightId(flightId);
  if (!loadsheet) throw new Response("No loadsheet for this flight", { status: 404 });

  const passengers = await loadsheetRepository.findPassengers(loadsheet.id);
  const sectors = await loadsheetRepository.findSectors(loadsheet.id);

  const canPerformInFlight = await hasPermission(Number(userId), "loadsheet:edit");

  return json({
    loadsheet: { ...loadsheet, status: loadsheet.status, flight_id: loadsheet.flight_id },
    passengers: passengers.map((p) => ({
      id: p.id,
      seat: `${p.seat_row ?? "?"}${p.seat_side ?? ""}`,
      bookingPassengerId: p.booking_passenger_id,
      weight: Number(p.clothed_weight_kg),
      baggage: Number(p.baggage_weight_kg),
      boarded: p.boarded,
    })),
    sectors: sectors.map((s) => ({
      leg_sequence: s.leg_sequence,
      origin: s.origin_code,
      dest: s.destination_code,
      etd: formatTime(s.etd),
    })),
    canEdit: canEnterActualData(loadsheet.status) && canPerformInFlight,
    canPerformInFlight,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { userId } = await requireUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();
  const flightId = Number(params.flightId);

  await requirePermission(request, "loadsheet:edit");
  const loadsheet = await loadsheetRepository.findByFlightId(flightId);
  if (!loadsheet || !canEnterActualData(loadsheet.status)) {
    return json({ error: "Cannot modify" }, { status: 400 });
  }

  if (intent === "toggle-boarding") {
    const passengerId = Number(formData.get("passengerId"));
    const current = formData.get("boarded") === "true";
    await loadsheetRepository.updatePassengerBoarding(passengerId, !current);
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
}

export default function PassengerView() {
  const { loadsheet, passengers, sectors, canEdit, canPerformInFlight } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const boardedCount = passengers.filter((p) => p.boarded).length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-700">
      <div className="mx-auto max-w-lg px-3 py-4 sm:px-4 sm:py-6">
        {/* Header */}
        <div className="mb-4">
          <Link to={`/ops/flight/${loadsheet.flight_id}/loadsheet`} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:text-slate-300 dark:text-slate-500">
            ← Loadsheet
          </Link>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Passengers</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
            Flight #{loadsheet.flight_id} · {boardedCount}/{passengers.length} boarded
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="h-1.5 w-full rounded-full bg-slate-200">
            <div
              className="h-1.5 rounded-full bg-emerald-500 transition-all"
              style={{ width: `${passengers.length > 0 ? (boardedCount / passengers.length) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Route summary */}
        <div className="mb-4 flex flex-wrap items-center gap-1 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
          {sectors.map((s, i) => (
            <span key={s.leg_sequence}>
              {i > 0 && <span className="text-slate-300 mx-0.5">→</span>}
              <span className="font-medium text-slate-600 dark:text-slate-300 dark:text-slate-500">{s.origin}</span>
            </span>
          ))}
          <span className="text-slate-300 mx-0.5">→</span>
          <span className="font-medium text-slate-600 dark:text-slate-300 dark:text-slate-500">{sectors[sectors.length - 1]?.dest}</span>
        </div>

        {/* Passenger list */}
        <div className="space-y-1.5">
          {passengers.map((p) => (
            <div
              key={p.id}
              className={`flex items-center gap-3 rounded-lg border p-3 ${
                p.boarded ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white dark:bg-slate-800"
              }`}
            >
              <button
                onClick={() => {
                  if (!canEdit) return;
                  fetcher.submit(
                    { intent: "toggle-boarding", passengerId: String(p.id), boarded: String(p.boarded) },
                    { method: "post" }
                  );
                }}
                disabled={!canEdit}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition-colors ${
                  p.boarded
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-slate-300 text-slate-300 dark:text-slate-500"
                } ${canEdit ? "cursor-pointer active:scale-95" : "cursor-default"}`}
              >
                {p.boarded ? "✓" : ""}
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Seat {p.seat} — Passenger #{p.bookingPassengerId}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  {p.weight}kg {p.baggage > 0 ? `+ ${p.baggage}kg baggage` : ""}
                </div>
              </div>
              {p.boarded && (
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                  Boarded
                </span>
              )}
            </div>
          ))}
        </div>

        {passengers.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-8 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">No passengers on this flight</p>
          </div>
        )}
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