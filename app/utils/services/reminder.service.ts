import { kdb } from "../db.server.kysely";
import { sql } from "kysely";
import { paymentReminderRepository } from "../repositories/payment-reminder";
import { sendEmailQuiet } from "../email.server";
import { paymentReminderEmail } from "../../emails/notifications";

export interface ScheduleReminderParams {
  bookingId: string;
  invoiceId?: string;
  reminderType: string;
  scheduledAt: string;
}

export interface GetRemindersForBookingParams {
  bookingId: string;
}

export interface CancelRemindersForBookingParams {
  bookingId: string;
}

export interface ReminderResult {
  success: boolean;
  reminder?: Record<string, unknown>;
  error?: string;
}

export interface ProcessPendingRemindersResult {
  success: boolean;
  processed?: number;
  failed?: number;
  error?: string;
}

export interface RemindersListResult {
  success: boolean;
  reminders?: Record<string, unknown>[];
  error?: string;
}

/**
 * Schedule a payment reminder for a booking.
 */
export async function scheduleReminder(
  params: ScheduleReminderParams
): Promise<ReminderResult> {
  try {
    const reminder = await paymentReminderRepository.create({
      booking_id: params.bookingId,
      invoice_id: params.invoiceId,
      reminder_type: params.reminderType,
      scheduled_at: params.scheduledAt,
    });

    return {
      success: true,
      reminder: reminder as unknown as Record<string, unknown>,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Process all pending reminders whose scheduled time has passed.
 */
export async function processPendingReminders(): Promise<ProcessPendingRemindersResult> {
  try {
    const pending = await paymentReminderRepository.findPending();

    let processed = 0;
    let failed = 0;

    for (const reminder of pending) {
      try {
        const bookingRows = await kdb
          .selectFrom("bookings")
          .select("booking_reference")
          .where("id", "=", Number(reminder.booking_id))
          .execute();
        const booking = bookingRows[0];

        const passenger = await sql<{ name: string; email: string }>`
          SELECT CONCAT(bp.first_name, ' ', bp.last_name) AS name, bp.email
          FROM booking_passengers bp
          JOIN booking_leg_passengers blp ON blp.booking_passenger_id = bp.id
          JOIN booking_legs bl ON bl.id = blp.booking_leg_id
          WHERE bl.booking_id = ${Number(reminder.booking_id)}
          LIMIT 1
        `.execute(kdb);
        const passengerEmail = passenger.rows[0]?.email;
        const passengerName = passenger.rows[0]?.name ?? "Passenger";

        if (passengerEmail) {
          const email = paymentReminderEmail({
            passengerName,
            passengerEmail,
            bookingReference: booking?.booking_reference ?? `#${reminder.booking_id}`,
            amountDue: "See invoice",
            dueDate: reminder.scheduled_at?.toString() ?? "Due",
            reminderType: reminder.reminder_type,
          });

          await sendEmailQuiet({
            ...email,
            bookingId: Number(reminder.booking_id),
          });
        }

        await paymentReminderRepository.markSent(
          reminder.id,
          passengerEmail || process.env.SYSTEM_EMAIL || "system@figas.gov.fk"
        );

        processed++;
      } catch (sendError) {
        const errorMessage =
          sendError instanceof Error
            ? sendError.message
            : "Failed to send reminder";

        await paymentReminderRepository.markFailed(reminder.id, errorMessage);

        failed++;
      }
    }

    return {
      success: true,
      processed,
      failed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Get all reminders for a specific booking.
 */
export async function getRemindersForBooking(
  params: GetRemindersForBookingParams
): Promise<RemindersListResult> {
  try {
    const reminders = await paymentReminderRepository.findByBooking(
      params.bookingId
    );

    return {
      success: true,
      reminders: reminders as unknown as Record<string, unknown>[],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Cancel all pending reminders for a booking.
 */
export async function cancelRemindersForBooking(
  params: CancelRemindersForBookingParams
): Promise<ReminderResult> {
  try {
    await kdb
      .updateTable("payment_reminders")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set({ status: "cancelled" } as any)
      .where("booking_id", "=", Number(params.bookingId))
      .where("status", "=", "pending")
      .execute();

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}
