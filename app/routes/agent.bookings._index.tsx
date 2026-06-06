import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData, useNavigation, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { bookingRepository } from "../utils/repositories/booking";
import type { ClientGroup, ActivityItem, BookingRow } from "../utils/repositories/booking";
import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { getSession } from "../session.server";
import PageLayout from "../components/PageLayout";
import StatCard from "../components/StatCard";
import ClientGroupComponent from "../components/ClientGroup";
import type { BookingWithMeta } from "../components/ClientGroup";
import BookingCard from "../components/BookingCard";
import Skeleton from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import AlertBanner from "../components/AlertBanner";
import Badge from "../components/Badge";

// ── Types ──────────────────────────────────────────────────────────────────────

interface LoaderData {
  portfolio: ClientGroup[];
  recentActivity: ActivityItem[];
  pipelineCounts: Record<string, number>;
  daysUntilDeparture: Record<number, number | null>;
  warnings: string[];
  canCreate: boolean;
  userIdentity: { name: string; email: string } | null;
}

// ── SVG Icons (inline) ─────────────────────────────────────────────────────────

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M7 8a3 3 0 100-6 3 3 0 000 6zM14.5 9a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM1.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 017 18a9.953 9.953 0 01-5.385-1.572zM14.5 16h-.106c.07-.393.088-.794.048-1.196a7.502 7.502 0 00-1.7-3.694 4.502 4.502 0 005.528 0 7.502 7.502 0 00-1.7 3.694c-.04.402-.022.803.048 1.196H14.5z" clipRule="evenodd" />
    </svg>
  );
}

function PendingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
    </svg>
  );
}

function AirplaneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M3.75 3a.75.75 0 00-.75.75v.5c0 .414.336.75.75.75H4c6.28 0 11.584-1.33 14.416-3.828a.75.75 0 00.012-1.05A.75.75 0 0017.25.25H3.75zM2.25 7.5a.75.75 0 00-.75.75v.5c0 .414.336.75.75.75H4c3.751 0 7.082-.48 10.042-1.353a.75.75 0 00-.084-1.488A28.557 28.557 0 004 7.5H2.25zM2.25 12a.75.75 0 00-.75.75v.5c0 .414.336.75.75.75H4c2.214 0 4.363-.186 6.375-.524a.75.75 0 00-.124-1.488A27.903 27.903 0 004 12H2.25z" />
    </svg>
  );
}

// ── Loader ─────────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requirePermission(request, Permission.BOOKING_VIEW);

  const session = await getSession(request.headers.get("Cookie"));
  const currentUserId = session.get("userId");
  const userIdNum = Number(currentUserId);

  const warnings: string[] = [];
  let portfolio: ClientGroup[] = [];
  let recentActivity: ActivityItem[] = [];
  let pipelineCounts: Record<string, number> = {};

  // Check create permission
  const canCreate = user.permissions.includes(Permission.BOOKING_CREATE);

  // Fetch portfolio
  try {
    portfolio = await bookingRepository.findAgentPortfolio(userIdNum);
  } catch {
    warnings.push("Could not load portfolio data. Some information may be unavailable.");
    portfolio = [];
  }

  // Fetch recent activity
  try {
    recentActivity = await bookingRepository.findRecentActivity(userIdNum, 20);
  } catch {
    warnings.push("Could not load recent activity.");
    recentActivity = [];
  }

  // Fetch pipeline counts
  try {
    pipelineCounts = await bookingRepository.getPipelineCounts();
  } catch {
    warnings.push("Could not load pipeline statistics.");
    pipelineCounts = {};
  }

  // Compute daysUntilDeparture for each booking in portfolio
  const daysUntilDeparture: Record<number, number | null> = {};
  for (const group of portfolio) {
    for (const item of group.bookings) {
      try {
        daysUntilDeparture[item.booking.id] = await bookingRepository.getDaysUntilDeparture(item.booking.id);
      } catch {
        daysUntilDeparture[item.booking.id] = null;
      }
    }
  }

  const userIdentity = { name: user.name, email: user.email };

  return json<LoaderData>({
    portfolio,
    recentActivity,
    pipelineCounts,
    daysUntilDeparture,
    warnings,
    canCreate,
    userIdentity,
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function computeActiveClients(portfolio: ClientGroup[]): number {
  // A client is active if they have any booking that is not completed or cancelled
  return portfolio.filter((group) =>
    group.bookings.some((item) => item.booking.status !== "completed" && item.booking.status !== "cancelled")
  ).length;
}

function computeUpcomingDepartures(
  portfolio: ClientGroup[],
  daysUntilDeparture: Record<number, number | null>
): number {
  let count = 0;
  for (const group of portfolio) {
    for (const item of group.bookings) {
      const d = daysUntilDeparture[item.booking.id];
      if (d !== null && d > 0 && d <= 30) count++;
    }
  }
  return count;
}

interface DepartingSoonItem {
  clientName: string;
  bookingId: number;
  bookingRef: string;
  route: string;
  date: string;
  daysUntil: number;
}

function getDepartingSoon(
  portfolio: ClientGroup[],
  daysUntilDeparture: Record<number, number | null>
): DepartingSoonItem[] {
  const results: DepartingSoonItem[] = [];
  for (const group of portfolio) {
    for (const item of group.bookings) {
      const d = daysUntilDeparture[item.booking.id];
      if (d !== null && d >= 0 && d <= 7) {
        results.push({
          clientName: group.clientName,
          bookingId: item.booking.id,
          bookingRef: item.booking.booking_reference,
          route: item.firstLeg
            ? `${item.firstLeg.origin_code} → ${item.firstLeg.destination_code}`
            : "Route TBC",
          date: item.firstLeg?.leg_date ?? "",
          daysUntil: d,
        });
      }
    }
  }
  // Sort by days until departure (ascending)
  results.sort((a, b) => a.daysUntil - b.daysUntil);
  return results;
}

// ── Skeleton Components ────────────────────────────────────────────────────────

function StatsRowSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-lg bg-white dark:bg-slate-800 p-6 shadow-sm dark:shadow-slate-900/20 ring-1 ring-slate-200 dark:ring-slate-700">
          <Skeleton variant="text" width="60%" height={16} />
          <Skeleton variant="text" width="40%" height={36} className="mt-2" />
        </div>
      ))}
    </div>
  );
}

function ClientGroupSkeleton() {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
      <div className="flex items-center gap-3">
        <Skeleton variant="circular" width={32} height={32} />
        <div className="flex-1">
          <Skeleton variant="text" width="50%" height={16} />
          <Skeleton variant="text" width="30%" height={12} className="mt-1" />
        </div>
      </div>
      <div className="mt-3 space-y-2 pl-10">
        <Skeleton variant="rectangular" width="100%" height={48} />
        <Skeleton variant="rectangular" width="100%" height={48} />
      </div>
    </div>
  );
}

function ActivityFeedSkeleton() {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
      <Skeleton variant="text" width="30%" height={20} className="mb-4" />
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-start gap-3">
            <Skeleton variant="circular" width={12} height={12} className="mt-1" />
            <div className="flex-1">
              <Skeleton variant="text" width="70%" height={14} />
              <Skeleton variant="text" width="40%" height={12} className="mt-1" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function AgentBookingsIndex() {
  const data = useLoaderData<LoaderData>();
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";

  const { portfolio, recentActivity, pipelineCounts, daysUntilDeparture, warnings, canCreate, userIdentity } = data;

  const totalClients = portfolio.length;
  const totalBookings = portfolio.reduce((sum, g) => sum + g.bookings.length, 0);
  const activeClients = computeActiveClients(portfolio);
  const pendingBookings = pipelineCounts["upcoming"] ?? 0;
  const upcomingCount = computeUpcomingDepartures(portfolio, daysUntilDeparture);
  const departingSoon = getDepartingSoon(portfolio, daysUntilDeparture);

  // Helper to find a booking from portfolio by ID
  function findBookingInPortfolio(bookingId: number): { booking: BookingRow; firstLeg: { origin_code: string; destination_code: string; leg_date: string } | null } | undefined {
    for (const group of portfolio) {
      const found = group.bookings.find((b) => b.booking.id === bookingId);
      if (found) return found;
    }
    return undefined;
  }

  // ── Loading State ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <PageLayout title="Your Portfolio">
        <div className="space-y-6">
          <StatsRowSkeleton />
          {[1, 2, 3].map((i) => (
            <ClientGroupSkeleton key={i} />
          ))}
          <ActivityFeedSkeleton />
        </div>
      </PageLayout>
    );
  }

  // ── Error / Warning Banners ────────────────────────────────────────────────

  const errorAlerts = warnings.map((msg) => ({
    severity: "warning" as const,
    message: msg,
  }));

  // ── Empty State ────────────────────────────────────────────────────────────

  if (portfolio.length === 0 && !isLoading) {
    return (
      <PageLayout title="Your Portfolio">
        {errorAlerts.length > 0 && (
          <div className="mb-6">
            <AlertBanner alerts={errorAlerts} />
          </div>
        )}
        <EmptyState
          title="No clients or bookings yet"
          description="Your portfolio is empty. Start by creating a new booking for a client."
          icon={<UsersIcon className="h-12 w-12" />}
          action={canCreate ? { label: "New Booking", to: "/bookings/new" } : undefined}
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Your Portfolio" userIdentity={userIdentity}>
      {/* Warning Banners */}
      {errorAlerts.length > 0 && (
        <div className="mb-6">
          <AlertBanner alerts={errorAlerts} />
        </div>
      )}

      {/* ── A. Welcome Header ──────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
            Managing <span className="font-semibold text-slate-700 dark:text-slate-200">{totalClients}</span> client{totalClients !== 1 ? "s" : ""} across{" "}
            <span className="font-semibold text-slate-700 dark:text-slate-200">{totalBookings}</span> booking{totalBookings !== 1 ? "s" : ""}
          </p>
        </div>
        {canCreate && (
          <Link
            to="/bookings/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm dark:shadow-slate-900/20 hover:bg-blue-700 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            New Booking
          </Link>
        )}
      </div>

      {/* ── B. Period Stats Row ────────────────────────────────────────────── */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Active Clients"
          value={activeClients}
          icon={<UsersIcon className="h-6 w-6" />}
        />
        <StatCard
          label="Pending Bookings"
          value={pendingBookings}
          icon={<PendingIcon className="h-6 w-6" />}
        />
        <StatCard
          label="Upcoming Departures"
          value={upcomingCount}
          icon={<AirplaneIcon className="h-6 w-6" />}
        />
      </div>

      {/* ── C. Upcoming Departures Strip ───────────────────────────────────── */}
      {departingSoon.length > 0 && (
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <ClockIcon className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Departing Soon</h2>
            <Badge variant="warning">{departingSoon.length}</Badge>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {departingSoon.map((item) => {
              const found = findBookingInPortfolio(item.bookingId);
              return (
                <div key={item.bookingId} className="min-w-[260px] flex-shrink-0">
                  <BookingCard
                    booking={found?.booking as BookingRow}
                    firstLeg={found?.firstLeg ?? null}
                    passenger={null}
                    linkTo={`/agent/bookings/${item.bookingId}`}
                    daysUntilDeparture={item.daysUntil}
                    variant="compact"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── D. Client Groups (Portfolio) ───────────────────────────────────── */}
      {portfolio.length > 0 && (
        <div className="mb-8 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Clients & Bookings</h2>
          {portfolio.map((group, index) => {
            const bookingsWithMeta: BookingWithMeta[] = group.bookings.map((item) => ({
              booking: {
                id: item.booking.id,
                booking_reference: item.booking.booking_reference,
                status: item.booking.status,
                total_amount_gbp: Number(item.booking.total_amount_gbp ?? 0),
                payment_status: item.booking.payment_status,
              },
              firstLeg: item.firstLeg,
              paymentStatus: item.paymentStatus,
            }));

            return (
              <ClientGroupComponent
                key={`${group.clientName}-${group.clientEmail}`}
                clientName={group.clientName}
                clientEmail={group.clientEmail}
                bookings={bookingsWithMeta}
                defaultExpanded={index === 0}
              />
            );
          })}
        </div>
      )}

      {/* ── E. Recent Activity Feed ────────────────────────────────────────── */}
      <div className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-slate-100">Recent Activity</h2>
        {recentActivity.length > 0 ? (
          <ActivityFeedSkeleton />
        ) : (
          <EmptyState
            title="No recent activity"
            description="Activity from your clients' bookings will appear here."
          />
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