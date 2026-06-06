import { db } from "../db.server";
import type { InvoiceStatus } from "../../../generated/prisma/client";

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
    return db.invoices.create({
      data: {
        invoice_number: params.invoice_number,
        booking_id: params.booking_id ? parseInt(params.booking_id, 10) : null,
        organization_id: params.organization_id ? parseInt(params.organization_id, 10) : null,
        user_id: params.user_id ? parseInt(params.user_id, 10) : null,
        status: (params.status ?? "draft") as InvoiceStatus,
        issue_date: new Date(params.issue_date),
        due_date: new Date(params.due_date),
        subtotal_gbp: params.subtotal_gbp,
        tax_rate: params.tax_rate ?? 0,
        tax_amount_gbp: params.tax_amount_gbp ?? 0,
        total_gbp: params.total_gbp,
        amount_paid_gbp: params.amount_paid_gbp ?? 0,
        currency: params.currency || "GBP",
        notes: params.notes || null,
        created_by: parseInt(params.created_by, 10),
      },
    }) as unknown as InvoiceRow;
  },

  async findById(id: string): Promise<InvoiceRow | null> {
    return db.invoices.findUnique({
      where: { id },
    }) as unknown as InvoiceRow | null;
  },

  async findByBooking(bookingId: string): Promise<InvoiceRow[]> {
    return db.invoices.findMany({
      where: { booking_id: parseInt(bookingId, 10) },
      orderBy: { created_at: "desc" },
    }) as unknown as InvoiceRow[];
  },

  async findByOrganization(organizationId: string): Promise<InvoiceRow[]> {
    return db.invoices.findMany({
      where: { organization_id: parseInt(organizationId, 10) },
      orderBy: { created_at: "desc" },
    }) as unknown as InvoiceRow[];
  },

  async findOverdue(): Promise<InvoiceRow[]> {
    return db.invoices.findMany({
      where: {
        status: "issued",
        due_date: { lt: new Date() },
      },
      orderBy: { due_date: "asc" },
    }) as unknown as InvoiceRow[];
  },

  async updateStatus(id: string, status: string, paidAt?: string): Promise<InvoiceRow | null> {
    const data: Record<string, unknown> = {
      status: status as InvoiceStatus,
    };
    if (status === "paid" && paidAt) {
      data.paid_at = new Date(paidAt);
    }
    return db.invoices.update({
      where: { id },
      data,
    }) as unknown as InvoiceRow | null;
  },

  async generateNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await db.invoices.count({
      where: {
        invoice_number: {
          startsWith: `INV-${year}-`,
        },
      },
    });
    const nextCount = count + 1;
    return `INV-${year}-${String(nextCount).padStart(6, "0")}`;
  },

  async updatePayment(id: string, amountPaid: number): Promise<InvoiceRow | null> {
    const invoice = await db.invoices.findUnique({
      where: { id },
      select: { total_gbp: true },
    });
    const totalGbp = Number(invoice?.total_gbp ?? 0);
    const isFullyPaid = amountPaid >= totalGbp;

    return db.invoices.update({
      where: { id },
      data: {
        amount_paid_gbp: amountPaid,
        status: isFullyPaid ? "paid" : undefined,
        paid_at: isFullyPaid ? new Date() : undefined,
      },
    }) as unknown as InvoiceRow | null;
  },
};
