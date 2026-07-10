import { kdb } from "../db.server";

export interface PaymentReminderRow {
  id: string;
  booking_id: string | null;
  invoice_id: string | null;
  reminder_type: string;
  scheduled_at: string;
  sent_at: string | null;
  sent_to: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

function toRow(r: Record<string, unknown>): PaymentReminderRow {
  return {
    id: String(r.id ?? ""),
    booking_id: r.booking_id != null ? String(r.booking_id) : null,
    invoice_id: r.invoice_id != null ? String(r.invoice_id) : null,
    reminder_type: String(r.reminder_type ?? ""),
    scheduled_at: String(r.scheduled_at ?? ""),
    sent_at: r.sent_at != null ? String(r.sent_at) : null,
    sent_to: r.sent_to != null ? String(r.sent_to) : null,
    status: String(r.status ?? ""),
    error_message: r.error_message != null ? String(r.error_message) : null,
    created_at: String(r.created_at ?? ""),
  };
}

export const paymentReminderRepository = {
  async create(params: {
    booking_id?: string;
    invoice_id?: string;
    reminder_type: string;
    scheduled_at: string;
    sent_to?: string;
  }): Promise<PaymentReminderRow> {
    const rows = await kdb
      .insertInto("payment_reminders")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .values({
        booking_id: params.booking_id ? parseInt(params.booking_id, 10) : undefined,
        invoice_id: params.invoice_id || undefined,
        reminder_type: params.reminder_type,
        scheduled_at: new Date(params.scheduled_at),
        sent_to: params.sent_to || undefined,
      } as any)
      .returningAll()
      .execute();
    return toRow(rows[0] as unknown as Record<string, unknown>);
  },

  async findPending(): Promise<PaymentReminderRow[]> {
    const rows = await kdb
      .selectFrom("payment_reminders")
      .selectAll()
      .where("status", "=", "pending")
      .where("scheduled_at", "<=", new Date().toISOString())
      .orderBy("scheduled_at asc")
      .execute();
    return rows.map((r) => toRow(r as unknown as Record<string, unknown>));
  },

  async markSent(id: string, sentTo: string): Promise<PaymentReminderRow | null> {
    const rows = await kdb
      .updateTable("payment_reminders")
      .set({ status: "sent", sent_at: new Date(), sent_to: sentTo } as any)
      .where("id", "=", id)
      .returningAll()
      .execute();
    return rows.length > 0 ? toRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async markFailed(id: string, errorMessage: string): Promise<PaymentReminderRow | null> {
    const rows = await kdb
      .updateTable("payment_reminders")
      .set({ status: "failed", error_message: errorMessage } as any)
      .where("id", "=", id)
      .returningAll()
      .execute();
    return rows.length > 0 ? toRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async findByBooking(bookingId: string): Promise<PaymentReminderRow[]> {
    const rows = await kdb
      .selectFrom("payment_reminders")
      .selectAll()
      .where("booking_id", "=", parseInt(bookingId, 10))
      .orderBy("created_at desc")
      .execute();
    return rows.map((r) => toRow(r as unknown as Record<string, unknown>));
  },
};
