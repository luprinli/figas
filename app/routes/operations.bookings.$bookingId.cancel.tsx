import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { db } from "../utils/db.server";
import Button from "../components/Button";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
    { title: `Cancel Booking — ${data?.bookingRef ?? ""} - FIGAS` },
];

export async function loader({ request, params }: LoaderFunctionArgs) {
    await requirePermission(request, Permission.BOOKING_EDIT);

    const booking = await db.$queryRawUnsafe<Array<{
        id: number; booking_reference: string; status: string;
    }>>(
        `SELECT id, booking_reference, status FROM bookings WHERE id = $1`,
        [Number(params.bookingId)]
    );

    if (booking.length === 0) {
        throw new Response("Booking not found", { status: 404 });
    }

    return json({ bookingRef: booking[0].booking_reference, status: booking[0].status });
}

export async function action({ request, params }: ActionFunctionArgs) {
    await requirePermission(request, Permission.BOOKING_EDIT);
    const formData = await request.formData();
    const reason = formData.get("reason") as string;

    await db.$queryRawUnsafe(
        `UPDATE bookings SET status = 'cancelled', cancellation_reason = $1, updated_at = NOW()
     WHERE id = $2`,
        [reason || "No reason provided", Number(params.bookingId)]
    );

    return redirect(`/operations/bookings/${params.bookingId}`);
}

export default function CancelBooking() {
    const { bookingRef, status } = useLoaderData<typeof loader>();
    const fetcher = useFetcher();
    const submitting = fetcher.state !== "idle";

    if (status === "cancelled") {
        return (
            <div className="max-w-lg mx-auto py-8">
                <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 p-6 text-center">
                    <p className="text-amber-800 dark:text-amber-400 font-medium">This booking has already been cancelled.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-lg mx-auto py-8 space-y-6">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Cancel Booking {bookingRef}</h2>
            <div className="rounded-lg bg-white dark:bg-slate-800 border border-red-200 p-6 space-y-4">
                <p className="text-sm text-slate-600 dark:text-slate-300 dark:text-slate-500">
                    Are you sure you want to cancel this booking? This action cannot be undone.
                </p>
                <fetcher.Form method="post" className="space-y-4">
                    <div>
                        <label htmlFor="reason" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                            Cancellation Reason
                        </label>
                        <textarea
                            id="reason"
                            name="reason"
                            rows={3}
                            className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="Provide a reason for cancellation..."
                        />
                    </div>
                    <div className="flex gap-3">
                        <Button type="submit" loading={submitting}>
                            Confirm Cancellation
                        </Button>
                        <Button variant="outlined" to={`/operations/bookings/${bookingRef}`}>
                            Go Back
                        </Button>
                    </div>
                </fetcher.Form>
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