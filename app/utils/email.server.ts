import nodemailer from "nodemailer";
import type { SentMessageInfo } from "nodemailer";
import { notificationRepository } from "./repositories/notification";
import { kdb } from "./db.server";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  notificationType?: string;
  bookingId?: number;
  flightId?: number;
  recipientType?: string;
}

export interface EmailResult {
  success: boolean;
  notificationId?: number;
  error?: string;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const notificationType = options.notificationType ?? "general";
  const recipientEmail = Array.isArray(options.to) ? options.to[0] : options.to;
  const recipientType = options.recipientType ?? "user";

  let notificationId: number | null = null;

  try {
    const notification = await notificationRepository.create({
      booking_id: options.bookingId ?? null,
      flight_id: options.flightId ?? null,
      recipient_email: recipientEmail,
      recipient_type: recipientType,
      notification_type: notificationType,
    });
    notificationId = notification.id;
  } catch {
    // notification table may not be available; proceed without tracking
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const t = getTransporter();
      await t.sendMail({
        from: process.env.SMTP_FROM || process.env.SYSTEM_EMAIL || "noreply@figas.gov.fk",
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      if (notificationId) {
        await notificationRepository.markAsSent(notificationId).catch(() => {});
      }

      return { success: true, notificationId: notificationId ?? undefined };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY_MS * Math.pow(2, attempt - 1));
      }
    }
  }

  if (notificationId) {
    await notificationRepository
      .markAsFailed(notificationId)
      .catch(() => {});
  }

  return {
    success: false,
    notificationId: notificationId ?? undefined,
    error: lastError?.message ?? "Failed to send email",
  };
}

export async function sendEmailQuiet(
  options: EmailOptions
): Promise<void> {
  const result = await sendEmail(options);
  if (!result.success) {
    console.error(
      `[Email] Failed to send "${options.subject}" to ${String(options.to)}: ${result.error}`
    );
  }
}

export interface ProcessPendingNotificationsResult {
  success: boolean;
  processed?: number;
  failed?: number;
  error?: string;
}

export async function processPendingNotifications(): Promise<ProcessPendingNotificationsResult> {
  try {
    const pending = await kdb
      .selectFrom("notifications")
      .selectAll()
      .where("status", "=", "pending")
      .execute();

    let processed = 0;
    let failed = 0;

    for (const notif of pending) {
      try {
        const notificationType = (notif.notification_type ?? notif.type ?? "general") as string;
        const subject = (notif.subject as string | undefined)
          ?? `FIGAS Notification: ${notificationType.replace(/_/g, " ")}`;
        const body = (notif.message as string | undefined)
          ?? `You have a notification from FIGAS regarding: ${notificationType.replace(/_/g, " ")}.`;

        await sendEmailQuiet({
          to: String(notif.recipient_email ?? ""),
          subject,
          text: body,
          notificationType,
          bookingId: notif.booking_id != null ? Number(notif.booking_id) : undefined,
          flightId: notif.flight_id != null ? Number(notif.flight_id) : undefined,
          recipientType: String(notif.recipient_type ?? "user"),
        });

        await notificationRepository.markAsSent(notif.id);
        processed++;
      } catch (sendError) {
        const errorMessage =
          sendError instanceof Error
            ? sendError.message
            : "Failed to send notification";

        await notificationRepository.markAsFailed(notif.id).catch(() => {});

        console.error(
          `[processPendingNotifications] Failed for notification #${notif.id}: ${errorMessage}`
        );

        failed++;
      }
    }

    console.log(
      `[processPendingNotifications] Completed: ${processed} sent, ${failed} failed (${pending.length} total pending)`
    );

    return { success: true, processed, failed };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[processPendingNotifications] Error: ${message}`);
    return { success: false, error: message };
  }
}

export function testTransporterConnection(): Promise<SentMessageInfo> {
  const t = getTransporter();
  return t.verify();
}
