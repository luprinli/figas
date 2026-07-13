import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { bookingRepository } from "../utils/repositories/booking";
import { bookingLegRepository } from "../utils/repositories/booking-leg";
import { bookingPassengerRepository } from "../utils/repositories/booking-passenger";
import { bookingLegPassengerRepository } from "../utils/repositories/booking-leg-passenger";
import { stripePaymentRepository } from "../utils/repositories/stripe-payment";
import { getUserId } from "../utils/auth.server";
import { validateCsrfRequest } from "../utils/csrf-check.server";
import { BookingStatus, PaymentMethod, PaymentStatus } from "../utils/constants";
import type { BookingLegRow } from "../utils/repositories/booking-leg";
import type { BookingPassengerRow } from "../utils/repositories/booking-passenger";
import type { BookingLegPassengerWithDetails } from "../utils/repositories/booking-leg-passenger";
import { calculateFareBreakdown } from "../utils/services/fare-calculator.server";
import { initiateStripePayment, recordInvoiceSelection } from "../utils/services/payment.service";

// Simplified transitions: only completed and cancelled are terminal states.
// All non-terminal statuses can transition to completed or cancelled.
export const VALID_TRANSITIONS: Record<string, string[]> = {
  [BookingStatus.PENDING]: [BookingStatus.PASSENGERS_ADDED, BookingStatus.CANCELLED],
  [BookingStatus.PASSENGERS_ADDED]: [BookingStatus.WEIGHT_DECLARED, BookingStatus.CANCELLED],
  [BookingStatus.WEIGHT_DECLARED]: [BookingStatus.FREIGHT_DECLARED, BookingStatus.CANCELLED],
  [BookingStatus.FREIGHT_DECLARED]: [BookingStatus.FLIGHT_ASSIGNED, BookingStatus.CANCELLED],
  [BookingStatus.FLIGHT_ASSIGNED]: [BookingStatus.PILOT_REVIEW, BookingStatus.CANCELLED],
  [BookingStatus.PILOT_REVIEW]: [BookingStatus.APPROVED, BookingStatus.CANCELLED],
  [BookingStatus.APPROVED]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
  [BookingStatus.COMPLETED]: [],
  [BookingStatus.CANCELLED]: [],
};

export async function action({ request, params }: ActionFunctionArgs) {
  const bookingId = Number(params.bookingId);
  if (isNaN(bookingId)) {
    return json({ error: "Invalid booking ID" }, { status: 400 });
  }

  const formData = await request.formData();

  if (!(await validateCsrfRequest(request, formData))) {
    return json({ error: "CSRF token validation failed" }, { status: 403 });
  }

  const intent = formData.get("intent");

  if (intent === "update_status") {
    const newStatus = formData.get("status") as string;
    const booking = await bookingRepository.findById(bookingId);
    if (!booking) {
      return json({ error: "Booking not found" }, { status: 404 });
    }

    const allowed = VALID_TRANSITIONS[booking.status] ?? [];
    if (!allowed.includes(newStatus)) {
      return json(
        {
          error: `Cannot transition from "${booking.status.replace(/_/g, " ")}" to "${newStatus.replace(/_/g, " ")}".`,
        },
        { status: 400 }
      );
    }

    await bookingRepository.updateStatus(bookingId, newStatus);
    return json({ success: true, newStatus });
  }

  if (intent === "cancel") {
    const reason = formData.get("cancellation_reason") as string;
    const userId = await getUserId(request);
    await bookingRepository.cancel(bookingId, Number(userId), reason || undefined);
    return json({ success: true, newStatus: BookingStatus.CANCELLED });
  }

  // ── Payment intents ──────────────────────────────────────────────────────

  if (intent === "initiate_stripe") {
    const amount = Number(formData.get("amount"));
    if (isNaN(amount) || amount <= 0) {
      return json({ success: false, error: "Invalid payment amount" }, { status: 400 });
    }

    const userId = await getUserId(request);
    const url = new URL(request.url);
    const result = await initiateStripePayment({
      bookingId,
      amount,
      successUrl: `${url.origin}/operations/bookings/${bookingId}/payment-success`,
      cancelUrl: `${url.origin}/operations/bookings/${bookingId}/payment-cancel`,
      userId: Number(userId),
    });

    if (!result.success) {
      return json({ success: false, error: result.error ?? "Stripe payment initiation failed" }, { status: 500 });
    }

    return json({ success: true, stripeSessionUrl: result.stripeSessionUrl });
  }

  if (intent === "generate_invoice") {
    const userId = await getUserId(request);

    // Load legs and passengers to build line items
    const legs = await bookingLegRepository.findByBookingId(bookingId).catch((err) => {
      console.error("Failed to load legs for invoice:", err);
      return [] as BookingLegRow[];
    });
    const passengers = await bookingPassengerRepository.findByBookingId(bookingId).catch((err) => {
      console.error("Failed to load passengers for invoice:", err);
      return [] as BookingPassengerRow[];
    });

    // Load freight data from booking_leg_passengers (freight moved from booking_legs in migration 016)
    const { bookingLegPassengerRepository } = await import("../utils/repositories/booking-leg-passenger");
    const legPassengers = await bookingLegPassengerRepository.findByBookingId(bookingId).catch((err) => {
      console.error("Failed to load leg passengers for invoice:", err);
      return [] as Awaited<ReturnType<typeof bookingLegPassengerRepository.findByBookingId>>;
    });

    // Build line items matching the same logic as generateInvoice
    const lineItems: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      type: string;
    }> = [];

    for (const passenger of passengers) {
      let farePerPassenger = 50;
      if (legs.length > 0) {
        const { fareRouteRepository } = await import("../utils/repositories/fare-route");
        const baseFare = await fareRouteRepository.getBaseFare(
          legs[0].origin_code,
          legs[0].destination_code
        );
        if (baseFare !== null) {
          farePerPassenger = baseFare;
        }
      }

      lineItems.push({
        description: `Fare — ${passenger.first_name} ${passenger.last_name}`,
        quantity: 1,
        unitPrice: farePerPassenger,
        type: "fare",
      });
    }

    // Freight line items per leg (from booking_leg_passengers)
    for (const leg of legs) {
      const legFreightTotal = legPassengers
        .filter((lp) => lp.booking_leg_id === leg.id)
        .reduce((sum, lp) => sum + (lp.freight_weight_kg ?? 0), 0);

      if (legFreightTotal > 0) {
        lineItems.push({
          description: `Freight — ${leg.origin_code} \u2192 ${leg.destination_code} (${legFreightTotal}kg)`,
          quantity: 1,
          unitPrice: legFreightTotal * 2,
          type: "freight",
        });
      }
    }

    const result = await recordInvoiceSelection({
      bookingId,
      userId: Number(userId),
      lineItems,
    });

    if (!result.success) {
      return json({ success: false, error: result.error ?? "Invoice generation failed" }, { status: 500 });
    }

    return json({ success: true, invoiceId: result.invoiceId });
  }

  if (intent === "set_pay_on_departure") {
    // Validate that the payment method exists in the database
    const { paymentMethodRepository } = await import("../utils/repositories/payment-method");
    const method = await paymentMethodRepository.findByCode(PaymentMethod.PAY_ON_DEPARTURE);
    if (!method) {
      return json({ success: false, error: "Pay on departure is not available as a payment method" }, { status: 400 });
    }

    await bookingRepository.updatePayment(bookingId, {
      payment_method: PaymentMethod.PAY_ON_DEPARTURE,
      payment_status: PaymentStatus.PENDING,
    });

    return json({ success: true });
  }

  if (intent === "post_booking_change") {
    const action = formData.get("change_action") as string;

    // Recalculate the current fare
    const legs = await bookingLegRepository.findByBookingId(bookingId).catch((err) => {
      console.error("Failed to load legs for post-booking change:", err);
      return [] as BookingLegRow[];
    });
    const passengers = await bookingPassengerRepository.findByBookingId(bookingId).catch((err) => {
      console.error("Failed to load passengers for post-booking change:", err);
      return [] as BookingPassengerRow[];
    });
    const legPassengers = await bookingLegPassengerRepository.findByBookingId(bookingId).catch((err) => {
      console.error("Failed to load leg passengers for post-booking change:", err);
      return [] as BookingLegPassengerWithDetails[];
    });
    const newFareBreakdown = await calculateFareBreakdown(legs, passengers, legPassengers).catch((err) => {
      console.error("Failed to recalculate fare:", err);
      return null;
    });

    if (!newFareBreakdown) {
      return json({ success: false, error: "Failed to recalculate fare" }, { status: 500 });
    }

    const storedTotal = Number(formData.get("stored_total") ?? 0);
    const difference = newFareBreakdown.total - storedTotal;

    if (action === "refund" && difference < 0) {
      const refundAmount = Math.abs(difference);

      // If the booking was paid via Stripe, process a Stripe refund
      const booking = await bookingRepository.findById(bookingId);
      if (booking?.payment_method === PaymentMethod.STRIPE) {
        try {
          const stripePayment = await stripePaymentRepository.findByBookingId(bookingId);
          if (stripePayment?.stripe_payment_intent_id) {
            const { getStripe } = await import("../utils/stripe.server");
            await getStripe().refunds.create({
              payment_intent: stripePayment.stripe_payment_intent_id,
              amount: Math.round(refundAmount * 100), // Convert to pence
            });
            await stripePaymentRepository.updateRefund(stripePayment.id, refundAmount);
          }
        } catch (stripeError) {
          console.error("Stripe refund failed:", stripeError);
          // Continue with booking update even if Stripe refund fails
        }
      }

      // Update booking total and status
      await bookingRepository.updatePayment(bookingId, {
        total_amount_gbp: newFareBreakdown.total,
        payment_status: PaymentStatus.PARTIALLY_REFUNDED,
      });
      return json({ success: true, refundAmount, newTotal: newFareBreakdown.total });
    }

    if (action === "top_up" && difference > 0) {
      // Top-up required
      await bookingRepository.updatePayment(bookingId, {
        total_amount_gbp: newFareBreakdown.total,
        payment_status: PaymentStatus.PARTIALLY_PAID,
      });
      return json({ success: true, topUpAmount: difference, newTotal: newFareBreakdown.total });
    }

    // No adjustment needed — just update the stored total
    await bookingRepository.updatePayment(bookingId, {
      total_amount_gbp: newFareBreakdown.total,
    });
    return json({ success: true, newTotal: newFareBreakdown.total });
  }

  return json({ error: "Unknown action" }, { status: 400 });
}
