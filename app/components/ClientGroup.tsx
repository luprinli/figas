import { useState } from "react";
import { Link } from "@remix-run/react";
import StatusBadge from "./StatusBadge";
import PaymentStatusBadge from "./PaymentStatusBadge";

export interface BookingWithMeta {
  booking: {
    id: number;
    booking_reference: string;
    status: string;
    total_amount_gbp: number;
    payment_status: string;
  };
  firstLeg: {
    origin_code: string;
    destination_code: string;
    leg_date: string;
  } | null;
  paymentStatus: string;
}

export interface ClientGroupProps {
  clientName: string;
  clientEmail: string;
  bookings: BookingWithMeta[];
  defaultExpanded?: boolean;
  className?: string;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ClientGroup({
  clientName,
  clientEmail,
  bookings,
  defaultExpanded = false,
  className = "",
}: ClientGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const toggleExpanded = () => setExpanded((prev) => !prev);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleExpanded();
    }
  };

  return (
    <div className={`border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden ${className}`}>
      {/* Header */}
      <button
        type="button"
        aria-expanded={expanded}
        onClick={toggleExpanded}
        onKeyDown={handleKeyDown}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex flex-col items-start min-w-0">
            <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
              {clientName}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {clientEmail}
            </span>
          </div>
          <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-100 rounded-full">
            {bookings.length}
          </span>
        </div>

        {/* Chevron icon */}
        <svg
          className={`w-5 h-5 text-slate-500 dark:text-slate-400 transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Body */}
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          expanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="border-t border-slate-200 dark:border-slate-700">
          {bookings.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
              No bookings for this client
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {bookings.map((item) => (
                <li key={item.booking.id}>
                  <Link
                    to={`/agent/bookings/${item.booking.id}`}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors duration-150 group"
                  >
                    {/* Booking reference */}
                    <span className="text-sm font-medium text-blue-600 group-hover:text-blue-800 transition-colors min-w-[5rem]">
                      {item.booking.booking_reference}
                    </span>

                    {/* Route */}
                    <span className="text-sm text-slate-700 dark:text-slate-200 min-w-[8rem]">
                      {item.firstLeg
                        ? `${item.firstLeg.origin_code} → ${item.firstLeg.destination_code}`
                        : "—"}
                    </span>

                    {/* Date */}
                    <span className="text-sm text-slate-500 dark:text-slate-400 min-w-[7rem]">
                      {item.firstLeg
                        ? formatDate(item.firstLeg.leg_date)
                        : "—"}
                    </span>

                    {/* Status badge */}
                    <div className="min-w-[6rem]">
                      <StatusBadge status={item.booking.status} />
                    </div>

                    {/* Payment status badge */}
                    <div className="min-w-[7rem]">
                      <PaymentStatusBadge
                        status={item.paymentStatus}
                        size="sm"
                      />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
