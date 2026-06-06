import { useState, useCallback, useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import type { ReactNode } from "react";
import CreditCardIcon from "../icons/CreditCardIcon";
import InvoiceIcon from "../icons/InvoiceIcon";
import CashIcon from "../icons/CashIcon";
import Skeleton from "../Skeleton";
import Button from "../Button";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PaymentMethodSelectorProps {
  bookingId: number;
  totalAmount: number;
  availableMethods: Array<{ code: string; name: string; description: string | null }>;
  onPaymentInitiated: (method: string) => void;
  disabled?: boolean;
}

interface PaymentMethodConfig {
  code: string;
  name: string;
  description: string;
  icon: ReactNode;
  badge?: ReactNode;
  submitLabel: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  const num = Number(amount);
  return `£${Number.isNaN(num) ? "0.00" : num.toFixed(2)}`;
}

function getMethodConfig(method: { code: string; name: string; description: string | null }): PaymentMethodConfig {
  switch (method.code) {
    case "stripe":
      return {
        code: method.code,
        name: method.name,
        description: method.description ?? "Pay securely with your credit or debit card via Stripe.",
        icon: <CreditCardIcon className="w-8 h-8 text-sky-600" />,
        badge: (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 dark:bg-sky-900/30 px-2 py-0.5 text-[10px] font-medium text-sky-700">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Secured by Stripe
          </span>
        ),
        submitLabel: `Pay ${formatCurrency(0)}`, // filled dynamically
      };
    case "invoice":
      return {
        code: method.code,
        name: method.name,
        description: method.description ?? "Generate an invoice to be paid later via bank transfer.",
        icon: <InvoiceIcon className="w-8 h-8 text-amber-600" />,
        badge: undefined,
        submitLabel: "Generate Invoice",
      };
    case "pay_on_departure":
      return {
        code: method.code,
        name: method.name,
        description: method.description ?? "Pay in cash or by card at the airport on the day of departure.",
        icon: <CashIcon className="w-8 h-8 text-emerald-600" />,
        badge: undefined,
        submitLabel: "Confirm",
      };
    case "bank_transfer":
      return {
        code: method.code,
        name: method.name,
        description: method.description ?? "Transfer funds directly to our bank account. Use the booking reference as the payment reference.",
        icon: <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>,
        badge: undefined,
        submitLabel: "Select Bank Transfer",
      };
    default:
      return {
        code: method.code,
        name: method.name,
        description: method.description ?? "",
        icon: <CreditCardIcon className="w-8 h-8 text-slate-500 dark:text-slate-400 dark:text-slate-500" />,
        badge: undefined,
        submitLabel: "Select",
      };
  }
}

// ── Skeleton Loading State ────────────────────────────────────────────────────

function SkeletonCards() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/20">
          <div className="flex items-start gap-4">
            <Skeleton variant="rectangular" className="w-10 h-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32 rounded" />
              <Skeleton className="h-3 w-full rounded" />
              <Skeleton className="h-3 w-3/4 rounded" />
            </div>
            <Skeleton variant="circular" className="w-5 h-5" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 p-6 text-center">
      <svg className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
      </svg>
      <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">No payment methods available.</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
        Contact support to enable payment options for this booking.
      </p>
    </div>
  );
}

// ── Error State ───────────────────────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/30 p-4" role="alert">
      <div className="flex items-start gap-3">
        <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        <div>
          <p className="text-sm font-medium text-red-800">{message}</p>
        </div>
      </div>
    </div>
  );
}

// ── Success State ─────────────────────────────────────────────────────────────

function SuccessState({ method, amount }: { method: string; amount: number }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/30 p-4">
      <div className="flex items-start gap-4">
        <div className="shrink-0">
          <svg className="w-10 h-10 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-emerald-900">Payment Method Selected</h3>
          <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
            {method === "stripe"
              ? `Redirecting to Stripe Checkout for ${formatCurrency(amount)}...`
              : method === "invoice"
              ? "Your invoice is being generated. You will receive a confirmation shortly."
              : "Pay on departure has been confirmed. Please pay at the airport check-in counter."}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PaymentMethodSelector({
  bookingId,
  totalAmount,
  availableMethods,
  onPaymentInitiated,
  disabled = false,
}: PaymentMethodSelectorProps) {
  const fetcher = useFetcher();
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [successMethod, setSuccessMethod] = useState<string | null>(null);
  const [showBankInstructions, setShowBankInstructions] = useState(false);

  const isSubmitting = fetcher.state === "submitting";
  const fetcherData = fetcher.data as
    | { success: boolean; stripeSessionUrl?: string; error?: string }
    | undefined;
  const hasError = fetcherData && !fetcherData.success;

  // Determine the overall state
  const isLoading = false; // methods are passed as props, no client-side loading
  const isEmpty = availableMethods.length === 0;

  const handleSelect = useCallback((code: string) => {
    setSelectedMethod(code);
    setShowBankInstructions(false);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!selectedMethod || isSubmitting || disabled) return;

    let intent: string;
    let formData: Record<string, string | number>;

    switch (selectedMethod) {
      case "stripe":
        intent = "initiate_stripe";
        formData = { intent, bookingId, amount: totalAmount };
        break;
      case "invoice":
        intent = "generate_invoice";
        formData = { intent, bookingId };
        break;
      case "pay_on_departure":
        intent = "set_pay_on_departure";
        formData = { intent, bookingId };
        break;
      case "bank_transfer":
        setShowBankInstructions(true);
        onPaymentInitiated(selectedMethod);
        return; // Don't submit — show instructions instead
      default:
        return;
    }

    fetcher.submit(formData, { method: "post" });
    onPaymentInitiated(selectedMethod);
  }, [selectedMethod, isSubmitting, disabled, bookingId, totalAmount, fetcher, onPaymentInitiated]);

  // Handle fetcher response — redirect for Stripe, show success for others
  // Use useEffect to avoid state updates during render (race condition fix)
  useEffect(() => {
    if (fetcherData?.success && !hasError) {
      if (fetcherData.stripeSessionUrl) {
        // Stripe: redirect to Checkout
        window.location.href = fetcherData.stripeSessionUrl;
        return;
      }

      // Invoice or Pay on Departure: show success state
      if (!successMethod && selectedMethod) {
        setSuccessMethod(selectedMethod);
      }
    }
  }, [fetcherData, hasError, successMethod, selectedMethod]);

  // Success state
  if (successMethod) {
    return <SuccessState method={successMethod} amount={totalAmount} />;
  }

  // Loading state
  if (isLoading) {
    return <SkeletonCards />;
  }

  // Empty state
  if (isEmpty) {
    return <EmptyState />;
  }

  // Error state (from fetcher)
  const errorMessage = fetcherData?.error || "An unexpected error occurred. Please try again.";

  // ── Normal state ──────────────────────────────────────────────────────────

  const selectedConfig = selectedMethod
    ? getMethodConfig(
        availableMethods.find((m) => m.code === selectedMethod) ?? {
          code: selectedMethod,
          name: selectedMethod,
          description: null,
        }
      )
    : null;

  return (
    <div className="space-y-3">
      {/* Error banner */}
      {hasError && <ErrorBanner message={errorMessage} />}

      {/* Radio card list */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Payment method">
        {availableMethods.map((method) => {
          const config = getMethodConfig(method);
          const isSelected = selectedMethod === method.code;

          return (
            <label
              key={method.code}
              className={[
                "relative flex items-start gap-4 rounded-lg border p-4 shadow-sm dark:shadow-slate-900/20 cursor-pointer transition-all",
                isSelected
                  ? "border-sky-400 ring-2 ring-sky-500 bg-sky-50/50"
                  : "border-slate-200 bg-white dark:bg-slate-800 hover:border-slate-300 hover:bg-slate-50/50",
                disabled ? "opacity-60 cursor-not-allowed" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {/* Radio input (visually hidden) */}
              <input
                type="radio"
                name="payment_method"
                value={method.code}
                checked={isSelected}
                onChange={() => handleSelect(method.code)}
                disabled={disabled}
                className="sr-only"
                aria-describedby={`method-desc-${method.code}`}
              />

              {/* Custom radio indicator */}
              <span
                className={[
                  "shrink-0 mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                  isSelected
                    ? "border-sky-500 bg-sky-500"
                    : "border-slate-300 bg-white dark:bg-slate-800",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-hidden="true"
              >
                {isSelected && (
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </span>

              {/* Icon */}
              <div className="shrink-0">{config.icon}</div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {config.name}
                  </span>
                  {config.badge && <span className="shrink-0">{config.badge}</span>}
                </div>
                <p
                  id={`method-desc-${method.code}`}
                  className="text-xs text-slate-500 dark:text-slate-400 mt-0.5"
                >
                  {config.description}
                </p>
              </div>
            </label>
          );
        })}
      </div>

      {/* Action button */}
      {selectedConfig && (
        <div className="pt-1">
          <Button
            type="button"
            variant="contained"
            loading={isSubmitting}
            disabled={disabled || isSubmitting}
            onClick={handleSubmit}
            className="w-full"
          >
            {selectedMethod === "stripe"
              ? `Pay ${formatCurrency(totalAmount)}`
              : selectedConfig.submitLabel}
          </Button>
        </div>
      )}

      {/* Bank Transfer Instructions */}
      {showBankInstructions && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 p-4 space-y-3">
          <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300">Bank Transfer Instructions</h4>
          <p className="text-xs text-blue-700 dark:text-blue-400">
            Please transfer the exact amount to the following account:
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-slate-500 dark:text-slate-400">Bank:</span>
              <p className="font-medium text-slate-800 dark:text-slate-100">Standard Chartered Bank</p>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Account Name:</span>
              <p className="font-medium text-slate-800 dark:text-slate-100">FIGAS Flight Operations</p>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Sort Code:</span>
              <p className="font-medium text-slate-800 dark:text-slate-100 font-mono">60-00-01</p>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Account Number:</span>
              <p className="font-medium text-slate-800 dark:text-slate-100 font-mono">00123456</p>
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
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Once your transfer is received, your booking will be confirmed. This typically takes 1-2 business days.
          </p>
        </div>
      )}
    </div>
  );
}
