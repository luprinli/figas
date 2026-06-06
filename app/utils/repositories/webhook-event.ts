import { db } from "../db.server";

export interface WebhookEventRow {
  id: number;
  provider: string;
  event_id: string;
  event_type: string;
  payload: unknown;
  status: "received" | "processing" | "processed" | "failed";
  attempts: number;
  last_error: string | null;
  created_at: Date;
  processed_at: Date | null;
}

export const webhookEventRepository = {
  async create(params: {
    provider: string;
    event_id: string;
    event_type: string;
    payload: unknown;
  }): Promise<number> {
    const result = await db.$queryRawUnsafe<Array<{ id: number }>>(
      `INSERT INTO webhook_events (provider, event_id, event_type, payload, status)
       VALUES ($1, $2, $3, $4, 'received')
       ON CONFLICT (event_id) DO UPDATE SET attempts = webhook_events.attempts + 1
       RETURNING id`,
      [params.provider, params.event_id, params.event_type, JSON.stringify(params.payload)]
    );
    return result[0]?.id ?? 0;
  },

  async markProcessing(eventId: string): Promise<void> {
    await db.$queryRawUnsafe(
      `UPDATE webhook_events SET status = 'processing' WHERE event_id = $1`,
      [eventId]
    );
  },

  async markProcessed(eventId: string): Promise<void> {
    await db.$queryRawUnsafe(
      `UPDATE webhook_events SET status = 'processed', processed_at = NOW() WHERE event_id = $1`,
      [eventId]
    );
  },

  async markFailed(eventId: string, error: string): Promise<void> {
    await db.$queryRawUnsafe(
      `UPDATE webhook_events SET status = 'failed', last_error = $2, attempts = attempts + 1 WHERE event_id = $1`,
      [eventId, error]
    );
  },

  async getPending(limit = 50): Promise<WebhookEventRow[]> {
    return db.$queryRawUnsafe<WebhookEventRow[]>(
      `SELECT * FROM webhook_events WHERE status IN ('received','failed') AND attempts < 10 ORDER BY created_at ASC LIMIT $1`,
      [limit]
    );
  },
};
