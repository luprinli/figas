import { db } from "../db.server";
import { paymentReminderRepository } from "../repositories/payment-reminder";

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
        // In a real system, this would send an email/SMS notification.
        // For now, log the reminder action and mark as sent.
        console.log(
          `[Reminder] Processing reminder ${reminder.id} — type: ${reminder.reminder_type}, booking: ${reminder.booking_id}`
        );

        await paymentReminderRepository.markSent(
          reminder.id,
          process.env.SYSTEM_EMAIL || "system@figas.gov.fk"
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
    await db.payment_reminders.updateMany({
      where: {
        booking_id: Number(params.bookingId),
        status: "pending",
      },
      data: {
        status: "cancelled",
      },
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}
