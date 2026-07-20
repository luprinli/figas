import { kdb } from "../db.server.kysely";
import { sql } from "kysely";
import { toDateString } from "../../types/shared";

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

function dec(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toRow(r: Record<string, unknown>): BankTransactionRow {
  return {
    id: String(r.id ?? ""),
    external_id: r.external_id != null ? String(r.external_id) : null,
    transaction_date: toDateString(r.transaction_date),
    description: String(r.description ?? ""),
    amount_gbp: dec(r.amount_gbp) ?? 0,
    balance_gbp: dec(r.balance_gbp),
    reference: r.reference != null ? String(r.reference) : null,
    payment_id: r.payment_id != null ? String(r.payment_id) : null,
    reconciliation_status: String(r.reconciliation_status ?? "unmatched"),
    matched_at: r.matched_at != null ? String(r.matched_at) : null,
    matched_by: r.matched_by != null ? String(r.matched_by) : null,
    import_batch_id: r.import_batch_id != null ? String(r.import_batch_id) : null,
    raw_data: r.raw_data as Record<string, unknown> | null,
    notes: r.notes != null ? String(r.notes) : null,
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
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
    const rows = await kdb
      .insertInto("bank_transactions")
      .values({
        external_id: params.external_id || undefined,
        transaction_date: sql`${params.transaction_date}::date`,
        description: params.description,
        amount_gbp: String(params.amount_gbp),
        balance_gbp: params.balance_gbp != null ? String(params.balance_gbp) : undefined,
        reference: params.reference || undefined,
        import_batch_id: params.import_batch_id || undefined,
        raw_data: params.raw_data ? JSON.stringify(params.raw_data) : undefined,
        notes: params.notes || undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .returningAll()
      .execute();
    return toRow(rows[0] as unknown as Record<string, unknown>);
  },

  async findUnmatched(): Promise<BankTransactionRow[]> {
    const rows = await kdb
      .selectFrom("bank_transactions")
      .selectAll()
      .where("reconciliation_status", "=", "unmatched")
      .orderBy("transaction_date", "desc")
      .execute();
    return rows.map((r) => toRow(r as unknown as Record<string, unknown>));
  },

  async matchPayment(id: string, paymentId: string, matchedBy: string): Promise<BankTransactionRow | null> {
    const rows = await kdb
      .updateTable("bank_transactions")
      .set({
        payment_id: parseInt(paymentId, 10),
        reconciliation_status: "matched",
        matched_at: sql`NOW()`,
        matched_by: parseInt(matchedBy, 10),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .where("id", "=", id)
      .returningAll()
      .execute();
    return rows.length > 0 ? toRow(rows[0] as unknown as Record<string, unknown>) : null;
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
    const rows = await kdb
      .selectFrom("bank_transactions")
      .selectAll()
      .where("import_batch_id", "=", batchId)
      .orderBy("transaction_date", "asc")
      .execute();
    return rows.map((r) => toRow(r as unknown as Record<string, unknown>));
  },
};
