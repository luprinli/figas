import type { PrintOptions } from "../utils/print.client";
import { printDocument } from "../utils/print.client";

export interface PrintButtonProps {
  options: PrintOptions;
  label?: string;
  variant?: "contained" | "outlined";
  color?: "primary" | "danger" | "success" | "warning";
  className?: string;
  disabled?: boolean;
}

/**
 * Reusable print button that generates a print-optimized document
 * via the print.client.ts utility, avoiding full-page printing of the app UI.
 */
export default function PrintButton({
  options,
  label = "Print",
  variant = "outlined",
  color,
  className = "",
  disabled = false,
}: PrintButtonProps) {
  const handlePrint = () => {
    if (disabled) return;
    printDocument(options);
  };

  const base = "inline-flex items-center justify-center gap-1 py-2 px-4 text-sm font-medium rounded-md transition focus:outline-none";

  const variants: Record<string, string> = {
    contained: `${color === "danger" ? "bg-red-600 text-white hover:bg-red-700" : color === "success" ? "bg-emerald-600 text-white hover:bg-emerald-700" : color === "warning" ? "bg-amber-600 text-white hover:bg-amber-700" : "bg-blue-600 text-white hover:bg-blue-700"}`,
    outlined: "bg-transparent text-slate-600 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700",
  };

  return (
    <button
      type="button"
      onClick={handlePrint}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${className}`}
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
      </svg>
      {label}
    </button>
  );
}

/** Build baggage tag print options for a checked-in passenger */
export function buildBaggageTagOptions(passenger: {
  name: string;
  bookingRef: string;
  flightNumber: string;
  origin: string;
  destination: string;
  weight: number;
  baggageWeight: number;
  seat?: string;
  date: string;
}): PrintOptions {
  return {
    title: `Baggage Tag — ${passenger.name}`,
    header: "FIGAS Baggage Tag",
    subheader: `${passenger.flightNumber} — ${passenger.date}`,
    sections: [
      {
        heading: "Passenger",
        rows: [
          { label: "Name", value: passenger.name },
          { label: "Booking Ref", value: passenger.bookingRef },
          { label: "Seat", value: passenger.seat || "—" },
        ],
      },
      {
        heading: "Route",
        rows: [
          { label: "From", value: passenger.origin },
          { label: "To", value: passenger.destination },
          { label: "Flight", value: passenger.flightNumber },
        ],
      },
      {
        heading: "Weight",
        rows: [
          { label: "Body Weight", value: `${passenger.weight} kg` },
          { label: "Baggage", value: `${passenger.baggageWeight} kg` },
          { label: "Total", value: `${passenger.weight + passenger.baggageWeight} kg`, valueClass: "font-bold" },
        ],
      },
      {
        rows: [
          { label: "Tag ID", value: `FIG-${passenger.bookingRef}`, valueClass: "barcode" },
        ],
      },
    ],
    footer: "FIGAS Flight Operations — Baggage Tag — Uncontrolled when printed",
  };
}
