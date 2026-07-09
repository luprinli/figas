import type { EmailOptions } from "../utils/email.server";

interface SchedulePublishedParams {
  pilotName: string;
  pilotEmail: string;
  flightNumber: string;
  date: string;
  origin: string;
  destination: string;
  departureTime: string;
}

export function schedulePublishedEmail(params: SchedulePublishedParams): EmailOptions {
  return {
    to: params.pilotEmail,
    subject: `Schedule Published — ${params.flightNumber}`,
    notificationType: "schedule_published",
    recipientType: "pilot",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Schedule Published</h2>
        <p>Dear ${params.pilotName},</p>
        <p>You have been assigned to flight <strong>${params.flightNumber}</strong>.</p>
        <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
          <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Flight</td><td style="padding: 8px; border: 1px solid #ddd;">${params.flightNumber}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Date</td><td style="padding: 8px; border: 1px solid #ddd;">${params.date}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Route</td><td style="padding: 8px; border: 1px solid #ddd;">${params.origin} → ${params.destination}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Departure</td><td style="padding: 8px; border: 1px solid #ddd;">${params.departureTime}</td></tr>
        </table>
        <p>Please review your briefing and acknowledge receipt.</p>
        <hr />
        <p style="color: #666; font-size: 12px;">Falkland Islands Government Air Service</p>
      </div>
    `,
    text: `Schedule Published — ${params.flightNumber}\n\nDear ${params.pilotName},\n\nYou have been assigned to flight ${params.flightNumber}.\n\nDate: ${params.date}\nRoute: ${params.origin} → ${params.destination}\nDeparture: ${params.departureTime}\n\nFalkland Islands Government Air Service`,
  };
}
