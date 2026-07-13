import type { EmailOptions } from "../utils/email.server";

interface PilotAssignmentParams {
  pilotName: string;
  pilotEmail: string;
  flightNumber: string;
  date: string;
  origin: string;
  destination: string;
}

export function pilotAssignmentEmail(params: PilotAssignmentParams): EmailOptions {
  return {
    to: params.pilotEmail,
    subject: `Flight Assignment — ${params.flightNumber}`,
    notificationType: "pilot_assignment",
    recipientType: "pilot",
    flightId: undefined,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Flight Assignment</h2>
        <p>Dear ${params.pilotName},</p>
        <p>You have been assigned as pilot for:</p>
        <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
          <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Flight</td><td style="padding: 8px; border: 1px solid #ddd;">${params.flightNumber}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Date</td><td style="padding: 8px; border: 1px solid #ddd;">${params.date}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Route</td><td style="padding: 8px; border: 1px solid #ddd;">${params.origin} \u2192 ${params.destination}</td></tr>
        </table>
        <p>Please access your pilot dashboard to review the briefing and loadsheet.</p>
        <hr />
        <p style="color: #666; font-size: 12px;">Falkland Islands Government Air Service</p>
      </div>
    `,
    text: `Flight Assignment — ${params.flightNumber}\n\nDear ${params.pilotName},\n\nYou have been assigned as pilot for flight ${params.flightNumber} on ${params.date}.\nRoute: ${params.origin} \u2192 ${params.destination}\n\nFalkland Islands Government Air Service`,
  };
}

interface PaymentReminderParams {
  passengerName: string;
  passengerEmail: string;
  bookingReference: string;
  amountDue: string;
  dueDate: string;
  reminderType: string;
}

export function paymentReminderEmail(params: PaymentReminderParams): EmailOptions {
  const urgency = params.reminderType.includes("overdue") ? "OVERDUE" : "Due";
  return {
    to: params.passengerEmail,
    subject: `Payment ${urgency} — ${params.bookingReference}`,
    notificationType: "payment_reminder",
    recipientType: "passenger",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Payment ${urgency}</h2>
        <p>Dear ${params.passengerName},</p>
        <p>This is a reminder regarding your booking.</p>
        <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
          <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Booking</td><td style="padding: 8px; border: 1px solid #ddd;">${params.bookingReference}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Amount Due</td><td style="padding: 8px; border: 1px solid #ddd;">${params.amountDue}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Due Date</td><td style="padding: 8px; border: 1px solid #ddd;">${params.dueDate}</td></tr>
        </table>
        <p>Please arrange payment at your earliest convenience.</p>
        <hr />
        <p style="color: #666; font-size: 12px;">Falkland Islands Government Air Service</p>
      </div>
    `,
    text: `Payment ${urgency} — ${params.bookingReference}\n\nDear ${params.passengerName},\n\nBooking: ${params.bookingReference}\nAmount Due: ${params.amountDue}\nDue Date: ${params.dueDate}\n\nFalkland Islands Government Air Service`,
  };
}

interface CheckinReminderParams {
  passengerName: string;
  passengerEmail: string;
  flightNumber: string;
  departureTime: string;
  origin: string;
}

export function checkinReminderEmail(params: CheckinReminderParams): EmailOptions {
  return {
    to: params.passengerEmail,
    subject: `Check-in Reminder — ${params.flightNumber}`,
    notificationType: "checkin_reminder",
    recipientType: "passenger",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Check-in Reminder</h2>
        <p>Dear ${params.passengerName},</p>
        <p>Your flight is departing soon. Please check in at the counter.</p>
        <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
          <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Flight</td><td style="padding: 8px; border: 1px solid #ddd;">${params.flightNumber}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Departure</td><td style="padding: 8px; border: 1px solid #ddd;">${params.departureTime} from ${params.origin}</td></tr>
        </table>
        <p>Please arrive at least 30 minutes before departure with your baggage declared.</p>
        <hr />
        <p style="color: #666; font-size: 12px;">Falkland Islands Government Air Service</p>
      </div>
    `,
    text: `Check-in Reminder — ${params.flightNumber}\n\nDear ${params.passengerName},\n\nYour flight ${params.flightNumber} departs at ${params.departureTime} from ${params.origin}.\nPlease arrive 30 minutes before departure.\n\nFalkland Islands Government Air Service`,
  };
}

interface InvoiceIssuedParams {
  passengerName: string;
  passengerEmail: string;
  invoiceNumber: string;
  bookingReference: string;
  amount: string;
  dueDate: string;
}

export function invoiceIssuedEmail(params: InvoiceIssuedParams): EmailOptions {
  return {
    to: params.passengerEmail,
    subject: `Invoice Issued — ${params.invoiceNumber}`,
    notificationType: "invoice_issued",
    recipientType: "passenger",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Invoice Issued</h2>
        <p>Dear ${params.passengerName},</p>
        <p>An invoice has been generated for your booking.</p>
        <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
          <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Invoice</td><td style="padding: 8px; border: 1px solid #ddd;">${params.invoiceNumber}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Booking</td><td style="padding: 8px; border: 1px solid #ddd;">${params.bookingReference}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Amount</td><td style="padding: 8px; border: 1px solid #ddd;">${params.amount}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Due Date</td><td style="padding: 8px; border: 1px solid #ddd;">${params.dueDate}</td></tr>
        </table>
        <hr />
        <p style="color: #666; font-size: 12px;">Falkland Islands Government Air Service</p>
      </div>
    `,
    text: `Invoice Issued — ${params.invoiceNumber}\n\nDear ${params.passengerName},\n\nInvoice: ${params.invoiceNumber}\nBooking: ${params.bookingReference}\nAmount: ${params.amount}\nDue Date: ${params.dueDate}\n\nFalkland Islands Government Air Service`,
  };
}
