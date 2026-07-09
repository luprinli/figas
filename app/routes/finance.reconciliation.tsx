import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, useNavigation , useRouteError, isRouteErrorResponse } from "@remix-run/react";

import { useState } from "react";
import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { requireUser } from "../utils/layout.server";
import {
  getUnmatchedTransactions,
  matchTransaction,
  autoMatchTransactions,
  flagDiscrepancy,
  importBankStatement,
} from "../utils/services/reconciliation.service";
import PageHeader from "../components/PageHeader";
import Button from "../components/Button";
import Card from "../components/Card";
import ReconciliationTable from "../components/ReconciliationTable";
import type { ReconciliationTransaction } from "../components/ReconciliationTable";
import EmptyState from "../components/EmptyState";

interface ReconciliationData {
  transactions: ReconciliationTransaction[];
  matchedCount: number;
  unmatchedCount: number;
  disputedCount: number;
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  await requirePermission(request, Permission.FINANCE_RECONCILE);

  const result = await getUnmatchedTransactions();

  const transactions: ReconciliationTransaction[] = [];
  let matchedCount = 0;
  let unmatchedCount = 0;
  let disputedCount = 0;

  if (result.success && result.transaction) {
    // result.transaction is the filtered array
    const txns = result.transaction as unknown as Array<{
      id: string;
      external_id: string | null;
      transaction_date: string;
      description: string;
      amount_gbp: number;
      reconciliation_status: string;
      matched_payment_id: string | null;
      matched_at: string | null;
    }>;

    for (const txn of txns) {
      transactions.push({
        id: txn.id,
        externalId: txn.external_id ?? txn.id,
        transactionDate: txn.transaction_date,
        description: txn.description,
        amountGbp: Number(txn.amount_gbp),
        reconciliationStatus: txn.reconciliation_status,
        matchedPaymentId: txn.matched_payment_id ?? undefined,
        matchedAt: txn.matched_at ?? undefined,
      });

      if (txn.reconciliation_status === "matched") matchedCount++;
      else if (txn.reconciliation_status === "unmatched") unmatchedCount++;
      else if (txn.reconciliation_status === "disputed") disputedCount++;
    }
  }

  return json<ReconciliationData>({
    transactions,
    matchedCount,
    unmatchedCount,
    disputedCount,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { userId } = await requireUser(request);
  await requirePermission(request, Permission.FINANCE_RECONCILE);

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  switch (intent) {
    case "match": {
      const transactionId = formData.get("transactionId") as string;
      const paymentId = formData.get("paymentId") as string;
      if (!transactionId || !paymentId) {
        return json({ error: "Missing transactionId or paymentId" }, { status: 400 });
      }
      const result = await matchTransaction({
        bankTransactionId: transactionId,
        paymentId,
        userId,
      });
      if (!result.success) {
        return json({ error: result.error ?? "Failed to match transaction" }, { status: 400 });
      }
      return redirect("/finance/reconciliation");
    }

    case "auto-match": {
      const result = await autoMatchTransactions();
      if (!result.success) {
        return json({ error: result.error ?? "Auto-match failed" }, { status: 400 });
      }
      return redirect("/finance/reconciliation");
    }

    case "flag": {
      const transactionId = formData.get("transactionId") as string;
      const notes = formData.get("notes") as string;
      if (!transactionId || !notes) {
        return json({ error: "Missing transactionId or notes" }, { status: 400 });
      }
      const result = await flagDiscrepancy({
        bankTransactionId: transactionId,
        notes,
        userId,
      });
      if (!result.success) {
        return json({ error: result.error ?? "Failed to flag discrepancy" }, { status: 400 });
      }
      return redirect("/finance/reconciliation");
    }

    case "import": {
      const csvData = formData.get("csvData") as string;
      if (!csvData) {
        return json({ error: "Missing CSV data" }, { status: 400 });
      }

      // Parse CSV data into transactions
      const lines = csvData.trim().split("\n");
      const transactions = lines.slice(1).map((line) => {
        const parts = line.split(",");
        return {
          externalId: parts[0]?.trim() ?? "",
          transactionDate: parts[1]?.trim() ?? "",
          description: parts[2]?.trim() ?? "",
          amountGbp: parseFloat(parts[3]?.trim() ?? "0"),
          balanceGbp: parts[4] ? parseFloat(parts[4].trim()) : undefined,
          reference: parts[5]?.trim() ?? undefined,
        };
      });

      const result = await importBankStatement({ transactions, userId });
      if (!result.success) {
        return json({ error: result.error ?? "Failed to import statement" }, { status: 400 });
      }
      return redirect("/finance/reconciliation");
    }

    default:
      return json({ error: "Unknown intent" }, { status: 400 });
  }
}

export default function Reconciliation() {
  const data = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const [showImportForm, setShowImportForm] = useState(false);
  const [matchDialog, setMatchDialog] = useState<{ transactionId: string } | null>(null);
  const [flagDialog, setFlagDialog] = useState<{ transactionId: string } | null>(null);
  const [matchPaymentId, setMatchPaymentId] = useState("");
  const [flagNotes, setFlagNotes] = useState("");

  const isAutoMatching = navigation.state === "submitting" && navigation.formData?.get("intent") === "auto-match";
  const isImporting = navigation.state === "submitting" && navigation.formData?.get("intent") === "import";

  const handleMatch = (transactionId: string) => {
    setMatchPaymentId("");
    setMatchDialog({ transactionId });
  };

  const handleFlag = (transactionId: string) => {
    setFlagNotes("");
    setFlagDialog({ transactionId });
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Bank Reconciliation"
        description="Match bank transactions with payments"
        actions={
          <div className="flex items-center gap-3">
            <Form method="post" style={{ display: "inline" }}>
              <input type="hidden" name="intent" value="auto-match" />
              <Button type="submit" loading={isAutoMatching}>
                Auto-Match
              </Button>
            </Form>
            <Button variant="outlined" onClick={() => setShowImportForm(true)}>
              Import Statement
            </Button>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-center">
            <p className="text-sm/5 font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Matched</p>
            <p className="mt-1 text-3xl/8 font-bold text-green-600">{data.matchedCount}</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm/5 font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Unmatched</p>
            <p className="mt-1 text-3xl/8 font-bold text-amber-600">{data.unmatchedCount}</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm/5 font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Disputed</p>
            <p className="mt-1 text-3xl/8 font-bold text-red-600">{data.disputedCount}</p>
          </div>
        </Card>
      </div>

      {/* Import Statement Form */}
      {showImportForm && (
        <Card title="Import Bank Statement">
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="import" />
            <div>
              <label htmlFor="csvData" className="block text-sm/5 font-medium text-slate-700 dark:text-slate-200 mb-1">
                CSV Data
              </label>
              <p className="text-xs/5 text-slate-500 dark:text-slate-400 mb-2">
                Paste CSV data with columns: External ID, Date, Description, Amount, Balance (optional), Reference (optional)
              </p>
              <textarea
                id="csvData"
                name="csvData"
                rows={8}
                required
                className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm/5 text-slate-900 dark:text-slate-100 shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                placeholder={`EXT-001,2024-01-15,Payment received,1500.00,1500.00,INV-001\nEXT-002,2024-01-16,Refund,-200.00,1300.00,`}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" loading={isImporting}>
                Import
              </Button>
              <Button variant="outlined" onClick={() => setShowImportForm(false)}>
                Cancel
              </Button>
            </div>
          </Form>
        </Card>
      )}

      {/* Reconciliation Table */}
      <Card title="Unmatched Transactions">
        {data.transactions.length > 0 ? (
          <ReconciliationTable
            transactions={data.transactions}
            onMatch={handleMatch}
            onFlag={handleFlag}
          />
        ) : (
          <EmptyState
            title="All transactions matched"
            description="There are no unmatched bank transactions to reconcile."
          />
        )}
      </Card>

      {/* Match Dialog */}
      {matchDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMatchDialog(null)} role="presentation" />
          <div className="relative w-full max-w-md rounded-lg bg-white dark:bg-slate-800 p-6 shadow-xl dark:shadow-slate-900/50 ring-1 ring-slate-200 dark:ring-slate-700">
            <h3 className="text-lg/6 font-semibold text-slate-900 dark:text-slate-100">Match Transaction</h3>
            <p className="mt-1 text-sm/5 text-slate-500 dark:text-slate-400 dark:text-slate-500">Enter the Payment ID to match this transaction with.</p>
            <Form method="post" className="mt-4 space-y-4">
              <input type="hidden" name="intent" value="match" />
              <input type="hidden" name="transactionId" value={matchDialog.transactionId} />
              <div>
                <label htmlFor="paymentId" className="block text-sm/5 font-medium text-slate-700 dark:text-slate-200 mb-1">
                  Payment ID
                </label>
                <input
                  id="paymentId"
                  name="paymentId"
                  type="text"
                  required
                  value={matchPaymentId}
                  onChange={(e) => setMatchPaymentId(e.target.value)}
                  className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm/5 text-slate-900 dark:text-slate-100 shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Enter payment ID..."
                />
              </div>
              <div className="flex items-center justify-end gap-3">
                <Button variant="outlined" onClick={() => setMatchDialog(null)}>
                  Cancel
                </Button>
                <Button type="submit" loading={navigation.state === "submitting"}>
                  Match
                </Button>
              </div>
            </Form>
          </div>
        </div>
      )}

      {/* Flag Dialog */}
      {flagDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setFlagDialog(null)} role="presentation" />
          <div className="relative w-full max-w-md rounded-lg bg-white dark:bg-slate-800 p-6 shadow-xl dark:shadow-slate-900/50 ring-1 ring-slate-200 dark:ring-slate-700">
            <h3 className="text-lg/6 font-semibold text-slate-900 dark:text-slate-100">Flag Discrepancy</h3>
            <p className="mt-1 text-sm/5 text-slate-500 dark:text-slate-400 dark:text-slate-500">Add notes explaining why this transaction is being flagged.</p>
            <Form method="post" className="mt-4 space-y-4">
              <input type="hidden" name="intent" value="flag" />
              <input type="hidden" name="transactionId" value={flagDialog.transactionId} />
              <div>
                <label htmlFor="notes" className="block text-sm/5 font-medium text-slate-700 dark:text-slate-200 mb-1">
                  Notes
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  required
                  rows={3}
                  value={flagNotes}
                  onChange={(e) => setFlagNotes(e.target.value)}
                  className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm/5 text-slate-900 dark:text-slate-100 shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Explain why this transaction is disputed..."
                />
              </div>
              <div className="flex items-center justify-end gap-3">
                <Button variant="outlined" onClick={() => setFlagDialog(null)}>
                  Cancel
                </Button>
                <Button type="submit" loading={navigation.state === "submitting"}>
                  Flag
                </Button>
              </div>
            </Form>
          </div>
        </div>
      )}
    </div>
  );
}



export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-700 dark:bg-slate-900">
        <div className="mx-auto max-w-lg text-center px-4">
          <div className="mb-4 text-5xl font-bold text-slate-300 dark:text-slate-500 dark:text-slate-600 dark:text-slate-300 dark:text-slate-500">{error.status}</div>
          <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Something went wrong</h1>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">{error.statusText}</p>
          <button onClick={() => window.location.reload()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Try Again</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-700 dark:bg-slate-900">
      <div className="mx-auto max-w-lg text-center px-4">
        <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Unexpected Error</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">An unexpected error occurred. Please try again.</p>
        <button onClick={() => window.location.reload()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Try Again</button>
      </div>
    </div>
  );
}