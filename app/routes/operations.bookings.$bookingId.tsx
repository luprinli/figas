import type {
  HeadersFunction,
  LoaderFunctionArgs,
  ActionFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Link,
  useLoaderData,
  useFetcher,
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
import { stripePaymentRepository } from "../utils/repositories/stripe-payment";
import { requirePermission } from "../utils/permissions.server";
import { getUserId } from "../utils/auth.server";
import { Permission, BookingStatus, BookingSource, PaymentMethod, PaymentStatus } from "../utils/constants";
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
import { getAvailableMethods, initiateStripePayment, recordInvoiceSelection } from "../utils/services/payment.service";

// ── Constants ──────────────────────────────────────────────────────────────────

const sourceLabels: Record<string, string> = {
  [BookingSource.CUSTOMER_DIRECT]: "Customer Direct",
  [BookingSource.BOOKING_AGENT]: "Booking Agent",
  [BookingSource.OPERATIONS_STAFF]: "Operations Staff",
};

// Simplified transitions: only completed and cancelled are terminal states.
// All non-terminal statuses can transition to completed or cancelled.
const VALID_TRANSITIONS: Record<string, string[]> = {
  [BookingStatus.PENDING]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
  [BookingStatus.PASSENGERS_ADDED]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
  [BookingStatus.WEIGHT_DECLARED]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
  [BookingStatus.FREIGHT_DECLARED]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
  [BookingStatus.FLIGHT_ASSIGNED]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
  [BookingStatus.PILOT_REVIEW]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
  [BookingStatus.APPROVED]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
  [BookingStatus.COMPLETED]: [],
  [BookingStatus.CANCELLED]: [],
};

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
  });
}

// ── Action ─────────────────────────────────────────────────────────────────────

export async function action({ request, params }: ActionFunctionArgs) {
  const bookingId = Number(params.bookingId);
  if (isNaN(bookingId)) {
    return json({ error: "Invalid booking ID" }, { status: 400 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "update_status") {
    const newStatus = formData.get("status") as string;
    const booking = await bookingRepository.findById(bookingId);
    if (!booking) {
      return json({ error: "Booking not found" }, { status: 404 });
    }

    const allowed = VALID_TRANSITIONS[booking.status] ?? [];
    if (!allowed.includes(newStatus)) {
      return json(
        {
          error: `Cannot transition from "${booking.status.replace(/_/g, " ")}" to "${newStatus.replace(/_/g, " ")}".`,
        },
        { status: 400 }
      );
    }

    await bookingRepository.updateStatus(bookingId, newStatus);
    return json({ success: true, newStatus });
  }

  if (intent === "cancel") {
    const reason = formData.get("cancellation_reason") as string;
    const userId = await getUserId(request);
    await bookingRepository.cancel(bookingId, Number(userId), reason || undefined);
    return json({ success: true, newStatus: BookingStatus.CANCELLED });
  }

  // ── Payment intents ──────────────────────────────────────────────────────

  if (intent === "initiate_stripe") {
    const amount = Number(formData.get("amount"));
    if (isNaN(amount) || amount <= 0) {
      return json({ success: false, error: "Invalid payment amount" }, { status: 400 });
    }

    const userId = await getUserId(request);
    const url = new URL(request.url);
    const result = await initiateStripePayment({
      bookingId,
      amount,
      successUrl: `${url.origin}/operations/bookings/${bookingId}/payment-success`,
      cancelUrl: `${url.origin}/operations/bookings/${bookingId}/payment-cancel`,
      userId: Number(userId),
    });

    if (!result.success) {
      return json({ success: false, error: result.error ?? "Stripe payment initiation failed" }, { status: 500 });
    }

    return json({ success: true, stripeSessionUrl: result.stripeSessionUrl });
  }

  if (intent === "generate_invoice") {
    const userId = await getUserId(request);

    // Load legs and passengers to build line items
    const legs = await bookingLegRepository.findByBookingId(bookingId).catch((err) => {
      console.error("Failed to load legs for invoice:", err);
      return [] as BookingLegRow[];
    });
    const passengers = await bookingPassengerRepository.findByBookingId(bookingId).catch((err) => {
      console.error("Failed to load passengers for invoice:", err);
      return [] as BookingPassengerRow[];
    });

    // Load freight data from booking_leg_passengers (freight moved from booking_legs in migration 016)
    const { bookingLegPassengerRepository } = await import("../utils/repositories/booking-leg-passenger");
    const legPassengers = await bookingLegPassengerRepository.findByBookingId(bookingId).catch((err) => {
      console.error("Failed to load leg passengers for invoice:", err);
      return [] as Awaited<ReturnType<typeof bookingLegPassengerRepository.findByBookingId>>;
    });

    // Build line items matching the same logic as generateInvoice
    const lineItems: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      type: string;
    }> = [];

    for (const passenger of passengers) {
      let farePerPassenger = 50;
      if (legs.length > 0) {
        const { fareRouteRepository } = await import("../utils/repositories/fare-route");
        const baseFare = await fareRouteRepository.getBaseFare(
          legs[0].origin_code,
          legs[0].destination_code
        );
        if (baseFare !== null) {
          farePerPassenger = baseFare;
        }
      }

      lineItems.push({
        description: `Fare — ${passenger.first_name} ${passenger.last_name}`,
        quantity: 1,
        unitPrice: farePerPassenger,
        type: "fare",
      });
    }

    // Freight line items per leg (from booking_leg_passengers)
    for (const leg of legs) {
      const legFreightTotal = legPassengers
        .filter((lp) => lp.booking_leg_id === leg.id)
        .reduce((sum, lp) => sum + (lp.freight_weight_kg ?? 0), 0);

      if (legFreightTotal > 0) {
        lineItems.push({
          description: `Freight — ${leg.origin_code} → ${leg.destination_code} (${legFreightTotal}kg)`,
          quantity: 1,
          unitPrice: legFreightTotal * 2,
          type: "freight",
        });
      }
    }

    const result = await recordInvoiceSelection({
      bookingId,
      userId: Number(userId),
      lineItems,
    });

    if (!result.success) {
      return json({ success: false, error: result.error ?? "Invoice generation failed" }, { status: 500 });
    }

    return json({ success: true, invoiceId: result.invoiceId });
  }

  if (intent === "set_pay_on_departure") {
    // Validate that the payment method exists in the database
    const { paymentMethodRepository } = await import("../utils/repositories/payment-method");
    const method = await paymentMethodRepository.findByCode(PaymentMethod.PAY_ON_DEPARTURE);
    if (!method) {
      return json({ success: false, error: "Pay on departure is not available as a payment method" }, { status: 400 });
    }

    await bookingRepository.updatePayment(bookingId, {
      payment_method: PaymentMethod.PAY_ON_DEPARTURE,
      payment_status: "pending",
    });

    return json({ success: true });
  }

  if (intent === "post_booking_change") {
    const action = formData.get("change_action") as string;

    // Recalculate the current fare
    const legs = await bookingLegRepository.findByBookingId(bookingId).catch((err) => {
      console.error("Failed to load legs for post-booking change:", err);
      return [] as BookingLegRow[];
    });
    const passengers = await bookingPassengerRepository.findByBookingId(bookingId).catch((err) => {
      console.error("Failed to load passengers for post-booking change:", err);
      return [] as BookingPassengerRow[];
    });
    const legPassengers = await bookingLegPassengerRepository.findByBookingId(bookingId).catch((err) => {
      console.error("Failed to load leg passengers for post-booking change:", err);
      return [] as BookingLegPassengerWithDetails[];
    });
    const newFareBreakdown = await calculateFareBreakdown(legs, passengers, legPassengers).catch((err) => {
      console.error("Failed to recalculate fare:", err);
      return null;
    });

    if (!newFareBreakdown) {
      return json({ success: false, error: "Failed to recalculate fare" }, { status: 500 });
    }

    const storedTotal = Number(formData.get("stored_total") ?? 0);
    const difference = newFareBreakdown.total - storedTotal;

    if (action === "refund" && difference < 0) {
      const refundAmount = Math.abs(difference);

      // If the booking was paid via Stripe, process a Stripe refund
      const booking = await bookingRepository.findById(bookingId);
      if (booking?.payment_method === PaymentMethod.STRIPE) {
        try {
          const stripePayment = await stripePaymentRepository.findByBookingId(bookingId);
          if (stripePayment?.stripe_payment_intent_id) {
            const { getStripe } = await import("../utils/stripe.server");
            await getStripe().refunds.create({
              payment_intent: stripePayment.stripe_payment_intent_id,
              amount: Math.round(refundAmount * 100), // Convert to pence
            });
            await stripePaymentRepository.updateRefund(stripePayment.id, refundAmount);
          }
        } catch (stripeError) {
          console.error("Stripe refund failed:", stripeError);
          // Continue with booking update even if Stripe refund fails
        }
      }

      // Update booking total and status
      await bookingRepository.updatePayment(bookingId, {
        total_amount_gbp: newFareBreakdown.total,
        payment_status: "partially_refunded",
      });
      return json({ success: true, refundAmount, newTotal: newFareBreakdown.total });
    }

    if (action === "top_up" && difference > 0) {
      // Top-up required
      await bookingRepository.updatePayment(bookingId, {
        total_amount_gbp: newFareBreakdown.total,
        payment_status: "partially_paid",
      });
      return json({ success: true, topUpAmount: difference, newTotal: newFareBreakdown.total });
    }

    // No adjustment needed — just update the stored total
    await bookingRepository.updatePayment(bookingId, {
      total_amount_gbp: newFareBreakdown.total,
    });
    return json({ success: true, newTotal: newFareBreakdown.total });
  }

  return json({ error: "Unknown action" }, { status: 400 });
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
  } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const statusFetcher = useFetcher<{ success?: boolean; newStatus?: string; error?: string }>();
  const cancelFetcher = useFetcher<{ success?: boolean; newStatus?: string; error?: string }>();

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

  // Don't show payment options if payment is already processing or invoiced
  const isPaymentLocked =
    booking.payment_status === PaymentStatus.PROCESSING ||
    booking.payment_status === PaymentStatus.INVOICED;

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
              </div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
                Created {new Date(booking.created_at).toLocaleDateString()} &middot;{" "}
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
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  <span>Total baggage</span>
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {legPassengers.reduce((sum, lp) => sum + (lp.baggage_weight_kg || 0), 0)} kg
                    {legPassengers.some(lp => (lp.freight_weight_kg ?? 0) > 0) && (
                      <span className="ml-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">
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
                  Manage Passengers &rarr;
                </Link>
              )}
            </div>

            {/* Column 2: Cost Summary */}
            <BookingCostSummary
              legs={legs}
              passengers={passengers}
              legPassengers={legPassengers}
              totalAmountGbp={totalCost}
              fareBreakdown={fareBreakdown ?? null}
            />
            <div className="flex flex-wrap items-center gap-1.5 text-sm mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              {booking.payment_method && (
                <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">{booking.payment_method}</span>
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
              <div className="mb-4 rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 p-4">
                <PaymentMethodSelector
                  bookingId={bookingId}
                  totalAmount={totalCost}
                  availableMethods={availablePaymentMethods}
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
                {new Date(booking.updated_at).toLocaleDateString(undefined, {
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
                  <button
                    onClick={() => setShowPaymentPanel((prev) => !prev)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors text-sm"
                  >
                    Payment Options
                  </button>
                )}
                {cancelFetcher.state === "submitting" ? (
                  <button
                    disabled
                    className="bg-red-50 dark:bg-red-900/30 text-red-300 dark:text-red-500 font-medium py-2 px-6 rounded-lg text-sm cursor-not-allowed"
                  >
                    Cancelling...
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (window.confirm("Are you sure you want to cancel this booking? This action cannot be undone.")) {
                        const formData = new FormData();
                        formData.append("intent", "cancel");
                        formData.append("cancellation_reason", "Cancelled by operations");
                        cancelFetcher.submit(formData, { method: "post" });
                      }
                    }}
                    className="bg-red-50 dark:bg-red-900/30 text-red-600 hover:bg-red-100 font-medium py-2 px-6 rounded-lg text-sm transition-colors"
                  >
                    Cancel Booking
                  </button>
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
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors disabled:opacity-50"
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
    </PageLayout>
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