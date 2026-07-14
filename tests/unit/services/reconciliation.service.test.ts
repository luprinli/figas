/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

let kdbMock: Record<string, unknown> = {};

vi.mock("~/utils/db.server", () => ({ get kdb() { return kdbMock; } }));
vi.mock("~/utils/db.server.kysely", () => ({ get kdb() { return kdbMock; } }));
vi.mock("~/utils/repositories/bank-transaction", () => ({
  bankTransactionRepository: {
    findUnmatched: vi.fn(),
    matchPayment: vi.fn(),
    importBatch: vi.fn(),
  },
}));

import { bankTransactionRepository } from "~/utils/repositories/bank-transaction";
import {
  getUnmatchedTransactions,
  matchTransaction,
  autoMatchTransactions,
  flagDiscrepancy,
  importBankStatement,
  getReconciliationReport,
} from "~/utils/services/reconciliation.service";

const CHAIN_METHODS = ["select", "selectFrom", "updateTable", "set", "where", "returningAll", "execute", "insertInto", "values", "orderBy", "limit"] as const;

function buildChain(finalResult: unknown) {
  const proxy: Record<string, unknown> = {};
  for (const m of CHAIN_METHODS) proxy[m] = vi.fn(() => proxy);
  proxy["execute"] = vi.fn(() => finalResult);
  return proxy;
}

beforeEach(() => {
  vi.clearAllMocks();
  kdbMock = buildChain([]);
});

// ---------------------------------------------------------------------------
// getUnmatchedTransactions
// ---------------------------------------------------------------------------
describe("getUnmatchedTransactions()", () => {
  it("returns empty result when repo returns empty", async () => {
    vi.mocked(bankTransactionRepository.findUnmatched).mockResolvedValue([]);
    const result = await getUnmatchedTransactions();
    expect(result.success).toBe(true);
  });

  it("filters by date range when provided", async () => {
    vi.mocked(bankTransactionRepository.findUnmatched).mockResolvedValue([
      { id: "1", transaction_date: "2026-06-15", amount_gbp: 100, reference: null } as any,
      { id: "2", transaction_date: "2026-07-01", amount_gbp: 200, reference: null } as any,
      { id: "3", transaction_date: "2026-08-01", amount_gbp: 300, reference: null } as any,
    ]);
    const result = await getUnmatchedTransactions({ dateFrom: "2026-07-01", dateTo: "2026-07-31" });
    expect(result.success).toBe(true);
    // Should only have the July transaction
    const txns = (result.transaction as unknown) as Record<string, unknown>[];
    expect(txns).toHaveLength(1);
    expect(txns[0].id).toBe("2");
  });

  it("handles repo errors gracefully", async () => {
    vi.mocked(bankTransactionRepository.findUnmatched).mockRejectedValue(new Error("Repo failure"));
    const result = await getUnmatchedTransactions();
    expect(result.success).toBe(false);
    expect(result.error).toBe("Repo failure");
  });
});

// ---------------------------------------------------------------------------
// matchTransaction
// ---------------------------------------------------------------------------
describe("matchTransaction()", () => {
  it("matches transaction and updates payment on success", async () => {
    vi.mocked(bankTransactionRepository.matchPayment).mockResolvedValue({ id: "btx-1" } as any);
    const chain = buildChain([]);
    kdbMock = chain;
    const result = await matchTransaction({
      bankTransactionId: "btx-1", paymentId: "100", userId: "42",
    });
    expect(result.success).toBe(true);
  });

  it("returns error when bank transaction not found", async () => {
    vi.mocked(bankTransactionRepository.matchPayment).mockResolvedValue(null);
    const result = await matchTransaction({
      bankTransactionId: "btx-999", paymentId: "100", userId: "42",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Bank transaction not found");
  });

  it("handles repo errors", async () => {
    vi.mocked(bankTransactionRepository.matchPayment).mockRejectedValue(new Error("Match failed"));
    const result = await matchTransaction({
      bankTransactionId: "btx-1", paymentId: "100", userId: "42",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Match failed");
  });
});

// ---------------------------------------------------------------------------
// autoMatchTransactions
// ---------------------------------------------------------------------------
describe("autoMatchTransactions()", () => {
  it("returns zero matches when no unmatched transactions exist", async () => {
    vi.mocked(bankTransactionRepository.findUnmatched).mockResolvedValue([]);
    kdbMock = buildChain([]);
    const result = await autoMatchTransactions();
    expect(result.success).toBe(true);
    expect(result.matched).toBe(0);
    expect(result.unmatched).toBe(0);
  });

  it("matches transactions with exact amount + reference", async () => {
    vi.mocked(bankTransactionRepository.findUnmatched).mockResolvedValue([
      { id: "btx-1", amount_gbp: 150.00, reference: "BK-100", transaction_date: "2026-07-01" } as any,
    ]);
    vi.mocked(bankTransactionRepository.matchPayment).mockResolvedValue({ id: "btx-1" } as any);
    kdbMock = buildChain([
      { id: 100, amount_gbp: "150.00" },
    ]);
    const result = await autoMatchTransactions();
    expect(result.success).toBe(true);
    expect(result.matched).toBe(1);
  });

  it("handles errors gracefully", async () => {
    vi.mocked(bankTransactionRepository.findUnmatched).mockRejectedValue(new Error("DB error"));
    const result = await autoMatchTransactions();
    expect(result.success).toBe(false);
    expect(result.error).toBe("DB error");
  });
});

// ---------------------------------------------------------------------------
// flagDiscrepancy
// ---------------------------------------------------------------------------
describe("flagDiscrepancy()", () => {
  it("flags a transaction as disputed", async () => {
    const chain = buildChain([{ id: "btx-1", reconciliation_status: "disputed", notes: "Amount mismatch" }]);
    kdbMock = chain;
    const result = await flagDiscrepancy({
      bankTransactionId: "btx-1", notes: "Amount mismatch", userId: "42",
    });
    expect(result.success).toBe(true);
  });

  it("handles DB errors", async () => {
    kdbMock = buildChain([]);
    (kdbMock.execute as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Update failed"));
    const result = await flagDiscrepancy({
      bankTransactionId: "btx-1", notes: "Test", userId: "42",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Update failed");
  });
});

// ---------------------------------------------------------------------------
// importBankStatement
// ---------------------------------------------------------------------------
describe("importBankStatement()", () => {
  it("imports a batch of transactions successfully", async () => {
    vi.mocked(bankTransactionRepository.importBatch).mockResolvedValue([
      { id: "btx-1" }, { id: "btx-2" },
    ] as any);
    const result = await importBankStatement({
      transactions: [
        { externalId: "EXT-1", transactionDate: "2026-07-13", description: "Payment 1", amountGbp: 100 },
        { externalId: "EXT-2", transactionDate: "2026-07-13", description: "Payment 2", amountGbp: 200 },
      ],
      userId: "42",
    });
    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
  });

  it("handles import errors", async () => {
    vi.mocked(bankTransactionRepository.importBatch).mockRejectedValue(new Error("Import failed"));
    const result = await importBankStatement({
      transactions: [{ externalId: "EXT-1", transactionDate: "2026-07-13", description: "Test", amountGbp: 100 }],
      userId: "42",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Import failed");
  });
});

// ---------------------------------------------------------------------------
// getReconciliationReport
// ---------------------------------------------------------------------------
describe("getReconciliationReport()", () => {
  it("returns aggregated bank and payment data", async () => {
    kdbMock = buildChain([
      { reconciliation_status: "matched", amount_gbp: "100.00" },
      { reconciliation_status: "matched", amount_gbp: "200.00" },
      { reconciliation_status: "unmatched", amount_gbp: "50.00" },
    ]);
    // When the chain is reused for payments query, the same execute is called
    const result = await getReconciliationReport({
      dateFrom: "2026-07-01", dateTo: "2026-07-31",
    });
    expect(result.success).toBe(true);
    const bankTxns = result.bankTransactions as unknown as Array<Record<string, unknown>>;
    expect(bankTxns).toHaveLength(2);
    const matched = bankTxns.find((t) => t.reconciliation_status === "matched") as Record<string, unknown>;
    expect(matched.count).toBe(2);
    expect(matched.total_amount).toBe(300);
  });

  it("handles DB errors", async () => {
    kdbMock = buildChain([]);
    (kdbMock.execute as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Query failed"));
    const result = await getReconciliationReport({
      dateFrom: "2026-07-01", dateTo: "2026-07-31",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Query failed");
  });
});
