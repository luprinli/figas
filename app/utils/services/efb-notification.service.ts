import { notificationRepository } from "../repositories/notification";
import { kdb } from "../db.server.kysely";
import { sql } from "kysely";

/**
 * Fire-and-forget EFB notifications.
 * Records notification rows for the Ops Notifications dashboard.
 */

async function findUserEmailByRole(role: string): Promise<string | null> {
  const rows = await sql<{ email: string }>`
    SELECT u.email FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
    WHERE r.slug = ${role} AND u.is_active = true
    ORDER BY u.id LIMIT 1
  `.execute(kdb);

  if (rows.rows.length === 0) return null;
  return rows.rows[0].email;
}

async function createNotification(params: {
  notificationType: string;
  recipientEmail: string;
  recipientType: string;
  flightId: number;
}): Promise<void> {
  await notificationRepository.create({
    notification_type: params.notificationType,
    recipient_email: params.recipientEmail,
    recipient_type: params.recipientType,
    flight_id: params.flightId,
  });
}

export async function notifyPilotAccepted(
  flightId: number
): Promise<void> {
  const opsEmail = await findUserEmailByRole("operations");
  if (!opsEmail) return;
  await createNotification({
    notificationType: "pilot_accepted",
    recipientEmail: opsEmail,
    recipientType: "operations",
    flightId,
  });
}

export async function notifyPilotDeclined(
  flightId: number
): Promise<void> {
  const opsEmail = await findUserEmailByRole("operations");
  if (!opsEmail) return;
  await createNotification({
    notificationType: "pilot_declined",
    recipientEmail: opsEmail,
    recipientType: "operations",
    flightId,
  });
}

export async function notifyFuelOrderIssued(
  flightId: number
): Promise<void> {
  const opsEmail = await findUserEmailByRole("operations");
  if (!opsEmail) return;
  await createNotification({
    notificationType: "fuel_order_issued",
    recipientEmail: opsEmail,
    recipientType: "operations",
    flightId,
  });
}

export async function notifyFuelUpliftRecorded(
  flightId: number
): Promise<void> {
  const opsEmail = await findUserEmailByRole("operations");
  if (opsEmail) {
    await createNotification({
      notificationType: "fuel_uplift_recorded",
      recipientEmail: opsEmail,
      recipientType: "operations",
      flightId,
    });
  }
}

export async function notifyFlightLogSubmitted(
  flightId: number
): Promise<void> {
  const opsEmail = await findUserEmailByRole("operations");
  if (opsEmail) {
    await createNotification({
      notificationType: "flight_log_submitted",
      recipientEmail: opsEmail,
      recipientType: "operations",
      flightId,
    });
  }
  const financeEmail = await findUserEmailByRole("finance");
  if (financeEmail) {
    await createNotification({
      notificationType: "flight_log_submitted",
      recipientEmail: financeEmail,
      recipientType: "finance",
      flightId,
    });
  }
}

export async function notifyDefectReported(
  flightId: number
): Promise<void> {
  const engineerEmail = await findUserEmailByRole("engineer");
  if (engineerEmail) {
    await createNotification({
      notificationType: "defect_reported",
      recipientEmail: engineerEmail,
      recipientType: "engineer",
      flightId,
    });
  }
}
