import type {
  HeadersFunction,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Link,
  useLoaderData,
  useFetcher,
  useNavigate,
  useNavigation,
  useRevalidator,
  useRouteError,
  isRouteErrorResponse,
} from "@remix-run/react";
import { useEffect, useState } from "react";
import { RefreshCw, User } from "lucide-react";
import { bookingRepository } from "../utils/repositories/booking";
import { bookingLegRepository } from "../utils/repositories/booking-leg";
import { bookingPassengerRepository } from "../utils/repositories/booking-passenger";
import { bookingLegPassengerRepository } from "../utils/repositories/booking-leg-passenger";
import { requirePermission } from "../utils/permissions.server";
import { generateCsrfTokenFromRequest } from "../utils/csrf-check.server";
import { Permission, BookingStatus, BookingSource, PaymentStatus } from "../utils/constants";
import type { BookingLegRow } from "../utils/repositories/booking-leg";
import DataTable from "../components/DataTable";
import type { Column } from "../components/DataTable";
import type { BookingPassengerRow } from "../utils/repositories/booking-passenger";
import type { BookingLegPassengerWithDetails } from "../utils/repositories/booking-leg-passenger";
import StatusBadge from "../components/StatusBadge";
import PaymentStatusBadge from "../components/PaymentStatusBadge";
import Skeleton from "../components/Skeleton";
import AlertBanner from "../components/AlertBanner";
import PageLayout from "../components/PageLayout";
import BookingCostSummary from "../components/booking/BookingCostSummary";
import PaymentMethodSelector from "../components/booking/PaymentMethodSelector";
import { calculateFareBreakdown } from "../utils/services/fare-calculator.server";
import { getAvailableMethods } from "../utils/services/payment.service";
import Button from "../components/Button";
import ConfirmDialog from "../components/ConfirmDialog";
import { useKeyboardShortcuts } from "../utils/use-keyboard-shortcuts";

// ── Constants ──────────────────────────────────────────────────────────────────

const sourceLabels: Record<string, string> = {
  [BookingSource.CUSTOMER_DIRECT]: "Customer Direct",
  [BookingSource.BOOKING_AGENT]: "Booking Agent",
  [BookingSource.OPERATIONS_STAFF]: "Operations Staff",
};

import { VALID_TRANSITIONS } from "./operations.bookings.$bookingId.action.server";

export { action } from "./operations.bookings.$bookingId.action.server";

// ── Meta ───────────────────────────────────────────────────────────────────────

export const headers: HeadersFunction = () => ({
  "Cache-Control": "no-cache, no-store, must-revalidate",
});

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data?.booking) return [{ title: "Booking Not Found | FIGAS" }];
  return [{ title: `Booking ${data.booking.booking_reference} | FIGAS Operations` }];
};

// ── Loader ─────────────────────────────────────────────────────────────────────

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await requirePermission(request, Permission.BOOKING_VIEW);
  const csrfToken = generateCsrfTokenFromRequest(request);

  const bookingId = Number(params.bookingId);
  if (isNaN(bookingId)) {
    throw json({ error: "Invalid booking ID" }, { status: 400 });
  }

  const booking = await bookingRepository.findById(bookingId);
  if (!booking) {
    throw json({ error: "Booking not found" }, { status: 404 });
  }

  // Fetch all data in parallel where possible
  const [passengers, legPassengers, legs, hoursInStatus, daysUntilDeparture] = await Promise.all([
    bookingPassengerRepository.findByBookingId(bookingId).catch((err) => {
      console.error("Failed to load passengers:", err);
      return [] as BookingPassengerRow[];
    }),
    bookingLegPassengerRepository.findByBookingId(bookingId).catch((err) => {
      console.error("Failed to load leg passengers:", err);
      return [] as BookingLegPassengerWithDetails[];
    }),
    bookingLegRepository.findByBookingId(bookingId).catch((err) => {
      console.error("Failed to load legs:", err);
      return [] as BookingLegRow[];
    }),
    bookingRepository.getHoursInStatus(bookingId).catch((err) => {
      console.error("Failed to get hours in status:", err);
      return 0;
    }),
    bookingRepository.getDaysUntilDeparture(bookingId).catch((err) => {
      console.error("Failed to get days until departure:", err);
      return null;
    }),
  ]);

  // Fetch fare breakdown and available payment methods
  const [fareBreakdown, availablePaymentMethods] = await Promise.all([
    calculateFareBreakdown(legs, passengers, legPassengers).catch((err) => {
      console.error("Failed to calculate fare breakdown:", err);
      return null;
    }),
    getAvailableMethods().catch((err) => {
      console.error("Failed to load payment methods:", err);
      return [] as Array<{ code: string; name: string; description: string | null }>;
    }),
  ]);

  // Determine if this is a past booking (all legs have dates in the past)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isPastBooking = legs.length > 0 && legs.every((leg) => {
    const legDate = new Date(leg.leg_date + "T00:00:00");
    return !isNaN(legDate.getTime()) && legDate < today;
  });

  // Permission flags
  const userPermissions = user.permissions;
  const canEdit = userPermissions.includes(Permission.BOOKING_EDIT);
  const canApprove = userPermissions.includes(Permission.BOOKING_APPROVE);
  const canCancel = userPermissions.includes(Permission.BOOKING_CANCEL);
  const canAssignFlight = userPermissions.includes(Permission.BOOKING_ASSIGN_FLIGHT);
  const canManagePayment = userPermissions.includes(Permission.BOOKING_MANAGE_PAYMENT);
  const canManagePassengers = userPermissions.includes(Permission.BOOKING_MANAGE_PASSENGERS);
  const canManageFreight = userPermissions.includes(Permission.BOOKING_MANAGE_FREIGHT);
  const canCheckin = userPermissions.includes(Permission.BOOKING_CHECKIN);

  return json({
    booking,
    bookingId,
    passengers,
    legPassengers,
    legs,
    hoursInStatus,
    daysUntilDeparture,
    isPastBooking,
    fareBreakdown,
    availablePaymentMethods,
    permissions: {
      canEdit,
      canApprove,
      canCancel,
      canAssignFlight,
      canManagePayment,
      canManagePassengers,
      canManageFreight,
      canCheckin,
    },
    csrfToken,
  });
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function OperationsBookingDetail() {
  const {
    booking,
    bookingId,
    passengers,
    legPassengers,
    legs,
    hoursInStatus,
    daysUntilDeparture,
    isPastBooking,
    fareBreakdown,
    availablePaymentMethods,
    permissions,
    csrfToken,
  } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const navigation = useNavigation();
  const statusFetcher = useFetcher<{ success?: boolean; newStatus?: string; error?: string }>();
  const cancelFetcher = useFetcher<{ success?: boolean; newStatus?: string; error?: string }>();

  const isInitialLoading = navigation.state === "loading" && !navigation.formData;
  const isCancelled = booking.status === BookingStatus.CANCELLED;
  const isTerminal = booking.status === BookingStatus.COMPLETED || isCancelled;
  const isRevalidating = revalidator.state === "loading";

  // Revalidate after successful mutation
  useEffect(() => {
    if (
      (statusFetcher.data?.success || cancelFetcher.data?.success) &&
      statusFetcher.state === "idle" &&
      cancelFetcher.state === "idle"
    ) {
      revalidator.revalidate();
    }
  }, [statusFetcher.data, cancelFetcher.data, statusFetcher.state, cancelFetcher.state, revalidator]);

  // ── Payment panel toggle ───────────────────────────────────────────────────
  const [showPaymentPanel, setShowPaymentPanel] = useState(false);
  const navigate = useNavigate();

  useKeyboardShortcuts({
    "p": () => setShowPaymentPanel((prev) => !prev),
    "g b": () => navigate("/operations/bookings"),
  });

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [pendingStatus, setPendingStatus] = useState("");
  const [selectKey, setSelectKey] = useState(0);

  // Don't show payment options if payment is already processing or invoiced
  const isPaymentLocked =
    booking.payment_status === PaymentStatus.PROCESSING ||
    booking.payment_status === PaymentStatus.INVOICED;

  const handleCancelConfirm = () => {
    const formData = new FormData();
    formData.append("intent", "cancel");
    formData.append("cancellation_reason", "Cancelled by operations");
    cancelFetcher.submit(formData, { method: "post" });
  };

  const handleStatusConfirm = () => {
    const formData = new FormData();
    formData.append("intent", "update_status");
    formData.append("status", pendingStatus);
    statusFetcher.submit(formData, { method: "post" });
  };

  // ── Payment notification (replaces alert()) ─────────────────────────────────
  const [paymentNotification, setPaymentNotification] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (paymentNotification) {
      const timer = setTimeout(() => setPaymentNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [paymentNotification]);

  // ── Build alerts ────────────────────────────────────────────────────────────
  const alerts: Array<{ severity: "warning" | "error" | "info"; message: string }> = [];

  // Alert: past booking
  if (isPastBooking && !isTerminal) {
    alerts.push({
      severity: "info",
      message: "This booking has past departure dates and cannot be amended.",
    });
  }

  // Alert: stuck in status > 24h
  if (hoursInStatus > 24 && !isTerminal) {
    alerts.push({
      severity: "warning",
      message: `Booking has been in ${booking.status.replace(/_/g, " ")} for ${hoursInStatus}h`,
    });
  }

  // Alert: departure imminent but not completed
  if (
    daysUntilDeparture !== null &&
    daysUntilDeparture <= 1 &&
    !isCancelled &&
    booking.status !== BookingStatus.COMPLETED
  ) {
    alerts.push({
      severity: "warning",
      message: "Departure imminent, booking not yet assigned to flight",
    });
  }

  // ── Passenger had partial data failure? ─────────────────────────────────────
  const passengersFailed = passengers.length === 0 && legs.length > 0;

  // ── Compute total cost from fare breakdown or fall back to stored total ────
  const totalCost = fareBreakdown?.total ?? Number(booking.total_amount_gbp ?? 0);

  if (isInitialLoading) {
    return (
      <PageLayout title="Loading...">
        <div className="space-y-6" aria-live="polite" aria-busy="true">
          <Skeleton className="h-8 w-48 rounded" />
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm dark:shadow-slate-900/20 space-y-4">
            <Skeleton className="h-4 w-64 rounded" />
            <Skeleton className="h-4 w-40 rounded" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-3">
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="h-8 w-full rounded" />
              <Skeleton className="h-8 w-full rounded" />
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-3">
              <Skeleton className="h-4 w-32 rounded" />
              <Skeleton className="h-4 w-full rounded" />
              <Skeleton className="h-4 w-48 rounded" />
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-3">
            <Skeleton className="h-4 w-36 rounded" />
            <Skeleton className="h-6 w-full rounded" />
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title={booking.booking_reference}>
      <div className="space-y-6">
        {/* ── B. AlertBanner Section ────────────────────────────────────────── */}
        {alerts.length > 0 && (
          <div role="status" aria-live="polite" aria-atomic="true">
            <AlertBanner alerts={alerts} />
          </div>
        )}

        {/* Partial data warning */}
        {passengersFailed && (
          <div role="status" aria-live="polite" aria-atomic="true">
            <AlertBanner
              alerts={[
                {
                  severity: "warning",
                  message: "Passenger data could not be loaded. Some sections may be incomplete.",
                },
              ]}
            />
          </div>
        )}

        {/* Error banner from fetchers */}
        {(statusFetcher.data?.error || cancelFetcher.data?.error) && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 p-4 text-sm text-red-700" role="alert">
            {statusFetcher.data?.error ?? cancelFetcher.data?.error}
          </div>
        )}

        {/* ── Booking Summary Card ──────────────────────────────────────────── */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm dark:shadow-slate-900/20">
          {/* ── 1. Compact Header ────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status={booking.status} />
                <PaymentStatusBadge status={booking.payment_status} />
                {VALID_TRANSITIONS[booking.status]?.length > 0 && (
                  <select
                    key={selectKey}
                    className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-700 dark:text-slate-200 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    defaultValue=""
                    aria-label="Change booking status"
                    disabled={statusFetcher.state === "submitting"}
                    onChange={(e) => {
                      const newStatus = e.target.value;
                      if (!newStatus) return;
                      setPendingStatus(newStatus);
                      setShowStatusDialog(true);
                    }}
                  >
                    <option value="">Progress status...</option>
                    {VALID_TRANSITIONS[booking.status].map((status) => (
                      <option key={status} value={status}>
                        {status === "completed" ? "Complete" : status === "cancelled" ? "Cancel" : status.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Created {new Date(booking.created_at).toLocaleDateString("en-GB")} &middot;{" "}
                {sourceLabels[booking.booking_source] ?? booking.booking_source}
              </p>
            </div>
          </div>

          {/* ── 2. 2-column grid for Passengers, Cost Summary ──── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
            {/* Column 1: Passengers */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/20">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">Passengers</h3>
              {passengers.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">No passengers</p>
              ) : (
                <DataTable
                  columns={([
                    { key: "name", header: "Name", sortable: true, render: (p: Record<string, unknown>) => (
                      <span className="flex items-center gap-2">
                        <User size={16} className="text-slate-500 dark:text-slate-400 shrink-0" absoluteStrokeWidth />
                        {p.first_name as string} {p.last_name as string}
                      </span>
                    )},
                    { key: "weight", header: "Baggage (kg)", sortable: true, render: (p: Record<string, unknown>) => {
                      const baggage = legPassengers
                        .filter((lp) => lp.booking_passenger_id === (p as Record<string, unknown>).id as number)
                        .reduce((sum, lp) => sum + (lp.baggage_weight_kg || 0), 0);
                      return <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{baggage} kg</span>;
                    }},
                  ] as Column<Record<string, unknown>>[])}
                  data={passengers as unknown as Record<string, unknown>[]}
                  keyExtractor={(p) => (p as unknown as Record<string, unknown>).id as number}
                  sortable
                />
              )}
              {legPassengers.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Total baggage</span>
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {legPassengers.reduce((sum, lp) => sum + (lp.baggage_weight_kg || 0), 0)} kg
                    {legPassengers.some(lp => (lp.freight_weight_kg ?? 0) > 0) && (
                      <span className="ml-2 text-slate-500 dark:text-slate-400">
                        · Freight: {legPassengers.reduce((sum, lp) => sum + (lp.freight_weight_kg || 0), 0)} kg
                      </span>
                    )}
                  </span>
                </div>
              )}
              {permissions.canManagePassengers && (
                <Link
                  to={`/operations/bookings/${bookingId}/passengers`}
                  className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 transition-colors mt-2 inline-block"
                >
                  Manage Passengers \u2192
                </Link>
              )}
            </div>

            {/* Column 2: Cost Summary */}
            <BookingCostSummary
              totalAmountGbp={totalCost}
              fareBreakdown={fareBreakdown ?? null}
            />
            <div className="flex flex-wrap items-center gap-1.5 text-sm mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              {booking.payment_method && (
                <span className="text-slate-500 dark:text-slate-400">{booking.payment_method}</span>
              )}
              {booking.payment_method && booking.payment_status && (
                <span className="text-slate-300 dark:text-slate-500">·</span>
              )}
              {booking.payment_status && (
                <PaymentStatusBadge status={booking.payment_status} />
              )}
              <span className="text-slate-300 dark:text-slate-500">·</span>
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                Total: &pound;{totalCost.toFixed(2)}
              </span>
            </div>
          </div>

          {/* ── 5. Payment + Actions ────────────────────────────────────────── */}
          <div>
            {/* Payment notification toast */}
            {paymentNotification && (
              <div
                className={`mb-3 px-4 py-2 rounded-md text-sm font-medium ${
                  paymentNotification.type === "success"
                    ? "bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-400 border border-green-200"
                    : paymentNotification.type === "error"
                    ? "bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-400 border border-red-200"
                    : "bg-blue-50 dark:bg-blue-900/30 text-blue-800 border border-blue-200"
                }`}
                role="alert"
              >
                {paymentNotification.message}
              </div>
            )}

            {/* Inline PaymentMethodSelector (useState toggle) */}
            {showPaymentPanel && (
              <div className="mb-4 rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                <PaymentMethodSelector
                  bookingId={bookingId}
                  totalAmount={totalCost}
                  availableMethods={availablePaymentMethods}
                  csrfToken={csrfToken}
                  onPaymentInitiated={(method) => {
                    setPaymentNotification({
                      type: "info",
                      message: `Payment initiated via ${method}. Redirecting to payment gateway...`,
                    });
                  }}
                  disabled={isTerminal}
                />
              </div>
            )}

            {/* If paid: compact single-line confirmation */}
            {booking.payment_method && (
              <div className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                ✅ Paid via{" "}
                <span className="font-medium capitalize">
                  {booking.payment_method.replace(/_/g, " ")}
                </span>{" "}
                on{" "}
                {new Date(booking.updated_at).toLocaleDateString("en-GB", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </div>
            )}

            {/* Terminal state with no payment method */}
            {isTerminal && !booking.payment_method && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Payment status: <PaymentStatusBadge status={booking.payment_status} />
              </p>
            )}

            {/* Action bar: Back to Bookings (left) | Payment Options + Cancel Booking (right) */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
              <Link
                to="/operations/bookings"
                className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 transition-colors"
              >
                &larr; Back to Bookings
              </Link>
              <div className="flex items-center gap-3">
                {!isPaymentLocked && (
                  <Button
                    onClick={() => setShowPaymentPanel((prev) => !prev)}
                    color="success"
                    size="lg"
                    className="font-semibold"
                  >
                    Payment Options
                  </Button>
                )}
                {cancelFetcher.state === "submitting" ? (
                  <Button
                    disabled
                    size="lg"
                    className="bg-red-50 dark:bg-red-900/30 text-red-300 dark:text-red-500 font-medium cursor-not-allowed"
                  >
                    Cancelling...
                  </Button>
                ) : (
                  <Button
                    variant="outlined"
                    color="danger"
                    size="lg"
                    className="bg-red-50 dark:bg-red-900/30 hover:bg-red-100 font-medium"
                    onClick={() => setShowCancelDialog(true)}
                  >
                    Cancel Booking
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── K. Refresh Button ────────────────────────────────────────────────── */}
        <div className="flex justify-end">
          <button
            onClick={() => revalidator.revalidate()}
            disabled={isRevalidating}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors disabled:opacity-50"
          >
            {isRevalidating ? (
              <>
                <Skeleton className="inline-block h-3 w-3 rounded-full" />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw size={16} absoluteStrokeWidth />
                Refresh
              </>
            )}
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={handleCancelConfirm}
        title="Cancel Booking"
        message="Are you sure you want to cancel this booking? This action cannot be undone."
        confirmLabel="Cancel Booking"
        cancelLabel="Go Back"
        variant="danger"
      />

      <ConfirmDialog
        isOpen={showStatusDialog}
        onClose={() => {
          setShowStatusDialog(false);
          setPendingStatus("");
          setSelectKey((k) => k + 1);
        }}
        onConfirm={handleStatusConfirm}
        title="Change Booking Status"
        message={`Are you sure you want to ${(pendingStatus === "completed" ? "complete" : pendingStatus === "cancelled" ? "cancel" : pendingStatus.replace(/_/g, " "))} this booking?`}
        confirmLabel="Confirm"
        cancelLabel="Go Back"
        variant="default"
      />
    </PageLayout>
  );
}



export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="mx-auto max-w-lg text-center px-4">
          <div className="mb-4 text-5xl font-bold text-slate-400 dark:text-slate-600">{error.status}</div>
          <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Something went wrong</h1>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">{error.statusText}</p>
          <Button size="md" onClick={() => window.location.reload()}>Try Again</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="mx-auto max-w-lg text-center px-4">
        <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Unexpected Error</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">An unexpected error occurred. Please try again.</p>
        <Button size="md" onClick={() => window.location.reload()}>Try Again</Button>
      </div>
    </div>
  );
}