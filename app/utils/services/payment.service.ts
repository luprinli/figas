import { getStripe } from "../stripe.server";
import { kdb } from "../db.server.kysely";
import { sql } from "kysely";
import { bookingRepository } from "../repositories/booking";
import { bookingPassengerRepository } from "../repositories/booking-passenger";
import { paymentMethodRepository } from "../repositories/payment-method";
import { invoiceRepository } from "../repositories/invoice";
import { invoiceItemRepository } from "../repositories/invoice-item";
import { accountingEntryRepository, resolveAccountId } from "../repositories/accounting-entry";
import { stripePaymentRepository } from "../repositories/stripe-payment";
import {
  PaymentMethod,
  PaymentStatus,
  InvoiceStatus,
  AccountingEntryType,
  DEFAULT_FARE_PER_PASSENGER,
  FREIGHT_RATE_PER_KG,
} from "../constants";

export interface PaymentInitiationResult {
  success: boolean;
  paymentId?: string;
  stripeSessionUrl?: string;
  invoiceId?: string;
  error?: string;
}

import { bookingLegRepository } from "../repositories/booking-leg";
import { bookingLegPassengerRepository } from "../repositories/booking-leg-passenger";
import { fareRouteRepository } from "../repositories/fare-route";

// ── Fare defaults (imported from constants) ───────────────────────────────
// See app/utils/constants.ts for DEFAULT_FARE_PER_PASSENGER and FREIGHT_RATE_PER_KG

/**
 * Calculate the total cost for a booking based on its legs and passengers.
 * Uses the fare_route table to look up base fares per leg, multiplied by
 * the number of passengers. Falls back to a default per-passenger rate
 * when no fare route is configured.
 */
export async function calculateBookingCost(bookingId: number): Promise<number> {
  try {
    const [legs, passengers] = await Promise.all([
      bookingLegRepository.findByBookingId(bookingId),
      bookingPassengerRepository.findByBookingId(bookingId),
    ]);

    const passengerCount = Math.max(passengers.length, 1);

    let totalCost = 0;

    // Load freight data from booking_leg_passengers (freight moved from booking_legs in migration 016)
    const legPassengers = await bookingLegPassengerRepository.findByBookingId(bookingId);

    for (const leg of legs) {
      const baseFare = await fareRouteRepository.getBaseFare(
        leg.origin_code,
        leg.destination_code
      );

      const farePerPassenger = baseFare ?? DEFAULT_FARE_PER_PASSENGER;
      totalCost += farePerPassenger * passengerCount;

      // Add freight cost if applicable (from booking_leg_passengers)
      const legFreightTotal = legPassengers
        .filter((lp) => lp.booking_leg_id === leg.id)
        .reduce((sum, lp) => sum + (lp.freight_weight_kg ?? 0), 0);

      if (legFreightTotal > 0) {
        totalCost += legFreightTotal * FREIGHT_RATE_PER_KG; // £2/kg placeholder freight rate
      }
    }

    return totalCost;
  } catch (error) {
    console.error("Failed to calculate booking cost:", error);
    throw new Error("Unable to calculate booking cost. Please try again or contact support.");
  }
}

/**
 * Get available payment methods for a booking.
 * Returns methods based on booking context (online vs offline, organization vs individual).
 */
export async function getAvailableMethods(): Promise<
  Array<{ code: string; name: string; description: string | null }>
> {
  const methods = await paymentMethodRepository.findAll();
  return methods.map((m) => ({
    code: m.code,
    name: m.name,
    description: m.description,
  }));
}

/**
 * Initiate a Stripe Checkout session for a booking.
 */
export async function initiateStripePayment(params: {
  bookingId: number;
  amount: number;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
  userId: number;
}): Promise<PaymentInitiationResult> {
  try {
    // Update the booking record with payment info
    await bookingRepository.updatePayment(params.bookingId, {
      total_amount_gbp: params.amount,
      payment_status: PaymentStatus.PROCESSING,
      payment_method: PaymentMethod.STRIPE,
    });

    // Create the parent payments record first — stripe_payments.payment_id
    // is an FK to payments.id (auto-increment integer), so we must create
    // the payments row before the stripe_payments row.
    const paymentRows = await kdb.insertInto("payments")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .values({
        booking_id: params.bookingId,
        amount: String(params.amount),
        amount_gbp: String(params.amount),
        method: PaymentMethod.STRIPE,
        status: PaymentStatus.PROCESSING,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .returningAll()
      .execute();
    const payment = paymentRows[0] as unknown as { id: number };

    // Create Stripe Checkout Session with idempotency key
    const idempotencyKey = `booking_${params.bookingId}_${Date.now()}`;
    const session = await getStripe().checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `FIGAS Booking #${params.bookingId}`,
              description: "Flight booking payment",
            },
            unit_amount: Math.round(params.amount * 100), // Convert to pence
          },
          quantity: 1,
        },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      customer_email: params.customerEmail,
      metadata: {
        booking_id: String(params.bookingId),
        payment_id: String(payment.id),
        ...params.metadata,
      },
    }, {
      idempotencyKey,
    });

    // Store Stripe session info linked to the parent payments record
    try {
      await stripePaymentRepository.create({
        payment_id: payment.id,
        stripe_session_id: session.id,
        amount_gbp: params.amount,
        idempotency_key: idempotencyKey,
      });
    } catch (dbError) {
      // Rollback: Stripe session was created but DB record failed — reset booking status
      console.error("Failed to store stripe payment record, rolling back booking status:", dbError);
      await bookingRepository.updatePayment(params.bookingId, {
        payment_status: PaymentStatus.PENDING,
      }).catch((rollbackErr) => {
        console.error("Failed to rollback booking payment status:", rollbackErr);
      });
      return {
        success: false,
        error: "Payment record could not be saved. Please try again.",
      };
    }

    return {
      success: true,
      paymentId: String(payment.id),
      stripeSessionUrl: session.url ?? undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Handle successful Stripe payment (called from webhook or success page).
 */
export async function handleStripeSuccess(params: {
  sessionId: string;
  paymentIntentId: string;
  userId: number;
}): Promise<PaymentInitiationResult> {
  try {
    const stripePayment = await stripePaymentRepository.findBySessionId(
      params.sessionId
    );
    if (!stripePayment) {
      return { success: false, error: "Stripe payment record not found" };
    }

    // Update Stripe payment status
    await stripePaymentRepository.updateStatus(
      stripePayment.id,
      "succeeded",
      params.paymentIntentId
    );

    // Update the associated booking's payment status to PAID
    // booking_id is on the parent payments table, accessed via the payment relation
    if (stripePayment.payment?.booking_id) {
      await bookingRepository.updatePayment(stripePayment.payment.booking_id, {
        payment_status: PaymentStatus.PAID,
      });
    }

    // Create accounting journal entry for the payment
    const entry = await accountingEntryRepository.createEntry({
      entry_number: `STR-${Date.now()}`,
      entry_type: AccountingEntryType.PAYMENT,
      description: `Stripe payment received — session ${params.sessionId}`,
      payment_id: String(stripePayment.payment_id),
      entry_date: new Date().toISOString().split("T")[0],
      created_by: String(params.userId),
    });

    // Resolve chart of accounts UUIDs
    const accountsReceivableId = await resolveAccountId("1020");
    const passengerFareRevenueId = await resolveAccountId("4010");

    // Create debit line (Accounts Receivable)
    await accountingEntryRepository.createLine({
      entry_id: entry.id,
      account_id: accountsReceivableId,
      debit_amount_gbp: stripePayment.amount_gbp,
      description: "Stripe payment received",
    });

    // Create credit line (Passenger Fare Revenue)
    await accountingEntryRepository.createLine({
      entry_id: entry.id,
      account_id: passengerFareRevenueId,
      credit_amount_gbp: stripePayment.amount_gbp,
      description: "Flight booking revenue",
    });

    // Auto-reconcile: Stripe is the source of truth for card payments
    await sql`
      UPDATE payments SET reconciled_at = NOW(), reconciled_by = ${params.userId} WHERE id = ${stripePayment.payment_id}
    `.execute(kdb);

    return { success: true, paymentId: String(stripePayment.payment_id) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Record a pay-on-departure or pay-on-arrival selection.
 */
export async function recordOfflinePaymentSelection(params: {
  bookingId: number;
  methodCode: string;
  userId: number;
}): Promise<PaymentInitiationResult> {
  try {
    const method = await paymentMethodRepository.findByCode(params.methodCode);
    if (!method) {
      return {
        success: false,
        error: `Payment method "${params.methodCode}" not found`,
      };
    }

    // Update booking with selected payment method
    await bookingRepository.updatePayment(params.bookingId, {
      payment_method: params.methodCode,
      payment_status: PaymentStatus.PENDING,
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Record an invoice payment method selection and generate invoice.
 */
export async function recordInvoiceSelection(params: {
  bookingId: number;
  organizationId?: number;
  userId: number;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    type: string;
  }>;
}): Promise<PaymentInitiationResult> {
  try {
    // Generate invoice number
    const invoiceNumber = await invoiceRepository.generateNumber();

    // Calculate totals
    const subtotal = params.lineItems.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0
    );
    const taxRate = 0; // Falkland Islands — no VAT
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    // Create invoice
    const invoice = await invoiceRepository.create({
      invoice_number: invoiceNumber,
      booking_id: String(params.bookingId),
      organization_id: params.organizationId
        ? String(params.organizationId)
        : undefined,
      user_id: String(params.userId),
      status: InvoiceStatus.DRAFT,
      issue_date: new Date().toISOString().split("T")[0],
      due_date: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      )
        .toISOString()
        .split("T")[0], // 30 days
      subtotal_gbp: subtotal,
      tax_rate: taxRate,
      tax_amount_gbp: taxAmount,
      total_gbp: total,
      created_by: String(params.userId),
    });

    // Create invoice line items
    for (let i = 0; i < params.lineItems.length; i++) {
      const item = params.lineItems[i];
      await invoiceItemRepository.create({
        invoice_id: invoice.id,
        description: item.description,
        quantity: item.quantity,
        unit_price_gbp: item.unitPrice,
        type: item.type,
        sort_order: i,
      });
    }

    // Update booking payment status to invoiced
    await bookingRepository.updatePayment(params.bookingId, {
      payment_method: PaymentMethod.INVOICE,
      payment_status: PaymentStatus.INVOICED,
    });

    return { success: true, invoiceId: invoice.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Record a manual payment (cash, bank transfer, etc.).
 */
export async function recordManualPayment(params: {
  bookingId: number;
  amount: number;
  methodCode: string;
  notes?: string;
  userId: number;
}): Promise<PaymentInitiationResult> {
  try {
    await bookingRepository.updatePayment(params.bookingId, {
      total_amount_gbp: params.amount,
      payment_status: PaymentStatus.PAID,
      payment_method: params.methodCode,
    });

    // Create accounting journal entry for the manual payment
    const entry = await accountingEntryRepository.createEntry({
      entry_number: `MAN-${Date.now()}`,
      entry_type: AccountingEntryType.PAYMENT,
      description: params.notes ?? `Manual payment via ${params.methodCode}`,
      booking_id: String(params.bookingId),
      entry_date: new Date().toISOString().split("T")[0],
      created_by: String(params.userId),
    });

    // Resolve chart of accounts UUIDs
    const cashAtBankId = await resolveAccountId("1010");
    const passengerFareRevenueId = await resolveAccountId("4010");

    // Create debit line (Cash at Bank)
    await accountingEntryRepository.createLine({
      entry_id: entry.id,
      account_id: cashAtBankId,
      debit_amount_gbp: params.amount,
      description: params.notes ?? `Payment via ${params.methodCode}`,
    });

    // Create credit line (Passenger Fare Revenue)
    await accountingEntryRepository.createLine({
      entry_id: entry.id,
      account_id: passengerFareRevenueId,
      credit_amount_gbp: params.amount,
      description: "Flight booking revenue",
    });

    return { success: true, paymentId: entry.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}
