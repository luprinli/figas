import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link , useRouteError, isRouteErrorResponse } from "@remix-run/react";

import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { db } from "../utils/db.server";
import DataTable from "../components/DataTable";
import type { Column } from "../components/DataTable";
import EmptyState from "../components/EmptyState";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
    { title: `Passengers — Booking ${data?.bookingRef ?? ""} - FIGAS` },
];

export async function loader({ request, params }: LoaderFunctionArgs) {
    await requirePermission(request, Permission.BOOKING_VIEW);

    const booking = await db.$queryRawUnsafe<Array<{ id: number; booking_reference: string }>>(
        `SELECT id, booking_reference FROM bookings WHERE id = $1`,
        [Number(params.bookingId)]
    );

    if (booking.length === 0) {
        throw new Response("Booking not found", { status: 404 });
    }

    const passengers = await db.query(
        `SELECT blp.id, bp.first_name, bp.last_name, bl.origin_code, bl.destination_code,
       blp.clothed_weight_kg, blp.baggage_weight_kg, blp.seat_number, blp.checked_in
 FROM booking_leg_passengers blp
 JOIN booking_legs bl ON bl.id = blp.booking_leg_id
 JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
 WHERE bl.booking_id = $1
 ORDER BY blp.id`,
        [Number(params.bookingId)]
    );

    return json({
        bookingRef: booking[0].booking_reference,
        passengers: passengers.rows,
    });
}

export default function BookingPassengers() {
    const { bookingRef, passengers } = useLoaderData<typeof loader>();

    const columns: Column<Record<string, unknown>>[] = [
        { key: "first_name", header: "First Name", sortable: true },
        { key: "last_name", header: "Last Name", sortable: true },
        { key: "origin_code", header: "From", sortable: true },
        { key: "destination_code", header: "To", sortable: true },
        { key: "clothed_weight_kg", header: "Weight (kg)", sortable: true },
        { key: "baggage_weight_kg", header: "Baggage (kg)", sortable: true },
        { key: "seat_number", header: "Seat", sortable: true },
        { key: "checked_in", header: "Checked In", sortable: true },
    ];

    return (
        <div className="space-y-6">
            <Link
                to={`/operations/bookings/${bookingRef}`}
                className="text-xs text-blue-600 hover:underline"
            >
                ← Back to Booking {bookingRef}
            </Link>
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Passengers</h2>
            <DataTable
                columns={columns}
                data={passengers as Record<string, unknown>[]}
                keyExtractor={(item) => String(item.id)}
                emptyState={<EmptyState title="No passengers on this booking." />}
            />
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