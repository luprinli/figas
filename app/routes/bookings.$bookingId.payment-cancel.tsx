import { json } from "@remix-run/node";
import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { XCircle, CreditCard, Building2 } from "lucide-react";
import { bookingRepository } from "../utils/repositories/booking";
import { PaymentStatus } from "../utils/constants";
import { requireAuth } from "../utils/auth.server";
import { getBankConfig } from "../config/bank.server";
import { ErrorBoundary } from "../components/ErrorBoundary";
import Button from "../components/Button";

export const headers: HeadersFunction = () => ({
  "Cache-Control": "no-cache, no-store, must-revalidate",
});

export async function loader({ params, request }: LoaderFunctionArgs) {
  await requireAuth(request);
  const bookingId = Number(params.bookingId);
  if (isNaN(bookingId)) {
    throw json({ error: "Invalid booking ID" }, { status: 400 });
  }

  // Do not swallow errors — let Remix's ErrorBoundary catch payment reset failures.
  await bookingRepository.updatePayment(bookingId, {
    payment_status: PaymentStatus.PENDING,
  });

  const booking = await bookingRepository.findById(bookingId);
  if (!booking) {
    throw json({ error: "Booking not found" }, { status: 404 });
  }

  const bankConfig = getBankConfig();

  return json({ booking, bookingId, bankConfig });
}

export default function PaymentCancel() {
  const { booking, bookingId, bankConfig } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white dark:bg-slate-800 rounded-xl shadow-sm dark:shadow-slate-900/20 border border-slate-200 dark:border-slate-700 p-8 space-y-6">
        <div className="text-center space-y-3">
          <XCircle size={48} className="mx-auto text-warning" absoluteStrokeWidth />
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Payment Cancelled</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Your Stripe payment for booking{" "}
            <strong className="text-slate-900 dark:text-slate-100">{booking.booking_reference}</strong>{" "}
            was cancelled. No charges have been made.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <Button to={`/bookings/${bookingId}/payment`} size="md">
            <CreditCard size={16} />
            Try Card Payment Again
          </Button>
          <Button to={`/bookings/${bookingId}`} variant="outlined" size="md">
            Back to Booking
          </Button>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
            <Building2 size={16} className="text-primary" absoluteStrokeWidth />
            Alternative: Pay by Bank Transfer
          </p>
          <div className="rounded-lg border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Bank</span>
                <p className="font-medium text-slate-800 dark:text-slate-100">{bankConfig.bank}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Account Name</span>
                <p className="font-medium text-slate-800 dark:text-slate-100">{bankConfig.accountName}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Sort Code</span>
                <p className="font-medium text-slate-800 dark:text-slate-100 font-mono">{bankConfig.sortCode}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Account Number</span>
                <p className="font-medium text-slate-800 dark:text-slate-100 font-mono">{bankConfig.accountNumber}</p>
              </div>
            </div>
            <div className="rounded bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 p-2">
              <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                Payment Reference: <span className="font-mono font-bold">FIG-{bookingId}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { ErrorBoundary };