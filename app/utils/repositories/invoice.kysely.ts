import { kdb } from "../db.server.kysely";
import { sql } from "kysely";

export interface InvoiceRow {
  id: string;
  invoice_number: string;
  booking_id: string | null;
  organization_id: string | null;
  user_id: string | null;
  status: string;
  issue_date: string;
  due_date: string;
  paid_at: string | null;
  subtotal_gbp: number;
  tax_rate: number;
  tax_amount_gbp: number;
  total_gbp: number;
  amount_paid_gbp: number;
  amount_due_gbp: number;
  currency: string;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function dec(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toRow(r: Record<string, unknown>): InvoiceRow {
  return {
    id: String(r.id ?? ""),
    invoice_number: String(r.invoice_number ?? ""),
    booking_id: r.booking_id != null ? String(r.booking_id) : null,
    organization_id: r.organization_id != null ? String(r.organization_id) : null,
    user_id: r.user_id != null ? String(r.user_id) : null,
    status: String(r.status ?? ""),
    issue_date: String(r.issue_date ?? ""),
    due_date: String(r.due_date ?? ""),
    paid_at: r.paid_at != null ? String(r.paid_at) : null,
    subtotal_gbp: dec(r.subtotal_gbp) ?? 0,
    tax_rate: dec(r.tax_rate) ?? 0,
    tax_amount_gbp: dec(r.tax_amount_gbp) ?? 0,
    total_gbp: dec(r.total_gbp) ?? 0,
    amount_paid_gbp: dec(r.amount_paid_gbp) ?? 0,
    amount_due_gbp: dec(r.amount_due_gbp) ?? 0,
    currency: String(r.currency ?? "GBP"),
    notes: r.notes != null ? String(r.notes) : null,
    created_by: String(r.created_by ?? ""),
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

export const invoiceRepository = {
  async create(params: {
    invoice_number: string;
    booking_id?: string;
    organization_id?: string;
    user_id?: string;
    status?: string;
    issue_date: string;
    due_date: string;
    subtotal_gbp: number;
    tax_rate?: number;
    tax_amount_gbp?: number;
    total_gbp: number;
    amount_paid_gbp?: number;
    currency?: string;
    notes?: string;
    created_by: string;
  }): Promise<InvoiceRow> {
    const rows = await kdb
      .insertInto("invoices")
      .values({
        invoice_number: params.invoice_number,
        booking_id: params.booking_id ? parseInt(params.booking_id, 10) : undefined,
        organization_id: params.organization_id ? parseInt(params.organization_id, 10) : undefined,
        user_id: params.user_id ? parseInt(params.user_id, 10) : undefined,
        status: params.status ?? "draft",
        issue_date: params.issue_date,
        due_date: params.due_date,
        subtotal_gbp: String(params.subtotal_gbp),
        tax_rate: String(params.tax_rate ?? 0),
        tax_amount_gbp: String(params.tax_amount_gbp ?? 0),
        total_gbp: String(params.total_gbp),
        amount_paid_gbp: String(params.amount_paid_gbp ?? 0),
        currency: params.currency || "GBP",
        notes: params.notes || undefined,
        created_by: parseInt(params.created_by, 10),
      } as any)
      .returningAll()
      .execute();
    return toRow(rows[0] as unknown as Record<string, unknown>);
  },

  async findById(id: string): Promise<InvoiceRow | null> {
    const rows = await kdb
      .selectFrom("invoices")
      .selectAll()
      .where("id", "=", id)
      .execute();
    return rows.length > 0 ? toRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async findByBooking(bookingId: string): Promise<InvoiceRow[]> {
    const rows = await kdb
      .selectFrom("invoices")
      .selectAll()
      .where("booking_id", "=", parseInt(bookingId, 10))
      .orderBy("created_at desc")
      .execute();
    return rows.map((r) => toRow(r as unknown as Record<string, unknown>));
  },

  async findByOrganization(organizationId: string): Promise<InvoiceRow[]> {
    const rows = await kdb
      .selectFrom("invoices")
      .selectAll()
      .where("organization_id", "=", parseInt(organizationId, 10))
      .orderBy("created_at desc")
      .execute();
    return rows.map((r) => toRow(r as unknown as Record<string, unknown>));
  },

  async findOverdue(): Promise<InvoiceRow[]> {
    const now = new Date().toISOString();
    const rows = await kdb
      .selectFrom("invoices")
      .selectAll()
      .where("status", "=", "issued")
      .where("due_date", "<", now)
      .orderBy("due_date asc")
      .execute();
    return rows.map((r) => toRow(r as unknown as Record<string, unknown>));
  },

  async updateStatus(id: string, status: string, paidAt?: string): Promise<InvoiceRow | null> {
    const data: Record<string, unknown> = { status };
    if (status === "paid" && paidAt) {
      data.paid_at = paidAt;
    }
    const rows = await kdb
      .updateTable("invoices")
      .set(data as any)
      .where("id", "=", id)
      .returningAll()
      .execute();
    return rows.length > 0 ? toRow(rows[0] as unknown as Record<string, unknown>) : null;
  },

  async generateNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const result = await kdb
      .selectFrom("invoices")
      .select(kdb.fn.countAll<number>().as("count"))
      .where("invoice_number", "like", `${prefix}%`)
      .execute();
    const count = Number(result[0]?.count ?? 0);
    const nextCount = count + 1;
    return `INV-${year}-${String(nextCount).padStart(6, "0")}`;
  },

  async updatePayment(id: string, amountPaid: number): Promise<InvoiceRow | null> {
    const invoiceRows = await kdb
      .selectFrom("invoices")
      .select("total_gbp")
      .where("id", "=", id)
      .execute();
    const totalGbp = dec(invoiceRows[0]?.total_gbp) ?? 0;
    const isFullyPaid = amountPaid >= totalGbp;

    const setData: Record<string, unknown> = {
      amount_paid_gbp: String(amountPaid),
    };
    if (isFullyPaid) {
      setData.status = "paid";
      setData.paid_at = sql`NOW()`;
    }

    const rows = await kdb
      .updateTable("invoices")
      .set(setData as any)
      .where("id", "=", id)
      .returningAll()
      .execute();
    return rows.length > 0 ? toRow(rows[0] as unknown as Record<string, unknown>) : null;
  },
};
