import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData, useNavigation, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { bookingRepository } from "../utils/repositories/booking";
import { requireUser } from "../utils/layout.server";
import { getUserPermissions } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import PageLayout from "../components/PageLayout";
import BookingCard from "../components/BookingCard";
import CountdownBar from "../components/CountdownBar";
import ExpandableSection from "../components/ui/ExpandableSection";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import StatusBadge from "../components/StatusBadge";

export const meta: MetaFunction = () => [{ title: "My Bookings - FIGAS" }];

/**
 * Calculates days until a given date string (date-only comparison).
 */
function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  const targetDateOnly = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = targetDateOnly.getTime() - nowDateOnly.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Determines if check-in is available based on booking status.
 * Check-in is available when status >= flight_assigned and before completed.
 */
function isCheckinAvailable(status: string): boolean {
  const checkinableStatuses = [
    "flight_assigned",
    "pilot_review",
    "approved",
    "checkin_open",
    "checked_in",
    "boarding",
  ];
  return checkinableStatuses.includes(status);
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { userId, userIdentity } = await requireUser(request);
  const numericUserId = Number(userId);

  // Fetch permissions for UI gating
  const userPermissions = await getUserPermissions(numericUserId);

  // Fetch upcoming bookings (existing method)
  const upcomingBookings = await bookingRepository.findUpcomingByUserId(numericUserId);

  // Fetch past bookings (completed or cancelled)
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const pastResult = await bookingRepository.findByUserIdAndDateRange(
    numericUserId,
    "1970-01-01",
    todayStr
  );

  // Filter past bookings: only completed/cancelled
  const pastBookings = pastResult.bookings.filter(({ booking }) => {
    return booking.status === "completed" || booking.status === "cancelled";
  });

  // Compute daysUntilDeparture for each upcoming booking
  const upcomingWithMeta = upcomingBookings.map(({ booking, firstLeg }) => {
    const daysUntilDeparture = firstLeg
      ? daysUntil(firstLeg.leg_date)
      : null;
    return { booking, firstLeg, daysUntilDeparture };
  });

  // Permission checks
  const canCreate = userPermissions.includes(Permission.BOOKING_CREATE);
  const canCancel = userPermissions.includes(Permission.BOOKING_CANCEL);
  const canCheckin = userPermissions.includes(Permission.BOOKING_CHECKIN);
  const canManagePayment = userPermissions.includes(Permission.BOOKING_MANAGE_PAYMENT);

  return json({
    upcomingBookings: upcomingWithMeta,
    pastBookings,
    userIdentity,
    permissions: { canCreate, canCancel, canCheckin, canManagePayment },
  });
}

/**
 * Skeleton loading state for the passenger dashboard.
 * Shows a large hero skeleton card + 3 smaller skeleton cards in a grid.
 */
function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-hidden="true">
      {/* Hero skeleton */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm dark:shadow-slate-900/20">
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton variant="text" width={160} height={24} />
              <Skeleton variant="text" width={120} height={16} />
            </div>
            <div className="flex gap-2">
              <Skeleton variant="rectangular" width={80} height={24} />
              <Skeleton variant="rectangular" width={80} height={24} />
            </div>
          </div>
          <Skeleton variant="text" width={240} height={16} />
          <Skeleton variant="rectangular" className="h-2 w-full" />
          <Skeleton variant="text" width={180} height={14} />
          <div className="flex gap-2 pt-2">
            <Skeleton variant="rectangular" width={100} height={36} />
            <Skeleton variant="rectangular" width={140} height={36} />
            <Skeleton variant="rectangular" width={80} height={36} />
          </div>
        </div>
      </div>

      {/* Grid skeletons */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/20">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <Skeleton variant="text" width={120} height={20} />
                <Skeleton variant="rectangular" width={70} height={22} />
              </div>
              <Skeleton variant="text" width={180} height={14} />
              <div className="flex items-center gap-2">
                <Skeleton variant="rectangular" width={60} height={18} />
                <Skeleton variant="text" width={60} height={14} />
                <Skeleton variant="text" width={80} height={14} className="ml-auto" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Builds quick-action buttons for a booking based on permissions and booking state.
 */
function buildActions(
  booking: { status: string; payment_status: string; id: number },
  permissions: { canCheckin: boolean; canManagePayment: boolean; canCancel: boolean }
): React.ReactNode[] | undefined {
  const actions: React.ReactNode[] = [];

  if (permissions.canCheckin && isCheckinAvailable(booking.status)) {
    actions.push(
      <Link
        key="checkin"
        to={`/checkin?booking=${booking.id}`}
        className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        Check In
      </Link>
    );
  }

  // View Boarding Pass (status >= approved)
  if (["approved", "checkin_open", "checked_in", "boarding", "departed", "completed"].includes(booking.status)) {
    actions.push(
      <Link
        key="boarding-pass"
        to={`/bookings/${booking.id}`}
        className="inline-flex items-center rounded-md border border-slate-300 dark:border-slate-600 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        Boarding Pass
      </Link>
    );
  }

  // Make Payment (if not paid)
  if (permissions.canManagePayment && booking.payment_status !== "paid") {
    actions.push(
      <Link
        key="payment"
        to={`/bookings/${booking.id}`}
        className="inline-flex items-center rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        Make Payment
      </Link>
    );
  }

  // Cancel (if not completed or cancelled)
  if (permissions.canCancel && !["completed", "cancelled"].includes(booking.status)) {
    actions.push(
      <Link
        key="cancel"
        to={`/bookings/${booking.id}`}
        className="inline-flex items-center rounded-md border border-red-300 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:bg-red-900/30 transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        Cancel
      </Link>
    );
  }

  return actions.length > 0 ? actions : undefined;
}

export default function BookingsLayout() {
  const {
    upcomingBookings,
    pastBookings,
    userIdentity,
    permissions,
  } = useLoaderData<typeof loader>();
  const navigation = useNavigation();

  const isLoading = navigation.state === "loading" && navigation.location.pathname === "/bookings";

  // -- Loading State ----------------------------------------------------------
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <PageLayout
        title="My Bookings"
        userIdentity={userIdentity}
        headerActions={
          permissions.canCreate ? (
            <Link
              to="/bookings/new"
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 transition-colors"
            >
              New Booking
            </Link>
          ) : undefined
        }
      >
        <DashboardSkeleton />
      </PageLayout>
      </div>
    );
  }

  const hasUpcoming = upcomingBookings.length > 0;
  const hasPast = pastBookings.length > 0;
  const hasAnyBookings = hasUpcoming || hasPast;

  // -- Empty State (no bookings at all) ---------------------------------------
  if (!hasAnyBookings) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <PageLayout
        title="My Bookings"
        userIdentity={userIdentity}
        headerActions={
          permissions.canCreate ? (
            <Link
              to="/bookings/new"
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 transition-colors"
            >
              New Booking
            </Link>
          ) : undefined
        }
      >
        <EmptyState
          title="No bookings yet"
          description="Ready to plan your next trip? Create your first booking to get started."
          action={permissions.canCreate ? { label: "Create your first booking", to: "/bookings/new" } : undefined}
        />
      </PageLayout>
      </div>
    );
  }

  // -- Populated State -------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
    <PageLayout
      title="My Bookings"
      userIdentity={userIdentity}
      headerActions={
        permissions.canCreate ? (
          <Link
            to="/bookings/new"
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 transition-colors"
          >
            New Booking
          </Link>
        ) : undefined
      }
    >
      {/* -- Hero Card (single upcoming booking) ------------------------------- */}
      {upcomingBookings.length === 1 && (
        <div className="mb-8">
          {(() => {
            const { booking, firstLeg, daysUntilDeparture } = upcomingBookings[0];
            const actions = buildActions(booking, permissions);
            return (
              <BookingCard
                booking={booking}
                firstLeg={firstLeg}
                passenger={null}
                linkTo={`/bookings/${booking.id}`}
                paymentStatus={booking.payment_status}
                daysUntilDeparture={daysUntilDeparture ?? undefined}
                actions={actions}
                variant="hero"
              />
            );
          })()}

          {/* Countdown bar below hero card */}
          {upcomingBookings[0].firstLeg && (
            <div className="mt-3">
              <CountdownBar
                departureDate={upcomingBookings[0].firstLeg!.leg_date}
                className="px-1"
              />
            </div>
          )}
        </div>
      )}

      {/* -- Card Grid (multiple upcoming bookings) ---------------------------- */}
      {upcomingBookings.length > 1 && (
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-slate-800 dark:text-slate-100">
            Upcoming Trips
            <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400 dark:text-slate-500">
              ({upcomingBookings.length})
            </span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingBookings.map(({ booking, firstLeg, daysUntilDeparture }) => {
              const actions = buildActions(booking, permissions);
              return (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  firstLeg={firstLeg}
                  passenger={null}
                  linkTo={`/bookings/${booking.id}`}
                  paymentStatus={booking.payment_status}
                  daysUntilDeparture={daysUntilDeparture ?? undefined}
                  actions={actions}
                  variant="default"
                />
              );
            })}
          </div>
        </div>
      )}

      {/* -- No upcoming, has past bookings ------------------------------------ */}
      {!hasUpcoming && hasPast && (
        <div className="mb-8">
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 p-6 text-center">
            <p className="text-base font-medium text-slate-700 dark:text-slate-200">No upcoming trips</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
              {permissions.canCreate
                ? "Ready to plan your next adventure?"
                : "Check back later for new trips."}
            </p>
            {permissions.canCreate && (
              <Link
                to="/bookings/new"
                className="mt-4 inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 transition-colors"
              >
                Book a new trip
              </Link>
            )}
          </div>
        </div>
      )}

      {/* -- Past Bookings (collapsible) --------------------------------------- */}
      {hasPast && (
        <ExpandableSection
          title="Past Bookings"
          badge={pastBookings.length}
          defaultExpanded={!hasUpcoming} // Auto-expand if no upcoming trips
        >
          <div className="divide-y divide-slate-100">
            {pastBookings.map(({ booking, firstLeg }) => (
              <Link
                key={booking.id}
                to={`/bookings/${booking.id}`}
                className="flex items-center justify-between py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors rounded px-2 -mx-2"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 shrink-0">
                    {booking.booking_reference}
                  </span>
                  {firstLeg && (
                    <span className="text-sm text-slate-600 dark:text-slate-300 truncate">
                      {firstLeg.origin_code} &rarr; {firstLeg.destination_code}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                    {firstLeg
                      ? new Date(firstLeg.leg_date).toLocaleDateString("en-GB")
                      : new Date(booking.created_at).toLocaleDateString("en-GB")}
                  </span>
                  <StatusBadge status={booking.status} />
                </div>
              </Link>
            ))}
          </div>
        </ExpandableSection>
      )}
    </PageLayout>
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