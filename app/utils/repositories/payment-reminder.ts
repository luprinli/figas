import { db } from "../db.server";
import type { PaymentReminderType, ReminderStatus } from "../../../generated/prisma/client";

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

export const paymentReminderRepository = {
  async create(params: {
    booking_id?: string;
    invoice_id?: string;
    reminder_type: string;
    scheduled_at: string;
    sent_to?: string;
  }): Promise<PaymentReminderRow> {
    return db.payment_reminders.create({
      data: {
        booking_id: params.booking_id ? parseInt(params.booking_id, 10) : null,
        invoice_id: params.invoice_id || null,
        reminder_type: params.reminder_type as PaymentReminderType,
        scheduled_at: new Date(params.scheduled_at),
        sent_to: params.sent_to || null,
      },
    }) as unknown as PaymentReminderRow;
  },

  async findPending(): Promise<PaymentReminderRow[]> {
    return db.payment_reminders.findMany({
      where: {
        status: "pending",
        scheduled_at: { lte: new Date() },
      },
      orderBy: { scheduled_at: "asc" },
    }) as unknown as PaymentReminderRow[];
  },

  async markSent(id: string, sentTo: string): Promise<PaymentReminderRow | null> {
    return db.payment_reminders.update({
      where: { id },
      data: {
        status: "sent" as ReminderStatus,
        sent_at: new Date(),
        sent_to: sentTo,
      },
    }) as unknown as PaymentReminderRow | null;
  },

  async markFailed(id: string, errorMessage: string): Promise<PaymentReminderRow | null> {
    return db.payment_reminders.update({
      where: { id },
      data: {
        status: "failed" as ReminderStatus,
        error_message: errorMessage,
      },
    }) as unknown as PaymentReminderRow | null;
  },

  async findByBooking(bookingId: string): Promise<PaymentReminderRow[]> {
    return db.payment_reminders.findMany({
      where: { booking_id: parseInt(bookingId, 10) },
      orderBy: { created_at: "desc" },
    }) as unknown as PaymentReminderRow[];
  },
};
