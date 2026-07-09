import { Link } from "@remix-run/react";
import type { ReactNode } from "react";
import StatusBadge from "./StatusBadge";
import PaymentStatusBadge from "./PaymentStatusBadge";
import type { BookingRow } from "../utils/repositories/booking";
import { BookingSource } from "../utils/constants";

interface BookingCardProps {
  booking: BookingRow;
  firstLeg: { origin_code: string; destination_code: string; leg_date: string } | null;
  passenger: { first_name: string; last_name: string } | null;
  linkTo: string;
  paymentStatus?: string;
  daysUntilDeparture?: number;
  actions?: ReactNode;
  variant?: "default" | "hero" | "compact";
}

const sourceLabels: Record<string, string> = {
  [BookingSource.CUSTOMER_DIRECT]: "Customer",
  [BookingSource.BOOKING_AGENT]: "Agent",
  [BookingSource.OPERATIONS_STAFF]: "Staff",
};

const variantClasses: Record<string, { container: string; title: string; text: string; spacing: string }> = {
  default: {
    container: "p-4",
    title: "text-lg",
    text: "text-sm",
    spacing: "mb-2",
  },
  hero: {
    container: "p-6 border-indigo-200 dark:border-indigo-800 bg-gradient-to-br from-white to-indigo-50 dark:from-slate-800 dark:to-indigo-950",
    title: "text-xl",
    text: "text-base",
    spacing: "mb-3",
  },
  compact: {
    container: "p-2",
    title: "text-sm",
    text: "text-xs",
    spacing: "mb-1",
  },
};

function DepartureCountdown({ days }: { days: number }) {
  if (days > 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 text-xs font-medium text-emerald-700">
        {days}d until departure
      </span>
    );
  }
  if (days === 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 text-xs font-medium text-amber-700">
        Departing today
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-red-50 dark:bg-red-900/30 px-2 py-0.5 text-xs font-medium text-red-700">
      Departed
    </span>
  );
}

export default function BookingCard({
  booking,
  firstLeg,
  passenger,
  linkTo,
  paymentStatus,
  daysUntilDeparture,
  actions,
  variant = "default",
}: BookingCardProps) {
  const vc = variantClasses[variant];

  return (
    <Link
      to={linkTo}
      className={`block rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm dark:shadow-slate-900/20 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all ${vc.container}`}
    >
      <div className={`flex items-start justify-between ${vc.spacing}`}>
        <div>
          <span className={`${vc.title} font-bold text-slate-900 dark:text-slate-100`}>{booking.booking_reference}</span>
          {passenger && (
            <p className={`${vc.text} text-slate-600 dark:text-slate-300 mt-0.5`}>
              {passenger.first_name} {passenger.last_name}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={booking.status} />
          {paymentStatus && <PaymentStatusBadge status={paymentStatus} size="sm" />}
        </div>
      </div>

      {firstLeg && (
        <div className={`flex items-center gap-2 ${vc.text} text-slate-700 dark:text-slate-200 ${vc.spacing}`}>
          <span className="font-semibold">{firstLeg.origin_code}</span>
          <span className="text-slate-500 dark:text-slate-400">&rarr;</span>
          <span className="font-semibold">{firstLeg.destination_code}</span>
          <span className="text-slate-500 dark:text-slate-400 ml-auto">
            {new Date(firstLeg.leg_date).toLocaleDateString()}
          </span>
        </div>
      )}

      <div className={`flex items-center gap-3 ${vc.text} text-slate-500 dark:text-slate-400`}>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
          booking.booking_source === BookingSource.CUSTOMER_DIRECT
            ? "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
            : booking.booking_source === BookingSource.BOOKING_AGENT
            ? "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
            : "bg-amber-50 dark:bg-amber-900/30 text-amber-700"
        }`}>
          {sourceLabels[booking.booking_source] ?? booking.booking_source}
        </span>
        {booking.total_amount_gbp != null && (
          <span>&pound;{Number(booking.total_amount_gbp).toFixed(2)}</span>
        )}
        {daysUntilDeparture !== undefined && (
          <span className="ml-auto">
            <DepartureCountdown days={daysUntilDeparture} />
          </span>
        )}
      </div>

      {actions && (
        <div className={`mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center gap-2 ${vc.text}`}>
          {actions}
        </div>
      )}
    </Link>
  );
}
