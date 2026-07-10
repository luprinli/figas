import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData, useNavigation, useFetcher, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { bookingRepository } from "../utils/repositories/booking";
import { bookingLegRepository } from "../utils/repositories/booking-leg";
import { bookingPassengerRepository } from "../utils/repositories/booking-passenger";
import type { BookingLegRow } from "../utils/repositories/booking-leg";
import type { BookingPassengerRow } from "../utils/repositories/booking-passenger";
import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { getSession } from "../session.server";
import { ArrowLeft, ArrowRight, CreditCard, Pencil, Plane, Send, XCircle } from "lucide-react";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import PageLayout from "../components/PageLayout";
import StatusBadge from "../components/StatusBadge";
import PaymentStatusBadge from "../components/PaymentStatusBadge";
import Skeleton from "../components/Skeleton";
import AlertBanner from "../components/AlertBanner";
import ExpandableSection from "../components/ui/ExpandableSection";
import DataTable from "../components/DataTable";
import type { Column } from "../components/DataTable";
import Card from "../components/Card";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ClientInfo {
  name: string;
  email: string;
}

interface LoaderData {
  booking: NonNullable<Awaited<ReturnType<typeof bookingRepository.findById>>>;
  passengers: BookingPassengerRow[];
  legs: BookingLegRow[];
  daysUntilDeparture: number | null;
  isPastBooking: boolean;
  canEdit: boolean;
  canCancel: boolean;
  canManagePayment: boolean;
  canManagePassengers: boolean;
  clientInfo: ClientInfo | null;
  warnings: string[];
}

// ── Source Labels ───────────────────────────────────────────────────────────────

const sourceLabels: Record<string, string> = {
  customer_direct: "Customer Direct",
  booking_agent: "Booking Agent",
  operations_staff: "Operations Staff",
};

// ── Loader ──────────────────────────────────────────────────────────────────────

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await requirePermission(request, Permission.BOOKING_VIEW);

  const bookingId = Number(params.bookingId);
  if (isNaN(bookingId)) {
    throw json({ error: "Invalid booking ID" }, { status: 400 });
  }

  const warnings: string[] = [];

  // Fetch booking
  const booking = await bookingRepository.findById(bookingId);
  if (!booking) {
    throw json({ error: "Booking not found" }, { status: 404 });
  }

  // Fetch legs
  const legs = await bookingLegRepository.findByBookingId(bookingId);

  // Determine if this is a past booking (all legs have dates in the past)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isPastBooking = legs.length > 0 && legs.every((leg) => {
    const legDate = new Date(leg.leg_date + "T00:00:00");
    return !isNaN(legDate.getTime()) && legDate < today;
  });

  // Fetch passengers (with graceful fallback)
  let passengers: BookingPassengerRow[] = [];
  try {
    passengers = await bookingPassengerRepository.findByBookingId(bookingId);
  } catch {
    warnings.push("Could not load passenger data.");
  }

  // Days until departure
  let daysUntilDeparture: number | null = null;
  try {
    daysUntilDeparture = await bookingRepository.getDaysUntilDeparture(bookingId);
  } catch {
    // Non-critical, leave as null
  }

  // Fetch client info from the users table
  let clientInfo: ClientInfo | null = null;
  try {
    const userResult = await sql<{ name: string; email: string }>`
      SELECT name, email FROM users WHERE id = ${booking.user_id}
    `.execute(kdb);
    if (userResult.rows[0]) {
      clientInfo = {
        name: userResult.rows[0].name,
        email: userResult.rows[0].email,
      };
    }
  } catch {
    // Non-critical
  }

  // Permission flags
  const canEdit = user.permissions.includes(Permission.BOOKING_EDIT);
  const canCancel = user.permissions.includes(Permission.BOOKING_CANCEL);
  const canManagePayment = user.permissions.includes(Permission.BOOKING_MANAGE_PAYMENT);
  const canManagePassengers = user.permissions.includes(Permission.BOOKING_MANAGE_PASSENGERS);

  return json<LoaderData>({
    booking,
    passengers,
    legs,
    daysUntilDeparture,
    isPastBooking,
    canEdit,
    canCancel,
    canManagePayment,
    canManagePassengers,
    clientInfo,
    warnings,
  });
}

// ── Action Handler ──────────────────────────────────────────────────────────────

export async function action({ request, params }: ActionFunctionArgs) {
  const bookingId = Number(params.bookingId);
  if (isNaN(bookingId)) {
    return json({ error: "Invalid booking ID" }, { status: 400 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "notify_client") {
    const subject = formData.get("subject") as string;
    const message = formData.get("message") as string;

    if (!subject || !message) {
      return json({ error: "Subject and message are required." }, { status: 400 });
    }

    // For now, log the notification. In production this would insert into a
    // notifications table or trigger an email dispatch.
    console.log(
      `[NOTIFY CLIENT] Booking #${bookingId} — Subject: "${subject}" — Message: "${message}"`
    );

    // Optionally record in audit_log
    try {
      const session = await getSession(request.headers.get("Cookie"));
      const userId = session.get("userId");
      await sql`
        INSERT INTO audit_log (actor_id, action, entity_type, entity_id, new_values)
        VALUES (${Number(userId)}, ${"booking.notify_client"}, ${"booking"}, ${bookingId}, ${JSON.stringify({ subject, message })})
      `.execute(kdb);
    } catch {
      // Non-critical — notification was still logged
    }

    return json({ success: true, message: "Notification sent successfully." });
  }

  return json({ error: "Unknown action" }, { status: 400 });
}

// ── Skeleton Components ─────────────────────────────────────────────────────────

function HeaderSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton variant="text" width={160} height={16} />
      <div className="flex items-center gap-3">
        <Skeleton variant="text" width={240} height={32} />
        <Skeleton variant="rectangular" width={80} height={24} />
        <Skeleton variant="rectangular" width={100} height={24} />
      </div>
      <Skeleton variant="text" width={200} height={14} />
    </div>
  );
}

function ClientCardSkeleton() {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/20">
      <Skeleton variant="text" width="40%" height={18} className="mb-3" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Skeleton variant="text" width="30%" height={12} />
          <Skeleton variant="text" width="60%" height={16} className="mt-1" />
        </div>
        <div>
          <Skeleton variant="text" width="30%" height={12} />
          <Skeleton variant="text" width="60%" height={16} className="mt-1" />
        </div>
        <div>
          <Skeleton variant="text" width="30%" height={12} />
          <Skeleton variant="text" width="40%" height={16} className="mt-1" />
        </div>
        <div>
          <Skeleton variant="text" width="30%" height={12} />
          <Skeleton variant="text" width="50%" height={16} className="mt-1" />
        </div>
      </div>
    </div>
  );
}

function ExpandableSectionSkeleton() {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between bg-gray-50 px-4 py-3">
        <Skeleton variant="text" width="40%" height={16} />
        <Skeleton variant="circular" width={16} height={16} />
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────────

export default function AgentBookingDetail() {
  const data = useLoaderData<LoaderData>();
  const navigation = useNavigation();
  const notifyFetcher = useFetcher<{ success?: boolean; error?: string; message?: string }>();

  const isLoading = navigation.state === "loading" && !navigation.formData;
  const isNotifySubmitting = notifyFetcher.state === "submitting";

  const { booking, passengers, legs, daysUntilDeparture, isPastBooking, canEdit, canCancel, canManagePayment, clientInfo, warnings } = data;

  // ── Loading State ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <PageLayout title="Booking Details">
        <div className="space-y-6" aria-live="polite" aria-busy="true">
          <HeaderSkeleton />
          <ClientCardSkeleton />
          <ExpandableSectionSkeleton />
          <ExpandableSectionSkeleton />
          <ExpandableSectionSkeleton />
        </div>
      </PageLayout>
    );
  }

  // ── Error / Warning Banners ────────────────────────────────────────────────

  const errorAlerts: Array<{ severity: "warning" | "error" | "info"; message: string }> = warnings.map((msg) => ({
    severity: "warning" as const,
    message: msg,
  }));

  // Add past booking info banner
  if (isPastBooking) {
    errorAlerts.push({
      severity: "info" as const,
      message: "This booking has past departure dates and cannot be amended.",
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return "\u2014";
    // Handle HH:mm or HH:mm:ss formats
    const parts = timeStr.split(":");
    if (parts.length >= 2) {
      return `${parts[0]}:${parts[1]}`;
    }
    return timeStr;
  };

  const totalWeight = passengers.reduce(
    (sum, p) => sum + (p.clothed_weight_kg ?? 0),
    0
  );

  const isPaid =
    booking.payment_status === "paid" || booking.payment_status === "partially_paid";
  const canShowPaymentButton = canManagePayment && booking.payment_status !== "paid" && !isPastBooking;
  const canShowCancelButton =
    canCancel &&
    booking.status !== "cancelled" &&
    booking.status !== "completed" &&
    !isPastBooking;
  const canShowEditButton = canEdit && !isPastBooking;

  return (
    <PageLayout title={`Booking ${booking.booking_reference}`}>
      <div className="space-y-6">
        {/* Warning Banners */}
        {errorAlerts.length > 0 && (
          <div role="status" aria-live="polite" aria-atomic="true">
            <AlertBanner alerts={errorAlerts} />
          </div>
        )}

        {/* Notify Client Success Feedback */}
        {notifyFetcher.data?.success && (
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 p-4 text-sm text-emerald-700" role="status" aria-live="polite">
            {notifyFetcher.data.message}
          </div>
        )}
        {notifyFetcher.data?.error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 p-4 text-sm text-red-700" role="alert">
            {notifyFetcher.data.error}
          </div>
        )}

        {/* ── A. Back Link & Header ─────────────────────────────────────────── */}
        <div>
          <Link
            to="/agent/bookings"
            className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 transition-colors"
          >
            <ArrowLeft size={16} />
            Back to My Portfolio
          </Link>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {booking.booking_reference}
            </h1>
            <StatusBadge status={booking.status} />
            <PaymentStatusBadge status={booking.payment_status} />
          </div>

          {clientInfo && (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
              {clientInfo.name} &middot; {clientInfo.email}
            </p>
          )}
        </div>

        {/* ── B. Client Info Card ───────────────────────────────────────────── */}
        <Card title="Client Information">
          <dl className="flex flex-col sm:grid sm:grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">Client Name</dt>
              <dd className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {clientInfo?.name ?? "\u2014"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">Email</dt>
              <dd className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {clientInfo?.email ?? "\u2014"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">Booking Source</dt>
              <dd className="text-sm">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    booking.booking_source === "customer_direct"
                      ? "bg-sky-50 text-sky-700"
                      : booking.booking_source === "booking_agent"
                        ? "bg-purple-50 text-purple-700"
                        : "bg-amber-50 dark:bg-amber-900/30 text-amber-700"
                  }`}
                >
                  {sourceLabels[booking.booking_source] ?? booking.booking_source}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">Created</dt>
              <dd className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {formatDate(booking.created_at)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">Total Amount</dt>
              <dd className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {booking.total_amount_gbp != null
                  ? `\u00A3${Number(booking.total_amount_gbp).toFixed(2)}`
                  : "Not set"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">Days Until Departure</dt>
              <dd className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {daysUntilDeparture !== null
                  ? daysUntilDeparture >= 0
                    ? `${daysUntilDeparture} day${daysUntilDeparture !== 1 ? "s" : ""}`
                    : "Departed"
                  : "\u2014"}
              </dd>
            </div>
          </dl>
        </Card>

        {/* ── C. Itinerary Strip ────────────────────────────────────────────── */}
        {legs.length > 0 && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/20">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Itinerary</h3>
            <div className="flex items-start gap-2 overflow-x-auto pb-2">
              {legs.map((leg, index) => (
                <div key={leg.id} className="flex items-start gap-2 min-w-0 shrink-0">
                  {/* Leg card */}
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 px-3 py-2 min-w-[180px]">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      <span>{leg.origin_code}</span>
                      <Plane size={16} className="text-slate-500 dark:text-slate-400" />
                      <span>{leg.destination_code}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                      {formatDate(leg.leg_date)}
                      {leg.preferred_time && (
                        <span className="ml-1">&middot; {formatTime(leg.preferred_time)}</span>
                      )}
                    </div>
                    {leg.flight_id && (
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                        Flight #{leg.flight_id}
                      </div>
                    )}
                  </div>

                  {/* Connector arrow between legs */}
                  {index < legs.length - 1 && (
                    <div className="flex items-center pt-4">
                      <ArrowRight size={20} className="text-slate-300 dark:text-slate-500" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── D. Expandable Sections ────────────────────────────────────────── */}

        {/* D1. Passengers */}
        <ExpandableSection title="Passengers" defaultExpanded badge={passengers.length > 0 ? passengers.length : undefined}>
          {passengers.length > 0 ? (
            <>
              <DataTable
                columns={([
                  { key: "name", header: "Name", sortable: true, render: (p: Record<string, unknown>) => (
                    <span className="font-medium text-slate-900 dark:text-slate-100">{p.first_name as string} {p.last_name as string}</span>
                  )},
                  { key: "weight", header: "Weight (kg)", sortable: true, render: (p: Record<string, unknown>) => (
                    <span className="text-slate-600 dark:text-slate-300 tabular-nums">{String(p.clothed_weight_kg ?? "\u2014")}</span>
                  )},
                  { key: "baggage", header: "Baggage (kg)", render: () => (
                    <span className="text-slate-600 dark:text-slate-300">{"\u2014"}</span>
                  )},
                  { key: "requirements", header: "Special Requirements", render: (p: Record<string, unknown>) => (
                    <span className="text-slate-600 dark:text-slate-300">{String(p.special_requirements ?? "\u2014")}</span>
                  )},
                ] as Column<Record<string, unknown>>[])}
                data={passengers as unknown as Record<string, unknown>[]}
                keyExtractor={(p) => (p as unknown as Record<string, unknown>).id as number}
                sortable
              />
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Total weight: {totalWeight} kg
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">No passengers added yet.</p>
          )}
        </ExpandableSection>

        {/* D2. Payment & Commission */}
        <ExpandableSection title="Payment & Commission">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">Payment Method</dt>
              <dd className="text-sm font-medium text-slate-900 dark:text-slate-100 capitalize">
                {booking.payment_method
                  ? booking.payment_method.replace(/_/g, " ")
                  : "\u2014"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">Payment Status</dt>
              <dd className="text-sm">
                <PaymentStatusBadge status={booking.payment_status} />
              </dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">Total Amount</dt>
              <dd className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {booking.total_amount_gbp != null
                  ? `\u00A3${Number(booking.total_amount_gbp).toFixed(2)}`
                  : "Not set"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">Status</dt>
              <dd className="text-sm">
                {isPaid ? (
                  <span className="text-green-600 font-medium">Paid</span>
                ) : (
                  <span className="text-amber-600 font-medium">
                    {booking.payment_status === "overdue"
                      ? "Overdue"
                      : "Outstanding"}
                  </span>
                )}
              </dd>
            </div>
          </dl>

          {/* Commission info placeholder */}
          {booking.booking_source === "booking_agent" && (
            <div className="mt-4 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-200 p-3">
              <p className="text-xs text-blue-700">
                <strong>Agent Booking:</strong> Commission details will be displayed here once configured.
              </p>
            </div>
          )}
        </ExpandableSection>

        {/* D3. Itinerary Details */}
        <ExpandableSection title="Itinerary Details">
          {legs.length > 0 ? (
            <DataTable
              columns={([
                { key: "leg", header: "Leg", sortable: true, render: (l: Record<string, unknown>) => (
                  <span className="text-slate-600 dark:text-slate-300 tabular-nums">{l.leg_sequence as number}</span>
                )},
                { key: "route", header: "Route", sortable: true, render: (l: Record<string, unknown>) => (
                  <span className="font-medium text-slate-900 dark:text-slate-100">{l.origin_code as string} &rarr; {l.destination_code as string}</span>
                )},
                { key: "date", header: "Date", sortable: true, render: (l: Record<string, unknown>) => (
                  <span className="text-slate-600 dark:text-slate-300">{formatDate(l.leg_date as string)}</span>
                )},
                { key: "time", header: "Time", sortable: true, render: (l: Record<string, unknown>) => (
                  <span className="text-slate-600 dark:text-slate-300">{formatTime(l.preferred_time as string)}</span>
                )},
                { key: "flight", header: "Flight", render: (l: Record<string, unknown>) => (
                  <span className="text-slate-600 dark:text-slate-300">{l.flight_id ? `#${l.flight_id}` : "Not assigned"}</span>
                )},
                { key: "status", header: "Status", sortable: true, render: (l: Record<string, unknown>) => (
                  <span className="capitalize text-slate-600 dark:text-slate-300">{l.status as string}</span>
                )},
              ] as Column<Record<string, unknown>>[])}
              data={legs as unknown as Record<string, unknown>[]}
              keyExtractor={(l) => (l as unknown as Record<string, unknown>).id as number}
              sortable
            />
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">No itinerary details available.</p>
          )}
        </ExpandableSection>

        {/* ── E. Notify Client Section ──────────────────────────────────────── */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/20">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Notify Client</h3>
          <notifyFetcher.Form method="post" className="space-y-3">
            <input type="hidden" name="intent" value="notify_client" />
            <div>
              <label htmlFor="subject" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                Subject
              </label>
              <input
                id="subject"
                name="subject"
                type="text"
                required
                disabled={isNotifySubmitting}
                className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
                placeholder="e.g. Booking confirmation update"
                aria-describedby="subject_help"
              />
              <p id="subject_help" className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                A short title for the notification.
              </p>
            </div>
            <div>
              <label htmlFor="message" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                Message
              </label>
              <textarea
                id="message"
                name="message"
                rows={3}
                required
                disabled={isNotifySubmitting}
                className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
                placeholder="Enter your message to the client..."
                aria-describedby="message_help"
              />
              <p id="message_help" className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                The message content that will be sent to the client.
              </p>
            </div>
            <button
              type="submit"
              disabled={isNotifySubmitting}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm dark:shadow-slate-900/20 hover:bg-sky-700 transition-colors disabled:opacity-50"
            >
              {isNotifySubmitting ? (
                <>
                  <Skeleton className="inline-block h-3 w-3 rounded-full" />
                  Sending...
                </>
              ) : (
                <>
                  <Send size={16} />
                  Send Notification
                </>
              )}
            </button>
          </notifyFetcher.Form>
        </div>

        {/* ── F. Quick Actions ──────────────────────────────────────────────── */}
        {(canShowPaymentButton || canShowCancelButton || canShowEditButton) && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/20">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Quick Actions</h3>
            <div className="flex flex-col sm:flex-row flex-wrap gap-3">
              {canShowPaymentButton && (
                <Link
                  to={`/bookings/${booking.id}/payment`}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm dark:shadow-slate-900/20 hover:bg-emerald-700 transition-colors"
                >
                  <CreditCard size={16} />
                  Make Payment
                </Link>
              )}
              {canShowCancelButton && (
                <button
                  type="button"
                  onClick={() => {
                    const msg = isPaid
                      ? `This booking has been paid (£${Number(booking.total_amount_gbp ?? 0).toFixed(2)}). Cancelling will require a refund. Continue?`
                      : "Are you sure you want to cancel this booking?";
                    if (window.confirm(msg)) {
                      window.location.href = `/bookings/${booking.id}?action=cancel`;
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm dark:shadow-slate-900/20 hover:bg-red-700 transition-colors"
                >
                  <XCircle size={16} />
                  Cancel Booking
                </button>
              )}
              {canShowEditButton && (
                <Link
                  to={`/bookings/${booking.id}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm dark:shadow-slate-900/20 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <Pencil size={16} />
                  Edit Booking
                </Link>
              )}
            </div>
          </div>
        )}
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
