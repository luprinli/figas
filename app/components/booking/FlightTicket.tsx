import { useState, useCallback } from "react";
import type { BookingLegRow } from "../../utils/repositories/booking-leg";
import type { BookingPassengerRow } from "../../utils/repositories/booking-passenger";
import type { BookingLegPassengerWithDetails } from "../../utils/repositories/booking-leg-passenger";
import BarcodeIcon from "../icons/BarcodeIcon";
import BoardingPassIcon from "../icons/BoardingPassIcon";
import AircraftIcon from "../icons/AircraftIcon";
import "../../styles/ticket-print.css";

// ── Types ───────────────────────────────────────────────────────────────────

interface SeatAssignment {
  legId: number;
  flightId: number;
  seats: Array<{
    seatNumber: string;
    passengerId: number | null;
  }>;
}

interface FlightTicketProps {
  bookingReference: string;
  passengers: BookingPassengerRow[];
  legs: BookingLegRow[];
  legPassengers: BookingLegPassengerWithDetails[];
  seatAssignments: SeatAssignment[];
  totalAmountGbp: number | null;
  paymentMethod: string | null;
  paymentStatus: string;
  className?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getSeatForPassenger(
  passengerId: number,
  legId: number,
  seatAssignments: SeatAssignment[]
): string | null {
  const seatMap = seatAssignments.find((s) => s.legId === legId);
  if (!seatMap) return null;
  const assignment = seatMap.seats.find(
    (a) => a.passengerId === passengerId
  );
  return assignment?.seatNumber ?? null;
}

function getCheckinStatus(
  passengerId: number,
  legId: number,
  legPassengers: BookingLegPassengerWithDetails[]
): "checked_in" | "boarded" | "not_checked_in" {
  const lp = legPassengers.find(
    (lp) => lp.booking_passenger_id === passengerId && lp.booking_leg_id === legId
  );
  if (!lp) return "not_checked_in";
  if (lp.boarded_at) return "boarded";
  if (lp.checked_in_at) return "checked_in";
  return "not_checked_in";
}

// ── Sub-components ──────────────────────────────────────────────────────────

function PassengerStrip({
  passengers,
}: {
  passengers: BookingPassengerRow[];
}) {
  if (passengers.length === 0) return null;
  const primary = passengers[0];
  const extraCount = passengers.length - 1;

  return (
    <div className="passenger-strip">
      <div className="field">
        <span className="label">Passenger</span>
        <span className="value">
          {primary.first_name} {primary.last_name}
        </span>
      </div>
      {primary.email && (
        <div className="field">
          <span className="label">Email</span>
          <span className="value">{primary.email}</span>
        </div>
      )}
      {primary.date_of_birth && (
        <div className="field">
          <span className="label">Date of Birth</span>
          <span className="value">{formatDate(primary.date_of_birth)}</span>
        </div>
      )}
      {extraCount > 0 && (
        <div className="field">
          <span className="label">Additional Passengers</span>
          <span className="value">+{extraCount} more</span>
        </div>
      )}
    </div>
  );
}

function TicketLeg({
  leg,
  passengers,
  legPassengers,
  seatAssignments,
}: {
  leg: BookingLegRow;
  passengers: BookingPassengerRow[];
  legPassengers: BookingLegPassengerWithDetails[];
  seatAssignments: SeatAssignment[];
}) {
  return (
    <div className="ticket-leg">
      <div className="ticket-leg-route">
        <span className="airport-code">{leg.origin_code}</span>
        <span className="arrow">&rarr;</span>
        <span className="airport-code">{leg.destination_code}</span>
      </div>
      <div className="ticket-leg-details">
        <div className="detail">
          <span className="label">Date</span>
          <span className="value">{formatDate(leg.leg_date)}</span>
        </div>
        {leg.departure_date && (
          <div className="detail">
            <span className="label">Departure</span>
            <span className="value">{formatDate(leg.departure_date)}</span>
          </div>
        )}
        {leg.preferred_time && (
          <div className="detail">
            <span className="label">Time</span>
            <span className="value">{leg.preferred_time}</span>
          </div>
        )}
        <div className="detail">
          <span className="label">Status</span>
          <span className="value">
            {passengers.map((p) => {
              const status = getCheckinStatus(
                p.id,
                leg.id,
                legPassengers
              );
              const seat = getSeatForPassenger(p.id, leg.id, seatAssignments);
              return (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1 mr-2"
                >
                  <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                    {p.first_name}
                  </span>
                  {status === "boarded" && (
                    <span className="ticket-badge ticket-badge--boarded">
                      Boarded
                    </span>
                  )}
                  {status === "checked_in" && (
                    <span className="ticket-badge ticket-badge--checked-in">
                      Checked In
                    </span>
                  )}
                  {status === "not_checked_in" && (
                    <span className="ticket-badge ticket-badge--not-checked-in">
                      Open
                    </span>
                  )}
                  {seat && (
                    <span className="ticket-badge ticket-badge--seat">
                      Seat {seat}
                    </span>
                  )}
                </span>
              );
            })}
          </span>
        </div>
      </div>
    </div>
  );
}

function BarcodeStrip({ reference }: { reference: string }) {
  return (
    <div className="ticket-barcode">
      <BarcodeIcon className="w-10 h-10" />
      <span className="reference">{reference}</span>
    </div>
  );
}

// ── Loading / Empty / Error States ──────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="ticket-skeleton">
      <div className="skeleton-line" />
      <div className="skeleton-line" />
      <div className="skeleton-line" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="ticket-empty">
      <BoardingPassIcon className="w-10 h-10 mx-auto mb-2 fill-slate-300" />
      <p>No ticket data available</p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="ticket-error">
      <p className="font-semibold mb-1">Unable to generate ticket</p>
      <p>{message}</p>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function FlightTicket({
  bookingReference,
  passengers,
  legs,
  legPassengers,
  seatAssignments,
  totalAmountGbp,
  paymentMethod,
  paymentStatus,
  className = "",
}: FlightTicketProps) {
  const [showTicket, setShowTicket] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  const handlePrint = useCallback(() => {
    try {
      setShowTicket(true);
      // Allow React to render the ticket before triggering print
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.print();
        });
      });
    } catch {
      setPrintError("Print dialog could not be opened. Please try again.");
    }
  }, []);

  // ── Validation ──────────────────────────────────────────────────────────
  const hasData = passengers.length > 0 && legs.length > 0;
  const hasError = printError !== null;

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className={className}>
      {/* Print Button (always visible, hidden during print) */}
      <div className="no-print mb-4">
        <button
          type="button"
          onClick={handlePrint}
          disabled={!hasData}
          className="ticket-print-button disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Print flight ticket"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
            />
          </svg>
          Print Ticket
        </button>
      </div>

      {/* Error State */}
      {hasError && <ErrorState message={printError} />}

      {/* Empty State */}
      {!hasData && !hasError && <EmptyState />}

      {/* Loading State (shown briefly while ticket is being prepared) */}
      {showTicket && !hasData && !hasError && <LoadingSkeleton />}

      {/* Ticket Content */}
      {showTicket && hasData && (
        <div className="flight-ticket">
          {/* Header */}
          <div className="ticket-header">
            <div className="ticket-header-brand">
              <AircraftIcon className="w-7 h-7" />
              <h1>FIGAS Flight Ticket</h1>
            </div>
            <div className="ticket-header-reference">
              <span className="label">Booking Reference</span>
              <span className="value">{bookingReference}</span>
            </div>
          </div>

          {/* Body */}
          <div className="ticket-body">
            {/* Passenger Info */}
            <PassengerStrip passengers={passengers} />

            {/* Legs */}
            <div className="ticket-legs">
              {legs.map((leg) => (
                <TicketLeg
                  key={leg.id}
                  leg={leg}
                  passengers={passengers}
                  legPassengers={legPassengers}
                  seatAssignments={seatAssignments}
                />
              ))}
            </div>

            {/* Barcode */}
            <BarcodeStrip reference={bookingReference} />
          </div>

          {/* Payment Summary */}
          {totalAmountGbp != null && (
            <div className="ticket-payment">
              <span>
                {paymentMethod
                  ? `${paymentMethod.replace(/_/g, " ")} — `
                  : ""}
                {paymentStatus.replace(/_/g, " ")} —{" "}
                <span className="total">
                  &pound;{Number(totalAmountGbp).toFixed(2)}
                </span>
              </span>
            </div>
          )}

          {/* Footer */}
          <div className="ticket-footer">
            <span className="disclaimer">
              This is an electronic ticket. Please present this document at
              check-in. FIGAS reserves the right to refuse carriage.
            </span>
            <span>{new Date().toLocaleDateString("en-GB")}</span>
          </div>
        </div>
      )}
    </div>
  );
}
