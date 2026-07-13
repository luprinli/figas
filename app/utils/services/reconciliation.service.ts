/* eslint-disable @typescript-eslint/no-explicit-any */
import { kdb } from "../db.server.kysely";
import { bankTransactionRepository } from "../repositories/bank-transaction";
import { ReconciliationStatus, PaymentStatus } from "../constants";

export interface GetUnmatchedTransactionsParams {
  dateFrom?: string;
  dateTo?: string;
}

export interface MatchTransactionParams {
  bankTransactionId: string;
  paymentId: string;
  userId: string;
  confidence?: number;
}

export interface AutoMatchTransactionsParams {
  dateFrom?: string;
  dateTo?: string;
}

export interface FlagDiscrepancyParams {
  bankTransactionId: string;
  notes: string;
  userId: string;
}

export interface ImportBankStatementParams {
  transactions: Array<{
    externalId: string;
    transactionDate: string;
    description: string;
    amountGbp: number;
    balanceGbp?: number;
    reference?: string;
  }>;
  userId: string;
}

export interface GetReconciliationReportParams {
  dateFrom: string;
  dateTo: string;
}

export interface ReconciliationResult {
  success: boolean;
  transaction?: Record<string, unknown>;
  error?: string;
}

export interface AutoMatchResult {
  success: boolean;
  matched?: number;
  unmatched?: number;
  error?: string;
}

export interface ImportBankStatementResult {
  success: boolean;
  batchId?: string;
  count?: number;
  error?: string;
}

export interface ReconciliationReportResult {
  success: boolean;
  bankTransactions?: Record<string, unknown>;
  payments?: Record<string, unknown>;
  error?: string;
}

/**
 * Get unmatched bank transactions, optionally filtered by date range.
 */
export async function getUnmatchedTransactions(
  params: GetUnmatchedTransactionsParams = {}
): Promise<ReconciliationResult> {
  try {
    const transactions = await bankTransactionRepository.findUnmatched();

    let filtered = transactions;

    if (params.dateFrom) {
      filtered = filtered.filter(
        (t) => t.transaction_date >= params.dateFrom!
      );
    }
    if (params.dateTo) {
      filtered = filtered.filter(
        (t) => t.transaction_date <= params.dateTo!
      );
    }

    return {
      success: true,
      transaction: filtered as unknown as Record<string, unknown>,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Manually match a bank transaction to a payment.
 */
export async function matchTransaction(
  params: MatchTransactionParams
): Promise<ReconciliationResult> {
  try {
    const updated = await bankTransactionRepository.matchPayment(
      params.bankTransactionId,
      params.paymentId,
      params.userId
    );

    if (!updated) {
      return { success: false, error: "Bank transaction not found" };
    }

    // Update payment record with reconciliation info
    await kdb.updateTable("payments").set({
      reconciled_at: new Date(),
      reconciled_by: Number(params.userId),
    } as any).where("id", "=", Number(params.paymentId)).execute();

    return {
      success: true,
      transaction: updated as unknown as Record<string, unknown>,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Attempt to auto-match unmatched bank transactions with payments.
 */
export async function autoMatchTransactions(
  params: AutoMatchTransactionsParams = {}
): Promise<AutoMatchResult> {
  try {
    const unmatchedTransactions =
      await bankTransactionRepository.findUnmatched();

    // Fetch payments with status 'paid' in the date range
    let paymentsQuery = kdb.selectFrom("payments")
      .select(["id", "amount_gbp"])
      .where("status", "=", PaymentStatus.PAID);
    if (params.dateFrom) {
      paymentsQuery = paymentsQuery.where("created_at", ">=", new Date(params.dateFrom) as any);
    }
    if (params.dateTo) {
      paymentsQuery = paymentsQuery.where("created_at", "<=", new Date(params.dateTo + "T23:59:59.999Z") as any);
    }
    const payments = await paymentsQuery.execute();

    let matchedCount = 0;

    for (const txn of unmatchedTransactions) {
      for (const payment of payments) {
        const exactAmountMatch =
          Math.abs(Number(txn.amount_gbp) - Number(payment.amount_gbp)) < 0.01;
        const referenceMatch =
          (txn.reference &&
            txn.reference.includes(String(payment.id))) ||
          false;

        // High-confidence match: exact amount + reference match
        if (exactAmountMatch && referenceMatch) {
          await bankTransactionRepository.matchPayment(
            txn.id,
            String(payment.id),
            "system"
          );

          await kdb.updateTable("payments").set({
            reconciled_at: new Date(),
          } as any).where("id", "=", payment.id).execute();

          matchedCount++;
          break;
        }
      }
    }

    const unmatchedCount = unmatchedTransactions.length - matchedCount;

    return {
      success: true,
      matched: matchedCount,
      unmatched: unmatchedCount,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Flag a bank transaction as disputed with notes.
 */
export async function flagDiscrepancy(
  params: FlagDiscrepancyParams
): Promise<ReconciliationResult> {
  try {
    const updated = (await kdb.updateTable("bank_transactions").set({
      reconciliation_status: ReconciliationStatus.DISPUTED,
      notes: params.notes,
    } as any).where("id", "=", params.bankTransactionId).returningAll().execute())[0] ?? null;

    return {
      success: true,
      transaction: updated as unknown as Record<string, unknown>,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Import a batch of bank statement transactions.
 */
export async function importBankStatement(
  params: ImportBankStatementParams
): Promise<ImportBankStatementResult> {
  try {
    const batchId = crypto.randomUUID();

    const transactions = params.transactions.map((t) => ({
      external_id: t.externalId,
      transaction_date: t.transactionDate,
      description: t.description,
      amount_gbp: t.amountGbp,
      balance_gbp: t.balanceGbp,
      reference: t.reference,
      import_batch_id: batchId,
    }));

    const results = await bankTransactionRepository.importBatch(transactions);

    return {
      success: true,
      batchId,
      count: results.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Get a reconciliation report comparing bank transactions and payments.
 */
export async function getReconciliationReport(
  params: GetReconciliationReportParams
): Promise<ReconciliationReportResult> {
  try {
    // Fetch bank transactions in the date range and aggregate in-memory
    const bankTxns = await kdb.selectFrom("bank_transactions")
      .select(["reconciliation_status", "amount_gbp"])
      .where("transaction_date", ">=", new Date(params.dateFrom) as any)
      .where("transaction_date", "<=", new Date(params.dateTo) as any)
      .execute();

    // Group and aggregate bank transactions by reconciliation_status
    const bankTxnMap = new Map<string, { count: number; total_amount: number }>();
    for (const txn of bankTxns) {
      const key = txn.reconciliation_status;
      const existing = bankTxnMap.get(key) ?? { count: 0, total_amount: 0 };
      existing.count++;
      existing.total_amount += Number(txn.amount_gbp);
      bankTxnMap.set(key, existing);
    }

    const bankTxnAggregated = Array.from(bankTxnMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([reconciliation_status, data]) => ({
        reconciliation_status,
        count: data.count,
        total_amount: data.total_amount,
      }));

    // Fetch payments in the date range and aggregate in-memory
    const payments = await kdb.selectFrom("payments")
      .select(["status", "amount_gbp"])
      .where("created_at", ">=", new Date(params.dateFrom) as any)
      .where("created_at", "<=", new Date(params.dateTo + "T23:59:59.999Z") as any)
      .execute();

    // Group and aggregate payments by status
    const paymentMap = new Map<string, { count: number; total_amount: number }>();
    for (const payment of payments) {
      const key = payment.status;
      const existing = paymentMap.get(key) ?? { count: 0, total_amount: 0 };
      existing.count++;
      existing.total_amount += Number(payment.amount_gbp);
      paymentMap.set(key, existing);
    }

    const paymentAggregated = Array.from(paymentMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([status, data]) => ({
        status,
        count: data.count,
        total_amount: data.total_amount,
      }));

    return {
      success: true,
      bankTransactions: bankTxnAggregated as unknown as Record<string, unknown>,
      payments: paymentAggregated as unknown as Record<string, unknown>,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}
