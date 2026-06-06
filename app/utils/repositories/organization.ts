import { db } from "../db.server";

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

export const organizationRepository = {
  async findAll(): Promise<OrganizationRow[]> {
    return db.organizations.findMany({
      where: { is_active: true },
      orderBy: { name: "asc" },
    }) as unknown as OrganizationRow[];
  },

  async findById(id: number): Promise<OrganizationRow | null> {
    return db.organizations.findUnique({
      where: { id },
    }) as unknown as OrganizationRow | null;
  },
};
