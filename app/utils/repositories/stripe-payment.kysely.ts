import { kdb } from "../db.server.kysely";
import { sql } from "kysely";

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
  payment?: { booking_id: number } | null;
  created_at: string;
  updated_at: string;
}

function dec(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toRow(r: Record<string, unknown>): StripePaymentRow {
  return {
    id: String(r.id ?? ""),
    payment_id: Number(r.payment_id ?? 0),
    stripe_session_id: String(r.stripe_session_id ?? ""),
    stripe_payment_intent_id: r.stripe_payment_intent_id != null ? String(r.stripe_payment_intent_id) : null,
    stripe_customer_id: r.stripe_customer_id != null ? String(r.stripe_customer_id) : null,
    amount_gbp: dec(r.amount_gbp) ?? 0,
    currency: String(r.currency ?? "GBP"),
    status: String(r.status ?? ""),
    payment_method_details: r.payment_method_details as Record<string, unknown> | null,
    receipt_url: r.receipt_url != null ? String(r.receipt_url) : null,
    refund_amount_gbp: Number(r.refund_amount_gbp ?? 0),
    refunded_at: r.refunded_at != null ? String(r.refunded_at) : null,
    error_message: r.error_message != null ? String(r.error_message) : null,
    idempotency_key: r.idempotency_key != null ? String(r.idempotency_key) : null,
    payment: (r as any).payment_booking_id != null ? { booking_id: Number((r as any).payment_booking_id) } : undefined,
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
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
    const rows = await kdb
      .insertInto("stripe_payments")
      .values({
        payment_id: params.payment_id,
        stripe_session_id: params.stripe_session_id,
        stripe_payment_intent_id: params.stripe_payment_intent_id || undefined,
        stripe_customer_id: params.stripe_customer_id || undefined,
        amount_gbp: String(params.amount_gbp),
        currency: params.currency || "GBP",
        status: params.status ?? "pending",
        idempotency_key: params.idempotency_key || undefined,
      } as any)
      .returningAll()
      .execute();
    return toRow(rows[0] as unknown as Record<string, unknown>);
  },

  async findBySessionId(sessionId: string): Promise<StripePaymentRow | null> {
    const rows = await kdb
      .selectFrom("stripe_payments as sp")
      .leftJoin("payments as p", "p.id", "sp.payment_id")
      .selectAll("sp")
      .select("p.booking_id as payment_booking_id")
      .where("sp.stripe_session_id", "=", sessionId)
      .execute();
    return rows.length > 0 ? toRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async findByPaymentIntentId(paymentIntentId: string): Promise<StripePaymentRow | null> {
    const rows = await kdb
      .selectFrom("stripe_payments as sp")
      .leftJoin("payments as p", "p.id", "sp.payment_id")
      .selectAll("sp")
      .select("p.booking_id as payment_booking_id")
      .where("sp.stripe_payment_intent_id", "=", paymentIntentId)
      .execute();
    return rows.length > 0 ? toRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async findByPaymentId(paymentId: number): Promise<StripePaymentRow | null> {
    const rows = await kdb
      .selectFrom("stripe_payments")
      .selectAll()
      .where("payment_id", "=", paymentId)
      .execute();
    return rows.length > 0 ? toRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async findByBookingId(bookingId: number): Promise<StripePaymentRow | null> {
    const rows = await kdb
      .selectFrom("stripe_payments as sp")
      .innerJoin("payments as p", "p.id", "sp.payment_id")
      .selectAll("sp")
      .select("p.booking_id as payment_booking_id")
      .where("p.booking_id", "=", bookingId)
      .orderBy("sp.created_at desc")
      .execute();
    return rows.length > 0 ? toRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async updateStatus(id: string, status: string, paymentIntentId?: string): Promise<StripePaymentRow | null> {
    const setData: Record<string, unknown> = { status };
    if (paymentIntentId) setData.stripe_payment_intent_id = paymentIntentId;
    const rows = await kdb
      .updateTable("stripe_payments")
      .set(setData as any)
      .where("id", "=", id)
      .returningAll()
      .execute();
    return rows.length > 0 ? toRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async updateRefund(id: string, refundAmount: number): Promise<StripePaymentRow | null> {
    const rows = await kdb
      .updateTable("stripe_payments")
      .set({ refund_amount_gbp: String(refundAmount), refunded_at: sql`NOW()` } as any)
      .where("id", "=", id)
      .returningAll()
      .execute();
    return rows.length > 0 ? toRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async atomicClaimProcessing(sessionId: string): Promise<boolean> {
    const result = await kdb
      .updateTable("stripe_payments")
      .set({ status: "processing" } as any)
      .where("stripe_session_id", "=", sessionId)
      .where("status", "=", "pending")
      .execute();
    // Kysely execute() on updateTable returns UpdateResult[]; count via numUpdatedRows
    return (result as unknown as Array<{ numUpdatedRows: bigint | number }>)?.[0]?.numUpdatedRows > 0;
  },
};
