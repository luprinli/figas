import type { BookingLegRow } from "../repositories/booking-leg";
import type { BookingPassengerRow } from "../repositories/booking-passenger";
import type { BookingLegPassengerWithDetails } from "../repositories/booking-leg-passenger";
import { fareRouteRepository } from "../repositories/fare-route";
import type { FareLineItem, FareCalculationResult } from "./fare-calculator";
import { DEFAULT_FARE_PER_PASSENGER, FREIGHT_RATE_PER_KG } from "../constants";

// ── Fare Calculator ───────────────────────────────────────────────────────────

/**
 * Calculate a detailed cost breakdown for a booking.
 * Returns line items grouped by type (fare per leg, freight, etc.)
 * along with subtotals and grand total.
 */
export async function calculateFareBreakdown(
  legs: BookingLegRow[],
  passengers: BookingPassengerRow[],
  legPassengers: BookingLegPassengerWithDetails[]
): Promise<FareCalculationResult> {
  const passengerCount = Math.max(passengers.length, 1);
  const lineItems: FareLineItem[] = [];
  let freightTotal = 0;

  for (const leg of legs) {
    // Look up base fare for this route
    const baseFare = await fareRouteRepository.getBaseFare(
      leg.origin_code,
      leg.destination_code
    );
    const farePerPassenger = baseFare ?? DEFAULT_FARE_PER_PASSENGER;
    const legFareTotal = farePerPassenger * passengerCount;

    lineItems.push({
      label: `Leg ${leg.leg_sequence}: ${leg.origin_code} \u2192 ${leg.destination_code}`,
      amount: legFareTotal,
      type: "fare",
      legSequence: leg.leg_sequence,
      origin: leg.origin_code,
      destination: leg.destination_code,
    });

    // Calculate freight for this leg
    const legFreight = legPassengers.filter(
      (lp) =>
        lp.booking_leg_id === leg.id &&
        (lp.freight_description || (lp.freight_weight_kg ?? 0) > 0)
    );

    for (const lp of legFreight) {
      if ((lp.freight_weight_kg ?? 0) > 0) {
        const freightCost = (lp.freight_weight_kg ?? 0) * FREIGHT_RATE_PER_KG;
        freightTotal += freightCost;
        lineItems.push({
          label: `Freight (${lp.freight_weight_kg}kg) — Leg ${leg.leg_sequence}`,
          amount: freightCost,
          type: "freight",
          legSequence: leg.leg_sequence,
        });
      }
    }
  }

  const subtotal = lineItems
    .filter((item) => item.type === "fare")
    .reduce((sum, item) => sum + item.amount, 0);

  const total = subtotal + freightTotal;

  return {
    lineItems,
    subtotal,
    freightTotal,
    total,
    passengerCount,
    legCount: legs.length,
  };
}

/**
 * Calculate a simple total cost (non-detailed, for quick display).
 * Delegates to calculateFareBreakdown and returns just the total.
 */
export async function calculateSimpleTotal(
  legs: BookingLegRow[],
  passengers: BookingPassengerRow[],
  legPassengers: BookingLegPassengerWithDetails[]
): Promise<number> {
  const result = await calculateFareBreakdown(legs, passengers, legPassengers);
  return result.total;
}
