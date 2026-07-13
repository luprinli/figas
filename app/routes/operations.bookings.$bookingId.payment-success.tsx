import { json } from "@remix-run/node";
import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link , useRouteError, isRouteErrorResponse } from "@remix-run/react";

import { bookingRepository } from "../utils/repositories/booking";
import { requireAuth } from "../utils/auth.server";
import { handleStripeSuccess } from "../utils/services/payment.service";
import Button from "../components/Button";

export const headers: HeadersFunction = () => ({
  "Cache-Control": "no-cache, no-store, must-revalidate",
});

export async function loader({ params, request }: LoaderFunctionArgs) {
  const userIdStr = await requireAuth(request);
  const bookingId = Number(params.bookingId);
  if (isNaN(bookingId)) {
    throw json({ error: "Invalid booking ID" }, { status: 400 });
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");

  if (sessionId) {
    // Process via the success handler (idempotent — safe to call even if webhook already processed).
    // Do not swallow errors — let Remix's ErrorBoundary catch payment processing failures.
      await handleStripeSuccess({
        sessionId,
        paymentIntentId: "",
        userId: Number(userIdStr),
      });
  }

  const booking = await bookingRepository.findById(bookingId);
  if (!booking) {
    throw json({ error: "Booking not found" }, { status: 404 });
  }

  return json({ booking, bookingId });
}

export default function PaymentSuccess() {
  const { booking } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white dark:bg-slate-800 rounded-xl shadow-sm dark:shadow-slate-900/20 border border-slate-200 dark:border-slate-700 p-8 text-center space-y-4">
        <div className="text-6xl">✅</div>
        <h1 className="text-2xl font-bold text-success">Payment Successful</h1>
        <p className="text-slate-600 dark:text-slate-300 dark:text-slate-500">
          Your payment for booking{" "}
          <strong className="text-slate-900 dark:text-slate-100">{booking.booking_reference}</strong>{" "}
          has been processed successfully.
        </p>
        <div className="pt-4">
          <Link
            to={`/operations/bookings/${booking.id}`}
            className="inline-block rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover transition-colors"
          >
            Return to Booking
          </Link>
        </div>
      </div>
    </div>
  );
}



export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="mx-auto max-w-lg text-center px-4">
          <div className="mb-4 text-5xl font-bold text-slate-300 dark:text-slate-600">{error.status}</div>
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