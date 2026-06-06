import { db } from "../db.server";
import type { InvoiceItemType } from "../../../generated/prisma/client";

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
    return db.invoice_items.create({
      data: {
        invoice_id: params.invoice_id,
        description: params.description,
        quantity: params.quantity ?? 1,
        unit_price_gbp: params.unit_price_gbp,
        type: params.type as InvoiceItemType,
        reference_type: params.reference_type ?? null,
        reference_id: params.reference_id ?? null,
        sort_order: params.sort_order ?? 0,
      },
    }) as unknown as InvoiceItemRow;
  },

  async findByInvoice(invoiceId: string): Promise<InvoiceItemRow[]> {
    return db.invoice_items.findMany({
      where: { invoice_id: invoiceId },
      orderBy: { sort_order: "asc" },
    }) as unknown as InvoiceItemRow[];
  },

  async delete(id: string): Promise<void> {
    await db.invoice_items.delete({
      where: { id },
    });
  },
};
