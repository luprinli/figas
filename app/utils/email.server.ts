import nodemailer from "nodemailer";
import type { SentMessageInfo } from "nodemailer";
import { notificationRepository } from "./repositories/notification";

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

export function testTransporterConnection(): Promise<SentMessageInfo> {
  const t = getTransporter();
  return t.verify();
}
