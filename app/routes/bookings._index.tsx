import { useEffect, useRef } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, useLoaderData, useNavigation, useSearchParams, useSubmit, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { requireAuth } from "../utils/auth.server";
import { bookingRepository } from "../utils/repositories/booking";
import { bookingLegRepository } from "../utils/repositories/booking-leg";
import DataGrid from "../components/DataGrid";
import type { Column } from "../components/DataTable";
import StatusBadge from "../components/StatusBadge";
import type { BookingRow } from "../utils/repositories/booking";
import DateRangePicker from "../components/DateRangePicker";
import Pagination from "../components/Pagination";
import Skeleton from "../components/Skeleton";

export const meta: MetaFunction = () => [{ title: "My Bookings - FIGAS" }];

interface BookingRowData {
  booking: BookingRow;
  firstLeg: { origin_code: string; destination_code: string; leg_date: string } | null;
}

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireAuth(request);
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";
  const dateFrom = url.searchParams.get("dateFrom") || "";
  const dateTo = url.searchParams.get("dateTo") || "";
  const status = url.searchParams.get("status") || "";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);

  let bookingsWithLegs: Array<{ booking: BookingRow; firstLeg: { origin_code: string; destination_code: string; leg_date: string } | null }>;
  let totalCount: number;
  let totalPages: number;

  if (dateFrom && dateTo) {
    const result = await bookingRepository.findByUserIdAndDateRange(Number(userId), dateFrom, dateTo, page);
    bookingsWithLegs = result.bookings;
    totalCount = result.totalCount;
    totalPages = result.totalPages;
  } else if (q) {
    const result = await bookingRepository.search(q, page);
    bookingsWithLegs = result.bookings.filter((b) => b.booking.user_id === Number(userId));
    totalCount = bookingsWithLegs.length;
    totalPages = Math.ceil(totalCount / 20);
  } else {
    bookingsWithLegs = await bookingRepository.findUpcomingByUserId(Number(userId));
    totalCount = bookingsWithLegs.length;
    totalPages = 1;
  }

  if (status) {
    bookingsWithLegs = bookingsWithLegs.filter((b) => {
      if (status === "upcoming") return !["completed", "cancelled"].includes(b.booking.status);
      return b.booking.status === status;
    });
    totalCount = bookingsWithLegs.length;
    totalPages = Math.ceil(totalCount / 20) || 1;
  }

  const bookingIds = bookingsWithLegs.map((b) => b.booking.id);
  const legsMap = await bookingLegRepository.findByBookingIds(bookingIds);

  return json({
    bookings: bookingsWithLegs,
    legsMap: Array.from(legsMap.entries()),
    q, dateFrom, dateTo, status, page, totalCount, totalPages,
  });
}

export default function BookingList() {
  const { bookings, q, dateFrom, dateTo, status, page, totalCount, totalPages } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  const submit = useSubmit();
  const searchRef = useRef<HTMLInputElement>(null);
  const isSearching = navigation.state === "loading" && navigation.location.pathname === "/bookings";

  useEffect(() => {
    if (searchRef.current && !searchRef.current.value && q) {
      // sync on external clears
    }
  }, [q]);

  function handleSearchInput() {
    if (searchRef.current) {
      const form = searchRef.current.closest("form") as HTMLFormElement;
      if (form) submit(form, { replace: true });
    }
  }

  function handleDateChange(range: { dateFrom: string; dateTo: string }) {
    const params = new URLSearchParams(searchParams);
    params.set("dateFrom", range.dateFrom);
    params.set("dateTo", range.dateTo);
    params.delete("q");
    params.delete("page");
    setSearchParams(params, { replace: true });
  }

  function clearFilters() {
    setSearchParams({}, { replace: true });
  }

  function setStatusFilter(value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set("status", value);
    } else {
      params.delete("status");
    }
    params.delete("page");
    setSearchParams(params, { replace: true });
  }

  const hasActiveFilters = !!(q || dateFrom || dateTo || status);

  const columns: Column<BookingRowData>[] = [
    {
      key: "reference",
      header: "Reference",
      sortable: true,
      render: (item) => (
        <Link to={`/bookings/${item.booking.id}`} className="text-sky-600 hover:text-sky-800 font-medium">
          {item.booking.booking_reference}
        </Link>
      ),
    },
    {
      key: "route",
      header: "Route",
      sortable: true,
      render: (item) => (
        <span className="text-slate-600 dark:text-slate-300">
          {item.firstLeg
            ? `${item.firstLeg.origin_code} ? ${item.firstLeg.destination_code}`
            : "—"}
        </span>
      ),
    },
    {
      key: "date",
      header: "Date",
      sortable: true,
      render: (item) => (
        <span className="text-slate-600 dark:text-slate-300">
          {item.firstLeg ? new Date(item.firstLeg.leg_date).toLocaleDateString("en-GB") : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (item) => <StatusBadge status={item.booking.status} />,
    },
    {
      key: "total",
      header: "Total",
      sortable: true,
      className: "text-right",
      render: (item) => (
        <span className="font-medium text-slate-900 dark:text-slate-100">
          {item.booking.total_amount_gbp != null
            ? `£${Number(item.booking.total_amount_gbp).toFixed(2)}`
            : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (item) => (
        <Link to={`/bookings/${item.booking.id}`} className="text-sky-600 hover:text-sky-800 font-medium">
          View
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">My Bookings</h2>
          {hasActiveFilters && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {totalCount} booking{totalCount !== 1 ? "s" : ""} found
            </p>
          )}
        </div>
        <Link
          to="/bookings/new"
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 transition-colors"
        >
          New Booking
        </Link>
      </div>

      {/* Search + Date filter row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <Form method="get" onChange={handleSearchInput} className="relative">
            <input
              ref={searchRef}
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search by reference..."
              className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 pr-10 text-sm text-slate-800 dark:text-slate-100 dark:bg-slate-700 placeholder-slate-400 dark:placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            {isSearching && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 text-xs">...</span>
            )}
          </Form>
        </div>
        <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} onDateChange={handleDateChange} />
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map(({ value, label }) => {
          const isActive = (status || "") === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setStatusFilter(value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-sky-600 text-white"
                  : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Clear filters */}
      {hasActiveFilters && (
        <div className="flex items-center">
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-600 underline"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Results */}
      {isSearching ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" width="100%" height={48} />
          ))}
        </div>
      ) : (
        <>
          <div className="hidden md:block">
            <DataGrid
              columns={columns}
              data={bookings}
              keyExtractor={(item) => item.booking.id}
              enableSort
              enableFilters
              initialSortColumn="date"
              initialSortDirection="desc"
              rowClassName={(item) => {
                const hoursInStatus = Math.round(
                  (new Date().getTime() - new Date(item.booking.updated_at).getTime()) / (1000 * 60 * 60)
                );
                if (hoursInStatus > 48 && !["cancelled", "completed"].includes(item.booking.status)) {
                  return "bg-red-50/50 dark:bg-red-950/30";
                }
                if (hoursInStatus > 24 && !["cancelled", "completed"].includes(item.booking.status)) {
                  return "bg-amber-50/50 dark:bg-amber-950/30";
                }
                return undefined;
              }}
              emptyState={
                <div className="text-center py-12">
                  <p className="text-slate-500 dark:text-slate-400 mb-4">
                    {hasActiveFilters
                      ? "No bookings match your filters."
                      : "You have no bookings yet."}
                  </p>
                  {hasActiveFilters ? (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="text-sky-600 hover:text-sky-800 text-sm font-medium"
                    >
                      Clear filters
                    </button>
                  ) : (
                    <Link
                      to="/bookings/new"
                      className="inline-block rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 transition-colors"
                    >
                      Create your first booking
                    </Link>
                  )}
                </div>
              }
            />
          </div>

          {/* Mobile card view */}
          <div className="block md:hidden divide-y divide-slate-200 dark:divide-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            {bookings.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-slate-800">
                <p className="text-slate-500 dark:text-slate-400 mb-4">
                  {hasActiveFilters ? "No bookings match your filters." : "You have no bookings yet."}
                </p>
                {hasActiveFilters ? (
                  <button type="button" onClick={clearFilters} className="text-sky-600 hover:text-sky-800 text-sm font-medium">
                    Clear filters
                  </button>
                ) : (
                  <Link to="/bookings/new" className="inline-block rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 transition-colors">
                    Create your first booking
                  </Link>
                )}
              </div>
            ) : (
              bookings.map((item) => (
                <Link
                  key={item.booking.id}
                  to={`/bookings/${item.booking.id}`}
                  className="flex flex-col gap-1.5 px-4 py-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{item.booking.booking_reference}</span>
                    <StatusBadge status={item.booking.status} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>
                      {item.firstLeg
                        ? `${item.firstLeg.origin_code} ? ${item.firstLeg.destination_code}`
                        : "—"}
                    </span>
                    <span>
                      {item.firstLeg ? new Date(item.firstLeg.leg_date).toLocaleDateString("en-GB") : "—"}
                    </span>
                  </div>
                  {item.booking.total_amount_gbp != null && (
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      £{Number(item.booking.total_amount_gbp).toFixed(2)}
                    </span>
                  )}
                </Link>
              ))
            )}
          </div>
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination currentPage={page} totalPages={totalPages} baseUrl="/bookings" />
      )}
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
          <button onClick={() => window.location.reload()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Try Again</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="mx-auto max-w-lg text-center px-4">
        <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Unexpected Error</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">An unexpected error occurred. Please try again.</p>
        <button onClick={() => window.location.reload()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Try Again</button>
      </div>
    </div>
  );
}
