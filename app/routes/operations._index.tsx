import type { MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link, useNavigation, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import { scheduleRepository } from "../utils/repositories/schedule";
import { bookingRepository } from "../utils/repositories/booking";
import type { BookingRow } from "../utils/repositories/booking";
import DashboardCard from "../components/DashboardCard";
import NotificationBell from "../components/NotificationBell";
import type { AlertItem } from "../components/AlertStrip";
import StatusBadge from "../components/StatusBadge";
import DataTable from "../components/DataTable";
import type { Column } from "../components/DataTable";
import Skeleton from "../components/Skeleton";

export const meta: MetaFunction = () => [{ title: "Operations Dashboard - FIGAS" }];

function TimeInStatus({ updatedAt, status }: { updatedAt: string; status: string }) {
    const hoursInStatus = Math.round(
        (new Date().getTime() - new Date(updatedAt).getTime()) / (1000 * 60 * 60)
    );
    if (status === "cancelled" || status === "completed") return <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">&mdash;</span>;
    if (hoursInStatus < 1) return <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">{'<1h'}</span>;
    const critical = hoursInStatus > 48;
    const warn = hoursInStatus > 24;
    return (
        <span className={`tabular-nums text-sm font-medium ${critical ? "text-red-600" : warn ? "text-amber-600" : "text-slate-600 dark:text-slate-300 dark:text-slate-500"}`}>
            {hoursInStatus}h
        </span>
    );
}

export async function loader() {
    const today = new Date().toISOString().slice(0, 10);

    const [flightsResult, pendingManifestsResult, notificationsResult, todaySchedule] = await Promise.all([
        sql<Record<string, unknown>>`
            SELECT f.id, f.flight_number, f.departure_time, f.arrival_time, f.status,
              ao.code AS origin_code, ad.code AS destination_code,
              a.registration AS aircraft_registration,
              p.name AS pilot_name
       FROM flights f
       JOIN aerodromes ao ON ao.id = f.origin_aerodrome_id
       JOIN aerodromes ad ON ad.id = f.destination_aerodrome_id
       JOIN aircraft a ON a.id = f.aircraft_id
       LEFT JOIN pilots p ON p.id = f.pilot_id
       WHERE f.departure_time::date = ${today}
       ORDER BY f.departure_time
        `.execute(kdb),
        sql<{ cnt: string }>`
            SELECT COUNT(*) as cnt FROM flight_manifests WHERE signed_off_at IS NULL
        `.execute(kdb),
        sql<Record<string, unknown>>`
            SELECT id, notification_type, recipient_email, status, created_at FROM notifications ORDER BY created_at DESC LIMIT 10
        `.execute(kdb),
        scheduleRepository.findByDate(today),
    ]);

    const flights = flightsResult.rows;
    const pendingManifests = Number(pendingManifestsResult.rows[0]?.cnt ?? 0);

    let scheduleFlightCount = 0;
    if (todaySchedule) {
        const countResult = await sql<{ cnt: string }>`
            SELECT COUNT(*) as cnt FROM flights WHERE schedule_id = ${todaySchedule.id}
        `.execute(kdb);
        scheduleFlightCount = Number(countResult.rows[0]?.cnt ?? 0);
    }

    let pipelineCounts: Record<string, number> | null = null;
    let needsAttention: {
        bookings: Array<{
            booking: BookingRow;
            firstLeg: { origin_code: string; destination_code: string; leg_date: string } | null;
            passenger: { first_name: string; last_name: string; email: string; phone: string | null } | null;
        }>;
        totalCount: number;
    } | null = null;
    let recentBookings: Array<{
        booking: BookingRow;
        firstLeg: { origin_code: string; destination_code: string; leg_date: string } | null;
        passenger: { first_name: string; last_name: string; email: string; phone: string | null } | null;
    }> = [];

    try {
        [pipelineCounts, needsAttention] = await Promise.all([
            bookingRepository.getPipelineCounts(),
            bookingRepository.findNeedsAttention(1, 5),
        ]);
    } catch { /* non-critical */ }

    try {
        const recentResult = await bookingRepository.findAll(1, 10);
        recentBookings = recentResult.bookings;
    } catch { /* non-critical */ }

    const alerts: AlertItem[] = [];
    const attentionCount = needsAttention?.totalCount ?? 0;
    if (attentionCount > 0) {
        needsAttention?.bookings.forEach((item) => {
            const hoursInStatus = Math.round(
                (new Date().getTime() - new Date(item.booking.updated_at).getTime()) / (1000 * 60 * 60)
            );
            if (hoursInStatus > 24) {
                alerts.push({
                    id: `stale-${item.booking.id}`,
                    message: `Booking ${item.booking.booking_reference} stuck in "${item.booking.status}" for ${hoursInStatus}h`,
                    severity: hoursInStatus > 48 ? "red" : "amber",
                    action: { label: "Review", to: `/operations/bookings/${item.booking.id}` },
                });
            }
        });
    }
    if (pendingManifests > 0) {
        alerts.push({
            id: "manifests",
            message: `${pendingManifests} flight manifest${pendingManifests > 1 ? "s" : ""} pending signature`,
            severity: "amber",
            action: { label: "View", to: "/operations/loadsheets" },
        });
    }
    if (!todaySchedule) {
        alerts.push({
            id: "no-schedule",
            message: "No schedule built for today — flights may not be assigned",
            severity: "blue",
            action: { label: "Build Schedule", to: "/operations/schedule" },
        });
    }

    return json({
        flights, pendingManifests, notifications: notificationsResult.rows, today,
        todaySchedule, scheduleFlightCount, pipelineCounts, needsAttention, recentBookings,
        alerts, attentionCount,
    });
}

interface BookingDisplayItem {
    booking: BookingRow;
    firstLeg: { origin_code: string; destination_code: string; leg_date: string } | null;
    passenger: { first_name: string; last_name: string; email: string; phone: string | null } | null;
}

export default function OperationsDashboard() {
    const {
        flights, pendingManifests, today, todaySchedule, scheduleFlightCount,
        pipelineCounts, recentBookings, alerts, attentionCount,
    } = useLoaderData<typeof loader>();
    const navigation = useNavigation();
    const isLoading = navigation.state === "loading";

    if (isLoading) {
        return (
            <div className="p-6 space-y-5">
                <Skeleton className="h-8 w-64" />
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="h-24 rounded-lg" />
                    ))}
                </div>
                <Skeleton className="h-24 rounded-lg" />
                <Skeleton className="h-64 rounded-lg" />
                <Skeleton className="h-48 rounded-lg" />
            </div>
        );
    }

    const upcomingCount = pipelineCounts?.upcoming ?? 0;
    const completedCount = pipelineCounts?.completed ?? 0;
    const flightData = Array.isArray(flights) ? (flights as Array<Record<string, unknown>>) : [];

    const bookingColumns: Column<BookingDisplayItem>[] = [
        { key: "booking_reference", header: "Reference", render: (item) => <span className="font-medium text-slate-800 dark:text-slate-100">{item.booking.booking_reference}</span>, sortable: true },
        { key: "passenger", header: "Passenger", render: (item) => <span className="text-slate-600 dark:text-slate-300 dark:text-slate-500">{item.passenger ? `${item.passenger.first_name} ${item.passenger.last_name}` : "—"}</span>, sortable: true },
        { key: "status", header: "Status", render: (item) => <StatusBadge status={item.booking.status} />, sortable: true },
        { key: "date", header: "Date", render: (item) => <span className="text-slate-600 dark:text-slate-300 dark:text-slate-500">{item.firstLeg ? new Date(item.firstLeg.leg_date).toLocaleDateString("en-GB") : new Date(item.booking.created_at).toLocaleDateString("en-GB")}</span>, sortable: true },
        { key: "time-in-status", header: "Waiting", render: (item) => <TimeInStatus updatedAt={item.booking.updated_at} status={item.booking.status} />, sortable: true },
    ];

    const flightColumns: Column<Record<string, unknown>>[] = [
        { key: "flight_number", header: "Flight", render: (f) => <span className="font-medium text-slate-800 dark:text-slate-100">{f.flight_number as string}</span>, sortable: true },
        { key: "route", header: "Route", render: (f) => <span>{f.origin_code as string} → {f.destination_code as string}</span> },
        { key: "departure_time", header: "Departure", render: (f) => <span className="tabular-nums">{new Date(f.departure_time as string).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>, sortable: true },
        {
            key: "status", header: "Status", sortable: true,
            render: (f) => (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    f.status === "scheduled" ? "bg-blue-100 text-blue-800" :
                    f.status === "boarding" ? "bg-amber-100 text-amber-800" :
                    f.status === "in_progress" ? "bg-emerald-100 text-emerald-800" :
                    f.status === "completed" ? "bg-slate-100 text-slate-800 dark:text-slate-100" : "bg-red-100 text-red-800"
                }`}>{(f.status as string).replace("_", " ")}</span>
            ),
        },
        { key: "aircraft_registration", header: "Aircraft" },
        { key: "pilot_name", header: "Pilot", render: (f) => <span>{(f.pilot_name as string) ?? "—"}</span> },
    ];

    return (
        <div className="p-6 space-y-5">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Operations Dashboard</h1>
                <div className="flex items-center gap-3">
                    <NotificationBell alerts={alerts} />
                    <span className="text-sm text-slate-500 dark:text-slate-400 hidden sm:inline">
                        {new Date(today).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                    </span>
                    <Link to="/operations/schedule" className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
                        Schedule Builder
                    </Link>
                </div>
            </div>

            {/* KPI Row — 6 cards, single row */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <DashboardCard label="Needs Attention" value={attentionCount} color={attentionCount > 0 ? "amber" : "emerald"} />
                <DashboardCard label="Today's Flights" value={flightData.length} color="blue" />
                <DashboardCard label="Today's Schedule" value={todaySchedule ? scheduleFlightCount : "—"} color="emerald" to={todaySchedule ? "/operations/schedule" : undefined} />
                <DashboardCard label="Pending Manifests" value={pendingManifests} color={pendingManifests > 0 ? "amber" : "emerald"} to="/operations/loadsheets" />
                <DashboardCard label="Upcoming" value={upcomingCount} color="purple" />
                <DashboardCard label="Completed" value={completedCount} color="emerald" />
            </div>

            {/* Recent Bookings */}
            {recentBookings.length > 0 && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-700 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex justify-between items-center">
                        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Recent Bookings</h2>
                        <Link to="/operations/bookings" className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400">View all →</Link>
                    </div>
                    <DataTable
                        columns={bookingColumns}
                        data={recentBookings}
                        keyExtractor={(item) => item.booking.id}
                        sortable
                        initialSortColumn="date"
                        initialSortDirection="desc"
                        actions={(item) => (
                            <Link to={`/operations/bookings/${item.booking.id}`} className="text-blue-600 hover:text-blue-800 font-medium text-sm">View</Link>
                        )}
                    />
                </div>
            )}

            {/* Today's Flights */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Today&rsquo;s Flights</h2>
                </div>
                <DataTable
                    columns={flightColumns}
                    data={flightData}
                    keyExtractor={(f) => f.id as number}
                    sortable
                    initialSortColumn="departure_time"
                    initialSortDirection="asc"
                    emptyState={<div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">No flights scheduled for today.</div>}
                    actions={(f) => (
                        <Link to={`/ops/flight/${f.id as number}`} className="text-blue-600 hover:underline text-sm">View</Link>
                    )}
                />
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
