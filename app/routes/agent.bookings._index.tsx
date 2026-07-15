import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useNavigation, useRevalidator, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { bookingRepository } from "../utils/repositories/booking";
import { useRef } from "react";
import { useKeyboardShortcuts } from "../utils/use-keyboard-shortcuts";
import type { ClientGroup, ActivityItem, BookingRow } from "../utils/repositories/booking";
import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { getSession } from "../session.server";
import PageLayout from "../components/PageLayout";
import { Clock, Plane, Plus, Users } from "lucide-react";
import MetricCard from "../components/MetricCard";
import ClientGroupComponent from "../components/ClientGroup";
import type { BookingWithMeta } from "../components/ClientGroup";
import BookingCard from "../components/BookingCard";
import Skeleton from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import AlertBanner from "../components/AlertBanner";
import Badge from "../components/Badge";
import Button from "../components/Button";
import { TourTrigger } from "../components/TourTrigger";
import { agentDashboardTour } from "../utils/tour/definitions/agent-dashboard";

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

// ── Loader ─────────────────────────────────────────────────────────────────────

export const headers: HeadersFunction = () => ({
  "Cache-Control": "max-age=60, stale-while-revalidate=300",
});

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
  } catch (e) {
    console.error("Failed to load portfolio data:", e);
    warnings.push("Could not load portfolio data. Some information may be unavailable.");
    portfolio = [];
  }

  // Fetch recent activity
  try {
    recentActivity = await bookingRepository.findRecentActivity(userIdNum, 20);
  } catch (e) {
    console.error("Failed to load recent activity:", e);
    warnings.push("Could not load recent activity.");
    recentActivity = [];
  }

  // Fetch pipeline counts
  try {
    pipelineCounts = await bookingRepository.getPipelineCounts();
  } catch (e) {
    console.error("Failed to load pipeline statistics:", e);
    warnings.push("Could not load pipeline statistics.");
    pipelineCounts = {};
  }

  // Compute daysUntilDeparture for each booking in portfolio
  const daysUntilDeparture: Record<number, number | null> = {};
  for (const group of portfolio) {
    for (const item of group.bookings) {
      try {
        daysUntilDeparture[item.booking.id] = await bookingRepository.getDaysUntilDeparture(item.booking.id);
      } catch (e) {
        console.error("Failed to compute days until departure for booking:", e);
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
            ? `${item.firstLeg.origin_code} \u2192 ${item.firstLeg.destination_code}`
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
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const isLoading = navigation.state === "loading";

  useKeyboardShortcuts({
    "/": () => searchRef.current?.focus(),
    "n": () => navigate("/bookings/new"),
  });

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
          icon={<Users size={48} />}
          action={canCreate ? { label: "New Booking", to: "/bookings/new" } : undefined}
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Your Portfolio" userIdentity={userIdentity}>
      <div className="flex items-center justify-between mb-4">
        <span />
        <TourTrigger config={agentDashboardTour} />
      </div>
      {/* Warning Banners */}
      {errorAlerts.length > 0 && (
        <div className="mb-6">
          <AlertBanner alerts={errorAlerts} />
        </div>
      )}

      {/* ── A. Welcome Header ──────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between" data-tour="agent-actions">
        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Managing <span className="font-semibold text-slate-700 dark:text-slate-200">{totalClients}</span> client{totalClients !== 1 ? "s" : ""} across{" "}
            <span className="font-semibold text-slate-700 dark:text-slate-200">{totalBookings}</span> booking{totalBookings !== 1 ? "s" : ""}
          </p>
          <button onClick={() => revalidator.revalidate()} className="text-xs text-slate-500 hover:text-slate-700">Refresh</button>
        </div>
        {canCreate && (
          <Button to="/bookings/new" size="md" className="gap-1.5 shadow-sm dark:shadow-slate-900/20">
            <Plus size={16} />
            New Booking
          </Button>
        )}
      </div>

      {/* ── B. Period Stats Row ────────────────────────────────────────────── */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3" data-tour="agent-metrics">
        <MetricCard
          label="Active Clients"
          value={activeClients}
          icon={<Users size={24} />}
        />
        <MetricCard
          label="Pending Bookings"
          value={pendingBookings}
          icon={<Clock size={24} />}
        />
        <MetricCard
          label="Upcoming Departures"
          value={upcomingCount}
          icon={<Plane size={24} />}
        />
      </div>

      {/* ── C. Upcoming Departures Strip ───────────────────────────────────── */}
      {departingSoon.length > 0 && (
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <Clock size={20} className="text-amber-500" />
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
        <div className="mb-8 space-y-4" data-tour="agent-portfolio">
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