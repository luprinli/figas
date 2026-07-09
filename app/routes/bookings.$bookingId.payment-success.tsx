import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { bookingRepository } from "../utils/repositories/booking";
import { handleStripeSuccess } from "../utils/services/payment.service";
import { ErrorBoundary } from "../components/ErrorBoundary";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const bookingId = Number(params.bookingId);
  if (isNaN(bookingId)) {
    throw json({ error: "Invalid booking ID" }, { status: 400 });
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");

  if (sessionId) {
    await handleStripeSuccess({
      sessionId,
      paymentIntentId: "",
      userId: 0,
    }).catch((err) => console.error("payment-success handler error:", err));
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-700 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white dark:bg-slate-800 rounded-xl shadow-sm dark:shadow-slate-900/20 border border-slate-200 dark:border-slate-700 p-8 text-center space-y-4">
        <div className="text-6xl">✅</div>
        <h1 className="text-2xl font-bold text-emerald-700">Payment Successful</h1>
        <p className="text-slate-600 dark:text-slate-300 dark:text-slate-500">
          Your payment for booking{" "}
          <strong className="text-slate-900 dark:text-slate-100">{booking.booking_reference}</strong>{" "}
          has been processed successfully.
        </p>
        <div className="pt-4">
          <Link
            to={`/bookings/${booking.id}`}
            className="inline-block rounded-lg bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 transition-colors"
          >
            Return to Booking
          </Link>
        </div>
      </div>
    </div>
  );
}

export { ErrorBoundary };