import { kdb } from "../db.server";
import { sql } from "kysely";

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

function toRow(r: Record<string, unknown>): WebhookEventRow {
  return {
    id: Number(r.id),
    provider: String(r.provider ?? ""),
    event_id: String(r.event_id ?? ""),
    event_type: String(r.event_type ?? ""),
    payload: r.payload,
    status: String(r.status ?? "received") as WebhookEventRow["status"],
    attempts: Number(r.attempts ?? 0),
    last_error: r.last_error != null ? String(r.last_error) : null,
    created_at: r.created_at instanceof Date ? r.created_at : new Date(String(r.created_at)),
    processed_at: r.processed_at instanceof Date ? r.processed_at : (r.processed_at != null ? new Date(String(r.processed_at)) : null),
  };
}

export const webhookEventRepository = {
  async create(params: {
    provider: string;
    event_id: string;
    event_type: string;
    payload: unknown;
  }): Promise<number> {
    const rows = await kdb
      .insertInto("webhook_events")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .values({
        provider: params.provider,
        event_id: params.event_id,
        event_type: params.event_type,
        payload: JSON.stringify(params.payload),
        status: "received",
      } as any)
      .onConflict((oc) => oc.column("event_id").doUpdateSet({ attempts: sql`webhook_events.attempts + 1` }))
      .returning("id")
      .execute();
    return rows.length > 0 ? Number(rows[0].id) : 0;
  },

  async markProcessing(eventId: string): Promise<void> {
    await kdb
      .updateTable("webhook_events")
      .set({ status: "processing" } as any)
      .where("event_id", "=", eventId)
      .execute();
  },

  async markProcessed(eventId: string): Promise<void> {
    await kdb
      .updateTable("webhook_events")
      .set({ status: "processed", processed_at: sql`NOW()` } as any)
      .where("event_id", "=", eventId)
      .execute();
  },

  async markFailed(eventId: string, error: string): Promise<void> {
    await kdb
      .updateTable("webhook_events")
      .set({ status: "failed", last_error: error, attempts: sql`attempts + 1` } as any)
      .where("event_id", "=", eventId)
      .execute();
  },

  async getPending(limit = 50): Promise<WebhookEventRow[]> {
    const rows = await kdb
      .selectFrom("webhook_events")
      .selectAll()
      .where("status", "in", ["received", "failed"])
      .where("attempts", "<", 10)
      .orderBy("created_at asc")
      .limit(limit)
      .execute();
    return rows.map((r) => toRow(r as unknown as Record<string, unknown>));
  },
};
