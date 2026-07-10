import { kdb } from "../db.server.kysely";

export interface OrganizationRow {
  id: number;
  name: string;
  code: string | null;
  contact_email: string;
  contact_phone: string | null;
  billing_address: string | null;
  credit_limit_gbp: number | null;
  credit_remaining_gbp: number;
  payment_terms: string | null;
  default_payment_method_id: string | null;
  tax_id: string | null;
  invoice_email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function dec(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toRow(r: Record<string, unknown>): OrganizationRow {
  return {
    id: Number(r.id),
    name: String(r.name ?? ""),
    code: r.code != null ? String(r.code) : null,
    contact_email: String(r.contact_email ?? ""),
    contact_phone: r.contact_phone != null ? String(r.contact_phone) : null,
    billing_address: r.billing_address != null ? String(r.billing_address) : null,
    credit_limit_gbp: dec(r.credit_limit_gbp),
    credit_remaining_gbp: Number(r.credit_remaining_gbp ?? 0),
    payment_terms: r.payment_terms != null ? String(r.payment_terms) : null,
    default_payment_method_id: r.default_payment_method_id != null ? String(r.default_payment_method_id) : null,
    tax_id: r.tax_id != null ? String(r.tax_id) : null,
    invoice_email: r.invoice_email != null ? String(r.invoice_email) : null,
    is_active: Boolean(r.is_active),
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

export const organizationRepository = {
  async findAll(): Promise<OrganizationRow[]> {
    const rows = await kdb
      .selectFrom("organizations")
      .selectAll()
      .where("is_active", "=", true)
      .orderBy("name asc")
      .execute();
    return rows.map((r) => toRow(r as unknown as Record<string, unknown>));
  },

  async findById(id: number): Promise<OrganizationRow | null> {
    const rows = await kdb
      .selectFrom("organizations")
      .selectAll()
      .where("id", "=", id)
      .execute();
    return rows.length > 0 ? toRow(rows[0] as unknown as Record<string, unknown>) : null;
  },
};
