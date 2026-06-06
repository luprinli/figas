import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData, useNavigation } from "@remix-run/react";
import { bookingRepository } from "../utils/repositories/booking";
import { bookingLegRepository } from "../utils/repositories/booking-leg";
import { bookingPassengerRepository } from "../utils/repositories/booking-passenger";
import { bookingLegPassengerRepository } from "../utils/repositories/booking-leg-passenger";
import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { getSession } from "../session.server";
import StatusBadge from "../components/StatusBadge";
import PaymentStatusBadge from "../components/PaymentStatusBadge";
import CountdownBar from "../components/CountdownBar";
import Skeleton from "../components/Skeleton";
import AlertBanner from "../components/AlertBanner";
import DataTable from "../components/DataTable";
import type { Column } from "../components/DataTable";
import ExpandableSection from "../components/ui/ExpandableSection";

export const meta: MetaFunction = () => [{ title: "Booking Detail - FIGAS" }];

// ── Status Pipeline Definition ─────────────────────────────────────────────────

const STATUS_PIPELINE = [
  "pending",
  "completed",
] as const;

// ── Loader ─────────────────────────────────────────────────────────────────────

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requirePermission(request, Permission.BOOKING_VIEW);

  const bookingId = Number(params.bookingId);
  if (isNaN(bookingId)) {
    throw new Response("Invalid booking ID", { status: 400 });
  }

  const booking = await bookingRepository.findById(bookingId);
  if (!booking) {
    throw new Response("Booking not found", { status: 404 });
  }

  // Fetch passengers, leg passengers, and legs in parallel
  let passengers: Awaited<ReturnType<typeof bookingPassengerRepository.findByBookingId>> = [];
  let legPassengers: Awaited<ReturnType<typeof bookingLegPassengerRepository.findByBookingId>> = [];
  let passengersError = false;
  try {
    [passengers, legPassengers] = await Promise.all([
      bookingPassengerRepository.findByBookingId(bookingId),
      bookingLegPassengerRepository.findByBookingId(bookingId),
    ]);
  } catch {
    passengersError = true;
  }

  const legs = await bookingLegRepository.findByBookingId(bookingId);

  const hoursInStatus = await bookingRepository.getHoursInStatus(bookingId);
  const daysUntilDeparture = await bookingRepository.getDaysUntilDeparture(bookingId);

  // Determine if this is a past booking (all legs have dates in the past)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isPastBooking = legs.length > 0 && legs.every((leg) => {
    const legDate = new Date(leg.leg_date + "T00:00:00");
    return !isNaN(legDate.getTime()) && legDate < today;
  });

  // Permission flags
  const session = await getSession(request.headers.get("Cookie"));
  const userId = Number(session.get("userId"));

  const [canEdit, canCancel, canManagePayment, canManagePassengers, canManageFreight, canCheckin] =
    await Promise.all([
      import("../utils/permissions.server").then((m) => m.hasPermission(userId, Permission.BOOKING_EDIT)),
      import("../utils/permissions.server").then((m) => m.hasPermission(userId, Permission.BOOKING_CANCEL)),
      import("../utils/permissions.server").then((m) => m.hasPermission(userId, Permission.BOOKING_MANAGE_PAYMENT)),
      import("../utils/permissions.server").then((m) => m.hasPermission(userId, Permission.BOOKING_MANAGE_PASSENGERS)),
      import("../utils/permissions.server").then((m) => m.hasPermission(userId, Permission.BOOKING_MANAGE_FREIGHT)),
      import("../utils/permissions.server").then((m) => m.hasPermission(userId, Permission.BOOKING_CHECKIN)),
    ]);

  return json({
    booking,
    passengers,
    legPassengers,
    legs,
    hoursInStatus,
    daysUntilDeparture,
    isPastBooking,
    canEdit,
    canCancel,
    canManagePayment,
    canManagePassengers,
    canManageFreight,
    canCheckin,
    passengersError,
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(amount: number | null): string {
  if (amount == null) return "—";
  return `£${Number(amount).toFixed(2)}`;
}

function getDaysUntilLabel(days: number | null): { label: string; className: string } {
  if (days === null) return { label: "Date TBC", className: "bg-slate-100 text-slate-600 dark:text-slate-300 dark:text-slate-500" };
  if (days < 0) return { label: "Departed", className: "bg-red-100 text-red-700" };
  if (days === 0) return { label: "Today!", className: "bg-amber-100 text-amber-700" };
  return { label: `${days} day${days !== 1 ? "s" : ""}`, className: "bg-green-100 text-green-700" };
}

// ── Status Progression Stepper ─────────────────────────────────────────────────

function StatusProgression({ currentStatus }: { currentStatus: string }) {
  const currentIdx = STATUS_PIPELINE.indexOf(currentStatus as typeof STATUS_PIPELINE[number]);
  const isCancelled = currentStatus === "cancelled";

  return (
    <div className="overflow-x-auto py-4" aria-label="Booking status progression">
      <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-0 md:min-w-max">
        {STATUS_PIPELINE.map((status, idx) => {
          const isCompleted = !isCancelled && currentIdx > idx;
          const isCurrent = !isCancelled && currentIdx === idx;

          let circleClass = "w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold";
          let lineClass = "h-0.5 w-8 shrink-0";
          let labelClass = "text-xs mt-1 whitespace-nowrap";

          if (isCancelled) {
            circleClass += " bg-red-100 text-red-700 dark:text-red-400 border-2 border-red-400";
            lineClass += " bg-red-200";
            labelClass += " text-red-600";
          } else if (isCompleted) {
            circleClass += " bg-green-500 text-white";
            lineClass += " bg-green-400";
            labelClass += " text-green-700";
          } else if (isCurrent) {
            circleClass += " bg-blue-500 text-white ring-2 ring-blue-300";
            lineClass += " bg-blue-300";
            labelClass += " text-blue-700 dark:text-blue-400 font-semibold";
          } else {
            circleClass += " bg-slate-200 text-slate-500 dark:text-slate-400 dark:text-slate-500";
            lineClass += " bg-slate-200";
            labelClass += " text-slate-500 dark:text-slate-400 dark:text-slate-500";
          }

          const formattedLabel = status.replace(/_/g, " ");

          return (
            <div key={status} className="flex flex-row md:flex-col items-center gap-2 md:gap-0">
              <div className="flex items-center">
                {/* Line before (except first) */}
                {idx > 0 && <div className={`${lineClass} hidden md:block`} />}
                {/* Circle */}
                <div className={circleClass}>
                  {isCompleted ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : isCancelled && idx === currentIdx ? (
                    <span className="text-xs">✕</span>
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>
                {/* Line after (except last) */}
                {idx < STATUS_PIPELINE.length - 1 && <div className={`${lineClass} hidden md:block`} />}
              </div>
              <span className={labelClass}>{formattedLabel}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Itinerary Strip ────────────────────────────────────────────────────────────

function ItineraryStrip({ legs }: { legs: Awaited<ReturnType<typeof bookingLegRepository.findByBookingId>> }) {
  if (legs.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Itinerary</h3>
      <div className="flex flex-wrap items-center gap-2">
        {legs.map((leg, idx) => (
          <div key={leg.id} className="flex items-center gap-2">
            {idx > 0 && (
              <svg className="w-4 h-4 text-slate-300 dark:text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            )}
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-700 rounded-md px-3 py-1.5">
              <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{leg.origin_code}</span>
              <svg className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
              </svg>
              <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{leg.destination_code}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">
                {formatDate(leg.leg_date)}
                {leg.preferred_time && ` ${leg.preferred_time}`}
              </span>
              {leg.flight_id && (
                <span className="text-xs text-sky-600 ml-1">Flight #{leg.flight_id}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Loading Skeleton ───────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="p-6 space-y-6">
      {/* Back link skeleton */}
      <Skeleton className="h-4 w-32" />

      {/* Header skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Hero skeleton */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-6 space-y-4">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-2 w-full" />
      </div>

      {/* Expandable sections skeleton */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="p-4">
            <Skeleton className="h-5 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function BookingDetailPage() {
  const data = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";

  // Handle loading state
  if (isLoading) {
    return (
      <div aria-live="polite" aria-busy="true">
        <LoadingSkeleton />
      </div>
    );
  }

  const {
    booking,
    passengers,
    legPassengers,
    legs,
    hoursInStatus,
    daysUntilDeparture,
    isPastBooking,
    canCancel,
    canManagePayment,
    canCheckin,
    passengersError,
  } = data;

  // Handle not found is handled by the loader throwing a Response

  const firstPassenger = passengers.length > 0 ? passengers[0] : null;
  const daysLabel = getDaysUntilLabel(daysUntilDeparture);
  const earliestLeg = legs.length > 0 ? legs[0] : null;
  const isPaid = booking.payment_status === "paid";
  const isPaidOrPartiallyPaid = booking.payment_status === "paid" || booking.payment_status === "partially_paid";
  const canShowPaymentAction = canManagePayment && !isPaid && !isPastBooking;
  const canShowCancel = canCancel && !["completed", "cancelled"].includes(booking.status) && !isPastBooking;
  const canShowCheckin = canCheckin && booking.status !== "completed" && booking.status !== "cancelled" && !isPastBooking;

  // Build alerts for partial data
  const alerts: Array<{ severity: "warning" | "error" | "info"; message: string }> = [];
  if (isPastBooking) {
    alerts.push({
      severity: "info",
      message: "This booking has past departure dates and cannot be amended.",
    });
  }
  if (passengersError) {
    alerts.push({
      severity: "warning",
      message: "Passenger information could not be loaded. Some details may be unavailable.",
    });
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* A. Back Link & Header */}
      <Link
        to="/bookings"
        className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 transition-colors mb-4"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Back to My Bookings
      </Link>

      <div className="flex flex-wrap items-center gap-3 mb-1">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{booking.booking_reference}</h1>
        <StatusBadge status={booking.status} />
        <PaymentStatusBadge status={booking.payment_status} />
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        {booking.booking_source?.replace(/_/g, " ")} &middot; Created {formatDate(booking.created_at)}
      </p>

      {/* Partial data warning */}
      {alerts.length > 0 && (
        <div className="mb-6" role="status" aria-live="polite" aria-atomic="true">
          <AlertBanner alerts={alerts} />
        </div>
      )}

      {/* B. Hero Section */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 mb-6 shadow-sm dark:shadow-slate-900/20">
        {firstPassenger && (
          <p className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">
            {firstPassenger.first_name} {firstPassenger.last_name}
          </p>
        )}

        {/* Route strip */}
        {earliestLeg && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300 mb-3">
            <span className="font-medium text-slate-800 dark:text-slate-100">{legs.map((l) => l.origin_code).join(", ")}</span>
            <svg className="w-4 h-4 text-slate-500 dark:text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
            </svg>
            <span className="font-medium text-slate-800 dark:text-slate-100">{legs[legs.length - 1]?.destination_code}</span>
            <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">&middot;</span>
            <span>{formatDate(earliestLeg.leg_date)}</span>
          </div>
        )}

        {/* Countdown bar */}
        {earliestLeg && (
          <div className="mb-3">
            <CountdownBar departureDate={earliestLeg.leg_date} />
          </div>
        )}

        {/* Days until departure badge */}
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${daysLabel.className}`}>
            {daysLabel.label}
          </span>
          {hoursInStatus > 0 && (
            <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
              {hoursInStatus}h in current status
            </span>
          )}
        </div>
      </div>

      {/* C. Status Progression Indicator */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 mb-6 shadow-sm dark:shadow-slate-900/20">
        <StatusProgression currentStatus={booking.status} />
      </div>

      {/* D. Itinerary Strip */}
      <div className="mb-6">
        <ItineraryStrip legs={legs} />
      </div>

      {/* E. Expandable Sections */}
      <div className="space-y-6 mb-8">
        {/* Passengers */}
        <ExpandableSection title="Passengers" defaultExpanded badge={passengers.length > 0 ? passengers.length : undefined}>
          {passengers.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No passengers on this booking.</p>
          ) : (
            <DataTable
              columns={([
                { key: "name", header: "Name", sortable: true, render: (p: Record<string, unknown>) => (
                  <span className="font-medium text-slate-800 dark:text-slate-100">{p.first_name as string} {p.last_name as string}</span>
                )},
                { key: "seat", header: "Seat", render: () => <span className="text-slate-600 dark:text-slate-300">—</span> },
                { key: "weight", header: "Weight (kg)", sortable: true, render: (p: Record<string, unknown>) => (
                  <span className="text-slate-600 dark:text-slate-300 tabular-nums">{p.clothed_weight_kg as number}</span>
                )},
                { key: "requirements", header: "Special Requirements", render: (p: Record<string, unknown>) => (
                  <span className="text-slate-600 dark:text-slate-300">{String(p.special_requirements ?? "—")}</span>
                )},
              ] as Column<Record<string, unknown>>[])}
              data={passengers as unknown as Record<string, unknown>[]}
              keyExtractor={(p) => (p as unknown as Record<string, unknown>).id as number}
              sortable
            />
          )}
        </ExpandableSection>

        {/* Seats */}
        <ExpandableSection title="Seats">
          <div className="space-y-3">
            {legPassengers.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No seat assignments yet.</p>
            ) : (
              <DataTable
                columns={([
                  { key: "passenger", header: "Passenger", sortable: true, render: (lp: Record<string, unknown>) => (
                    <span className="font-medium text-slate-800 dark:text-slate-100">{lp.first_name as string} {lp.last_name as string}</span>
                  )},
                  { key: "leg", header: "Leg", render: (lp: Record<string, unknown>) => {
                    const leg = legs.find((l) => l.id === (lp as Record<string, unknown>).booking_leg_id) as { origin_code: string; destination_code: string } | undefined;
                    return <span className="text-slate-600 dark:text-slate-300">{leg ? `${leg.origin_code} → ${leg.destination_code}` : "—"}</span>;
                  }},
                  { key: "seat", header: "Seat", sortable: true, render: (lp: Record<string, unknown>) => (
                    <span className="text-slate-600 dark:text-slate-300 font-mono">{lp.seat_number as string}</span>
                  )},
                ] as Column<Record<string, unknown>>[])}
                data={legPassengers.filter((lp) => lp.seat_number) as Record<string, unknown>[]}
                keyExtractor={(lp) => (lp as Record<string, unknown>).id as number}
                sortable
              />
            )}
            {legPassengers.filter((lp) => !lp.seat_number).length > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400 italic mt-2">
                {legPassengers.filter((lp) => !lp.seat_number).length} passenger(s) without seat assignment
              </p>
            )}
          </div>
        </ExpandableSection>

        {/* Freight */}
        <ExpandableSection title="Freight">
          <div className="space-y-3">
            {legPassengers.filter((lp) => lp.freight_description || (lp.freight_weight_kg ?? 0) > 0).length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">No freight declared for this booking.</p>
            ) : (
              legPassengers
                .filter((lp) => lp.freight_description || (lp.freight_weight_kg ?? 0) > 0)
                .map((lp) => {
                  const leg = legs.find((l) => l.id === lp.booking_leg_id);
                  return (
                    <div key={lp.id} className="rounded-md bg-slate-50 dark:bg-slate-700 p-3">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                        {leg?.origin_code ?? "?"} → {leg?.destination_code ?? "?"}
                        {lp.first_name && (
                          <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">
                            ({lp.first_name} {lp.last_name})
                          </span>
                        )}
                      </p>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">Description</span>
                          <p className="text-slate-700 dark:text-slate-200">{lp.freight_description ?? "—"}</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">Weight</span>
                          <p className="text-slate-700 dark:text-slate-200">{(lp.freight_weight_kg ?? 0) > 0 ? `${lp.freight_weight_kg} kg` : "—"}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </ExpandableSection>

        {/* Payment section with optional two-column layout */}
        <div className="lg:grid lg:grid-cols-12 lg:gap-8">
          {/* Left column — payment actions */}
          <div className="lg:col-span-7 space-y-4">
            <ExpandableSection title="Payment">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">Payment Method</span>
                    <p className="text-slate-700 dark:text-slate-200">{booking.payment_method?.replace(/_/g, " ") ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">Payment Status</span>
                    <p className="text-slate-700 dark:text-slate-200">
                      <PaymentStatusBadge status={booking.payment_status} />
                    </p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">Total Amount</span>
                    <p className="text-slate-700 font-semibold">{formatCurrency(booking.total_amount_gbp)}</p>
                  </div>
                </div>
                {!isPaid && canManagePayment && (
                  <div className="pt-2">
                    <Link
                      to={`/bookings/${booking.id}/payment`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-sky-600 hover:text-sky-700"
                    >
                      Make Payment
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </Link>
                  </div>
                )}
              </div>
            </ExpandableSection>
          </div>

          {/* Right column — reserved for cost summary (future) */}
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-6 space-y-4">
              {/* BookingCostSummary and FareDifferenceCalculator will be added here when available */}
            </div>
          </div>
        </div>

        {/* Itinerary Details */}
        <ExpandableSection title="Itinerary Details">
          {legs.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">No itinerary details available.</p>
          ) : (
            <div className="space-y-3">
              {legs.map((leg, idx) => (
                <div key={leg.id} className="rounded-md bg-slate-50 dark:bg-slate-700 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Leg {idx + 1}: {leg.origin_code} → {leg.destination_code}
                    </p>
                    {leg.flight_id && (
                      <span className="text-xs text-sky-600">Flight #{leg.flight_id}</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                    <div>
                      <span className="font-medium">Date:</span> {formatDate(leg.leg_date)}
                    </div>
                    {leg.preferred_time && (
                      <div>
                        <span className="font-medium">Preferred Time:</span> {leg.preferred_time}
                      </div>
                    )}
                    {leg.preferred_time_start && (
                      <div>
                        <span className="font-medium">Time Window:</span> {leg.preferred_time_start} - {leg.preferred_time_end}
                      </div>
                    )}
                    <div>
                      <span className="font-medium">Status:</span> {leg.status.replace(/_/g, " ")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ExpandableSection>
      </div>

      {/* F. Quick Actions */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 mt-6 border-t border-slate-200 dark:border-slate-700">
        {canShowPaymentAction && (
          <Link
            to={`/bookings/${booking.id}/payment`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
            </svg>
            Make Payment
          </Link>
        )}

        {canShowCancel && (
          <button
            type="button"
            onClick={() => {
              const msg = isPaidOrPartiallyPaid
                ? `This booking has been paid (£${Number(booking.total_amount_gbp ?? 0).toFixed(2)}). Cancelling will require a refund. Continue?`
                : "Are you sure you want to cancel this booking?";
              if (window.confirm(msg)) {
                window.location.href = `/bookings/${booking.id}/cancel`;
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:bg-red-900/30 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Cancel Booking
          </button>
        )}

        {canShowCheckin && (
          <Link
            to={`/checkin?booking=${booking.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Check In
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Error Boundary ─────────────────────────────────────────────────────────────

export function ErrorBoundary() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link
        to="/bookings"
        className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 transition-colors mb-4"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Back to My Bookings
      </Link>
      <AlertBanner alerts={[{ severity: "error", message: "An error occurred while loading this booking. Please try again later." }]} />
    </div>
  );
}
