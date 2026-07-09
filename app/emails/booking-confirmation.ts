import type { EmailOptions } from "../utils/email.server";

interface BookingConfirmationParams {
  passengerName: string;
  passengerEmail: string;
  bookingReference: string;
  origin: string;
  destination: string;
  date: string;
}

export function bookingConfirmationEmail(params: BookingConfirmationParams): EmailOptions {
  const route = `${params.origin} → ${params.destination}`;
  return {
    to: params.passengerEmail,
    subject: `Booking Confirmed — ${params.bookingReference}`,
    notificationType: "booking_confirmation",
    recipientType: "passenger",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Booking Confirmed</h2>
        <p>Dear ${params.passengerName},</p>
        <p>Your booking has been confirmed.</p>
        <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
          <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Reference</td><td style="padding: 8px; border: 1px solid #ddd;">${params.bookingReference}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Route</td><td style="padding: 8px; border: 1px solid #ddd;">${route}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Date</td><td style="padding: 8px; border: 1px solid #ddd;">${params.date}</td></tr>
        </table>
        <p>Please arrive at the aerodrome at least 15 minutes before departure.</p>
        <hr />
        <p style="color: #666; font-size: 12px;">Falkland Islands Government Air Service</p>
      </div>
    `,
    text: `Booking Confirmed — ${params.bookingReference}\n\nDear ${params.passengerName},\n\nYour booking has been confirmed.\n\nReference: ${params.bookingReference}\nRoute: ${route}\nDate: ${params.date}\n\nFalkland Islands Government Air Service`,
  };
}
