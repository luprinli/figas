import { useRef, useState, useMemo } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData, useNavigation, useSearchParams, useSubmit } from "@remix-run/react";
import { useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { Permission } from "../utils/constants";
import { bookingRepository } from "../utils/repositories/booking";
import type { BookingRow } from "../utils/repositories/booking";
import { requirePermission } from "../utils/permissions.server";
import StatusBadge from "../components/StatusBadge";
import PaymentStatusBadge from "../components/PaymentStatusBadge";
import Pagination from "../components/Pagination";
import Skeleton from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import DataTable from "../components/DataTable";
import type { Column } from "../components/DataTable";
import DateRangePicker from "../components/DateRangePicker";

// ── Types ────────────────────────────────────────────────────────────────────────

interface BookingDisplay {
  booking: BookingRow;
  firstLeg: { origin_code: string; destination_code: string; leg_date: string; flight_id: number | null } | null;
  passenger: { first_name: string; last_name: string; email: string; phone: string | null } | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

// ── Date Helpers (imported from app/utils/dates) ──────────────────────────────────

// ── Loader ────────────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const status = url.searchParams.get("status") || "";
  const q = url.searchParams.get("q") || "";
  const dateFrom = url.searchParams.get("dateFrom") || "";
  const dateTo = url.searchParams.get("dateTo") || "";

  // Require booking:view permission
  const user = await requirePermission(request, Permission.BOOKING_VIEW);

  // Fetch bookings with existing filter logic
  let result: {
    bookings: Array<{
      booking: BookingRow;
      firstLeg: { origin_code: string; destination_code: string; leg_date: string; flight_id: number | null } | null;
      passenger: { first_name: string; last_name: string; email: string; phone: string | null } | null;
    }>;
    totalCount: number;
    page: number;
    totalPages: number;
  };

  if (q) {
    result = await bookingRepository.search(q, page);
  } else if (dateFrom && dateTo) {
    result = await bookingRepository.findByDateRange(dateFrom, dateTo, page);
  } else if (status) {
    result = await bookingRepository.findByStatus(status, page);
  } else {
    result = await bookingRepository.findAll(page);
  }

  // ── Post-filter: "upcoming" tab must exclude past-date bookings ──────────
  if (status === "upcoming" && result.bookings.length > 0) {
    const today = new Date(new Date().toDateString()); // midnight today
    result.bookings = result.bookings.filter((b) => {
      if (!b.firstLeg) return false; // no leg date = can't be upcoming
      const legDate = new Date(b.firstLeg.leg_date);
      const legDateOnly = new Date(legDate.getFullYear(), legDate.getMonth(), legDate.getDate());
      return legDateOnly >= today;
    });
    result.totalCount = result.bookings.length;
    result.totalPages = Math.ceil(result.totalCount / 20);
  }

  // ── Compute tab counts from the fetched bookings data ───────────────────
  // This ensures badge counts always match what's actually displayed.
  const todayStr = new Date(new Date().toDateString()).toISOString().slice(0, 10);
  const tabCounts: Record<string, number> = {
    total: result.totalCount,
    upcoming: result.bookings.filter((b) => {
      if (b.booking.status === "completed" || b.booking.status === "cancelled") return false;
      if (!b.firstLeg) return false;
      return b.firstLeg.leg_date >= todayStr;
    }).length,
    completed: result.bookings.filter((b) => b.booking.status === "completed").length,
    cancelled: result.bookings.filter((b) => b.booking.status === "cancelled").length,
  };

  // Permission flags
  const canEdit = user.permissions.includes(Permission.BOOKING_EDIT);
  const canApprove = user.permissions.includes(Permission.BOOKING_APPROVE);
  const canCancel = user.permissions.includes(Permission.BOOKING_CANCEL);
  const canAssignFlight = user.permissions.includes(Permission.BOOKING_ASSIGN_FLIGHT);
  const canManagePayment = user.permissions.includes(Permission.BOOKING_MANAGE_PAYMENT);
  const canManagePassengers = user.permissions.includes(Permission.BOOKING_MANAGE_PASSENGERS);
  const canManageFreight = user.permissions.includes(Permission.BOOKING_MANAGE_FREIGHT);
  const canCheckin = user.permissions.includes(Permission.BOOKING_CHECKIN);
  const canCreate = user.permissions.includes(Permission.BOOKING_CREATE);

  return json({
    bookings: result.bookings,
    totalCount: result.totalCount,
    page: result.page,
    totalPages: result.totalPages,
    status,
    q,
    dateFrom,
    dateTo,
    tabCounts,
    canEdit,
    canApprove,
    canCancel,
    canAssignFlight,
    canManagePayment,
    canManagePassengers,
    canManageFreight,
    canCheckin,
    canCreate,
  });
}

// ── Client-side sort/filter helpers ───────────────────────────────────────────────

function sortBookings(
  bookings: BookingDisplay[],
  sortColumn: string,
  sortDirection: "asc" | "desc"
): BookingDisplay[] {
  if (!sortColumn) return bookings;

  return [...bookings].sort((a, b) => {
    let aVal: string | number | null = "";
    let bVal: string | number | null = "";

    switch (sortColumn) {
      case "booking_reference":
        aVal = a.booking.booking_reference ?? "";
        bVal = b.booking.booking_reference ?? "";
        break;
      case "passenger":
        aVal = a.passenger
          ? `${a.passenger.last_name}, ${a.passenger.first_name}`
          : "";
        bVal = b.passenger
          ? `${b.passenger.last_name}, ${b.passenger.first_name}`
          : "";
        break;
      case "route":
        aVal = a.firstLeg
          ? `${a.firstLeg.origin_code}->${a.firstLeg.destination_code}`
          : "";
        bVal = b.firstLeg
          ? `${b.firstLeg.origin_code}->${b.firstLeg.destination_code}`
          : "";
        break;
      case "status":
        aVal = a.booking.status ?? "";
        bVal = b.booking.status ?? "";
        break;
      case "payment":
        aVal = a.booking.payment_status ?? "";
        bVal = b.booking.payment_status ?? "";
        break;
      case "date":
        aVal = a.firstLeg?.leg_date ?? "";
        bVal = b.firstLeg?.leg_date ?? "";
        break;
      case "amount":
        aVal = a.booking.total_amount_gbp ?? 0;
        bVal = b.booking.total_amount_gbp ?? 0;
        break;
      default:
        return 0;
    }

    // String comparison
    if (typeof aVal === "string" && typeof bVal === "string") {
      const cmp = aVal.localeCompare(bVal);
      return sortDirection === "asc" ? cmp : -cmp;
    }

    // Numeric comparison
    const numCmp = (aVal as number) - (bVal as number);
    return sortDirection === "asc" ? numCmp : -numCmp;
  });
}

function filterBookings(
  bookings: BookingDisplay[],
  filters: Record<string, string>
): BookingDisplay[] {
  const activeFilters = Object.entries(filters).filter(
    ([, value]) => value.trim() !== ""
  );
  if (activeFilters.length === 0) return bookings;

  return bookings.filter((item) => {
    return activeFilters.every(([column, filterValue]) => {
      const lowerFilter = filterValue.toLowerCase();

      switch (column) {
        case "booking_reference":
          return (item.booking.booking_reference ?? "")
            .toLowerCase()
            .includes(lowerFilter);
        case "passenger":
          if (!item.passenger) return false;
          return (
            `${item.passenger.first_name} ${item.passenger.last_name}`
              .toLowerCase()
              .includes(lowerFilter) ||
            item.passenger.email.toLowerCase().includes(lowerFilter)
          );
        case "route":
          if (!item.firstLeg) return false;
          return (
            `${item.firstLeg.origin_code} ${item.firstLeg.destination_code}`
              .toLowerCase()
              .includes(lowerFilter)
          );
        case "status":
          return (item.booking.status ?? "")
            .toLowerCase()
            .includes(lowerFilter);
        case "payment":
          return (item.booking.payment_status ?? "")
            .toLowerCase()
            .includes(lowerFilter);
        case "date":
          if (!item.firstLeg?.leg_date) return false;
          return item.firstLeg.leg_date.includes(lowerFilter);
        case "amount": {
          const amount = item.booking.total_amount_gbp;
          if (amount == null) return false;
          return String(amount).includes(lowerFilter);
        }
        default:
          return true;
      }
    });
  });
}

// ── Component ─────────────────────────────────────────────────────────────────────

export default function OperationsBookingsIndex() {
  const data = useLoaderData<typeof loader>();
  const {
    bookings, totalCount, page, totalPages, status, q, dateFrom, dateTo,
    tabCounts,
    canCreate,
    canEdit,
    canCancel,
  } = data;
  const [searchParams, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  const submit = useSubmit();
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const isSearching = navigation.state === "loading" && navigation.location.pathname === "/operations/bookings";

  // Client-side sort state
  const [sortColumn, setSortColumn] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Client-side filter state
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});


  function buildFilterUrl(key: string, value: string): string {
    const params = new URLSearchParams(searchParams);
    params.delete("page");
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    return `/operations/bookings?${params.toString()}`;
  }

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
    params.delete("status");
    params.delete("q");
    params.delete("page");
    setSearchParams(params, { replace: true });
  }

  function clearFilters() {
    setSearchParams({}, { replace: true });
  }

  const hasActiveFilters = !!(q || status || dateFrom || dateTo);

  // Determine if we're in a loading state
  const isLoading = isSearching;

  // ── Client-side sort/filter processing ──────────────────────────────────────────

  const processedBookings = useMemo(() => {
    let result = filterBookings(bookings, columnFilters);
    if (sortColumn) {
      result = sortBookings(result, sortColumn, sortDirection);
    }
    return result;
  }, [bookings, columnFilters, sortColumn, sortDirection]);

  // ── DataTable columns ───────────────────────────────────────────────────────────

  const columns: Column<BookingDisplay>[] = useMemo(
    () => [
      {
        key: "booking_reference",
        header: "Reference",
        sortable: true,
        render: ({ booking }) => (
          <span className="font-medium text-slate-900 dark:text-slate-100">
            {booking.booking_reference}
          </span>
        ),
      },
      {
        key: "passenger",
        header: "Passenger",
        sortable: true,
        render: ({ passenger }) =>
          passenger ? (
            <div>
              <div className="font-medium text-slate-900 dark:text-slate-100">
                {passenger.first_name} {passenger.last_name}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{passenger.email}</div>
            </div>
          ) : (
            <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">&mdash;</span>
          ),
      },
      {
        key: "route",
        header: "Route",
        sortable: true,
        render: ({ firstLeg }) =>
          firstLeg
            ? `${firstLeg.origin_code} \u2192 ${firstLeg.destination_code}`
            : "\u2014",
      },
      {
        key: "status",
        header: "Status",
        sortable: true,
        render: ({ booking }) => <StatusBadge status={booking.status} />,
      },
      {
        key: "category",
        header: "Category",
        sortable: false,
        render: (item) => {
          const category = getPastBookingCategory(item);
          if (category === "current") return null;
          const isFlown = category === "past-flown";
          return (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                isFlown
                  ? "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 dark:text-slate-500"
                  : "bg-amber-50 dark:bg-amber-900/30 text-amber-600"
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-3 w-3"
              >
                {isFlown ? (
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                    clipRule="evenodd"
                  />
                ) : (
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z"
                    clipRule="evenodd"
                  />
                )}
              </svg>
              {isFlown ? "Flown" : "Unflown"}
            </span>
          );
        },
      },
      {
        key: "payment",
        header: "Payment",
        sortable: true,
        render: ({ booking }) => (
          <PaymentStatusBadge status={booking.payment_status} />
        ),
      },
      {
        key: "date",
        header: "Date",
        sortable: true,
        render: ({ firstLeg }) =>
          firstLeg
            ? new Date(firstLeg.leg_date).toLocaleDateString()
            : "\u2014",
      },
      {
        key: "amount",
        header: "Amount",
        sortable: true,
        className: "text-right",
        render: ({ booking }) =>
          booking.total_amount_gbp != null
            ? `\u00A3${Number(booking.total_amount_gbp).toFixed(2)}`
            : "\u2014",
      },
    ],
    []
  );

  // ── Past booking categorization ──────────────────────────────────────────────────

  function getPastBookingCategory(item: BookingDisplay): 'current' | 'past-flown' | 'past-unflown' {
    const { firstLeg } = item;
    const isPast = firstLeg
      ? new Date(firstLeg.leg_date) < new Date(new Date().toDateString())
      : false;
    if (!isPast) return 'current';
    const hasFlight = firstLeg?.flight_id != null;
    return hasFlight ? 'past-flown' : 'past-unflown';
  }

  // ── Row actions ─────────────────────────────────────────────────────────────────

  function renderActions(item: BookingDisplay) {
    const { booking, firstLeg } = item;
    const isPastDeparture = firstLeg
      ? new Date(firstLeg.leg_date) < new Date(new Date().toDateString())
      : false;

    const canEditActive = canEdit && !isPastDeparture;
    const canCancelActive = canCancel && !isPastDeparture && booking.status !== "cancelled" && booking.status !== "completed";

    return (
      <div className="flex items-center justify-end gap-3">
        {/* View — always active */}
        <Link
          to={`/operations/bookings/${booking.id}`}
          className="text-slate-500 hover:text-blue-600 transition-colors"
          aria-label={`View booking ${booking.booking_reference}`}
          title={`View booking ${booking.booking_reference}`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </Link>

        {/* Edit — always rendered, grayed out when inactive */}
        {canEditActive ? (
          <Link
            to={`/operations/bookings/${booking.id}/edit`}
            className="text-slate-500 hover:text-blue-600 transition-colors"
            aria-label={`Edit booking ${booking.booking_reference}`}
            title={`Edit booking ${booking.booking_reference}`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
            </svg>
          </Link>
        ) : (
          <span
            className="text-slate-300 cursor-not-allowed"
            aria-label={`Edit booking ${booking.booking_reference}`}
            title="Cannot edit — departure date has passed"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
            </svg>
          </span>
        )}

        {/* Cancel — always rendered, grayed out when inactive */}
        {canCancelActive ? (
          <Link
            to={`/operations/bookings/${booking.id}/cancel`}
            className="text-red-500 hover:text-red-700 dark:text-red-400 transition-colors"
            aria-label={`Cancel booking ${booking.booking_reference}`}
            title={`Cancel booking ${booking.booking_reference}`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </Link>
        ) : (
          <span
            className="text-slate-300 cursor-not-allowed"
            aria-label={`Cancel booking ${booking.booking_reference}`}
            title="Cannot cancel — departure date has passed"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Skip to results link (accessibility) */}
      <a
        href="#booking-results"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-blue-600 focus:shadow-lg focus:outline-none"
      >
        Skip to results
      </a>

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Operations Bookings</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {totalCount} booking{totalCount !== 1 ? "s" : ""} found
          </p>
        </div>
        {canCreate && (
          <Link
            to="/operations/bookings/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            + New Booking
          </Link>
        )}
      </div>

      {/* A. Combined Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Date range picker */}
        <DateRangePicker
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateChange={handleDateChange}
        />

        {/* Search - dynamic as-you-type */}
        <div className="flex-1 relative">
          <input
            ref={searchRef}
            type="text"
            name="q"
            defaultValue={q}
            onChange={handleSearchInput}
            placeholder="Search by reference, passenger name, email or phone..."
            className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-3 py-2 pr-10 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {isSearching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 text-xs">
              ...
            </span>
          )}
        </div>
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

      {/* D. Status Pipeline Tabs with count badges */}
      <div className="border-b border-slate-200 dark:border-slate-700">
        <nav className="flex gap-4 -mb-px overflow-x-auto">
          {STATUS_FILTERS.map(({ value: filterValue, label }) => {
            const isActive =
              filterValue === status || (!filterValue && !status);
            const countKey = filterValue || "total";
            const count = tabCounts ? tabCounts[countKey] ?? 0 : null;
            return (
              <Link
                key={filterValue}
                to={buildFilterUrl("status", filterValue)}
                className={`whitespace-nowrap pb-2 text-sm font-medium border-b-2 transition-colors inline-flex items-center gap-1.5 ${isActive
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 hover:border-slate-300 dark:border-slate-600"
                  }`}
              >
                {label}
                {count !== null && (
                  <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 rounded-full px-1.5 text-xs font-medium ${isActive
                    ? "bg-blue-100 text-blue-700"
                    : "bg-slate-100 text-slate-500 dark:text-slate-400 dark:text-slate-500"
                    }`}>
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* E. Results Section (with skip target and focus management) */}
      <div
        id="booking-results"
        ref={resultsRef}
        tabIndex={-1}
        className="outline-none"
        aria-label="Booking results"
      >
        {/* Desktop DataTable (hidden on mobile) */}
        <div className="hidden md:block bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700 dark:border-slate-700 overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-4">
              <Skeleton variant="rectangular" className="h-10 w-full" />
              <Skeleton variant="rectangular" className="h-10 w-full" />
              <Skeleton variant="rectangular" className="h-10 w-full" />
              <Skeleton variant="rectangular" className="h-10 w-full" />
              <Skeleton variant="rectangular" className="h-10 w-full" />
            </div>
          ) : processedBookings.length === 0 ? (
            <EmptyState
              title={
                q
                  ? "No bookings match your search."
                  : dateFrom && dateTo
                    ? "No bookings in this date range."
                    : status
                      ? `No bookings with status "${status.replace(/_/g, " ")}".`
                      : "No bookings found."
              }
              description={hasActiveFilters ? "Try adjusting your filters to see more results." : undefined}
              {...(hasActiveFilters
                ? {
                    action: {
                      label: "View all bookings",
                      to: "/operations/bookings",
                    },
                  }
                : {})}
            />
          ) : (
            <DataTable
              columns={columns}
              data={processedBookings}
              keyExtractor={(item) => item.booking.id}
              sortable
              showFilters
              filters={columnFilters}
              onFilterChange={(column, value) =>
                setColumnFilters((prev) => ({ ...prev, [column]: value }))
              }
              onSort={(column, direction) => {
                setSortColumn(column);
                setSortDirection(direction);
              }}
              actions={renderActions}
              rowClassName={(item) => {
                const { booking } = item;
                const isPendingStuck =
                  booking.status === "pending" &&
                  (new Date().getTime() - new Date(booking.updated_at).getTime()) >
                    24 * 60 * 60 * 1000;
                if (isPendingStuck) return "bg-amber-50";
                return "";
              }}
            />
          )}
        </div>

        {/* Mobile Card View (hidden on md and above) */}
        <div className="block md:hidden space-y-3">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/20">
                  <Skeleton variant="text" className="h-5 w-32 mb-2" />
                  <Skeleton variant="text" className="h-4 w-48 mb-2" />
                  <Skeleton variant="text" className="h-4 w-24" />
                </div>
              ))}
            </div>
          ) : processedBookings.length === 0 ? (
            <EmptyState
              title={
                q
                  ? "No bookings match your search."
                  : dateFrom && dateTo
                    ? "No bookings in this date range."
                    : status
                      ? `No bookings with status "${status.replace(/_/g, " ")}".`
                      : "No bookings found."
              }
              description={hasActiveFilters ? "Try adjusting your filters to see more results." : undefined}
              {...(hasActiveFilters
                ? {
                    action: {
                      label: "View all bookings",
                      to: "/operations/bookings",
                    },
                  }
                : {})}
            />
          ) : (
            processedBookings.map(({ booking, firstLeg, passenger }) => {
              const isPendingStuck = booking.status === "pending" &&
                (new Date().getTime() - new Date(booking.updated_at).getTime()) > 24 * 60 * 60 * 1000;
              const cardBorder = isPendingStuck ? "border-amber-300" : "border-slate-200 dark:border-slate-700";

              return (
                <Link
                  key={booking.id}
                  to={`/operations/bookings/${booking.id}`}
                  className={`block rounded-lg border ${cardBorder} bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/20 hover:shadow-md transition-shadow`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {booking.booking_reference}
                      </span>
                      {passenger && (
                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                          {passenger.first_name} {passenger.last_name}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={booking.status} />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 mb-2">
                    {firstLeg ? (
                      <>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{firstLeg.origin_code}</span>
                        <svg className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
                        </svg>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{firstLeg.destination_code}</span>
                      </>
                    ) : (
                      <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">No route</span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                    {firstLeg && (
                      <span>{new Date(firstLeg.leg_date).toLocaleDateString()}</span>
                    )}
                    <PaymentStatusBadge status={booking.payment_status} />
                    {booking.total_amount_gbp != null && (
                      <span className="font-medium text-slate-700 dark:text-slate-300 dark:text-slate-500">
                        &pound;{Number(booking.total_amount_gbp).toFixed(2)}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>

      {/* F. Pagination — always visible to maintain filter bar context */}
      <div className="flex items-center justify-center">
        {totalPages > 1 ? (
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            baseUrl="/operations/bookings"
          />
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
            Page {page} of {totalPages || 1}
          </p>
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