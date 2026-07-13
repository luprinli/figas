import CreditCardIcon from "../icons/CreditCardIcon";
import InvoiceIcon from "../icons/InvoiceIcon";
import CashIcon from "../icons/CashIcon";
import type { ReactNode } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export type PaymentStatus = "pending" | "processing" | "success" | "failed" | "refunded";

export interface PaymentConfirmationProps {
  status: PaymentStatus;
  method: string | null;
  amount: number;
  reference?: string;
  timestamp?: string;
  errorMessage?: string;
  onRetry?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMethodIcon(method: string | null): ReactNode {
  switch (method?.toLowerCase()) {
    case "stripe":
    case "credit_card":
    case "card":
      return <CreditCardIcon className="w-8 h-8 text-sky-600" />;
    case "invoice":
      return <InvoiceIcon className="w-8 h-8 text-amber-600" />;
    case "cash":
    case "offline":
      return <CashIcon className="w-8 h-8 text-emerald-600" />;
    default:
      return <CreditCardIcon className="w-8 h-8 text-slate-500 dark:text-slate-500" />;
  }
}

function getStatusConfig(status: PaymentStatus): {
  bgClass: string;
  borderClass: string;
  icon: ReactNode;
  title: string;
  description: string;
} {
  switch (status) {
    case "success":
      return {
        bgClass: "bg-emerald-50",
        borderClass: "border-emerald-200",
        icon: (
          <svg className="w-10 h-10 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
        title: "Payment Successful",
        description: "The payment has been processed successfully.",
      };
    case "processing":
      return {
        bgClass: "bg-sky-50",
        borderClass: "border-sky-200",
        icon: (
          <svg className="w-10 h-10 text-sky-500 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ),
        title: "Processing Payment",
        description: "Please wait while we process your payment.",
      };
    case "failed":
      return {
        bgClass: "bg-red-50",
        borderClass: "border-red-200",
        icon: (
          <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
        title: "Payment Failed",
        description: "The payment could not be processed.",
      };
    case "refunded":
      return {
        bgClass: "bg-amber-50",
        borderClass: "border-amber-200",
        icon: (
          <svg className="w-10 h-10 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 15v-1a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3m9 14V5a2 2 0 00-2-2H6a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2z" />
          </svg>
        ),
        title: "Payment Refunded",
        description: "The payment has been refunded.",
      };
    default:
      return {
        bgClass: "bg-slate-50 dark:bg-slate-700",
        borderClass: "border-slate-200 dark:border-slate-700",
        icon: (
          <svg className="w-10 h-10 text-slate-500 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
        title: "Payment Pending",
        description: "Awaiting payment confirmation.",
      };
  }
}

function formatCurrency(amount: number): string {
  const num = Number(amount);
  return `£${Number.isNaN(num) ? "0.00" : num.toFixed(2)}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PaymentConfirmation({
  status,
  method,
  amount,
  reference,
  timestamp,
  errorMessage,
  onRetry,
}: PaymentConfirmationProps) {
  const config = getStatusConfig(status);

  return (
    <div className={`rounded-lg border ${config.borderClass} ${config.bgClass} p-4 shadow-sm dark:shadow-slate-900/20`}>
      <div className="flex items-start gap-4">
        <div className="shrink-0">{config.icon}</div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{config.title}</h3>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{config.description}</p>

          {/* Details */}
          <div className="mt-3 space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 dark:text-slate-500">Amount:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {formatCurrency(amount)}
              </span>
            </div>
            {method && (
              <div className="flex items-center gap-2">
                <span className="text-slate-500 dark:text-slate-500">Method:</span>
                <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200 capitalize">
                  {getMethodIcon(method)}
                  {method.replace(/_/g, " ")}
                </span>
              </div>
            )}
            {reference && (
              <div className="flex items-center gap-2">
                <span className="text-slate-500 dark:text-slate-500">Reference:</span>
                <span className="font-mono text-slate-700 dark:text-slate-200">{reference}</span>
              </div>
            )}
            {timestamp && (
              <div className="flex items-center gap-2">
                <span className="text-slate-500 dark:text-slate-500">Date:</span>
                <span className="text-slate-700 dark:text-slate-200">
                  {new Date(timestamp).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            )}
          </div>

          {/* Error message */}
          {status === "failed" && errorMessage && (
            <div className="mt-3 rounded bg-red-100 border border-red-200 px-2 py-1.5">
              <p className="text-[10px] text-red-700">{errorMessage}</p>
            </div>
          )}

          {/* Retry button */}
          {status === "failed" && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex items-center rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition-colors"
            >
              Retry Payment
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
