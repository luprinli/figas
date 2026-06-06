import { useState, useCallback } from "react";
import { useFetcher } from "@remix-run/react";
import type { BookingLegRow } from "../../utils/repositories/booking-leg";
import type { BookingPassengerRow } from "../../utils/repositories/booking-passenger";
import type { BookingLegPassengerWithDetails } from "../../utils/repositories/booking-leg-passenger";
import RefundIcon from "../icons/RefundIcon";
import TopUpIcon from "../icons/TopUpIcon";
import WingIcon from "../icons/WingIcon";

// ── Types ───────────────────────────────────────────────────────────────────

export interface PostBookingChange {
  type: "refund" | "top_up" | "adjustment";
  amount: number;
  reason: string;
  createdAt: string;
  createdBy: string;
}

interface PostBookingChangesProps {
  bookingId: number;
  bookingReference: string;
  bookingStatus: string;
  paymentStatus: string;
  legs: BookingLegRow[];
  passengers: BookingPassengerRow[];
  legPassengers: BookingLegPassengerWithDetails[];
  storedTotal: number | null;
  canManagePayment: boolean;
  className?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  const num = Number(amount);
  return `\u00a3${Number.isNaN(num) ? "0.00" : num.toFixed(2)}`;
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ChangeTypeBadge({ type }: { type: PostBookingChange["type"] }) {
  const styles: Record<string, string> = {
    refund: "bg-amber-100 text-amber-800",
    top_up: "bg-sky-100 dark:bg-sky-900/30 text-sky-800",
    adjustment: "bg-slate-100 text-slate-800 dark:text-slate-100",
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${styles[type]}`}>
      {type === "refund" && <RefundIcon className="w-3 h-3" />}
      {type === "top_up" && <TopUpIcon className="w-3 h-3" />}
      {type === "adjustment" && <WingIcon className="w-3 h-3" />}
      {type.replace(/_/g, " ")}
    </span>
  );
}

function ChangeHistory({ changes }: { changes: PostBookingChange[] }) {
  if (changes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 p-4 text-center">
        <WingIcon className="w-8 h-8 mx-auto mb-2 fill-slate-300" />
        <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">No post-booking changes recorded</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {changes.map((change, idx) => (
        <div
          key={idx}
          className="flex items-center justify-between rounded-lg border border-slate-100 bg-white dark:bg-slate-800 p-3 text-sm"
        >
          <div className="flex items-center gap-3">
            <ChangeTypeBadge type={change.type} />
            <div>
              <p className="font-medium text-slate-800 dark:text-slate-100">{change.reason}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                {change.createdBy} &middot;{" "}
                {new Date(change.createdAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
          <span className={`font-bold ${
            change.type === "refund" ? "text-amber-700" : "text-sky-700"
          }`}>
            {change.type === "refund" ? "-" : "+"}{formatCurrency(change.amount)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function PostBookingChanges({
  bookingId,
  bookingReference,
  paymentStatus,
  legs,
  passengers,
  legPassengers,
  storedTotal,
  canManagePayment,
  className = "",
}: PostBookingChangesProps) {
  const fetcher = useFetcher<{ success?: boolean; error?: string }>();
  const [changeType, setChangeType] = useState<"refund" | "top_up">("refund");
  const [changeAmount, setChangeAmount] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [showForm, setShowForm] = useState(false);

  const isSubmitting = fetcher.state === "submitting";

  // ── Mock change history (in production, fetch from API) ─────────────────
  const [changes] = useState<PostBookingChange[]>([]);

  const handleSubmit = useCallback(() => {
    const amount = parseFloat(changeAmount);
    if (isNaN(amount) || amount <= 0) return;
    if (!changeReason.trim()) return;

    fetcher.submit(
      {
        intent: "post_booking_change",
        bookingId: String(bookingId),
        changeType,
        amount: String(amount),
        reason: changeReason.trim(),
      },
      { method: "post" }
    );
  }, [changeAmount, changeReason, changeType, bookingId, fetcher]);

  const canChange =
    canManagePayment &&
    (paymentStatus === "paid" || paymentStatus === "partially_paid");

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Change History */}
      <div>
        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-2">
          <WingIcon className="w-4 h-4 fill-slate-500" />
          Change History
        </h4>
        <ChangeHistory changes={changes} />
      </div>

      {/* New Change Form */}
      {canChange && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          {!showForm ? (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="w-full rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 py-3 text-sm font-medium text-slate-600 dark:text-slate-300 hover:border-sky-400 hover:text-sky-600 transition-colors"
            >
              + Record Post-Booking Change
            </button>
          ) : (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Record Change for {bookingReference}
              </h4>

              {/* Change Type Toggle */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setChangeType("refund")}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    changeType === "refund"
                      ? "border-amber-300 bg-amber-50 dark:bg-amber-900/30 text-amber-800"
                      : "border-slate-200 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-700"
                  }`}
                >
                  <RefundIcon className="w-4 h-4" />
                  Refund
                </button>
                <button
                  type="button"
                  onClick={() => setChangeType("top_up")}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    changeType === "top_up"
                      ? "border-sky-300 bg-sky-50 text-sky-800"
                      : "border-slate-200 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-700"
                  }`}
                >
                  <TopUpIcon className="w-4 h-4" />
                  Top-Up
                </button>
              </div>

              {/* Amount */}
              <div>
                <label htmlFor="change-amount" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Amount (&pound;)
                </label>
                <input
                  id="change-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={changeAmount}
                  onChange={(e) => setChangeAmount(e.target.value)}
                  placeholder="0.00"
                  className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              {/* Reason */}
              <div>
                <label htmlFor="change-reason" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Reason
                </label>
                <textarea
                  id="change-reason"
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  rows={2}
                  placeholder="Reason for this change..."
                  className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setChangeAmount("");
                    setChangeReason("");
                  }}
                  className="rounded-lg border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting || !changeAmount || !changeReason.trim()}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? "Recording..." : "Record Change"}
                </button>
              </div>

              {/* Error */}
              {fetcher.data?.error && (
                <p className="text-xs text-red-600 mt-1">{fetcher.data.error}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* No permission message */}
      {!canChange && (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 p-4 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
            Payment changes are only available for paid bookings.
          </p>
        </div>
      )}
    </div>
  );
}
