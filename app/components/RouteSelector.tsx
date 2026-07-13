import type { AerodromeRow } from "../utils/repositories/aerodrome";

interface RouteSelectorProps {
  aerodromes: AerodromeRow[];
  defaultOrigin?: string;
  defaultDestination?: string;
  originError?: string;
  destinationError?: string;
}

export default function RouteSelector({
  aerodromes,
  defaultOrigin = "",
  defaultDestination = "",
  originError,
  destinationError,
}: RouteSelectorProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label htmlFor="origin" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
          Origin
        </label>
        <select
          id="origin"
          name="origin"
          required
          defaultValue={defaultOrigin}
          className={`block w-full rounded-lg border px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:outline-none focus:ring-1 ${
            originError
              ? "border-red-300 focus:border-red-500 focus:ring-red-500"
              : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-sky-500 focus:ring-sky-500"
          }`}
        >
          <option value="">Select origin</option>
          {aerodromes.map((a) => (
            <option key={a.id} value={a.code}>
              {a.code} &mdash; {a.name}
            </option>
          ))}
        </select>
        {originError && (
          <p className="mt-1 text-xs text-red-600">{originError}</p>
        )}
      </div>

      <div>
        <label htmlFor="destination" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
          Destination
        </label>
        <select
          id="destination"
          name="destination"
          required
          defaultValue={defaultDestination}
          className={`block w-full rounded-lg border px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:outline-none focus:ring-1 ${
            destinationError
              ? "border-red-300 focus:border-red-500 focus:ring-red-500"
              : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-sky-500 focus:ring-sky-500"
          }`}
        >
          <option value="">Select destination</option>
          {aerodromes.map((a) => (
            <option key={a.id} value={a.code}>
              {a.code} &mdash; {a.name}
            </option>
          ))}
        </select>
        {destinationError && (
          <p className="mt-1 text-xs text-red-600">{destinationError}</p>
        )}
      </div>
    </div>
  );
}
