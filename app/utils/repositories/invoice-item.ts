import { kdb } from "../db.server";

export interface InvoiceItemRow {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price_gbp: number;
  line_total_gbp: number;
  type: string;
  reference_type: string | null;
  reference_id: string | null;
  sort_order: number;
  created_at: string;
}

function dec(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toRow(r: Record<string, unknown>): InvoiceItemRow {
  return {
    id: String(r.id ?? ""),
    invoice_id: String(r.invoice_id ?? ""),
    description: String(r.description ?? ""),
    quantity: Number(r.quantity ?? 0),
    unit_price_gbp: dec(r.unit_price_gbp) ?? 0,
    line_total_gbp: dec(r.line_total_gbp) ?? 0,
    type: String(r.type ?? ""),
    reference_type: r.reference_type != null ? String(r.reference_type) : null,
    reference_id: r.reference_id != null ? String(r.reference_id) : null,
    sort_order: Number(r.sort_order ?? 0),
    created_at: String(r.created_at ?? ""),
  };
}

export const invoiceItemRepository = {
  async create(params: {
    invoice_id: string;
    description: string;
    quantity?: number;
    unit_price_gbp: number;
    type: string;
    reference_type?: string;
    reference_id?: string;
    sort_order?: number;
  }): Promise<InvoiceItemRow> {
    const rows = await kdb
      .insertInto("invoice_items")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .values({
        invoice_id: params.invoice_id,
        description: params.description,
        quantity: params.quantity ?? 1,
        unit_price_gbp: String(params.unit_price_gbp),
        type: params.type,
        reference_type: params.reference_type ?? undefined,
        reference_id: params.reference_id ?? undefined,
        sort_order: params.sort_order ?? 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .returningAll()
      .execute();
    return toRow(rows[0] as unknown as Record<string, unknown>);
  },

  async findByInvoice(invoiceId: string): Promise<InvoiceItemRow[]> {
    const rows = await kdb
      .selectFrom("invoice_items")
      .selectAll()
      .where("invoice_id", "=", invoiceId)
      .orderBy("sort_order", "asc")
      .execute();
    return rows.map((r) => toRow(r as unknown as Record<string, unknown>));
  },

  async delete(id: string): Promise<void> {
    await kdb.deleteFrom("invoice_items").where("id", "=", id).execute();
  },
};
