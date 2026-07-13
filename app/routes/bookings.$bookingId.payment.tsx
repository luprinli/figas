import type { HeadersFunction, LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { useEffect } from "react";
import { requireAuth } from "../utils/auth.server";
import { bookingRepository } from "../utils/repositories/booking";
import { bookingLegRepository } from "../utils/repositories/booking-leg";
import { bookingLegPassengerRepository } from "../utils/repositories/booking-leg-passenger";
import { PaymentMethod, FREIGHT_RATE_PER_KG } from "../utils/constants";
import { calculateBookingCost, getAvailableMethods, initiateStripePayment, recordInvoiceSelection, recordOfflinePaymentSelection } from "../utils/services/payment.service";
import PaymentMethodSelector from "../components/booking/PaymentMethodSelector";
import Skeleton from "../components/Skeleton";
import { CreditCard } from "lucide-react";
import { ErrorBoundary } from "../components/ErrorBoundary";

export const meta: MetaFunction = () => [{ title: "Payment - FIGAS" }];

export const headers: HeadersFunction = () => ({
  "Cache-Control": "no-cache, no-store, must-revalidate",
});

// ── Bank Account Configuration (should come from env or admin settings) ───────────

const BANK_CONFIG = {
  name: process.env.BANK_NAME ?? "Standard Chartered Bank",
  accountName: process.env.BANK_ACCOUNT_NAME ?? "FIGAS Flight Operations",
  sortCode: process.env.BANK_SORT_CODE ?? "60-00-01",
  accountNumber: process.env.BANK_ACCOUNT_NUMBER ?? "00123456",
};

// ── Loader ──────────────────────────────────────────────────────────────────────

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireAuth(request);
  const bookingId = Number(params.bookingId);
  if (isNaN(bookingId)) {
    throw json({ error: "Invalid booking ID" }, { status: 400 });
  }

  const booking = await bookingRepository.findById(bookingId);
  if (!booking || booking.user_id !== Number(userId)) {
    throw json({ error: "Booking not found" }, { status: 404 });
  }

  const [availableMethods] = await Promise.all([
    getAvailableMethods().catch(() => [] as Array<{ code: string; name: string; description: string | null }>),
  ]);

  const totalCost = await calculateBookingCost(bookingId).catch(() => 0);

  return json({
    booking,
    bookingId,
    availableMethods,
    totalCost,
  });
}

// ── Action ──────────────────────────────────────────────────────────────────────

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireAuth(request);
  const bookingId = Number(params.bookingId);
  if (isNaN(bookingId)) {
    return json({ error: "Invalid booking ID" }, { status: 400 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  const url = new URL(request.url);

  if (intent === "initiate_stripe") {
    const amount = Number(formData.get("amount"));
    if (isNaN(amount) || amount <= 0) {
      return json({ success: false, error: "Invalid payment amount" }, { status: 400 });
    }

    const result = await initiateStripePayment({
      bookingId,
      amount,
      successUrl: `${url.origin}/bookings/${bookingId}/payment-success`,
      cancelUrl: `${url.origin}/bookings/${bookingId}/payment-cancel`,
      userId: Number(userId),
    });

    return json(result);
  }

  if (intent === "generate_invoice") {
    const booking = await bookingRepository.findById(bookingId);
    if (!booking) {
      return json({ success: false, error: "Booking not found" }, { status: 404 });
    }

    const legs = await bookingLegRepository.findByBookingId(bookingId).catch(() => []);
    const legPassengers = await bookingLegPassengerRepository.findByBookingId(bookingId).catch(() => []);

    const lineItems: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      type: string;
    }> = [];

    for (const leg of legs) {
      const legFreightTotal = legPassengers
        .filter((lp) => lp.booking_leg_id === leg.id)
        .reduce((sum, lp) => sum + (lp.freight_weight_kg ?? 0), 0);

      if (legFreightTotal > 0) {
        lineItems.push({
          description: `Freight — ${leg.origin_code} \u2192 ${leg.destination_code} (${legFreightTotal}kg)`,
          quantity: 1,
          unitPrice: legFreightTotal * FREIGHT_RATE_PER_KG,
          type: "freight",
        });
      }
    }

    const result = await recordInvoiceSelection({
      bookingId,
      userId: 0,
      lineItems,
    });

    return json(result);
  }

  if (intent === "set_pay_on_departure" || intent === "set_pay_on_arrival" || intent === "set_bank_transfer") {
    const method = intent === "set_pay_on_departure"
      ? PaymentMethod.PAY_ON_DEPARTURE
      : intent === "set_pay_on_arrival"
        ? PaymentMethod.PAY_ON_ARRIVAL
        : PaymentMethod.BANK_TRANSFER;

    const result = await recordOfflinePaymentSelection({
      bookingId,
      methodCode: method,
      userId: 0,
    });

    return json(result);
  }

  return json({ error: "Unknown action" }, { status: 400 });
}

// ── Components ─────────────────────────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/30 p-4 mb-4" role="alert">
      <p className="text-sm font-medium text-red-800">{message}</p>
    </div>
  );
}

function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/30 p-4 mb-4" role="status">
      <p className="text-sm font-medium text-emerald-800">{message}</p>
    </div>
  );
}

function BankTransferInstructions({ bookingId }: { bookingId: number }) {
  return (
    <div className="rounded-lg border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 p-4 space-y-3">
      <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300">Bank Transfer Instructions</h4>
      <p className="text-xs text-blue-700 dark:text-blue-400">
        Please transfer the exact amount to the following account:
      </p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-slate-500 dark:text-slate-400">Bank:</span>
          <p className="font-medium text-slate-800 dark:text-slate-100">{BANK_CONFIG.name}</p>
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400">Account Name:</span>
          <p className="font-medium text-slate-800 dark:text-slate-100">{BANK_CONFIG.accountName}</p>
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400">Sort Code:</span>
          <p className="font-medium text-slate-800 dark:text-slate-100 font-mono">{BANK_CONFIG.sortCode}</p>
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400">Account Number:</span>
          <p className="font-medium text-slate-800 dark:text-slate-100 font-mono">{BANK_CONFIG.accountNumber}</p>
        </div>
      </div>
      <div className="rounded bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 p-2">
        <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
          Payment Reference: <span className="font-mono font-bold">FIG-{bookingId}</span>
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
          You must include this reference for your payment to be matched to your booking.
        </p>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function BookingPayment() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<{ success?: boolean; error?: string; invoiceId?: number; stripeSessionUrl?: string }>();
  const navigation = useNavigation();

  const { booking, bookingId, availableMethods, totalCost } = data;
  const isSubmitting = navigation.state === "submitting";
  const isLoading = navigation.state === "loading" && !navigation.formData;

  useEffect(() => {
    if (actionData?.stripeSessionUrl) {
      window.location.href = actionData.stripeSessionUrl;
    }
  }, [actionData?.stripeSessionUrl]);

  if (isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4" aria-live="polite" aria-busy="true">
        <Skeleton className="h-4 w-32 rounded" />
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm dark:shadow-slate-900/20 space-y-4">
          <Skeleton className="h-6 w-48 rounded" />
          <Skeleton className="h-4 w-64 rounded" />
          <Skeleton className="h-4 w-40 rounded" />
          <Skeleton className="h-12 w-full rounded" />
          <Skeleton className="h-12 w-full rounded" />
          <Skeleton className="h-12 w-full rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Link
        to={`/bookings/${bookingId}`}
        className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 transition-colors mb-4"
      >
        ← Back to Booking
      </Link>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm dark:shadow-slate-900/20">
        <div className="flex items-center gap-3 mb-4">
          <CreditCard className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Make Payment</h1>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
          Booking: <strong className="text-slate-900 dark:text-slate-100">{booking.booking_reference}</strong>
        </p>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-4">
          Total: £{totalCost.toFixed(2)}
        </p>

        {actionData?.error && <ErrorBanner message={actionData.error} />}
        {actionData?.invoiceId && <SuccessBanner message="Invoice generated successfully. You will receive payment instructions shortly." />}

        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="initiate_stripe" />
          <input type="hidden" name="amount" value={totalCost} />

          <PaymentMethodSelector
            bookingId={bookingId}
            totalAmount={totalCost}
            availableMethods={availableMethods}
            onPaymentInitiated={() => {}}
            disabled={isSubmitting}
          />
        </Form>

        {actionData?.invoiceId && <BankTransferInstructions bookingId={bookingId} />}
      </div>
    </div>
  );
}

export { ErrorBoundary };