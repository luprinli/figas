import { db } from "../db.server";

export interface NotificationRow {
  id: number;
  booking_id: number | null;
  flight_id: number | null;
  recipient_email: string;
  recipient_type: string;
  notification_type: string;
  sent_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export const notificationRepository = {
  async create(data: {
    booking_id?: number | null;
    flight_id?: number | null;
    recipient_email: string;
    recipient_type: string;
    notification_type: string;
  }): Promise<NotificationRow> {
    return db.notifications.create({
      data: {
        booking_id: data.booking_id ?? null,
        flight_id: data.flight_id ?? null,
        recipient_email: data.recipient_email,
        recipient_type: data.recipient_type,
        notification_type: data.notification_type,
        type: data.notification_type,
      },
    }) as unknown as NotificationRow;
  },

  async findById(id: number): Promise<NotificationRow | null> {
    return db.notifications.findUnique({
      where: { id },
    }) as unknown as NotificationRow | null;
  },

  async markAsSent(id: number): Promise<void> {
    await db.notifications.update({
      where: { id },
      data: { status: "sent", sent_at: new Date() },
    });
  },

  async markAsFailed(id: number): Promise<void> {
    await db.notifications.update({
      where: { id },
      data: { status: "failed" },
    });
  },
};
