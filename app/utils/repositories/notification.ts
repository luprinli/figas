import { kdb } from "../db.server";

export interface NotificationRow {
  id: number;
  booking_id: number | null;
  flight_id: number | null;
  recipient_email: string;
  recipient_type: string;
  notification_type: string;
  type: string;
  sent_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

function toRow(r: Record<string, unknown>): NotificationRow {
  return {
    id: Number(r.id),
    booking_id: r.booking_id != null ? Number(r.booking_id) : null,
    flight_id: r.flight_id != null ? Number(r.flight_id) : null,
    recipient_email: String(r.recipient_email ?? ""),
    recipient_type: String(r.recipient_type ?? ""),
    notification_type: String(r.notification_type ?? ""),
    type: String(r.type ?? ""),
    sent_at: r.sent_at != null ? String(r.sent_at) : null,
    status: String(r.status ?? ""),
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

export const notificationRepository = {
  async create(data: {
    booking_id?: number | null;
    flight_id?: number | null;
    recipient_email: string;
    recipient_type: string;
    notification_type: string;
  }): Promise<NotificationRow> {
    const rows = await kdb
      .insertInto("notifications")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .values({
        booking_id: data.booking_id ?? undefined,
        flight_id: data.flight_id ?? undefined,
        recipient_email: data.recipient_email,
        recipient_type: data.recipient_type,
        notification_type: data.notification_type,
        type: data.notification_type,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .returningAll()
      .execute();
    return toRow(rows[0] as unknown as Record<string, unknown>);
  },

  async findById(id: number): Promise<NotificationRow | null> {
    const rows = await kdb
      .selectFrom("notifications")
      .selectAll()
      .where("id", "=", id)
      .execute();
    return rows.length > 0 ? toRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async markAsSent(id: number): Promise<void> {
    await kdb
      .updateTable("notifications")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set({ status: "sent", sent_at: new Date() } as any)
      .where("id", "=", id)
      .execute();
  },

  async markAsFailed(id: number): Promise<void> {
    await kdb
      .updateTable("notifications")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set({ status: "failed" } as any)
      .where("id", "=", id)
      .execute();
  },
};
