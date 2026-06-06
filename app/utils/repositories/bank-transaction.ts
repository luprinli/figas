import { db } from "../db.server";
import { Prisma } from "../../../generated/prisma/client";
import type { ReconciliationStatus } from "../../../generated/prisma/client";

export interface BankTransactionRow {
  id: string;
  external_id: string | null;
  transaction_date: string;
  description: string;
  amount_gbp: number;
  balance_gbp: number | null;
  reference: string | null;
  payment_id: string | null;
  reconciliation_status: string;
  matched_at: string | null;
  matched_by: string | null;
  import_batch_id: string | null;
  raw_data: Record<string, unknown> | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const bankTransactionRepository = {
  async create(params: {
    external_id?: string;
    transaction_date: string;
    description: string;
    amount_gbp: number;
    balance_gbp?: number;
    reference?: string;
    import_batch_id?: string;
    raw_data?: Record<string, unknown>;
    notes?: string;
  }): Promise<BankTransactionRow> {
    return db.bank_transactions.create({
      data: {
        external_id: params.external_id || null,
        transaction_date: new Date(params.transaction_date),
        description: params.description,
        amount_gbp: params.amount_gbp,
        balance_gbp: params.balance_gbp ?? null,
        reference: params.reference || null,
        import_batch_id: params.import_batch_id || null,
        raw_data: (params.raw_data ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        notes: params.notes || null,
      },
    }) as unknown as BankTransactionRow;
  },

  async findUnmatched(): Promise<BankTransactionRow[]> {
    return db.bank_transactions.findMany({
      where: { reconciliation_status: "unmatched" },
      orderBy: { transaction_date: "desc" },
    }) as unknown as BankTransactionRow[];
  },

  async matchPayment(id: string, paymentId: string, matchedBy: string): Promise<BankTransactionRow | null> {
    return db.bank_transactions.update({
      where: { id },
      data: {
        payment_id: parseInt(paymentId, 10),
        reconciliation_status: "matched" as ReconciliationStatus,
        matched_at: new Date(),
        matched_by: parseInt(matchedBy, 10),
      },
    }) as unknown as BankTransactionRow | null;
  },

  async importBatch(transactions: Array<{
    external_id?: string;
    transaction_date: string;
    description: string;
    amount_gbp: number;
    balance_gbp?: number;
    reference?: string;
    import_batch_id: string;
    raw_data?: Record<string, unknown>;
  }>): Promise<BankTransactionRow[]> {
    const results: BankTransactionRow[] = [];
    for (const txn of transactions) {
      const result = await this.create(txn);
      results.push(result);
    }
    return results;
  },

  async findByBatchId(batchId: string): Promise<BankTransactionRow[]> {
    return db.bank_transactions.findMany({
      where: { import_batch_id: batchId },
      orderBy: { transaction_date: "asc" },
    }) as unknown as BankTransactionRow[];
  },
};
