import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useSearchParams , useRouteError, isRouteErrorResponse } from "@remix-run/react";

import { bookingRepository } from "../utils/repositories/booking";
import { checkinRepository } from "../utils/repositories/checkin";
import { requireUser } from "../utils/layout.server";
import type { BookingSearchResult } from "../utils/repositories/checkin";
import DataGrid from "../components/DataGrid";
import type { Column } from "../components/DataTable";

export const meta: MetaFunction = () => [{ title: "Check-In Lookup - FIGAS" }];

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const q = url.searchParams.get("q");

  let results: BookingSearchResult[] = [];
  if (q && q.trim().length > 0) {
    results = await checkinRepository.searchBookings(q.trim());
  }

  return json({ results, query: q ?? "" });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const formData = await request.formData();
  const reference = formData.get("reference")?.toString().trim().toUpperCase();

  if (!reference) {
    return json({ error: "Please enter a booking reference." }, { status: 400 });
  }

  const booking = await bookingRepository.findByReference(reference);
  if (!booking) {
    return json({ error: "Booking not found." }, { status: 404 });
  }

  return redirect(`/checkin/counter?bookingId=${booking.id}`);
}

export default function CheckinLookup() {
  const { results, query } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const currentQ = searchParams.get("q") ?? query;

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      confirmed: "bg-green-100 text-green-800",
      completed: "bg-green-100 text-green-800",
      cancelled: "bg-red-100 text-red-800",
    };
    return (
      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${colors[status] ?? "bg-yellow-100 text-yellow-800"}`}>
        {status}
      </span>
    );
  };

  const columns: Column<BookingSearchResult>[] = [
    {
      key: "booking_reference",
      header: "Reference",
      render: (row) => (
        <span className="font-medium text-slate-900 dark:text-slate-100">{row.booking_reference}</span>
      ),
      sortable: true,
    },
    {
      key: "passenger",
      header: "Passenger",
      render: (row) => (
        <span className="text-slate-600 dark:text-slate-300 dark:text-slate-500">{row.first_name} {row.last_name}</span>
      ),
      sortable: true,
    },
    {
      key: "flight_number",
      header: "Flight",
      render: (row) => (
        <span className="text-slate-600 dark:text-slate-300 dark:text-slate-500">{row.flight_number ?? "Ã¢â‚¬â€"}</span>
      ),
      sortable: true,
    },
    {
      key: "route",
      header: "Route",
      render: (row) => (
        <span className="text-slate-600 dark:text-slate-300 dark:text-slate-500">
          {row.origin_code && row.destination_code
            ? `${row.origin_code} \u2192 ${row.destination_code}`
            : "Ã¢â‚¬â€"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => statusBadge(row.status),
      sortable: true,
    },
    {
      key: "checkin_status",
      header: "Check-In",
      render: (row) => (
        <span className="text-slate-600 dark:text-slate-300 dark:text-slate-500">{row.checkin_status ?? "Not checked in"}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Search by reference (action) */}
      <div className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow-sm dark:shadow-slate-900/20 border border-slate-200 dark:border-slate-700">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Lookup by Booking Reference</h2>
        <Form method="post" className="mt-4 flex gap-3 items-end">
          <div className="flex-1">
            <label htmlFor="reference" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Booking Reference
            </label>
            <input
              type="text"
              id="reference"
              name="reference"
              placeholder="e.g. ABC12345"
              className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Lookup
          </button>
        </Form>
        {actionData?.error && (
          <p className="mt-2 text-sm text-red-600">{actionData.error}</p>
        )}
      </div>

      {/* Search by query (loader) */}
      <div className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow-sm dark:shadow-slate-900/20 border border-slate-200 dark:border-slate-700">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Search Bookings</h2>
        <Form method="get" className="mt-4 flex gap-3 items-end">
          <div className="flex-1">
            <label htmlFor="q" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Search by reference, flight number, or passenger name
            </label>
            <input
              type="text"
              id="q"
              name="q"
              defaultValue={currentQ}
              placeholder="e.g. ABC12345, FIG001, John"
              className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Search
          </button>
        </Form>

        {results.length > 0 && (
          <div className="mt-6">
            <DataGrid
              columns={columns}
              data={results}
              keyExtractor={(row) => `${row.id}-${row.passenger_id}`}
              enableSort
              enableFilters
              initialSortColumn="booking_reference"
              initialSortDirection="asc"
              actions={(row) => (
                <Link to={`/checkin/counter?bookingId=${row.id}&passengerId=${row.passenger_id}`}
                  className="text-blue-600 hover:text-blue-800 font-medium">
                  Check In
                </Link>
              )}
            />
          </div>
        )}

        {query && results.length === 0 && (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No results found for &ldquo;{query}&rdquo;.</p>
        )}
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