import { kdb } from "../db.server";

export interface PaymentMethodRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  requires_online: boolean;
  requires_invoice: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function toRow(r: Record<string, unknown>): PaymentMethodRow {
  return {
    id: String(r.id ?? ""),
    code: String(r.code ?? ""),
    name: String(r.name ?? ""),
    description: r.description != null ? String(r.description) : null,
    is_active: Boolean(r.is_active),
    requires_online: Boolean(r.requires_online),
    requires_invoice: Boolean(r.requires_invoice),
    sort_order: Number(r.sort_order ?? 0),
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

export const paymentMethodRepository = {
  async findAll(): Promise<PaymentMethodRow[]> {
    const rows = await kdb
      .selectFrom("payment_methods")
      .selectAll()
      .where("is_active", "=", true)
      .orderBy("sort_order asc")
      .execute();
    return rows.map((r) => toRow(r as unknown as Record<string, unknown>));
  },

  async findByCode(code: string): Promise<PaymentMethodRow | null> {
    const rows = await kdb
      .selectFrom("payment_methods")
      .selectAll()
      .where("code", "=", code)
      .execute();
    return rows.length > 0 ? toRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async findById(id: string): Promise<PaymentMethodRow | null> {
    const rows = await kdb
      .selectFrom("payment_methods")
      .selectAll()
      .where("id", "=", id)
      .execute();
    return rows.length > 0 ? toRow(rows[0] as unknown as Record<string, unknown>) : null;
  },
};
