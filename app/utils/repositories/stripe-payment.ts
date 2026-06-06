import { db } from "../db.server";
import type { StripePaymentStatus } from "../../../generated/prisma/client";

export interface StripePaymentRow {
  id: string;
  payment_id: number;
  stripe_session_id: string;
  stripe_payment_intent_id: string | null;
  stripe_customer_id: string | null;
  amount_gbp: number;
  currency: string;
  status: string;
  payment_method_details: Record<string, unknown> | null;
  receipt_url: string | null;
  refund_amount_gbp: number;
  refunded_at: string | null;
  error_message: string | null;
  idempotency_key: string | null;
  /** Only populated when relation is included via include: { payment: ... } */
  payment?: { booking_id: number } | null;
  created_at: string;
  updated_at: string;
}

export const stripePaymentRepository = {
  async create(params: {
    payment_id: number;
    stripe_session_id: string;
    stripe_payment_intent_id?: string;
    stripe_customer_id?: string;
    amount_gbp: number;
    currency?: string;
    status?: string;
    idempotency_key?: string;
  }): Promise<StripePaymentRow> {
    return db.stripe_payments.create({
      data: {
        payment_id: params.payment_id,
        stripe_session_id: params.stripe_session_id,
        stripe_payment_intent_id: params.stripe_payment_intent_id || null,
        stripe_customer_id: params.stripe_customer_id || null,
        amount_gbp: params.amount_gbp,
        currency: params.currency || "GBP",
        status: (params.status ?? "pending") as StripePaymentStatus,
        idempotency_key: params.idempotency_key || null,
      },
    }) as unknown as StripePaymentRow;
  },

  async findBySessionId(sessionId: string): Promise<StripePaymentRow | null> {
    return db.stripe_payments.findUnique({
      where: { stripe_session_id: sessionId },
      include: {
        payment: { select: { booking_id: true } },
      },
    }) as unknown as StripePaymentRow | null;
  },

  async findByPaymentIntentId(paymentIntentId: string): Promise<StripePaymentRow | null> {
    return db.stripe_payments.findFirst({
      where: { stripe_payment_intent_id: paymentIntentId },
      include: {
        payment: { select: { booking_id: true } },
      },
    }) as unknown as StripePaymentRow | null;
  },

  async findByPaymentId(paymentId: number): Promise<StripePaymentRow | null> {
    return db.stripe_payments.findFirst({
      where: { payment_id: paymentId },
    }) as unknown as StripePaymentRow | null;
  },

  async findByBookingId(bookingId: number): Promise<StripePaymentRow | null> {
    // booking_id is not a direct column on stripe_payments; join through payments table
    const result = await db.stripe_payments.findFirst({
      where: {
        payment: {
          booking_id: bookingId,
        },
      },
      orderBy: { created_at: "desc" },
    });
    return result as unknown as StripePaymentRow | null;
  },

  async updateStatus(id: string, status: string, paymentIntentId?: string): Promise<StripePaymentRow | null> {
    const data: Record<string, unknown> = {
      status: status as StripePaymentStatus,
    };
    if (paymentIntentId) {
      data.stripe_payment_intent_id = paymentIntentId;
    }
    return db.stripe_payments.update({
      where: { id },
      data,
    }) as unknown as StripePaymentRow | null;
  },

  async updateRefund(id: string, refundAmount: number): Promise<StripePaymentRow | null> {
    return db.stripe_payments.update({
      where: { id },
      data: {
        refund_amount_gbp: refundAmount,
        refunded_at: new Date(),
      },
    }) as unknown as StripePaymentRow | null;
  },

  /**
   * Atomically claim a stripe_payments record for processing.
   * Only succeeds if the current status is 'pending' (not already being processed or succeeded).
   * Prevents concurrent webhook deliveries from double-processing the same session.
   */
  async atomicClaimProcessing(sessionId: string): Promise<boolean> {
    const result = await db.stripe_payments.updateMany({
      where: {
        stripe_session_id: sessionId,
        status: "pending",
      },
      data: {
        status: "processing" as StripePaymentStatus,
      },
    });
    return result.count > 0;
  },
};
