import { db } from "../db.server";

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

export const paymentMethodRepository = {
  async findAll(): Promise<PaymentMethodRow[]> {
    return db.payment_methods.findMany({
      where: { is_active: true },
      orderBy: { sort_order: "asc" },
    }) as unknown as PaymentMethodRow[];
  },

  async findByCode(code: string): Promise<PaymentMethodRow | null> {
    return db.payment_methods.findUnique({
      where: { code },
    }) as unknown as PaymentMethodRow | null;
  },

  async findById(id: string): Promise<PaymentMethodRow | null> {
    return db.payment_methods.findUnique({
      where: { id },
    }) as unknown as PaymentMethodRow | null;
  },
};
